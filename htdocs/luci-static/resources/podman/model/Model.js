'use strict';

'require baseclass';
'require rpc';
'require ui';

'require podman.ui as podmanUI';

function checkResponse(response) {
	if (response?.response >= 400) {
		throw new Error(response.message);
	}
	return response;
}

function catchError(err) {
	const msg = err?.message || String(err);
	const code = err?.code || 0;
	if (msg.includes('Access denied') || msg.includes('session is expired')) {
		window.location.href = L.url('admin');
		return;
	}
	ui.hideModal();
	document.body.scrollTop = 0;
	document.documentElement.scrollTop = 0;
	podmanUI.alert(`${code}: ${msg}`, 'error');
	throw err;
}

function processLines(buffer, onChunk) {
	const lines = buffer.split('\n');
	buffer = lines.pop() || '';
	for (const line of lines) {
		if (line.trim()) {
			try {
				onChunk(JSON.parse(line));
			} catch (e) {
				onChunk({ raw: line });
			}
		}
	}
	return buffer;
}

const Model = baseclass.extend({
	__name: 'Podman.Model',

	_stream(getUrl, onData, onDone) {
		let stopped = false;
		let currentController = null;

		const doStream = async () => {
			while (!stopped) {
				currentController = new AbortController();
				try {
					const response = await fetch(getUrl(), { signal: currentController.signal });
					if (response.status === 403) {
						window.location.reload();
						return;
					}
					const reader = response.body?.getReader();
					const decoder = new TextDecoder();
					let buffer = '';

					while (!stopped) {
						const { done, value } = await reader.read();
						if (done) {
							// Flush any trailing line the server sent without a final '\n'
							if (buffer.trim() && !stopped) {
								try { onData(JSON.parse(buffer)); } catch(e) { onData({ raw: buffer }); }
							}
							break;
						}
						buffer += decoder.decode(value, { stream: true });
						buffer = processLines(buffer, onData);
					}

					if (!stopped) onDone?.();
				} catch (err) {
					if (stopped) break; // AbortController fired from stop()
					// network error — reconnect immediately
				}
			}
		};

		doStream();

		return {
			stop: () => {
				stopped = true;
				if (currentController) currentController.abort();
			}
		};
	},
});

return baseclass.extend({
	base: Model,
	declareRPC(options) {
		const fn = rpc.declare(options);
		return (...args) => fn(...args).then(checkResponse).catch(catchError);
	},
	// Like declareRPC but does not show the global error dialog on failure.
	// Use for background checks where the caller handles the error itself.
	declareRPCSilent(options) {
		const fn = rpc.declare(options);
		return (...args) => fn(...args).then(checkResponse);
	},
});
