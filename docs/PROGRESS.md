# Tiến độ — MediCare AI V2

Cập nhật: 26/11/2026

## Phase 01 — Nền tảng và giao diện

- [x] Xác minh repository mới và nhánh main.
- [x] Xác minh SDK 58: React Native 0.88, React 19.3.0; Node 24.14.0 đạt yêu cầu Node 24.3+.
- [x] Tinh chỉnh màn hình đăng nhập và đăng ký: lề ngang nhất quán, ô nhập/nút có kích thước phù hợp, hỗ trợ Safe Area và bàn phím iOS.
- [x] Rút gọn phần chào và thẻ giới thiệu trên màn hình người cao tuổi.
- [x] Đưa tiện ích lên gần đầu màn hình, chuyển thành lưới hai cột gọn hơn.
- [x] Đồng bộ biểu tượng, màu sắc, khoảng cách và badge trên các thẻ tiện ích.
- [x] Rút gọn phần giới thiệu trên màn hình người thân, làm nổi bật trạng thái kết nối.
- [ ] Đồng bộ source mới về Windows và cài dependency.
- [ ] Chạy TypeScript, ESLint và Expo Doctor trên máy Windows.
- [ ] Kiểm thử iPhone thật: lề màn hình, Safe Area, bàn phím, Dynamic Island và Home Indicator.
- [x] Đã nhận Firebase Web App config của project cũ `medicare-ai-cf804`; chưa bật Auth hoặc truy cập dữ liệu cloud.

## Ghi chú kiểm thử

Các thay đổi giao diện đã được ghi lên nhánh main của GitHub. Môi trường hiện tại không có quyền chạy ứng dụng trên máy Windows/iPhone của người dùng, vì vậy chưa tuyên bố kiểm thử thiết bị hoặc các lệnh build/typecheck/lint đã thành công.

## Bước tiếp theo

1. Tải hoặc pull source mới về Windows.
2. Chạy npm install và các lệnh kiểm tra.
3. Mở ứng dụng trên iPhone bằng Expo Go SDK 58.
4. Chụp lại màn hình đăng nhập, đăng ký và hai trang chủ để rà soát kích thước thực tế.
5. Sau khi giao diện ổn định, chuẩn bị tích hợp Firebase Authentication bằng Firebase project hiện tại.

## Phase 02 — Authentication (in progress, not accepted)
- Owner reports Phase 01 UI accepted on physical iPhone on 26/11/2026; technical test logs not independently verified.
- Feature branch: feature/phase-02-auth, based on ecb72322bafa0839d0e2272d62c9f21f5942ffda.
- Implemented Firebase initialization with Emulator default and a separately gated staging mode, persistence, registration, login, password reset request, missing-profile recovery, profile edit/logout, protected routes, emulator-only owner-scoped Rules and test source.
- [x] GitHub Actions run `45832421158` on commit `ada5d83`: dependency installation, TypeScript, ESLint, unit tests, Firebase Auth Emulator, Firestore Rules Emulator and Expo Doctor all completed successfully. This is CI evidence only; it does not verify the owner's Windows installation or iPhone.
- Owner shared the current Firestore Rules and Spark billing screenshot: Spark / No cost; 23 reads, 0 writes, 0 deletes shown.
- The current Firestore Rules were copied into the local Emulator rules file only (not deployed). The app profile data layer now maps UI roles `senior/family` to persisted roles `elderly/caregiver` and uses the exact `users/{uid}` schema.
- Owner reports the other Firebase Console checks have already been completed; this update does not ask them to repeat those steps. The app still needs to be tested against the Emulator before any staging connection. No cloud write, delete, Rules deployment, or billing change has been performed.

### Firebase staging decision — 26/11/2026
- Owner confirms existing project `medicare-ai-cf804` is an old test project and approves reusing it for V2 staging.
- Added an explicit `staging` initialization path, restricted to project ID `medicare-ai-cf804`; emulator remains the default in `.env.example`.
- Owner reports the remaining Firebase Console checks are complete. The app profile layer has now been aligned with the supplied Firestore Rules; Emulator tests and local app checks must pass before enabling staging. No cloud write or deploy.
- No existing data, Auth users, Firebase settings, or deployed Rules have been changed or deleted. No Firebase deployment performed.
- Cleanup requires an inventory and a specific owner-approved deletion list; take/export a backup before deleting records.
- Follow-up code review: changed the session listener from `onIdTokenChanged` to `onAuthStateChanged` so routine ID-token refreshes do not trigger a full profile reload and temporary route-loading screen.
- Updated the recovery profile name input limit to match the Firestore Rules maximum of 120 characters.
- Populated `.env.example` with the existing Firebase Web App client configuration supplied by the owner. Emulator remains the default; `.env` remains ignored by Git.
- Added GitHub Actions quality workflow for TypeScript, ESLint, unit tests, Firebase Auth Emulator tests, Firestore Rules Emulator tests, Expo Doctor and a non-blocking production dependency audit. Run `45832421158` completed successfully.
- Expanded unit tests for network, disabled-account, permission, rate-limit and unknown Firebase error messages (7/7 passed). Auth Emulator integration test passed (1/1): registration, invalid email, weak password, duplicate email, wrong/correct login, logout and password-reset request. Firestore Rules Emulator tests passed (7/7). Expo Doctor passed (20/20). TypeScript and ESLint passed; latest ESLint run had no warnings.
- `npm audit --omit=dev` now reports 3 moderate `minimatch` findings under `@expo/fingerprint`; Expo SDK 58's upstream build-tool dependency. The 4 high `@grpc/grpc-js` findings were addressed by pinning the transitive package to 1.14.7. Do not run `npm audit fix --force` or downgrade Expo. The remaining minimatch advisory is documented by Expo maintainers as not affecting production app bundles; it remains visible for review.
- Latest local-device, Windows CLI and iPhone checks remain unverified. Firebase Auth/Firestore cloud staging has not been smoke-tested. No cloud data write, Rules deployment, billing change, PR creation or merge has occurred.


## Phase 03 — Family Connection (in progress)
- [x] Confirmed Phase 02 merge commit 0e38f65 and created feature/phase-03-family-connection from main.
- [x] Recovered the original Phase 03 scope: family creates a one-use 8-character code; senior previews the family name and confirms; either participant can disconnect; reconnection uses a new code.
- [x] Implement one-use 8-character invites, 15-minute expiry, current-member indexes and immutable connection-history documents with atomic writes.
- [x] Integrate family and senior connection panels into the existing home screens, including name preview and explicit senior confirmation.
- [x] Add owner/participant-only Firestore Rules. CI passed TypeScript, ESLint, unit tests, Auth Emulator, Firestore Rules Emulator and Expo Doctor on commit bbe7a09.
- [x] Add a security invariant so a senior can create member-index records only for the exact family/senior participants in the connection.
- [x] Expand Firestore Rules Emulator tests for invite creation/use, unauthorized reads, cross-account member-index writes, disconnect and reconnect (12/12 passed).
- [ ] Pull to Windows, install SDK 58-compatible Expo modules, and test the full create → connect → disconnect → reconnect flow on iPhone.
- [ ] Obtain owner acceptance before merging the Pull Request.
- GitHub Actions run `45856353502` (push) and `45856365322` (Pull Request), commit `8a10b69`: TypeScript, ESLint, unit tests (7/7), Auth Emulator (1/1), Firestore Rules Emulator (12/12) and Expo Doctor (20/20) passed. The production dependency audit still reports 3 moderate upstream `minimatch` advisories; it is non-blocking and documented above.
- No Firestore Rules have been deployed to the existing Firebase project; the PR remains draft pending Windows/iPhone acceptance.


### Phase 03 scope correction — many-to-many (owner approved)
- Previous one-to-one implementation passed Windows typecheck/lint, 7 unit, 1 Auth and 12 Rules Emulator tests; those results do not certify this revision.
- Replace account-wide member locks with one lock per family/senior pair: connectionPairs/{familyUid}/seniors/{seniorUid}. Connection history is still keyed by one-use invite code. Participant-scoped queries return only the caller's connection records. No composite index required for single-field filters.
- Keep one currently issued invite per caregiver; a new invite invalidates the unused prior invite, not existing relationships. Each code expires exactly 15 minutes after its server-created timestamp. Invalid/expired/used/revoked codes share a safe permission error; no private names exposed through stale codes.
- Client uses real transaction reads only on authorized documents; no lookup of a new random code or nonexistent connection history. Rules prevent overwrites; a rare code collision fails safely and user can retry.
- Preserve history on disconnect; reconnect creates a fresh history entry. No health data access is granted.
- 8-character codes have 40 bits of entropy; Spark Rules do not supply a per-user server rate limiter. This is a limited staging/demo design, not a claim of production abuse resistance. Keep codes private.
- No deployed Rules change or data migration performed. Existing unshipped single-member index is denied; no known cloud Phase 03 data. No deletion.
- [ ] CI and Windows checks for this revision, then physical iPhone acceptance, then explicitly authorized staging Rules review and smoke test. PR remains draft.

- Windows owner log for `325ccd7`: typecheck and ESLint passed; Firestore Rules Emulator 16/16 passed, including many-to-many and concurrent redemption. CI also passed TypeScript, ESLint, unit, Auth and Rules tests, but Expo Doctor 19/20 reported Expo 58.0.26 vs expected ~58.1.0. Align Expo dependency to ~58.1.0 (same SDK major), pending new CI and local install/device validation.

- CI for `8bf69e2` passed both push and PR runs (45924036918, 45924041604). Windows install succeeded, but the retained local lockfile resolved expo-router 58.0.32; Expo Doctor expects ~58.0.33. Raise the minimum patch version in package.json, then recheck Windows install and CI before device acceptance. Keep SDK 58; no cloud changes.


## Phase 03 — UI refinement
- Compact the family/senior connection panels into separate connection-list and invite-entry sections.
- Add visible connection status, expandable connection details, compact per-person disconnect action with confirmation, invite countdown and copy feedback, concise step-by-step instructions, inline loading and success/error feedback.
- Preserve the agreed invitation flow: family member creates the code; senior enters and confirms. Keep existing Firebase data model, transaction logic, Security Rules, and authorization unchanged.
- Compact the home header, greeting spacing and feature cards for iPhone. UI refinement is pending CI and physical iPhone acceptance.

## Phase 04 — Medication Management (policy revision in progress)

- Started from Phase 03 merge commit 3afd62f on feature/phase-04-medication-management.
- Preserved the existing medication collection path `elderlyProfiles/{seniorUid}/medications` and legacy M3.2/M3.3/M3.4 references. No migration or deletion.
- Original Phase 04 medication form, Firestore service, status handling, soft-delete and date picker remain in place.
- Owner-approved business policy (27/11/2026): the elderly owner alone directly creates, edits, stops and soft-deletes official medication records. A connected caregiver is read-only for the official medication list; they can submit create/update/stop/delete proposals and append intake logs, but cannot directly write medications or approve proposals.
- Added `medicationRequests` subcollection for caregiver proposals. The elderly owner can approve/reject; client approval applies the medication change and request status in one Firestore transaction. Caregiver reads only their own requests while the connection remains active.
- Added append-only `medicationIntakeLogs` subcollection. The elderly owner and connected caregiver can record and read medication intake; no client can update/delete a log.
- Added shared `medicationNotifications` event stream. Caregiver proposal + notification, every owner approve/reject decision + notification, and stop/reactivate status + notification are committed atomically. An approved stop emits both `proposal_reviewed` and `medication_stopped`. The elderly owner and every currently connected caregiver receive the same real-time in-app event; disconnected caregivers lose read access.
- Added owner-only medication reactivation. Inactive medicines can be restored from the inactive card or the edit sheet; each stop/reactivation event records server time and actor and appears in the notification feed/history.
- Added `firestore.rules` as the deployable canonical Rules source; `firebase.json` points to it and `firebase.emulator.json` plus Rules tests now use the same file. Deployment is configured but has not been run against Firebase staging.
- Firestore Emulator Rules now allow medication reads to the owner and active caregiver but restrict medication create/update to the owner. Requests, review decisions, intake logs, and connection revocation have dedicated Rules. Caregiver access is revoked after disconnect.
- Legal-representative authority is separate from family connection. Phase 04 does not grant this authority; `legalRepresentativeAuthorizations` is explicitly default-deny until an approved identity/evidence verification, grant, scope, expiry and revocation process exists.
- Added [PHASE-04-MEDICATION-POLICY.md](PHASE-04-MEDICATION-POLICY.md) and aligned PROJECT_SCOPE.md with the approved permission matrix.
- Updated Rules integration tests: owner CRUD; caregiver read-only medication access; caregiver proposal create/read; shared notifications to the owner and all connected caregivers; notification forgery denied; owner stop/reactivation events visible to every caregiver; owner review; immutable intake logs; strangers/disconnected caregivers denied; representative authority is not inferred from connection.
- [x] GitHub Actions run #182 (`46023725090`) on branch head `68e0903`: SUCCESS. TypeScript PASS; ESLint PASS; Unit tests 7/7; Auth Emulator 1/1; Firestore Rules Emulator 24/24; Expo Doctor 20/20. Added Rules coverage proving both connected caregivers can read approved/rejected proposal events; no Rules `maximum of 1000 expressions` warnings. Production audit still reports 3 Moderate `minimatch` advisories in Expo build tooling; `npm audit fix --force` proposes a breaking downgrade to Expo SDK 52, so it was not run.
- [ ] Pull latest branch to Windows and rerun typecheck, lint, tests, Auth Emulator, Rules Emulator and Expo Doctor.
- [ ] Test owner add/edit/stop/restore/delete, caregiver proposal/review, real-time notifications to the senior and two caregivers, status history, intake logs and disconnect revocation on iPhone.
- [x] Owner reviewed and approved deployment; `npx --yes firebase-tools deploy --only firestore:rules --project medicare-ai-cf804` completed successfully on 27/11/2026. Firebase confirmed `firestore.rules` compiled and was released. No data migration or deletion was performed.
- [ ] Owner acceptance before merging PR; do not merge in this work.
- In-app medication notifications are included in Phase 04. Remote push notifications while the app is closed, OCR, and scheduled dose confirmation remain future work (Phase 05/06). No paid service or native dependency added.


## Caregiver UI/UX redesign (27/11/2026)

- Created feature branch `feature/caregiver-ui-redesign` from Phase 04 head; opened draft PR #4 targeting `feature/phase-04-medication-management`.
- Reworked only the caregiver home header, connected-person panel, invite-code flow and caregiver medication interface. Senior home layout remains unchanged.
- Connected people: compact avatar/name/status rows, expandable details, list capped at three until expanded, secondary disconnect action with confirmation.
- Invite flow: clear three-step guidance; real Firestore code; copy action; 15-minute countdown; active/expired/used states; confirmation before replacing an active or expired unused code. Existing connected pairs are unaffected.
- Medication view: automatically selects the first active senior connection; selector supports switching between connected seniors and refreshes all scoped listeners. Dashboard shows only values available from existing snapshots.
- Added separate Thuốc and Hoạt động views. Medication cards collapse details and prioritize the confirm-before-record intake action; caregiver edit/stop/delete/add remain proposals only. Activity tabs separate shared notifications, the caregiver's own proposals and the latest 30 intake logs.
- Kept Firebase Auth, Firestore schema, security rules, service functions, queries, and role permissions unchanged. No mock data, package additions, native dependencies, migrations or Firebase deployment.
- CI workflow now covers feature branches and pull requests targeting the Phase 04 branch so this UI change can be validated before merging.
- [ ] Complete TypeScript, lint, unit, Auth Emulator, Firestore Rules Emulator and Expo Doctor checks on PR #4.
- [ ] Owner verifies layout and real interactions on iPhone and Android, including multiple connected seniors, code replacement confirmation, disconnect, intake confirmation and proposal tracking. Do not merge before device acceptance.
