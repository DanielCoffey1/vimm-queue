# Vimm Queue for Windows

A standalone desktop queue for Vimm game-page URLs. This version uses the site's ordinary Download button in a visible, sandboxed browser window. It has no fixed queue-length limit; memory and disk space remain practical limits. It can import the visible game links from an explicitly supplied letter/number listing page. It does not follow other letters or bypass access checks.

## Start

This repository contains the app's source. To run it from source, see **Source development** below. If you have a portable Windows archive, use these steps:

1. Extract the entire VimmQueue-Windows-1.3.zip archive to a folder. Keep all its files together.
2. Open **Vimm Queue.exe**. No Node.js or Python installation is needed for the portable build.
3. Paste game-page or letter/number listing URLs, one per line, and choose **Add URLs**, or import a text file.
4. Choose a download folder and select **Start queue**.
5. If Vimm asks for a human check, complete it in the game window. **Show game page** brings that window forward.

The next item starts only after the current file completes and the delay expires. The default delay is 30 seconds; the minimum is 15 seconds. Keep the app and computer running. Pause queue lets the current file finish. Cancel current stops it and pauses the queue. A failed item can be requeued with Retry, followed by Start queue.

## Behavior and limits

- The app permits only one active transfer and one instance. It does not coordinate with other apps, computers, or people sharing your connection; avoid other simultaneous Vimm downloads.
- Game requests that receive HTTP 429/503, a recognized overload page, or a recognized server-limit alert are retried after 5, 10, 20, then 30 minutes. A longer Retry-After cooldown takes precedence. After four retries, the queue pauses for manual review. Pause queue also pauses automatic retries; resuming does not shorten the cooldown. Listing-import errors still require manual retry.
- Human checks, disabled downloads, unexpected page layouts, or format choices can require attention. If no unique Download button is found, use the game window. If a request fails to start, cancel that item, resolve the issue, and retry. The app never solves challenges or switches to alternative mirrors.
- The site's default format/version is used when a unique Download button is available. Queue a specific variant URL if the site supports it; there is no per-item format selector in this version.
- Only normal Vimm-hosted game downloads with recognized archive/ROM extensions are accepted. Unexpected hosts and file types are stopped. An executable is never run or an archive extracted.
- Duplicate URLs are skipped. Existing files are preserved using numbered filenames. Transfer completion is reported by Chromium; archive integrity/checksum verification is not included.
- Queue and settings are saved under `%APPDATA%\vimm-queue\queue.json`. Closing the app stops processing. An unfinished item is marked failed on restart and can be retried from the beginning; partial-file resumption is not implemented. Partial files may need manual cleanup.
- This is an unsigned local build, not an installer or an official Vimm product. It has no app telemetry or automatic updater; Vimm pages still load their own ordinary content.

## Validation

Ten Node tests cover URL validation, a 20,000-item queue, deduplication, restart recovery, and Retry-After parsing. An automated Electron integration test used locally served fixture pages and real Chromium downloads to verify sequential transfers, pause behavior, cooldowns, filename collision handling, 429 holds, challenge messaging, and persistence across an actual process restart.

Live game pages presented a human-verification check during development. A live Vimm game transfer has **not** been verified. Site-specific button detection may need adjustment if its post-verification page differs. The 30-second delay is an app default, not a claim about Vimm's published policy.

## Source development

Use Node.js 22.12 or newer. Dependencies and generated Windows binaries are excluded from Git.

Current limitation: a user reported an immediate overload response in the app while the same game downloaded in a regular browser. Version 1.3 handles that response and retries conservatively, but the reason for the differing server responses has not been established.

Install Node.js and run `npm install`, then `npm start` in the source folder. If a package manager skips install scripts, run `node node_modules/electron/install.js`. Run `npm test` for unit tests. Run `node package-portable.js` to create a fresh sibling VimmQueue-Windows-1.3 folder. The package script deliberately refuses to overwrite an existing build.

`main.js` owns the queue and Chromium download lifecycle; `page.js` detects the ordinary Download button; `queue.js` handles input and recovery. Remote pages run without Node integration or a preload bridge. Only the local app UI can invoke app commands.

Technical references: [Electron DownloadItem](https://www.electronjs.org/docs/latest/api/download-item), [Electron session](https://www.electronjs.org/docs/latest/api/session), [Vimm's Vault](https://vimm.net/vault).


## Listing imports (version 1.1)

Paste `https://vimm.net/vault/Xbox/A` or `https://vimm.net/vault/?p=list&system=Xbox&section=number` into the same URL box, then click Add URLs. Mixed game and listing URLs also work in text-file imports. The app opens each listing, collects visible game links and titles from its results table in page order, and skips games already queued. It reads only the supplied page; it does not follow other letters, pagination, or visit each game during import.

Import status appears below the URL box. Human checks open in the listing window. You can show, cancel, or retry an import there. Imports wait for an active game to finish, and multiple listing reads are spaced at least 15 seconds apart. Imports do not start downloads when the queue is stopped; click Start queue when ready. If a queue is already running, imported games join that queue. Pending imports persist across restarts.

The importer was checked against saved HTML from both example pages, including hidden-link exclusion, real titles, duplicate imports, challenge handling, and cancellation. Live game transfers remain unverified as described above.


## Version 1.2

Use **Open Vimm's Lair** in the top-right corner to open https://vimm.net/ in your default web browser.


## Version 1.2.1

The site button also works if index.html is opened in a regular browser. A browser preview cannot run the download queue: it now shows a launch instruction instead of a JavaScript error. To use download controls, extract all ZIP contents and launch Vimm Queue.exe.

## Version 1.3

The app now continues monitoring after clicking Download, handles overload text and recognized overload pop-ups, and displays bounded automatic retries. Unrelated image/advertising failures no longer trigger a game cooldown. The original download request, browser identity, and site checks are unchanged.

Run `npm run test:integration` for fully local Electron fixtures covering overload pages, pop-ups, Retry-After, retry limits, pause/resume, successful downloads after a retry, and restart persistence. It runs a loopback HTTP server and blocks external HTTPS requests; it does not access Vimm or download games. Tests advance only their isolated local clock deadlines to avoid waiting real minutes.
