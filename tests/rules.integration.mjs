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
  Timestamp,
  writeBatch,
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

const profileData = (uid, primaryRole = "elderly", displayName = "Nguyễn Văn An") => ({
  uid,
  displayName,
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


async function seedProfile(uid, role, displayName) {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(userRef(context.firestore(), uid), profileData(uid, role, displayName));
  });
}

async function seedConnectionUsers() {
  await seedProfile("family-user", "caregiver", "Nguyễn Thị Bình");
  await seedProfile("senior-user", "elderly", "Nguyễn Văn An");
  await seedProfile("other-family", "caregiver", "Trần Thị Hoa");
  await seedProfile("other-senior", "elderly", "Trần Văn Nam");
  await seedProfile("victim-user", "elderly", "Lê Văn Minh");
}

async function createInviteAsFamily(code) {
  const family = db("family-user");
  const inviteRef = doc(family, "connectionInvites", code);
  const slotRef = doc(family, "connectionInviteSlots", "family-user");
  const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);
  const inviteData = {
    familyUid: "family-user",
    familyDisplayName: "Nguyễn Thị Bình",
    status: "active",
    createdAt: serverTimestamp(),
    expiresAt,
    usedBy: null,
    usedAt: null,
    connectionId: null,
    updatedAt: serverTimestamp(),
  };
  const slotData = {
    familyUid: "family-user",
    inviteCode: code,
    status: "active",
    createdAt: serverTimestamp(),
    expiresAt,
    usedBy: null,
    usedAt: null,
    connectionId: null,
    updatedAt: serverTimestamp(),
  };

  const slotSnapshot = await getDoc(slotRef);
  const batch = writeBatch(family);
  batch.set(inviteRef, inviteData);
  if (slotSnapshot.exists()) {
    const previousCode = slotSnapshot.data().inviteCode;
    if (typeof previousCode === "string" && previousCode !== code) {
      const previousInviteRef = doc(family, "connectionInvites", previousCode);
      const previousInvite = await getDoc(previousInviteRef);
      if (previousInvite.exists() && previousInvite.data().status === "active") {
        batch.update(previousInviteRef, {
          status: "revoked",
          updatedAt: serverTimestamp(),
        });
      }
    }
    batch.update(slotRef, slotData);
  } else {
    batch.set(slotRef, slotData);
  }
  await assertSucceeds(batch.commit());
}

async function connectAsSenior(code) {
  const senior = db("senior-user");
  const batch = writeBatch(senior);
  const inviteRef = doc(senior, "connectionInvites", code);
  const slotRef = doc(senior, "connectionInviteSlots", "family-user");
  const connectionRef = doc(senior, "connections", code);

  batch.update(inviteRef, {
    status: "used",
    usedBy: "senior-user",
    usedAt: serverTimestamp(),
    connectionId: code,
    updatedAt: serverTimestamp(),
  });
  batch.update(slotRef, {
    status: "used",
    usedBy: "senior-user",
    usedAt: serverTimestamp(),
    connectionId: code,
    updatedAt: serverTimestamp(),
  });
  batch.set(connectionRef, {
    familyUid: "family-user",
    seniorUid: "senior-user",
    familyDisplayName: "Nguyễn Thị Bình",
    seniorDisplayName: "Nguyễn Văn An",
    status: "connected",
    createdAt: serverTimestamp(),
    connectedAt: serverTimestamp(),
    disconnectedAt: null,
    disconnectedBy: null,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(senior, "connectionMembers", "family-user"), {
    uid: "family-user",
    role: "family",
    counterpartUid: "senior-user",
    counterpartDisplayName: "Nguyễn Văn An",
    connectionId: code,
    status: "connected",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(senior, "connectionMembers", "senior-user"), {
    uid: "senior-user",
    role: "senior",
    counterpartUid: "family-user",
    counterpartDisplayName: "Nguyễn Thị Bình",
    connectionId: code,
    status: "connected",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await assertSucceeds(batch.commit());
}

async function disconnectAs(uid, code) {
  const firestore = db(uid);
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "connections", code), {
    status: "disconnected",
    disconnectedAt: serverTimestamp(),
    disconnectedBy: uid,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(firestore, "connectionMembers", "family-user"), {
    status: "disconnected",
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(firestore, "connectionMembers", "senior-user"), {
    status: "disconnected",
    updatedAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
}

test("family creates a one-use invite; only the family owner and a senior with the code can preview it", async () => {
  await seedConnectionUsers();
  await createInviteAsFamily("ABCD2345");

  const family = db("family-user");
  const senior = db("senior-user");
  const otherFamily = db("other-family");

  const ownerSnapshot = await assertSucceeds(
    getDoc(doc(family, "connectionInvites", "ABCD2345")),
  );
  if (ownerSnapshot.data().familyDisplayName !== "Nguyễn Thị Bình") {
    throw new Error("The invite should expose the correct family display name.");
  }

  await assertSucceeds(getDoc(doc(senior, "connectionInvites", "ABCD2345")));
  await assertFails(getDoc(doc(otherFamily, "connectionInvites", "ABCD2345")));
  await assertFails(getDocs(collection(senior, "connectionInvites")));
  await assertFails(
    setDoc(doc(senior, "connectionInvites", "EFGH6789"), {
      familyUid: "senior-user",
      familyDisplayName: "Nguyễn Văn An",
      status: "active",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 600000),
      usedBy: null,
      usedAt: null,
      connectionId: null,
      updatedAt: serverTimestamp(),
    }),
  );
});

test("senior consumes an invite atomically; connection history and member indexes are private", async () => {
  await seedConnectionUsers();
  await createInviteAsFamily("ABCD2345");
  await connectAsSenior("ABCD2345");

  const family = db("family-user");
  const senior = db("senior-user");
  const otherSenior = db("other-senior");

  await assertSucceeds(getDoc(doc(family, "connections", "ABCD2345")));
  await assertSucceeds(getDoc(doc(senior, "connections", "ABCD2345")));
  await assertFails(getDoc(doc(otherSenior, "connections", "ABCD2345")));
  await assertSucceeds(getDoc(doc(family, "connectionMembers", "family-user")));
  await assertSucceeds(getDoc(doc(senior, "connectionMembers", "senior-user")));
  await assertFails(getDoc(doc(family, "connectionMembers", "senior-user")));
  await assertFails(getDoc(doc(senior, "connectionMembers", "family-user")));
  await assertFails(getDoc(doc(otherSenior, "connectionInvites", "ABCD2345")));

  const invite = await assertSucceeds(
    getDoc(doc(family, "connectionInvites", "ABCD2345")),
  );
  if (invite.data().status !== "used" || invite.data().usedBy !== "senior-user") {
    throw new Error("The invite must be marked used by the confirming senior.");
  }
});

test("a senior cannot create a member index for an unrelated account", async () => {
  await seedConnectionUsers();
  await createInviteAsFamily("ABCD2345");
  await connectAsSenior("ABCD2345");

  const senior = db("senior-user");
  await assertFails(
    setDoc(doc(senior, "connectionMembers", "victim-user"), {
      uid: "victim-user",
      role: "senior",
      counterpartUid: "family-user",
      counterpartDisplayName: "Nguyễn Thị Bình",
      connectionId: "ABCD2345",
      status: "connected",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
});

test("either participant can disconnect; the family can reconnect with a fresh one-use code", async () => {
  await seedConnectionUsers();
  await createInviteAsFamily("ABCD2345");
  await connectAsSenior("ABCD2345");
  await disconnectAs("senior-user", "ABCD2345");

  const family = db("family-user");
  const firstHistory = await assertSucceeds(
    getDoc(doc(family, "connections", "ABCD2345")),
  );
  if (firstHistory.data().status !== "disconnected"
    || firstHistory.data().disconnectedBy !== "senior-user") {
    throw new Error("The first connection should retain its disconnection history.");
  }

  await createInviteAsFamily("EFGH6789");
  await connectAsSenior("EFGH6789");
  await disconnectAs("family-user", "EFGH6789");

  const secondHistory = await assertSucceeds(
    getDoc(doc(family, "connections", "EFGH6789")),
  );
  const familyMember = await assertSucceeds(
    getDoc(doc(family, "connectionMembers", "family-user")),
  );
  if (secondHistory.data().status !== "disconnected"
    || secondHistory.data().disconnectedBy !== "family-user"
    || familyMember.data().status !== "disconnected"
    || familyMember.data().connectionId !== "EFGH6789") {
    throw new Error("The second connection should disconnect cleanly from the family side.");
  }
});

test("creating a replacement invite revokes the previous active code", async () => {
  await seedConnectionUsers();
  await createInviteAsFamily("ABCD2345");
  await createInviteAsFamily("EFGH6789");

  const senior = db("senior-user");
  await assertFails(getDoc(doc(senior, "connectionInvites", "ABCD2345")));
  await assertSucceeds(getDoc(doc(senior, "connectionInvites", "EFGH6789")));
});
