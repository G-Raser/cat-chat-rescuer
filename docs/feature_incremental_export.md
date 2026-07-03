# Feature design｜incremental append export

## Problem

Full exports for very long ChatGPT conversations can take 20–30 minutes. After one successful full export, the user may continue the same long conversation for a short while. Re-running a full export for only a few new messages wastes time and increases the chance of UI failure.

## Goal

Add an incremental append mode:

> Full export once, then only append the new tail messages.

## Non-goals for the first implementation

- Do not rewrite the auto-scroll/capture core.
- Do not implement LLM summarization.
- Do not redesign the panel UI beyond minimal buttons/status.
- Do not attempt to recover from every possible ChatGPT branch or ghost-tail state.

## State file

After full export, write:

```text
<archive-name>.rescue-state.json
```

Suggested schema:

```json
{
  "schema_version": 1,
  "exporter_version": "0.3.7-incremental-append",
  "conversation_id": "...",
  "source_url": "https://chatgpt.com/c/...",
  "title": "...",
  "created_at": "2026-07-01T12:29:40Z",
  "last_exported_at": "2026-07-01T12:29:40Z",
  "timezone": "UTC",
  "message_count": 1346,
  "raw_captured_count": 1346,
  "export_order": "oldestFirst",
  "tail_anchor_window_size": 10,
  "tail_anchors": [
    {
      "ordinal": 1337,
      "role": "user",
      "normalized_hash": "...",
      "preview": "...",
      "has_assets": false,
      "captured_at": "2026-07-01T12:29:40Z"
    }
  ],
  "last_message": {
    "ordinal": 1346,
    "role": "assistant",
    "normalized_hash": "...",
    "preview": "..."
  },
  "output_files": {
    "markdown": "...md",
    "json": "...json"
  }
}
```

## Anchor construction

Each anchor should be based on a normalized message representation.

Recommended normalized fields:

```text
role + normalized_text + has_assets marker
```

Current code does not yet capture rich assets, so first implementation can use:

```text
role + normalized_text
```

Normalization rules:

- Convert NBSP to normal spaces.
- Trim leading/trailing whitespace.
- Collapse repeated whitespace outside code blocks if safe.
- Preserve enough punctuation and CJK text to avoid weak hashes.
- For long messages, hash full text if feasible; if performance becomes an issue, hash first/last chunks plus length.

## Why multiple anchors

Do not rely on only the final message.

Long ChatGPT windows may show:

- final response changed after retry;
- mobile-only ghost tail;
- multi-device visible-tail mismatch;
- max-depth / full-window rollback behavior.

Use a tail anchor window of 5–10 messages and prefer continuous sequence matching.

## Minimal UI proposal

For v0.3.7, avoid a complicated UI.

Possible small additions:

- `导出 State` button, or automatically download state after full export.
- Later: `增量补充` button.

The safer first patch is automatic state generation with full export. Incremental append can be implemented after state generation is tested.

## Incremental flow

1. User opens the same ChatGPT conversation.
2. User loads/chooses previous `.rescue-state.json` and previous output files, or the extension uses a local IndexedDB record when available.
3. Extension captures the bottom visible messages.
4. Extension searches for the previous tail anchor window.
5. If not found, scroll upward for a bounded number of steps.
6. If still not found, abort without modifying old archives.
7. If found, collect only messages after the matched anchor.
8. Append to Markdown and JSON.
9. Write updated state.

## Append safety

Before modifying existing archives, the extension should ideally write to temporary files:

```text
<archive>.md.tmp
<archive>.json.tmp
<archive>.rescue-state.json.tmp
```

Only after successful append should the user save/replace final files. In browser-download mode, this may be implemented as downloading new files with an `-incremental-<date>` suffix rather than overwriting silently.

## Browser limitation note

A browser extension cannot freely modify arbitrary existing local files unless it uses the File System Access API or user-selected handles. For first implementation, it may be safer to download:

```text
<archive-name>.incremental-<timestamp>.md
<archive-name>.incremental-<timestamp>.json
<archive-name>.rescue-state.json
```

Then the user or a later desktop helper can merge them.

Alternative: use File System Access API where supported, but keep fallback download behavior.

## Suggested stages

### Stage 1: full export state

- Add state generation from existing `orderedMessages()`.
- Download state next to JSON/MD exports.
- Add date/front matter improvements to Markdown.

### Stage 2: anchor search prototype

- Add helper to compare current tail messages with saved anchors.
- Test only in memory / status panel first.
- Do not write files yet.

### Stage 3: incremental output

- Export a separate incremental patch file containing only new messages and updated state.
- Avoid overwriting old archives in-browser.

### Stage 4: true append

- Add user-selected file handles or a local helper if needed.

## Acceptance criteria

- Full export still works exactly as before.
- Full export can produce `.rescue-state.json`.
- State contains at least 5 tail anchors when there are at least 5 messages.
- If single-message timestamps are unavailable, Markdown does not fabricate them.
- Incremental search never appends when anchors are not found.
- Real private exports remain outside the repo.
