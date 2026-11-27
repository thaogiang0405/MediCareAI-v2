# Chính sách nghiệp vụ quản lý thuốc — Phase 04

Trạng thái: Đã được chủ dự án phê duyệt ngày 27/11/2026.  
Phạm vi: MediCare AI V2, nhánh `feature/phase-04-medication-management`.

## 1. Nguyên tắc

1. Người cao tuổi là chủ thể sở hữu hồ sơ thuốc và là người quyết định danh sách thuốc chính thức của chính mình.
2. Kết nối gia đình chỉ tạo quyền hỗ trợ có giới hạn; không chuyển quyền quyết định về thuốc cho người chăm sóc.
3. Người chăm sóc không được trực tiếp tạo, sửa, ngừng hoặc xóa mềm thuốc trong danh sách chính thức.
4. Mọi đề xuất thay đổi từ người chăm sóc phải được người cao tuổi xem xét và chủ động đồng ý trước khi áp dụng.
5. Ghi nhận việc đã uống thuốc là dữ liệu nhật ký bổ sung, không phải thao tác sửa danh sách thuốc. Cả người cao tuổi và người chăm sóc đang kết nối đều có thể ghi nhận.
6. Mọi quyền được kiểm tra ở Firestore Security Rules; ẩn nút trên giao diện không được coi là biện pháp bảo mật.

## 2. Ma trận quyền Phase 04

| Thao tác | Người cao tuổi sở hữu hồ sơ | Người chăm sóc đang kết nối | Người không kết nối |
|---|---|---|---|
| Xem danh sách thuốc | Cho phép | Chỉ đọc | Từ chối |
| Thêm thuốc chính thức | Cho phép | Tạo đề xuất | Từ chối |
| Sửa thuốc chính thức | Cho phép | Tạo đề xuất | Từ chối |
| Ngừng thuốc chính thức | Cho phép | Tạo đề xuất | Từ chối |
| Xóa mềm thuốc chính thức | Cho phép | Tạo đề xuất | Từ chối |
| Duyệt/từ chối đề xuất | Cho phép | Từ chối | Từ chối |
| Ghi nhận đã uống | Cho phép | Cho phép | Từ chối |
| Xem nhật ký uống thuốc | Cho phép | Chỉ khi đang kết nối | Từ chối |
| Sửa/xóa nhật ký uống thuốc | Từ chối (bất biến) | Từ chối (bất biến) | Từ chối |

Người cao tuổi không cần có kết nối gia đình để tự quản lý thuốc của mình. Khi kết nối bị ngắt, quyền đọc thuốc, đọc đề xuất và ghi nhật ký của người chăm sóc bị thu hồi.

## 3. Luồng đề xuất của người chăm sóc

Người chăm sóc được gửi bốn loại đề xuất:

- `create`: đề xuất thêm thuốc.
- `update`: đề xuất thay đổi thông tin thuốc.
- `stop`: đề xuất ngừng sử dụng thuốc.
- `delete`: đề xuất xóa mềm thuốc khỏi danh sách.

Mỗi đề xuất lưu chủ hồ sơ, thuốc liên quan (nếu có), tên thuốc tại thời điểm gửi, loại đề xuất, dữ liệu đề xuất, người gửi, lý do, thời gian gửi và trạng thái.

Trạng thái:
- `pending`: chờ người cao tuổi quyết định.
- `approved`: người cao tuổi đồng ý; ứng dụng áp dụng thay đổi trong cùng một giao dịch Firestore.
- `rejected`: người cao tuổi từ chối; danh sách thuốc chính thức không thay đổi.

Người chăm sóc chỉ đọc được đề xuất do chính họ gửi khi kết nối còn hiệu lực. Người cao tuổi sở hữu hồ sơ đọc và xử lý các đề xuất thuộc hồ sơ của mình. Không cho phép sửa hoặc xóa đề xuất sau khi gửi; quyết định của người cao tuổi là thao tác cập nhật duy nhất trên đề xuất.

Việc phê duyệt trong ứng dụng chỉ xác nhận người cao tuổi đồng ý cập nhật hồ sơ. Ứng dụng không đưa ra tư vấn y khoa và không tự suy luận liều dùng. Nội dung thuốc phải theo đơn hoặc chỉ định chuyên môn.

## 4. Thông báo thuốc và lịch sử trạng thái

Thông báo trong ứng dụng được lưu chung theo hồ sơ người cao tuổi tại:

`elderlyProfiles/{seniorUid}/medicationNotifications/{notificationId}`

Đây là luồng sự kiện dùng chung, không phải bản sao riêng cho từng người:
- Người cao tuổi sở hữu hồ sơ đọc được.
- Tất cả người chăm sóc đang kết nối với người cao tuổi đọc được cùng một thông báo.
- Khi hủy kết nối, người chăm sóc mất quyền đọc thông báo của hồ sơ đó.
- Bản ghi thông báo bất biến; client không được sửa/xóa.

Các sự kiện Phase 04:
- `proposal_submitted`: người chăm sóc gửi đề xuất; thông báo đến người cao tuổi và mọi người chăm sóc đang kết nối.
- `proposal_reviewed`: mỗi khi người cao tuổi duyệt hoặc từ chối bất kỳ đề xuất nào (thêm, sửa, ngừng, xóa), hệ thống tạo một thông báo riêng trong cùng transaction với quyết định. Tất cả người chăm sóc đang kết nối đều đọc được sự kiện này.
- `medication_stopped`: nếu người cao tuổi duyệt đề xuất ngừng thuốc, hệ thống tạo thêm một sự kiện trạng thái ngừng thuốc bên cạnh `proposal_reviewed`. Sự kiện này là mốc lịch sử, có người thực hiện và thời điểm máy chủ.

- `medication_reactivated`: người cao tuổi sử dụng lại thuốc; ghi lịch sử và thông báo cho mọi người chăm sóc.

Việc ghi request + thông báo, duyệt request + thông báo, hoặc đổi trạng thái thuốc + thông báo được thực hiện trong cùng một batch/transaction. Rules dùng `getAfter()` để xác nhận sự kiện đi kèm dữ liệu nghiệp vụ tương ứng, tránh tạo thông báo giả bằng client.

Giao diện hiển thị 10 thông báo mới nhất theo thời gian thực. Trong mục Đã ngừng, thẻ thuốc hiển thị lần ngừng gần nhất. Người cao tuổi có nút **Sử dụng lại** ngay trên thẻ và trong màn hình Chỉnh sửa; thao tác này chuyển trạng thái về Đang sử dụng, giữ nguyên bản ghi thuốc và tạo sự kiện lịch sử/thông báo mới.

**Giới hạn:** Đây là thông báo trong ứng dụng khi tài khoản đang mở ứng dụng/kết nối mạng. Push notification hiện trên màn hình khóa hoặc khi ứng dụng đóng chưa được triển khai trong Phase 04.

## 5. Nhật ký uống thuốc

Nhật ký được lưu riêng tại:

`elderlyProfiles/{seniorUid}/medicationIntakeLogs/{logId}`

Mỗi bản ghi gồm:
- `ownerUid`, `medicationId`, `medicationName` (ảnh chụp tên thuốc tại thời điểm ghi nhận).
- `recordedByUid` và `recordedByRole` (`elderly` hoặc `caregiver`).
- `takenAt`, `createdAt` do máy chủ Firestore đóng dấu.
- `note` tùy chọn.

Chỉ được ghi nhận cho thuốc đang hoạt động và đúng chủ hồ sơ. Nhật ký là append-only: không cho cập nhật hoặc xóa. Bản ghi thể hiện người dùng đã khai báo đã uống; không phải bằng chứng y tế độc lập rằng thuốc chắc chắn đã được uống.

## 6. Người đại diện hợp pháp/được ủy quyền

Người đại diện là một loại thẩm quyền riêng, không đồng nhất với người chăm sóc và không được suy ra từ việc hai tài khoản đã kết nối.

Phase 04 không cấp quyền đại diện và không cho phép tài khoản gia đình tự khai trạng thái “đã xác minh”. Đường dẫn dữ liệu dự kiến `legalRepresentativeAuthorizations` đang bị từ chối mặc định.

Trước khi triển khai quyền đại diện ở giai đoạn sau, phải có tối thiểu:
1. Tiêu chí và loại giấy tờ/căn cứ ủy quyền được chấp nhận.
2. Quy trình xác minh bởi người có thẩm quyền được định danh riêng; không dùng tài khoản người chăm sóc để tự xác minh chính mình.
3. Bản ghi xác minh có người xác minh, thời điểm, căn cứ tham chiếu, phạm vi quyền, thời hạn và trạng thái.
4. Quy trình cấp quyền rõ ràng, thông báo cho người cao tuổi khi phù hợp, ghi nhật ký và thu hồi quyền.
5. Firestore Rules kiểm tra trạng thái đã xác minh, phạm vi, hiệu lực và thu hồi ở phía máy chủ.

Cho đến khi các điều kiện này được thiết kế, phê duyệt và kiểm thử, không có người đại diện nào được hưởng quyền sửa thuốc qua ứng dụng.

## 7. Mô hình dữ liệu và Security Rules

- Thuốc chính thức giữ nguyên đường dẫn hiện có: `elderlyProfiles/{seniorUid}/medications/{medicationId}`.
- Đề xuất: `elderlyProfiles/{seniorUid}/medicationRequests/{requestId}`.
- Nhật ký uống thuốc: `elderlyProfiles/{seniorUid}/medicationIntakeLogs/{logId}`.
- Thông báo và lịch sử sự kiện thuốc: `elderlyProfiles/{seniorUid}/medicationNotifications/{notificationId}`.
- Ủy quyền đại diện: `elderlyProfiles/{seniorUid}/legalRepresentativeAuthorizations/{authorizationId}`, hiện mặc định từ chối.

Firestore Rules chỉ cho chủ hồ sơ tạo/cập nhật thuốc chính thức. Người chăm sóc đang kết nối được đọc thuốc, tạo đề xuất của chính mình và tạo nhật ký uống thuốc; không được ghi vào collection thuốc. Người cao tuổi và mọi người chăm sóc đang kết nối được đọc luồng thông báo; chỉ các sự kiện gắn với request hoặc thay đổi trạng thái hợp lệ mới được tạo. Nhật ký uống thuốc và thông báo không cho sửa/xóa. Khi ngắt kết nối, quyền người chăm sóc bị thu hồi.

Repository có `firestore.rules` làm nguồn Rules dùng cho staging/deploy và Emulator; `firebase.json` trỏ đến file này. `firebase.emulator.json` cũng dùng cùng Rules để tránh khác biệt giữa kiểm thử và staging.

Không thay đổi đường dẫn dữ liệu thuốc cũ, không xóa/migrate dữ liệu và không tự động deploy Rules lên Firebase thật trong thay đổi mã nguồn này. Sau khi chủ dự án xem xét, có thể đăng nhập Firebase CLI rồi chủ động chạy:

`npx firebase-tools deploy --only firestore:rules --project medicare-ai-cf804`

**Cảnh báo staging:** Cho đến khi lệnh Publish Rules mới được chủ dự án thực hiện thành công, Firebase staging có thể vẫn từ chối request/notification ở các collection Phase 04 mới. UI không thay thế bảo mật phía máy chủ; không thử thao tác ghi bằng tài khoản người chăm sóc trên dữ liệu sức khỏe staging trước khi Rules mới được Publish.

## 8. Tiêu chí nghiệm thu

1. Người cao tuổi có thể thêm, sửa, ngừng và xóa mềm thuốc của mình.
2. Người chăm sóc đang kết nối có thể đọc thuốc nhưng mọi thao tác ghi trực tiếp vào collection thuốc đều bị Rules từ chối.
3. Người chăm sóc gửi được đề xuất thêm/sửa/ngừng/xóa; không thể tự duyệt hoặc thay đổi đề xuất.
4. Người cao tuổi xem được đề xuất và duyệt/từ chối; duyệt áp dụng thay đổi, từ chối giữ nguyên thuốc.
5. Người cao tuổi và người chăm sóc đang kết nối có thể thêm nhật ký uống thuốc; cả hai có thể đọc; không ai được sửa/xóa nhật ký.
6. Người cao tuổi và tất cả người chăm sóc đang kết nối nhận được sự kiện đề xuất, duyệt/từ chối, ngừng và sử dụng lại theo thời gian thực.
7. Khi ngừng thuốc, lịch sử hiển thị ngày giờ và người thực hiện; người cao tuổi có thể sử dụng lại thuốc từ mục Đã ngừng hoặc màn hình Chỉnh sửa.
8. Người không kết nối và người chăm sóc sau khi ngắt kết nối không thể đọc thuốc, đề xuất, nhật ký hoặc thông báo, cũng không thể tạo đề xuất/nhật ký/thông báo.
9. Người chăm sóc không được cấp quyền đại diện hợp pháp chỉ do kết nối gia đình.
10. TypeScript, ESLint, Unit tests, Auth Emulator, Firestore Rules Emulator và Expo Doctor phải đạt. Sau đó chủ dự án kiểm thử trên iPhone trước khi merge.

## 9. Ngoài phạm vi Phase 04

- Push notification khi ứng dụng đóng/màn hình khóa, nhắc giờ, xác nhận liều theo lịch và lịch sử liều theo kế hoạch thuộc Phase 05.
- OCR đơn thuốc thuộc Phase 06.
- Xác minh giấy tờ người đại diện, tài khoản quản trị xác minh và cơ chế ủy quyền có giá trị pháp lý chưa được triển khai.
