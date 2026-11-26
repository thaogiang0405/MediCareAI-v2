import test, { after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";

const app = initializeApp({
  apiKey: "demo-api-key",
  authDomain: "demo-medicare-ai.firebaseapp.com",
  projectId: "demo-medicare-ai",
  appId: "1:123:web:demo",
}, "phase02-auth-emulator-tests");

const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });

after(async () => {
  await signOut(auth).catch(() => {});
  await deleteApp(app);
});

test("Auth Emulator supports registration, validation, login, logout and password reset", async () => {
  const email = "senior.phase02@example.com";
  const password = "MediCareTest2026!";

  await assert.rejects(
    createUserWithEmailAndPassword(auth, "not-an-email", password),
    error => error?.code === "auth/invalid-email",
  );
  await assert.rejects(
    createUserWithEmailAndPassword(auth, email, "123"),
    error => error?.code === "auth/weak-password",
  );

  const created = await createUserWithEmailAndPassword(auth, email, password);
  assert.ok(created.user.uid);
  assert.equal(auth.currentUser?.uid, created.user.uid);

  await assert.rejects(
    createUserWithEmailAndPassword(auth, email, password),
    error => error?.code === "auth/email-already-in-use",
  );

  await signOut(auth);
  assert.equal(auth.currentUser, null);

  await assert.rejects(
    signInWithEmailAndPassword(auth, email, "WrongPassword2026!"),
    error => error?.code === "auth/invalid-credential" || error?.code === "auth/wrong-password",
  );

  const signedIn = await signInWithEmailAndPassword(auth, email, password);
  assert.equal(signedIn.user.uid, created.user.uid);

  await sendPasswordResetEmail(auth, email);
});
