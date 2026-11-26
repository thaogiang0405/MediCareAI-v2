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

## Phase 02 — thử nghiệm Emulator (chưa nghiệm thu)

Firebase project cũ medicare-ai-cf804 được chọn làm staging vì chỉ chứa dữ liệu thử nghiệm theo xác nhận của chủ dự án. Rules do chủ dự án cung cấp được lưu làm Rules cho Emulator để kiểm thử; không tự động deploy lại lên Firebase. App chuyển vai trò giao diện `senior/family` sang schema lưu trữ `elderly/caregiver`; email tiếp tục nằm trong Firebase Authentication, không lưu trong hồ sơ Firestore. Không xóa dữ liệu cũ trước khi kiểm kê/sao lưu. Project ID demo-medicare-ai chỉ dùng trên máy local. Không dùng dữ liệu sức khỏe thật, không Blaze, không Storage, không SMS.

Để dùng staging sau khi được duyệt, điền các biến EXPO_PUBLIC_FIREBASE_* trong .env từ Web App config và đặt EXPO_PUBLIC_FIREBASE_MODE=staging. Project ID được kiểm tra bắt buộc phải là medicare-ai-cf804. Không deploy Rules từ repo trước khi so sánh với Rules hiện tại và được chủ dự án chấp thuận.

Windows CMD (chỉ chuyển nhánh khi git status sạch):
```cmd
git fetch origin
git switch --track origin/feature/phase-02-auth
npm install
copy .env.example .env
ipconfig
notepad .env
```
Đặt EXPO_PUBLIC_FIREBASE_MODE=emulator và EXPO_PUBLIC_FIREBASE_EMULATOR_HOST bằng IPv4 LAN của máy Windows. Chỉ dùng Wi-Fi riêng tin cậy, không mở port ra Internet. Cài Java JDK 21 nếu thiếu. CMD 1:
```cmd
npx firebase-tools emulators:start --config firebase.emulator.json --project demo-medicare-ai --only auth,firestore
```
CMD 2:
```cmd
npx expo start --lan --clear
```
Mở Expo Go SDK 58 trên iPhone cùng Wi-Fi. Emulator UI: http://localhost:4000. Password reset Emulator in link ra terminal, không gửi email thật. Giữ emulator chạy khi thử đóng/mở app. Không dùng firebase deploy. Rules test sẽ xóa dữ liệu Firestore giả lập nên dừng emulator đang dùng trước khi chạy.

```cmd
npm run typecheck
npm run lint
npm test
npm run test:auth
npm run test:rules
npx expo-doctor
npm audit --omit=dev
```
GitHub Actions đã chạy thành công trên feature branch: TypeScript, ESLint, unit tests (7/7), Firebase Auth Emulator (1/1), Firestore Rules Emulator (7/7) và Expo Doctor (20/20). Đây là kiểm thử CI, không thay thế kiểm thử Windows/iPhone. `npm audit --omit=dev` còn 3 cảnh báo moderate của `minimatch` nằm trong công cụ build `@expo/fingerprint` của Expo SDK 58; không dùng `npm audit fix --force` hoặc hạ Expo SDK. Đã ghim `@grpc/grpc-js` ở bản đã vá 1.14.7. Sau khi đồng bộ về Windows, giữ và cập nhật `package-lock.json`, rồi commit lockfile trên feature branch.

Routes: /auth/login, /auth/register, /role-select, /auth/forgot, /auth/complete-profile, /home/senior, /home/family, /profile. Protected Stack dùng trạng thái Auth và role từ server. Chưa nghiệm thu iPhone; PR không merge trước khi owner xác nhận.

Docs: AGENTS.md, docs/PROJECT_SCOPE.md, docs/PROGRESS.md.
