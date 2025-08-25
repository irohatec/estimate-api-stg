// firebaseAdmin.js
import admin from "firebase-admin";

const {
  FIREBASE_PROJECT_ID,
  CLIENT_EMAIL,
  PRIVATE_KEY
} = process.env;

// PRIVATE_KEY の \n エスケープ対策
const parsedPrivateKey = (PRIVATE_KEY || "").replace(/\\n/g, "\n");

if (!FIREBASE_PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
  console.warn("[firebaseAdmin] Missing FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY env.");
}

if (!admin.apps.length && FIREBASE_PROJECT_ID && CLIENT_EMAIL && PRIVATE_KEY) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey: parsedPrivateKey
    })
  });
}

export const db = admin.firestore();
export const auth = admin.auth();

/**
 * Verify Firebase ID token from Authorization: Bearer <idToken>
 * Throws on failure.
 */
export async function verifyIdTokenFromRequest(req) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new Error("MISSING_TOKEN");
  const decoded = await auth.verifyIdToken(token);
  return decoded; // { uid, email, ... }
}
