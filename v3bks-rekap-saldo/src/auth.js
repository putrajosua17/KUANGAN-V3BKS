// Semua logika login & manajemen pengguna (Firebase Authentication + profil role
// di Realtime Database). Ada 3 role:
//   - "admin"   → akses penuh ke semua unit bisnis + bisa kelola pengguna lain
//   - "finance" → akses baca/tulis hanya ke unit yang ada di daftar `units`
//   - "coach"   → akses lihat-saja (read-only) ke unit yang ada di daftar `units`
//
// Profil pengguna disimpan di Realtime Database pada path `users/{uid}`:
//   { name, email, role, units: { "mini-soccer": true, ... } atau { "*": true } untuk admin, createdAt }
//
// PENTING: pengecekan role di sini hanya untuk kenyamanan tampilan (UI). Supaya
// benar-benar aman, terapkan aturan di database.rules.json lewat Firebase Console.
// Lihat README.md bagian "Setup Keamanan (Auth + Rules)".

import { app } from "./firebase.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";
import { getDatabase, ref, get, set, update, remove } from "firebase/database";
import { withTimeout } from "./withTimeout.js";

export const auth = getAuth(app);
const db = getDatabase(app);

export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function login(email, password) {
  await withTimeout(signInWithEmailAndPassword(auth, email.trim(), password));
}

export async function logout() {
  await signOut(auth);
}

export async function getUserProfile(uid) {
  const snap = await withTimeout(get(ref(db, `users/${uid}`)));
  return snap.exists() ? snap.val() : null;
}

// Dicek lewat flag terpisah (bukan membaca isi node "users" secara langsung) supaya
// pengecekan ini bisa diizinkan untuk pengunjung yang BELUM login lewat security rules
// (lihat database.rules.json), tanpa membocorkan daftar email pengguna ke publik.
export async function anyUsersExist() {
  const snap = await withTimeout(get(ref(db, "system/bootstrapped")));
  return snap.exists() && snap.val() === true;
}

export async function listUsers() {
  const snap = await withTimeout(get(ref(db, "users")));
  if (!snap.exists()) return [];
  const val = snap.val();
  return Object.entries(val).map(([uid, u]) => ({ uid, ...u }));
}

// Dipakai sekali saja, saat belum ada pengguna sama sekali di sistem (setup awal).
export async function createFirstAdmin({ email, password, name }) {
  const cred = await withTimeout(createUserWithEmailAndPassword(auth, email.trim(), password));
  await withTimeout(set(ref(db, `users/${cred.user.uid}`), {
    name: name.trim(),
    email: email.trim(),
    role: "admin",
    units: { "*": true },
    createdAt: Date.now(),
  }));
  await withTimeout(set(ref(db, "system/bootstrapped"), true));
  return cred.user;
}

// Admin membuat akun baru (finance/coach/admin lain) tanpa kehilangan sesi login-nya
// sendiri. Trik-nya: bikin Firebase App kedua khusus untuk operasi createUser, karena
// createUserWithEmailAndPassword otomatis login sebagai user baru itu di app instance
// yang dipakai.
export async function createUserAsAdmin({ email, password, name, role, units }) {
  const secondaryApp = initializeApp(app.options, "secondary-" + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await withTimeout(createUserWithEmailAndPassword(secondaryAuth, email.trim(), password));
    await withTimeout(set(ref(db, `users/${cred.user.uid}`), {
      name: name.trim(),
      email: email.trim(),
      role,
      units,
      createdAt: Date.now(),
    }));
    await signOut(secondaryAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
}

export async function updateUserProfile(uid, patch) {
  await withTimeout(update(ref(db, `users/${uid}`), patch));
}

// Catatan: ini hanya menghapus profil (role) di Realtime Database. Akun login
// Firebase Authentication-nya sendiri harus dihapus manual lewat Firebase Console
// (Authentication > Users) karena client SDK tidak boleh menghapus akun orang lain.
export async function deleteUserProfile(uid) {
  await withTimeout(remove(ref(db, `users/${uid}`)));
}

export function mapAuthError(err) {
  const code = err?.code || "";
  if (code.includes("wrong-password") || code.includes("invalid-credential") || code.includes("invalid-login-credentials")) {
    return "Email atau password salah.";
  }
  if (code.includes("user-not-found")) return "Akun dengan email ini tidak ditemukan.";
  if (code.includes("email-already-in-use")) return "Email ini sudah terdaftar.";
  if (code.includes("weak-password")) return "Password minimal 6 karakter.";
  if (code.includes("invalid-email")) return "Format email tidak valid.";
  if (code.includes("too-many-requests")) return "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.";
  if (code.includes("network-request-failed")) return "Gagal terhubung. Periksa koneksi internet.";
  return err?.message || "Terjadi kesalahan. Coba lagi.";
}
