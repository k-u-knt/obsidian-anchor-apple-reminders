import { Notice, Platform, Plugin, PluginSettingTab } from 'obsidian';
import { getJumpApi } from './jump';
import { addSelectionReminder, renderSettings } from './reminder';
import { migrateReminderSettings, ReminderSettings } from './settings';

export default class AnchorAppleReminders extends Plugin {
	settings!: ReminderSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'add-selection',
			name: 'Add selection to Apple Reminders',
			icon: 'alarm-clock-plus',
			checkCallback: (checking: boolean) => {
				// EventKit needs osascript, so this is macOS desktop only
				if (!(Platform.isMacOS && Platform.isDesktopApp)) return false;
				const api = getJumpApi((this.app as any).plugins);
				if (!api) {
					if (!checking) new Notice('Anchor Apple Reminders needs the Anchor Jump plugin. Install and enable it, then try again.');
					return true;
				}
				// the selection, or the current line when nothing is selected in the editor
				const sel = api.currentSelection();
				if (!sel) return false;
				if (!checking) addSelectionReminder(this.app, api, sel, this.settings);
				return true;
			},
		});

		this.addSettingTab(new RemindersSettingTab(this));
	}

	private async loadSettings() {
		const own = await this.loadData();
		let old: unknown = null;
		if (!own || Object.keys(own).length === 0) {
			try {
				const path = `${this.app.vault.configDir}/plugins/anchor-actions/data.json`;
				old = JSON.parse(await this.app.vault.adapter.read(path));
			} catch { /* no Anchor Actions data to take over */ }
		}
		const { settings, changed } = migrateReminderSettings(own, old);
		this.settings = settings;
		if (changed) await this.saveData(settings);
	}

	saveSettings() { return this.saveData(this.settings); }
}

class RemindersSettingTab extends PluginSettingTab {
	constructor(private plugin: AnchorAppleReminders) { super(plugin.app, plugin); }

	display() {
		const el = this.containerEl;
		el.empty();
		if (!getJumpApi((this.app as any).plugins)) {
			el.createEl('p', { text: 'Anchor Apple Reminders needs the Anchor Jump plugin. Install and enable it to use the command.', cls: 'mod-warning' });
		}
		renderSettings(this.app, el, this.plugin.settings, () => this.plugin.saveSettings());
	}
}
