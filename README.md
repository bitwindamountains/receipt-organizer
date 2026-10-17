# SnapSort

SnapSort is an offline-first Android organizer for screenshots and receipt images. The current codebase is the Phase 1 production vertical slice.

## Local development

Requirements: Node 24.15+ and npm 11.

```bash
npm install
npm start
```

Run all web checks:

```bash
npm run check
```

Build the browser version (for a hosted web demo). It includes the offline text-recognition files under `ocr/` (about 15 MB on disk; a visitor downloads about 7 MB the first time a receipt is read):

```bash
npm run build:web
```

`npm start` serves the same files. The default production build, which Android uses, leaves them out; Android reads receipts with ML Kit instead.

## Android development

Install Android Studio, its bundled JDK, Android SDK/API 36, and platform tools. Then:

```bash
npm run build:production
npm run cap:sync
npm run android:open
```

Run `npm run cap:sync` again after adding or updating a Capacitor plugin. Text recognition (ML Kit, bundled Latin model) and warranty reminders (local notifications) are native plugins; test both on a device.

The exact production dependency set is pinned by `package-lock.json`. Test image selection, SQLite persistence, process recreation, sharing, and signed AAB installation on a physical device before promotion.

## Auto-capture

All on the device; turn it on in Settings > Auto-capture.

- **Payment notifications (Android):** a `NotificationListenerService` keeps only notifications with a peso amount and a payment word, skipping chat and SMS apps. They are queued in app storage until SnapSort opens, then parsed (`core/capture/transaction-parser.ts`) into receipts with a drawn receipt image. Duplicates are skipped by reference number. "Try it with a sample" runs the same pipeline on any platform.
- **Screenshot inbox:** on Android, new screenshots are read from the gallery with `READ_MEDIA_IMAGES`. In Chrome or Edge on a computer, the user picks a screenshots folder. Payment screenshots are read and offered in `/inbox`.
- **Share into SnapSort (Android):** share one or more images from any app and they open on the Add page. In the browser, paste (Ctrl/⌘+V) or drop images on the Add page.

Native code lives in `android/app/src/main/java/app/snapsort/mobile/` (`SnapSortCapturePlugin`, `NotificationCaptureService`, `CaptureStore`). To build without Android Studio, use JDK 21 with `ANDROID_HOME` set and run `cd android && ./gradlew assembleDebug`.

Google Play: notification access and `READ_MEDIA_IMAGES` need the Play Console permission declarations and an in-app prominent disclosure (the Settings dialog explains notification access before opening system settings). Review the Data safety form before release.

## Privacy boundary

Version 0.1 stores metadata in on-device SQLite and imported image copies in app-private storage on Android. The browser development fallback uses localStorage for metadata and IndexedDB for image blobs. Receipt reading runs on the device (ML Kit on Android, bundled Tesseract in the browser); images and text never leave it. Do not add network SDKs or sensitive-data logging without a privacy and Play Data safety review.

See [PRODUCTION_PLAN.md](./PRODUCTION_PLAN.md) for scope, gates, and rollout requirements.
