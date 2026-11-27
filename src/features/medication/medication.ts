import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { services } from "@/lib/firebase";
import type { Profile } from "@/features/profile/profile";
import type { MedicationDraft } from "./validation";

export type MedicationStatus = "active" | "inactive" | "deleted";
export type MedicationRequestType = "create" | "update" | "stop" | "delete";
export type MedicationRequestStatus = "pending" | "approved" | "rejected";

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

export type MedicationRequestRecord = {
  id: string;
  ownerUid: string;
  medicationId: string | null;
  requestType: MedicationRequestType;
  proposedData: MedicationDraft | null;
  requestedByUid: string;
  reason: string;
  status: MedicationRequestStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  reviewedByUid: string | null;
  reviewedAt: Timestamp | null;
  reviewNote: string;
};

export type MedicationIntakeLogRecord = {
  id: string;
  ownerUid: string;
  medicationId: string;
  medicationName: string;
  recordedByUid: string;
  recordedByRole: "elderly" | "caregiver";
  takenAt: Timestamp | null;
  note: string;
  createdAt: Timestamp | null;
};

function database() {
  if (!services) throw new Error("firebase-unavailable");
  return services.db;
}

function assertIdentity(user: User, profile: Profile) {
  if (user.uid !== profile.uid || services?.auth.currentUser?.uid !== user.uid) {
    throw new Error("wrong-role");
  }
}

function assertSeniorOwner(user: User, profile: Profile, seniorUid: string) {
  assertIdentity(user, profile);
  if (profile.role !== "senior" || seniorUid !== user.uid) throw new Error("wrong-role");
}

function assertCaregiver(user: User, profile: Profile, seniorUid: string) {
  assertIdentity(user, profile);
  if (profile.role !== "family" || seniorUid === user.uid) throw new Error("wrong-role");
}

function assertIntakeRecorder(user: User, profile: Profile, seniorUid: string) {
  assertIdentity(user, profile);
  if (profile.role === "senior" && seniorUid === user.uid) return;
  if (profile.role === "family" && seniorUid !== user.uid) return;
  throw new Error("wrong-role");
}

function medicationCollection(seniorUid: string) {
  return collection(database(), "elderlyProfiles", seniorUid, "medications");
}

function requestCollection(seniorUid: string) {
  return collection(database(), "elderlyProfiles", seniorUid, "medicationRequests");
}

function intakeCollection(seniorUid: string) {
  return collection(database(), "elderlyProfiles", seniorUid, "medicationIntakeLogs");
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

function toRequest(id: string, data: Record<string, unknown>): MedicationRequestRecord {
  const proposed = data.proposedData;
  return {
    id,
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    medicationId: typeof data.medicationId === "string" ? data.medicationId : null,
    requestType: data.requestType === "update" || data.requestType === "stop" || data.requestType === "delete"
      ? data.requestType
      : "create",
    proposedData: proposed && typeof proposed === "object" ? proposed as MedicationDraft : null,
    requestedByUid: typeof data.requestedByUid === "string" ? data.requestedByUid : "",
    reason: typeof data.reason === "string" ? data.reason : "",
    status: data.status === "approved" || data.status === "rejected" ? data.status : "pending",
    createdAt: (data.createdAt as Timestamp | undefined) ?? null,
    updatedAt: (data.updatedAt as Timestamp | undefined) ?? null,
    reviewedByUid: typeof data.reviewedByUid === "string" ? data.reviewedByUid : null,
    reviewedAt: (data.reviewedAt as Timestamp | undefined) ?? null,
    reviewNote: typeof data.reviewNote === "string" ? data.reviewNote : "",
  };
}

function toIntakeLog(id: string, data: Record<string, unknown>): MedicationIntakeLogRecord {
  return {
    id,
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    medicationId: typeof data.medicationId === "string" ? data.medicationId : "",
    medicationName: typeof data.medicationName === "string" ? data.medicationName : "Thuốc",
    recordedByUid: typeof data.recordedByUid === "string" ? data.recordedByUid : "",
    recordedByRole: data.recordedByRole === "caregiver" ? "caregiver" : "elderly",
    takenAt: (data.takenAt as Timestamp | undefined) ?? null,
    note: typeof data.note === "string" ? data.note : "",
    createdAt: (data.createdAt as Timestamp | undefined) ?? null,
  };
}

export function watchMedications(
  seniorUid: string,
  onValue: (medications: MedicationRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(medicationCollection(seniorUid), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    const records = snapshot.docs
      .map(item => toRecord(item.id, item.data()))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
    onValue(records);
  }, onError);
}

export function watchMedicationRequests(
  seniorUid: string,
  actorUid: string,
  role: Profile["role"],
  onValue: (requests: MedicationRequestRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const base = requestCollection(seniorUid);
  const source = role === "family"
    ? query(base, where("requestedByUid", "==", actorUid))
    : query(base, where("ownerUid", "==", seniorUid));
  return onSnapshot(source, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    onValue(snapshot.docs
      .map(item => toRequest(item.id, item.data()))
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)));
  }, onError);
}

export function watchMedicationIntakeLogs(
  seniorUid: string,
  onValue: (logs: MedicationIntakeLogRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const source = query(intakeCollection(seniorUid), orderBy("takenAt", "desc"), limit(30));
  return onSnapshot(source, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    onValue(snapshot.docs.map(item => toIntakeLog(item.id, item.data())));
  }, onError);
}

export async function createMedication(
  user: User,
  profile: Profile,
  seniorUid: string,
  draft: MedicationDraft,
) {
  assertSeniorOwner(user, profile, seniorUid);
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
  assertSeniorOwner(user, profile, seniorUid);
  const ref = doc(database(), "elderlyProfiles", seniorUid, "medications", medication.id);
  await runTransaction(database(), async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("not-found");
    const current = snapshot.data();
    if (current.ownerUid !== seniorUid || current.status === "deleted") {
      throw new Error("not-editable");
    }
    // Preserve the legacy M3.2 document path and upgrade its fields on the first edit.
    const createdByUid = typeof current.createdByUid === "string" ? current.createdByUid : seniorUid;
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
  assertSeniorOwner(user, profile, seniorUid);
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

export async function createMedicationRequest(
  user: User,
  profile: Profile,
  seniorUid: string,
  requestType: MedicationRequestType,
  medicationId: string | null,
  proposedData: MedicationDraft | null,
  reason: string,
) {
  assertCaregiver(user, profile, seniorUid);
  if (
    ((requestType === "create" || requestType === "update") && !proposedData)
    || (requestType === "create" && medicationId !== null)
    || (requestType !== "create" && (!medicationId || proposedData && requestType !== "update"))
  ) {
    throw new Error("invalid-request");
  }
  await addDoc(requestCollection(seniorUid), {
    ownerUid: seniorUid,
    medicationId,
    requestType,
    proposedData,
    requestedByUid: user.uid,
    reason: reason.trim().slice(0, 500),
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    reviewedByUid: null,
    reviewedAt: null,
    reviewNote: "",
  });
}

export async function reviewMedicationRequest(
  user: User,
  profile: Profile,
  seniorUid: string,
  request: MedicationRequestRecord,
  decision: "approved" | "rejected",
  reviewNote = "",
) {
  assertSeniorOwner(user, profile, seniorUid);
  const db = database();
  const requestRef = doc(requestCollection(seniorUid), request.id);

  await runTransaction(db, async transaction => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) throw new Error("request-not-found");
    const currentRequest = toRequest(requestSnapshot.id, requestSnapshot.data());
    if (currentRequest.ownerUid !== seniorUid || currentRequest.status !== "pending") {
      throw new Error("request-not-pending");
    }

    let medicationRef = currentRequest.medicationId
      ? doc(db, "elderlyProfiles", seniorUid, "medications", currentRequest.medicationId)
      : null;
    let medicationData: Record<string, unknown> | null = null;
    if (decision === "approved" && currentRequest.requestType !== "create") {
      if (!medicationRef) throw new Error("request-invalid");
      const medicationSnapshot = await transaction.get(medicationRef);
      if (!medicationSnapshot.exists()) throw new Error("not-found");
      medicationData = medicationSnapshot.data();
      if (medicationData.ownerUid !== seniorUid || medicationData.status === "deleted") {
        throw new Error("not-editable");
      }
    }

    if (decision === "approved") {
      if (currentRequest.requestType === "create") {
        if (!currentRequest.proposedData) throw new Error("request-invalid");
        medicationRef = doc(medicationCollection(seniorUid));
        transaction.set(medicationRef, {
          ...currentRequest.proposedData,
          ownerUid: seniorUid,
          createdByUid: user.uid,
          updatedByUid: user.uid,
          status: "active",
          deletedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          revision: 1,
        });
      } else if (!medicationRef || !medicationData) {
        throw new Error("request-invalid");
      } else if (currentRequest.requestType === "update") {
        if (!currentRequest.proposedData) throw new Error("request-invalid");
        transaction.update(medicationRef, {
          ...currentRequest.proposedData,
          ownerUid: seniorUid,
          createdByUid: typeof medicationData.createdByUid === "string" ? medicationData.createdByUid : seniorUid,
          updatedByUid: user.uid,
          status: medicationData.status,
          deletedAt: null,
          updatedAt: serverTimestamp(),
          revision: (typeof medicationData.revision === "number" ? medicationData.revision : 1) + 1,
        });
      } else {
        const nextStatus = currentRequest.requestType === "stop" ? "inactive" : "deleted";
        transaction.update(medicationRef, {
          status: nextStatus,
          deletedAt: nextStatus === "deleted" ? serverTimestamp() : null,
          updatedByUid: user.uid,
          updatedAt: serverTimestamp(),
          revision: (typeof medicationData.revision === "number" ? medicationData.revision : 1) + 1,
        });
      }
    }

    transaction.update(requestRef, {
      status: decision,
      reviewedByUid: user.uid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      reviewNote: reviewNote.trim().slice(0, 500),
    });
  });
}

export async function recordMedicationIntake(
  user: User,
  profile: Profile,
  seniorUid: string,
  medication: MedicationRecord,
  note = "",
) {
  assertIntakeRecorder(user, profile, seniorUid);
  if (medication.ownerUid !== seniorUid || medication.status !== "active") throw new Error("not-editable");
  await addDoc(intakeCollection(seniorUid), {
    ownerUid: seniorUid,
    medicationId: medication.id,
    medicationName: medication.name,
    recordedByUid: user.uid,
    recordedByRole: profile.role === "senior" ? "elderly" : "caregiver",
    takenAt: serverTimestamp(),
    note: note.trim().slice(0, 300),
    createdAt: serverTimestamp(),
  });
}

export function medicationErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : (error instanceof Error ? error.message : "");
  switch (code) {
    case "permission-denied":
      return "Bạn không có quyền thực hiện thao tác này. Người chăm sóc chỉ được xem thuốc, ghi nhận uống thuốc và gửi đề xuất.";
    case "unavailable":
    case "deadline-exceeded":
    case "firebase-unavailable":
      return "Chưa kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.";
    case "not-found":
    case "request-not-found":
      return "Không tìm thấy thuốc hoặc đề xuất cần xử lý. Hãy tải lại danh sách.";
    case "not-editable":
      return "Thuốc này đã được xóa hoặc không còn thuộc hồ sơ đang chọn.";
    case "request-not-pending":
      return "Đề xuất này đã được xử lý trước đó.";
    case "invalid-request":
    case "request-invalid":
      return "Thông tin đề xuất không hợp lệ. Vui lòng tải lại và thử lại.";
    case "wrong-role":
      return "Vai trò tài khoản không phù hợp để thực hiện thao tác này.";
    default:
      return "Chưa thể xử lý dữ liệu thuốc. Vui lòng thử lại.";
  }
}
