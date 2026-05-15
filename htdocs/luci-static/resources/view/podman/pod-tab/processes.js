'use strict';

'require dom';

'require podman.ui as podmanUI';
'require podman.view as podmanView';

return podmanView.tabContent.extend({
	tab: 'ps',
	pod: null,

	render(pod) {
		this.pod = pod;

		if (!this.pod.isRunning()) {
			return this.warningContent(_('Pod is not running'));
		}

		this.tableContent = E('div', { class: 'ps-table-content' }, []);

		return this.renderTabContent('', [ this.tableContent ]);
	},

	onTabActive() {
		if (!this.pod || !this.pod.isRunning() || this.processStream) return;

		this.processStream = this.pod.streamTop((ps) => {
			this.updateProcessList(ps);
		});
	},

	onTabInactive() {
		if (!this.processStream) return;

		this.processStream.stop();
		this.processStream = null;
	},

	updateProcessList(ps) {
		if (!ps || !ps.Titles || !ps.Processes || ps.Titles.length === 0) {
			return;
		}

		const psTable = new podmanUI.Table();
		const columnWidth = `width: ${100 / ps.Titles.length}%;`;

		ps.Titles.forEach((title) => {
			psTable.addHeader(_(title), { style: columnWidth });
		});

		ps.Processes.forEach((process) => {
			psTable.addRow(process.map((detail) => ({ inner: detail })));
		});

		dom.content(this.tableContent, psTable.render());
	},
});
