# Phase 06 — OCR feasibility gate

Status: prototype only; not accepted, not a production OCR screen. No medication writes and no Firebase/Rules changes.

- Expo SDK 58: expo-image-picker (~58.0.10), react-native-webview (14.0.1).
- Tesseract.js 6.0.1 in WebView, core 6.0.0, vie+eng. Language assets: projectnaptha 4.0.0. Network required in this probe. The runtime is loaded from a CDN; **never use a real or identifiable prescription in this probe**.
- The integrated fake prescription is drawn onto a real canvas and recognized by Tesseract; output is not hardcoded.
- Test on iPhone in Expo Go: open medication management, tap "Thử OCR đơn thuốc (mẫu thử)", run the built-in sample, then choose an anonymous sample photo. Check result against image, accents, two names/strengths and elapsed time. Try cancel/retry and camera denial.
- Before enabling real prescription processing, bundle or securely verify OCR executable assets and restrict outbound traffic. Do not send image/text to external services. Clean temporary images created by app.
- Validation in Phase 04 requires frequency and exact times; do not invent times or schedule PRN medication. Final workflow must block incomplete items and reuse role-checked Phase 04 write operations.
- Physical iPhone tests, typecheck, lint, npm test and Expo Doctor remain unverified at the time this prototype was committed. Do not merge until acceptance and complete implementation.
