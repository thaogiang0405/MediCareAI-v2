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
