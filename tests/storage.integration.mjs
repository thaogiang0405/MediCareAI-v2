import { before, after, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-medicare-ai",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

const db = uid => env.authenticatedContext(uid).firestore();
const bucket = uid => env.authenticatedContext(uid).storage();
const pathFor = (seniorUid, id) => "elderlyProfiles/" + seniorUid + "/prescriptions/" + id + "/original.jpg";
const profileData = (uid, role) => ({
  uid,
  displayName: uid === "s1" ? "Nguyễn Văn An" : "Người dùng " + uid,
  primaryRole: role,
  roles: { elderly: role === "elderly", caregiver: role === "caregiver" },
  locale: "vi",
  timeZone: "Asia/Ho_Chi_Minh",
  onboardingCompleted: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

async function seedConnectedPair() {
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await setDoc(doc(store, "users", "s1"), profileData("s1", "elderly"));
    await setDoc(doc(store, "users", "f1"), profileData("f1", "caregiver"));
    await setDoc(doc(store, "users", "s2"), profileData("s2", "elderly"));
    await setDoc(doc(store, "connections", "ABCD2345"), {
      familyUid: "f1", seniorUid: "s1", status: "connected",
      createdAt: serverTimestamp(), connectedAt: serverTimestamp(),
      disconnectedAt: null, disconnectedBy: null, updatedAt: serverTimestamp(),
    });
    await setDoc(doc(store, "connectionPairs", "f1", "seniors", "s1"), {
      connectionId: "ABCD2345", status: "connected", updatedAt: serverTimestamp(),
    });
  });
}

function customMetadata(ownerUid, uploaderUid, prescriptionId, source = "camera") {
  return { ownerUid, uploadedByUid: uploaderUid, prescriptionId, source };
}

function prescriptionData(ownerUid, id, uploaderUid, role, source = "camera") {
  const caregiver = role === "caregiver";
  return {
    ownerUid,
    storagePath: pathFor(ownerUid, id),
    contentType: "image/jpeg",
    sizeBytes: 4,
    uploadedByUid: uploaderUid,
    uploadedByRole: role,
    source,
    width: 1200,
    height: 1800,
    linkedMedicationIds: caregiver ? [] : ["med-1"],
    linkedRequestIds: caregiver ? ["request-1"] : [],
    createdAt: serverTimestamp(),
    status: "active",
  };
}

test("elderly owner and active caregiver can upload and view the same private prescription image", async () => {
  await seedConnectedPair();
  const bytes = new Uint8Array([255, 216, 255, 217]);
  const ownerPath = pathFor("s1", "owner-image");
  await assertSucceeds(uploadBytes(ref(bucket("s1"), ownerPath), bytes, {
    contentType: "image/jpeg",
    customMetadata: customMetadata("s1", "s1", "owner-image"),
  }));
  await assertSucceeds(setDoc(
    doc(db("s1"), "elderlyProfiles", "s1", "prescriptions", "owner-image"),
    prescriptionData("s1", "owner-image", "s1", "elderly"),
  ));

  const caregiverPath = pathFor("s1", "caregiver-image");
  await assertSucceeds(uploadBytes(ref(bucket("f1"), caregiverPath), bytes, {
    contentType: "image/jpeg",
    customMetadata: customMetadata("s1", "f1", "caregiver-image", "library"),
  }));
  await assertSucceeds(setDoc(
    doc(db("f1"), "elderlyProfiles", "s1", "prescriptions", "caregiver-image"),
    prescriptionData("s1", "caregiver-image", "f1", "caregiver", "library"),
  ));

  const ownerReadsCaregiverImage = await assertSucceeds(getBytes(ref(bucket("s1"), caregiverPath)));
  const caregiverReadsCaregiverImage = await assertSucceeds(getBytes(ref(bucket("f1"), caregiverPath)));
  const caregiverReadsOwnerImage = await assertSucceeds(getBytes(ref(bucket("f1"), ownerPath)));
  if (
    ownerReadsCaregiverImage.length !== 4
    || caregiverReadsCaregiverImage.length !== 4
    || caregiverReadsOwnerImage.length !== 4
  ) {
    throw new Error("Expected the elderly owner and active caregiver to read each other's prescription uploads.");
  }
});

test("unconnected users and disconnected caregivers cannot read prescription images", async () => {
  await seedConnectedPair();
  const path = pathFor("s1", "shared-image");
  await assertSucceeds(uploadBytes(ref(bucket("s1"), path), new Uint8Array([1, 2, 3, 4]), {
    contentType: "image/jpeg",
    customMetadata: customMetadata("s1", "s1", "shared-image"),
  }));
  await assertSucceeds(setDoc(
    doc(db("s1"), "elderlyProfiles", "s1", "prescriptions", "shared-image"),
    prescriptionData("s1", "shared-image", "s1", "elderly"),
  ));
  await assertFails(getBytes(ref(bucket("s2"), path)));
  await assertSucceeds(env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await setDoc(doc(store, "connectionPairs", "f1", "seniors", "s1"), {
      connectionId: "ABCD2345", status: "disconnected", updatedAt: serverTimestamp(),
    });
    await setDoc(doc(store, "connections", "ABCD2345"), {
      familyUid: "f1", seniorUid: "s1", status: "disconnected",
      createdAt: serverTimestamp(), connectedAt: serverTimestamp(),
      disconnectedAt: serverTimestamp(), disconnectedBy: "f1", updatedAt: serverTimestamp(),
    });
  }));
  await assertFails(getBytes(ref(bucket("f1"), path)));
  await assertSucceeds(getBytes(ref(bucket("s1"), path)));
});

test("Storage rejects non-JPEG, oversized, and unrelated upload paths", async () => {
  await seedConnectedPair();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  await assertFails(uploadBytes(ref(bucket("s1"), pathFor("s1", "png-image")), bytes, {
    contentType: "image/png",
    customMetadata: customMetadata("s1", "s1", "png-image"),
  }));
  await assertFails(uploadBytes(ref(bucket("s1"), pathFor("s2", "wrong-owner")), bytes, {
    contentType: "image/jpeg",
    customMetadata: customMetadata("s2", "s1", "wrong-owner"),
  }));
  const tooLarge = new Uint8Array(8 * 1024 * 1024 + 1);
  await assertFails(uploadBytes(ref(bucket("s1"), pathFor("s1", "too-large")), tooLarge, {
    contentType: "image/jpeg",
    customMetadata: customMetadata("s1", "s1", "too-large"),
  }));
});

test("caregiver may clean up only their own orphan upload before a Firestore record exists", async () => {
  await seedConnectedPair();
  const orphanPath = pathFor("s1", "orphan-image");
  await assertSucceeds(uploadBytes(ref(bucket("f1"), orphanPath), new Uint8Array([1, 2, 3, 4]), {
    contentType: "image/jpeg",
    customMetadata: customMetadata("s1", "f1", "orphan-image"),
  }));
  await assertSucceeds(deleteObject(ref(bucket("f1"), orphanPath)));
});
