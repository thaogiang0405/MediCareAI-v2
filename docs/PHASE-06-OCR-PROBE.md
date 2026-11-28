# Phase 06 — Prescription OCR and medication import

Current scope: OCR image test, local text parsing, human review, and role-checked medication creation/proposals. No prescription image is uploaded or stored yet. No Firebase Rules or Storage configuration changes are included.

## Current workflow

1. The user captures or selects a fabricated/fully anonymized prescription image.
2. ImageManipulator normalizes the image to JPEG at up to 2000 × 2800 px.
3. Tesseract.js 6.0.1 in WebView runs four local OCR passes (PSM 3, 6, 4, 11) using Vietnamese and English trained data.
4. The user chooses an OCR candidate and asks the local parser to split medicine entries.
5. The parser extracts only explicit name/strength, dosage, frequency, exact HH:mm times, and directions. It does not correct malformed OCR strings, infer missing dosage, or invent times.
6. Every parsed medicine is displayed in an editable review card. Required values must pass existing Phase 04 medication validation before submission.
7. Senior accounts create official medication records in one Firestore batch. Caregiver accounts create pending create-proposals and notification records in one Firestore batch; the senior must approve them.

## Limits and safety

- Parser is deterministic and heuristic, not a clinical decision system. OCR text can be wrong. User review against the source prescription remains mandatory.
- Frequency, dosage, and exact times that cannot be read remain incomplete and block saving until the user enters them.
- The OCR runtime and language data are still downloaded from pinned CDN URLs. This test build must use fabricated or fully anonymized documents only.
- The original image remains temporary in app memory/cache and is not saved to Firestore or Storage.
- Do not store image Base64 in Firestore. A later image-retention phase must decide between a local-only attachment (not shared across devices) and a secure object-storage service with explicit cost, privacy, access, retention, and deletion approval. Firebase Storage on Blaze must not be enabled without separate user approval.
- Existing role boundaries remain: only a senior writes the official medication list; caregivers submit proposals for senior review.
- Medication writes use existing medication schema and Phase 04 validation. No Firestore Rules or staging deployment changes are part of this commit.

## Tests

- Parser unit tests cover two medicine blocks, strict HH:mm recognition, missing frequency, and excluding strength-like numbers from notes.
- On-device OCR, Firestore staging, and iPhone end-to-end tests still require manual verification.
