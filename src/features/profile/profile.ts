import { doc, getDocFromServer, runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { services } from "@/lib/firebase";
import { isRole, validName, type Role } from "@/features/auth/validation";

export type Profile = { uid: string; fullName: string; email: string; role: Role };
function reference(uid: string) {
  if (!services) throw new Error("Firebase unavailable");
  return doc(services.db, "users", uid);
}
export async function readProfile(user: User): Promise<Profile | null> {
  const snap = await getDocFromServer(reference(user.uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  if (d.uid !== user.uid || d.email !== user.email || typeof d.fullName !== "string" || !validName(d.fullName) || !isRole(d.role)) throw new Error("Invalid profile");
  return { uid: d.uid, fullName: d.fullName, email: d.email, role: d.role };
}
export async function completeProfile(user: User, fullName: string, role: Role) {
  if (!services || !user.email || services.auth.currentUser?.uid !== user.uid || !validName(fullName) || !isRole(role)) throw new Error("Invalid profile");
  const ref = reference(user.uid);
  await runTransaction(services.db, async tx => {
    const existing = await tx.get(ref);
    if (existing.exists()) return;
    tx.set(ref, { uid: user.uid, email: user.email, fullName: fullName.trim(), role, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}
export async function changeName(user: User, fullName: string) {
  if (!services || services.auth.currentUser?.uid !== user.uid || !validName(fullName)) throw new Error("Invalid name");
  await updateDoc(reference(user.uid), { fullName: fullName.trim(), updatedAt: serverTimestamp() });
}
