'use strict';
'require view';
'require form';
'require ui';
'require podman.rpc as podmanRPC';
'require podman.utils as utils';
'require podman.ui as podmanUI';
'require podman.form as podmanForm';
'require podman.list as List';

/**
 * @module view.podman.secrets
 * @description Secret management view using proper LuCI form components
 */
return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	map: null,
	listHelper: null,

	/**
	 * Load secret data on view initialization
	 * @returns {Promise<Object>} Secret data wrapped in object
	 */
	load: async () => {
		return podmanRPC.secret.list()
			.then((secrets) => {
				return { secrets: secrets || [] };
			})
			.catch((err) => {
				return { error: err.message || _('Failed to load secrets') };
			});
	},

	/**
	 * Render the secrets view using form components
	 * @param {Object} data - Data from load()
	 * @returns {Element} Secrets view element
	 */
	render: function(data) {
		// Handle errors from load()
		if (data && data.error) {
			return utils.renderError(data.error);
		}

		// Initialize list helper with full data object
		this.listHelper = new List.Util({
			itemName: 'secret',
			rpc: podmanRPC.secret,
			data: data,
			view: this
		});

		this.map = new form.JSONMap(this.listHelper.data, _('Secrets'));

		const section = this.map.section(form.TableSection, 'secrets', '', _('Manage Podman secrets'));
		section.anonymous = true;

		let o;

		// Checkbox column for selection
		o = section.option(podmanForm.field.SelectDummyValue, 'ID', new ui.Checkbox(0, { hiddenname: 'all' }).render());

		// Name column
		o = section.option(podmanForm.field.LinkDataDummyValue, 'Name', _('Name'));
        o.click = (secret) => {
			const name = secret.Spec && secret.Spec.Name ? secret.Spec.Name : (secret.Name || _('Unknown'));
			this.handleInspect(name);
		};
        o.text = (secret) => secret.Spec && secret.Spec.Name ? secret.Spec.Name : (secret.Name || _('Unknown'));

		// Driver column
		o = section.option(form.DummyValue, 'Driver', _('Driver'));
		o.cfgvalue = (sectionId) => {
			const secret = this.map.data.data[sectionId];
			return secret.Spec && secret.Spec.Driver && secret.Spec.Driver.Name ?
				secret.Spec.Driver.Name : _('file');
		};

		o = section.option(podmanForm.field.DataDummyValue, 'CreatedAt', _('Created'));
        o.cfgformatter = (cfg) => utils.formatDate(Date.parse(cfg) / 1000);

		// Create toolbar using helper
		const toolbar = this.listHelper.createToolbar({
			onDelete: () => this.handleDeleteSelected(),
			onRefresh: () => this.handleRefresh(),
			onCreate: () => this.handleCreateSecret()
		});

		return this.map.render().then((mapRendered) => {
			const viewContainer = E('div', { 'class': 'podman-view-container' });

			// Add toolbar outside map (persists during refresh)
			viewContainer.appendChild(toolbar.container);
			// Add map content
			viewContainer.appendChild(mapRendered);
			// Setup "select all" checkbox using helper
			this.listHelper.setupSelectAll(mapRendered);

			return viewContainer;
		});
	},

	/**
	 * Get selected secret names from checkboxes
	 * @returns {Array<string>} Array of secret names
	 */
	getSelectedSecrets: function() {
		return this.listHelper.getSelected((secret) => {
			return secret.Spec && secret.Spec.Name ? secret.Spec.Name : secret.Name;
		});
	},

	/**
	 * Delete selected secrets
	 */
	handleDeleteSelected: function() {
		this.listHelper.bulkDelete({
			selected: this.getSelectedSecrets(),
			deletePromiseFn: (name) => podmanRPC.secret.remove(name),
			onSuccess: () => this.handleRefresh(true)
		});
	},

	/**
	 * Refresh secret list
	 */
	handleRefresh: function(clearSelections) {
		clearSelections = clearSelections || false;
		this.listHelper.refreshTable(clearSelections)
	},

	/**
	 * Show create secret dialog
	 */
	handleCreateSecret: function() {
		const form = new podmanForm.Secret();
		form.submit = () => this.handleRefresh();
		form.render();
	},

	/**
	 * Show secret details
	 * @param {string} name - Secret name
	 */
	handleInspect: function(name) {
		this.listHelper.showInspect(name, ['SecretData']);
	}
});
