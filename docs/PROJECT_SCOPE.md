# Phạm vi MediCare AI V2

## Phase 01 — Nền tảng và giao diện
- Expo SDK 58, React Native 0.88, React 19.3, TypeScript và Expo Router.
- Giao diện tiếng Việt cho người cao tuổi và người thân; Safe Area, bàn phím và thành phần dùng chung.

## Phase 02 — Authentication
- Firebase Authentication Email/Password, hồ sơ người dùng theo UID, persistence, recovery và protected routes.
- Vai trò lưu trong Firestore: \`elderly\` và \`caregiver\`; giao diện sử dụng nhãn người cao tuổi/người thân.
- Không lưu mật khẩu hoặc email vào hồ sơ Firestore.

## Phase 03 — Kết nối gia đình
- Người thân tạo mã kết nối dùng một lần; người cao tuổi xem thông tin và chủ động xác nhận.
- Hỗ trợ nhiều người thân với nhiều người cao tuổi; mỗi cặp có trạng thái kết nối riêng.
- Hai bên có thể ngắt kết nối; kết nối lại phải dùng mã mới.
- Kết nối gia đình chỉ là căn cứ cấp các quyền hỗ trợ đã được định nghĩa, không mặc nhiên cấp quyền quyết định sức khỏe.

## Phase 04 — Quản lý thuốc
Chính sách được chủ dự án phê duyệt ngày 27/11/2026. Đặc tả đầy đủ tại [PHASE-04-MEDICATION-POLICY.md](PHASE-04-MEDICATION-POLICY.md).

- Người cao tuổi là chủ thể duy nhất trực tiếp thêm, sửa, ngừng hoặc xóa mềm thuốc trong danh sách chính thức của mình.
- Người chăm sóc đang kết nối chỉ được xem thuốc, ghi nhận đã uống và gửi đề xuất thêm/sửa/ngừng/xóa. Không được ghi trực tiếp vào danh sách thuốc.
- Người cao tuổi là người duy nhất duyệt hoặc từ chối đề xuất. Khi duyệt, ứng dụng áp dụng thay đổi; khi từ chối, thuốc chính thức không thay đổi.
- Người cao tuổi và người chăm sóc đang kết nối đều được ghi nhận uống thuốc. Nhật ký là append-only, không được sửa/xóa.
- Ngắt kết nối thu hồi quyền đọc, gửi đề xuất và ghi nhật ký của người chăm sóc.
- Người đại diện hợp pháp/được ủy quyền là một loại thẩm quyền riêng, không suy ra từ kết nối gia đình. Phase 04 chưa cấp quyền đại diện; dữ liệu và quyền này mặc định bị từ chối cho đến khi có quy trình xác minh, cấp quyền và thu hồi được phê duyệt.
- Giữ nguyên đường dẫn dữ liệu thuốc hiện có \`elderlyProfiles/{seniorUid}/medications/{medicationId}\`; không xóa hoặc di chuyển dữ liệu.

## Các giai đoạn tiếp theo
- Phase 05: lịch chăm sóc, nhắc giờ, thông báo và quy trình xác nhận liều theo phạm vi được phê duyệt.
- Phase 06: OCR đơn thuốc, luôn yêu cầu người dùng xác nhận nội dung nhận dạng; không tự kê đơn.
- Các giai đoạn sức khỏe/AI khác chỉ được thực hiện theo phạm vi đề tài và không chẩn đoán hoặc kê đơn.

## Bảo toàn Firebase và an toàn
- Dùng Firebase project hiện tại; không tạo project mới, không xóa/di chuyển dữ liệu.
- Không deploy Security Rules hoặc Cloud Functions nếu chưa được chủ dự án xem xét và chấp thuận riêng.
- Không commit \`.env\`, service account hoặc private key.
- Không phát sinh phí: Spark, Email/Password, Firestore và Emulator; không Blaze, SMS, Storage hoặc dịch vụ trả phí.
- Không merge Phase 04 trước khi CI, Windows và iPhone được kiểm thử, chủ dự án nghiệm thu rõ ràng.

## Tiêu chí nghiệm thu chung
- TypeScript, ESLint, Unit tests, Auth Emulator, Firestore Rules Emulator và Expo Doctor đạt.
- Kiểm thử thực tế trên iPhone; phân quyền phải được thực thi ở Firestore Rules, không chỉ ở giao diện.
- Không tuyên bố đã kiểm thử thiết bị hoặc Firebase thật nếu chưa có bằng chứng tương ứng.
