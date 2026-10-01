# CatLog Mobile Changelog

## v0.1.6

### Changed

- Keeps the existing text-bearing `thoughts` count as the thinking-summary count.
- Extracts `metadata.reasoning_title` into a separate reasoning-title count and Markdown section instead of mixing it into summary totals.
- Adds `conversation_title` and `conversation_id` provenance to thinking Markdown frontmatter.

## v0.1.4

### Fixed

- Aligns the floating-panel version label and userscript metadata; increments the version so existing v0.1.3 test installations can receive the update.

## v0.1.3

### Fixed

- Avoids a Firefox userscript cross-realm Response access failure when reading ChatGPT conversations. Uses same-realm fetch with no userscript sandbox grants; the authenticated API and export formats remain unchanged.
- Corrects the floating-panel version label to match the userscript metadata.

## v0.1.2

### Added

- Detects recoverable conversation branches when the full mapping is available.
- Shows branch message counts, divergence positions and previews; supports standalone Markdown export of a selected branch.
- Reports when a paginated current-path response lacks a complete branch tree.

## v0.1.1

Improves the mobile floating-panel behavior so CatLog can stay available without permanently blocking ChatGPT controls or content.

### Added

- Vertical dragging for both the compact right-edge launcher and the expanded panel header.
- Persistent vertical position stored locally and restored on later page loads.
- A dedicated `−` control that collapses the expanded panel back to the right-edge launcher.
- A dedicated `×` control that hides both the panel and launcher for the current page only; CatLog appears again after the page is reloaded or entered again.
- Viewport clamping so saved positions remain reachable after orientation or viewport-size changes.

### Changed

- The launcher and expanded panel now share one vertical anchor, so expanding/collapsing keeps the tool near the same place on screen.
- Header controls are excluded from drag handling to avoid accidental movement while tapping buttons.

## v0.1.0

First public mobile userscript release.

### Added

- Firefox Android + Tampermonkey userscript workflow.
- Current-conversation API-first reading.
- Readable chat Markdown export.
- Current-branch displayed-thinking Markdown export.
- Raw conversation JSON export.
- Optional timestamps.
- Custom human / AI export labels stored locally.
- Blank label fields fall back to `User / Assistant` without requiring the user to delete default text.
- Compact right-edge launcher and narrower mobile panel.
- GitHub Raw update/download metadata.

### Notes

- Tested successfully on Firefox Android + Tampermonkey before release.
- Mobile is versioned independently from the desktop extension.
