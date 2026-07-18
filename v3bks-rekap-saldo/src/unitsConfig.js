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
  },
];

export function getUnit(unitId) {
  return UNITS.find((u) => u.id === unitId) || UNITS[0];
}
