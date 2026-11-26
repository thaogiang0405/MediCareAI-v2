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
- Not run: npm install, typecheck, lint, unit tests, rules emulator tests, Expo Doctor, audit, iPhone Phase 02. No PASS claimed.
- Owner shared the current Firestore Rules and Spark billing screenshot: Spark / No cost; 23 reads, 0 writes, 0 deletes shown.
- The current Firestore Rules were copied into the local Emulator rules file only (not deployed). The app profile data layer now maps UI roles `senior/family` to persisted roles `elderly/caregiver` and uses the exact `users/{uid}` schema.
- Owner reports the other Firebase Console checks have already been completed; this update does not ask them to repeat those steps. The app still needs to be tested against the Emulator before any staging connection. No cloud write, delete, Rules deployment, or billing change has been performed.

### Firebase staging decision — 26/11/2026
- Owner confirms existing project `medicare-ai-cf804` is an old test project and approves reusing it for V2 staging.
- Added an explicit `staging` initialization path, restricted to project ID `medicare-ai-cf804`; emulator remains the default in `.env.example`.
- Staging connection is still gated pending read-only review of current Authentication provider/users, Firestore collection/schema, deployed Firestore Rules and billing plan.
- No existing data, Auth users, Firebase settings, or deployed Rules have been changed or deleted. No Firebase deployment performed.
- Cleanup requires an inventory and a specific owner-approved deletion list; take/export a backup before deleting records.
