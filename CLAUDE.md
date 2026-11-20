# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Starlog (formerly SnapSort; internal IDs such as `app.snapsort.mobile`, storage keys and the backup format still say `snapsort` and must stay that way): an offline-first Android organizer for receipt images and screenshots. Angular 22 + Ionic 9 + Capacitor 8. Everything runs on the device; there is no backend.

## Commands

```bash
npm start                         # dev server (includes browser OCR files under /ocr)
npm run check                     # typecheck + tests + production build — the same gates as CI (.github/workflows/ci.yml)
npm test -- --watch=false         # Vitest via `ng test`
npm test -- --watch=false --include src/app/core/ocr/receipt-parser.spec.ts   # one spec file
npm run typecheck
npm run build:production          # Android web bundle (no Tesseract files)
npm run build:web                 # hosted browser demo as an installable PWA (adds Tesseract under ocr/, service worker, manifest)
npm run cap:sync                  # copy build into android/; rerun after plugin changes
python -I scripts/draw-icons.py . # regenerate all app icons, favicon and Android splash from the logo (needs Pillow)
node scripts/ui-audit.mjs <chrome.exe> <out-dir> <url>   # headless-Chrome screenshots at 375 px + tap-target/text-size audit (usage in file)
```

Web hosting: Netlify site `starlog-receipts` (https://starlog-receipts.netlify.app; renamed from `snapsort-receipts`, which no longer resolves). Deploy by hand after `npm run build:web` with `npx netlify-cli deploy --prod --no-build --dir dist/snapsort/browser`; the site is not linked to GitHub. Any host needs HTTPS and an SPA rewrite to `/index.html`. On this PC, `curl` to HTTPS sites needs `--ssl-no-revoke`.

Android (no Android Studio needed). JDK 21 is at `C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot` and is not on PATH, so set `JAVA_HOME` first:

```bash
cd android && ./gradlew assembleDebug      # or assembleRelease / bundleRelease
```

Release builds are only signed when `android/keystore.properties` exists (gitignored; keys `storeFile`, `storePassword`, `keyAlias`, `keyPassword`). Without it Gradle silently produces unsigned output. Bump `versionCode`/`versionName` in `android/app/build.gradle` for each Play upload.

## Architecture

- **Two platforms, one service layer.** Services in `src/app/core/services/` branch on `Capacitor.isNativePlatform()`: Android uses SQLite (`database.service.ts`) and app-private files via `@capacitor/filesystem` (`image-storage.service.ts`). The browser fallback uses localStorage for metadata and IndexedDB for images. Any storage change must cover both paths.
- **State** lives in signal-based stores (`item.store.ts`, `category.store.ts`, `preferences.store.ts`, `business-profile.store.ts`). Pages read from stores rather than caching data: Ionic keeps tab pages alive, so cached page state goes stale. Library filters are kept in the URL for the same reason.
- **Schema migrations** are in `database.service.ts`: a `schema_migrations` table plus add-if-missing `ALTER TABLE ADD COLUMN`. Keep migrations additive. Backup restore must still accept items that lack newer fields.
- **Images:** each item stores an image key. Saving also writes a 480 px thumbnail at `thumbs/<id>.jpg` (`core/utils/thumbnail.ts`). Use `injectImageUrl()` (`image-url.ts`) for blob URLs so they get revoked.
- **Receipt reading:** `core/ocr/text-recognition.service.ts` uses ML Kit on Android and Tesseract.js in the browser. `receipt-parser.ts` turns the text into fields; it is pure and well tested, so put parsing changes there with specs.
- **Auto-capture:** native Java in `android/app/src/main/java/app/snapsort/mobile/`. `NotificationCaptureService` filters payment notifications into `CaptureStore`, and `SnapSortCapturePlugin` exposes the queue, screenshots and share intents. The TypeScript side is `core/capture/`: `capture-plugin.ts` is the bridge, `transaction-parser.ts` parses, and `capture.service.ts` files receipts and acks the queue only after saving.
- **Backup:** `core/backup/` writes and reads a ZIP (fflate, streamed) with `manifest.json` checksums. Restore validates the whole archive before writing anything, and merges without overwriting existing items.
- **PWA (web build only):** `angular.json` defines `PWA` as `false` except in the `web` configuration, which also adds `ngsw-config.json` (Angular service worker) and the `web/` folder (manifest, icons). `main.ts` registers the worker and manifest link behind `if (PWA)`, so the Android bundle contains none of it. Fonts and app code are cached on install; OCR files only when first used.
- **Dates:** an item's date is its purchase date, falling back to the day it was saved: `itemDateKey()` / `itemDate()` in `core/utils/item-display.ts`. Cards, Library sorting and month groups, Home and Insights all use it; show `createdAt` only where the UI says "Saved".
- **Receipt maker:** `core/receipts/` renders receipt PNGs for purchases with no receipt and for sales (`flow: 'income'`; sales never count as spending).
- **What counts as spending:** `countsAsSpending()` in `item-display.ts` (receipt with an amount, not `flow: 'income'`, not the `Transfers` category). Every total (Home, Library month headers, Insights) goes through it; Insights shows money in and transfers separately. Transfers are a category, not a third `flow` value, because the SQLite `flow` column has a `CHECK (expense, income)` constraint.
- **Unsaved forms:** Add, Edit and the receipt maker implement `confirmLeave()` and their routes use the `confirmDiscard` guard (`core/utils/confirm-discard.ts`), so Cancel, the back arrow and Android back ask before discarding input.

## Constraints

- **Bundle:** eager code (`app.ts`, `app.config.ts`) must not import the `@ionic/angular` root barrel, or every Ionic component moves into `main`. `provideIonic()` in `app.config.ts` mirrors `provideIonicAngular`; re-check it on Ionic upgrades. Budgets are in `angular.json` (initial 1.2 MB warning), and component styles are capped at 4 kB, so shared styles go in the `src/styles/` partials.
- **Motion** must be gated behind `prefers-reduced-motion: no-preference`.
- **Look (Starlog):** the brand stays green; stars and comets use `--sn-star` (jade in light, mint in dark) and the logo tile `--sn-night` (deep green), all in `src/styles/_tokens.scss`. The logo is `shared/star-mark.component.ts`; app icons come from `scripts/draw-icons.py` with the same geometry, so change both together. Decorative stars stay clear of headings and text. UI minimums: 48 px tap targets (44 px for segmented controls), no text under 12 px.
- **Privacy:** add no network SDKs and no logging of receipt or notification content without a Play Data safety review. Android backup and device transfer are disabled on purpose (`allowBackup="false"` plus `data_extraction_rules.xml`).
- **Currency** defaults to PHP. Money parsing treats only a comma as a thousands separator.

Git: work on a branch, open a PR and merge to `main` (remote `bitwindamountains/receipt-organizer`). GitHub Actions has not run on this repo yet, so run `npm run check` locally before merging.

Status, what's next and open release blockers: `docs/PRODUCTION_STATUS.md` (start with "Where things stand"). Scope and release gates: `PRODUCTION_PLAN.md`.
