// Konfigurasi per unit bisnis. Setiap unit punya kantong/rekening, kategori income &
// expense, kategori rutin bulanan, dan (khusus Mini Soccer) target break-even sendiri.
//
// Menambah unit bisnis baru cukup menambah satu objek baru di array UNITS — semua
// modul (Transaksi, Laporan, Cek Saldo, Pengaturan) otomatis mengikuti konfigurasi ini.
import { Landmark, Banknote, Wallet } from "lucide-react";

const goldAccent = "#C9A227";
const blueAccent = "#4D7FB0";
const tealAccent = "#3F9E8A";
const orangeAccent = "#D9772E";

export const UNITS = [
  {
    id: "mini-soccer",
    name: "V3BKS Mini Soccer",
    shortName: "Mini Soccer",
    tagline: "Sewa lapangan mini soccer",
    methods: ["Cash", "BCA", "Mandiri", "BNI"],
    methodMeta: {
      Cash: { accent: goldAccent, icon: Banknote },
      BCA: { accent: blueAccent, icon: Landmark },
      Mandiri: { accent: tealAccent, icon: Landmark },
      BNI: { accent: orangeAccent, icon: Landmark },
    },
    incomeCategories: [
      "Rental", "Photographer", "Wasit", "Recording", "New Member",
      "Sewa Rompi", "Fee Samkot", "Event/Turnamen", "Sponsor", "Lainnya",
    ],
    expenseCategories: [
      "Gaji Karyawan", "Cleaning Service", "Fee Photographer", "Listrik", "Air",
      "Solar", "Alat Kebersihan", "Stock Bola", "Maintenance", "Wifi",
      "Telkomsel", "Marketing", "Pajak", "Bonus/Insentif/THR", "Other Expenses", "Lainnya",
    ],
    recurringCategories: ["Gaji Karyawan", "Listrik", "Air", "Wifi", "Telkomsel", "Pajak"],
    rentalCategoryForTax: "Rental",
    hasMembership: false,
    hasPayroll: false,
    hasBooking: true,
    hasInventory: false,
    // Dipakai modul Jadwal & Booking: kelompok resource yang bisa disewa, jam operasional,
    // dan harga per jam (weekday/weekend) per rentang jam. Harga dijumlah per jam yang
    // dicakup booking, jadi booking yang melintasi 2 rentang otomatis dihitung gabungan.
    bookingGroups: [
      {
        id: "lapangan",
        label: "Lapangan",
        resources: ["Lapangan"],
        startHour: 7,
        endHour: 24,
        incomeCategory: "Rental",
        priceBands: [
          { start: 7, end: 16, weekdayRate: 600000, weekendRate: 720000 },
          { start: 16, end: 18, weekdayRate: 800000, weekendRate: 960000 },
          { start: 18, end: 24, weekdayRate: 960000, weekendRate: 1040000 },
        ],
      },
    ],
    breakeven: {
      fixedCost: 58800000,
      variableCostPerHour: 70000,
      targetBreakEven: 65000000,
      targetHealthy: 87000000,
      targetStrong: 97000000,
      totalHoursPerMonth: 493,
      marginWeekdayOffPeak: 530000,
      marginWeekendOffPeak: 650000,
      marginBlended: 566000,
    },
  },
  {
    id: "badminton-padel",
    name: "HSC Badminton & Padel",
    shortName: "Badminton & Padel",
    tagline: "Sewa 5 lapangan badminton + lapangan padel",
    methods: ["Cash", "Mandiri", "AYO"],
    methodMeta: {
      Cash: { accent: goldAccent, icon: Banknote },
      Mandiri: { accent: tealAccent, icon: Landmark },
      AYO: { accent: blueAccent, icon: Wallet },
    },
    incomeCategories: [
      "Rental Badminton", "Shuttlecock", "Grip Badminton", "Kaos Kaki Badminton", "Sewa Raket Badminton",
      "Rental Padel", "Bola Padel", "Grip Padel", "Sewa Raket Padel", "Coaching Padel",
      "Photographer", "Event/Turnamen", "Lainnya",
    ],
    expenseCategories: [
      "Gaji Karyawan", "Gaji Coach Padel", "Alat Kebersihan",
      "Stok Shuttlecock", "Stok Grip", "Stok Raket", "Stok Kaos Kaki", "Stok Bola Padel",
      "Maintenance", "Wifi", "Telkomsel", "Marketing", "Pajak",
      "Fee Photographer", "Event/Turnamen", "Bill Sivila HS",
      "Mobil", "Motor", "Ambal", "Other Expenses - 1", "Other Expenses - 2",
      "Bonus/Insentif/THR", "Lainnya",
    ],
    recurringCategories: ["Gaji Karyawan", "Wifi", "Telkomsel", "Pajak"],
    rentalCategoryForTax: null, // ada 2 kategori rental (Badminton & Padel) — dihitung manual di Laporan
    hasMembership: false,
    hasPayroll: false,
    hasBooking: true,
    bookingGroups: [
      {
        id: "badminton",
        label: "Badminton",
        resources: ["Lap. 1", "Lap. 2", "Lap. 3", "Lap. 4", "Lap. 5"],
        startHour: 7,
        endHour: 24,
        incomeCategory: "Rental Badminton",
        priceBands: [
          { start: 7, end: 16, weekdayRate: 50000, weekendRate: 60000 },
          { start: 16, end: 18, weekdayRate: 75000, weekendRate: 80000 },
          { start: 18, end: 24, weekdayRate: 90000, weekendRate: 100000 },
        ],
      },
      {
        id: "padel",
        label: "Padel",
        resources: ["Padel"],
        startHour: 7,
        endHour: 24,
        incomeCategory: "Rental Padel",
        priceBands: [
          { start: 7, end: 15, weekdayRate: 189000, weekendRate: 189000 },
          { start: 15, end: 18, weekdayRate: 252000, weekendRate: 252000 },
          { start: 18, end: 24, weekdayRate: 279000, weekendRate: 279000 },
        ],
      },
    ],
    hasInventory: true,
    // Dipakai modul Stok Barang: item default yang di-seed pertama kali dibuka (admin
    // bisa tambah/ubah/hapus setelahnya). incomeCategory/expenseCategory dipakai saat
    // stok keluar (terjual) / stok masuk (beli) dicatat sebagai transaksi otomatis.
    inventoryItems: [
      { id: "shuttlecock-hijau", name: "Shuttlecock Ganesha Hijau", unit: "slop", unitPrice: 140000, lowStockThreshold: 5, incomeCategory: "Shuttlecock", expenseCategory: "Stok Shuttlecock" },
      { id: "shuttlecock-hitam", name: "Shuttlecock Ganesha Hitam", unit: "slop", unitPrice: 130000, lowStockThreshold: 5, incomeCategory: "Shuttlecock", expenseCategory: "Stok Shuttlecock" },
      { id: "shuttlecock-harmonika", name: "Shuttlecock Harmonika", unit: "slop", unitPrice: 120000, lowStockThreshold: 5, incomeCategory: "Shuttlecock", expenseCategory: "Stok Shuttlecock" },
      { id: "grip-handuk", name: "Grip Handuk", unit: "pcs", unitPrice: 6000, lowStockThreshold: 10, incomeCategory: "Grip Badminton", expenseCategory: "Stok Grip" },
      { id: "grip-karet", name: "Grip Karet", unit: "pcs", unitPrice: 11000, lowStockThreshold: 10, incomeCategory: "Grip Badminton", expenseCategory: "Stok Grip" },
      { id: "kaos-kaki", name: "Kaos Kaki", unit: "pcs", unitPrice: 45000, lowStockThreshold: 5, incomeCategory: "Kaos Kaki Badminton", expenseCategory: "Stok Kaos Kaki" },
      { id: "raket-badminton", name: "Raket Badminton (sewa)", unit: "pcs", unitPrice: 20000, lowStockThreshold: 3, incomeCategory: "Sewa Raket Badminton", expenseCategory: "Stok Raket" },
      { id: "bola-padel", name: "Bola Padel", unit: "tabung", unitPrice: 85000, lowStockThreshold: 3, incomeCategory: "Bola Padel", expenseCategory: "Stok Bola Padel" },
      { id: "grip-padel", name: "Grip Padel", unit: "pcs", unitPrice: 45000, lowStockThreshold: 5, incomeCategory: "Grip Padel", expenseCategory: "Stok Grip" },
    ],
    breakeven: null,
  },
  {
    id: "sports-studio",
    name: "HSC Sports Studio",
    shortName: "Sports Studio",
    tagline: "Hyrox Training Club · Calisthenic · Boxing · Strength & Conditioning",
    methods: ["Cash", "Mandiri"],
    methodMeta: {
      Cash: { accent: goldAccent, icon: Banknote },
      Mandiri: { accent: tealAccent, icon: Landmark },
    },
    incomeCategories: [
      "Visit Calisthenic", "Visit Strength & Conditioning", "Visit Boxing", "Visit Muay Thai",
      "Visit Hyrox", "Visit Barre Intensity", "Visit Booty & Core",
      "Membership Calisthenic", "Membership Strength & Conditioning", "Membership Boxing",
      "Membership Muay Thai", "Membership Hyrox", "Membership Barre Intensity", "Membership Mix Class",
      "Private Class", "Photographer", "Event", "Sponsor", "Lainnya",
    ],
    expenseCategories: [
      "Gaji Karyawan & Coach", "Alat Kebersihan", "Maintenance", "Wifi", "Sewa",
      "Reguler Hyrox & Private FG", "Other Expenses - 1", "Other Expenses - 2",
      "Marketing", "Event", "Pajak", "Dividend Investor Hyrox",
      "Bonus/Insentif/THR/Kasbon", "Lainnya",
    ],
    recurringCategories: ["Gaji Karyawan & Coach", "Sewa", "Pajak"],
    rentalCategoryForTax: null,
    breakeven: null,
    hasMembership: true,
    hasPayroll: true,
    hasBooking: false,
    hasInventory: false,
    // Dipakai modul Membership: jenis kelas yang dijual sebagai paket membership.
    membershipClasses: [
      "Calisthenic", "Strength & Conditioning", "Boxing", "Muay Thai",
      "Hyrox", "Barre Intensity", "Mix Class",
    ],
    // Dipakai modul Payroll: persentase komisi coach per jenis kelas (dari revenue kelas).
    // Kelas dengan komisi 0 (Muay Thai, Hyrox, Booty & Core) memakai skema fee flat lewat
    // kategori expense "Reguler Hyrox & Private FG", bukan persentase — tetap dicatat
    // di sini sebagai referensi, admin bisa sesuaikan manual di attendance kalau perlu.
    classCommissionRates: {
      "Calisthenic": 40,
      "Strength & Conditioning": 30,
      "Boxing": 30,
      "Muay Thai": 0,
      "Hyrox": 0,
      "Barre Intensity": 60,
      "Booty & Core": 0,
      "Mix Class": 40,
    },
  },
];

export function getUnit(unitId) {
  return UNITS.find((u) => u.id === unitId) || UNITS[0];
}
