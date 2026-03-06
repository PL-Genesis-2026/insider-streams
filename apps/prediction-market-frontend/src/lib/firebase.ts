import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCsZN7lIBag5HLLo1IGbW-OHy1Lh98f_a8",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "chainlink-cre-d6748.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "chainlink-cre-d6748",
};

for (const key in firebaseConfig) {
    if (!firebaseConfig[key as keyof typeof firebaseConfig]) {
        throw new Error(`Missing Firebase config value for ${key}`);
    }
}
// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApps()[0];
}

const db = getFirestore(app);

export { db };
