import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyBx4Goq8VR1I2MFf9L2wJm2TBaV-l_cCps",
    authDomain: "monthly-cup.firebaseapp.com",
    projectId: "monthly-cup",
    storageBucket: "monthly-cup.firebasestorage.app",
    messagingSenderId: "82527508810",
    appId: "1:82527508810:web:ca14ebfdeffb24d09889b3"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const getPoints = position => position > 0 ? (POINTS[position - 1] ?? 1) : 0;
export const pName = p => p?.pseudoTM || p?.pseudo || p?.name || '?';
