# Privacy

**尾痕 | CatLog** is designed as a local browser toolset for archiving ChatGPT conversations and displayed thinking traces. It currently includes a desktop browser extension and a lightweight mobile userscript.

## Data flow

The current API-first tools can use these local workflows:

- **Extension API-first reading:** uses the browser's already authenticated ChatGPT session to request conversation data that the current account can access, then keeps the result in extension/page memory for export.
- **Mobile userscript API-first reading:** uses the already authenticated ChatGPT page session to read the current conversation and keeps the result in page/userscript memory until the user exports it.
- **Legacy DOM rescue:** reads text rendered in the active ChatGPT page and can store captured messages in browser-local IndexedDB for incremental rescue.

The tools:

- do not require the user to paste an OpenAI API key;
- do not intentionally send conversation content to a separate third-party archival server;
- download exports directly through the browser;
- do not persist ChatGPT access tokens or account headers into exported files.

Runtime authentication information may be read from the current ChatGPT session only for the purpose of making the conversation request.

The Mobile userscript itself is distributed from this public GitHub repository. Its `@updateURL` / `@downloadURL` point to the repository's Raw file; this concerns script-code updates, not conversation-data upload.

## Sensitive files

Treat every exported file as private unless you have reviewed it manually.

This includes:

- readable Markdown exports;
- raw conversation JSON;
- displayed-thinking Markdown / TXT exports;
- thinking probe JSON;
- incremental patch files;
- combined-full archives;
- `.rescue-state.json` files.

Raw JSON and diagnostic exports may contain conversation IDs, project metadata, message metadata, branch structure, timestamps, model metadata, request-related fields, or other account/conversation context returned by ChatGPT.

A rescue-state file may contain conversation title, source URL, conversation ID, message counts, tail-anchor hashes, and short tail-message previews used for diagnostics. It is therefore not anonymous metadata.

Do not commit real conversations, raw JSON, thinking probes, conversation IDs, account IDs, tokens, screenshots containing private chat text, or diagnostic dumps to the public repository.

## Local cache

Legacy DOM captures may remain in browser-local IndexedDB until you clear the extension cache, clear browser site data, remove the browser profile, or otherwise delete local browser data.

API-first conversation data is intended to remain in memory for the current page session and to be written only when the user explicitly exports a file.

Custom Mobile human / AI export labels are stored in browser localStorage. Leaving those fields blank falls back to `User / Assistant` without storing the defaults.

## External service boundary

尾痕 | CatLog communicates with ChatGPT itself because that is the source of the conversation being archived. It does not add a separate archival server or analytics service.

ChatGPT's own handling of account/session/conversation data is governed by the service itself and is outside these tools' control.
