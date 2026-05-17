// Copyright 2026 Christopher Söllinger
// Licensed to the public under the Apache License 2.0.
//
// Shared parameter validators for the rpcd plugin, the LuCI streaming
// controller and the podman-api CLI helper.
//
// Convention: every exported validator returns an error message **string**
// on failure and `null` on success, so call sites can chain with || :
//
//     let err = require_param('name', v) || validate_name(v);
//     if (err) return { error: err };

'use strict';

const VALID_RESTART_POLICIES = { 'no': true, 'always': true, 'on-failure': true, 'unless-stopped': true };

const CONTAINER_BODY_KEYS = {
	CpuPeriod: true, CpuQuota: true, CpuShares: true,
	Memory: true, MemorySwap: true, MemoryReservation: true,
	BlkioWeight: true, BlkioWeightDevice: true,
	HealthConfig: true, NoHealthcheck: true
};

/** @param {string} id */
export function validate_id(id) {
	if (!id || type(id) !== 'string' || !match(id, /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/))
		return 'Invalid id format';
};

/** @param {string} name */
export function validate_name(name) {
	if (!name || type(name) !== 'string' || !match(name, /^[a-zA-Z0-9_.-]+$/))
		return 'Invalid name format';
};

/** @param {string} ref */
export function validate_image_ref(ref) {
	if (!ref || type(ref) !== 'string' || !match(ref, /^[a-zA-Z0-9_.:\/@-]+$/))
		return 'Invalid image reference';
};

/** @param {string} query */
export function validate_query_params(query) {
	if (!query || type(query) !== 'string' || !match(query, /^[a-zA-Z0-9=&_.,-]+$/))
		return 'Invalid query parameters';
};

/** @param {string} policy */
export function validate_restart_policy(policy) {
	if (policy && !(policy in VALID_RESTART_POLICIES))
		return 'Invalid restart policy';
};

/**
 * @param {string} name
 * @param {any} value
 */
export function require_param(name, value) {
	if (value == null || value === ''
		|| (type(value) === 'object' && length(keys(value)) === 0))
		return `Missing required parameter: ${name}`;
};

export const RESTART_POLICIES = VALID_RESTART_POLICIES;
export const BODY_KEYS = CONTAINER_BODY_KEYS;
