'use strict';

'require podman.rpc as podmanRPC';
'require podman.view as podmanView';

/**
 * Manage podman pods
 */
return podmanView.list.extend({
	title: _('Pods'),
	titleSingle: _('Pod'),
	sectionName: 'pods',

	async load() {
		return podmanRPC.pods.list();
	},

	render: function(pods) {
		return E('div', _('Work in progress...'));
	},
});
