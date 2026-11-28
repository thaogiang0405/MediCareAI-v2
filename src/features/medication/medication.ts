import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { services } from "@/lib/firebase";
import { deleteUnlinkedPrescriptionImage, uploadPrescriptionImage, type PrescriptionImageInput, type PrescriptionUpload } from "./prescriptions";
import type { Profile } from "@/features/profile/profile";
import { medicationValidationError, type MedicationDraft } from "./validation";
import { buildDoses, doseTime, isScheduleMedication, shiftDate, vietnamDate, type Dose, type ScheduleMedication } from "./schedule";

export type MedicationStatus = "active" | "inactive" | "deleted";
export type MedicationRequestType = "create" | "update" | "stop" | "delete";
export type MedicationRequestStatus = "pending" | "approved" | "rejected";
export type MedicationNotificationType =
  | "proposal_submitted"
  | "proposal_reviewed"
  | "medication_stopped"
  | "medication_reactivated";
export type MedicationNotificationDecision = "approved" | "rejected" | null;

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
  medicationName: string;
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
  scheduledDate?: string;
  scheduledTime?: string;
  dosage?: string;
  dosageUnit?: string;
  strengthText?: string;
  recordedByUid: string;
  recordedByRole: "elderly" | "caregiver";
  takenAt: Timestamp | null;
  note: string;
  createdAt: Timestamp | null;
};

export type MedicationNotificationRecord = {
  id: string;
  ownerUid: string;
  eventType: MedicationNotificationType;
  medicationId: string | null;
  medicationName: string;
  actorUid: string;
  actorName: string;
  actorRole: "elderly" | "caregiver";
  requestId: string | null;
  requestType: MedicationRequestType | null;
  decision: MedicationNotificationDecision;
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

function notificationCollection(seniorUid: string) {
  return collection(database(), "elderlyProfiles", seniorUid, "medicationNotifications");
}

function notificationData(
  seniorUid: string,
  profile: Profile,
  eventType: MedicationNotificationType,
  medicationId: string | null,
  medicationName: string,
  requestId: string | null = null,
  requestType: MedicationRequestType | null = null,
  decision: MedicationNotificationDecision = null,
) {
  return {
    ownerUid: seniorUid,
    eventType,
    medicationId,
    medicationName: medicationName.trim().slice(0, 120),
    actorUid: profile.uid,
    actorName: profile.fullName.trim().slice(0, 80),
    actorRole: profile.role === "senior" ? "elderly" : "caregiver",
    requestId,
    requestType,
    decision,
    createdAt: serverTimestamp(),
  };
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
    medicationName: typeof data.medicationName === "string" ? data.medicationName : "Thuốc",
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
    scheduledDate: typeof data.scheduledDate === "string" ? data.scheduledDate : undefined,
    scheduledTime: typeof data.scheduledTime === "string" ? data.scheduledTime : undefined,
    dosage: typeof data.dosage === "string" ? data.dosage : undefined,
    dosageUnit: typeof data.dosageUnit === "string" ? data.dosageUnit : undefined,
    strengthText: typeof data.strengthText === "string" ? data.strengthText : undefined,
    recordedByUid: typeof data.recordedByUid === "string" ? data.recordedByUid : "",
    recordedByRole: data.recordedByRole === "caregiver" ? "caregiver" : "elderly",
    takenAt: (data.takenAt as Timestamp | undefined) ?? null,
    note: typeof data.note === "string" ? data.note : "",
    createdAt: (data.createdAt as Timestamp | undefined) ?? null,
  };
}

function toNotification(id: string, data: Record<string, unknown>): MedicationNotificationRecord {
  const eventType: MedicationNotificationType =
    data.eventType === "proposal_reviewed"
    || data.eventType === "medication_stopped"
    || data.eventType === "medication_reactivated"
      ? data.eventType
      : "proposal_submitted";
  const requestType: MedicationRequestType | null =
    data.requestType === "create" || data.requestType === "update"
    || data.requestType === "stop" || data.requestType === "delete"
      ? data.requestType
      : null;
  return {
    id,
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    eventType,
    medicationId: typeof data.medicationId === "string" ? data.medicationId : null,
    medicationName: typeof data.medicationName === "string" ? data.medicationName : "Thuốc",
    actorUid: typeof data.actorUid === "string" ? data.actorUid : "",
    actorName: typeof data.actorName === "string" ? data.actorName : "Người dùng",
    actorRole: data.actorRole === "caregiver" ? "caregiver" : "elderly",
    requestId: typeof data.requestId === "string" ? data.requestId : null,
    requestType,
    decision: data.decision === "approved" || data.decision === "rejected" ? data.decision : null,
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

export function watchMedicationNotifications(
  seniorUid: string,
  onValue: (notifications: MedicationNotificationRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const source = query(notificationCollection(seniorUid), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(source, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    onValue(snapshot.docs.map(item => toNotification(item.id, item.data())));
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
  notificationType: "medication_stopped" | "medication_reactivated" | null = null,
  expectedCurrentStatus: MedicationStatus | null = null,
) {
  assertSeniorOwner(user, profile, seniorUid);
  const ref = doc(database(), "elderlyProfiles", seniorUid, "medications", medication.id);
  await runTransaction(database(), async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("not-found");
    const current = snapshot.data();
    if (
      current.ownerUid !== seniorUid
      || current.status === "deleted"
      || (expectedCurrentStatus !== null && current.status !== expectedCurrentStatus)
    ) {
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
    if (notificationType) {
      const notificationRef = doc(notificationCollection(seniorUid));
      transaction.set(notificationRef, notificationData(
        seniorUid,
        profile,
        notificationType,
        medication.id,
        typeof current.name === "string" ? current.name : medication.name,
      ));
    }
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
  if (medication.status !== "active") throw new Error("not-editable");
  await updateMedicationRecord(
    user, profile, seniorUid, medication, {}, "inactive", "medication_stopped", "active",
  );
}

export async function reactivateMedication(
  user: User,
  profile: Profile,
  seniorUid: string,
  medication: MedicationRecord,
) {
  if (medication.status !== "inactive") throw new Error("not-editable");
  await updateMedicationRecord(
    user, profile, seniorUid, medication, {}, "active", "medication_reactivated", "inactive",
  );
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
  medicationName: string,
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
  if (requestType !== "create" && medicationId) {
    const target = await getDoc(doc(database(), "elderlyProfiles", seniorUid, "medications", medicationId));
    if (!target.exists()) throw new Error("not-found");
    const targetData = target.data();
    if (
      targetData.ownerUid !== seniorUid
      || !["active", "inactive"].includes(String(targetData.status))
      || (requestType === "stop" && targetData.status !== "active")
      || ((requestType === "stop" || requestType === "delete") && targetData.name !== medicationName)
    ) {
      throw new Error("not-editable");
    }
  }
  const db = database();
  const requestRef = doc(requestCollection(seniorUid));
  const notificationRef = doc(notificationCollection(seniorUid));
  const normalizedName = medicationName.trim().slice(0, 120);
  const batch = writeBatch(db);
  batch.set(requestRef, {
    ownerUid: seniorUid,
    medicationId,
    medicationName: normalizedName,
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
  batch.set(notificationRef, notificationData(
    seniorUid, profile, "proposal_submitted", medicationId, normalizedName, requestRef.id, requestType,
  ));
  await batch.commit();
}

function attachPrescriptionMetadata(
  batch: ReturnType<typeof writeBatch>,
  seniorUid: string,
  profile: Profile,
  upload: PrescriptionUpload,
  linkedMedicationIds: string[],
  linkedRequestIds: string[],
) {
  const uploadedByRole = profile.role === "senior" ? "elderly" : "caregiver";
  batch.set(doc(database(), "elderlyProfiles", seniorUid, "prescriptions", upload.id), {
    ownerUid: seniorUid,
    storagePath: upload.storagePath,
    contentType: "image/jpeg",
    sizeBytes: upload.sizeBytes,
    uploadedByUid: profile.uid,
    uploadedByRole,
    source: upload.source,
    width: upload.width,
    height: upload.height,
    linkedMedicationIds,
    linkedRequestIds,
    createdAt: serverTimestamp(),
    status: "active",
  });
}

export async function createMedicationsFromPrescription(
  user: User, profile: Profile, seniorUid: string, drafts: MedicationDraft[], image?: PrescriptionImageInput,
) {
  assertSeniorOwner(user, profile, seniorUid);
  if (!Array.isArray(drafts) || drafts.length < 1 || drafts.length > 10
    || drafts.some(draft => medicationValidationError(draft) !== null)) throw new Error("invalid-request");

  const db = database();
  const upload = image ? await uploadPrescriptionImage(user, profile, seniorUid, image) : null;
  try {
    const batch = writeBatch(db);
    const medicationRefs = drafts.map(() => doc(medicationCollection(seniorUid)));
    if (upload) attachPrescriptionMetadata(batch, seniorUid, profile, upload, medicationRefs.map(item => item.id), []);
    drafts.forEach((draft, index) => batch.set(medicationRefs[index], {
      ...draft, ownerUid: seniorUid, createdByUid: user.uid, updatedByUid: user.uid,
      status: "active", deletedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), revision: 1,
    }));
    await batch.commit();
    return upload?.id ?? null;
  } catch (error) {
    if (upload) await deleteUnlinkedPrescriptionImage(upload).catch(() => {});
    throw error;
  }
}

export async function createMedicationRequestsFromPrescription(
  user: User, profile: Profile, seniorUid: string, drafts: MedicationDraft[], image?: PrescriptionImageInput,
) {
  assertCaregiver(user, profile, seniorUid);
  if (!Array.isArray(drafts) || drafts.length < 1 || drafts.length > 10
    || drafts.some(draft => medicationValidationError(draft) !== null)) throw new Error("invalid-request");

  const db = database();
  const upload = image ? await uploadPrescriptionImage(user, profile, seniorUid, image) : null;
  try {
    const batch = writeBatch(db);
    const requestRefs = drafts.map(() => doc(requestCollection(seniorUid)));
    const notificationRefs = drafts.map(() => doc(notificationCollection(seniorUid)));
    if (upload) attachPrescriptionMetadata(batch, seniorUid, profile, upload, [], requestRefs.map(item => item.id));
    drafts.forEach((draft, index) => {
      const medicationName = draft.name.trim().slice(0, 120);
      batch.set(requestRefs[index], {
        ownerUid: seniorUid, medicationId: null, medicationName, requestType: "create", proposedData: draft,
        requestedByUid: user.uid, reason: "Đề xuất thêm thuốc từ kết quả OCR đơn thuốc.",
        status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        reviewedByUid: null, reviewedAt: null, reviewNote: "",
      });
      batch.set(notificationRefs[index], notificationData(
        seniorUid, profile, "proposal_submitted", null, medicationName, requestRefs[index].id, "create",
      ));
    });
    await batch.commit();
    return upload?.id ?? null;
  } catch (error) {
    if (upload) await deleteUnlinkedPrescriptionImage(upload).catch(() => {});
    throw error;
  }
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
    if (
      decision === "approved"
      && currentRequest.proposedData
      && medicationValidationError(currentRequest.proposedData)
    ) {
      throw new Error("invalid-request");
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
      if (
        medicationData.ownerUid !== seniorUid
        || medicationData.status === "deleted"
        || (currentRequest.requestType === "stop" && medicationData.status !== "active")
        || ((currentRequest.requestType === "stop" || currentRequest.requestType === "delete")
          && medicationData.name !== currentRequest.medicationName)
      ) {
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
        const existingIntakeTimes = Array.isArray(medicationData.intakeTimes) && medicationData.intakeTimes.length > 0
          ? medicationData.intakeTimes
          : ["08:00"];
        const existingFrequency = Array.isArray(medicationData.intakeTimes) && medicationData.intakeTimes.length > 0
          ? (typeof medicationData.frequency === "number" ? medicationData.frequency : existingIntakeTimes.length)
          : 1;
        transaction.update(medicationRef, {
          ownerUid: seniorUid,
          name: typeof medicationData.name === "string" ? medicationData.name : "",
          strengthText: typeof medicationData.strengthText === "string" ? medicationData.strengthText : "",
          dosage: typeof medicationData.dosage === "string" ? medicationData.dosage : "",
          dosageUnit: typeof medicationData.dosageUnit === "string" ? medicationData.dosageUnit : "liều",
          dosageForm: typeof medicationData.dosageForm === "string" ? medicationData.dosageForm : "other",
          frequency: existingFrequency,
          intakeTimes: existingIntakeTimes,
          directionsText: typeof medicationData.directionsText === "string" ? medicationData.directionsText : "",
          startDate: typeof medicationData.startDate === "string" ? medicationData.startDate : "",
          endDate: typeof medicationData.endDate === "string" ? medicationData.endDate : "",
          notes: typeof medicationData.notes === "string" ? medicationData.notes : "",
          createdByUid: typeof medicationData.createdByUid === "string" ? medicationData.createdByUid : seniorUid,
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
    // Every decision is announced to all currently connected caregivers through
    // the shared notification stream, including an approved stop proposal.
    const reviewNotificationRef = doc(notificationCollection(seniorUid));
    transaction.set(reviewNotificationRef, notificationData(
      seniorUid,
      profile,
      "proposal_reviewed",
      currentRequest.medicationId,
      currentRequest.medicationName,
      currentRequest.id,
      currentRequest.requestType,
      decision,
    ));

    // An approved stop also creates a separate status-history event so the
    // inactive medication records exactly when and by whom it was stopped.
    if (decision === "approved" && currentRequest.requestType === "stop") {
      const statusNotificationRef = doc(notificationCollection(seniorUid));
      transaction.set(statusNotificationRef, notificationData(
        seniorUid,
        profile,
        "medication_stopped",
        currentRequest.medicationId,
        currentRequest.medicationName,
      ));
    }
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
    case "storage-unavailable":
    case "storage/bucket-not-found":
      return "Firebase Storage chưa sẵn sàng. Kiểm tra Storage bucket và cấu hình EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET trước khi lưu ảnh.";
    case "storage/unauthorized":
    case "storage/unauthenticated":
      return "Không có quyền lưu ảnh đơn thuốc. Hãy kiểm tra kết nối gia đình và Storage Rules.";
    case "storage/retry-limit-exceeded":
      return "Mạng không ổn định nên chưa lưu được ảnh. Vui lòng thử lại.";
    case "permission-denied":
      return "Firebase từ chối thao tác. Có thể Firestore Rules Phase 04 chưa được Publish lên staging. Hãy kiểm tra Rules trước khi thử lại; người chăm sóc không được sửa trực tiếp danh sách thuốc.";
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


// Read only complete, explicit official medication data; never infer a missing dose or time.
export function watchScheduleMedications(seniorUid: string, onValue: (items: ScheduleMedication[], incomplete: number) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(medicationCollection(seniorUid), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.hasPendingWrites) return;
    if (snapshot.metadata.fromCache) { onError(new Error("unavailable")); return; }
    const active = snapshot.docs.map(d => ({ ...d.data(), id: d.id }))
      .filter(d => (d as Record<string, unknown>).status === "active" && (d as Record<string, unknown>).ownerUid === seniorUid);
    const valid = active.filter(isScheduleMedication);
    onValue(valid, active.length - valid.length);
  }, onError);
}

export function watchDailyIntake(seniorUid: string, date: string, onValue: (items: MedicationIntakeLogRecord[]) => void, onError: (error: Error) => void): Unsubscribe {
  const source = query(intakeCollection(seniorUid),
    where("takenAt", ">=", Timestamp.fromMillis(doseTime(date, "00:00"))),
    where("takenAt", "<", Timestamp.fromMillis(doseTime(shiftDate(date, 1), "00:00"))),
    orderBy("takenAt", "desc"));
  return onSnapshot(source, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.hasPendingWrites) return;
    if (snapshot.metadata.fromCache) { onError(new Error("unavailable")); return; }
    onValue(snapshot.docs.map(d => toIntakeLog(d.id, d.data())));
  }, onError);
}

export async function confirmScheduledDose(user: User, profile: Profile, seniorUid: string, dose: Dose, note = ""): Promise<"created" | "already-confirmed"> {
  assertIntakeRecorder(user, profile, seniorUid);
  if (dose.medication.ownerUid !== seniorUid || dose.date !== vietnamDate()) throw new Error("dose-date");
  const medRef = doc(medicationCollection(seniorUid), dose.medication.id);
  const logRef = doc(intakeCollection(seniorUid), dose.id);
  return runTransaction(database(), async tx => {
    const existing = await tx.get(logRef);
    if (existing.exists()) return "already-confirmed";
    const latest = await tx.get(medRef);
    const medication = { ...latest.data(), id: latest.id };
    if (!latest.exists() || !isScheduleMedication(medication) || medication.ownerUid !== seniorUid
      || !buildDoses([medication], dose.date).some(d => d.id === dose.id)
      || medication.name !== dose.medication.name
      || medication.strengthText !== dose.medication.strengthText
      || medication.dosage !== dose.medication.dosage
      || medication.dosageUnit !== dose.medication.dosageUnit
      || medication.directionsText !== dose.medication.directionsText) throw new Error("dose-changed");
    tx.set(logRef, {
      ownerUid: seniorUid, medicationId: medication.id, medicationName: medication.name,
      scheduledDate: dose.date, scheduledTime: dose.time,
      dosage: medication.dosage, dosageUnit: medication.dosageUnit, strengthText: medication.strengthText,
      recordedByUid: user.uid, recordedByRole: profile.role === "senior" ? "elderly" : "caregiver",
      takenAt: serverTimestamp(), createdAt: serverTimestamp(), note: note.trim().slice(0, 300),
    });
    return "created";
  });
}
