import { before, after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  getDocs,
} from "firebase/firestore";

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-medicare-ai",
    firestore: { rules: readFileSync("firestore.emulator.rules", "utf8") },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const db = uid =>
  env.authenticatedContext(uid, { email: uid + "@example.com" }).firestore();

const profileData = (uid, primaryRole = "elderly") => ({
  uid,
  displayName: "Nguyễn Văn An",
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

const userRef = (firestore, uid) => doc(firestore, "users", uid);

test("owner creates and reads elderly and caregiver profiles", async () => {
  for (const [uid, role] of [
    ["elderly-user", "elderly"],
    ["caregiver-user", "caregiver"],
  ]) {
    const firestore = db(uid);
    await assertSucceeds(setDoc(userRef(firestore, uid), profileData(uid, role)));
    const snapshot = await assertSucceeds(getDoc(userRef(firestore, uid)));
    if (!snapshot.exists() || snapshot.data().primaryRole !== role) {
      throw new Error("Expected the created profile to be readable by its owner.");
    }
  }
});

test("anonymous users cannot read or create profiles", async () => {
  const firestore = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(userRef(firestore, "elderly-user")));
  await assertFails(
    setDoc(userRef(firestore, "elderly-user"), profileData("elderly-user")),
  );
});

test("users cannot read, update, or create another user's profile", async () => {
  await assertSucceeds(
    setDoc(userRef(db("owner"), "owner"), profileData("owner")),
  );

  const other = db("other");
  await assertFails(getDoc(userRef(other, "owner")));
  await assertFails(
    updateDoc(userRef(other, "owner"), {
      displayName: "Tên khác",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(userRef(other, "someone-else"), profileData("someone-else")),
  );
});

test("profile schema rejects invalid roles, mismatched role flags, and extra fields", async () => {
  const firestore = db("owner");

  await assertFails(
    setDoc(userRef(firestore, "owner"), profileData("owner", "admin")),
  );
  await assertFails(
    setDoc(userRef(firestore, "owner"), {
      ...profileData("owner"),
      roles: { elderly: false, caregiver: true },
    }),
  );
  await assertFails(
    setDoc(userRef(firestore, "owner"), {
      ...profileData("owner"),
      email: "owner@example.com",
    }),
  );
  await assertFails(
    setDoc(userRef(firestore, "owner"), {
      ...profileData("owner"),
      password: "not-allowed",
    }),
  );
  await assertFails(
    setDoc(userRef(firestore, "owner"), {
      ...profileData("owner"),
      displayName: "A",
    }),
  );
});

test("owner can update display name but cannot change role or delete profile", async () => {
  const firestore = db("owner");
  const profile = userRef(firestore, "owner");

  await assertSucceeds(setDoc(profile, profileData("owner")));
  await assertSucceeds(
    updateDoc(profile, {
      displayName: "Nguyễn Thị Bình",
      updatedAt: serverTimestamp(),
    }),
  );

  await assertFails(
    updateDoc(profile, {
      primaryRole: "caregiver",
      roles: { elderly: false, caregiver: true },
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(profile, {
      email: "new@example.com",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(deleteDoc(profile));
  await assertFails(getDocs(collection(firestore, "users")));
});

test("only an elderly owner can read their own medication path", async () => {
  const elderly = db("elderly-user");
  const caregiver = db("caregiver-user");

  await assertSucceeds(
    setDoc(
      userRef(elderly, "elderly-user"),
      profileData("elderly-user", "elderly"),
    ),
  );
  await assertSucceeds(
    setDoc(
      userRef(caregiver, "caregiver-user"),
      profileData("caregiver-user", "caregiver"),
    ),
  );

  await assertSucceeds(
    getDoc(doc(elderly, "elderlyProfiles", "elderly-user", "medications", "m1")),
  );
  await assertFails(
    getDoc(doc(caregiver, "elderlyProfiles", "caregiver-user", "medications", "m1")),
  );
  await assertFails(
    getDoc(doc(caregiver, "elderlyProfiles", "elderly-user", "medications", "m1")),
  );
});

test("caregiver, invite, and unknown collections remain denied", async () => {
  const firestore = db("owner");

  await assertFails(getDoc(doc(firestore, "caregiverProfiles", "owner")));
  await assertFails(getDoc(doc(firestore, "caregiverInvites", "invite-1")));
  await assertFails(getDoc(doc(firestore, "unknownCollection", "document-1")));
});
