/** Pure helpers for the reminder title (no Obsidian imports, unit-tested). */

export type TitleSource = 'project' | 'selection' | 'project-selection';

/** Default reminder title; falls back to the selection when there is no project. */
export function defaultTitle(ctx: { title: string; projectName?: string }, src: TitleSource): string {
	const p = ctx.projectName?.trim();
	if (!p || src === 'selection') return ctx.title;
	if (src === 'project-selection' && ctx.title && ctx.title !== p) return `${p} — ${ctx.title}`;
	return p;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD HH:mm" (local), "YYYY-MM-DD" for date-only, "" for none. */
export function formatDue(d: Date | null, dateOnly = false): string {
	if (!d) return '';
	const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	return dateOnly ? day : `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
