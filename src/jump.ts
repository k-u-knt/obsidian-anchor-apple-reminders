import type { TFile } from 'obsidian';

/* Types re-declared from the Anchor Jump plugin's API (version 1); no package dependency. */
export interface SelectionInfo {
	source: 'markdown' | 'canvas'; file: TFile;
	text: string; title: string; label: string; projectName?: string;
}
export interface AnchorLink { uri: string; markdownLink: string; label: string; }
export interface AnchorJumpApi {
	readonly version: 1;
	/** The selection, or the current line in the editor; null when there is nothing (e.g. no markdown/canvas view). */
	currentSelection(): SelectionInfo | null;
	/** `sel` must come from currentSelection(). Never modifies the note. */
	linkFor(sel: SelectionInfo): Promise<AnchorLink>;
}

/** The Anchor Jump API, or null when the plugin is missing, disabled or speaks another version. */
export function getJumpApi(plugins: { getPlugin(id: string): any } | undefined): AnchorJumpApi | null {
	const api = plugins?.getPlugin('anchor-jump')?.api;
	return api && api.version === 1 ? (api as AnchorJumpApi) : null;
}
