'use strict';

'require ui';
'require dom';

'require podman.ui as podmanUI';
'require podman.view as podmanView';
'require podman.model.Pod as Pod';

'require view.podman.pod-tab.info as PodInfoTab';
'require view.podman.pod-tab.containers as PodContainersTab';
'require view.podman.pod-tab.stats as PodStatsTab';
'require view.podman.pod-tab.processes as PodProcessesTab';

return podmanView.base.extend({
	pod: null,
	data: null,

	async load() {
		const path = L.location();
		const matches = path.match(/pod\/([a-f0-9]+)/i);

		if (!matches || !matches[1]) {
			this.redirectToList();
			return;
		}

		const podId = matches[1];
		const pod = Pod.getSingleton({ Id: podId });

		const inspectData = await pod.inspect();
		this.data = inspectData;
		return Pod.getSingleton(inspectData);
	},

	async render(pod) {
		if (!pod) {
			this.redirectToList();
			return;
		}

		this.pod = pod;

		const tabs = new podmanUI.Tabs('info');
		tabs
			.addTab('info',    _('Info'))
			.addTab('containers',   _('Containers'))
			.addTab('stats',   _('Stats'))
			.addTab('ps',      _('Processes'))
			.addTab('inspect', _('Inspect'));

		requestAnimationFrame(() => {
			this.renderInfoTab();
			this.renderContainersTab();
			this.renderStatsTab();
			this.renderProcessesTab();
			this.renderInspectTab();
		});

		window.addEventListener('pagehide', () => this.stopStreams(), { once: true });

		return E('div', {}, [ this.createHeader(), tabs.render() ]);
	},

	stopStreams() {
		this.getTabInstance('stats')?.onTabInactive();
		this.getTabInstance('ps')?.onTabInactive();
	},

	redirectToList() {
		this.stopStreams();
		window.location.href = L.url('admin/podman/pods');
	},

	getTabInstance(name) {
		const tabNode = document.querySelector(`.tab-pane[data-tab="${name}"]`);
		return tabNode ? dom.findClassInstance(tabNode) : null;
	},

	createHeader() {
		const state = this.pod.getStatus();
		const stopActive = state === 'Stopped' || state === 'Exited' || state === 'Created' || state === 'Dead';

		return E('div', { class: 'mb-sm container-toolbar' }, [
			E('div', { class: 'd-flex align-start' }, [
				E('h2', { class: 'mb-sm' }, [ this.pod.getName() ]),
				new podmanUI.ButtonNew('&#128281;', {
					click: () => this.redirectToList(),
					type: 'none',
				}).render(),
			]),
			E('div', { class: 'd-flex align-center' }, [
				new podmanUI.ButtonNew('&#9658;', {
					click: ui.createHandlerFn(this, 'handleStart'),
					type: state === 'Running' ? 'active' : '',
				}).render(),
				new podmanUI.ButtonNew('&#9724;', {
					click: ui.createHandlerFn(this, 'handleStop'),
					type: stopActive ? 'active' : '',
				}).render(),
				new podmanUI.ButtonNew('&#8635;', {
					click: ui.createHandlerFn(this, 'handleRestart'),
				}).render(),
				new podmanUI.ButtonNew('&#10074;&#10074;', {
					click: ui.createHandlerFn(this, 'handlePause'),
					type: state === 'Paused' ? 'active' : '',
				}).render(),
				new podmanUI.ButtonNew(_('Delete'), {
					click: ui.createHandlerFn(this, 'handleRemove'),
					type: 'negative',
				}).render(),
			]),
		]);
	},

	renderTab(tab, content, description) {
		const tabContainer = document.querySelector(`.tab-pane[data-tab="${tab}"]`);
		const tabContainerNode = tabContainer?.querySelector('.cbi-section-node');

		if (!tabContainerNode) return;

		if (description) {
			tabContainer.insertBefore(E('div', {
				class: 'cbi-section-descr'
			}, description), tabContainer.firstChild);
		}

		dom.content(tabContainerNode, content);
	},

	async renderInfoTab() {
		const content = await PodInfoTab.render(this.pod);
		this.renderTab('info', content);
	},

	async renderContainersTab() {
		const content = await PodContainersTab.render(this.pod);
		this.renderTab('containers', content);
	},

	async renderStatsTab() {
		const content = await PodStatsTab.render(this.pod);
		this.renderTab('stats', content);
	},

	async renderProcessesTab() {
		const content = await PodProcessesTab.render(this.pod);
		this.renderTab('ps', content);
	},

	renderInspectTab() {
		this.renderTab('inspect', new podmanUI.JsonArea(this.data).render());
	},

	async handleStart() {
		if (this.pod.isRunning()) {
			return;
		}

		if (this.pod.isPaused()) {
			this.loading(_('Unpause pod'));
			this.pod.unpause().then(() => window.location.reload());
			return;
		}

		this.loading(_('Start pod'));
		this.pod.start().then(() => window.location.reload());
	},

	async handleStop() {
		if (!this.pod.isRunning() && !this.pod.isPaused()) {
			return;
		}

		this.loading(_('Stop pod'));
		this.stopStreams();
		this.pod.stop().then(() => window.location.reload());
	},

	async handleRestart() {
		this.loading(_('Restart pod'));
		this.stopStreams();
		this.pod.restart().then(() => window.location.reload());
	},

	async handlePause() {
		if (!this.pod.isRunning()) {
			return;
		}

		this.loading(_('Pause pod'));
		this.stopStreams();
		this.pod.pause().then(() => window.location.reload());
	},

	async handleRemove() {
		this.confirm([
			E('p', {}, _('Are you sure to remove pod?')),
		], async () => {
			this.loading(_('Remove pod'));
			this.pod.remove().then(() => this.redirectToList());
		});
	},
});
