# Changelog

## v0.3.8-incremental-patch

First testable incremental export flow.

### Added

- Add `载入 State` button.
- Add `导出增量` button.
- Read a previous `.rescue-state.json` through a local file picker.
- Match previous tail anchors against the current captured message cache.
- Export only messages after the matched tail anchor as an incremental patch.
- Download incremental `.json`, incremental `.md`, and an updated `.rescue-state.json`.
- Fail safely when the previous tail anchor cannot be found.

### Notes

- This does not overwrite or directly append to previous archive files.
- Browser-side local-file overwrite is intentionally avoided for now.
- The incremental output is a patch package that can be manually merged or used by later tooling.

## v0.3.7-state-export

Stage 1 of incremental append support.

### Added

- Generate `<archive>.rescue-state.json` from the current ordered messages.
- Store tail anchors for the last 5–10 messages.
- Add a standalone `导出 State` panel button.
- Update MD / JSON export filenames to include the export date.
- Add YAML front matter to Markdown exports.
- Add Markdown metadata fields: `date`, `exported_at`, `timezone`, `message_timestamps_available`, `message_capture_timestamps_available`, and `rescue_state_file`.
- Download a rescue-state file alongside both MD and JSON exports.

### Notes

- Current DOM capture does not provide reliable original ChatGPT message timestamps.
- `capturedAt` is plugin capture time, not original message time.
- Markdown therefore sets `message_timestamps_available: false` and does not fabricate per-message dates.

### Non-goals preserved

- Did not rewrite the working scroll/capture logic.
- Did not redesign the whole UI.
- Did not add LLM-generated summaries.
- Did not commit real private conversation exports.

## v0.3.6-syntax-hotfix

Previously uploaded stable version.

### Notes

- Extension name: `CatChat Rescuer Clean`.
- Manifest version: 3.
- Main content script: `content.js`.
- Background service worker: `background.js`.
- Fixed the syntax error from v0.3.4 / v0.3.5 caused by an extra `}` after `startTotalTimer()`.
- Preserved clean panel title and timer controls.

