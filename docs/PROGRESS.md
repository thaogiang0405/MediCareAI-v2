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
- [ ] Nhận Firebase Web App config của project cũ; chưa bật Auth hoặc truy cập dữ liệu.

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
- Implemented emulator-only Firebase initialization, persistence, registration, login, password reset request, missing-profile recovery, profile edit/logout, protected routes, owner-only rules and test source.
- Not run: npm install, typecheck, lint, unit tests, rules emulator tests, Expo Doctor, audit, iPhone Phase 02. No PASS claimed.
- Staging config, provider, schema and deployed rules still require review; no cloud write or deploy. No merge before acceptance.
