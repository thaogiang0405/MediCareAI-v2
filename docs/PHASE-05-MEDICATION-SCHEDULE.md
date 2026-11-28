# Phase 05 — Lịch uống thuốc, nhắc nhở và giọng nói

- Múi giờ theo hồ sơ hiện có: Asia/Ho_Chi_Minh (UTC+7). Lịch hiện tại/tương lai dẫn xuất từ thuốc active, đủ dữ liệu, nằm trong ngày bắt đầu/kết thúc (bao gồm hai mốc).
- Lịch quá khứ chỉ là nhật ký thực tế, không hồi tố thuốc hiện tại. Nhật ký Phase 04 không có giờ theo lịch nên không suy đoán hoặc tính vào số liều theo lịch.
- Một liều là bộ (medicationId, scheduledDate, scheduledTime). Document ID cố định dose_YYYY-MM-DD_HH:mm_medicationId. Transaction đọc bản ghi trước khi tạo; Firestore chỉ cho create, không update/delete. Xác nhận chỉ trong ngày hiện tại theo giờ Việt Nam; xác nhận trước giờ nếu thuốc thực tế đã uống là khai báo người dùng. Quá giờ sau 60 phút chỉ có nghĩa chưa xác nhận, không suy ra bỏ liều. Nếu thuốc đổi giờ, bản ghi trước vẫn còn trong nhật ký.
- Người cao tuổi và caregiver đang kết nối xem/xác nhận, Rules kiểm tra chủ hồ sơ, giờ, ngày, người ghi nhận và trạng thái thuốc. Không cấp quyền sửa thuốc cho caregiver. Dữ liệu xác nhận không phải xác minh y tế.
- Nhắc nhở opt-in cho senior theo thiết bị/tài khoản; nội dung chung, tối đa 48 mốc/7 ngày, nhóm cùng giờ. Không gửi nhắc cho liều đã xác nhận khi dữ liệu đã đồng bộ. Đồng bộ lúc mở/foreground hoặc snapshot thay đổi; nếu app đóng hoặc mất mạng, thay đổi Firestore có thể chưa phản ánh, cần mở lại ứng dụng định kỳ. Không remote push, không Cloud Functions, không EAS.
- TTS dùng giọng tiếng Việt có sẵn trên thiết bị, dừng khi rời màn hình. iPhone cần tắt silent mode; không tự tạo tư vấn hoặc liều lượng.
- Legacy log writer remains for backwards compatibility with Phase 04 clients; scheduled totals use only canonical scheduled log IDs. New UI routes intake to individual doses.
- Bước nghiệm thu: CI, Windows, iPhone thật, xin quyền thông báo, kiểm tra foreground/background/đóng app, đổi lịch, ngừng thuốc, xác nhận hai tài khoản, ngắt kết nối, đăng xuất, kiểm tra TTS. Chưa được coi là PASS thiết bị trước khi chủ dự án xác nhận.
