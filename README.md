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

## Android development

Install Android Studio, its bundled JDK, Android SDK/API 36, and platform tools. Then:

```bash
npm run build:production
npx cap add android
npm run cap:sync
npm run android:open
```

The exact production dependency set is pinned by `package-lock.json`. Test image selection, SQLite persistence, process recreation, sharing, and signed AAB installation on a physical device before promotion.

## Privacy boundary

Version 0.1 stores metadata in on-device SQLite and imported image copies in app-private storage on Android. The browser development fallback uses localStorage for metadata and IndexedDB for image blobs. Do not add network SDKs or sensitive-data logging without a privacy and Play Data safety review.

See [PRODUCTION_PLAN.md](./PRODUCTION_PLAN.md) for scope, gates, and rollout requirements.
