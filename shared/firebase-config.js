import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app-check.js";

const firebaseConfig = {
    apiKey: "AIzaSyBx4Goq8VR1I2MFf9L2wJm2TBaV-l_cCps",
    authDomain: "monthly-cup.firebaseapp.com",
    projectId: "monthly-cup",
    storageBucket: "monthly-cup.firebasestorage.app",
    messagingSenderId: "82527508810",
    appId: "1:82527508810:web:ca14ebfdeffb24d09889b3"
};

export const app = initializeApp(firebaseConfig);
initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6Lfc8Y0sAAAAAGozYyv9rRjgG6XUPffi-PsjYIGR'),
    isTokenAutoRefreshEnabled: true
});
export const db = getFirestore(app);
export const auth = getAuth(app);

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const getPoints = position => position > 0 ? (POINTS[position - 1] ?? 1) : 0;
export const pName = p => p?.pseudoTM || p?.pseudo || p?.name || '?';
