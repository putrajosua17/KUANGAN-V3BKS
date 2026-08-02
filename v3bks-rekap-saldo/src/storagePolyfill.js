// Polyfill ini menggantikan window.storage yang aslinya hanya tersedia di dalam
// Claude.ai. Data "shared" (shared=true) disimpan di Firebase Realtime Database
// supaya bisa diakses & diubah bersama oleh siapa pun yang punya akses (lihat aturan
// keamanan di database.rules.json). Data "personal" (shared=false) disimpan di
// localStorage browser masing-masing orang (tidak terbagi ke orang lain).

import { app } from "./firebase.js";
import { getDatabase, ref, get as dbGet, set as dbSet, remove as dbRemove } from "firebase/database";
import { withTimeout } from "./withTimeout.js";

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
    const snapshot = await withTimeout(dbGet(ref(db, sanitizeKey(key))));
    if (!snapshot.exists()) throw new Error("key not found");
    return { key, value: snapshot.val(), shared };
  },

  async set(key, value, shared = false) {
    if (!shared) {
      localStorage.setItem(key, value);
      return { key, value, shared };
    }
    await withTimeout(dbSet(ref(db, sanitizeKey(key)), value));
    return { key, value, shared };
  },

  async delete(key, shared = false) {
    if (!shared) {
      localStorage.removeItem(key);
      return { key, deleted: true, shared };
    }
    await withTimeout(dbRemove(ref(db, sanitizeKey(key))));
    return { key, deleted: true, shared };
  },

  async list() {
    // Tidak dipakai oleh aplikasi ini, disediakan agar sesuai bentuk API aslinya.
    return { keys: [] };
  },
};
