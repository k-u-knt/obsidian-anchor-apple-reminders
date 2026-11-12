import { App, Modal, Notice, Setting } from 'obsidian';
import type { AnchorJumpApi, SelectionInfo } from './jump';
import type { ReminderSettings } from './settings';
import { defaultTitle, TitleSource } from './title';

export interface ReminderPayload {
	title: string;
	notes: string;
	url: string;
	allday: boolean;   // date only, no time
}

function at(dayOffset: number, hour: number, base = new Date()): Date {
	const d = new Date(base);
	d.setDate(d.getDate() + dayOffset);
	d.setHours(hour, 0, 0, 0);
	return d;
}
function nextWeekday(target: number, hour: number): Date {
	const now = new Date();
	let diff = (target - now.getDay() + 7) % 7;
	if (diff === 0) diff = 7;
	return at(diff, hour, now);
}

/* ------------------------------------------------------------------ */
/* Pop-up                                                              */
/* ------------------------------------------------------------------ */

export class ReminderModal extends Modal {
	private title: string;
	private notes: string;
	private due: Date | null = null;
	private dateOnly: boolean;
	private submitted = false;

	constructor(app: App, private ctx: SelectionInfo, private s: ReminderSettings,
		private onSubmit: (title: string, notes: string, due: Date | null, dateOnly: boolean) => void) {
		super(app);
		this.title = defaultTitle(ctx, s.titleSource);
		this.notes = s.includeSelection ? ctx.text.trim().slice(0, 1500) : '';
		this.dateOnly = s.dateOnly;
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.addClass('anchor-reminder-modal');
		this.setTitle('⏰ New reminder');
		contentEl.createDiv({ cls: 'anchor-reminder-origin', text: `from ${this.ctx.label}` });

		let titleInput!: HTMLInputElement;
		new Setting(contentEl).setName('Title').addText(t => {
			titleInput = t.inputEl;
			t.setValue(this.title).onChange(v => (this.title = v));
			t.inputEl.addClass('anchor-reminder-title');
		});

		new Setting(contentEl).setName('Notes').setDesc('The link back to Obsidian is added automatically.')
			.addTextArea(t => {
				t.setValue(this.notes).onChange(v => (this.notes = v));
				t.inputEl.rows = 3;
			});

		const dueSetting = new Setting(contentEl).setName('Remind me');
		const chips = dueSetting.controlEl.createDiv({ cls: 'anchor-reminder-chips' });
		const custom = createEl('input', { cls: 'anchor-reminder-custom' });
		let buttons: HTMLButtonElement[] = [];
		let activeIdx = 0;

		const options = (): [string, Date | null][] => {
			const now = new Date(), d = this.dateOnly;
			const m = this.s.morningHour, e = this.s.eveningHour;
			const o: [string, Date | null][] = [[d ? 'No date' : 'No alert', null]];
			if (d || now.getHours() < e) o.push([d ? 'Today' : `Today ${e}:00`, at(0, d ? 0 : e)]);
			o.push([d ? 'Tomorrow' : `Tomorrow ${m}:00`, at(1, d ? 0 : m)]);
			if (now.getDay() !== 6 && now.getDay() !== 0) o.push(['Saturday', nextWeekday(6, d ? 0 : 10)]);
			o.push(['Next Monday', nextWeekday(1, d ? 0 : m)]);
			return o;
		};
		const select = (idx: number, d: Date | null) => {
			activeIdx = idx;
			this.due = d;
			buttons.forEach((b, i) => b.toggleClass('is-active', i === idx));
			if (idx >= 0) custom.value = '';
		};
		const renderChips = () => {
			const keepCustom = activeIdx < 0 ? custom.value : '';
			chips.empty();
			const opts = options();
			buttons = opts.map(([label, d], i) => {
				const b = chips.createEl('button', { text: label, cls: 'anchor-reminder-chip', attr: { type: 'button' } });
				b.addEventListener('click', () => select(i, d));
				return b;
			});
			custom.type = this.dateOnly ? 'date' : 'datetime-local';
			chips.appendChild(custom);
			if (keepCustom) {                       // keep a picked custom date when toggling
				custom.value = this.dateOnly ? keepCustom.slice(0, 10) : `${keepCustom.slice(0, 10)}T${String(this.s.morningHour).padStart(2, '0')}:00`;
				custom.dispatchEvent(new Event('change'));
			} else {
				const i = Math.min(Math.max(activeIdx, 0), opts.length - 1);
				select(i, opts[i][1]);
			}
		};
		custom.addEventListener('change', () => {
			if (!custom.value) return;
			const d = this.dateOnly ? new Date(custom.value + 'T00:00') : new Date(custom.value);
			if (!isNaN(d.getTime())) select(-1, d);
		});

		new Setting(contentEl).setName('No time (date only)')
			.setDesc('All-day reminder: due on the day, no alert time.')
			.addToggle(t => t.setValue(this.dateOnly).onChange(v => { this.dateOnly = v; renderChips(); }));
		renderChips();

		new Setting(contentEl)
			.addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(b => b.setButtonText('Add to Reminders').setCta().onClick(() => this.submit()));

		this.scope.register([], 'Enter', e => {
			if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return true;
			this.submit(); return false;
		});
		this.scope.register(['Mod'], 'Enter', () => { this.submit(); return false; });
		window.setTimeout(() => { titleInput.focus(); titleInput.select(); }, 10);
	}

	private submit() {
		if (this.submitted) return;
		if (!this.title.trim()) { new Notice('Give the reminder a title.'); return; }
		this.submitted = true;
		this.close();
		this.onSubmit(this.title.trim(), this.notes.trim(), this.due, this.dateOnly);
	}

	onClose() { this.contentEl.empty(); }
}

/* ------------------------------------------------------------------ */
/* EventKit (macOS): osascript -l JavaScript, all inside Obsidian     */
/* ------------------------------------------------------------------ */

/*
 * Talks to the Reminders database through EventKit (like the Reminders app
 * itself), not by scripting Reminders.app — that route hangs on large
 * libraries. Supports date-only (all-day) due dates and the URL field.
 * First use triggers macOS's "Obsidian would like to access your Reminders".
 */
const EK_SCRIPT = `ObjC.import('EventKit'); ObjC.import('Foundation');
function run(argv) {
  const p = JSON.parse(argv[0]);
  const store = $.EKEventStore.alloc.init;
  const E = $.EKEntityTypeReminder;
  // JXA returns this enum as a string ("3"), so coerce before comparing
  let st = Number($.EKEventStore.authorizationStatusForEntityType(E));
  if (st === 0) {
    let done = false;
    const cb = () => { done = true; };
    if (store.respondsToSelector('requestFullAccessToRemindersWithCompletion:')) store.requestFullAccessToRemindersWithCompletion(cb);
    else store.requestAccessToEntityTypeCompletion(E, cb);
    const until = $.NSDate.dateWithTimeIntervalSinceNow(120);
    while (!done && $.NSDate.date.compare(until) < 0) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1));
    st = Number($.EKEventStore.authorizationStatusForEntityType(E));
  }
  if (st !== 3 && st !== 4) throw new Error('NO_ACCESS');
  let cal = store.defaultCalendarForNewReminders;
  if (p.list) {
    const cals = store.calendarsForEntityType(E);
    let found = null;
    for (let i = 0; i < cals.count; i++) if (cals.objectAtIndex(i).title.js === p.list) found = cals.objectAtIndex(i);
    if (!found) throw new Error('NO_LIST');
    cal = found;
  }
  const r = $.EKReminder.reminderWithEventStore(store);
  r.title = p.title; r.notes = p.notes; r.calendar = cal;
  if (p.url) r.URL = $.NSURL.URLWithString(p.url);
  if (p.y) {
    const c = $.NSDateComponents.alloc.init;
    c.year = Number(p.y); c.month = Number(p.mo); c.day = Number(p.d);
    if (!p.allday) {
      c.hour = Number(p.h); c.minute = Number(p.mi);
      r.addAlarm($.EKAlarm.alarmWithAbsoluteDate($.NSCalendar.currentCalendar.dateFromComponents(c)));
    }
    r.dueDateComponents = c;
  }
  const err = $();
  if (!store.saveReminderCommitError(r, true, err)) throw new Error('SAVE: ' + (err.isNil() ? '' : err.localizedDescription.js));
  return r.calendarItemIdentifier.js;
}`;

export async function createViaEventKit(p: ReminderPayload, due: Date | null, list: string): Promise<string> {
	const { execFile } = (window as any).require('child_process');
	const arg = JSON.stringify({
		title: p.title, notes: p.notes, url: p.url, list, allday: p.allday,
		...(due ? { y: due.getFullYear(), mo: due.getMonth() + 1, d: due.getDate(), h: due.getHours(), mi: due.getMinutes() } : {}),
	});
	return new Promise((resolve, reject) => {
		execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', EK_SCRIPT, arg], { timeout: 150000 },
			(err: any, out: string, stderr: string) => {
				if (!err) return resolve(String(out).trim());
				const msg = String(stderr || err.message || '');
				if (msg.includes('NO_ACCESS')) reject(new Error('Obsidian has no access to Reminders. Allow it in System Settings → Privacy & Security → Reminders.'));
				else if (msg.includes('NO_LIST')) reject(new Error(`No Reminders list called "${list}". Fix the list name in settings.`));
				else reject(new Error(msg.replace(/^.*execution error: /s, '').trim() || 'Reminders refused the reminder'));
			});
	});
}

/* ------------------------------------------------------------------ */
/* The command                                                         */
/* ------------------------------------------------------------------ */

/** Open the pop-up for `sel`; on submit ask Anchor Jump for the link and create the reminder. */
export function addSelectionReminder(app: App, api: AnchorJumpApi, sel: SelectionInfo, s: ReminderSettings) {
	new ReminderModal(app, sel, s, async (title, notes, due, dateOnly) => {
		try {
			const link = await api.linkFor(sel);
			const payload: ReminderPayload = {
				title,
				// link first, then where it came from, then the text
				notes: [`${link.uri}\n📎 ${link.label}`, notes].filter(Boolean).join('\n\n'),
				url: link.uri,
				allday: !!due && dateOnly,
			};
			await createViaEventKit(payload, due, s.listName);
			new Notice(`⏰ Reminder added: ${title}`);
		} catch (e) {
			new Notice(`Reminder not created — ${(e as Error).message}`, 10000);
		}
	}).open();
}

export function renderSettings(app: App, el: HTMLElement, s: ReminderSettings, save: () => Promise<void>) {
	const test = async () => {
		const payload: ReminderPayload = {
			title: 'Anchor Apple Reminders test', notes: 'You can delete this reminder.',
			url: `obsidian://open?vault=${encodeURIComponent(app.vault.getName())}`, allday: false,
		};
		try {
			await createViaEventKit(payload, null, s.listName);
			new Notice('Test reminder created — check Reminders.');
		} catch (e) { new Notice((e as Error).message, 10000); }
	};
	new Setting(el).setName('Reminders list')
		.setDesc('Leave empty for your default list. Reminders are created directly from Obsidian (macOS), no Shortcuts app involved. Test creates a sample reminder and triggers the permission prompt.')
		.addText(t => t.setPlaceholder('default list').setValue(s.listName).onChange(async v => { s.listName = v.trim(); await save(); }))
		.addButton(b => b.setButtonText('Test').onClick(test));
	new Setting(el).setName('Default reminder title')
		.setDesc('Project name = the paper\'s title for paper notes (`type: paper`), otherwise the note\'s `project:` property, or the note itself if it is `type: project`; the canvas name for canvases. Falls back to the selected text. You can always edit it in the pop-up.')
		.addDropdown(d => d.addOptions({
			'project': 'Project name',
			'selection': 'Selected text',
			'project-selection': 'Project name — selected text',
		}).setValue(s.titleSource).onChange(async v => { s.titleSource = v as TitleSource; await save(); }));
	new Setting(el).setName('Quick times').setDesc('Morning / evening hour for the “Tomorrow” and “Today” buttons.')
		.addText(t => t.setValue(String(s.morningHour)).onChange(async v => { s.morningHour = clampHour(v, 9); await save(); }).inputEl.style.width = '4em')
		.addText(t => t.setValue(String(s.eveningHour)).onChange(async v => { s.eveningHour = clampHour(v, 17); await save(); }).inputEl.style.width = '4em');
	new Setting(el).setName('Date only by default')
		.setDesc('Start the pop-up with “No time” switched on (all-day reminders).')
		.addToggle(t => t.setValue(s.dateOnly).onChange(async v => { s.dateOnly = v; await save(); }));
	new Setting(el).setName('Put the selected text in the notes')
		.addToggle(t => t.setValue(s.includeSelection).onChange(async v => { s.includeSelection = v; await save(); }));
}

function clampHour(v: string, dflt: number) {
	const n = parseInt(v, 10);
	return isNaN(n) ? dflt : Math.min(23, Math.max(0, n));
}
