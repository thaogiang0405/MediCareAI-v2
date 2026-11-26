# Phạm vi MediCare AI V2

## Phase 01
- Khởi tạo Expo SDK 58, React Native 0.88, React 19.3, TypeScript, Expo Router.
- Giao diện nền tảng tiếng Việt: chào mừng, đăng nhập, đăng ký, chọn vai trò, trang chủ người cao tuổi và người thân.
- Thành phần dùng chung, Safe Area, xử lý bàn phím, biến môi trường và module Firebase tùy chọn.

## Chưa triển khai
Firebase Authentication thật, Firestore CRUD, kết nối người thân, thuốc, lịch, thông báo, OCR, AI chatbot, theo dõi sức khỏe.

## Bảo toàn Firebase
Dùng Firebase project hiện tại; không tạo project mới, không xóa/di chuyển dữ liệu, không đổi Rules, không deploy Functions. Chỉ dùng cấu hình Web App qua EXPO_PUBLIC_*; không commit .env hoặc service-account/private key.

## Tiêu chí hoàn tất
Cài npm, typecheck/lint/Expo Doctor đạt, chạy được khi chưa có Firebase config, điều hướng được và người dùng xác nhận chạy trên iPhone thật.