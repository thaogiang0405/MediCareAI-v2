import type { MedicationDraft, MedicationForm } from "./validation";

export type PrescriptionParseResult = { medications: MedicationDraft[]; warnings: string[] };

const STRENGTH = /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|iu)(?:\s*\/\s*\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml))?/i;
const EXCLUDED_PREFIX = /^(?:ma|ngay|ghi chu|ham luong|lieu|so luong|thoi gian|thoi diem|huong dan|medicare|phieu|don thuoc|du lieu|khong dung|thuoc gia lap)\b/i;
const TIME = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g;
const DOSE = /(?:mỗi\s+lần|liều(?:\s+mẫu|\s+dùng)?|liều\s+uống)\s*[:：]?\s*(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s*(viên\s*nang|viên|ml|gói|giọt|ống|thìa|mg|mcg|g)(?:\s*\/\s*lần)?/i;
const DOSE_SHORT = /(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s*(viên\s*nang|viên|ml|gói|giọt|ống|thìa|mg|mcg|g)\s*\/\s*lần/i;
const FREQUENCY = /(?:mỗi\s+ngày|ngày)\s*(\d+)\s*lần|\b(\d+)\s*lần\s*\/\s*ngày/i;

function cleanLine(value: string): string {
  return value.replace(/[•·▪◦]/g, " ").replace(/\s+/g, " ").trim();
}

function candidateFromLine(line: string): { name: string; strength: string } | null {
  const normalized = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!line || EXCLUDED_PREFIX.test(normalized)) return null;
  const explicit = /^(?:tên thuốc|thuốc)\s*[:：]\s*(.+)$/i.exec(line);
  const numbered = /^\s*\d{1,2}[.)-]\s*(.+)$/.exec(line);
  const content = explicit?.[1] ?? numbered?.[1] ?? line;
  const strengthMatch = STRENGTH.exec(content);
  if (!strengthMatch && !explicit && !numbered) return null;
  const name = (strengthMatch ? content.slice(0, strengthMatch.index) : content)
    .replace(/^\s*\d{1,2}[.)-]\s*/, "")
    .replace(/\|/g, " ")
    .replace(/[,:;–—-]+$/g, "")
    .trim();
  if (name.length < 2 || !/[\p{L}]/u.test(name)) return null;
  return { name: name.slice(0, 120), strength: strengthMatch?.[0].trim() ?? "" };
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
      .replace(/(?:dùng lúc|uống lúc)\s*\d{1,2}:\d{2}\s*[,;]?/i, "")
      .trim()];
  });
  return [...new Set(collected)].join(" ").slice(0, 500);
}

export function parsePrescriptionText(text: string): PrescriptionParseResult {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const candidates: Array<{ index: number; name: string; strength: string }> = [];
  for (let index = 0; index < lines.length; index++) {
    const candidate = candidateFromLine(lines[index]);
    if (candidate) candidates.push({ index, ...candidate });
  }
  const warnings: string[] = [];
  if (candidates.length > 10) warnings.push("Chỉ xử lý tối đa 10 mục thuốc trong một lần nhập.");
  const selected = candidates.slice(0, 10);
  const medications = selected.map((candidate, index) => {
    const nextIndex = selected[index + 1]?.index ?? lines.length;
    const block = lines.slice(candidate.index, nextIndex);
    const blockText = block.join("\n");
    const dose = parseDose(blockText);
    const frequency = parseFrequency(blockText);
    const times = [...new Set(blockText.match(TIME) ?? [])];
    const intakeTimes = frequency > 0
      ? Array.from({ length: frequency }, (_, timeIndex) => times[timeIndex] ?? "")
      : times.slice(0, 6);
    if (frequency > 0 && times.length > frequency) warnings.push(candidate.name + ": số giờ OCR nhận diện nhiều hơn số lần/ngày; vui lòng kiểm tra.");
    if (frequency > 0 && times.length < frequency) warnings.push(candidate.name + ": thiếu giờ uống cho một hoặc nhiều lần; không tự điền giờ.");
    if (frequency === 0) warnings.push(candidate.name + ": chưa nhận diện rõ số lần sử dụng trong ngày; cần nhập và xác nhận.");
    if (!dose.dosage || !dose.dosageUnit) warnings.push(candidate.name + ": chưa nhận diện rõ liều lượng hoặc đơn vị; cần nhập thủ công.");
    return {
      name: candidate.name, strengthText: candidate.strength, dosage: dose.dosage, dosageUnit: dose.dosageUnit,
      dosageForm: inferForm(dose.dosageUnit, blockText), frequency, intakeTimes,
      directionsText: extractDirections(block), startDate: "", endDate: "", notes: "",
    } satisfies MedicationDraft;
  });
  if (medications.length === 0) warnings.push("Chưa tìm thấy dòng tên thuốc có hàm lượng hoặc nhãn Tên thuốc. Hãy chọn kết quả OCR khác hoặc nhập thuốc thủ công.");
  return { medications, warnings };
}
