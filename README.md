# Anchor Apple Reminders

An Obsidian plugin that adds the current selection to Apple Reminders, with a link that jumps back to the exact spot.

## Requirements

- macOS, Obsidian desktop (the plugin is desktop-only).
- The [Anchor Jump](https://github.com/k-u-knt/obsidian-anchor-jump) plugin, installed and enabled. It provides the selection and the exact-spot link. Without it the command shows a notice and does nothing.

## Use

Select text, an image or a canvas card (with no selection in the editor, the current line is used), then run **Add selection to Apple Reminders** from the command palette (or from an Anchor Actions strip button). A small pop-up lets you edit the title and notes and pick a due time. The reminder's URL field and notes hold the link, then `📎` plus where it came from, then the selected text.

## Reminders permission

The first time, macOS asks whether Obsidian may access your Reminders. Allow it (System Settings, Privacy & Security, Reminders). The **Test** button in settings creates a sample reminder and triggers the prompt.

## Settings

- **Reminders list**: leave empty for your default list.
- **Default reminder title**: project name, selected text, or both.
- **Quick times**: morning and evening hours for the "Tomorrow" and "Today" buttons.
- **Date only by default**: start the pop-up with all-day reminders.
- **Put the selected text in the notes**.

If you used Anchor Actions 0.4, these settings are taken over automatically the first time.

## Why EventKit and not AppleScript

The plugin talks to the Reminders database through EventKit (via `osascript -l JavaScript`), as the Reminders app does. Scripting Reminders.app hangs on large libraries, and it cannot set date-only due dates or the URL field. Nothing is written to your notes or canvas.

## Development

```
npm install
npm test
npm run typecheck
npm run build
```

## License

MIT
