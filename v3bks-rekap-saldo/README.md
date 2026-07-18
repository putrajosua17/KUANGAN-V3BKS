# V3BKS - Platform Admin & Finance

Platform admin & finance terpadu untuk **3 unit bisnis**: V3BKS Mini Soccer, HSC
Badminton & Padel, dan HSC Sports Studio (Hyrox Training Club). Dibuat dengan React +
Vite, data tersimpan online via Firebase Realtime Database, dan login berbasis akun
dengan 3 role (Admin, Finance, Coach) supaya tiap orang hanya bisa mengakses apa yang
memang jadi tugasnya.

> Aplikasi ini adalah pengembangan dari versi sebelumnya ("V3BKS Rekap Saldo Real")
> yang hanya menangani Mini Soccer. Data lama otomatis dipindahkan (sekali, otomatis)
> ke struktur baru saat pertama kali dibuka — tidak ada yang hilang.

## Yang perlu disiapkan sebelum website ini bisa dipakai

1. **Akun Firebase (gratis)** — untuk menyimpan data & login. Lihat "Setup Firebase" di bawah.
2. **Akun GitHub** — untuk menyimpan kode ini.
3. **Akun Vercel** — untuk membuat website ini bisa diakses lewat link publik.

## Setup Firebase

### 1. Buat project & Realtime Database (lewati kalau sudah pernah dibuat sebelumnya)

1. Buka https://console.firebase.google.com dan login dengan akun Google.
2. Klik **Add project**, beri nama (misal `v3bks-rekap-saldo`), lanjutkan sampai selesai.
3. Di sidebar kiri, klik **Build > Realtime Database**, klik **Create Database**.
4. Pilih lokasi server (misal Singapore/asia-southeast1), mode apapun boleh — nanti akan
   ditimpa oleh aturan keamanan di langkah bawah.
5. Klik ikon gear (⚙️) di sidebar kiri atas > **Project settings**.
6. Scroll ke **Your apps**, klik ikon `</>` (Web), beri nama aplikasi, klik **Register app**.
7. Firebase menampilkan kode `firebaseConfig` — copy nilai-nilai di dalamnya.
8. Buka file `src/firebase.js` di project ini, ganti bagian `firebaseConfig` dengan nilai
   yang kamu dapat dari Firebase.

### 2. Aktifkan Login (Firebase Authentication)

1. Di sidebar kiri Firebase Console, klik **Build > Authentication**, klik **Get started**.
2. Di tab **Sign-in method**, aktifkan provider **Email/Password**.

### 3. Pasang aturan keamanan (Security Rules)

Tanpa langkah ini, siapa pun yang tahu alamat database bisa membaca/menulis semua data
(termasuk saldo bank dan gaji), walaupun tampilan aplikasi sudah membatasi lewat login.

1. Di sidebar kiri, buka **Build > Realtime Database > Rules**.
2. Copy seluruh isi file `database.rules.json` dari project ini, tempel menggantikan isi
   yang ada di editor Firebase Console.
3. Klik **Publish**.

Aturan ini memastikan: hanya pengguna yang login yang bisa membaca/menulis data, Admin
bisa akses semua unit, Finance hanya bisa akses unit yang diberi izin, dan Coach hanya
bisa membaca (tidak bisa mengubah data).

### 4. Buat akun Admin pertama

1. Jalankan aplikasi (`npm run dev` di komputer sendiri, atau buka link Vercel setelah
   deploy — lihat bagian di bawah).
2. Karena belum ada akun sama sekali, aplikasi otomatis menampilkan form **"Buat Akun
   Admin"**. Isi nama, email, dan password (minimal 6 karakter), lalu submit.
3. Akun ini otomatis jadi **Admin** dengan akses penuh ke semua unit, dan bisa
   menambahkan akun lain (Finance/Coach) lewat ikon **Kelola Pengguna** (ikon orang) di
   pojok kanan atas setelah login.

Setelah akun Admin pertama dibuat, form "Buat Akun Admin" tidak akan muncul lagi untuk
siapa pun — akun baru selanjutnya hanya bisa dibuat oleh Admin lewat menu Kelola Pengguna.

### Tentang role

| Role | Akses |
|---|---|
| **Admin** | Semua unit bisnis, semua fitur, bisa kelola pengguna lain |
| **Finance** | Hanya unit yang dipilihkan Admin, bisa tambah/edit/hapus transaksi di unit itu |
| **Coach** | Hanya unit yang dipilihkan Admin, hanya bisa melihat (tidak bisa mengubah data) |

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

## Struktur unit bisnis

Konfigurasi tiap unit (kantong/rekening, kategori income & expense, target break-even)
ada di `src/unitsConfig.js`. Untuk menambah unit bisnis baru di masa depan, tambahkan
satu objek baru di array `UNITS` pada file itu, lalu tambahkan juga aturan keamanan yang
sesuai di `database.rules.json` (ikuti pola yang sudah ada untuk unit lain).
