import type { User } from "firebase/auth";
import {
  Timestamp, collection, doc, getDocFromServer, onSnapshot, query, runTransaction,
  serverTimestamp, where, type Unsubscribe,
} from "firebase/firestore";
import { getRandomBytesAsync } from "expo-crypto";
import { services } from "@/lib/firebase";
import type { Profile } from "@/features/profile/profile";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
export const INVITE_TTL = 15 * 60 * 1000;

export type ConnectionRecord = {
  id: string;
  familyUid: string;
  seniorUid: string;
  familyDisplayName: string;
  seniorDisplayName: string;
  status: "connected" | "disconnected";
  createdAt: Timestamp;
  connectedAt: Timestamp;
  disconnectedAt: Timestamp | null;
  disconnectedBy: string | null;
  updatedAt: Timestamp;
};
export type ConnectionInviteSlot = {
  inviteCode: string;
  status: "active" | "used";
  createdAt: Timestamp;
};
export type ConnectionInvitePreview = {
  code: string;
  familyUid: string;
  familyDisplayName: string;
  createdAt: Timestamp;
};

class ConnectionError extends Error {
  constructor(readonly code: string) { super(code); }
}
function database() {
  if (!services) throw new ConnectionError("firebase-unavailable");
  return services.db;
}
function assertIdentity(user: User, profile: Profile, role: Profile["role"]) {
  if (user.uid !== profile.uid || profile.role !== role || services?.auth.currentUser?.uid !== user.uid) {
    throw new ConnectionError("wrong-role");
  }
}
export function normalizeConnectionCode(value: string) {
  return value.toUpperCase().replace(/\s+/g, "");
}
function unusedFields() {
  return { status: "active", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    usedBy: null, usedAt: null, connectionId: null };
}
function consumedFields(uid: string, code: string) {
  return { status: "used", usedBy: uid, usedAt: serverTimestamp(),
    connectionId: code, updatedAt: serverTimestamp() };
}
export async function createConnectionInvite(user: User, profile: Profile) {
  assertIdentity(user, profile, "family");
  const db = database();
  const bytes = await getRandomBytesAsync(8);
  const code = Array.from(bytes, b => ALPHABET[b & 31]).join("");
  const slot = doc(db, "connectionInviteSlots", user.uid);
  const invite = doc(db, "connectionInvites", code);

  await runTransaction(db, async tx => {
    const old = await tx.get(slot);
    // No read of the new invite: an absent or another owner's code is private.
    // Rules prohibit overwriting existing invitations, including random collisions.
    if (old.exists() && old.data().status === "active") {
      if (old.data().inviteCode === code) throw new ConnectionError("collision");
      tx.update(doc(db, "connectionInvites", old.data().inviteCode), {
        status: "revoked", updatedAt: serverTimestamp(),
      });
    }
    tx.set(invite, { familyUid: user.uid, familyDisplayName: profile.fullName, ...unusedFields() });
    tx.set(slot, { familyUid: user.uid, inviteCode: code, ...unusedFields() });
  });
}
export async function getConnectionInvitePreview(user: User, profile: Profile, rawCode: string): Promise<ConnectionInvitePreview> {
  assertIdentity(user, profile, "senior");
  const code = normalizeConnectionCode(rawCode);
  if (!CODE_PATTERN.test(code)) throw new ConnectionError("invalid-code");
  const db = database();
  const snap = await getDocFromServer(doc(db, "connectionInvites", code));
  if (!snap.exists()) throw new ConnectionError("invalid-code");
  const i = snap.data();
  if (i.status !== "active" || !(i.createdAt instanceof Timestamp)) throw new ConnectionError("invalid-code");
  const pair = await getDocFromServer(doc(db, "connectionPairs", i.familyUid, "seniors", user.uid));
  if (pair.exists() && pair.data().status === "connected") throw new ConnectionError("already-connected");
  return { code, familyUid: i.familyUid, familyDisplayName: i.familyDisplayName, createdAt: i.createdAt };
}
export async function confirmConnection(user: User, profile: Profile, preview: ConnectionInvitePreview) {
  assertIdentity(user, profile, "senior");
  const db = database();
  const { code, familyUid } = preview;
  if (!CODE_PATTERN.test(code) || familyUid === user.uid) throw new ConnectionError("invalid-code");
  const invite = doc(db, "connectionInvites", code);
  const slot = doc(db, "connectionInviteSlots", familyUid);
  const conn = doc(db, "connections", code);
  const pair = doc(db, "connectionPairs", familyUid, "seniors", user.uid);
  await runTransaction(db, async tx => {
    const i = await tx.get(invite);
    const p = await tx.get(pair);
    if (!i.exists() || i.data().status !== "active" || i.data().familyUid !== familyUid
      || i.data().familyDisplayName !== preview.familyDisplayName) throw new ConnectionError("invalid-code");
    if (p.exists() && p.data().status === "connected") throw new ConnectionError("already-connected");
    // Only the senior confirms. Server rules check time, invite consumption,
    // exact participants and the unique pair lock in this atomic transaction.
    tx.set(conn, {
      familyUid, seniorUid: user.uid, familyDisplayName: preview.familyDisplayName,
      seniorDisplayName: profile.fullName, status: "connected",
      createdAt: serverTimestamp(), connectedAt: serverTimestamp(),
      disconnectedAt: null, disconnectedBy: null, updatedAt: serverTimestamp(),
    });
    tx.update(invite, consumedFields(user.uid, code));
    tx.update(slot, consumedFields(user.uid, code));
    tx.set(pair, { connectionId: code, status: "connected", updatedAt: serverTimestamp() });
  });
}
export async function disconnectConnection(user: User, profile: Profile, connectionId: string) {
  assertIdentity(user, profile, profile.role);
  const db = database();
  const conn = doc(db, "connections", connectionId);
  await runTransaction(db, async tx => {
    const snapshot = await tx.get(conn);
    if (!snapshot.exists()) throw new ConnectionError("not-connected");
    const c = snapshot.data();
    if (c.status !== "connected" || (c.familyUid !== user.uid && c.seniorUid !== user.uid)) {
      throw new ConnectionError("not-connected");
    }
    const pair = doc(db, "connectionPairs", c.familyUid, "seniors", c.seniorUid);
    tx.update(conn, { status: "disconnected", disconnectedAt: serverTimestamp(),
      disconnectedBy: user.uid, updatedAt: serverTimestamp() });
    tx.update(pair, { status: "disconnected", updatedAt: serverTimestamp() });
  });
}
export function watchConnections(uid: string, role: Profile["role"],
  onValue: (value: ConnectionRecord[]) => void, onError: (error: Error) => void): Unsubscribe {
  const q = query(collection(database(), "connections"), where(role === "family" ? "familyUid" : "seniorUid", "==", uid));
  return onSnapshot(q, { includeMetadataChanges: true }, snap => {
    if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
    onValue(snap.docs.map(d => ({ ...d.data(), id: d.id }) as ConnectionRecord)
      .filter(c => c.status === "connected")
      .sort((a,b) => b.connectedAt.toMillis() - a.connectedAt.toMillis()));
  }, onError);
}
export function watchConnectionInviteSlot(uid: string,
  onValue: (value: ConnectionInviteSlot | null) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(doc(database(), "connectionInviteSlots", uid), { includeMetadataChanges: true }, snap => {
    if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) {
      onValue(snap.exists() ? snap.data() as ConnectionInviteSlot : null);
    }
  }, onError);
}
export function connectionErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code) : "";
  switch (code) {
    case "invalid-code":
    case "permission-denied": return "Mã không hợp lệ, đã hết hạn, đã dùng hoặc thao tác không được phép. Hãy kiểm tra hoặc tạo mã mới.";
    case "already-connected": return "Hai tài khoản này đã kết nối. Bạn vẫn có thể kết nối với người khác.";
    case "not-connected": return "Kết nối này không còn hoạt động.";
    case "collision": return "Chưa tạo được mã. Vui lòng tạo mã khác.";
    case "wrong-role": return "Vai trò tài khoản không phù hợp.";
    case "firebase-unavailable":
    case "unavailable":
    case "deadline-exceeded": return "Chưa kết nối được máy chủ. Kiểm tra mạng và thử lại.";
    default: return "Chưa thể xử lý yêu cầu. Vui lòng thử lại.";
  }
}
