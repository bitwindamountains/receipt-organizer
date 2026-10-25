# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

SnapSort: an offline-first Android organizer for receipt images and screenshots. Angular 22 + Ionic 9 + Capacitor 8. Everything runs on the device; there is no backend.

## Commands

```bash
npm start                         # dev server (includes browser OCR files under /ocr)
npm run check                     # typecheck + tests + production build — the same gates as CI (.github/workflows/ci.yml)
npm test -- --watch=false         # Vitest via `ng test`
npm test -- --watch=false --include src/app/core/ocr/receipt-parser.spec.ts   # one spec file
npm run typecheck
npm run build:production          # Android web bundle (no Tesseract files)
npm run build:web                 # hosted browser demo (adds Tesseract under ocr/)
npm run cap:sync                  # copy build into android/; rerun after plugin changes
```

Android (no Android Studio needed). JDK 21 is at `C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot` and is not on PATH, so set `JAVA_HOME` first:

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
- **Receipt maker:** `core/receipts/` renders receipt PNGs for purchases with no receipt and for sales (`flow: 'income'`; sales never count as spending).

## Constraints

- **Bundle:** eager code (`app.ts`, `app.config.ts`) must not import the `@ionic/angular` root barrel, or every Ionic component moves into `main`. `provideIonic()` in `app.config.ts` mirrors `provideIonicAngular`; re-check it on Ionic upgrades. Budgets are in `angular.json` (initial 1.2 MB warning), and component styles are capped at 4 kB, so shared styles go in the `src/styles/` partials.
- **Motion** must be gated behind `prefers-reduced-motion: no-preference`.
- **Privacy:** add no network SDKs and no logging of receipt or notification content without a Play Data safety review. Android backup and device transfer are disabled on purpose (`allowBackup="false"` plus `data_extraction_rules.xml`).
- **Currency** defaults to PHP. Money parsing treats only a comma as a thousands separator.

Status and open release blockers: `docs/PRODUCTION_STATUS.md`. Scope and release gates: `PRODUCTION_PLAN.md`.
