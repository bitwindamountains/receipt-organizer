# SnapSort Production Plan

**Status:** Implementation-ready plan  
**Release target:** Android first; iOS after Android product validation  
**Product:** A private, searchable library for screenshots and receipt images  
**Last revised:** September 11, 2026

## 1. Product decision

SnapSort helps a user save an important screenshot or receipt now and find it again in seconds later. Version 1 is an offline-first organizer, not a replacement gallery, expense platform, or AI product.

The core promise is:

> Save it quickly. Find it quickly. Keep it private.

The release is successful only when the complete loop is dependable:

```text
Choose image -> add only useful details -> save -> search/filter -> open/share
```

### Target user

The primary launch user is someone who regularly saves shopping, work, school, travel, warranty, or payment images and cannot reliably retrieve them from a busy gallery.

### Jobs to be done

- When I save an important image, help me file it with minimal effort.
- When I remember only a merchant, tag, category, amount, or approximate date, help me find it.
- When the image is sensitive, keep it on my device and explain what the app does with it.
- When I change devices or reinstall, let me make a portable backup first.

## 2. Product principles

1. **Fast by default:** importing one image should require only a type and category; all other fields are optional.
2. **Progressive disclosure:** receipt-only fields appear only for receipts. Advanced filters remain behind one Filter action.
3. **No dead ends:** every empty, error, permission, and no-result state offers a clear next action.
4. **Safe and reversible:** preserve the source image, use confirmation for destructive actions, and support export/restore.
5. **Private by design:** no account, ads, trackers, image uploads, or network dependency in version 1.
6. **Accessible by default:** screen-reader labels, logical focus order, scalable text, visible focus, sufficient contrast, and touch targets of at least 48 dp.

## 3. Release scope

### P0 - required for production release

- First-run privacy explanation; onboarding is skippable and shown once
- Import one or multiple JPG, PNG, or WEBP images with the Android system photo picker
- Receive a shared image from another app if the selected Capacitor plugin passes the technical spike
- Copy each chosen image into app-private storage without modifying or deleting the source
- Choose Screenshot or Receipt, then a default or custom category
- Optional title, notes, and tags
- Optional receipt merchant, amount, currency, and purchase date
- Home with recent items and a prominent Add action
- Search across title, notes, merchant, category, and tags
- Filter by type and category; sort by newest, oldest, title, or purchase date
- Grid library with generated thumbnails and an optional list view only if schedule allows
- Item details, edit, share, and delete
- Category create, rename, archive, and safe reassignment
- Export and restore a complete portable backup containing metadata and app-managed images
- Storage usage, privacy policy, app version, and erase-all-data controls in Settings
- Offline operation, schema migrations, crash-safe imports, and release logging

### P1 - first update after launch

- Date-range and amount-range filters
- Batch select, recategorize, and delete
- Duplicate warning based on an exact file hash
- Biometric app lock
- Dark theme if it is not complete at launch

### Added to version 1 (October 2026)

These were excluded in the original plan and now ship. Each runs on the device, is optional, and is covered by the privacy policy and the Play declarations in section 14.

- On-device text reading (ML Kit) to fill in merchant, total, date, and category when adding an image; it can be turned off in Settings
- Payment notification capture for GCash, Maya, and banks, behind an opt-in toggle and Android Notification access
- Screenshot inbox: an opt-in scan of recent screenshots (`READ_MEDIA_IMAGES`) that offers payment screenshots for the user to add
- Receipt maker for purchases without a receipt and for receipts issued to customers
- Insights: monthly spending, categories, and top places
- Warranty reminders as inexact local notifications

### Explicitly excluded from version 1

- Text search inside images
- AI classification or semantic search
- Accounts, backend, cloud sync, or web app
- Broad storage access (`MANAGE_EXTERNAL_STORAGE` or all-files access)
- Tax workflows or PDF reports
- Subscriptions, ads, and third-party behavioral analytics
- Image editing

These exclusions should appear in issue templates and sprint planning so they do not enter the release accidentally.

## 4. Information architecture

Use three bottom destinations and one global primary action:

```text
Home | Library | Settings                         + Add
```

- **Home:** search entry, recent items, type shortcuts, and useful empty state
- **Library:** complete collection, search results, filter/sort, and active-filter chips
- **Settings:** categories, backup/restore, storage, privacy, help, and about
- **Add:** modal or full-screen task flow, not a navigation destination
- **Details:** reached from Home, Library, or search and returns to the caller with state preserved

## 5. User experience specification

### 5.1 First launch

Use one short screen, not a carousel:

- Headline: "Find important images in seconds."
- Explain that selected images are copied into private app storage and are not uploaded.
- Actions: **Add first image** and **Explore empty library**.
- Do not request permissions on launch.

Acceptance criteria:

- The user can reach Home in one tap.
- Back, relaunch, and rotation do not show onboarding again after completion.
- Privacy information remains available from Settings.

### 5.2 Add item

1. Tap **Add**.
2. Select one or more images through the system picker.
3. Show a preview and sensible defaults: Screenshot, last-used category, and today only when appropriate.
4. Require type and category. Keep title, tags, notes, and receipt fields optional.
5. Tap **Save**. Show progress for multiple images and return to the previous view.
6. Show a brief undo-capable success message and place the new item at the top.

For multi-import, apply shared type/category/tags to all selected images; detailed editing can happen later. Preserve any completed records if one image fails, clearly identify failures, and offer Retry.

Acceptance criteria:

- Canceling at any point creates no database row or orphaned file.
- Save cannot be double-submitted.
- App interruption during copy or database write recovers cleanly on next launch.
- A failed save retains entered metadata until retry or explicit cancel.
- Large images are decoded at display size; the UI never renders full-resolution files in the grid.

### 5.3 Search and browse

- Search begins after a short debounce and ignores case and extra whitespace.
- A result shows thumbnail, title or useful fallback, category, type, and relevant receipt data.
- Search state and scroll position survive opening and closing an item.
- Active filters are visible as removable chips with a **Clear all** action.
- No-results copy suggests clearing filters or trying a merchant, tag, or category.

Acceptance criteria:

- An untitled item is still identifiable using merchant, category, or "Screenshot/Receipt - date."
- Category and tag matches are included, not only item-table fields.
- Search punctuation and percent/underscore characters do not break SQL matching.
- Keyboard submit and screen readers can operate all controls.

### 5.4 Details, edit, share, and delete

- Image is zoomable and can open edge-to-edge.
- Missing optional metadata is hidden rather than shown as blank rows.
- Edit warns before discarding unsaved changes.
- Share exports a temporary readable copy through the native share sheet and cleans it later.
- Delete explains that the SnapSort copy and metadata are removed while the original gallery image remains.
- Offer Undo for a short window; remove files permanently after the undo window or next cleanup.

### 5.5 Categories

- Seed a short common set: Products, Conversations, School, Work, Travel, Documents, Food, Shopping, Bills, Transport, Electronics, and Other.
- Do not split category lists by item type; allow any category for either type and rank recent choices first.
- Category names are trimmed and unique without regard to case.
- Deleting a used category requires reassignment or archive; it must never orphan items.

### 5.6 Backup and restore

- **Export backup** writes a versioned archive selected by the user through the system document flow.
- Archive contains a manifest, database-compatible JSON, images, thumbnails if useful, and checksums.
- **Restore backup** validates version, free space, paths, checksums, and record IDs before changing live data.
- Restore defaults to merge with duplicate-ID handling; "replace everything" requires explicit confirmation.
- Create a recovery point before replacement and report imported, skipped, and failed counts.

The UI must state that uninstalling the app can remove app-managed data and that a manual export is the portable backup. Android Auto Backup behavior must be explicitly configured and tested; do not rely on it for large image libraries.

## 6. Visual and content design

- Use a calm neutral surface with one primary accent; do not encode category or status by color alone.
- Prefer familiar labels: Add, Search, Filter, Edit, Share, Delete, Export backup.
- Use sentence case and short helper text. Avoid technical terms such as SQLite, URI, and filesystem in the UI.
- Thumbnail aspect ratio is consistent; crop only in grids and show the entire image in Details.
- Support system font scaling through at least 200% without clipped controls.
- Meet at least 4.5:1 text contrast and 3:1 for large text and meaningful graphics.
- Provide accessible names for icon-only controls and announce save, error, and filter-result changes.
- Design explicit states for first use, loading, processing, partial import, missing file, no results, low storage, and corrupt backup.

## 7. Technical architecture

### Stack

- Ionic + Angular + TypeScript
- Capacitor, pinned to a tested stable major across core and plugins
- SQLite for metadata and migrations
- Capacitor/native filesystem APIs for app-private images and thumbnails
- Android system photo picker for user-selected media
- Angular services and RxJS; no global state library until complexity proves it necessary

Before implementation, run a one-day compatibility spike for SQLite, multi-photo selection, share target, filesystem URI handling, Android process recreation, and signed release builds. Record exact package versions in an architecture decision record and lockfile.

### Modules

```text
src/app/
  core/          database, migrations, filesystem, logging, configuration
  data/          repositories and storage adapters
  features/      onboarding, home, add, library, item-detail, categories, settings
  shared/        accessible UI components, validators, formatters
```

UI components call application services; services coordinate repositories; repositories own SQLite and filesystem access. Views never execute SQL or manipulate paths directly.

### Import transaction

```text
Validate selection
  -> copy to a staging filename
  -> calculate hash and image metadata
  -> create thumbnail
  -> insert item and tags in one DB transaction
  -> atomically move staged files to final relative paths
  -> mark import complete
```

On launch, a cleanup job reconciles stale staging files, pending deletions, and database rows whose files are missing. File I/O and image processing run off the main UI path.

## 8. Data model

Store relative storage keys, not device-specific absolute paths. Store timestamps in UTC ISO 8601. Store a receipt date as a calendar date (`YYYY-MM-DD`) so timezone conversion cannot change it. Store money as integer minor units plus ISO 4217 currency code; never use floating point for amounts.

```ts
interface SavedItem {
  id: string;
  type: 'screenshot' | 'receipt';
  imageKey: string;
  thumbnailKey: string;
  contentHash: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  title: string | null;
  notes: string | null;
  categoryId: string;
  merchant: string | null;
  amountMinor: number | null;
  currencyCode: string | null;
  purchaseDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

Tables: `items`, `categories`, `tags`, `item_tags`, `schema_migrations`, and `app_settings`. Enforce foreign keys, unique normalized tag/category names, and cascade item-tag joins. Add indexes for type, category, created date, purchase date, merchant, and normalized title. Search must join tags and categories; use escaped parameterized queries. Evaluate SQLite FTS only after real-device benchmarking shows it is needed.

Every schema change is forward-migrated, transactional, repeatable in tests, and tested against at least the previous production schema. Never silently destroy an incompatible database.

## 9. Privacy, security, and permissions

- Request no broad photo-library or all-files permission. The system photo picker grants access only to media the user selects.
- Keep imported files in app-private storage and prevent other apps from reading them directly.
- Share only through scoped content URIs; never expose raw filesystem paths.
- Validate MIME type, decoded dimensions, size limits, archive paths, and checksums. Reject path traversal and malformed backup content.
- Strip metadata from generated thumbnails. Preserve the original imported copy unless the privacy policy explicitly promises metadata removal.
- Do not log titles, notes, merchants, tags, amounts, image contents, or full paths.
- No network permission unless a reviewed feature genuinely needs it.
- Audit every dependency and SDK before release and keep the Play Data safety declaration aligned with actual behavior.
- Publish a public HTML privacy policy and link it from the store and Settings, even if the app collects no data.

Threat-model at minimum: malicious images, zip bombs/path traversal, unintended file sharing, leaked logs, restored files with collisions, tampered databases, and abandoned temporary files.

## 10. Quality targets and acceptance gates

### Functional gate

- All P0 journeys pass on clean install, upgrade, device restart, offline mode, low-storage simulation, and Android process recreation.
- Import, edit, search, export, restore, share, undo delete, and erase-all-data have automated or documented repeatable tests.
- The app handles at least 1,000 items without correctness loss.

### Performance gate on a representative mid-range device

- Warm Home usable in under 1 second; cold launch target under 2.5 seconds.
- Search result update under 300 ms at the 95th percentile for 1,000 items.
- Grid scrolling remains responsive with thumbnails; full images are lazy-loaded.
- Import progress appears within 500 ms and never blocks interaction long enough to trigger an ANR.
- Measure peak memory for large and multi-image imports; do not hold multiple full bitmaps in memory.

### Reliability gate

- Zero open P0/P1 defects and no known data-loss defect.
- No crash in a 30-minute scripted CRUD/import/restore soak test on each supported Android version tier.
- Closed beta meets stricter internal goals than Play thresholds: user-perceived crash rate below 0.5% and ANR rate below 0.2%.
- Database and exported backup restore correctly after an app upgrade.

### Accessibility gate

- Complete the primary journeys with TalkBack and switch/keyboard navigation.
- Automated accessibility scan has no high-severity findings.
- Font scaling, contrast, focus order, error association, and 48 dp targets pass manual review.

## 11. Test strategy

- **Unit:** validators, date/money formatting, search escaping, reducers/services, backup manifest validation
- **Database:** CRUD, joins, constraints, migrations, rollback, Unicode, apostrophes, and large result sets
- **Filesystem:** atomic copy, collisions, missing source, low storage, cleanup, URI expiry, and partial failure
- **Component:** forms, progressive receipt fields, filters, empty/error states, accessible names
- **End-to-end:** onboarding through retrieve; multi-import; edit; share; undo delete; export; merge restore; replace restore; erase all
- **Compatibility:** smallest supported OS, current common OS, Android 16/API 36, small/large screens, low-memory device, rotation, light/dark system settings
- **Release:** signed AAB smoke test installed through Play internal testing, not only a debug APK

Use sanitized generated fixtures. Never commit real receipts, private screenshots, signing keys, service credentials, or production backups.

## 12. Delivery plan

Plan in outcome-based phases. A solo developer should expect roughly six focused weeks, but advance only when each exit gate passes.

### Phase 0 - product and technical proof (2-3 days)

- Prototype Add, Home, and Details at phone size.
- Test the plugin stack on a physical device and signed build.
- Decide minimum supported Android version from device audience and plugin compatibility.
- Finalize package ID, app name availability, repository rules, and architecture decisions.

**Exit:** one image can be selected, copied, saved, reopened after restart, and removed without an orphan.

### Phase 1 - dependable vertical slice (week 1)

- Project, navigation, design tokens, database v1, migrations, repository boundaries
- First-launch explanation and single-image add flow
- Home, details, edit, delete/undo, and recovery cleanup
- CI for lint, typecheck, unit tests, and Android debug build

**Exit:** the complete core loop passes on a physical device and process restart.

### Phase 2 - organization and retrieval (week 2)

- Categories and tags
- Library, thumbnails, search, filter, and sort
- Receipt metadata with locale-safe money/date input
- Multi-import and, if the spike passed, Android share target

**Exit:** seeded 1,000-item library meets search and scrolling targets.

### Phase 3 - trust and data safety (week 3)

- Export, validated restore, storage usage, low-space handling, and erase all
- Privacy UI, log redaction, backup rules, secure sharing, and threat-model fixes
- Full schema and interrupted-operation recovery tests

**Exit:** a clean install restores a backup exactly; corruption and low storage fail safely.

### Phase 4 - usability and hardening (week 4)

- Empty/loading/error states, copy review, accessibility, responsive layouts
- Performance profiling, bitmap memory tuning, and dependency audit
- End-to-end suite and supported-device matrix

**Exit:** all quality gates pass; no open data-loss, security, crash, or accessibility blocker.

### Phase 5 - beta and release (weeks 5-6)

- Internal track, then a closed beta of 20-50 target users
- Test store install/update, collect task-based feedback, monitor Android vitals
- Finish privacy policy, Data safety, content rating, store assets, support contact, and release notes
- Fix blockers, create release candidate, sign AAB, and stage rollout

**Exit:** at least 80% of beta testers complete save-and-find without help, median task time is under 30 seconds, backup/restore succeeds in all release-candidate tests, and stability goals hold.

## 13. CI/CD and release operations

On every pull request:

```text
format check -> lint -> typecheck -> unit/database tests -> web production build -> Android debug build
```

On a version tag:

```text
clean install -> full tests -> production web build -> Capacitor sync -> signed AAB
-> artifact checks -> Play internal track -> smoke test -> promote the same artifact
```

- Pin Node, Java, Android SDK, Gradle, Capacitor, and plugin versions.
- Use semantic app versions and monotonically increasing Android version codes.
- Store the upload key and recovery information in a secured, backed-up password manager; never in the repository.
- Generate and archive mapping/symbol files needed to diagnose release crashes.
- Keep separate development and production application IDs if test data or permissions could collide.
- Use Play managed publishing and staged rollout: internal -> closed -> 10% -> 50% -> 100%, with a stop/rollback checklist.
- Define who checks Android vitals and reviews daily during rollout, then weekly.

## 14. Google Play readiness checklist

- Production build targets Android 16 / API 36 or newer for submissions after August 31, 2026.
- Signed Android App Bundle installs and upgrades through Play testing tracks.
- App icon, feature graphic, phone screenshots, short/full descriptions, category, contact email, and support URL are complete.
- Public, non-geofenced HTML privacy policy is linked in Play Console and inside the app.
- Data safety answers match the app and every bundled SDK, even when no data is collected.
- Content rating, target audience, ads declaration, app access, and permissions declarations are complete.
- Photo selection uses the system picker; the manifest contains no unnecessary broad storage permission.
- Permission declarations are filed for Notification access (`BIND_NOTIFICATION_LISTENER_SERVICE`) and `READ_MEDIA_IMAGES` (screenshot inbox), each preceded by an in-app disclosure.
- Backup behavior is explicitly configured for supported Android versions and validated on restore/device transfer.
- Pre-launch report issues, accessibility findings, crashes, ANRs, and security scan findings are resolved or documented with release approval.
- Support and incident response instructions exist before public launch.

## 15. Metrics without invasive analytics

For beta, collect structured feedback and anonymous Play Console quality data rather than adding an analytics SDK. Track:

- Save-and-find task completion rate: target at least 80%
- Median save-and-find task time: target under 30 seconds in moderated beta
- Import success rate from test logs: target at least 99.5%
- Backup/restore release test success: 100%
- User-perceived crash rate: internal target below 0.5%
- User-perceived ANR rate: internal target below 0.2%
- Qualitative answer to: "What stopped you from finding an item?"

Reconsider privacy-preserving telemetry only after a specific product question cannot be answered through testing or Play data. Update consent, privacy policy, and Data safety declarations before shipping any such SDK.

## 16. Launch risks and mitigations

| Risk | Prevention | Release evidence |
|---|---|---|
| Images disappear after URI access expires | Copy immediately to app-private staging and store only relative app paths | Restart/process-death tests |
| Database row and file diverge | Transactional import state plus reconciliation cleanup | Interrupted-import tests |
| Large images cause OOM or jank | Decode to target size, cache thumbnails, lazy-load full image | Memory profile and scroll test |
| User loses data on uninstall/device change | Clear warning plus versioned export/restore; deliberate Android backup rules | Clean-install restore test |
| Search misses tags/categories | Repository-level joined search with escaped parameters | Search integration suite |
| Category deletion orphans items | Foreign keys and mandatory reassign/archive flow | Constraint tests |
| Sensitive data leaks through logs/share | Redaction policy and scoped temporary share URIs | Security review |
| Store rejection | Minimal permissions, accurate disclosures, signed-track smoke test | Completed Play checklist |
| Plugin breaks release builds | Early signed-build spike and pinned dependency set | Recorded architecture decision |

## 17. Product backlog after validation

Prioritize future work from observed retrieval failures, not feature novelty:

1. On-device OCR so searches can match text inside images
2. Exact and perceptual duplicate review
3. Biometric lock and encrypted export
4. Warranty reminders and receipt export
5. Optional end-to-end encrypted sync
6. On-device smart category suggestions

Monetization should wait until retention and retrieval value are demonstrated. If introduced, keep core local organization, manual search, export, and data access free; never hold a user's data hostage behind a subscription.

## 18. Definition of production ready

Version 1 is ready for public rollout only when:

- Every P0 item is complete or explicitly removed from the public promise.
- A new user can save and retrieve both a screenshot and receipt without help.
- Existing users can upgrade without data loss.
- Import and restore survive interruption and low storage safely.
- Search, accessibility, reliability, and performance gates pass on the supported matrix.
- Privacy policy, Data safety, store metadata, signing, CI/CD, monitoring, support, and rollback are operational.
- The release candidate tested in the Play track is the exact artifact promoted to production.

## 19. Immediate next actions

1. Create three phone-size wireframes: Home empty/populated, Add Screenshot/Receipt, and Library search/filter.
2. Run the native capability spike and record the supported Android range and exact dependencies.
3. Create the repository and CI pipeline.
4. Implement the Phase 1 vertical slice before building additional screens.
5. Recruit 5 usability-test participants now and 20-50 closed-beta participants before Phase 5.

## Official deployment references

- [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [Android guidance on minimizing permission requests and using the photo picker](https://developer.android.com/privacy-and-security/minimize-permission-requests)
- [Google Play User Data and privacy-policy requirements](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Google Play Data safety form guidance](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Android Auto Backup configuration](https://developer.android.com/identity/data/autobackup)
- [Android core app quality guidelines](https://developer.android.com/docs/quality-guidelines/core-app-quality)
- [Android vitals](https://developer.android.com/topic/performance/vitals/)
- [Capacitor documentation](https://capacitorjs.com/docs)
