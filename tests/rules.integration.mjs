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
  runTransaction,
  query,
  where,
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


const assertEqual = (actual, expected) => {
  if (actual !== expected) throw new Error("Expected " + expected + ", got " + actual);
};
const names = { f1: "Nguyễn Thị Bình", f2: "Trần Thị Hoa", s1: "Nguyễn Văn An", s2: "Trần Văn Nam", s3: "Lê Văn Minh" };
async function seedUsers() {
  await env.withSecurityRulesDisabled(async c => {
    for (const [uid, name] of Object.entries(names)) {
      await setDoc(userRef(c.firestore(), uid), profileData(uid, uid.startsWith("f") ? "caregiver" : "elderly", name));
    }
  });
}
const pairRef = (store, f, s) => doc(store, "connectionPairs", f, "seniors", s);
const inviteRef = (store, code) => doc(store, "connectionInvites", code);
const slotRef = (store, f) => doc(store, "connectionInviteSlots", f);
const connRef = (store, code) => doc(store, "connections", code);
const unused = () => ({ status: "active", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), usedBy: null, usedAt: null, connectionId: null });
const consumed = (s, code) => ({ status: "used", usedBy: s, usedAt: serverTimestamp(), connectionId: code, updatedAt: serverTimestamp() });

function issue(f, code, actor = f) {
  const store = db(actor);
  return runTransaction(store, async tx => {
    const slot = await tx.get(slotRef(store, f));
    if (slot.exists() && slot.data().status === "active") {
      tx.update(inviteRef(store, slot.data().inviteCode), { status: "revoked", updatedAt: serverTimestamp() });
    }
    tx.set(inviteRef(store, code), { familyUid: f, familyDisplayName: names[f], ...unused() });
    tx.set(slotRef(store, f), { familyUid: f, inviteCode: code, ...unused() });
  });
}
function stageConnect(tx, store, f, s, code) {
  tx.set(connRef(store, code), { familyUid: f, seniorUid: s, familyDisplayName: names[f],
    seniorDisplayName: names[s], status: "connected", createdAt: serverTimestamp(),
    connectedAt: serverTimestamp(), disconnectedAt: null, disconnectedBy: null, updatedAt: serverTimestamp() });
  tx.update(inviteRef(store, code), consumed(s, code));
  tx.update(slotRef(store, f), consumed(s, code));
  tx.set(pairRef(store, f, s), { connectionId: code, status: "connected", updatedAt: serverTimestamp() });
}
function connect(f, s, code, actor = s) {
  const store = db(actor);
  return runTransaction(store, async tx => {
    await tx.get(inviteRef(store, code));
    await tx.get(pairRef(store, f, s));
    stageConnect(tx, store, f, s, code);
  });
}
// Deliberately skip client checks to test the server's invariants.
function forceConnect(f, s, code, actor = s) {
  const store = db(actor);
  const batch = writeBatch(store);
  stageConnect(batch, store, f, s, code);
  return batch.commit();
}
function disconnect(f, s, code, actor) {
  const store = db(actor);
  return runTransaction(store, async tx => {
    await tx.get(connRef(store, code));
    tx.update(connRef(store, code), { status: "disconnected", disconnectedAt: serverTimestamp(),
      disconnectedBy: actor, updatedAt: serverTimestamp() });
    tx.update(pairRef(store, f, s), { status: "disconnected", updatedAt: serverTimestamp() });
  });
}
async function active(uid) {
  const store = db(uid);
  const field = uid.startsWith("f") ? "familyUid" : "seniorUid";
  const snap = await assertSucceeds(getDocs(query(collection(store, "connections"), where(field, "==", uid))));
  return snap.docs.filter(d => d.data().status === "connected").map(d => d.id).sort().join(",");
}

test("family creates a code using actual client transaction reads; senior can preview, others cannot list", async () => {
  await seedUsers();
  await assertSucceeds(issue("f1","ABCD2345"));
  assertEqual((await assertSucceeds(getDoc(inviteRef(db("s1"),"ABCD2345")))).data().familyDisplayName,names.f1);
  await assertFails(getDoc(inviteRef(db("f2"),"ABCD2345")));
  await assertFails(getDocs(collection(db("s1"),"connectionInvites")));
  await assertFails(issue("s1","EFGH6789"));
  await assertFails(forceConnect("f1","s1","ABCD2345","f1"));
});
test("many-to-many: two caregivers for one senior and one caregiver for two seniors", async () => {
  await seedUsers();
  await assertSucceeds(issue("f1","ABCD2345"));
  await assertSucceeds(connect("f1","s1","ABCD2345"));
  await assertSucceeds(issue("f2","EFGH6789"));
  await assertSucceeds(connect("f2","s1","EFGH6789"));
  await assertSucceeds(issue("f1","JKLM2345"));
  await assertSucceeds(connect("f1","s2","JKLM2345"));
  assertEqual(await active("s1"),"ABCD2345,EFGH6789");
  assertEqual(await active("f1"),"ABCD2345,JKLM2345");
  assertEqual(await active("s2"),"JKLM2345");
  assertEqual(await active("f2"),"EFGH6789");
});
test("duplicate pair and consumed code cannot be accepted, even with direct writes", async () => {
  await seedUsers();
  await assertSucceeds(issue("f1","ABCD2345"));
  await assertSucceeds(connect("f1","s1","ABCD2345"));
  await assertFails(forceConnect("f1","s2","ABCD2345"));
  await assertFails(getDoc(inviteRef(db("s2"),"ABCD2345")));
  await assertSucceeds(issue("f1","EFGH6789"));
  await assertFails(forceConnect("f1","s1","EFGH6789"));
  assertEqual((await assertSucceeds(getDoc(inviteRef(db("f1"),"EFGH6789")))).data().status,"active");
  await assertSucceeds(connect("f1","s2","EFGH6789"));
});
test("either side disconnects exactly one pair; reconnect preserves previous history", async () => {
  await seedUsers();
  await assertSucceeds(issue("f1","ABCD2345"));
  await assertSucceeds(connect("f1","s1","ABCD2345"));
  await assertSucceeds(issue("f2","EFGH6789"));
  await assertSucceeds(connect("f2","s1","EFGH6789"));
  await assertSucceeds(issue("f1","JKLM2345"));
  await assertSucceeds(connect("f1","s2","JKLM2345"));
  await assertSucceeds(disconnect("f1","s1","ABCD2345","s1"));
  assertEqual(await active("s1"),"EFGH6789");
  assertEqual(await active("f1"),"JKLM2345");
  await assertSucceeds(issue("f1","NPQR6789"));
  await assertSucceeds(connect("f1","s1","NPQR6789"));
  assertEqual(await active("s1"),"EFGH6789,NPQR6789");
  await assertSucceeds(disconnect("f1","s1","NPQR6789","f1"));
  assertEqual(await active("f1"),"JKLM2345");
  assertEqual(await active("s1"),"EFGH6789");
  assertEqual((await assertSucceeds(getDoc(connRef(db("s1"),"ABCD2345")))).data().disconnectedBy,"s1");
  assertEqual((await assertSucceeds(getDoc(connRef(db("f1"),"NPQR6789")))).data().disconnectedBy,"f1");
});
test("unrelated users cannot read/list/write pair, history, profiles or health records", async () => {
  await seedUsers();
  await assertSucceeds(issue("f1","ABCD2345"));
  await assertSucceeds(connect("f1","s1","ABCD2345"));
  const stranger = db("s3");
  await assertFails(getDoc(connRef(stranger,"ABCD2345")));
  await assertFails(getDoc(pairRef(stranger,"f1","s1")));
  await assertFails(getDocs(query(collection(stranger,"connections"),where("familyUid","==","f1"))));
  await assertFails(getDocs(collection(db("f1"),"connections")));
  await assertFails(getDoc(userRef(db("f1"),"s1")));
  await assertFails(getDoc(doc(db("f1"),"elderlyProfiles","s1","medications","m1")));
  await assertFails(disconnect("f1","s1","ABCD2345","s3"));
  await assertFails(setDoc(pairRef(db("s1"),"f2","s1"),{ connectionId:"ABCD2345",status:"connected",updatedAt:serverTimestamp() }));
  await assertFails(setDoc(pairRef(db("s1"),"f1","s3"),{ connectionId:"ABCD2345",status:"connected",updatedAt:serverTimestamp() }));
  await assertFails(updateDoc(connRef(db("s1"),"ABCD2345"),{ familyUid:"f2",updatedAt:serverTimestamp() }));
  await assertFails(updateDoc(connRef(db("s1"),"ABCD2345"),{ status:"disconnected",disconnectedAt:serverTimestamp(),disconnectedBy:"s1",updatedAt:serverTimestamp() }));
  await assertFails(updateDoc(pairRef(db("s1"),"f1","s1"),{ status:"disconnected",updatedAt:serverTimestamp() }));
});
test("replacement invalidates old code and collision cannot overwrite another invite", async () => {
  await seedUsers();
  await assertSucceeds(issue("f1","ABCD2345"));
  await assertFails(issue("f2","ABCD2345"));
  await assertSucceeds(issue("f1","EFGH6789"));
  await assertFails(getDoc(inviteRef(db("s1"),"ABCD2345")));
  await assertFails(forceConnect("f1","s1","ABCD2345"));
  await assertSucceeds(connect("f1","s1","EFGH6789"));
});
test("expired code is denied by server time without waiting 15 minutes", async () => {
  await seedUsers();
  await assertSucceeds(issue("f1","ABCD2345"));
  await env.withSecurityRulesDisabled(async c => {
    const store = c.firestore();
    const past = Timestamp.fromMillis(Date.now()-16*60000);
    await updateDoc(inviteRef(store,"ABCD2345"),{createdAt:past});
    await updateDoc(slotRef(store,"f1"),{createdAt:past});
  });
  await assertFails(getDoc(inviteRef(db("s1"),"ABCD2345")));
  await assertFails(forceConnect("f1","s1","ABCD2345"));
});
test("concurrent acceptance allows exactly one senior per invite", async () => {
  await seedUsers();
  await assertSucceeds(issue("f1","ABCD2345"));
  const results = await Promise.allSettled([forceConnect("f1","s1","ABCD2345"),forceConnect("f1","s2","ABCD2345")]);
  assertEqual(results.filter(r => r.status === "fulfilled").length,1);
  assertEqual(await active("f1"),"ABCD2345");
});
test("partial connection or invite writes cannot bypass atomic workflow", async () => {
  await seedUsers();
  const store = db("f1");
  await assertFails(setDoc(inviteRef(store,"ABCD2345"),{familyUid:"f1",familyDisplayName:names.f1,...unused()}));
  await assertSucceeds(issue("f1","ABCD2345"));
  await assertFails(updateDoc(inviteRef(db("s1"),"ABCD2345"),consumed("s1","ABCD2345")));
  await assertFails(setDoc(pairRef(db("s1"),"f1","s1"),{connectionId:"ABCD2345",status:"connected",updatedAt:serverTimestamp()}));
});
