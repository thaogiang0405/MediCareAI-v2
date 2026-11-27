export const MEDICATION_FORMS = [
  { value: "tablet", label: "Viên" },
  { value: "capsule", label: "Viên nang" },
  { value: "syrup", label: "Siro" },
  { value: "solution", label: "Dung dịch" },
  { value: "powder", label: "Gói bột" },
  { value: "other", label: "Khác" },
] as const;

export type MedicationForm = (typeof MEDICATION_FORMS)[number]["value"];

export type MedicationDraft = {
  name: string;
  strengthText: string;
  dosage: string;
  dosageUnit: string;
  dosageForm: MedicationForm;
  frequency: number;
  intakeTimes: string[];
  directionsText: string;
  startDate: string;
  endDate: string;
  notes: string;
};

export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function medicationValidationError(draft: MedicationDraft): string | null {
  if (!draft.name.trim()) return "Vui lòng nhập tên thuốc.";
  if (draft.name.trim().length > 120) return "Tên thuốc không được vượt quá 120 ký tự.";
  if (!draft.dosage.trim()) return "Vui lòng nhập liều lượng sử dụng.";
  if (draft.dosage.trim().length > 40) return "Liều lượng không được vượt quá 40 ký tự.";
  if (!draft.dosageUnit.trim()) return "Vui lòng nhập đơn vị sử dụng.";
  if (draft.dosageUnit.trim().length > 40) return "Đơn vị sử dụng không được vượt quá 40 ký tự.";
  if (draft.strengthText.length > 80) return "Hàm lượng không được vượt quá 80 ký tự.";
  if (draft.directionsText.length > 500) return "Hướng dẫn sử dụng không được vượt quá 500 ký tự.";
  if (draft.notes.length > 500) return "Ghi chú không được vượt quá 500 ký tự.";
  if (!MEDICATION_FORMS.some(form => form.value === draft.dosageForm)) {
    return "Vui lòng chọn dạng thuốc hợp lệ.";
  }
  if (!Number.isInteger(draft.frequency) || draft.frequency < 1 || draft.frequency > 6) {
    return "Số lần sử dụng trong ngày phải từ 1 đến 6.";
  }
  if (draft.intakeTimes.length !== draft.frequency) {
    return "Số khung giờ phải bằng số lần sử dụng trong ngày.";
  }
  const uniqueTimes = new Set(draft.intakeTimes);
  if (uniqueTimes.size !== draft.intakeTimes.length) {
    return "Các khung giờ uống thuốc không được trùng nhau.";
  }
  if (draft.intakeTimes.some(time => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    return "Giờ uống thuốc phải theo định dạng HH:mm, ví dụ 08:00.";
  }
  if (draft.startDate && !isCalendarDate(draft.startDate)) {
    return "Ngày bắt đầu không hợp lệ. Vui lòng nhập theo dạng YYYY-MM-DD.";
  }
  if (draft.endDate && !isCalendarDate(draft.endDate)) {
    return "Ngày kết thúc không hợp lệ. Vui lòng nhập theo dạng YYYY-MM-DD.";
  }
  if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
    return "Ngày kết thúc không được trước ngày bắt đầu.";
  }
  return null;
}

export function normalizeMedicationDraft(draft: MedicationDraft): MedicationDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    strengthText: draft.strengthText.trim(),
    dosage: draft.dosage.trim(),
    dosageUnit: draft.dosageUnit.trim(),
    intakeTimes: draft.intakeTimes.map(time => time.trim()).sort(),
    directionsText: draft.directionsText.trim(),
    startDate: draft.startDate.trim(),
    endDate: draft.endDate.trim(),
    notes: draft.notes.trim(),
  };
}
