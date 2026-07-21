# Privacy

CatChat Rescuer is designed as a local browser extension.

## Data flow

The current version:

- reads text already rendered in the active ChatGPT page;
- stores captured messages in the browser's local IndexedDB;
- exports files through normal browser downloads;
- does not require an OpenAI API key;
- does not intentionally send conversation content to a third-party server.

## Sensitive files

Treat every exported file as private unless you have reviewed it manually.

This includes:

- Markdown exports;
- JSON exports;
- incremental patch files;
- combined-full archives;
- `.rescue-state.json` files.

A rescue-state file may contain:

- conversation title;
- source URL;
- conversation ID;
- message counts;
- tail-anchor hashes;
- short tail-message previews used for diagnostics.

It is therefore not anonymous metadata.

## Local cache

Captured messages may remain in browser-local storage until you clear the extension cache, clear browser site data, remove the browser profile, or otherwise delete local browser data.

Do not rely on the local cache as your only backup. Export important conversations to files.

## Repository hygiene

The repository `.gitignore` excludes common CatChat export names and archive folders, but users should still review `git status` before every public commit.

Never commit real conversation exports, state files, screenshots, attachments, or official ChatGPT data-export packages to a public repository.

## Third-party notice

CatChat Rescuer is an independent, unofficial project and is not affiliated with OpenAI.
