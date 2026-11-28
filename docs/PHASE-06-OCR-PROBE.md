# Phase 06 — OCR feasibility gate

Status: prototype iteration 2 (image normalization and multi-pass OCR). This is still a test-only screen: it does not create or update medication records and does not change Firebase or Firestore Rules.

## OCR pipeline

- Expo SDK 58 remains unchanged.
- `expo-image-picker` captures or selects one image.
- `expo-image-manipulator` normalizes the selected image to JPEG, downsizes to at most 2000 × 2800 px, and exports a high-quality Base64 payload for the isolated WebView.
- Tesseract.js 6.0.1 runs locally in the WebView with Vietnamese and English language data (`vie+eng`).
- The WebView creates four candidates: original image / PSM 3, contrast-stretched grayscale / PSM 6, shadow-corrected grayscale / PSM 4, and Otsu-binarized image / PSM 11.
- Candidates are shown separately and ordered by Tesseract confidence. Confidence is an engine score, not a probability that a medicine name, strength, dosage, or time is correct. No drug names, numbers, doses, or times are automatically corrected.
- This prototype still downloads the OCR runtime and language data from pinned CDN URLs. It is not approved for real or identifiable prescriptions. Test only with fabricated or fully anonymized images.

## iPhone test plan

1. Run the built-in synthetic sample.
2. Select the same anonymous sample image from Photos and compare all four candidates.
3. Capture the same sample using the iPhone camera and compare all four candidates.
4. Record which candidate has the best exact reading of names, strengths, dosage, and times. Do not accept a result merely because its confidence score is high.
5. Test cancel, retry, camera permission denied, a large image, and an image with shadows.
6. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run doctor` locally. Physical iPhone verification remains required.

## Medication and image retention boundary

- The OCR screen does not save medication data or images to Firebase.
- A future medication-entry workflow may attach the original captured prescription image to the medication record, with explicit user confirmation and a secure owner-scoped access model.
- Do not store Base64 image data inside a Firestore medication document. Firestore documents have a 1 MiB size limit, and embedding images would inflate reads/writes and complicate privacy and retention.
- The current project constraint is zero budget / Firebase Spark and explicitly excludes Firebase Storage and Blaze. Cloud Storage for Firebase requires the Blaze plan; do not enable billing or create a bucket without the owner's separate approval.
- If the project remains on Spark, a future local-only attachment can be considered, but it will not sync to caregivers or other devices and may be lost when app data is removed. If cross-device sharing is required, first obtain approval for an appropriate secure object-storage service and its billing, access rules, retention, and deletion design.
- The final workflow must reuse the role-checked Phase 04 medication write operations. Caregivers must continue to submit proposals rather than writing directly to the senior's medication record.
- Never infer a missing dosage or schedule. The senior must review and confirm every recognized field before saving.

## Acceptance gate

Do not merge Phase 06 until the iPhone camera and photo-library tests are repeatable, OCR errors are visibly reviewable, medication entry is integrated with the existing authorization model, and typecheck/lint/tests/Expo Doctor have passed.
