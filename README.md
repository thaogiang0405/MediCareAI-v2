# MediCare AI V2

Ứng dụng di động hỗ trợ chăm sóc sức khỏe người cao tuổi, xây dựng mới bằng React Native, Expo SDK 58, TypeScript, Expo Router và Firebase JS SDK.

## Stack
- Expo SDK 58; React Native 0.88; React 19.3.0.
- Node.js 24.14.0 phù hợp: SDK 58 yêu cầu Node 22.13+ hoặc Node 24.3+.
- Tài liệu: https://expo.dev/sdk/58 và https://docs.expo.dev/versions/v58.0.0/.

## Windows: cài đặt an toàn
Trước tiên kiểm tra thư mục để không ghi đè dữ liệu:
```powershell
node -v
npm -v
git --version
Test-Path 'D:\Yang\HK7\DNT\MediCareAI'
Get-ChildItem 'D:\Yang\HK7\DNT' -Force
```
Nếu thư mục đích không tồn tại hoặc trống:
```powershell
git clone https://github.com/thaogiang0405/MediCareAI-v2.git 'D:\Yang\HK7\DNT\MediCareAI'
Set-Location 'D:\Yang\HK7\DNT\MediCareAI'
```
Nếu thư mục đã có dữ liệu, KHÔNG clone đè; clone sang thư mục mới:
```powershell
git clone https://github.com/thaogiang0405/MediCareAI-v2.git 'D:\Yang\HK7\DNT\MediCareAI-v2'
Set-Location 'D:\Yang\HK7\DNT\MediCareAI-v2'
```
Cài và kiểm tra:
```powershell
npm install
npx expo install --fix
npx expo-doctor
npm run typecheck
npm run lint
```
Nếu npm báo ERESOLVE hoặc Expo báo phiên bản lệch, dừng và gửi nguyên văn lỗi; không dùng --force hoặc --legacy-peer-deps.

## iPhone / Expo Go
Kết nối iPhone và Windows cùng Wi-Fi rồi chạy `npx expo start --lan`; quét QR bằng Camera hoặc Expo Go. Nếu LAN lỗi, Ctrl+C rồi chạy `npx expo start --tunnel`. Không cần Xcode hay iOS Simulator trên Windows. Cần xác nhận bản Expo Go đang cài hỗ trợ SDK 58; nếu không, chọn Expo Go tương thích trên App Store hoặc EAS Development Build. Không giả định có thể build iOS native trực tiếp trên Windows.

## Firebase
Chỉ giữ Firebase project hiện tại. Sao chép `.env.example` thành `.env` và điền Firebase Web App config sau khi đối chiếu project. Chưa bật Authentication, chưa đọc/ghi Firestore. Không commit .env, service account hoặc private key; không đổi Security Rules, xóa dữ liệu hoặc deploy Functions.

## Routes
- `/` chào mừng
- `/auth/login` đăng nhập (chưa xác thực)
- `/auth/register` đăng ký (chưa tạo tài khoản)
- `/role-select` chọn giao diện xem trước
- `/home/senior` và `/home/family` dashboard mẫu

## Docs
Xem `AGENTS.md`, `docs/PROJECT_SCOPE.md`, `docs/PROGRESS.md`. Kiểm thử Windows/iPhone chưa được thực hiện trong phiên ChatGPT; chỉ đánh dấu đạt sau khi chạy thực tế.
