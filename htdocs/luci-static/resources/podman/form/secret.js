'use strict';

'require baseclass';
'require form';

'require podman.rpc as podmanRPC';
'require podman.view as podmanView';

/**
 * Create podman secret
 */
const PodmanFormSecret = podmanView.form.extend({
	__name__: 'Podman.Form.Secret',
	sectionName: 'secret',

	makeData() {
		return {
			secret: {
				name: null,
				data: null,
			}
		};
	},

	createForm() {
		let field;

		field = this.section.option(form.Value, 'name', _('Secret Name'));
		field.placeholder = 'my-secret';
		field.rmempty = false;
		field.datatype = 'rangelength(1,253)';
		field.validate = (_section_id, value) => {
			if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
				return _(
					'Secret name can only contain letters, numbers, underscores, and hyphens'
				);
			}
			return true;
		};
		field.description = _(
			'1-253 characters: letters, numbers, underscore (_), hyphen (-) only');

		field = this.section.option(form.TextValue, 'data', _('Secret Data'));
		field.placeholder = _('Enter secret data (password, token, key, etc.)');
		field.rmempty = false;
		field.rows = 6;
		field.datatype = 'minlength(1)';
		field.description = _('The sensitive data to store securely');
	},

	async handleCreate() {
		await this.save();

		const data = this.getFieldValues();

		if (!data.name || !data.data) {
			return;
		}

		const createFn = () => podmanRPC.secrets.create(data.name, data.data);

		return this.super('handleCreate', [ createFn, _('Secret') ]);
	},
});

return baseclass.extend({
	init: PodmanFormSecret
});
