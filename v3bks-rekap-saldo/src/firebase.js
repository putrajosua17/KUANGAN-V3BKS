// Satu instance Firebase App yang dipakai bersama oleh storagePolyfill.js (Realtime
// Database untuk data transaksi) dan auth.js (Firebase Authentication untuk login).
//
// GANTI nilai-nilai di bawah ini dengan konfigurasi project Firebase kamu sendiri kalau
// membuat project baru. Cara mendapatkannya dijelaskan di README.md.
import { initializeApp } from "firebase/app";

export const firebaseConfig = {
  apiKey: "AIzaSyC7kR5HqDwYVM4oNcVwFPWraVn4_ejRKlo",
  authDomain: "keuangan-v3bks.firebaseapp.com",
  databaseURL: "https://keuangan-v3bks-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "keuangan-v3bks",
  storageBucket: "keuangan-v3bks.firebasestorage.app",
  messagingSenderId: "123840405637",
  appId: "1:123840405637:web:a3cc6859bbb87b31a909ec",
};

export const app = initializeApp(firebaseConfig);
