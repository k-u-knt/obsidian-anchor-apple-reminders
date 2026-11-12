import type { TitleSource } from './title';

export interface ReminderSettings {
	listName: string;           // Reminders list ('' = default list)
	titleSource: TitleSource;   // default reminder title
	morningHour: number;
	eveningHour: number;
	includeSelection: boolean;  // put the selected text into the reminder's notes
	dateOnly: boolean;          // default for the pop-up's "No time" toggle
}

export const DEFAULTS: ReminderSettings = {
	listName: '',
	titleSource: 'project',
	morningHour: 9,
	eveningHour: 17,
	includeSelection: true,
	dateOnly: false,
};

const SOURCES: TitleSource[] = ['project', 'selection', 'project-selection'];
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

function hour(v: unknown, dflt: number): number {
	const n = typeof v === 'number' ? Math.trunc(v) : typeof v === 'string' ? parseInt(v, 10) : NaN;
	return isNaN(n) ? dflt : Math.min(23, Math.max(0, n));
}

/** Keep only the known keys, falling back to the defaults for anything of the wrong type. */
function clean(raw: Record<string, any>): ReminderSettings {
	return {
		listName: typeof raw.listName === 'string' ? raw.listName : DEFAULTS.listName,
		titleSource: SOURCES.includes(raw.titleSource) ? raw.titleSource : DEFAULTS.titleSource,
		morningHour: hour(raw.morningHour, DEFAULTS.morningHour),
		eveningHour: hour(raw.eveningHour, DEFAULTS.eveningHour),
		includeSelection: typeof raw.includeSelection === 'boolean' ? raw.includeSelection : DEFAULTS.includeSelection,
		dateOnly: typeof raw.dateOnly === 'boolean' ? raw.dateOnly : DEFAULTS.dateOnly,
	};
}

/**
 * Own saved settings win. Only when they are empty are the reminder settings taken over from
 * Anchor Actions 0.4 data (`actions.reminder`); `changed` tells the caller to save the result.
 */
export function migrateReminderSettings(own: unknown, oldAnchorActionsData: unknown): { settings: ReminderSettings; changed: boolean } {
	if (isObj(own) && Object.keys(own).length > 0) return { settings: clean(own), changed: false };
	const old = isObj(oldAnchorActionsData) && isObj(oldAnchorActionsData.actions) ? oldAnchorActionsData.actions.reminder : undefined;
	if (isObj(old)) return { settings: clean(old), changed: true };
	return { settings: { ...DEFAULTS }, changed: false };
}
