import type { User } from "firebase/auth";
import {
  Timestamp,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getRandomBytesAsync } from "expo-crypto";
import { services } from "@/lib/firebase";
import type { Profile } from "@/features/profile/profile";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
export const CONNECTION_INVITE_TTL_MS = 15 * 60 * 1000;

export type ConnectionStatus = "connected" | "disconnected";
export type InviteStatus = "active" | "used" | "revoked";

export type ConnectionMember = {
  uid: string;
  role: "family" | "senior";
  counterpartUid: string;
  counterpartDisplayName: string;
  connectionId: string;
  status: ConnectionStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type ConnectionInviteSlot = {
  familyUid: string;
  inviteCode: string;
  status: "active" | "used";
  expiresAt: Timestamp;
  usedBy: string | null;
  usedAt: Timestamp | null;
  connectionId: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ConnectionRecord = {
  familyUid: string;
  seniorUid: string;
  familyDisplayName: string;
  seniorDisplayName: string;
  status: ConnectionStatus;
  createdAt: Timestamp;
  connectedAt: Timestamp;
  disconnectedAt: Timestamp | null;
  disconnectedBy: string | null;
  updatedAt: Timestamp;
};

export type ConnectionInvitePreview = {
  code: string;
  familyUid: string;
  familyDisplayName: string;
  expiresAt: Timestamp;
};

export class ConnectionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ConnectionError";
  }
}

function database() {
  if (!services) throw new ConnectionError("firebase-unavailable");
  return services.db;
}

function assertIdentity(user: User, profile: Profile, role: Profile["role"]) {
  if (user.uid !== profile.uid || profile.role !== role) {
    throw new ConnectionError("wrong-role");
  }
}

export function normalizeConnectionCode(value: string) {
  return value.toUpperCase().replace(/\s+/g, "");
}

export async function generateConnectionCode() {
  const bytes = await getRandomBytesAsync(8);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte & 31];
  return code;
}

export async function createConnectionInvite(user: User, profile: Profile) {
  assertIdentity(user, profile, "family");
  const db = database();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = await generateConnectionCode();
    const expiresAt = Timestamp.fromMillis(Date.now() + CONNECTION_INVITE_TTL_MS);
    const inviteRef = doc(db, "connectionInvites", code);
    const slotRef = doc(db, "connectionInviteSlots", user.uid);
    const memberRef = doc(db, "connectionMembers", user.uid);

    try {
      await runTransaction(db, async transaction => {
        const memberSnapshot = await transaction.get(memberRef);
        const slotSnapshot = await transaction.get(slotRef);
        const newInviteSnapshot = await transaction.get(inviteRef);

        let previousInviteRef: DocumentReference<DocumentData> | null = null;
        let previousInviteSnapshot: DocumentSnapshot<DocumentData> | null = null;
        if (slotSnapshot.exists()) {
          const previousCode = slotSnapshot.data().inviteCode;
          if (typeof previousCode === "string" && previousCode !== code) {
            previousInviteRef = doc(db, "connectionInvites", previousCode);
            previousInviteSnapshot = await transaction.get(previousInviteRef);
          }
        }

        if (newInviteSnapshot.exists()) throw new ConnectionError("code-collision");
        if (memberSnapshot.exists() && memberSnapshot.data().status === "connected") {
          throw new ConnectionError("already-connected");
        }

        if (previousInviteRef && previousInviteSnapshot?.exists()
          && previousInviteSnapshot.data().status === "active") {
          transaction.update(previousInviteRef, {
            status: "revoked",
            updatedAt: serverTimestamp(),
          });
        }

        transaction.set(inviteRef, {
          familyUid: user.uid,
          familyDisplayName: profile.fullName.trim(),
          status: "active",
          createdAt: serverTimestamp(),
          expiresAt,
          usedBy: null,
          usedAt: null,
          connectionId: null,
          updatedAt: serverTimestamp(),
        });

        transaction.set(slotRef, {
          familyUid: user.uid,
          inviteCode: code,
          status: "active",
          createdAt: serverTimestamp(),
          expiresAt,
          usedBy: null,
          usedAt: null,
          connectionId: null,
          updatedAt: serverTimestamp(),
        });
      });

      return {
        familyUid: user.uid,
        inviteCode: code,
        status: "active" as const,
        expiresAt,
        usedBy: null,
        usedAt: null,
        connectionId: null,
      };
    } catch (error) {
      if (error instanceof ConnectionError && error.code === "code-collision") continue;
      throw error;
    }
  }

  throw new ConnectionError("code-generation-failed");
}

export async function getConnectionInvitePreview(
  user: User,
  profile: Profile,
  rawCode: string,
): Promise<ConnectionInvitePreview> {
  assertIdentity(user, profile, "senior");
  const code = normalizeConnectionCode(rawCode);
  if (!CODE_PATTERN.test(code)) throw new ConnectionError("invalid-code");

  const snapshot = await getDoc(doc(database(), "connectionInvites", code));
  if (!snapshot.exists()) throw new ConnectionError("invalid-code");

  const invite = snapshot.data();
  if (invite.status === "used") throw new ConnectionError("used-code");
  if (invite.status !== "active") throw new ConnectionError("invalid-code");
  if (!(invite.expiresAt instanceof Timestamp) || invite.expiresAt.toMillis() <= Date.now()) {
    throw new ConnectionError("expired-code");
  }
  if (invite.familyUid === user.uid) throw new ConnectionError("self-connection");

  return {
    code,
    familyUid: invite.familyUid as string,
    familyDisplayName: invite.familyDisplayName as string,
    expiresAt: invite.expiresAt as Timestamp,
  };
}

export async function confirmConnection(
  user: User,
  profile: Profile,
  preview: ConnectionInvitePreview,
) {
  assertIdentity(user, profile, "senior");
  const db = database();
  const code = preview.code;
  const inviteRef = doc(db, "connectionInvites", code);
  const slotRef = doc(db, "connectionInviteSlots", preview.familyUid);
  const connectionRef = doc(db, "connections", code);
  const seniorMemberRef = doc(db, "connectionMembers", user.uid);
  const familyMemberRef = doc(db, "connectionMembers", preview.familyUid);

  await runTransaction(db, async transaction => {
    const inviteSnapshot = await transaction.get(inviteRef);
    const seniorMemberSnapshot = await transaction.get(seniorMemberRef);
    const connectionSnapshot = await transaction.get(connectionRef);

    if (!inviteSnapshot.exists()) throw new ConnectionError("invalid-code");
    const invite = inviteSnapshot.data();

    if (invite.status === "used") throw new ConnectionError("used-code");
    if (invite.status !== "active" || !(invite.expiresAt instanceof Timestamp)
      || invite.expiresAt.toMillis() <= Date.now()) {
      throw new ConnectionError("expired-code");
    }
    if (invite.familyUid !== preview.familyUid || invite.familyDisplayName !== preview.familyDisplayName) {
      throw new ConnectionError("invalid-code");
    }
    if (seniorMemberSnapshot.exists() && seniorMemberSnapshot.data().status === "connected") {
      throw new ConnectionError("already-connected");
    }
    if (connectionSnapshot.exists()) throw new ConnectionError("used-code");

    const familyDisplayName = invite.familyDisplayName as string;
    const seniorDisplayName = profile.fullName.trim();

    transaction.set(connectionRef, {
      familyUid: preview.familyUid,
      seniorUid: user.uid,
      familyDisplayName,
      seniorDisplayName,
      status: "connected",
      createdAt: serverTimestamp(),
      connectedAt: serverTimestamp(),
      disconnectedAt: null,
      disconnectedBy: null,
      updatedAt: serverTimestamp(),
    });

    transaction.update(inviteRef, {
      status: "used",
      usedBy: user.uid,
      usedAt: serverTimestamp(),
      connectionId: code,
      updatedAt: serverTimestamp(),
    });

    transaction.update(slotRef, {
      status: "used",
      usedBy: user.uid,
      usedAt: serverTimestamp(),
      connectionId: code,
      updatedAt: serverTimestamp(),
    });

    transaction.set(familyMemberRef, {
      uid: preview.familyUid,
      role: "family",
      counterpartUid: user.uid,
      counterpartDisplayName: seniorDisplayName,
      connectionId: code,
      status: "connected",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.set(seniorMemberRef, {
      uid: user.uid,
      role: "senior",
      counterpartUid: preview.familyUid,
      counterpartDisplayName: familyDisplayName,
      connectionId: code,
      status: "connected",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function disconnectConnection(user: User, profile: Profile) {
  if (user.uid !== profile.uid) throw new ConnectionError("wrong-role");
  const db = database();
  const memberRef = doc(db, "connectionMembers", user.uid);

  await runTransaction(db, async transaction => {
    const memberSnapshot = await transaction.get(memberRef);
    if (!memberSnapshot.exists() || memberSnapshot.data().status !== "connected") {
      throw new ConnectionError("not-connected");
    }

    const member = memberSnapshot.data() as ConnectionMember;
    const connectionRef = doc(db, "connections", member.connectionId);
    const connectionSnapshot = await transaction.get(connectionRef);
    if (!connectionSnapshot.exists()) throw new ConnectionError("not-connected");

    const connection = connectionSnapshot.data() as ConnectionRecord;
    if (connection.status !== "connected"
      || (connection.familyUid !== user.uid && connection.seniorUid !== user.uid)) {
      throw new ConnectionError("not-connected");
    }

    const familyMemberRef = doc(db, "connectionMembers", connection.familyUid);
    const seniorMemberRef = doc(db, "connectionMembers", connection.seniorUid);

    transaction.update(connectionRef, {
      status: "disconnected",
      disconnectedAt: serverTimestamp(),
      disconnectedBy: user.uid,
      updatedAt: serverTimestamp(),
    });
    transaction.update(familyMemberRef, {
      status: "disconnected",
      updatedAt: serverTimestamp(),
    });
    transaction.update(seniorMemberRef, {
      status: "disconnected",
      updatedAt: serverTimestamp(),
    });
  });
}

export function watchConnectionMember(
  uid: string,
  onValue: (value: ConnectionMember | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(doc(database(), "connectionMembers", uid), snapshot => {
    onValue(snapshot.exists() ? snapshot.data() as ConnectionMember : null);
  }, onError);
}

export function watchConnectionInviteSlot(
  uid: string,
  onValue: (value: ConnectionInviteSlot | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(doc(database(), "connectionInviteSlots", uid), snapshot => {
    onValue(snapshot.exists() ? snapshot.data() as ConnectionInviteSlot : null);
  }, onError);
}

export function watchConnection(
  connectionId: string,
  onValue: (value: ConnectionRecord | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(doc(database(), "connections", connectionId), snapshot => {
    onValue(snapshot.exists() ? snapshot.data() as ConnectionRecord : null);
  }, onError);
}

export function connectionErrorMessage(error: unknown) {
  if (error instanceof ConnectionError) {
    switch (error.code) {
      case "invalid-code": return "Mã kết nối không đúng hoặc không còn hiệu lực.";
      case "expired-code": return "Mã kết nối đã hết hạn. Hãy nhờ người thân tạo mã mới.";
      case "used-code": return "Mã kết nối này đã được sử dụng. Vui lòng xin mã mới.";
      case "self-connection": return "Bạn không thể kết nối với chính tài khoản của mình.";
      case "already-connected": return "Tài khoản đã có một kết nối đang hoạt động. Hãy hủy kết nối cũ trước.";
      case "not-connected": return "Kết nối không còn hoạt động. Vui lòng tải lại trạng thái.";
      case "wrong-role": return "Vai trò tài khoản không phù hợp với thao tác này.";
      case "firebase-unavailable": return "Chưa thể kết nối Firebase. Vui lòng thử lại sau.";
      default: return "Chưa thể tạo mã kết nối. Vui lòng thử lại.";
    }
  }

  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  if (code === "permission-denied") {
    return "Mã không còn hợp lệ hoặc một tài khoản đã có kết nối khác. Vui lòng kiểm tra lại.";
  }
  if (code === "unavailable" || code === "auth/network-request-failed") {
    return "Không có kết nối mạng. Vui lòng thử lại.";
  }
  return "Chưa thể xử lý yêu cầu kết nối. Vui lòng thử lại.";
}
