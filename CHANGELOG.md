# Changelog

## v0.5.2-export-options-and-ui-boot

Improves the modern API-first UI startup and restores optional timestamps in readable exports.

### Added

- Adds `boot-hide.js` before the legacy DOM core so the old panel is hidden until the modern three-section UI is ready.
- Adds an independent `导出时间戳` checkbox to the readable conversation export.
- Adds an independent `导出时间戳` checkbox to thinking Markdown / TXT exports.
- Timestamp preferences are stored in browser localStorage and default to enabled.
- Readable timestamps use the API-provided `create_time` and are normalized to ISO strings; missing times are not fabricated.

### Changed

- The extension-icon recovery path now also injects `boot-hide.js` before `content.js`, preventing the old UI from flashing during recovery.
- Modern UI marks the panel ready only after the replacement body and event handlers are mounted.
- If modern mounting never succeeds, the old panel becomes visible after a 15-second fallback window instead of remaining permanently hidden.
- README updated for v0.5.2, timestamp toggles, and the new startup sequence.

## v0.5.1-panel-recovery-hotfix

Hotfix for the v0.5.0 case where the extension remained installed but the entire in-page panel could fail to appear after an extension reload.

### Added

- Adds a single `chrome.action` recovery path owned by `api-background.js`.
- Clicking the extension icon on a ChatGPT tab now restores the existing panel or injects the current v0.5.x runtime only: `content.js` → `api-data.js` → `ui-controller.js`.
- Existing complete panels are only made visible again; they are not needlessly rebuilt.

### Changed

- Keeps declarative content-script loading as the normal path; the extension icon is a recovery / wake-up path, not a required first step.
- Does not restore the old `background-loader.js` / split-thinking double-injection chain.
- README installation and troubleshooting instructions now document the recovery behavior.

## v0.5.0-api-first-unified-read

Major experimental architecture update that turns the old DOM-only rescuer into an API-first conversation archiver with displayed-thinking export while retaining legacy rescue tools.

### Added

- Adds `api-background.js` for authenticated conversation reads through the current ChatGPT page session.
- Adds `api-data.js` to normalize conversation trees, current paths, displayed `thoughts`, and `reasoning_recap` nodes.
- Adds `ui-controller.js` with three user-facing sections: `读取内容`, `思考轨迹`, and `传统 DOM / 增量抢救工具`.
- Adds one-read/multi-export behavior: readable Markdown, Raw JSON, and thinking exports share the same in-memory conversation cache.
- Adds current-conversation and pasted `/c/...` link / conversation-ID reading through the same `读取内容` button.
- Adds elapsed-time read status such as `⟳ 当前对话 读取中 · 12s`.
- Adds displayed-thinking Markdown and plain-text exports with current-branch / whole-tree scope.
- Adds developer-only complete thinking export and probe output.

### Changed

- Primary thinking counts and default thinking exports now include only turns with actual non-empty `thoughts` body content.
- Pure `Worked for ...`, recap-only turns, and empty tool-summary turns no longer count as normal thinking turns.
- Legacy DOM capture, State, and incremental scanning remain available as a fallback instead of being the primary export path.
- README and privacy documentation were rewritten for the API-first data flow and sensitivity of Raw JSON / thinking exports.

### Notes

- The default thinking export is intended for user-visible / recoverable displayed-thinking summaries, not never-displayed hidden reasoning.
- Full conversation-tree reads preserve branches when the full endpoint succeeds; pagination fallback mainly guarantees the current path.

## v0.4.2-session-incremental-scan

Fixes the real full-window failure where incremental scan could be misled by the old local captured cache.

### Added

- Adds a per-run scan session for incremental scanning.
- Adds `载入旧 JSON` so `combined-full` is generated only from the previous full JSON plus the new patch.
- Exports only patch files and `.patch-only.rescue-state.json` when old full JSON is not loaded.
- Checks that loaded old JSON message count matches the loaded State before generating `combined-full`.
- Adds public installation, privacy, limitations, and file-usage documentation.
- Adds `PRIVACY.md` and an MIT `LICENSE`.
- Adds a minimal GitHub Actions syntax and manifest validation workflow.

### Changed

- Incremental anchor matching now uses only messages captured by the current scan session.
- Incremental patch slicing now uses only the current scan session messages.
- Full export still uses the normal global capture cache.
- The main counter now shows the most useful value for the active mode: `完整缓存` during full capture and `本轮扫描` during incremental scan.
- Public extension name changed from `CatChat Rescuer Clean` to `CatChat Rescuer`.
- Removed the unused `storage` permission from the manifest.
- Expanded `.gitignore` to block common conversation exports, patches, combined archives, and rescue-state files.
- Removed the stale hard-coded v0.3.0 label from background injection errors.

### Notes

- `orderedMessages()`, `state.map`, and `state.order` are no longer used to decide whether incremental anchors were found.
- If fewer than 3 continuous old tail anchors are found, no patch, combined-full, or new state is exported.
- `.rescue-state.json` is sensitive and may contain conversation metadata and short tail-message previews.

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
- `capturedAt` is plugin capture time, not original ChatGPT message time.
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
