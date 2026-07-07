# Changelog

## v0.4.2-session-incremental-scan

Fixes the real full-window failure where incremental scan could be misled by the old local captured cache.

### Added

- Adds a per-run scan session for incremental scanning.
- Adds `载入旧 JSON` so `combined-full` is generated only from the previous full JSON plus the new patch.
- Exports only patch files and `.patch-only.rescue-state.json` when old full JSON is not loaded.
- Checks that loaded old JSON message count matches the loaded State before generating `combined-full`.

### Changed

- Incremental anchor matching now uses only messages captured by the current scan session.
- Incremental patch slicing now uses only the current scan session messages.
- Full export still uses the normal global capture cache.

### Notes

- `orderedMessages()`, `state.map`, and `state.order` are no longer used to decide whether incremental anchors were found.
- If fewer than 3 continuous old tail anchors are found, no patch, combined-full, or new state is exported.

## v0.4.1-strict-anchor-scan

Fixes the unsafe incremental behavior where a weak one-message anchor could be treated as a valid match.

### Added

- Requires at least 3 continuous tail anchors before incremental export is allowed.
- Tracks weak 1–2 message matches as weak matches only.
- Keeps scanning when only weak matches are found.
- Fails safely without exporting files if a stable anchor match is not found.
- Adds `min_safe_anchor_match` metadata to rescue-state and incremental outputs.

### Notes

- This is the direct fix for the observed bug: clicking `增量扫描` could export even though the old tail anchor was not stably found.
- If the status says weak match, it is not enough; the extension should continue scanning or fail without output.

## v0.4.0-state-first-incremental-scan

Corrects the incremental workflow to load state first, then scan from the current conversation bottom upward until the old tail anchors are found.

### Added

- Changed the incremental flow to state-first:
  1. `载入 State`
  2. `增量扫描`
  3. auto-jump to bottom
  4. capture while scrolling upward
  5. stop once previous tail anchors are found
- `增量扫描` can collect many screens of newly added messages, not only the current visible screen.
- Preserves patch JSON / MD exports.
- Preserves combined-full JSON / MD exports.
- Preserves updated `.rescue-state.json` export.
- The scan can be stopped with the existing stop button because it uses the same `autoScrolling` guard.

### Notes

- This still does not overwrite previous archive files.
- It still benefits from local cache when available, but no longer conceptually relies on the user manually grabbing only the current screen.
- If too many new messages were added and the old anchor is far above, switch to `慢速` or `普通` and retry.

## v0.3.9-combined-incremental

Incremental export now produces a usable combined full archive after a successful anchor match.

### Added

- After `导出增量` matches the previous tail anchors, export both patch files and combined full archive files.
- Download incremental patch JSON / MD.
- Download combined-full JSON / MD containing the current full captured message cache.
- Download an updated `.rescue-state.json` for the next incremental round.
- Status now reports old message count, new message count, combined message count, and match window size.

### Notes

- This still does not overwrite previous archive files.
- This relies on the current local captured cache containing the old messages plus the new tail messages.
- It is the practical path after a same-window continuation test.

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
