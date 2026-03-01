import { stdout, open, stat, unlink } from 'fs';
import * as socket from 'socket';
import * as uloop from 'uloop';
import * as struct from 'struct';
import { cursor } from 'uci';
import { connect as ubus_connect } from 'ubus';

const PODMAN_SOCKET = '/run/podman/podman.sock';
const API_BASE = '/v5.0.0/libpod';
const BLOCKSIZE = 4096;

function validate_id(id) {
	return id && match(id, /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/);
}

function error_response(code, message) {
	if (http.eoh) return;
	http.status(code, message);
	http.header('Content-Type', 'text/plain');
	http.write(message + '\n');
}

function get_timeouts() {
	let c = cursor();
	let script = c.get('uhttpd', 'main', 'script_timeout');
	let network = c.get('uhttpd', 'main', 'network_timeout');
	return {
		script: script ? +script : 60,
		network: network ? +network : 30,
	};
}

function session_timer(sid) {
	let uci = cursor();
	let script_timeout = +(uci.get('uhttpd', 'main', 'script_timeout') ?? 60);
	let sessiontime    = +(uci.get('luci', 'sauth', 'sessiontime')    ?? 3600);
	let timeout_ms     = (script_timeout - 5) * 1000;

	if (!sid)
		return { timeout_ms, is_final: false, on_expire: () => uloop.end() };

	let uconn = ubus_connect();
	let now   = time();

	let sdat      = uconn.call('session', 'get', { ubus_rpc_session: sid });
	let deadline  = +(sdat?.values?.podman_stream_deadline  ?? 0);
	let last_seen = +(sdat?.values?.podman_stream_last_seen ?? 0);

	// Fresh start if: no deadline yet, OR the stream was interrupted long enough
	// that the gap exceeds script_timeout (normal reconnects fire every
	// timeout_ms = script_timeout-5s, so their gap is always below this threshold).
	let is_fresh = !deadline || (now - last_seen > script_timeout);

	if (is_fresh)
		deadline = now + sessiontime;

	// Always persist deadline + last_seen so future calls can measure the gap.
	uconn.call('session', 'set', {
		ubus_rpc_session: sid,
		values: { podman_stream_deadline: deadline, podman_stream_last_seen: now }
	});

	let remaining_ms = (deadline - now) * 1000;

	if (remaining_ms <= 0) {
		uconn.call('session', 'destroy', { ubus_rpc_session: sid });
		return null;
	}

	let is_final = remaining_ms <= timeout_ms;
	let fire_ms  = is_final ? remaining_ms : timeout_ms;

	return {
		timeout_ms: fire_ms,
		is_final,
		on_expire: () => {
			if (is_final)
				uconn.call('session', 'destroy', { ubus_rpc_session: sid });
			uloop.end();
		}
	};
}

function stream_podman(api_path, on_data, early_headers, timer) {
	let sock = socket.connect(PODMAN_SOCKET);
	if (!sock) {
		error_response(502, 'Cannot connect to Podman socket');
		return;
	}

	sock.send(sprintf('GET %s HTTP/1.0\r\nHost: localhost\r\n\r\n', api_path));

	let t = get_timeouts();
	// ka_ms: one keepalive write just before network_timeout would kill the connection.
	// This gives the browser a clean done:true close every ~50s (with defaults),
	// enabling session-expiry detection (403 on reconnect) without self-rearming timers.
	let ka_ms = (t.network - 5) * 1000;

	uloop.init();

	// For logs (early_headers=true): send our response headers to the browser
	// immediately, before Podman responds. Podman deliberately holds its own
	// headers until it has data (follow=true), which would leave the browser's
	// fetch() pending for up to 50s. Starting our response now lets the browser
	// start reading the stream right away; log data arrives as Podman sends it.
	// For stats: Podman always responds instantly, so we wait for it first.
	let response_started = early_headers;
	if (early_headers) {
		http.status(200, 'OK');
		http.header('Content-Type', 'text/plain');
		http.write_headers();
		http.write('\n');
	}

	let buf = '';
	let podman_headers_done = false;

	let handle = uloop.handle(sock, () => {
		let chunk = sock.recv(BLOCKSIZE);
		if (chunk === null) return; // EAGAIN — keep waiting

		if (!podman_headers_done) {
			// Phase 1: consuming Podman's HTTP response headers
			if (!length(chunk)) {
				// EOF before Podman sent headers
				if (!response_started)
					error_response(502, 'Podman closed connection');
				uloop.end();
				return;
			}
			buf += chunk;
			let sep = index(buf, '\r\n\r\n');
			if (sep < 0) return; // headers not complete yet

			let m = match(buf, /^HTTP\/[0-9.]+ ([0-9]+)/);
			let code = m ? +m[1] : 502;
			if (code != 200) {
				if (!response_started)
					error_response(code, substr(buf, sep + 4) || sprintf('Podman error %d', code));
				uloop.end();
				return;
			}

			let body_start = substr(buf, sep + 4);
			buf = '';
			podman_headers_done = true;

			if (!response_started) {
				// Stats: start our response now that Podman confirmed 200
				http.status(200, 'OK');
				http.header('Content-Type', 'application/x-ndjson');
				http.write_headers();
				http.write('\n');
				response_started = true;
			}

			if (body_start && length(body_start)) {
				if (!on_data(body_start)) { uloop.end(); return; }
			}
		} else {
			// Phase 2: streaming data
			if (!length(chunk)) { uloop.end(); return; } // Podman closed stream
			if (!on_data(chunk)) uloop.end();
		}
	}, uloop.ULOOP_READ);

	// Single keepalive write at ka_ms resets uhttpd's idle timer and unblocks
	// reader.read() in the browser, ensuring a clean done:true on final close.
	// For logs (early_headers): cap the stream at ka_ms*2 so our close always
	// beats uhttpd's network_timeout (keepalive at ka_ms + network_timeout = 55s,
	// we fire at 50s — 5s margin). Stats sends data every few seconds so no cap needed.
	if (early_headers)
		uloop.timer(ka_ms, () => http.write('\n'));

	let effective_timeout = early_headers ? min(timer.timeout_ms, ka_ms * 2) : timer.timeout_ms;
	uloop.timer(effective_timeout, timer.on_expire);

	uloop.run();

	handle.delete();
	sock.close();

	if (!response_started)
		error_response(504, 'Podman did not respond');
}

return {
	container_logs: (id) => {
		if (!validate_id(id)) { error_response(400, 'Invalid container ID'); return; }

		let timer = session_timer(ctx?.authsession);
		if (!timer) { error_response(403, 'Session expired'); return; }

		let tail   = http.formvalue('tail') || '100';
		let since  = http.formvalue('since');
		let until  = http.formvalue('until');
		let follow = http.formvalue('follow') !== 'false';

		if (tail !== 'all' && !match(tail, /^[0-9]+$/)) {
			error_response(400, 'Invalid tail parameter');
			return;
		}

		if (since && !match(since, /^[0-9]+(\.[0-9]+)?$/)) {
			error_response(400, 'Invalid since parameter');
			return;
		}

		if (until && !match(until, /^[0-9]+(\.[0-9]+)?$/)) {
			error_response(400, 'Invalid until parameter');
			return;
		}

		let api_path = sprintf(
			'%s/containers/%s/logs?follow=%s&stdout=true&stderr=true&timestamps=false',
			API_BASE, id, follow ? 'true' : 'false'
		);
		if (tail)  api_path += sprintf('&tail=%s', tail);
		if (since) api_path += sprintf('&since=%s', since);
		if (until) api_path += sprintf('&until=%s', until);

		let framebuf = '';

		stream_podman(api_path, (chunk) => {
			framebuf += chunk;
			while (length(framebuf) >= 8) {
				let hdr = struct.unpack('!BxxxI', substr(framebuf, 0, 8));
				if (!hdr) break;
				let stream_type = hdr[0];
				let payload_len = hdr[1];
				if (length(framebuf) < 8 + payload_len) break; // wait for more data
				let payload = substr(framebuf, 8, payload_len);
				framebuf = substr(framebuf, 8 + payload_len);
				// Emit stdout (1) and stderr (2); skip others
				if (stream_type >= 1 && stream_type <= 2) {
					if (!stdout.write(payload)) return false; // client disconnected
					stdout.flush();
				}
			}
			return true;
		}, true, timer);
	},

	container_top: (id) => {
		if (!validate_id(id)) { error_response(400, 'Invalid container ID'); return; }

		let timer = session_timer(ctx?.authsession);
		if (!timer) { error_response(403, 'Session expired'); return; }

		let delay = http.formvalue('delay') || '5';
		if (!match(delay, /^[0-9]+$/) || +delay < 2) {
			error_response(400, 'Invalid delay parameter');
			return;
		}

		let ps_args = http.formvalue('ps_args');
		if (ps_args && !match(ps_args, /^[-a-zA-Z0-9_, ]+$/)) {
			error_response(400, 'Invalid ps_args parameter');
			return;
		}

		let api_path = sprintf('%s/containers/%s/top?stream=true&delay=%s',
			API_BASE, id, delay);
		if (ps_args)
			api_path += sprintf('&ps_args=%s', ps_args);

		stream_podman(api_path, (chunk) => {
			let ok = stdout.write(chunk);
			stdout.flush();
			return ok;
		}, false, timer);
	},

	container_stats: (id) => {
		if (!validate_id(id)) { error_response(400, 'Invalid container ID'); return; }

		let timer = session_timer(ctx?.authsession);
		if (!timer) { error_response(403, 'Session expired'); return; }

		let interval = http.formvalue('interval') || '3';
		let api_path = sprintf('%s/containers/stats?containers=%s&stream=true&interval=%s',
			API_BASE, id, interval);

		stream_podman(api_path, (chunk) => {
			let ok = stdout.write(chunk);
			stdout.flush();
			return ok;
		}, false, timer);
	},

	image_pull: () => {
		let timer = session_timer(ctx?.authsession);
		if (!timer) { error_response(403, 'Session expired'); return; }

		let reference = http.formvalue('reference');
		if (!reference || !match(reference, /^[a-zA-Z0-9._/:@-]+$/)) {
			error_response(400, 'Invalid or missing reference parameter');
			return;
		}
		// A valid registry reference must contain at least one separator (/, : or @).
		// Bare hex strings are local image IDs — they cannot be pulled from a registry
		// and would cause a 10-minute worker timeout loop. Reject them early.
		if (!match(reference, /[/:@]/)) {
			error_response(400, 'Reference must be a registry reference (e.g. name:tag), not a raw image ID');
			return;
		}

		let sid     = ctx?.authsession;
		let ref_id  = replace(reference, /[/:@]/g, '-');
		let logfile = '/tmp/podman-pull-' + ref_id + '.ndjson';
		let pidfile = '/tmp/podman-pull-' + ref_id + '.pid';

		// Check if a worker is already running for this reference
		let pid = 0;
		let pf  = open(pidfile, 'r');
		if (pf) { pid = +(trim(pf.read(200) || '0')); pf.close(); }
		let is_running = pid > 0 && stat('/proc/' + pid);

		// Read (and reuse) the ubus connection for session offset
		let uconn_rw = sid ? ubus_connect() : null;
		let offset   = 0;
		if (uconn_rw) {
			let sdat = uconn_rw.call('session', 'get', { ubus_rpc_session: sid });
			offset   = +(sdat?.values?.['pull_' + ref_id] || 0);
		}

		// Check if the existing logfile has bytes we haven't sent yet
		// (worker may have just finished between two reconnects)
		let lstat      = stat(logfile);
		let has_unread = lstat && offset < lstat.size;

		// If the worker has exited and the logfile ends with a completion marker
		// ("images" or "error"), the previous pull finished.  Any new request for the same
		// reference must start a fresh pull — resuming the old logfile would deliver the
		// old image ID again.  (The logfile is NOT deleted when the client aborts the fetch
		// after receiving chunk.images, so it survives between pull sessions.)
		let is_completed_pull = false;
		if (!is_running && lstat && lstat.size > 0) {
			let f = open(logfile, 'r');
			if (f) {
				let tail_start = lstat.size > 512 ? lstat.size - 512 : 0;
				if (tail_start > 0) f.seek(tail_start);
				let tail = f.read(512);
				f.close();
				is_completed_pull = !!(tail && (index(tail, '"images"') >= 0 || index(tail, '"error"') >= 0));
			}
		}

		// Fresh start: worker not running AND (previous pull completed, OR no unread
		// progress from a prior session, OR stale offset=0 logfile from a closed tab).
		let is_fresh_start = !is_running && (is_completed_pull || !(has_unread && offset > 0));

		if (is_fresh_start) {
			// Clean up any stale files and reset offset
			unlink(logfile);
			unlink(pidfile);
			offset = 0;
			if (uconn_rw) {
				let vals = {};
				vals['pull_' + ref_id] = 0;
				uconn_rw.call('session', 'set', { ubus_rpc_session: sid, values: vals });
			}
			// Safety: single quotes are used as shell delimiters below.
			// The regex on line 295 already rejects them; this is a belt-and-suspenders guard.
			if (index(reference, "'") >= 0 || index(logfile, "'") >= 0 || index(pidfile, "'") >= 0) {
				error_response(400, 'Invalid characters in reference');
				return;
			}
			system(sprintf(
				"timeout 600 /usr/bin/ucode /usr/share/podman/pull-worker.uc '%s' '%s' '%s' </dev/null >/dev/null 2>/dev/null &",
				reference, logfile, pidfile
			));
		}

		http.status(200, 'OK');
		http.header('Content-Type', 'text/plain');
		http.write_headers();
		http.write('\n');

		let t          = get_timeouts();
		let ka_ms      = (t.network - 5) * 1000;
		let last_saved = offset;

		uloop.init();

		let poll_fn;
		poll_fn = () => {
			// Read and forward any new bytes written to the logfile
			let f = open(logfile, 'r');
			if (f) {
				if (offset > 0) f.seek(offset);
				let chunk = f.read(8192);
				f.close();
				if (chunk && length(chunk)) {
					if (!stdout.write(chunk)) { uloop.end(); return; }
					stdout.flush();
					offset += length(chunk);
					// Persist offset to session (rate-limited)
					if (uconn_rw && offset - last_saved >= 1024) {
						let vals = {};
						vals['pull_' + ref_id] = offset;
						uconn_rw.call('session', 'set', { ubus_rpc_session: sid, values: vals });
						last_saved = offset;
					}
				}
			}

			// If worker has finished and we've consumed all bytes: close cleanly
			let cpid = 0;
			let cpf  = open(pidfile, 'r');
			if (cpf) { cpid = +(trim(cpf.read(200) || '0')); cpf.close(); }
			if (!cpid || !stat('/proc/' + cpid)) {
				let sf = stat(logfile);
				if (!sf || offset >= sf.size) {
					unlink(logfile);
					uloop.end();
					return;
				}
			}

			uloop.timer(200, poll_fn);
		};
		uloop.timer(0, poll_fn);

		// Self-rearming keepalive — prevents network_timeout during slow layer downloads
		let ka;
		ka = () => { http.write('\n'); uloop.timer(ka_ms, ka); };
		uloop.timer(ka_ms, ka);

		// Session expiry timer — same pattern as other streams
		uloop.timer(timer.timeout_ms, timer.on_expire);

		uloop.run();

		// Persist final offset before this script exits (next reconnect will resume here)
		if (uconn_rw && offset !== last_saved) {
			let vals = {};
			vals['pull_' + ref_id] = offset;
			uconn_rw.call('session', 'set', { ubus_rpc_session: sid, values: vals });
		}
	},
};
