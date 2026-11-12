import assert from 'node:assert/strict';
import { defaultTitle, formatDue } from '../src/title';
import { getJumpApi } from '../src/jump';
import { DEFAULTS, migrateReminderSettings } from '../src/settings';

let n = 0;
function t(name: string, fn: () => void) { fn(); n++; console.log('ok -', name); }

t('default title from project / selection', () => {
	const c = { title: 'citation insertion', projectName: 'Demo Project' };
	assert.equal(defaultTitle(c, 'project'), 'Demo Project');
	assert.equal(defaultTitle(c, 'selection'), 'citation insertion');
	assert.equal(defaultTitle(c, 'project-selection'), 'Demo Project — citation insertion');
	assert.equal(defaultTitle({ title: 'x' }, 'project'), 'x'); // not a project note → selection
});

t('due formatting incl. date only', () => {
	const d = new Date(2026, 8, 29, 9, 5);
	assert.equal(formatDue(d), '2026-09-29 09:05');
	assert.equal(formatDue(d, true), '2026-09-29');
	assert.equal(formatDue(null, true), '');
});

t('getJumpApi: null unless enabled and version 1', () => {
	assert.equal(getJumpApi(undefined), null);
	assert.equal(getJumpApi({ getPlugin: () => undefined }), null);
	assert.equal(getJumpApi({ getPlugin: () => ({ api: { version: 2 } }) }), null);
	assert.equal(getJumpApi({ getPlugin: () => ({}) }), null);
	const api = { version: 1, currentSelection: () => null, linkFor: async () => ({}) };
	let asked = '';
	assert.equal(getJumpApi({ getPlugin: (id: string) => { asked = id; return { api }; } }), api as any);
	assert.equal(asked, 'anchor-jump');
});

t('defaults', () => {
	assert.deepEqual(DEFAULTS, { listName: '', titleSource: 'project', morningHour: 9, eveningHour: 17, includeSelection: true, dateOnly: false });
});

t('migrate from Anchor Actions 0.4 data: stale keys gone', () => {
	const old = { actions: { reminder: { listName: 'Work', titleSource: 'selection', backend: 'shortcut', shortcutName: 'X', useMarker: true, marker: '⏰', canvasColor: '6' } } };
	const r = migrateReminderSettings(null, old);
	assert.deepEqual(r.settings, { ...DEFAULTS, listName: 'Work', titleSource: 'selection' });
	assert.equal(r.changed, true);
});

t('migrate: own settings win and are not changed', () => {
	const own = { listName: 'Mine', morningHour: 8 };
	const r = migrateReminderSettings(own, { actions: { reminder: { listName: 'Work' } } });
	assert.deepEqual(r.settings, { ...DEFAULTS, listName: 'Mine', morningHour: 8 });
	assert.equal(r.changed, false);
});

t('migrate: nothing anywhere gives defaults, unchanged', () => {
	const r = migrateReminderSettings(undefined, undefined);
	assert.deepEqual(r.settings, DEFAULTS);
	assert.equal(r.changed, false);
});

t('migrate: bad hours', () => {
	const a = migrateReminderSettings({}, { actions: { reminder: { morningHour: 'abc', eveningHour: 30 } } });
	assert.equal(a.settings.morningHour, DEFAULTS.morningHour);
	assert.equal(a.settings.eveningHour, 23);
	const b = migrateReminderSettings({}, { actions: { reminder: { titleSource: 'bogus', dateOnly: 'yes' } } });
	assert.equal(b.settings.titleSource, 'project');
	assert.equal(b.settings.dateOnly, false);
});

console.log(`\n${n} tests passed`);
