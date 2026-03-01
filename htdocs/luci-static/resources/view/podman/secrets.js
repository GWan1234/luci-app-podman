'use strict';

'require form';

'require podman.rpc as podmanRPC';
'require podman.form as podmanForm';
'require podman.view as podmanView';
'require podman.form.secret as PodmanFormSecret';

/**
 * Manage podman secrets
 */
return podmanView.list.extend({
	sectionName: 'secrets',

	title: _('Secrets'),
	titleSingle: _('Secret'),

	/**
	 * Load secret data
	 */
	async load() {
		return podmanRPC.secrets.list();
	},

	/**
	 * Update list section
	 */
	async updateSection() {
		this.section.selectKey = 'ID';
		this.section.createForm = PodmanFormSecret;

		let o;

		o = this.section.option(podmanForm.field.LinkDummyValue, 'Name', _('Name'));
		o.cfgdatavalue = (secret) => secret.getName();
		o.click = (_value, secret) => this.section.handleInspect(secret, ['SecretData']);

		o = this.section.option(podmanForm.field.DummyValue, 'Driver', _('Driver'));
		o.cfgdatavalue = (secret) => secret.getDriver();
		o.width = '10%';

		o = this.section.option(podmanForm.field.DateDummyValue, 'CreatedAt', _('Created'));
		o.width = '20%';
	},
});
