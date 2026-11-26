import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
import * as AuthSDK from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import type { Auth, Persistence } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { Platform } from "react-native";

type Services = { auth: Auth; db: Firestore };
const cache = globalThis as typeof globalThis & { __medicareEmulator?: Services };
const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST?.trim() ?? "";
const mode = process.env.EXPO_PUBLIC_FIREBASE_MODE;
const localHost = /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(host);

function initialize(): Services {
  if (mode !== "emulator" || !localHost) {
    throw new Error("Chưa cấu hình Emulator an toàn. Firebase staging chưa được xác minh.");
  }
  if (cache.__medicareEmulator) return cache.__medicareEmulator;
  const app = getApps().find(item => item.name === "medicare-emulator") ??
    initializeApp({ projectId: "demo-medicare-ai", apiKey: "demo-api-key", appId: "1:123:web:demo" }, "medicare-emulator");
  // Metro resolves the React Native export; TS may resolve the browser declaration.
  const rnAuth = AuthSDK as typeof AuthSDK & {
    getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
  };
  let auth: Auth;
  if (Platform.OS === "web") {
    auth = AuthSDK.initializeAuth(app, { persistence: AuthSDK.browserLocalPersistence });
  } else {
    if (!rnAuth.getReactNativePersistence) throw new Error("Không thể khởi tạo lưu phiên đăng nhập.");
    auth = AuthSDK.initializeAuth(app, { persistence: rnAuth.getReactNativePersistence(AsyncStorage) });
  }
  AuthSDK.connectAuthEmulator(auth, `http://${host}:9099`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, 8080);
  cache.__medicareEmulator = { auth, db };
  return cache.__medicareEmulator;
}

let services: Services | null = null;
let firebaseError: string | null = null;
try {
  services = initialize();
} catch {
  firebaseError = "Chưa thể kết nối Firebase Emulator. Kiểm tra .env và khởi động lại Expo.";
}
export { services, firebaseError };
