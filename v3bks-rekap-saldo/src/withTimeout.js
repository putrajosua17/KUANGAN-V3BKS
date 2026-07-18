// Firebase Realtime Database bisa "menggantung" tanpa resolve maupun reject kalau
// koneksi ke server tidak pernah berhasil dibuat (mis. internet mati total, firewall
// memblokir domain Firebase). Tanpa batas waktu, layar loading bisa macet selamanya.
// Util ini membungkus sebuah Promise supaya otomatis gagal (reject) setelah `ms`
// milidetik kalau belum juga selesai.
export function withTimeout(promise, ms = 10000, message = "Waktu tunggu habis. Periksa koneksi internet Anda.") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
