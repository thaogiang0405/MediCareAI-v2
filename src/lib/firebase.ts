import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
import * as AuthSDK from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import type { Auth, Persistence } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { Platform } from "react-native";

type Services = { auth: Auth; db: Firestore };
type Mode = "emulator" | "staging";
type ServiceCache = Partial<Record<Mode, Services>>;
const cache = globalThis as typeof globalThis & { __medicareFirebaseServices?: ServiceCache };

const mode = process.env.EXPO_PUBLIC_FIREBASE_MODE as Mode | undefined;
const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST?.trim() ?? "";
const EXPECTED_STAGING_PROJECT_ID = "medicare-ai-cf804";

const localHost = /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(host);

function createAuth(app: ReturnType<typeof initializeApp>): Auth {
  // Metro resolves firebase/auth's React Native entry on iOS/Android.
  // The browser type declaration may not expose this RN-only helper.
  const rnAuth = AuthSDK as typeof AuthSDK & {
    getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
  };
  if (Platform.OS === "web") {
    return AuthSDK.initializeAuth(app, { persistence: AuthSDK.browserLocalPersistence });
  }
  if (!rnAuth.getReactNativePersistence) {
    throw new Error("Firebase Auth React Native persistence is unavailable.");
  }
  return AuthSDK.initializeAuth(app, {
    persistence: rnAuth.getReactNativePersistence(AsyncStorage),
  });
}

function initialize(): Services {
  if (mode !== "emulator" && mode !== "staging") {
    throw new Error("Firebase mode must be explicitly set to emulator or staging.");
  }

  cache.__medicareFirebaseServices ??= {};
  const existing = cache.__medicareFirebaseServices[mode];
  if (existing) return existing;

  let appName: string;
  let config: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    storageBucket?: string;
    messagingSenderId?: string;
  };

  if (mode === "emulator") {
    if (!localHost) {
      throw new Error("A valid private LAN IPv4 address is required for Firebase Emulator.");
    }
    appName = "medicare-emulator";
    config = {
      apiKey: "demo-api-key",
      authDomain: "demo-medicare-ai.firebaseapp.com",
      projectId: "demo-medicare-ai",
      appId: "1:123:web:demo",
    };
  } else {
    const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
    const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() ?? "";
    const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? "";
    const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim() ?? "";
    if (projectId !== EXPECTED_STAGING_PROJECT_ID || !apiKey || !authDomain || !appId) {
      throw new Error("Firebase staging configuration is incomplete or project ID does not match the approved project.");
    }
    appName = "medicare-staging";
    config = {
      apiKey,
      authDomain,
      projectId,
      appId,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
    };
  }

  const app = getApps().find(item => item.name === appName) ?? initializeApp(config, appName);
  const auth = createAuth(app);
  const db = getFirestore(app);

  if (mode === "emulator") {
    AuthSDK.connectAuthEmulator(auth, `http://${host}:9099`);
    connectFirestoreEmulator(db, host, 8080);
  }

  const services = { auth, db };
  cache.__medicareFirebaseServices[mode] = services;
  return services;
}

let services: Services | null = null;
let firebaseError: string | null = null;
try {
  services = initialize();
} catch {
  firebaseError = "Chưa thể khởi tạo Firebase. Kiểm tra mode, cấu hình .env và khởi động lại Expo.";
}
export { services, firebaseError };
