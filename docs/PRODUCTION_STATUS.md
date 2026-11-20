# Production Status

Updated: November 21, 2026 - version 0.4.5 shipped (signed APK on GitHub Releases, web on Netlify); UX critique fixes and dark mode pass

## Where things stand (end of November 21, 2026) - start here next session

- **`main`** has everything through PR #22. Working tree clean apart from the untracked `.impeccable/` folder (detector ignore values and the critique report; fine to leave untracked).
- **Version 0.4.5** (`versionCode 9`) everywhere: `android/app/build.gradle`, `package.json`, `APP_VERSION`. Bump all three for the next release.
- **Android:** signed with the upload key (`android/starlog-upload.jks`, alias `upload`; password in gitignored `android/keystore.properties`; back both up off this PC). `assembleRelease` gives the signed APK, `bundleRelease` the AAB. Check the APK with `apksigner verify` (build-tools 36.0.0), not `jarsigner`. Certificate SHA-256 starts `9557`, ends `fb77`.
- **Distribution (free, no Play account):** signed APK attached to GitHub Releases (`gh release create vX.Y.Z ... Starlog-X.Y.Z.apk`); v0.4.0-v0.4.5 exist, v0.4.5 is Latest. Link to share: https://github.com/bitwindamountains/receipt-organizer/releases/latest
- **Web:** https://starlog-receipts.netlify.app is public and on 0.4.5. Deploy: `npm run build:web` then `npx -y netlify-cli deploy --prod --no-build --dir dist/snapsort/browser`. `npm run check` overwrites `dist/` with the Android build, so always run `build:web` right before deploying. The app reloads itself when a new deploy is ready.
- **Design review:** `/impeccable critique` scored 26/40 (report in `.impeccable/critique/`); all of its findings were fixed in 0.4.4 and dark mode in 0.4.5. Re-running it would measure progress.
- **CI:** GitHub Actions has never run on this repo; merges rely on local `npm run check`.
- **Never tested on a real phone** (most important gap): share a screenshot into Starlog, Android back on a half-filled form (should ask before discarding), real GCash/Maya notification capture, screenshot inbox, native share sheet, warranty reminder, dark mode on device.
- **Next:**
  1. The user installs 0.4.5 from the Releases link and reports problems with screenshots; fix those first.
  2. User-side housekeeping: turn off Netlify's "Powered by Netlify" badge (Project configuration > General; it covers the tabs on phones), back up the keystore and password, IPOPHL trademark search for "Starlog".
  3. Optional: re-run `/impeccable critique`; remaining blockers below (category rename/merge, large-import recovery, TalkBack/large-font tests).
- **Ideas not built:** a comet from Save to the Library tab, constellation-style monthly chart, star-themed empty Library, renaming Favorites to "Starred".
- **Tools:** `scripts/draw-icons.py` regenerates every app icon and splash from the logo geometry. `scripts/ui-audit.mjs` screenshots each screen at 375 px (light, dark, landscape) with headless Chrome and reports small tap targets, text under 12 px and horizontal overflow.

## Versions 0.4.0-0.4.5 (November 20-21, 2026)

- **0.4.0:** store name "Starlog: Receipt Organizer"; browser receipt reading fixed (Tesseract is CommonJS: `tesseract.default ?? tesseract`); better reading of GCash and Google Play screenshots (money in, wallet tags, PHP for GCash/Maya, masked names); privacy policy moved to `web/privacy-policy.html` (contact: GitHub Issues).
- **0.4.1-0.4.2:** totals visibly update after saving: Insights opens on the month of the newest receipt, Home shows an all-time line, the save toast has "See <month>" (`/insights?month=`). Add page now loads the store (suggestions and duplicate check were empty when Add was the first screen).
- **0.4.3:** Add flow: form appears after an image is picked, sticky save bar with "Save & add next", duplicate warning with "Discard this one", merchant suggestions, money in/out select, Transfers category (not counted as spending; `countsAsSpending()`), "Needs details" tile opening `/library?review=true`, Library month filter and more sorts, search matches amounts.
- **0.4.4:** critique fixes: discard guard on Add/Edit/receipt maker (`confirmDiscard`), 10 s undo on delete, Erase alert offers "Export backup first", sentence-case dialog buttons, 48 px back/toolbar buttons, Insights rows link to Library, medium text contrast `#5b6965`.
- **0.4.5:** dark mode: raised `#22302c` alerts, popovers and toasts with borders, readable error red `#ff6b74` (`--sn-danger-ink`), readable select-dialog labels, helper text via `helperText` (`ion-note slot="helper"` rendered 0x0).

## Renamed to Starlog (November 20, 2026)

- Every visible name is now Starlog: Android app label, page title, web manifest, screens, receipt footer ("Made with Starlog"), backup file name (`starlog-backup-YYYY-MM-DD.zip`), privacy policy.
- Internal IDs keep `snapsort` on purpose: package `app.snapsort.mobile` (Play treats a new ID as a new app), storage keys and SQLite name (existing data), backup format `snapsort-backup` (old backups still restore), the `SnapSortCapture` plugin.
- New look: star-and-comet logo (`shared/star-mark.component.ts`), jade/mint `--sn-star` tokens (a lighter step of the brand green), deep-green night-sky app icons (web, Android launcher, adaptive icon, splash), twinkling stars and a passing comet in the ambient backdrop, a comet off the onboarding stack, star-shaped favorite sparkles, a glinting logo. All motion is behind reduced-motion.
- Icons are drawn by `scripts/draw-icons.py` from the logo geometry; the old placeholder icon is gone.
- UI review fixes (same day): cards, Library sort and month groups use the receipt's purchase date (`itemDateKey`/`itemDate` in `item-display.ts`, falling back to the save date); a near-opaque dock with a fade above it; 48 px touch targets (category chips, custom-category chips; 44 px segment and Table toggle); no text under 12 px; stars kept to the edges away from headings; short wide receipts shown whole instead of side-cropped; a slim label-less dock in landscape; equal-width tabs so the selected pill is centred.
- Checked with headless Chrome at 375 px, light, dark and landscape. Not yet checked on a device. Check the Play Store and trademarks for the name before release.

## Installable web version (November 20, 2026)

- `npm run build:web` now produces a PWA: web manifest, 192/512 px icons (`web/`), and the Angular service worker (`ngsw-config.json`). App code and fonts are cached on first visit; Tesseract files under `/ocr` only once reading is used.
- Android is unchanged: the code sits behind a compile-time `PWA` flag that is `false` outside the `web` configuration, and the Android build ships no worker, manifest or icons. Initial bundle 544.39 kB, as before.
- Verified in Chromium: the worker activates and controls the page, and after stopping the server the app reloaded and loaded demo receipts offline.
- Hosting: needs HTTPS and a rewrite of unknown paths to `/index.html`, so a first visit to a deep link such as `/library` works before the worker is installed.
- Web limits: no notification auto-capture, screenshot inbox only in Chromium (folder picker), data lives in browser storage (localStorage for item details, about 5 MB), and clearing site data erases it.

## Demo mode (November 20, 2026)

- **Demo receipts:** onboarding's "Explore with demo receipts" and Settings > Your data > Load/Remove demo receipts. Twelve PHP receipts over five months (purchases, one sale, favourites, two warranties), drawn by the receipt renderer and tagged `demo receipt`. Remove deletes only items with that tag and their images. A load that fails partway is undone. Demo items never schedule warranty notifications.
- **Version:** 0.3.0 / `versionCode 3` (`build.gradle`, `package.json`, `APP_VERSION`).
- Device check needed: demo load time on a low-end Android phone (12 canvas renders plus thumbnails).

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
- **Share into Starlog:** an Android share target (`SEND`/`SEND_MULTIPLE` `image/*`) copies shared images into the cache and opens them on the Add page with auto-fill. Browser equivalent: paste or drop on the Add page.
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

- Done: upload key and signed builds (0.4.0+). Still open: install and smoke-test on a physical Android 13+ device (rename, icons, demo load time, animations)
- Name: keep Starlog with a descriptor. Play title "Starlog: Receipt Organizer" (web manifest `name` matches; launcher label and `short_name` stay "Starlog"). Another "StarLog" exists (an astronomy log app, `jvc.starlog`, last updated 2019) and US STARLOG marks are mostly dead and in unrelated classes; still search IPOPHL (Philippines) before launch.
- Play Console: notification-listener and `READ_MEDIA_IMAGES` declarations (photo picker may be required), Data safety, content rating, store assets
- Privacy policy: `web/privacy-policy.html`, published with the web build at https://starlog-receipts.netlify.app/privacy-policy.html. Contact is GitHub Issues; Google Play would want an email instead.
- Real GCash/Maya/bank notification wording for auto-capture
- Add process-death/staging reconciliation for large imports (an interrupted batch can still leave orphaned files)
- Complete category management (rename and merge)
- Measure thumbnail generation and demo load time on a low-end Android device
- Run accessibility (TalkBack, largest font), low-storage, process-recreation, and upgrade migration tests
- Done since this list was written: versioned export/restore, local JDK/SDK builds, a real app icon

## Verification recorded

- `npm run check`: typecheck, 65 tests, production build pass (November 20, 2026, after PR #6)

- `npm run typecheck`: pass
- `npm test -- --watch=false`: 40 tests pass (October 2, 2026)
- `npm run build:production`: pass; initial bundle 532 kB (October 2, 2026)
- `./gradlew assembleDebug` (JDK 21, SDK 36): pass (October 2, 2026)
- `npx cap sync android`: 6 plugins registered, including ML Kit text recognition and local notifications (October 1, 2026)
- Capacitor Android platform sync: pass; API 36 / minimum API 24
- `npm audit --omit=dev`: zero production dependency vulnerabilities
- Browser HTTP smoke check: localhost returned 200; visual automation unavailable in this session
- Signed Android build: 0.4.5 APK verified with `apksigner` (November 21, 2026)

The development-only dependency tree currently reports three moderate findings through Capacitor CLI's `xcode`/`uuid` chain. Do not force-downgrade the CLI; reassess when the upstream Capacitor patch is available.
