'use strict';

'require ui';

'require podman.rpc as podmanRPC';
'require podman.ui as podmanUI';
'require podman.model.Container as Container';

return podmanUI.Modal.extend({
	title: _('Auto Update'),
	containers: [],
	buttons: [],

	getContent() {
		if (!this.containers || this.containers.length === 0) {
			this.buttons = [ this.getCloseButton() ];
			return [
				E('p', {}, _('No containers with auto-update label found.')),
				E('p', { class: 'mt-sm' },
					_('To enable auto-update for a container, add the label: io.containers.autoupdate=registry')
				),
			];
		}

		this.buttons = [
			this.getCloseButton(),
			new podmanUI.ButtonNew(_('Check'), {
				click: ui.createHandlerFn(this, 'handleCheckUpdate'),
				type: 'positive',
			}).render()
		];

		return [
			E('p', {}, _('Check %d containers for updates?').format(this.containers.length))
		];
	},

	setContainers(containers) {
		this.containers = containers ?? [];
		return this;
	},

	getButtons() {
		return this.buttons;
	},

	getCloseButton() {
		return new podmanUI.ButtonNew(_('Close'), {
			click: () => ui.hideModal(),
			type: 'remove',
		}).render();
	},

	async handleCheckUpdate() {
		const containersWithUpdates = [];
		const checkErrors = [];

		for (const [index, container] of this.containers.entries()) {
			podmanUI.showSpinningModal(null, _('Check for updates: %s/%s').format(index + 1, this.containers.length));

			const updateState = await container.checkImageUpdate();
			if (updateState.hasUpdate) {
				containersWithUpdates.push(container);
			} else if (updateState.error) {
				checkErrors.push({ name: container.getName(), error: updateState.error });
			}
		}

		if (containersWithUpdates.length === 0) {
			const content = [ E('p', {}, _('No new updates available.')) ];
			if (checkErrors.length > 0) {
				content.push(E('p', { class: 'mt-sm' }, _('%d check(s) failed:').format(checkErrors.length)));
				checkErrors.forEach((e) => content.push(E('p', { class: 'text-error' }, `${e.name}: ${e.error}`)));
			}
			const modal = new podmanUI.Modal(_('Check Complete'), content);
			modal.getButtons = () => [ this.getCloseButton() ];
			modal.render();
			return;
		}

		const updateContent = [
			E('p', {}, _('Select containers to update')),
		];

		const checkboxes = {};
		containersWithUpdates.forEach((container) => {
			const skipReason = container.getUpdateSkipReason();
			const checkbox = new ui.Checkbox(0);
			const checkboxNode = checkbox.render();
			const checkboxInputNode = checkboxNode.querySelector('input[type="checkbox"]');
			const checkboxId = checkboxInputNode.id;

			if (skipReason) {
				checkboxInputNode.disabled = true;
			} else {
				checkboxes[container.getID()] = { container, checkbox };
			}

			const inner = skipReason
				? new podmanUI.Tooltip(checkboxNode, skipReason).render()
				: checkboxNode;

			updateContent.push(E('div', { class: 'd-flex align-center checkbox-with-label mb-xs' }, [
				inner,
				E('label', { for: checkboxId }, container.getName()),
			]));
		});

		const modal = new podmanUI.Modal(_('Apply Updates'), updateContent);
		modal.getButtons = () => [
			this.getCloseButton(),
			new podmanUI.ButtonNew(_('Update'), {
				click: async () => {
					const selectedUpdates = Object.values(checkboxes)
						.filter(({ checkbox }) => checkbox.isChecked())
						.map(({ container }) => container);

					if (selectedUpdates.length === 0) {
						return;
					}

					await this.handleUpdate(selectedUpdates);
				},
				type: 'positive',
			}).render()
		];
		modal.render();
	},

	async handleUpdate(containers) {
		const failures = [];
		const oldImages = [];

		for (const [index, container] of containers.entries()) {
			podmanUI.showSpinningModal(null, _('Update image and re-create container: %s/%s').format(index + 1, containers.length));

			try {
				const inspected = Container.getSingleton(await container.inspect());
				const result = await inspected.updateImage();
				if (result?.oldImage) {
					oldImages.push({ image: result.oldImage, name: container.getName() });
				}
			} catch (err) {
				failures.push({
					name: container.getName(),
					error: err.message || String(err)
				});
			}
		}

		const imageWarnings = [];
		if (oldImages.length > 0) {
			podmanUI.showSpinningModal(null, _('Cleaning up old images...'));

			const allContainers = await podmanRPC.containers.list('all=true').catch(() => []);

			// Normalize IDs for comparison (ImageID may have 'sha256:' prefix, getID() does not)
			const normalize = id => (id || '').replace(/^sha256:/, '').toLowerCase();
			const usedIds = new Set(allContainers.map(c => normalize(c.ImageID)));

			// Deduplicate by image ID (multiple containers may share the same old image)
			const seen = new Set();
			for (const { image, name } of oldImages) {
				const id = normalize(image.getID());
				if (seen.has(id)) continue;
				seen.add(id);

				if (usedIds.has(id)) {
					imageWarnings.push(_('Old image %s could not be removed - still in use by another container').format(name));
				} else {
					await image.remove();
				}
			}
		}

		ui.hideModal();

		if (failures.length === 0 && imageWarnings.length === 0) {
			podmanUI.alert(_('Containers updated successfully'), 'success', true);
			return;
		}

		const lines = [];
		if (failures.length > 0) {
			const succeeded = containers.length - failures.length;
			lines.push(E('p', {}, _('%d updated, %d failed:').format(succeeded, failures.length)));
			failures.forEach(f => lines.push(E('p', {}, `${f.name}: ${f.error}`)));
		} else {
			lines.push(E('p', {}, _('Containers updated successfully.')));
		}
		imageWarnings.forEach(w => lines.push(E('p', { class: 'mt-sm' }, w)));

		podmanUI.alert(lines, failures.length > 0 ? 'warning' : 'info');
	}
});
