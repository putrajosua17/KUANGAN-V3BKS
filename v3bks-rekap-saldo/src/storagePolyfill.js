// Polyfill ini menggantikan window.storage yang aslinya hanya tersedia di dalam
// Claude.ai. Data "shared" (shared=true) disimpan di Firebase Realtime Database
// supaya bisa diakses & diubah bersama oleh siapa pun yang punya link website ini.
// Data "personal" (shared=false) disimpan di localStorage browser masing-masing
// orang (tidak terbagi ke orang lain).

import { initializeApp } from "firebase/app";
import { getDatabase, ref, get as dbGet, set as dbSet, remove as dbRemove } from "firebase/database";

// GANTI nilai-nilai di bawah ini dengan konfigurasi project Firebase kamu sendiri.
// Cara mendapatkannya dijelaskan di README.md.
const firebaseConfig = {
  apiKey: "GANTI_DENGAN_API_KEY",
  authDomain: "GANTI.firebaseapp.com",
  databaseURL: "https://GANTI-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "GANTI",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function sanitizeKey(key) {
  // Firebase Realtime Database tidak boleh punya key dengan karakter . # $ [ ] /
  return key.replace(/[.#$/[\]]/g, "_");
}

window.storage = {
  async get(key, shared = false) {
    if (!shared) {
      const value = localStorage.getItem(key);
      if (value === null) throw new Error("key not found");
      return { key, value, shared };
    }
    const snapshot = await dbGet(ref(db, sanitizeKey(key)));
    if (!snapshot.exists()) throw new Error("key not found");
    return { key, value: snapshot.val(), shared };
  },

  async set(key, value, shared = false) {
    if (!shared) {
      localStorage.setItem(key, value);
      return { key, value, shared };
    }
    await dbSet(ref(db, sanitizeKey(key)), value);
    return { key, value, shared };
  },

  async delete(key, shared = false) {
    if (!shared) {
      localStorage.removeItem(key);
      return { key, deleted: true, shared };
    }
    await dbRemove(ref(db, sanitizeKey(key)));
    return { key, deleted: true, shared };
  },

  async list() {
    // Tidak dipakai oleh aplikasi ini, disediakan agar sesuai bentuk API aslinya.
    return { keys: [] };
  },
};
