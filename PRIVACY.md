# Privacy

CatChat Rescuer is designed as a local browser extension for archiving ChatGPT conversations and displayed thinking traces.

## Data flow

The current experimental API-first version can use two local workflows:

- **API-first reading:** uses the browser's already authenticated ChatGPT session to request conversation data that the current account can access, then keeps the result in extension/page memory for export.
- **Legacy DOM rescue:** reads text rendered in the active ChatGPT page and can store captured messages in browser-local IndexedDB for incremental rescue.

The extension:

- does not require the user to paste an OpenAI API key;
- does not intentionally send conversation content to a third-party server;
- downloads exports directly through the browser;
- does not persist ChatGPT access tokens or account headers into exported files.

Runtime authentication information may be read from the current ChatGPT session only for the purpose of making the conversation request.

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

## External service boundary

CatChat Rescuer communicates with ChatGPT itself because that is the source of the conversation being archived. It does not add a separate archival server or analytics service.

ChatGPT's own handling of account/session/conversation data is governed by the service itself and is outside this extension's control.
