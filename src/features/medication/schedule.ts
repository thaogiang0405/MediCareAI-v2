// All persisted schedule dates follow the existing profile timezone, Vietnam (UTC+7).
export const VIETNAM_OFFSET = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type ScheduleMedication = {
  id: string;
  ownerUid: string;
  name: string;
  strengthText: string;
  dosage: string;
  dosageUnit: string;
  directionsText: string;
  startDate: string;
  endDate: string;
  frequency: number;
  intakeTimes: string[];
  status: "active";
};

export type Dose = {
  id: string;
  medication: ScheduleMedication;
  date: string;
  time: string;
  at: number;
};

export function vietnamDate(now = Date.now()): string {
  return new Date(now + VIETNAM_OFFSET).toISOString().slice(0, 10);
}
export function validDate(date: string): boolean {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
  const value = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date;
}
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + days * DAY_MS).toISOString().slice(0, 10);
}
export function doseTime(date: string, time: string): number {
  return Date.parse(date + "T" + time + ":00+07:00");
}
export function validTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}
export function doseId(medicationId: string, date: string, time: string): string {
  return "dose_" + date + "_" + time + "_" + medicationId;
}

export function isScheduleMedication(value: unknown): value is ScheduleMedication {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<ScheduleMedication>;
  return typeof m.id === "string" && !!m.id
    && typeof m.ownerUid === "string" && !!m.ownerUid
    && m.status === "active"
    && typeof m.name === "string" && !!m.name.trim()
    && typeof m.strengthText === "string"
    && typeof m.dosage === "string" && !!m.dosage.trim()
    && typeof m.dosageUnit === "string" && !!m.dosageUnit.trim()
    && typeof m.directionsText === "string"
    && typeof m.startDate === "string" && (!m.startDate || validDate(m.startDate))
    && typeof m.endDate === "string" && (!m.endDate || validDate(m.endDate))
    && (!m.startDate || !m.endDate || m.endDate >= m.startDate)
    && typeof m.frequency === "number" && Number.isInteger(m.frequency)
    && m.frequency >= 1 && m.frequency <= 6
    && Array.isArray(m.intakeTimes) && m.intakeTimes.length === m.frequency
    && m.intakeTimes.every(time => typeof time === "string" && validTime(time))
    && new Set(m.intakeTimes).size === m.intakeTimes.length;
}

export function buildDoses(medications: readonly ScheduleMedication[], date: string): Dose[] {
  if (!validDate(date)) return [];
  return medications.filter(m => isScheduleMedication(m)
    && (!m.startDate || date >= m.startDate) && (!m.endDate || date <= m.endDate))
    .flatMap(medication => medication.intakeTimes.map(time => ({
      id: doseId(medication.id, date, time), medication, date, time, at: doseTime(date, time),
    }))).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
export function doseStatus(dose: Dose, confirmed: boolean, now = Date.now()): string {
  if (confirmed) return "Đã uống";
  if (now < dose.at) return "Sắp đến giờ";
  if (now < dose.at + 60 * 60 * 1000) return "Đến giờ uống";
  return "Quá giờ — chưa xác nhận";
}

// One private notification per time slot, bounded to avoid iOS pending-notification limits.
export function reminderPlan(medications: readonly ScheduleMedication[], confirmedIds: ReadonlySet<string>, now = Date.now()) {
  const today = vietnamDate(now);
  const slots = new Map<number, { at: number; date: string; time: string }>();
  for (let day = 0; day < 7; day++) {
    for (const dose of buildDoses(medications, shiftDate(today, day))) {
      if (dose.at > now + 1000 && !confirmedIds.has(dose.id)) {
        slots.set(dose.at, { at: dose.at, date: dose.date, time: dose.time });
      }
    }
  }
  return [...slots.values()].sort((a, b) => a.at - b.at).slice(0, 48);
}

export function spokenSchedule(date: string, doses: readonly Dose[], confirmed: ReadonlySet<string>) {
  const day = new Date(doseTime(date, "12:00")).toLocaleDateString("vi-VN", {timeZone:"Asia/Ho_Chi_Minh"});
  const parts = doses.map(dose => {
    const m = dose.medication;
    const [hour, minute] = dose.time.split(":").map(Number);
    return "Lúc " + hour + " giờ " + (minute ? minute + " phút, " : ", ")
      + [m.name, m.strengthText, m.dosage + " " + m.dosageUnit, m.directionsText,
        confirmed.has(dose.id) ? "đã được xác nhận" : "chưa được xác nhận"].filter(Boolean).join(", ") + ".";
  });
  return ["Ngày " + day + ". Có " + doses.length + " liều thuốc trong lịch. "
    + (doses.length - doses.filter(d => confirmed.has(d.id)).length) + " liều chưa xác nhận.", ...parts].join(" ");
}
