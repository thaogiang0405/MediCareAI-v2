import { doc, getDocFromServer, runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { services } from "@/lib/firebase";
import { isRole, validName, type Role } from "@/features/auth/validation";

// UI roles stay readable; persisted values match the existing Firebase Rules.
type PersistedRole = "elderly" | "caregiver";
export type Profile = { uid: string; fullName: string; email: string; role: Role };

function toPersistedRole(role: Role): PersistedRole {
  return role === "senior" ? "elderly" : "caregiver";
}

function fromPersistedRole(value: unknown): Role | null {
  if (value === "elderly") return "senior";
  if (value === "caregiver") return "family";
  return null;
}

function reference(uid: string) {
  if (!services) throw new Error("Firebase unavailable");
  return doc(services.db, "users", uid);
}

export async function readProfile(user: User): Promise<Profile | null> {
  if (!user.email) throw new Error("Authenticated account has no email.");
  const snap = await getDocFromServer(reference(user.uid));
  if (!snap.exists()) return null;

  const data = snap.data();
  const role = fromPersistedRole(data.primaryRole);
  const expectedElderly = role === "senior";
  const expectedCaregiver = role === "family";
  const validRoles =
    data.roles !== null &&
    typeof data.roles === "object" &&
    data.roles.elderly === expectedElderly &&
    data.roles.caregiver === expectedCaregiver;

  if (
    data.uid !== user.uid ||
    typeof data.displayName !== "string" ||
    !validName(data.displayName) ||
    !role ||
    !validRoles ||
    data.locale !== "vi" ||
    data.timeZone !== "Asia/Ho_Chi_Minh" ||
    data.onboardingCompleted !== true
  ) {
    throw new Error("Invalid profile");
  }

  return {
    uid: data.uid,
    fullName: data.displayName,
    email: user.email,
    role,
  };
}

export async function completeProfile(user: User, fullName: string, role: Role) {
  if (
    !services ||
    !user.email ||
    services.auth.currentUser?.uid !== user.uid ||
    !validName(fullName) ||
    !isRole(role)
  ) {
    throw new Error("Invalid profile");
  }

  const ref = reference(user.uid);
  const primaryRole = toPersistedRole(role);

  await runTransaction(services.db, async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists()) return;

    transaction.set(ref, {
      uid: user.uid,
      displayName: fullName.trim(),
      primaryRole,
      roles: {
        elderly: primaryRole === "elderly",
        caregiver: primaryRole === "caregiver",
      },
      locale: "vi",
      timeZone: "Asia/Ho_Chi_Minh",
      onboardingCompleted: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function changeName(user: User, fullName: string) {
  if (
    !services ||
    services.auth.currentUser?.uid !== user.uid ||
    !validName(fullName)
  ) {
    throw new Error("Invalid name");
  }

  await updateDoc(reference(user.uid), {
    displayName: fullName.trim(),
    updatedAt: serverTimestamp(),
  });
}
