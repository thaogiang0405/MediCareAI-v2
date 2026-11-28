import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrescriptionText } from "../src/features/medication/prescriptionParser.ts";

test("parses two medicines from Vietnamese OCR without inventing fields", () => {
  const text = `
MEDICARE AI | PHIẾU OCR MẪU 02
DỮ LIỆU GIẢ LẬP - KHÔNG DÙNG ĐIỀU TRỊ
Mã mẫu: OCR-TEST-002
Ngày: 28/11/2026
THUỐC GIẢ LẬP SỐ 1
Placebo C 125 mg
Mỗi lần 2 viên; ngày 1 lần.
Dùng lúc 21:15, trước khi ngủ.
Ghi chú: dữ liệu kiểm thử ký tự 1,5 ml và 0,25 mg.
THUỐC GIẢ LẬP SỐ 2
SampleDuo Delta 5 mg/2 ml
Liều mẫu: 2 ml/lần, ngày 2 lần.
Thời điểm: 06:45 và 18:45.
Hướng dẫn: lắc đều trước khi dùng.
`;
  const result = parsePrescriptionText(text);
  assert.equal(result.medications.length, 2);
  assert.deepEqual(result.sourceNameLines, ["Placebo C 125 mg", "SampleDuo Delta 5 mg/2 ml"]);
  assert.deepEqual(result.medications[0], {
    name: "Placebo C", strengthText: "125 mg", dosage: "2", dosageUnit: "viên",
    dosageForm: "tablet", frequency: 1, intakeTimes: ["21:15"],
    directionsText: "trước khi ngủ.", startDate: "", endDate: "", notes: "",
  });
  assert.deepEqual(result.medications[1], {
    name: "SampleDuo Delta", strengthText: "5 mg/2 ml", dosage: "2", dosageUnit: "ml",
    dosageForm: "other", frequency: 2, intakeTimes: ["06:45", "18:45"],
    directionsText: "lắc đều trước khi dùng.", startDate: "", endDate: "", notes: "",
  });
});

test("does not autocorrect malformed OCR times", () => {
  const result = parsePrescriptionText(`
Tên thuốc: Demo Alpha 250 mg
Mỗi lần 2 viên; ngày 1 lần.
Dùng lúc 21115, trước khi ngủ.
`);
  assert.equal(result.medications[0].frequency, 1);
  assert.deepEqual(result.medications[0].intakeTimes, [""]);
  assert.equal(result.medications[0].directionsText, "trước khi ngủ.");
  assert.match(result.warnings.join(" "), /chưa đọc rõ/);
});

test("does not infer daily frequency from time mentions alone", () => {
  const result = parsePrescriptionText(`
Tên thuốc: Sample Beta 10 mg
Liều dùng: 1 viên/lần.
Thời điểm: 07:30 và 19:30.
`);
  assert.equal(result.medications[0].frequency, 0);
  assert.deepEqual(result.medications[0].intakeTimes, ["07:30", "19:30"]);
  assert.match(result.warnings.join(" "), /chưa nhận diện rõ số lần/);
});

test("ignores strength-like values in notes and headers", () => {
  const result = parsePrescriptionText(`
MEDICARE AI - OCR TEST
Ghi chú: kiểm thử 1,5 ml và 0,25 mg.
Ngày: 28/11/2026
`);
  assert.equal(result.medications.length, 0);
});

test("keeps the position of an unreadable first time instead of shifting the second time", () => {
  const result = parsePrescriptionText(`
Tên thuốc: Sample Delta 5 mg
Liều mẫu: 2 ml/lần, ngày 2 lần.
Thời điểm: OB 45 và 18:45.
`);
  assert.equal(result.medications[0].frequency, 2);
  assert.deepEqual(result.medications[0].intakeTimes, ["", "18:45"]);
  assert.match(result.warnings.join(" "), /chưa đọc rõ/);
});

test("does not treat a numbered instruction as a medicine name", () => {
  const result = parsePrescriptionText(`
1. Uống sau ăn 500 mg.
2. Kiểm tra lại lúc 08:00.
`);
  assert.equal(result.medications.length, 0);
});
