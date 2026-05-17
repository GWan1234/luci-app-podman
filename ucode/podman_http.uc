// Copyright 2026 Christopher Söllinger
// Licensed to the public under the Apache License 2.0.
//
// Small helpers for the wire-format HTTP/1.0 conversation the rpcd plugin,
// the LuCI streaming controller and the pull-worker all have with the
// Podman API socket. None of them need a full HTTP client — just request
// construction and a couple of header parsers.

'use strict';

/**
 * Build a wire-format HTTP/1.0 request string ready for sock.send().
 * Sets Host: localhost; adds Content-Type/Content-Length when body is set.
 *
 * @param {string} method    GET / POST / PUT / DELETE
 * @param {string} path      Request-URI including any query string
 * @param {?string} body     JSON body (or null/empty for GET-style requests)
 * @returns {string}         The complete request bytes
 */
export function build_request(method, path, body) {
	let req = sprintf('%s %s HTTP/1.0\r\nHost: localhost\r\n', method, path);
	if (body != null && body !== '') {
		let s = `${body}`;
		req += sprintf('Content-Type: application/json\r\nContent-Length: %d\r\n', length(s));
		req += '\r\n';
		req += s;
		return req;
	}
	return req + '\r\n';
};

/**
 * Extract HTTP status code from the start of a response buffer.
 *
 * @param {string} buf       Buffer that begins with the status line
 * @returns {number}         Status code, or 0 if the line doesn't match
 */
export function parse_status(buf) {
	let m = match(buf, /^HTTP\/[0-9.]+ ([0-9]+)/);
	return m ? +m[1] : 0;
};

/**
 * Extract a Content-Length value from a response header buffer.
 *
 * @param {string} buf       Header buffer (status line + headers)
 * @returns {number}         Bytes declared by Content-Length, or -1 if absent
 */
export function parse_content_length(buf) {
	let m = match(buf, /[Cc]ontent-[Ll]ength:\s*([0-9]+)/);
	return m ? +m[1] : -1;
};
