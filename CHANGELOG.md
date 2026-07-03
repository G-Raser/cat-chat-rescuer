# Changelog

## v0.3.7-incremental-append（planned）

Planned low-risk enhancement release.

### Priority goals

- Generate `<archive>.rescue-state.json` after full export.
- Store tail anchors for the last 5–10 messages.
- Add an incremental append flow that finds tail anchors from the bottom of the current conversation and appends only new messages.
- Fail safely when anchors cannot be found; do not modify existing archives.
- Add clearer Markdown date metadata: `date`, `exported_at`, `timezone`, and `message_timestamps_available`.

### Non-goals

- Do not rewrite the working scroll/capture logic.
- Do not redesign the UI.
- Do not add LLM-generated summaries yet.
- Do not commit real private conversation exports.

## v0.3.6-syntax-hotfix

Current uploaded version.

### Notes

- Extension name: `CatChat Rescuer Clean`.
- Manifest version: 3.
- Main content script: `content.js`.
- Background service worker: `background.js`.
- Fixed the syntax error from v0.3.4 / v0.3.5 caused by an extra `}` after `startTotalTimer()`.
- Preserved clean panel title and timer controls.

