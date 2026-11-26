# MediCare AI V2 rules
- Keep Expo SDK at 58. Never upgrade/downgrade without owner approval.
- Use TypeScript, Expo Router and npm. Prefer npx expo install for Expo/native packages.
- UI is Vietnamese, senior-friendly, high contrast, large touch targets and Safe Areas.
- iPhone is the primary physical test device. Windows has no Xcode/iOS Simulator assumption.
- Never fake Firebase authentication or backend success.
- Reuse the existing Firebase project only. Never create a new project, delete/migrate data, change Security Rules or deploy Cloud Functions without explicit approval.
- Keep .env, service accounts and private keys out of Git.
- Inspect Git status and preserve existing local files before changes. Never force-push.
- Run typecheck, lint and Expo Doctor; distinguish actual tests from unrun device tests.