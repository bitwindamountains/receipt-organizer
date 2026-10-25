# Production Status

Updated: October 25, 2026 - release build

## Release build and dependency audit (October 25, 2026)

- **Release hardening merged** (PR #2): device transfer and cloud backup are blocked, Erase everything removes all files, and receipt totals no longer misread space-separated numbers.
- **Dependencies** (PR #3): Angular 22.2.3, `@angular/build`/`@angular/cli` 22.2.4, fflate 0.8.3. `npm audit --omit=dev` reports 0 vulnerabilities. Two dev-only findings remain: vite 8.3.0, which only affects the dev server and is pinned exactly by `@angular/build`, and uuid, which comes through the Capacitor CLI's iOS tooling (fixing it needs `--force`, which downgrades the CLI).
- **Builds:** `npm run check` passes (59 tests). With JDK 21 (`C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot`, set `JAVA_HOME`), `assembleRelease` builds a 56 MB APK and `bundleRelease` builds a 30 MB AAB, both version 0.2.0 / `versionCode 2`. Most of the APK is the ML Kit OCR library, once per ABI; Play's per-ABI splits should make the download much smaller.
- **Both builds are unsigned:** `android/keystore.properties` does not exist yet, and Play only accepts a signed AAB.
- **CI:** `.github/workflows/ci.yml` exists, but no checks ran on PR #3. Check that Actions is enabled for the repository.
- **Release blockers still open:** upload key and a signed AAB; install and smoke test on a physical Android 13+ device; real GCash/Maya/bank notification wording; Play declarations for notification access and `READ_MEDIA_IMAGES`; Data safety, content rating, store assets, and a hosted privacy policy; internal track, then closed beta.

## Backup and restore (October 17, 2026)

- **Export** (Settings > Your data) writes `snapsort-backup-YYYY-MM-DD.zip`: `categories.json`, every item's image under its `images/` key, `items.json`, and a final `manifest.json` (format, version 1, app version, SHA-256 of every entry). It is streamed one image at a time with `fflate` and handed to the Android share sheet (save to Files or Drive) or downloaded in the browser. Items whose image file is missing are left out and counted.
- **Restore** picks a file, then verifies the whole archive (format, version, entry names, every record, every checksum) before changing anything. It merges: items whose id or image already exists are skipped, never overwritten. It reports imported, skipped, and failed counts. Thumbnails are rebuilt on save.
- Not built: "replace everything" with a recovery point (erase then restore covers it), and a free-space check before restore.
- Device check needed: export and restore of a large library on Android (share sheet targets, file picker, memory).

## Auto-capture (October 2, 2026)

- **Payment notifications (Android):** opt-in notification capture turns GCash, Maya, and bank payment notifications into receipts automatically. Each receipt gets a drawn receipt image, is tagged `auto-captured` and with the provider, and is de-duplicated by reference number (or amount and minute). Received money is recorded as income.
- **Screenshot inbox:** finds new payment screenshots (Android gallery, or a chosen folder in Chromium browsers), reads them, and offers them on `/inbox` with Add, Skip, and Add all. Screenshots that match an existing receipt by amount and date are flagged and left out of Add all.
- **Share into SnapSort:** an Android share target (`SEND`/`SEND_MULTIPLE` `image/*`) copies shared images into the cache and opens them on the Add page with auto-fill. Browser equivalent: paste or drop on the Add page.
- **Home:** an "Auto-captured" card and an inbox teaser. Insights renames income to "Money in" (sales plus transfers received).
- **Native:** `SnapSortCapturePlugin`, `NotificationCaptureService`, and `CaptureStore` (Java). `assembleDebug` succeeds with JDK 21 and SDK 36.
- **Release blockers for this feature:**
  - verify the notification wording of real GCash, Maya, and bank apps and tune `transaction-parser.ts` against it;
  - test on Android 13+ (notification access flow, partial photo access on Android 14);
  - complete the Play declarations for notification access and `READ_MEDIA_IMAGES`.

## Smart features (October 1, 2026)

All run on the device with no servers, accounts, or paid APIs.

- **Auto-sort:** picking one image (or tapping Auto-fill) reads its text and fills in type, merchant, total, currency, date, and category, without overwriting fields the user edited; Undo restores them. Android uses ML Kit (`@capacitor-mlkit/text-recognition`, bundled Latin model, adds a few MB). The browser uses Tesseract.js from `/ocr`, included only by `npm start` and `npm run build:web`. Parsing lives in `core/ocr/receipt-parser.ts` (tested), and categories learn from past merchants. It can be switched off in Settings.
- **Receipt maker** (`/receipt/new`, linked from Add): "I bought" records a purchase without a receipt; "I sold" issues a branded receipt to a customer, with business details, brand colour, and numbering remembered. Saving renders a PNG and files it; sales are `flow: 'income'` and never count as spending.
- **Insights tab:** month switcher, hero spend with change vs last month, average and biggest receipt, sales, a six-month column chart (with tooltips and a table view), spending by category, and top places. Chart colours were contrast-checked in both themes.
- **Warranty reminders:** an optional deadline on receipts; Android notifications a week before and on the day (inexact alarms; `SCHEDULE_EXACT_ALARM` is removed from the manifest); the Home "ending soon" list and a details countdown work everywhere.
- **Data model:** `flow` and `warrantyUntil` were added (SQLite columns via add-if-missing, schema version 2).
- **Fix:** purchase dates showed one day early east of UTC (date pipe with a UTC zone on date-only strings).

Device checks still needed: ML Kit accuracy on real thermal receipts, notification permission and delivery on Android 13+, and APK size with the ML Kit model.

## Performance and import improvements (October 1, 2026)

- Startup bundle cut from 1.16 MB to 505 kB. Eager code (`app.ts`, `app.config.ts`) must not import the `@ionic/angular` root barrel, or esbuild moves every lazily used Ionic component into `main`. `provideIonic()` in `app.config.ts` mirrors `provideIonicAngular`; re-check it when upgrading Ionic.
- Multi-image import: Add accepts up to 10 images with a filmstrip, shared details, save progress, and retry for images that fail. Editing is still one image.
- Grid thumbnails: saving writes a 480 px JPEG to `thumbs/<id>.jpg`; cards load it, and older items get one backfilled on first display. Deleting removes it. The browser fallback reuses one IndexedDB connection.
- Library groups date-sorted results by month under sticky headers with item counts and receipt totals.

## Design and motion pass (October 1, 2026)

- Design system moved to global SCSS partials in `src/styles/` (`_tokens`, `_base`, `_motion`, `_ambient`, `_shell`, `_components`, `_pages`); Ionic CSS and the font load from `angular.json`. Keep shared UI there so components stay under the 4 kB style budget.
- Light and dark themes follow the OS (Ionic `dark.system` palette plus brand overrides). Text pairs meet 4.5:1 contrast.
- Inter Variable is bundled via `@fontsource-variable/inter`; there is no runtime font request.
- Ambient background (`app-ambient-backdrop`): drifting receipt and screenshot silhouettes, soft brand light, a dotted surface, and an occasional scan line. Used on onboarding (`full`) and the Home hero.
- Onboarding hero animates the product idea: cards are dealt onto a stack, scanned, then tagged.
- Floating glass tab dock with the Add button beside it; the Add button pulses while the library is empty.
- Home: greeting, count-up stat tiles, a "printed receipt" summary of this month's receipt total, accessible category chips, skeleton loading, and staggered card entrances.
- Details: blurred ambient copy of the image, bottom sheet, receipt-style summary, full-screen viewer with tap-to-zoom, and a favourite burst.
- Add: illustrated picker, sliding type toggle, a scan sweep on the chosen image, and expanding receipt fields. The last-used currency is remembered.
- All motion is gated behind `prefers-reduced-motion: no-preference`; with reduced motion, everything renders in its final static state.

Fixes in the same pass:

- Library ignored Home shortcuts (Receipts, Favorites, categories) after its first visit, because Ionic caches tab pages. Filters now follow the URL and are written back to it.
- Details showed stale data after Edit, because Ionic reused the cached page. It now derives the item from the store.
- Details image overflowed underneath the text, and the "View full image" button did nothing.
- Saving from Add after onboarding or a deep link called `location.back()` with no history and left the app. It now uses `injectGoBack()`. Deleting from Details now returns to the previous screen instead of always Home.
- Item cards could show the wrong image when lookups resolved out of order, and leaked blob URLs after destroy. Details and Edit leaked blob URLs too (`injectImageUrl()` now handles this).
- Negative amounts were accepted; they are now validated with an error message.
- Search now matches every word across fields ("jollibee lunch"). Title sort uses the displayed title, so untitled items no longer sort first.
- Erase all data now also clears custom categories. Concurrent library loads share one read.

## Completed in the first production slice

- Angular 22, Ionic 9, and Capacitor 8 project foundation
- Responsive first-run, Home, Library, Add, Details, Edit, and Settings screens
- Android SQLite repository and schema v1
- App-private Android image copies and browser IndexedDB development fallback
- Screenshot/receipt metadata, tags, search, type filters, sharing, and delete with undo
- Functional Home search, library summary, popular-category shortcuts, and responsive navigation
- Combined Library filters for query, type, category, favorites, and sort order
- Persistent favorites with an upgrade-safe SQLite schema migration
- Custom category creation/removal with safeguards for categories that are in use
- Edit-in-place image replacement and a confirmed erase-all-data privacy control
- Android API 36 project with minimized manifest permissions
- Unit tests, type checking, production web build, and GitHub CI
- Draft privacy policy and implementation/runbook documentation

## Release blockers

- Implement and test versioned export/restore before any public rollout
- Add process-death/staging reconciliation for large imports (thumbnails and multi-image import are done; an interrupted batch can still leave orphaned files)
- Complete category management (rename and merge)
- Measure thumbnail generation time for large photos on a low-end Android device
- Replace privacy-policy placeholders and host the policy on a stable HTTPS URL
- Install Android Studio/JDK/SDK locally; build and smoke-test a signed AAB on physical devices
- Run accessibility, low-storage, process-recreation, and upgrade migration tests
- Create store assets and complete Play Console declarations

## Verification recorded

- `npm run typecheck`: pass
- `npm test -- --watch=false`: 40 tests pass (October 2, 2026)
- `npm run build:production`: pass; initial bundle 532 kB (October 2, 2026)
- `./gradlew assembleDebug` (JDK 21, SDK 36): pass (October 2, 2026)
- `npx cap sync android`: 6 plugins registered, including ML Kit text recognition and local notifications (October 1, 2026)
- Capacitor Android platform sync: pass; API 36 / minimum API 24
- `npm audit --omit=dev`: zero production dependency vulnerabilities
- Browser HTTP smoke check: localhost returned 200; visual automation unavailable in this session
- Signed Android build: not yet attempted; debug builds work with a portable JDK 21

The development-only dependency tree currently reports three moderate findings through Capacitor CLI's `xcode`/`uuid` chain. Do not force-downgrade the CLI; reassess when the upstream Capacitor patch is available.
