import {
  collection, doc, limit, onSnapshot, orderBy, query, type Timestamp, type Unsubscribe,
} from "firebase/firestore";
import {
  deleteObject, getBytes, ref, uploadString,
} from "firebase/storage";
import type { User } from "firebase/auth";
import { services } from "@/lib/firebase";
import type { Profile } from "@/features/profile/profile";

export type PrescriptionImageInput = {
  base64: string;
  source: "camera" | "library";
  width: number;
  height: number;
};

export type PrescriptionUpload = {
  id: string;
  storagePath: string;
  sizeBytes: number;
  source: "camera" | "library";
  width: number;
  height: number;
};

export type PrescriptionRecord = {
  id: string;
  ownerUid: string;
  storagePath: string;
  contentType: "image/jpeg";
  sizeBytes: number;
  uploadedByUid: string;
  uploadedByRole: "elderly" | "caregiver";
  source: "camera" | "library";
  width: number;
  height: number;
  linkedMedicationIds: string[];
  linkedRequestIds: string[];
  createdAt: Timestamp | null;
  status: "active";
};

const MAX_PRESCRIPTION_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_CHARS = 11 * 1024 * 1024;

function assertPrescriptionIdentity(user: User, profile: Profile, seniorUid: string) {
  if (!services || services.auth.currentUser?.uid !== user.uid || profile.uid !== user.uid) {
    throw new Error("wrong-role");
  }
  if ((profile.role === "senior" && seniorUid !== user.uid)
    || (profile.role === "family" && seniorUid === user.uid)) {
    throw new Error("wrong-role");
  }
}

function storageService() {
  if (!services?.storage) throw new Error("storage-unavailable");
  return services.storage;
}

function firestoreService() {
  if (!services) throw new Error("firebase-unavailable");
  return services.db;
}

function estimateBase64Bytes(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}

export async function uploadPrescriptionImage(
  user: User,
  profile: Profile,
  seniorUid: string,
  image: PrescriptionImageInput,
): Promise<PrescriptionUpload> {
  assertPrescriptionIdentity(user, profile, seniorUid);
  if (
    !image.base64
    || image.base64.length > MAX_BASE64_CHARS
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)
    || image.base64.length % 4 !== 0
    || !Number.isInteger(image.width) || image.width < 1 || image.width > 2800
    || !Number.isInteger(image.height) || image.height < 1 || image.height > 2800
    || (image.source !== "camera" && image.source !== "library")
  ) {
    throw new Error("invalid-prescription-image");
  }

  const sizeBytes = estimateBase64Bytes(image.base64);
  if (sizeBytes < 1 || sizeBytes > MAX_PRESCRIPTION_IMAGE_BYTES) {
    throw new Error("invalid-prescription-image");
  }

  const db = firestoreService();
  const storage = storageService();
  const recordRef = doc(collection(db, "elderlyProfiles", seniorUid, "prescriptions"));
  const storagePath = "elderlyProfiles/" + seniorUid + "/prescriptions/" + recordRef.id + "/original.jpg";
  await uploadString(ref(storage, storagePath), image.base64, "base64", {
    contentType: "image/jpeg",
    cacheControl: "private, no-store, max-age=0",
    customMetadata: {
      ownerUid: seniorUid,
      uploadedByUid: user.uid,
      prescriptionId: recordRef.id,
      source: image.source,
    },
  });

  return {
    id: recordRef.id,
    storagePath,
    sizeBytes,
    source: image.source,
    width: image.width,
    height: image.height,
  };
}

export async function deleteUnlinkedPrescriptionImage(upload: PrescriptionUpload) {
  await deleteObject(ref(storageService(), upload.storagePath));
}

function bytesToBase64(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    output += alphabet[first >> 2];
    output += alphabet[((first & 3) << 4) | (second >> 4)];
    output += hasSecond ? alphabet[((second & 15) << 2) | (third >> 6)] : "=";
    output += hasThird ? alphabet[third & 63] : "=";
  }
  return output;
}

export function watchPrescriptions(
  seniorUid: string,
  onValue: (records: PrescriptionRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const source = query(
    collection(firestoreService(), "elderlyProfiles", seniorUid, "prescriptions"),
    orderBy("createdAt", "desc"),
    limit(50),
  );
  return onSnapshot(source, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    const records = snapshot.docs.map(item => {
      const data = item.data();
      return {
        id: item.id,
        ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
        storagePath: typeof data.storagePath === "string" ? data.storagePath : "",
        contentType: "image/jpeg" as const,
        sizeBytes: typeof data.sizeBytes === "number" ? data.sizeBytes : 0,
        uploadedByUid: typeof data.uploadedByUid === "string" ? data.uploadedByUid : "",
        uploadedByRole: data.uploadedByRole === "caregiver" ? "caregiver" as const : "elderly" as const,
        source: data.source === "camera" ? "camera" as const : "library" as const,
        width: typeof data.width === "number" ? data.width : 0,
        height: typeof data.height === "number" ? data.height : 0,
        linkedMedicationIds: Array.isArray(data.linkedMedicationIds)
          ? data.linkedMedicationIds.filter((value): value is string => typeof value === "string")
          : [],
        linkedRequestIds: Array.isArray(data.linkedRequestIds)
          ? data.linkedRequestIds.filter((value): value is string => typeof value === "string")
          : [],
        createdAt: (data.createdAt as Timestamp | undefined) ?? null,
        status: "active" as const,
      };
    }).filter(item => item.ownerUid === seniorUid && item.status === "active");
    onValue(records);
  }, onError);
}

export async function loadPrescriptionImage(
  user: User,
  profile: Profile,
  seniorUid: string,
  record: PrescriptionRecord,
) {
  assertPrescriptionIdentity(user, profile, seniorUid);
  const expectedPath = "elderlyProfiles/" + seniorUid + "/prescriptions/" + record.id + "/original.jpg";
  if (record.ownerUid !== seniorUid || record.storagePath !== expectedPath || record.contentType !== "image/jpeg") {
    throw new Error("invalid-prescription-image");
  }
  const bytes = await getBytes(ref(storageService(), expectedPath), MAX_PRESCRIPTION_IMAGE_BYTES);
  return "data:image/jpeg;base64," + bytesToBase64(bytes);
}

export function prescriptionErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : (error instanceof Error ? error.message : "");
  switch (code) {
    case "storage-unavailable":
      return "Firebase Storage chưa được cấu hình. Kiểm tra EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET và cấu hình Storage của dự án.";
    case "storage/unauthorized":
    case "storage/unauthenticated":
    case "permission-denied":
      return "Bạn không còn quyền xem ảnh này. Chỉ chủ hồ sơ và người chăm sóc đang kết nối mới được truy cập.";
    case "storage/bucket-not-found":
      return "Firebase Storage chưa được khởi tạo cho dự án. Hãy kiểm tra Storage bucket trên Firebase Console.";
    case "storage/object-not-found":
      return "Không tìm thấy ảnh đơn thuốc trong kho lưu trữ.";
    case "storage/retry-limit-exceeded":
    case "unavailable":
      return "Mạng không ổn định. Vui lòng thử tải ảnh lại.";
    case "invalid-prescription-image":
      return "Thông tin ảnh đơn thuốc không hợp lệ.";
    default:
      return "Chưa thể tải ảnh đơn thuốc. Vui lòng thử lại.";
  }
}
