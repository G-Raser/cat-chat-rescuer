# Current code inventory｜CatChat Rescuer v0.3.6

This document records the current repository shape before implementing incremental append. It is intentionally descriptive and should not require code changes.

## Repository files

Current uploaded files:

- `manifest.json`
- `background.js`
- `content.js`
- `style.css`
- `README.md`
- `AGENTS.md`
- `CatChat_Rescuer_Codex_prompt.md`
- `.gitignore`
- `CHANGELOG.md`

## Extension entry points

### `manifest.json`

- Manifest version: 3.
- Extension name: `CatChat Rescuer Clean`.
- Current version: `0.3.6`.
- Permissions: `storage`, `scripting`, `activeTab`.
- Host permissions:
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`
- Background service worker: `background.js`.
- Content script: `content.js`.
- Style file: `style.css`.
- Content script runs at `document_idle`.

### `background.js`

`background.js` only handles extension action clicks. It checks the active tab URL and injects `style.css` plus `content.js` into ChatGPT pages.

This file is not the right place for export logic.

### `content.js`

`content.js` contains the active exporter implementation.

Important constants:

- `VERSION = "0.3.6-syntax-hotfix"`
- `PANEL_ID = "catchat-rescuer-v030-panel"`
- `DB_NAME = "CatChatRescuerDB_v0_3_6_syntax_hotfix"`
- `STORE = "conversations"`

Important state fields:

- `id`: conversation id from `/c/<id>` or fallback `unknown-<hash>`.
- `title`: derived from `document.title`.
- `url`: `location.href`.
- `map`: message map keyed by message id.
- `order`: export ordering list.
- `captureSeq`: capture order counter.
- `speedMode`, `exportOrder`, timer fields, auto-scroll fields.

## Capture logic

### Message extraction

Current extraction happens in `extractMessagesFromDOM()`.

Selector:

```js
[data-message-author-role]
```

For each node:

- role comes from `data-message-author-role`.
- text comes from `node.innerText` after `safeText()`.
- message id comes from closest `[data-message-id]`; fallback is `${role}-${hashText(text)}`.
- each captured message receives `capturedAt: new Date().toISOString()`.

Current message shape is roughly:

```js
{
  id,
  role,
  text,
  capturedAt,
  captureSeq
}
```

### Merge logic

`mergeVisibleBatch(batch)` adds new messages into `state.map` and merges ids into `state.order`.

Ordering is based on visible batch anchors and current scroll direction:

- If no known anchor exists and last scroll direction is `up`, prepend.
- If no known anchor exists and last scroll direction is not `up`, append.
- If known anchors exist, insert before/after nearby known ids.

### Auto-scroll

`autoScrollUp()` is the full export helper. It:

1. resets and starts timer;
2. repeatedly captures visible messages;
3. scrolls upward by one configured step;
4. stops when it reaches top / no movement / max steps;
5. captures once more;
6. saves the IndexedDB record;
7. updates panel status.

Do not rewrite this logic for v0.3.7 unless absolutely necessary.

## Persistence

Current persistence uses IndexedDB:

- database: `CatChatRescuerDB_v0_3_6_syntax_hotfix`
- object store: `conversations`
- key path: `id`

`saveRecord()` stores:

```js
{
  id,
  exporterVersion,
  title,
  url,
  updatedAt,
  messageCount,
  order,
  captureSeq,
  exportOrder,
  captureStartedAtMs,
  totalElapsedMs,
  timerRunning,
  speedMode,
  lastAutoEnded,
  messages
}
```

`loadRecord()` reloads the current conversation cache when the panel initializes.

## Export logic

### JSON export

`exportJSON()`:

- calls `grabVisible("export")`;
- gets ordered messages;
- wraps them with metadata;
- downloads a JSON file.

Current filename pattern:

```text
catchat-v030-<conversationId>-<exportedAt>.json
```

Current JSON metadata includes:

- `exporterVersion`
- `exportedAt`
- `conversationId`
- `title`
- `url`
- `messageCount`
- `rawCapturedCount`
- `exportOrder`
- `exportOrderLabel`
- `totalElapsed`
- `lastAutoDuration`
- `speedMode`
- `speedLabel`
- `timerMode`
- `messages`

### Markdown export

`exportMarkdown()`:

- calls `grabVisible("export")`;
- gets ordered messages;
- writes a Markdown title and metadata list;
- writes each message as `## 主人｜N` or `## 猫猫｜N`;
- downloads a Markdown file.

Current filename pattern:

```text
catchat-v030-<conversationId>-<exportedAt>.md
```

## UI buttons

Panel buttons currently include:

- `抓当前屏`
- `监听：关/开`
- `速度：...`
- `温和上滚`
- `停止上滚`
- `暂停计时`
- `顺序：时间正序/捕获序`
- `导出 JSON`
- `导出 MD`
- `重置计时`
- `清空插件缓存`

## Best first implementation target

The smallest safe v0.3.7 patch should probably add helper functions in `content.js` near the export functions:

- `normalizeForAnchor(text)`
- `anchorHash(message)`
- `buildRescueState(messages, exportedAt)`
- `exportRescueState()` or integrate state download into both full exports
- optional: `exportBundle()` to download MD + JSON + state in one action later

The first patch can generate `.rescue-state.json` after full export before attempting full incremental append.

## Suggested staged plan

1. Add `.rescue-state.json` generation from existing ordered messages.
2. Add Markdown front matter / date fields without changing message capture.
3. Add fake fixture tests for anchor hashing as plain JS functions if feasible.
4. Add incremental append UI only after state generation is stable.

## Risks

- Current DOM extraction only captures text and roles, not rich assets.
- Fallback ids based on text hash can collide for repeated short messages.
- `capturedAt` is capture time, not original message time.
- ChatGPT long windows can have ghost tails / multi-device desync, so anchor windows must not rely on only the final message.
