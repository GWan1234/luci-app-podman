'use strict';

'require baseclass';
'require form';
'require request';

'require podman.rpc as podmanRPC';
'require podman.view as podmanView';

/**
 * Import podman volume
 */
const PodmanFormVolumeImport = podmanView.form.extend({
	__name__: 'Podman.Form.VolumeImport',

	sectionName: 'volume',

	isCompressed: false,
	file: null,

	makeData() {
		return {
			volume: {
				name: null,
			}
		};
	},

	async render(file) {
		this.map.data.data = this.makeData();
		this.file = file;

		const isCompressed = file.name.endsWith('.tar.gz') || file.name.endsWith('.tgz');
		const volumeName = file.name.replace(/\.(tar\.gz|tgz|tar)$/, '');

		this.isCompressed = isCompressed;

		const field = this.section.option(form.Value, 'name', _('Volume Name'));
		field.placeholder = 'my-volume';
		field.rmempty = false;
		field.datatype = 'rangelength(1,253)';
		field.default = volumeName;

		return this.map.render();
	},

	async handleCreate() {
		await this.save();

		const name = this.getFieldValue('name');

		this.loading(_('Uploading file...'));

		try {
			const formData = new FormData();
			formData.append('sessionid', L.env.sessionid);
			formData.append('filename', '/tmp/podman-import');
			formData.append('filedata', this.file);

			const response = await request.post(L.env.cgi_base + '/cgi-upload', formData);
			if (!response.ok)
				throw new Error(_('Upload failed: %s').format(response.statusText));

			this.loading(_('Importing volume...'));

			await podmanRPC.volumes.import(name, this.isCompressed);
			this.success(_('Volume imported successfully'));
		} catch (err) {
			this.error(_('Error: %s').format(err.message));
		}
	},
});

return baseclass.extend({
	init: PodmanFormVolumeImport,
});
