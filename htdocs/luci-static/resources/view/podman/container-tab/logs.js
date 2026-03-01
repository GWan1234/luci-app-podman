'use strict';

'require podman.ui as podmanUI';
'require podman.view as podmanView';

const TIMESTAMP_RE_GLOBAL = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\s*/g;
const ANSI_REGEX = /\x1B\[[0-9;]*[A-Za-z]/g;
const MAX_LOG_LINES = 1000;

return podmanView.tabContent.extend({
	tab: 'logs',
	container: null,

	async render(container) {
		this.container = container;

		this.logViewer = E('pre', { id: 'log-viewer', class: 'terminal-area' }, []);

		return this.renderTabContent('', [
			this.renderLogToolbar(),
			this.logViewer,
		]);
	},

	async onTabActive() {
		// Running: auto-start live stream. Stopped: load historical logs on demand via play button.
		if (this.container.isRunning()) {
			this.startStream();
		}
	},

	async onTabInactive() {
		this.stopStream();
	},

	async startStream() {
		if (!this.container || this.logsStream) {
			return;
		}

		this.logLinesInput.disabled = true;
		this.logSinceInput.disabled = true;
		this.logUntilInput.disabled = true;
		this.playButton.querySelector('.cbi-button').classList.add('cbi-button-active');
		this.stopButton.querySelector('.cbi-button').classList.remove('cbi-button-active');

		this.logViewer.textContent = '';

		const toUnixSince = (val) => val ? new Date(val + 'T00:00:00').getTime() / 1000 : null;
		const toUnixUntil = (val) => val ? new Date(val + 'T23:59:59').getTime() / 1000 : null;

		this.logsStream = this.container.streamLogs((data) => {
			if (!data || !data.raw) return;

			const line = data.raw
				.replace(TIMESTAMP_RE_GLOBAL, '')
				.replace(ANSI_REGEX, '')
				.trim();

			if (!line) return;

			this.logViewer.textContent += line + '\n';
			this.trimLogOutput();
			this.logViewer.scrollTop = this.logViewer.scrollHeight;
		}, {
			tail:   this.logLinesInput.value || 100,
			since:  toUnixSince(this.logSinceInput.value),
			until:  toUnixUntil(this.logUntilInput.value),
			follow: this.container.isRunning(),
		});
	},

	async stopStream() {
		if (!this.logsStream) return;

		this.logLinesInput.disabled = false;
		this.logSinceInput.disabled = false;
		this.logUntilInput.disabled = false;
		this.playButton.querySelector('.cbi-button').classList.remove('cbi-button-active');
		this.stopButton.querySelector('.cbi-button').classList.add('cbi-button-active');

		this.logsStream.stop();
		this.logsStream = null;
	},

	renderLogToolbar() {
		// Fields start disabled only for running containers (stream auto-starts and locks them).
		// For stopped containers they start enabled so the user can set filters before fetching.
		const initialDisabled = this.container.isRunning();
		const linesField = new podmanUI.Numberfield(100, { id: 'log-lines', min: '10', max: '250', disabled: initialDisabled }).render();
		const sinceField = new podmanUI.Datefield(null, { id: 'log-since', disabled: initialDisabled }).render();
		const untilField = new podmanUI.Datefield(null, { id: 'log-until', disabled: initialDisabled }).render();

		this.logLinesInput = linesField.querySelector('input');
		this.logSinceInput = sinceField.querySelector('input');
		this.logUntilInput = untilField.querySelector('input');

		this.stopButton = new podmanUI.ButtonNew('&#9724;', {
			click: () => this.stopStream(),
			type: ' stop-button',
			tooltip: _('Stop stream'),
		}).render();

		this.playButton = new podmanUI.ButtonNew('&#9658;', {
			click: () => this.startStream(),
			type: 'active play-button',
			tooltip: _('Start stream'),
		}).render();

		return E('div', { class: 'd-flex align-center mb-sm' }, [
			E('label', { class: 'mr-xs' }, _('Number of lines')),
			linesField,
			'',
			E('label', { class: 'ml-xs mr-xs' }, _('Since')),
			sinceField,

			E('label', { class: 'ml-xs mr-xs' }, _('Until')),
			untilField,

			E('div', { class: 'ml-xs' }, ''),

			new podmanUI.ButtonNew('🗑️', {
				click: () => this.logViewer.textContent = '',
				tooltip: _('Clear logs'),
			}).render(),
			this.stopButton,
			this.playButton,
		]);
	},

	trimLogOutput() {
		const lines = this.logViewer.textContent.split('\n');
		if (lines.length > MAX_LOG_LINES) {
			this.logViewer.textContent = lines.slice(lines.length - MAX_LOG_LINES).join('\n');
		}
	},
});
