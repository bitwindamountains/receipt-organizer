# Production Status

Updated: October 1, 2026 - design and motion pass

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
- Add generated thumbnails and process-death/staging reconciliation for large imports
- Complete multi-image import behavior and category management
- Replace privacy-policy placeholders and host the policy on a stable HTTPS URL
- Install Android Studio/JDK/SDK locally; build and smoke-test a signed AAB on physical devices
- Run accessibility, low-storage, process-recreation, and upgrade migration tests
- Create store assets and complete Play Console declarations

## Verification recorded

- `npm run typecheck`: pass
- `npm test -- --watch=false --no-progress`: 7 tests pass
- `npm run build:production -- --no-progress`: pass
- Capacitor Android platform sync: pass; API 36 / minimum API 24
- `npm audit --omit=dev`: zero production dependency vulnerabilities
- Browser HTTP smoke check: localhost returned 200; visual automation unavailable in this session
- Signed Android build: blocked by missing local JDK and Android SDK

The development-only dependency tree currently reports three moderate findings through Capacitor CLI's `xcode`/`uuid` chain. Do not force-downgrade the CLI; reassess when the upstream Capacitor patch is available.
