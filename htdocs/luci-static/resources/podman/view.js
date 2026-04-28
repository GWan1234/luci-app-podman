'use strict';

'require baseclass';
'require view';
'require form';
'require dom';
'require ui';

'require podman.ui as podmanUI';

const ViewDefault = {
	scrollToTop() {
		document.body.scrollTop = 0;
		document.documentElement.scrollTop = 0;
	},

	loading(text) {
		this.scrollToTop();
		podmanUI.showSpinningModal(null, text || _('Loading...'));
	},

	confirm(content, onConfirm) {
		const modal = new podmanUI.Modal(_('Confirm'), content, [ 'confirm-modal' ]);
		modal.getCloseButton = () => new podmanUI.ButtonNew(_('Cancel'), {
			click: () => ui.hideModal(),
			type: 'negative',
		}).render();
		modal.handleSubmit = onConfirm;
		modal.render();
	},

	error(message) {
		this.scrollToTop();
		ui.hideModal();
		podmanUI.alert(message, 'error');
	},

	warning(message) {
		this.scrollToTop();
		ui.hideModal();
		podmanUI.alert(message, 'warning', true);
	},

	success(message) {
		this.scrollToTop();
		ui.hideModal();
		podmanUI.alert(message, 'success', true);
	},
};

const ViewBase = view.extend({
	...ViewDefault,
	__name__: 'PodmanView.Base',

	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	__init__() {
		document.querySelector('head').appendChild(E('link', {
			rel: 'stylesheet',
			type: 'text/css',
			href: L.resource('view/podman/podman.css'),
		}));

		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') ui.hideModal();
		});

		this.super('__init__', []);
	},
});

const ViewList = ViewBase.extend({
	__name__: 'Podman.View.List',

	map: null,
	section: null,
	title: '',
	sectionName: '',
	sectionHeadline: '',
	TableSelectSection: null,

	async render(data) {
		const listData = {};
		listData[this.sectionName] = data;

		await this.initSection(listData);
		await this.updateSection();

		return this.transformMap(await this.map.render());
	},

	transformMap(map) {
		return map;
	},

	initTableSelectSection(data) {
		this.map = new form.JSONMap(data, this.title);

		this.section = this.map.section(
			this.TableSelectSection,
			this.sectionName,
			'',
			this.sectionHeadline || _('Manage podman %s').format(this.title.toLowerCase())
		);
		this.section.view = this;
		this.section.anonymous = true;
		this.section.footer = true;

		return this.section;
	},

	async initSection(data) {
		if (!this.TableSelectSection) {
			// Require on-the-fly to avoid circular dependency
			const mod = await L.require('podman.TableSelectSection');
			this.TableSelectSection = mod.TableSelectSection;
		}
		return this.initTableSelectSection(data);
	},

	getSection() {
		return this.section;
	},
});

/**
 * Form View
 */
const ViewForm = baseclass.extend({
	...ViewDefault,
	__name__: 'Podman.View.Form',

	map: null,
	section: null,

	__init__() {

	},

	makeData() {
		return {};
	},

	async render() {
		const data = this.makeData();
		const sectionName = Object.keys(data)[0];
		this.map = new form.JSONMap(data, '', '');
		this.section = this.map.section(form.TypedSection, sectionName, '');
		this.section.anonymous = true;

		await this.createForm();

		return this.map.render();
	},

	createForm() {},

	getField(name) {
		return this.section?.getOption(name);
	},

	getFields() {
		return this.section?.getOption() || {};
	},

	getFieldValue(name) {
		return this.getField(name)?.formvalue(this.section?.sectiontype);
	},

	getFieldValues() {
		const values = {};
		const fields = this.getFields();

		Object.keys(fields).forEach((name) => {
			values[name] = fields[name].formvalue(this.section?.sectiontype);
		});

		return values;
	},

	isValid() {
		const fields = this.getFields();
		const sectionId = this.section.sectiontype;

		for (const [_key, field] of Object.entries(fields)) {
			if (field.isValid(sectionId) === false) {
				return false;
			}
		}

		return true;
	},

	scrollToInvalid() {
		const invalidElement = this.map.root.querySelector('.cbi-input-invalid');
		invalidElement.scrollIntoView();
	},

	async save() {
		try {
			await this.map.save(() => {}, true);
		} catch (error) {
			return false;
		}

		return true;
	},

	async handleCreate(createFn, title, textLoading, textSuccess) {
		ui.hideModal();

		const loadingText = textLoading || _('Creating %s').format(title);
		const successText = textSuccess || _('%s created successfully').format(title);

		this.loading(loadingText);

		await createFn();
		ui.hideModal();
		if (successText !== false) {
			this.success(successText);
		}
	},
});

const ViewTabContent = baseclass.extend({
	...ViewDefault,
	__name__: 'PodmanView.TabContent',
	tab: null,
	active: false,

	__init__(tab) {
		this.tab = tab || this.tab;
		this.super('__init__', []);

		if (!this.tab) {
			return;
		}

		let attempts = 0;
		new Promise((resolve, reject) => {
			const check = () => {
				if (attempts++ > 100) { reject(); return; }
				const element = document.querySelector(`[data-tab="${this.tab}"]`);
				if (element) resolve(element);
				else setTimeout(check, 100);
			};
			check();
		}).then(() => {
			const mainNode = document.querySelector(`.tab-pane[data-tab="${this.tab}"]`);

			dom.bindClassInstance(mainNode, this);

			const mutationObserver = new MutationObserver((mutationsList) => {
				let handled = false;
				mutationsList.forEach((mutation) => {
					const setActive = mutation.target.dataset.tabActive === 'true';

					if (handled || mutation.attributeName !== 'data-tab-active') return;
					handled = true;

					if (this.active === setActive) {
						return;
					}

					if (setActive) {
						this.active = true;
						this.onTabActive();
						return;
					}

					this.active = false;
					this.onTabInactive();
				});
			});

			mutationObserver.observe(mainNode, { attributes: true });
		}).catch(() => {});
	},

	async onTabActive() { },

	async onTabInactive() { },

	renderTabContent(headline, content) {
		return E('div', {}, [
			E('h4', {}, headline),
			...(content || []),
		]);
	},

	warningContent(message) {
		return E('div', { class: 'alert-message d-flex justify-center p-sm' }, message);
	},
});

return baseclass.extend({
	base: ViewBase,
	list: ViewList,
	form: ViewForm,
	tabContent: ViewTabContent,
});
