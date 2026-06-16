# V3BKS - Rekap Saldo Real

Website rekap saldo real untuk V3BKS Mini Soccer & Cafe. Dibuat dengan React + Vite,
dengan data tersimpan online via Firebase Realtime Database supaya bisa diakses dan
diubah bersama oleh siapa pun yang punya link.

## Yang perlu disiapkan sebelum website ini bisa dipakai

1. **Akun Firebase (gratis)** — untuk menyimpan data transaksi secara online.
   Lihat bagian "Setup Firebase" di bawah.
2. **Akun GitHub** — untuk menyimpan kode ini.
3. **Akun Vercel** — untuk membuat website ini bisa diakses lewat link publik.

## Setup Firebase

1. Buka https://console.firebase.google.com dan login dengan akun Google.
2. Klik **Add project**, beri nama (misal `v3bks-rekap-saldo`), lanjutkan sampai selesai.
3. Di sidebar kiri, klik **Build > Realtime Database**, klik **Create Database**.
4. Pilih lokasi server (misal Singapore/asia-southeast1), lalu pilih mode **Start in test mode**
   (supaya bisa dibaca & ditulis tanpa login dulu).
5. Setelah database dibuat, klik ikon gear (⚙️) di sidebar kiri atas > **Project settings**.
6. Scroll ke bagian **Your apps**, klik ikon `</>` (Web), beri nama aplikasi, klik **Register app**.
7. Firebase akan menampilkan kode `firebaseConfig` — copy nilai-nilai di dalamnya.
8. Buka file `src/storagePolyfill.js` di project ini, ganti bagian `firebaseConfig` dengan nilai
   yang kamu dapat dari Firebase.

### Tentang keamanan data

Saat memilih "test mode", siapa pun yang tahu alamat database kamu bisa membaca/menulis data.
Ini sengaja dipilih supaya partner kamu bisa ikut input data tanpa perlu login. Jaga link website
ini agar tidak disebar ke orang yang tidak seharusnya punya akses.

## Menjalankan di komputer sendiri (opsional)

```
npm install
npm run dev
```

## Build untuk production

```
npm run build
```

Hasil build ada di folder `dist/`.

## Deploy ke Vercel

1. Push project ini ke GitHub.
2. Buka https://vercel.com, login dengan akun GitHub.
3. Klik **Add New > Project**, pilih repository ini.
4. Vercel otomatis mendeteksi ini project Vite — klik **Deploy**.
5. Setelah selesai, Vercel memberikan link publik untuk website ini.
