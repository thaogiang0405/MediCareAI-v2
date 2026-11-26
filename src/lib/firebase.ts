import {getApps,initializeApp,type FirebaseOptions} from "firebase/app";
const config:FirebaseOptions={apiKey:process.env.EXPO_PUBLIC_FIREBASE_API_KEY,authDomain:process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,projectId:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,storageBucket:process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,messagingSenderId:process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,appId:process.env.EXPO_PUBLIC_FIREBASE_APP_ID};
const required=["apiKey","authDomain","projectId","appId"] as const;
export const firebaseMissingKeys=required.filter(k=>!config[k]);
export const firebaseConfigured=firebaseMissingKeys.length===0;
export const firebaseApp=firebaseConfigured?(getApps()[0]??initializeApp(config)):null;
