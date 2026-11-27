import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { services } from "@/lib/firebase";
import type { Profile } from "@/features/profile/profile";
import type { MedicationDraft } from "./validation";

export type MedicationStatus = "active" | "inactive" | "deleted";

export type MedicationRecord = MedicationDraft & {
  id: string;
  ownerUid: string;
  createdByUid: string;
  updatedByUid: string;
  status: MedicationStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  deletedAt: Timestamp | null;
  revision: number;
};

function database() {
  if (!services) throw new Error("firebase-unavailable");
  return services.db;
}

function assertActor(user: User, profile: Profile, seniorUid: string) {
  if (
    user.uid !== profile.uid
    || services?.auth.currentUser?.uid !== user.uid
    || (profile.role === "senior" && seniorUid !== user.uid)
    || (profile.role !== "senior" && profile.role !== "family")
  ) {
    throw new Error("wrong-role");
  }
}

function medicationCollection(seniorUid: string) {
  return collection(database(), "elderlyProfiles", seniorUid, "medications");
}

function toRecord(id: string, data: Record<string, unknown>): MedicationRecord {
  const intakeTimes = Array.isArray(data.intakeTimes)
    ? data.intakeTimes.filter((value): value is string => typeof value === "string")
    : [];
  return {
    id,
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    name: typeof data.name === "string" ? data.name : "",
    strengthText: typeof data.strengthText === "string" ? data.strengthText : "",
    dosage: typeof data.dosage === "string" ? data.dosage : "",
    dosageUnit: typeof data.dosageUnit === "string" ? data.dosageUnit : "",
    dosageForm: data.dosageForm === "tablet"
      || data.dosageForm === "capsule"
      || data.dosageForm === "syrup"
      || data.dosageForm === "solution"
      || data.dosageForm === "powder"
      ? data.dosageForm
      : "other",
    frequency: typeof data.frequency === "number" ? data.frequency : Math.max(1, intakeTimes.length),
    intakeTimes,
    directionsText: typeof data.directionsText === "string" ? data.directionsText : "",
    startDate: typeof data.startDate === "string" ? data.startDate : "",
    endDate: typeof data.endDate === "string" ? data.endDate : "",
    notes: typeof data.notes === "string" ? data.notes : "",
    status: data.status === "inactive" || data.status === "deleted" ? data.status : "active",
    createdByUid: typeof data.createdByUid === "string"
      ? data.createdByUid
      : (typeof data.ownerUid === "string" ? data.ownerUid : ""),
    updatedByUid: typeof data.updatedByUid === "string"
      ? data.updatedByUid
      : (typeof data.ownerUid === "string" ? data.ownerUid : ""),
    createdAt: (data.createdAt as Timestamp | undefined) ?? null,
    updatedAt: (data.updatedAt as Timestamp | undefined) ?? null,
    deletedAt: (data.deletedAt as Timestamp | undefined) ?? null,
    revision: typeof data.revision === "number" ? data.revision : 1,
  };
}

export function watchMedications(
  seniorUid: string,
  onValue: (medications: MedicationRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const q = medicationCollection(seniorUid);
  return onSnapshot(q, { includeMetadataChanges: true }, snapshot => {
    // Do not show a cached health-data snapshot before the server confirms access.
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    const records = snapshot.docs
      .map(item => toRecord(item.id, item.data()))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
    onValue(records);
  }, onError);
}

export async function createMedication(
  user: User,
  profile: Profile,
  seniorUid: string,
  draft: MedicationDraft,
) {
  assertActor(user, profile, seniorUid);
  await addDoc(medicationCollection(seniorUid), {
    ...draft,
    ownerUid: seniorUid,
    createdByUid: user.uid,
    updatedByUid: user.uid,
    status: "active",
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    revision: 1,
  });
}

async function updateMedicationRecord(
  user: User,
  profile: Profile,
  seniorUid: string,
  medication: MedicationRecord,
  changes: Partial<MedicationDraft>,
  status: MedicationStatus,
) {
  assertActor(user, profile, seniorUid);
  const ref = doc(database(), "elderlyProfiles", seniorUid, "medications", medication.id);
  await runTransaction(database(), async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("not-found");
    const current = snapshot.data();
    if (current.ownerUid !== seniorUid || current.status === "deleted") {
      throw new Error("not-editable");
    }
    // Older M3.2 records were creatable only by the senior owner. The first edit
    // upgrades the document to the Phase 04 schema without moving or deleting it.
    const createdByUid = typeof current.createdByUid === "string"
      ? current.createdByUid
      : seniorUid;
    const existingIntakeTimes = Array.isArray(current.intakeTimes) && current.intakeTimes.length > 0
      ? current.intakeTimes
      : ["08:00"];
    const existingFrequency = Array.isArray(current.intakeTimes) && current.intakeTimes.length > 0
      ? (typeof current.frequency === "number" ? current.frequency : existingIntakeTimes.length)
      : 1;

    transaction.update(ref, {
      ...changes,
      ownerUid: seniorUid,
      createdByUid,
      dosage: typeof changes.dosage === "string" ? changes.dosage : (typeof current.dosage === "string" ? current.dosage : ""),
      dosageUnit: typeof changes.dosageUnit === "string" ? changes.dosageUnit : (typeof current.dosageUnit === "string" ? current.dosageUnit : "liều"),
      dosageForm: typeof changes.dosageForm === "string" ? changes.dosageForm : (typeof current.dosageForm === "string" ? current.dosageForm : "other"),
      frequency: typeof changes.frequency === "number" ? changes.frequency : existingFrequency,
      intakeTimes: Array.isArray(changes.intakeTimes) ? changes.intakeTimes : existingIntakeTimes,
      startDate: typeof changes.startDate === "string" ? changes.startDate : (typeof current.startDate === "string" ? current.startDate : ""),
      endDate: typeof changes.endDate === "string" ? changes.endDate : (typeof current.endDate === "string" ? current.endDate : ""),
      notes: typeof changes.notes === "string" ? changes.notes : (typeof current.notes === "string" ? current.notes : ""),
      updatedByUid: user.uid,
      status,
      deletedAt: status === "deleted" ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
      revision: (typeof current.revision === "number" ? current.revision : 1) + 1,
    });
  });
}

export async function saveMedication(
  user: User,
  profile: Profile,
  seniorUid: string,
  medication: MedicationRecord | null,
  draft: MedicationDraft,
) {
  if (!medication) {
    await createMedication(user, profile, seniorUid, draft);
    return;
  }
  await updateMedicationRecord(user, profile, seniorUid, medication, draft, medication.status);
}

export async function stopMedication(
  user: User,
  profile: Profile,
  seniorUid: string,
  medication: MedicationRecord,
) {
  await updateMedicationRecord(user, profile, seniorUid, medication, {}, "inactive");
}

export async function deleteMedication(
  user: User,
  profile: Profile,
  seniorUid: string,
  medication: MedicationRecord,
) {
  await updateMedicationRecord(user, profile, seniorUid, medication, {}, "deleted");
}

export function medicationErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : (error instanceof Error ? error.message : "");
  switch (code) {
    case "permission-denied":
      return "Bạn không còn quyền truy cập thuốc của người cao tuổi này. Hãy kiểm tra trạng thái kết nối.";
    case "unavailable":
    case "deadline-exceeded":
    case "firebase-unavailable":
      return "Chưa kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.";
    case "not-found":
      return "Không tìm thấy thuốc cần cập nhật. Hãy tải lại danh sách.";
    case "not-editable":
      return "Thuốc này đã được xóa hoặc không còn thuộc hồ sơ đang chọn.";
    case "wrong-role":
      return "Vai trò tài khoản không phù hợp để quản lý hồ sơ thuốc này.";
    default:
      return "Chưa thể xử lý dữ liệu thuốc. Vui lòng thử lại.";
  }
}
