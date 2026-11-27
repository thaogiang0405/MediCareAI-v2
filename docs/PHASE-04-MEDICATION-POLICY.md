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

## 4. Nhật ký uống thuốc

Nhật ký được lưu riêng tại:

`elderlyProfiles/{seniorUid}/medicationIntakeLogs/{logId}`

Mỗi bản ghi gồm:
- `ownerUid`, `medicationId`, `medicationName` (ảnh chụp tên thuốc tại thời điểm ghi nhận).
- `recordedByUid` và `recordedByRole` (`elderly` hoặc `caregiver`).
- `takenAt`, `createdAt` do máy chủ Firestore đóng dấu.
- `note` tùy chọn.

Chỉ được ghi nhận cho thuốc đang hoạt động và đúng chủ hồ sơ. Nhật ký là append-only: không cho cập nhật hoặc xóa. Bản ghi thể hiện người dùng đã khai báo đã uống; không phải bằng chứng y tế độc lập rằng thuốc chắc chắn đã được uống.

## 5. Người đại diện hợp pháp/được ủy quyền

Người đại diện là một loại thẩm quyền riêng, không đồng nhất với người chăm sóc và không được suy ra từ việc hai tài khoản đã kết nối.

Phase 04 không cấp quyền đại diện và không cho phép tài khoản gia đình tự khai trạng thái “đã xác minh”. Đường dẫn dữ liệu dự kiến `legalRepresentativeAuthorizations` đang bị từ chối mặc định.

Trước khi triển khai quyền đại diện ở giai đoạn sau, phải có tối thiểu:
1. Tiêu chí và loại giấy tờ/căn cứ ủy quyền được chấp nhận.
2. Quy trình xác minh bởi người có thẩm quyền được định danh riêng; không dùng tài khoản người chăm sóc để tự xác minh chính mình.
3. Bản ghi xác minh có người xác minh, thời điểm, căn cứ tham chiếu, phạm vi quyền, thời hạn và trạng thái.
4. Quy trình cấp quyền rõ ràng, thông báo cho người cao tuổi khi phù hợp, ghi nhật ký và thu hồi quyền.
5. Firestore Rules kiểm tra trạng thái đã xác minh, phạm vi, hiệu lực và thu hồi ở phía máy chủ.

Cho đến khi các điều kiện này được thiết kế, phê duyệt và kiểm thử, không có người đại diện nào được hưởng quyền sửa thuốc qua ứng dụng.

## 6. Mô hình dữ liệu và Security Rules

- Thuốc chính thức giữ nguyên đường dẫn hiện có: `elderlyProfiles/{seniorUid}/medications/{medicationId}`.
- Đề xuất: `elderlyProfiles/{seniorUid}/medicationRequests/{requestId}`.
- Nhật ký uống thuốc: `elderlyProfiles/{seniorUid}/medicationIntakeLogs/{logId}`.
- Ủy quyền đại diện: `elderlyProfiles/{seniorUid}/legalRepresentativeAuthorizations/{authorizationId}`, hiện mặc định từ chối.

Firestore Rules chỉ cho chủ hồ sơ tạo/cập nhật thuốc chính thức. Người chăm sóc đang kết nối được đọc thuốc, tạo đề xuất của chính mình và tạo nhật ký uống thuốc; không được ghi vào collection thuốc. Nhật ký không cho sửa/xóa. Khi ngắt kết nối, quyền người chăm sóc bị thu hồi.

Không thay đổi đường dẫn dữ liệu thuốc cũ, không xóa/migrate dữ liệu, không deploy Rules lên Firebase thật trong thay đổi mã nguồn này.

**Cảnh báo staging:** Rules đã Publish trước đó có thể vẫn là phiên bản Phase 04 cũ cho phép caregiver ghi trực tiếp vào thuốc. Cho đến khi chủ dự án xem xét và Publish bộ Rules mới, không coi giới hạn quyền trong giao diện là ranh giới bảo mật phía máy chủ; không dùng tài khoản người chăm sóc để thử các thao tác ghi trên dữ liệu sức khỏe staging.

## 7. Tiêu chí nghiệm thu

1. Người cao tuổi có thể thêm, sửa, ngừng và xóa mềm thuốc của mình.
2. Người chăm sóc đang kết nối có thể đọc thuốc nhưng mọi thao tác ghi trực tiếp vào collection thuốc đều bị Rules từ chối.
3. Người chăm sóc gửi được đề xuất thêm/sửa/ngừng/xóa; không thể tự duyệt hoặc thay đổi đề xuất.
4. Người cao tuổi xem được đề xuất và duyệt/từ chối; duyệt áp dụng thay đổi, từ chối giữ nguyên thuốc.
5. Người cao tuổi và người chăm sóc đang kết nối có thể thêm nhật ký uống thuốc; cả hai có thể đọc; không ai được sửa/xóa nhật ký.
6. Người không kết nối và người chăm sóc sau khi ngắt kết nối không thể đọc thuốc, đề xuất hoặc nhật ký, cũng không thể tạo đề xuất/nhật ký.
7. Người chăm sóc không được cấp quyền đại diện hợp pháp chỉ do kết nối gia đình.
8. TypeScript, ESLint, Unit tests, Auth Emulator, Firestore Rules Emulator và Expo Doctor phải đạt. Sau đó chủ dự án kiểm thử trên iPhone trước khi merge.

## 8. Ngoài phạm vi Phase 04

- Nhắc giờ, thông báo đẩy, xác nhận liều theo lịch và lịch sử liều theo kế hoạch thuộc Phase 05.
- OCR đơn thuốc thuộc Phase 06.
- Xác minh giấy tờ người đại diện, tài khoản quản trị xác minh và cơ chế ủy quyền có giá trị pháp lý chưa được triển khai.
