import type { MedicationDraft, MedicationForm } from "./validation";

export type PrescriptionParseResult = {
  medications: MedicationDraft[];
  sourceNameLines: string[];
  warnings: string[];
};

type MedicineCandidate = { index: number; name: string; strength: string; sourceLine: string };

const STRENGTH = /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|iu)(?:\s*\/\s*\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml))?/i;
const EXCLUDED_PREFIX = /^(?:ma|ngay|ghi chu|ham luong|lieu|so luong|thoi gian|thoi diem|huong dan|medicare|phieu|don thuoc|du lieu|khong dung|thuoc gia lap|uong|sau an|truoc an)\b/i;
const TIME = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g;
const TIME_CONTEXT = /(?:thời điểm|thoi diem|dùng lúc|dung luc|uống lúc|uong luc|giờ uống|gio uong|lúc|luc)\s*[:：]?\s*(.*)$/i;
const DOSE = /(?:mỗi\s+lần|liều(?:\s+mẫu|\s+dùng)?|liều\s+uống)\s*[:：]?\s*(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s*(viên\s*nang|viên|ml|gói|giọt|ống|thìa|mg|mcg|g)(?:\s*\/\s*lần)?/i;
const DOSE_SHORT = /(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s*(viên\s*nang|viên|ml|gói|giọt|ống|thìa|mg|mcg|g)\s*\/\s*lần/i;

function cleanLine(value: string): string {
  return value.replace(/[•·▪◦]/g, " ").replace(/\s+/g, " ").trim();
}

function candidateFromLine(line: string, index: number): MedicineCandidate | null {
  const normalized = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!line || EXCLUDED_PREFIX.test(normalized)) return null;
  const explicit = /^(?:tên thuốc|thuốc)\s*[:：]\s*(.+)$/i.exec(line);
  const numbered = /^\s*\d{1,2}[.)-]\s*(.+)$/.exec(line);
  const content = explicit?.[1] ?? numbered?.[1] ?? line;
  const contentNormalized = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (EXCLUDED_PREFIX.test(contentNormalized)) return null;
  const strengthMatch = STRENGTH.exec(content);

  // A numbered instruction or arbitrary line is not a medicine name.
  // Accept only a line with a readable strength, or an explicit medicine-name label.
  if (!strengthMatch && !explicit) return null;

  const name = (strengthMatch ? content.slice(0, strengthMatch.index) : content)
    .replace(/^\s*\d{1,2}[.)-]\s*/, "")
    .replace(/\|/g, " ")
    .replace(/[,:;–—-]+$/g, "")
    .trim();
  if (name.length < 2 || !/[A-Za-zÀ-ỹ]/i.test(name)) return null;
  return { index, name: name.slice(0, 120), strength: strengthMatch?.[0].trim() ?? "", sourceLine: line };
}

function parseDose(text: string): { dosage: string; dosageUnit: string } {
  const match = DOSE.exec(text) ?? DOSE_SHORT.exec(text);
  if (!match) return { dosage: "", dosageUnit: "" };
  return { dosage: match[1].replace(/\s+/g, ""), dosageUnit: match[2].toLowerCase().replace(/\s+/g, " ") };
}

function parseFrequency(text: string): number {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const match = /(?:moi\s+ngay|ngay)\s*(\d+)\s*lan|\b(\d+)\s*lan\s*\/\s*ngay/i.exec(normalized);
  return match ? Number(match[1] ?? match[2]) : 0;
}

function extractTimeSlots(text: string): string[] {
  const slots: string[] = [];
  let foundTimeContext = false;

  for (const line of text.split(/\r?\n/)) {
    const context = TIME_CONTEXT.exec(line);
    if (!context) continue;
    foundTimeContext = true;

    const parts = context[1].split(/\s*(?:,|;|\bvà\b|\bva\b)\s*/i);
    for (const part of parts) {
      const value = part.trim();
      if (!value) continue;
      const exact = /(?:^|\D)((?:[01]?\d|2[0-3]):[0-5]\d)(?:\D|$)/.exec(value);
      if (exact) {
        slots.push(exact[1]);
      } else if (/\d/.test(value) && /^[A-Za-zÀ-ỹ\s]*\d[\d\s]*[A-Za-zÀ-ỹ\s]*$/.test(value)) {
        // Keep the position of an unreadable time, but never guess its digits.
        slots.push("");
      }
    }
  }

  if (foundTimeContext) return slots;
  return text.match(TIME) ?? [];
}

function inferForm(unit: string, text: string): MedicationForm {
  const lower = (unit + " " + text).toLocaleLowerCase("vi");
  if (lower.includes("viên nang")) return "capsule";
  if (lower.includes("viên")) return "tablet";
  if (lower.includes("gói")) return "powder";
  if (lower.includes("siro")) return "syrup";
  if (lower.includes("dung dịch")) return "solution";
  return "other";
}

function extractDirections(lines: string[]): string {
  const collected = lines.flatMap(line => {
    const normalized = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!/(huong dan|dung luc|uong luc|sau an|truoc an|truoc khi ngu|sau bua|lac deu|sau khi an|truoc bua)/.test(normalized)) return [];
    return [line
      .replace(/^(?:hướng dẫn|ghi chú)\s*[:：]?\s*/i, "")
      .replace(/(?:dùng lúc|uống lúc)\s*(?:[A-Z]{1,3}\s*)?\d[\d:./-]*\s*[,;]?/i, "")
      .trim()];
  });
  return [...new Set(collected)].join(" ").slice(0, 500);
}

export function parsePrescriptionText(text: string): PrescriptionParseResult {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const candidates: MedicineCandidate[] = [];
  for (let index = 0; index < lines.length; index++) {
    const candidate = candidateFromLine(lines[index], index);
    if (candidate) candidates.push(candidate);
  }

  const warnings: string[] = [];
  if (candidates.length > 10) warnings.push("Chỉ xử lý tối đa 10 mục thuốc trong một lần nhập.");
  const selected = candidates.slice(0, 10);
  const sourceNameLines = selected.map(candidate => candidate.sourceLine);

  const medications = selected.map((candidate, index) => {
    const nextIndex = selected[index + 1]?.index ?? lines.length;
    const block = lines.slice(candidate.index, nextIndex);
    const blockText = block.join("\n");
    const dose = parseDose(blockText);
    const frequency = parseFrequency(blockText);
    const detectedSlots = extractTimeSlots(blockText);
    const intakeTimes = frequency > 0
      ? Array.from({ length: frequency }, (_, timeIndex) => detectedSlots[timeIndex] ?? "")
      : detectedSlots.slice(0, 6);

    if (frequency > 0 && detectedSlots.length > frequency) {
      warnings.push(candidate.name + ": số mốc giờ OCR nhận diện nhiều hơn số lần/ngày; vui lòng kiểm tra.");
    }
    if (frequency > 0 && intakeTimes.some(time => !time)) {
      warnings.push(candidate.name + ": OCR chưa đọc rõ một hoặc nhiều giờ uống. Hãy tự chọn giờ; ứng dụng không tự đoán.");
    }
    if (frequency === 0) warnings.push(candidate.name + ": chưa nhận diện rõ số lần sử dụng trong ngày; cần chọn và xác nhận.");
    if (!dose.dosage || !dose.dosageUnit) warnings.push(candidate.name + ": chưa nhận diện rõ liều lượng hoặc đơn vị; cần nhập thủ công.");

    return {
      name: candidate.name,
      strengthText: candidate.strength,
      dosage: dose.dosage,
      dosageUnit: dose.dosageUnit,
      dosageForm: inferForm(dose.dosageUnit, blockText),
      frequency,
      intakeTimes,
      directionsText: extractDirections(block),
      startDate: "",
      endDate: "",
      notes: "",
    } satisfies MedicationDraft;
  });

  if (medications.length === 0) {
    warnings.push("Chưa tìm thấy dòng tên thuốc đủ rõ. Chỉ nhận diện dòng có hàm lượng hoặc nhãn Tên thuốc; không tự suy đoán tên.");
  }
  return { medications, sourceNameLines, warnings };
}
