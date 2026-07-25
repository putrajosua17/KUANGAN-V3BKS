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

## Modul Membership & Payroll Coach (HSC Sports Studio)

Khusus unit **HSC Sports Studio**, ada 2 tab tambahan di bottom navigation:

- **Member** — daftar member paket (Calisthenic, Hyrox, Boxing, dst.), melacak sisa sesi
  & masa berlaku, dengan peringatan otomatis untuk member yang akan/sudah expired.
  Pendaftaran & perpanjangan member bisa langsung dicatat sebagai transaksi income di
  modul Keuangan (centang "Catat sebagai transaksi income" di form).
- **Payroll** — rekap kehadiran per coach per kelas, komisi dihitung otomatis sesuai
  tarif per jenis kelas (diatur di `classCommissionRates` pada `src/unitsConfig.js`),
  ditambah kasbon/bonus, sampai ke ringkasan payout siap transfer per bulan.

Kedua modul ini bisa diaktifkan/nonaktifkan per unit lewat flag `hasMembership` dan
`hasPayroll` di `src/unitsConfig.js`.

## Modul Jadwal & Booking (Mini Soccer, Badminton & Padel)

Menggantikan grid Excel manual (Putih=Kosong, Kuning=Booked/DP, Biru=Lunas,
Merah=Maintenance). Muncul sebagai tab **Jadwal** untuk unit yang punya lapangan/court:

- Kalender per jam (07.00–24.00) per lapangan/court, klik sel kosong untuk booking baru,
  klik sel terisi untuk lihat/edit/hapus.
- Harga disarankan otomatis dari `priceBands` di `src/unitsConfig.js` (beda tarif
  weekday/weekend, dijumlah per jam kalau booking melintasi 2 rentang harga) — admin
  tetap bisa mengubah nominal sebelum simpan.
- Cek bentrok otomatis: tidak bisa booking di lapangan & jam yang sudah terisi.
- Bisa langsung mencatat pembayaran sebagai transaksi income di modul Keuangan (sama
  seperti modul Membership).
- Unit dengan lebih dari 1 kelompok resource (mis. HSC Badminton & Padel) menampilkan
  tab pemilih kelompok (`bookingGroups` di `src/unitsConfig.js`) di atas kalender.

Modul ini diaktifkan lewat flag `hasBooking` + konfigurasi `bookingGroups` per unit.

## Modul Stok Barang (HSC Badminton & Padel)

Menggantikan pencatatan stok manual (shuttlecock, grip, raket, bola padel, dst.). Muncul
sebagai tab **Stok** untuk unit yang punya barang jual/sewa:

- Daftar item stok (nama, satuan, harga satuan, batas stok menipis) — bisa
  tambah/ubah/hapus item lewat menu Admin. Item default per unit diatur di
  `inventoryItems` pada `src/unitsConfig.js`, otomatis di-seed saat pertama kali dibuka.
- Saldo stok dihitung otomatis dari riwayat mutasi (stok masuk − stok keluar), tidak perlu
  hitung manual.
- Peringatan otomatis untuk item yang stoknya sudah di/bawah batas menipis.
- Stok masuk (beli/restock) bisa langsung dicatat sebagai transaksi expense, dan stok
  keluar (terjual/dipakai) bisa langsung dicatat sebagai transaksi income di modul
  Keuangan (centang opsi pencatatan di form mutasi) — nominal otomatis terisi dari
  kuantitas × harga satuan, tetap bisa diubah manual sebelum simpan.

Modul ini diaktifkan lewat flag `hasInventory` + konfigurasi `inventoryItems` per unit.

## Modul Kasir (POS) — semua unit

Input transaksi bergaya aplikasi kasir: tap tombol menu → keranjang → bayar. Muncul
sebagai tab **Kasir** (khusus Admin/Finance) di semua unit:

- **Menu bebas dikustom** lewat tombol "Atur Menu": tambah/ubah/hapus grup & item,
  harga, kategori income, warna tombol, aktif/nonaktif. Menu awal di-seed otomatis dari
  konfigurasi unit (lapangan dari `bookingGroups`, add-ons dari `inventoryItems`, jasa
  dari kategori income) — item berharga 0 akan menanyakan harga saat di-tap.
- **Item lapangan (per jam)**: kasir menanyakan tanggal, lapangan, jam, durasi — harga
  otomatis dari price band (weekday/weekend), **cek bentrok** terhadap kalender Jadwal,
  dan slot jadwal ikut terisi otomatis saat bayar. Satu input, dua hasil.
- **Item tertaut Stok**: stok otomatis terpotong saat terjual (tombol menu juga
  menampilkan sisa stok).
- **Checkout**: kantong pembayaran, status Lunas/DP, nama pelanggan, **diskon per
  struk** (Rp atau %) — diskon dialokasikan proporsional per item supaya laporan per
  kategori tetap sama persis dengan uang yang diterima.
- **Struk digital**: tersimpan di riwayat, bisa dibuka ulang, dan ada tombol
  **"Salin untuk WhatsApp"** untuk dikirim ke pelanggan.
- Setiap item struk tercatat sebagai transaksi income dengan kategori masing-masing
  (diikat satu nomor struk), jadi Dashboard, Laporan, pajak, export, dan backup ikut
  otomatis tanpa perubahan apa pun.

Modul ini diaktifkan lewat flag `hasPos` per unit di `src/unitsConfig.js`.

## Fase 5: Laporan Pajak, Backup Data & Keamanan Login

- **Laporan Pajak Siap Lapor** — tombol Export ke Excel (ikon unduh di header) sekarang
  menyertakan sheet tambahan **"Pajak Siap Lapor {tahun}"**: rekap omzet, estimasi PPh
  Final 0,5% (PP 23/2018), income kategori Rental, dan estimasi Pajak Daerah 10% per
  bulan untuk tahun yang sedang dipilih di tab Laporan — tinggal unduh dan kirim ke
  konsultan pajak / dipakai untuk lapor sendiri. Ini tetap estimasi, bukan nasihat pajak
  resmi.
- **Cadangkan Data** — ikon cadangan (di sebelah ikon Export, khusus Admin/Finance)
  mengunduh seluruh data unit yang sedang dibuka (transaksi, saldo awal, rekonsiliasi,
  target bulanan, template, plus data Membership/Payroll/Booking/Stok kalau modulnya
  aktif) sebagai satu file JSON kapan saja — berguna untuk arsip pribadi atau pemulihan
  data manual. Catatan: ini backup **manual (on-demand)**, bukan backup terjadwal
  otomatis — backup terjadwal butuh Firebase Cloud Functions + paket berbayar (Blaze)
  yang di luar cakupan saat ini.
- **Lupa Password** — link "Lupa password?" di halaman login mengirim email reset
  password lewat Firebase Authentication (fitur bawaan, otomatis aktif begitu provider
  Email/Password diaktifkan di langkah "Setup Firebase" di atas).
- **Login terakhir** — menu Kelola Pengguna (Admin) sekarang menampilkan waktu login
  terakhir tiap pengguna, sebagai jejak audit sederhana siapa yang masih aktif memakai
  aplikasi.

**Belum dikerjakan** (butuh keputusan/akun pihak ketiga dari pemilik bisnis): notifikasi
WhatsApp otomatis (butuh akun WhatsApp Business API seperti Fonnte/Twilio/WA Cloud API
resmi beserta API key-nya) dan backup terjadwal otomatis (butuh Firebase Cloud Functions
di paket berbayar Blaze).

## Peningkatan keandalan & jejak audit

- **Aman input bersamaan (read-merge-write)** — setiap penyimpanan keuangan membaca dulu
  data terbaru dari server, menempelkan perubahan, baru menyimpan. Jadi kalau dua orang
  menambah/mengubah transaksi berbeda hampir bersamaan, tidak ada yang tertimpa/hilang.
- **Riwayat Aktivitas (jejak audit)** — menu ⋮ (khusus Admin) → "Riwayat Aktivitas"
  menampilkan siapa menambah/mengubah/menghapus transaksi, pelunasan, pengaturan, dst.,
  lengkap dengan waktu & pelakunya (500 aktivitas terakhir per unit, tersimpan di
  `v3bks_audit__{unit}`). **Perlu publish ulang `database.rules.json`** (ada 3 key baru
  `v3bks_audit__*`) supaya jejak audit bisa tersimpan.
