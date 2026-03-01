'use strict';

import * as socket from 'socket';
import { open, unlink } from 'fs';
import { urlencode, ENCODE_FULL } from 'lucihttp';

const PODMAN_SOCKET = '/run/podman/podman.sock';
const API_BASE = '/v5.0.0/libpod';
const BLOCKSIZE = 4096;

const reference = ARGV[0];
const logfile   = ARGV[1];
const pidfile   = ARGV[2];

function write_error(msg) {
	let f = open(logfile, 'a');
	if (f) {
		f.write('{"error":"' + replace(replace(msg, /\\/g, '\\\\'), /"/g, '\\"') + '"}\n');
		f.flush();
		f.close();
	}
}

function cleanup(code) {
	unlink(pidfile);
	exit(code ?? 0);
}

if (!reference || !logfile || !pidfile)
	exit(1);

// Write own PID to pidfile so the streaming endpoint can check if we are running
let ps = open('/proc/self/stat', 'r');
if (ps) {
	let pid = +(split(ps.read(200) || '0', ' ')[0]);
	ps.close();
	let pf = open(pidfile, 'w');
	if (pf) { pf.write(pid + '\n'); pf.close(); }
}

// Connect to Podman socket
let sock = socket.connect(PODMAN_SOCKET);
if (!sock) {
	write_error('Cannot connect to Podman socket');
	cleanup(1);
}

let encoded = urlencode(reference, ENCODE_FULL);

sock.send(sprintf(
	'POST %s/images/pull?reference=%s&quiet=false HTTP/1.0\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n',
	API_BASE, encoded
));

// Read HTTP response headers (blocking recv — no uloop needed in standalone process)
let buf = '';
let lf  = null;

while (true) {
	let chunk = sock.recv(BLOCKSIZE);
	if (chunk === null) continue;
	if (!length(chunk)) {
		write_error('Podman closed connection before responding');
		sock.close();
		cleanup(1);
	}
	buf += chunk;
	let sep = index(buf, '\r\n\r\n');
	if (sep < 0) continue;

	let m    = match(buf, /^HTTP\/[0-9.]+ ([0-9]+)/);
	let code = m ? +m[1] : 502;
	let body = substr(buf, sep + 4);
	buf = '';

	if (code !== 200) {
		let parsed = null;
		try { parsed = json(body); } catch(e) {}
		let msg = (parsed?.message) || (parsed?.cause)
		       || replace(body, /\s+$/, '')
		       || sprintf('Podman error %d', code);
		write_error(msg);
		sock.close();
		cleanup(1);
	}

	lf = open(logfile, 'a');
	if (!lf) { sock.close(); cleanup(1); }

	// Write any body bytes that arrived together with headers
	if (length(body)) { lf.write(body); lf.flush(); }
	break;
}

// Stream response body to logfile — Podman sends NDJSON, we write it as-is
while (true) {
	let chunk = sock.recv(BLOCKSIZE);
	if (chunk === null) continue;
	if (!length(chunk)) break; // EOF — Podman finished
	lf.write(chunk);
	lf.flush();
}

lf.close();
sock.close();
cleanup(0);
