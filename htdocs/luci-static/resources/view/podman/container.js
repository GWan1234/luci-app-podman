'use strict';

'require ui';
'require dom';

'require podman.ui as podmanUI';
'require podman.view as podmanView';
'require podman.model.Container as Container';
'require podman.form.resource as PodmanFormResource';

'require view.podman.container-tab.info as ContainerInfoTab';
'require view.podman.container-tab.stats as ContainerStatsTab';
'require view.podman.container-tab.processes as ContainerProcessesTab';
'require view.podman.container-tab.logs as ContainerLogsTab';

/**
 * Container detail view with tabbed interface
 */
return podmanView.base.extend({
	container: null,
	data: null,

	async load() {
		// Extract container ID from URL path
		// URL format: /cgi-bin/luci/admin/podman/container/<id>
		const path = L.location();
		const matches = path.match(/container\/([a-f0-9]+)/i);

		if (!matches || !matches[1]) {
			this.redirectToList();
			return;
		}

		const containerId = matches[1];
		const container = Container.getSingleton({ Id: containerId });

		const inspectData = await container.inspect();
		this.data = inspectData;
		return Container.getSingleton(inspectData);
	},

	async render(container) {
		if (!container) {
			this.redirectToList();
			return;
		}

		this.container = container;

		const tabs = new podmanUI.Tabs('info');
		tabs
			.addTab('info', _('Info'))
			.addTab('resources', _('Resources'))
			.addTab('stats', _('Stats'))
			.addTab('ps', _('Processes'))
			.addTab('logs', _('Logs'))
			// .addTab('health', _('Health'))
			.addTab('inspect', _('Inspect'))
			// .addTab('console', _('Console'))
		;

		requestAnimationFrame(() => {
			this.renderInfoTab();
			this.renderResourcesTab();
			this.renderStatsTab();
			this.renderProcessesTab();
			this.renderLogsTab();
			this.renderInspectTab();
		});

		window.addEventListener('pagehide', () => this.stopStreams(), { once: true });

		return E('div', {}, [ this.createHeader(), tabs.render() ]);
	},

	stopStreams() {
		this.getTabInstance('stats')?.onTabInactive();
		this.getTabInstance('ps')?.onTabInactive();
		this.getTabInstance('logs')?.onTabInactive();
	},

	redirectToList() {
		this.stopStreams();
		window.location.href = L.url('admin/podman/containers');
	},

	getTabInstance(name) {
		const tabNode = document.querySelector(`.tab-pane[data-tab="${name}"]`);
		return tabNode ? dom.findClassInstance(tabNode) : null;
	},

	createHeader() {
		const state = this.container.getState();

		return E('div', { class: 'mb-sm container-toolbar' }, [
			E('div', { class: 'd-flex align-start' }, [
				E('h2', { class: 'mb-sm' }, [ this.container.getName() ]),
				new podmanUI.ButtonNew('&#128281;', {
					click: () => this.redirectToList(),
					type: 'none',
				}).render(),
			]),
			E('div', { class: 'd-flex align-center' }, [
				new podmanUI.ButtonNew('&#9658;', {
					click: ui.createHandlerFn(this, 'handleStart'),
					type: state === 'running' ? 'active' : '',
				}).render(),
				new podmanUI.ButtonNew('&#9724;', {
					click: ui.createHandlerFn(this, 'handleStop'),
					type: state === 'exited' || state === 'created' ? 'active' : '',
				}).render(),
				new podmanUI.ButtonNew('&#8635;', {
					click: ui.createHandlerFn(this, 'handleRestart'),
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
		const content = await ContainerInfoTab.render(this.container);
		this.renderTab('info', content);
	},

	async renderResourcesTab() {
		const resourceForm = await new PodmanFormResource.init().render(this.container);
		this.renderTab('resources', resourceForm, _('Configure resource limits for this container.'));
	},

	async renderStatsTab() {
		const content = await ContainerStatsTab.render(this.container);
		this.renderTab('stats', content);
	},

	async renderProcessesTab() {
		const content = await ContainerProcessesTab.render(this.container);
		this.renderTab('ps', content);
	},

	async renderLogsTab() {
		const content = await ContainerLogsTab.render(this.container);
		this.renderTab('logs', content);
	},

	renderInspectTab() {
		this.renderTab('inspect', new podmanUI.JsonArea(this.data).render());
	},

	async handleStart() {
		if (this.container.getState() === 'running') {
			return;
		}

		this.loading(_('Start container'));
		this.container.start().then(() => window.location.reload());
	},

	async handleStop() {
		if (this.container.getState() === 'exited' || this.container.getState() === 'created') {
			return;
		}

		this.loading(_('Stop container'));
		this.stopStreams();
		this.container.stop().then(() => window.location.reload());
	},

	async handleRestart() {
		this.loading(_('Restart container'));
		this.container.restart().then(() => window.location.reload());
	},

	async handleRemove() {
		this.confirm([
			E('p', {}, _('Are you sure to remove container?')),
		], async () => {
			this.loading(_('Remove container'));
			this.container.remove().then(() => this.redirectToList());
		});

	},
});
