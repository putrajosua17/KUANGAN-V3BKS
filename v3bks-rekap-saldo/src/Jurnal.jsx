// Modul Pembukuan — lapisan jurnal berpasangan (double-entry) di belakang aplikasi.
// Sesuai PRD "Sistem Jurnal Akuntansi Berpasangan V3BKS": bagan akun, jurnal umum dengan
// validasi debit=kredit, buku besar kas/bank per kantong, DP diperlakukan sebagai
// liabilitas (Pendapatan Diterima di Muka), PBJT dipisah dari pendapatan, saldo awal,
// neraca saldo, laba rugi, dan dashboard kewajiban.
//
// Modul ini TIDAK mengganti tab lama (Transaksi/Kasir/Jadwal) — itu tetap jadi antarmuka
// input cepat. Pembukuan adalah catatan akuntansi resmi di sebelahnya. Data disimpan
// terpisah di key v3bks_journal__{unit}, jadi tidak mengganggu data operasional.
//
// Asumsi PBJT (Q1 PRD) dibuat sebagai SETELAN yang bisa diubah, bukan angka mati:
// - "Harga sudah termasuk PBJT" -> PBJT = nilai x tarif/(100+tarif)
// - "Harga belum termasuk PBJT" -> PBJT = nilai x tarif/100
// Tarif (10% / 5%) juga satu setelan. Jadi kalau Bapenda menjawab beda, cukup ubah di sini.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus, X, Loader2, Trash2, Pencil, Settings2, AlertTriangle, CheckCircle2,
  BookOpen, ListChecks, Wallet, Scale, TrendingUp, ShieldAlert, FileText,
  ChevronDown, ChevronUp, Save, Filter,
} from "lucide-react";
import { journalKeyFor } from "./storageKeys.js";

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function formatRupiah(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  return sign + "Rp" + Math.round(Math.abs(num)).toLocaleString("id-ID");
}
function monthOf(iso) { return (iso || "").slice(0, 7); }
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
function monthLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m) - 1] || m} ${y}`;
}

const GROUPS = ["Aset", "Liabilitas", "Ekuitas", "Pendapatan", "Beban"];
const GROUP_TONE = {
  Aset: "#4D7FB0", Liabilitas: "#D1574A", Ekuitas: "#8A63B3", Pendapatan: "#3F9E8A", Beban: "#D9772E",
};
// Sisi normal tiap kelompok (di mana saldo positif berada).
const NORMAL_DEBIT = { Aset: true, Beban: true, Liabilitas: false, Ekuitas: false, Pendapatan: false };

// Kode akun sistem yang dirujuk rumus — jangan diubah kodenya.
const A = {
  KAS: "1-100",
  KAS_KECIL: "1-190",
  PIUTANG_USAHA: "1-200",
  PIUTANG_KARYAWAN: "1-210",
  DP_MUKA: "2-100",
  UTANG_FG: "2-110",
  UTANG_WASIT: "2-120",
  PBJT: "2-200",
  UTANG_PPH: "2-210",
  UTANG_REIMBURSE: "2-220",
  UTANG_GAJI: "2-230",
  EKUITAS: "3-100",
};

// ---- Bagan Akun awal, di-seed dari konfigurasi unit ----
export function buildDefaultAccounts(unitConfig) {
  const accounts = [];
  const push = (code, name, group, extra = {}) => accounts.push({ code, name, group, system: true, ...extra });

  // Aset — Kas + satu akun bank per metode pembayaran non-tunai
  push(A.KAS, "Kas", "Aset", { kantong: "Cash" });
  const banks = (unitConfig.methods || []).filter((m) => m !== "Cash");
  banks.forEach((m, i) => push(`1-10${i + 1}`, `Bank ${m}`, "Aset", { kantong: m }));
  push(A.KAS_KECIL, "Kas Kecil", "Aset");
  push(A.PIUTANG_USAHA, "Piutang Usaha", "Aset");
  push(A.PIUTANG_KARYAWAN, "Piutang Karyawan", "Aset");

  // Liabilitas
  push(A.DP_MUKA, "Pendapatan Diterima di Muka", "Liabilitas");
  push(A.UTANG_FG, "Utang Fee Photographer", "Liabilitas");
  push(A.UTANG_WASIT, "Utang Fee Wasit", "Liabilitas");
  push(A.PBJT, "Utang PBJT", "Liabilitas");
  push(A.UTANG_PPH, "Utang PPh Final", "Liabilitas");
  push(A.UTANG_REIMBURSE, "Utang Reimburse Karyawan", "Liabilitas");
  push(A.UTANG_GAJI, "Utang Gaji", "Liabilitas");

  // Ekuitas
  push(A.EKUITAS, "Ekuitas Pemilik", "Ekuitas");
  push("3-900", "Laba Ditahan", "Ekuitas");

  // Pendapatan — dari kategori income unit. Rental (yang ada di bookingGroups) ditandai
  // kena PBJT supaya form otomatis menawarkan pemisahan pajak.
  const taxable = new Set((unitConfig.bookingGroups || []).map((b) => b.incomeCategory));
  (unitConfig.incomeCategories || []).forEach((cat, i) => {
    const code = `4-${String(i + 1).padStart(3, "0")}`;
    push(code, cat, "Pendapatan", { category: cat, taxable: taxable.has(cat) });
  });

  // Beban — dari kategori expense unit
  (unitConfig.expenseCategories || []).forEach((cat, i) => {
    const code = `5-${String(i + 1).padStart(3, "0")}`;
    push(code, cat, "Beban", { category: cat });
  });

  return accounts;
}

function defaultConfig() {
  return { pbjtRate: 10, pbjtInclusive: true, startDate: "2026-09-01" };
}

// Pisahkan nilai kotor jadi pendapatan bersih + PBJT sesuai setelan (Q1 PRD).
function splitPBJT(amount, cfg) {
  const rate = Number(cfg?.pbjtRate) || 0;
  const gross = Number(amount) || 0;
  if (rate <= 0) return { cash: gross, net: gross, pbjt: 0 };
  if (cfg.pbjtInclusive) {
    const pbjt = Math.round((gross * rate) / (100 + rate));
    return { cash: gross, net: gross - pbjt, pbjt };
  }
  const pbjt = Math.round((gross * rate) / 100);
  return { cash: gross + pbjt, net: gross, pbjt };
}

function normalize(raw, unitConfig) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    config: { ...defaultConfig(), ...(data.config || {}) },
    accounts: Array.isArray(data.accounts) && data.accounts.length ? data.accounts : buildDefaultAccounts(unitConfig),
    entries: Array.isArray(data.entries) ? data.entries : [],
  };
}

// ---- helper saldo ----
function entryBalanced(e) {
  const d = (e.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const c = (e.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
  return Math.round(d - c) === 0 && (e.lines || []).length >= 2;
}
function accountBalance(entries, code) {
  let d = 0, c = 0;
  entries.forEach((e) => (e.lines || []).forEach((l) => {
    if (l.accountCode === code) { d += Number(l.debit) || 0; c += Number(l.credit) || 0; }
  }));
  return { debit: d, credit: c, net: d - c };
}

// ================= Komponen utama =================
export default function Jurnal({ unitId, unitConfig, canEdit, onAudit }) {
  const [data, setData] = useState(() => normalize(null, unitConfig));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("input");
  const dataRef = useRef(data);
  dataRef.current = data;

  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const res = await window.storage.get(journalKeyFor(unitId), true);
      const parsed = res?.value ? JSON.parse(res.value) : null;
      const norm = normalize(parsed, unitConfig);
      if (!parsed) {
        // Seed pertama kali — simpan bagan akun default supaya tampil rapi.
        try { await window.storage.set(journalKeyFor(unitId), JSON.stringify(norm), true); } catch (e) { /* nanti tersimpan */ }
      }
      setData(norm); dataRef.current = norm;
    } catch (e) {
      const norm = normalize(null, unitConfig);
      setData(norm); dataRef.current = norm;
    } finally {
      setLoaded(true);
    }
  }, [unitId, unitConfig]);

  useEffect(() => { load(); }, [load]);

  // Tulis dengan baca-ulang dulu (aman kalau 2 orang input bersamaan): ambil data terbaru
  // dari storage, terapkan perubahan, baru simpan.
  const commit = useCallback(async (mutate) => {
    setSaving(true);
    try {
      let base = dataRef.current;
      try {
        const res = await window.storage.get(journalKeyFor(unitId), true);
        if (res?.value) base = normalize(JSON.parse(res.value), unitConfig);
      } catch (e) { /* pakai state lokal */ }
      const next = mutate(base);
      await window.storage.set(journalKeyFor(unitId), JSON.stringify(next), true);
      setData(next); dataRef.current = next;
      return true;
    } catch (e) {
      return false;
    } finally {
      setSaving(false);
    }
  }, [unitId, unitConfig]);

  const { config, accounts, entries } = data;
  const accByCode = useMemo(() => Object.fromEntries(accounts.map((a) => [a.code, a])), [accounts]);
  const kantongAccounts = useMemo(() => accounts.filter((a) => a.kantong), [accounts]);

  const addEntry = useCallback((entry) => {
    const full = { ...entry, id: entry.id || uid(), createdAt: Date.now() };
    return commit((base) => ({ ...base, entries: [full, ...base.entries] }))
      .then((ok) => { if (ok && onAudit) onAudit("tambah", `Jurnal · ${entry.description || entry.noBukti} · ${formatRupiah((entry.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0))}`); return ok; });
  }, [commit, onAudit]);

  const deleteEntry = useCallback((id) => {
    const e = dataRef.current.entries.find((x) => x.id === id);
    return commit((base) => ({ ...base, entries: base.entries.filter((x) => x.id !== id) }))
      .then((ok) => { if (ok && onAudit) onAudit("hapus", `Jurnal dihapus · ${e?.description || e?.noBukti || ""}`); return ok; });
  }, [commit, onAudit]);

  const saveConfig = useCallback((patch) => {
    return commit((base) => ({ ...base, config: { ...base.config, ...patch } }))
      .then((ok) => { if (ok && onAudit) onAudit("ubah", "Setelan pembukuan (PBJT/tanggal mulai)"); return ok; });
  }, [commit, onAudit]);

  const saveAccounts = useCallback((nextAccounts) => {
    return commit((base) => ({ ...base, accounts: nextAccounts }))
      .then((ok) => { if (ok && onAudit) onAudit("ubah", "Bagan akun"); return ok; });
  }, [commit, onAudit]);

  // ---- ringkasan untuk banner ----
  const totalDebit = useMemo(() => entries.reduce((s, e) => s + (e.lines || []).reduce((a, l) => a + (Number(l.debit) || 0), 0), 0), [entries]);
  const totalCredit = useMemo(() => entries.reduce((s, e) => s + (e.lines || []).reduce((a, l) => a + (Number(l.credit) || 0), 0), 0), [entries]);
  const unbalanced = useMemo(() => entries.filter((e) => !entryBalanced(e)), [entries]);
  const grandBalanced = Math.round(totalDebit - totalCredit) === 0;

  if (!loaded) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 260 }}>
        <Loader2 className="animate-spin" style={{ color: "#C9A227" }} size={28} />
      </div>
    );
  }

  const VIEWS = [
    ["input", "Input Cepat", Plus],
    ["jurnal", "Jurnal Umum", ListChecks],
    ["besar", "Kas & Bank", Wallet],
    ["kewajiban", "Kewajiban", ShieldAlert],
    ["neraca", "Neraca Saldo", Scale],
    ["labarugi", "Laba Rugi", TrendingUp],
    ["saldoawal", "Saldo Awal", FileText],
    ["akun", "Bagan Akun", BookOpen],
  ];

  return (
    <div className="space-y-4">
      {/* Header + status keseimbangan */}
      <div className="v3-surface" style={{ borderRadius: 16, padding: "1rem 1.1rem", border: "1px solid rgba(201,162,39,0.18)" }}>
        <div className="flex items-center justify-between flex-wrap" style={{ gap: 8 }}>
          <div>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
              <BookOpen size={20} style={{ color: "#C9A227" }} /> Pembukuan Jurnal
            </h2>
            <p className="v3-muted" style={{ fontSize: "0.72rem", marginTop: 2 }}>
              Catatan akuntansi berpasangan · {unitConfig.name}
            </p>
          </div>
          <div
            className="flex items-center"
            style={{
              gap: 8, borderRadius: 12, padding: "0.5rem 0.8rem",
              background: grandBalanced ? "rgba(76,175,97,0.12)" : "rgba(209,87,74,0.14)",
              border: `1px solid ${grandBalanced ? "rgba(76,175,97,0.4)" : "rgba(209,87,74,0.45)"}`,
            }}
          >
            {grandBalanced ? <CheckCircle2 size={18} style={{ color: "#4CAF61" }} /> : <AlertTriangle size={18} style={{ color: "#D1574A" }} />}
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, color: grandBalanced ? "#4CAF61" : "#D1574A" }}>
                {grandBalanced ? "Seimbang" : "Tidak Seimbang"}
              </div>
              <div className="v3-mono" style={{ fontSize: "0.64rem", color: "#8A9099" }}>
                D {formatRupiah(totalDebit)} · K {formatRupiah(totalCredit)}
              </div>
            </div>
          </div>
        </div>
        {unbalanced.length > 0 && (
          <div style={{ marginTop: 10, fontSize: "0.72rem", color: "#D1574A", display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} /> {unbalanced.length} transaksi belum seimbang — cek tab Jurnal Umum (baris merah).
          </div>
        )}
      </div>

      {/* Sub-navigasi */}
      <div className="v3-scroll flex" style={{ gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {VIEWS.map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className="flex items-center"
            style={{
              gap: 6, flex: "0 0 auto", padding: "0.5rem 0.85rem", borderRadius: 999, fontSize: "0.76rem", fontWeight: 700,
              background: view === id ? "#C9A227" : "rgba(255,255,255,0.04)",
              color: view === id ? "#1a1a1a" : "#B8BDC4",
              border: view === id ? "none" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {saving && (
        <div style={{ fontSize: "0.7rem", color: "#C9A227", display: "flex", alignItems: "center", gap: 6 }}>
          <Loader2 size={13} className="animate-spin" /> Menyimpan…
        </div>
      )}

      {view === "input" && (
        <QuickEntry
          accounts={accounts} kantongAccounts={kantongAccounts} config={config}
          canEdit={canEdit} onAdd={addEntry}
        />
      )}
      {view === "jurnal" && (
        <JournalTable entries={entries} accByCode={accByCode} kantongAccounts={kantongAccounts} canEdit={canEdit} onDelete={deleteEntry} accounts={accounts} onAdd={addEntry} config={config} />
      )}
      {view === "besar" && (
        <CashBankLedger entries={entries} kantongAccounts={kantongAccounts} accByCode={accByCode} />
      )}
      {view === "kewajiban" && (
        <LiabilitiesDashboard entries={entries} accounts={accounts} accByCode={accByCode} />
      )}
      {view === "neraca" && (
        <TrialBalance entries={entries} accounts={accounts} />
      )}
      {view === "labarugi" && (
        <IncomeStatement entries={entries} accounts={accounts} />
      )}
      {view === "saldoawal" && (
        <OpeningBalance entries={entries} accounts={accounts} config={config} canEdit={canEdit} onAdd={addEntry} onDeleteEntry={deleteEntry} />
      )}
      {view === "akun" && (
        <AccountsManager accounts={accounts} config={config} canEdit={canEdit} onSaveAccounts={saveAccounts} onSaveConfig={saveConfig} />
      )}
    </div>
  );
}

// ---------- styling kecil dipakai ulang ----------
const inputStyle = {
  width: "100%", padding: "0.6rem 0.7rem", borderRadius: 10, background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)", color: "#EDEFF2", fontSize: "0.9rem",
};
function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, color: "#B8BDC4", marginBottom: 5 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: "0.66rem", color: "#8A9099", marginTop: 4 }}>{hint}</span>}
    </label>
  );
}
function money(v) { return Number(String(v).replace(/[^\d]/g, "")) || 0; }

// ================= Input Cepat (form bahasa awam -> jurnal otomatis) =================
const TX_TYPES = [
  { id: "income-lunas", label: "Pemasukan Lunas", desc: "Rental / jasa dibayar penuh hari ini" },
  { id: "income-dp", label: "Terima DP", desc: "Uang muka, main di kemudian hari" },
  { id: "recognize", label: "Akui Pendapatan (hari main)", desc: "DP jadi pendapatan saat lapangan dipakai" },
  { id: "expense", label: "Pengeluaran / Beban", desc: "Bayar biaya operasional" },
  { id: "transfer", label: "Setor Tunai / Pindah Kantong", desc: "Kas ke bank — bukan pemasukan baru" },
  { id: "setor-pbjt", label: "Setor PBJT ke Kas Daerah", desc: "Bayar pajak yang sudah dipungut" },
  { id: "bayar-utang", label: "Bayar Utang", desc: "Fee FG/wasit, gaji, reimburse, PPh" },
  { id: "catat-utang", label: "Catat Utang (belum dibayar)", desc: "Biaya terutang / fee jatuh tempo" },
  { id: "kasbon", label: "Kasbon Karyawan (piutang)", desc: "Uang muka untuk karyawan" },
];

function QuickEntry({ accounts, kantongAccounts, config, canEdit, onAdd }) {
  const revenues = accounts.filter((a) => a.group === "Pendapatan");
  const expenses = accounts.filter((a) => a.group === "Beban");
  const liabilities = accounts.filter((a) => a.group === "Liabilitas");

  const [type, setType] = useState("income-lunas");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [kantong, setKantong] = useState(kantongAccounts[0]?.code || "");
  const [kantong2, setKantong2] = useState(kantongAccounts[0]?.code || "");
  const [revenueAcct, setRevenueAcct] = useState(revenues[0]?.code || "");
  const [expenseAcct, setExpenseAcct] = useState(expenses[0]?.code || "");
  const [liabilityAcct, setLiabilityAcct] = useState(liabilities[0]?.code || "");
  const [entity, setEntity] = useState("");
  const [tanggalMain, setTanggalMain] = useState(todayISO());
  const [dariDP, setDariDP] = useState("");
  const [applyPBJT, setApplyPBJT] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [msg, setMsg] = useState("");

  const accByCode = useMemo(() => Object.fromEntries(accounts.map((a) => [a.code, a])), [accounts]);
  const revTaxable = accByCode[revenueAcct]?.taxable;
  // Default checkbox PBJT mengikuti apakah akun pendapatan ditandai kena pajak.
  useEffect(() => { setApplyPBJT(!!accByCode[revenueAcct]?.taxable); }, [revenueAcct]); // eslint-disable-line

  const amt = money(amount);

  // Pratinjau baris jurnal yang akan dibuat.
  const preview = useMemo(() => buildLines({
    type, amount: amt, kantong, kantong2, revenueAcct, expenseAcct, liabilityAcct,
    dariDP: money(dariDP), applyPBJT, config,
  }), [type, amt, kantong, kantong2, revenueAcct, expenseAcct, liabilityAcct, dariDP, applyPBJT, config]);

  const canSave = canEdit && amt > 0 && preview.lines.length >= 2 && preview.balanced && !preview.error;

  const reset = () => { setAmount(""); setDariDP(""); setEntity(""); };

  const submit = async () => {
    if (!canSave) return;
    const desc = descFor(type, { entity, accByCode, revenueAcct, expenseAcct, liabilityAcct });
    const ok = await onAdd({
      noBukti: prefixFor(type) + "-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 5).toUpperCase(),
      date, description: desc, kantong: accByCode[kantong]?.kantong || "", tanggalMain: (type === "income-dp" || type === "recognize") ? tanggalMain : "",
      entity, status: type === "income-dp" ? "DP" : "Lunas", lines: preview.lines,
    });
    if (ok) { setMsg("✓ Tersimpan ke jurnal"); reset(); setTimeout(() => setMsg(""), 2500); }
    else setMsg("Gagal menyimpan, coba lagi.");
  };

  if (!canEdit) return <div className="v3-muted" style={{ fontSize: "0.8rem" }}>Hanya admin/finance yang bisa menambah jurnal.</div>;

  const needsRevenue = type === "income-lunas" || type === "recognize";
  const needsExpense = type === "expense" || type === "catat-utang";
  const needsLiability = type === "bayar-utang" || type === "catat-utang";
  const needsKantong = ["income-lunas", "income-dp", "expense", "setor-pbjt", "bayar-utang", "kasbon"].includes(type);

  return (
    <div className="v3-surface" style={{ borderRadius: 16, padding: "1.1rem", border: "1px solid rgba(255,255,255,0.08)" }}>
      <Field label="Jenis Transaksi">
        <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle} className="v3-input">
          {TX_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <span style={{ display: "block", fontSize: "0.66rem", color: "#8A9099", marginTop: 4 }}>
          {TX_TYPES.find((t) => t.id === type)?.desc}
        </span>
      </Field>

      <div className="grid grid-cols-2" style={{ gap: 10 }}>
        <Field label="Tanggal Bayar"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} className="v3-input" /></Field>
        <Field label={type === "recognize" ? "Nilai Sewa (bruto)" : "Jumlah (Rp)"}>
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" style={inputStyle} className="v3-input v3-mono" />
        </Field>
      </div>

      {needsRevenue && (
        <Field label="Kategori Pendapatan">
          <select value={revenueAcct} onChange={(e) => setRevenueAcct(e.target.value)} style={inputStyle} className="v3-input">
            {revenues.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
          </select>
        </Field>
      )}
      {needsExpense && (
        <Field label="Kategori Beban">
          <select value={expenseAcct} onChange={(e) => setExpenseAcct(e.target.value)} style={inputStyle} className="v3-input">
            {expenses.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
          </select>
        </Field>
      )}
      {needsLiability && (
        <Field label="Jenis Utang">
          <select value={liabilityAcct} onChange={(e) => setLiabilityAcct(e.target.value)} style={inputStyle} className="v3-input">
            {liabilities.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
          </select>
        </Field>
      )}

      {(needsRevenue) && (
        <label className="flex items-center" style={{ gap: 8, marginBottom: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={applyPBJT} onChange={(e) => setApplyPBJT(e.target.checked)} />
          <span style={{ fontSize: "0.76rem", color: "#B8BDC4" }}>
            Kena PBJT ({config.pbjtRate}%, {config.pbjtInclusive ? "harga sudah termasuk pajak" : "pajak ditambah di atas harga"})
          </span>
        </label>
      )}

      {type === "recognize" && (
        <Field label="Diambil dari DP (Rp)" hint="Sisa (bruto − DP) dianggap pelunasan tunai/transfer yang diterima sekarang.">
          <input inputMode="numeric" value={dariDP} onChange={(e) => setDariDP(e.target.value)} placeholder={String(preview.cash || 0)} style={inputStyle} className="v3-input v3-mono" />
        </Field>
      )}

      {type === "transfer" && (
        <div className="grid grid-cols-2" style={{ gap: 10 }}>
          <Field label="Dari Kantong">
            <select value={kantong2} onChange={(e) => setKantong2(e.target.value)} style={inputStyle} className="v3-input">
              {kantongAccounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Ke Kantong">
            <select value={kantong} onChange={(e) => setKantong(e.target.value)} style={inputStyle} className="v3-input">
              {kantongAccounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
            </select>
          </Field>
        </div>
      )}

      {(needsKantong || type === "recognize") && type !== "transfer" && (
        <Field label={type === "expense" || type === "setor-pbjt" || type === "bayar-utang" ? "Dibayar dari Kantong" : "Masuk ke Kantong"}>
          <select value={kantong} onChange={(e) => setKantong(e.target.value)} style={inputStyle} className="v3-input">
            {kantongAccounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
          </select>
        </Field>
      )}

      {(type === "income-dp" || type === "recognize") && (
        <Field label="Tanggal Main (hari lapangan dipakai)"><input type="date" value={tanggalMain} onChange={(e) => setTanggalMain(e.target.value)} style={inputStyle} className="v3-input" /></Field>
      )}

      <Field label="Nama / Entitas (tim, pelanggan, vendor)"><input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="mis. Tim Garuda / PT LA JALI" style={inputStyle} className="v3-input" /></Field>

      {/* Pratinjau jurnal */}
      <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "0.5rem 0.75rem", background: "rgba(201,162,39,0.08)", fontSize: "0.68rem", fontWeight: 700, color: "#C9A227" }}>
          Pratinjau Jurnal
        </div>
        {preview.error ? (
          <div style={{ padding: "0.75rem", fontSize: "0.74rem", color: "#D1574A" }}>{preview.error}</div>
        ) : (
          <table style={{ width: "100%", fontSize: "0.72rem", borderCollapse: "collapse" }}>
            <tbody>
              {preview.lines.map((l, i) => (
                <tr key={i} style={{ borderTop: i ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <td style={{ padding: "0.4rem 0.75rem", color: "#EDEFF2" }}>
                    {l.debit ? "" : <span style={{ paddingLeft: 16 }} />}{accByCode[l.accountCode]?.name || l.accountCode}
                  </td>
                  <td className="v3-mono" style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "#4D7FB0" }}>{l.debit ? formatRupiah(l.debit) : ""}</td>
                  <td className="v3-mono" style={{ padding: "0.4rem 0.75rem", textAlign: "right", color: "#3F9E8A" }}>{l.credit ? formatRupiah(l.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {msg && <div style={{ fontSize: "0.76rem", color: msg.startsWith("✓") ? "#4CAF61" : "#D1574A", marginBottom: 8 }}>{msg}</div>}

      <button
        onClick={submit} disabled={!canSave}
        className="v3-gold-bg flex items-center justify-center"
        style={{ width: "100%", padding: "0.75rem", borderRadius: 12, fontWeight: 800, gap: 8, opacity: canSave ? 1 : 0.45 }}
      >
        <Save size={17} /> Simpan ke Jurnal
      </button>

      <button onClick={() => setShowManual(true)} className="flex items-center justify-center" style={{ width: "100%", marginTop: 8, padding: "0.6rem", borderRadius: 12, gap: 6, fontSize: "0.74rem", color: "#B8BDC4", border: "1px solid rgba(255,255,255,0.12)" }}>
        <Settings2 size={14} /> Jurnal Manual (multi-baris / pembayaran gabungan)
      </button>

      {showManual && (
        <ManualEntryModal accounts={accounts} onClose={() => setShowManual(false)} onSave={async (e) => { const ok = await onAdd(e); if (ok) setShowManual(false); }} />
      )}
    </div>
  );
}

function prefixFor(type) {
  return { "income-lunas": "IN", "income-dp": "DP", recognize: "RC", expense: "EX", transfer: "TF", "setor-pbjt": "PJ", "bayar-utang": "BU", "catat-utang": "CU", kasbon: "KB" }[type] || "JR";
}
function descFor(type, { entity, accByCode, revenueAcct, expenseAcct, liabilityAcct }) {
  const who = entity ? " · " + entity : "";
  switch (type) {
    case "income-lunas": return `Pemasukan ${accByCode[revenueAcct]?.name || ""}${who}`;
    case "income-dp": return `Terima DP${who}`;
    case "recognize": return `Pengakuan pendapatan ${accByCode[revenueAcct]?.name || ""}${who}`;
    case "expense": return `${accByCode[expenseAcct]?.name || "Beban"}${who}`;
    case "transfer": return `Pindah kantong${who}`;
    case "setor-pbjt": return `Setor PBJT${who}`;
    case "bayar-utang": return `Bayar ${accByCode[liabilityAcct]?.name || "utang"}${who}`;
    case "catat-utang": return `Utang ${accByCode[liabilityAcct]?.name || ""}${who}`;
    case "kasbon": return `Kasbon karyawan${who}`;
    default: return "Transaksi";
  }
}

// Bangun baris debit/kredit dari input form. Selalu menghasilkan { lines, balanced, error, cash }.
function buildLines(inp) {
  const { type, amount, kantong, kantong2, revenueAcct, expenseAcct, liabilityAcct, dariDP, applyPBJT, config } = inp;
  const lines = [];
  const add = (accountCode, debit, credit) => { if ((debit || 0) > 0 || (credit || 0) > 0) lines.push({ accountCode, debit: Math.round(debit || 0), credit: Math.round(credit || 0) }); };
  let cash = amount;
  let error = "";

  if (amount <= 0) error = "Isi jumlah dulu.";

  switch (type) {
    case "income-lunas": {
      const s = applyPBJT ? splitPBJT(amount, config) : { cash: amount, net: amount, pbjt: 0 };
      cash = s.cash;
      add(kantong, s.cash, 0);
      add(revenueAcct, 0, s.net);
      if (s.pbjt) add(A.PBJT, 0, s.pbjt);
      break;
    }
    case "income-dp": {
      add(kantong, amount, 0);
      add(A.DP_MUKA, 0, amount);
      break;
    }
    case "recognize": {
      const s = applyPBJT ? splitPBJT(amount, config) : { cash: amount, net: amount, pbjt: 0 };
      cash = s.cash;
      const fromDP = Math.min(Math.max(dariDP || 0, 0), s.cash) || s.cash;
      const pelunasan = s.cash - fromDP;
      add(A.DP_MUKA, fromDP, 0);
      if (pelunasan > 0) add(kantong, pelunasan, 0);
      add(revenueAcct, 0, s.net);
      if (s.pbjt) add(A.PBJT, 0, s.pbjt);
      break;
    }
    case "expense": {
      add(expenseAcct, amount, 0);
      add(kantong, 0, amount);
      break;
    }
    case "transfer": {
      if (kantong === kantong2) error = "Kantong asal dan tujuan sama.";
      add(kantong, amount, 0);      // masuk
      add(kantong2, 0, amount);     // keluar
      break;
    }
    case "setor-pbjt": {
      add(A.PBJT, amount, 0);
      add(kantong, 0, amount);
      break;
    }
    case "bayar-utang": {
      add(liabilityAcct, amount, 0);
      add(kantong, 0, amount);
      break;
    }
    case "catat-utang": {
      add(expenseAcct, amount, 0);
      add(liabilityAcct, 0, amount);
      break;
    }
    case "kasbon": {
      add(A.PIUTANG_KARYAWAN, amount, 0);
      add(kantong, 0, amount);
      break;
    }
    default: break;
  }

  const d = lines.reduce((s, l) => s + l.debit, 0);
  const c = lines.reduce((s, l) => s + l.credit, 0);
  const balanced = Math.round(d - c) === 0 && lines.length >= 2;
  if (!error && !balanced && amount > 0) error = "Debit dan kredit belum seimbang — periksa input.";
  return { lines, balanced, error, cash };
}

// ================= Jurnal Manual (multi-baris bebas) =================
function ManualEntryModal({ accounts, onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState("");
  const [entity, setEntity] = useState("");
  const [lines, setLines] = useState([{ accountCode: accounts[0]?.code || "", debit: "", credit: "" }, { accountCode: accounts[0]?.code || "", debit: "", credit: "" }]);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const totalD = lines.reduce((s, l) => s + money(l.debit), 0);
  const totalC = lines.reduce((s, l) => s + money(l.credit), 0);
  const balanced = Math.round(totalD - totalC) === 0 && totalD > 0;

  const save = () => {
    if (!balanced) return;
    const cleaned = lines
      .map((l) => ({ accountCode: l.accountCode, debit: money(l.debit), credit: money(l.credit) }))
      .filter((l) => l.debit > 0 || l.credit > 0);
    if (cleaned.length < 2) return;
    onSave({
      noBukti: "MN-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 5).toUpperCase(),
      date, description: desc || "Jurnal manual", entity, kantong: "", tanggalMain: "", status: "Lunas", lines: cleaned,
    });
  };

  return (
    <div className="v3-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0 }} onClick={onClose}>
      <div className="v3-surface" style={{ width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: "1.1rem" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <h3 style={{ fontWeight: 800, fontSize: "1rem" }}>Jurnal Manual</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="grid grid-cols-2" style={{ gap: 10 }}>
          <Field label="Tanggal"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} className="v3-input" /></Field>
          <Field label="Nama / Entitas"><input value={entity} onChange={(e) => setEntity(e.target.value)} style={inputStyle} className="v3-input" /></Field>
        </div>
        <Field label="Keterangan"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="mis. Pembayaran gabungan cash + transfer" style={inputStyle} className="v3-input" /></Field>

        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#B8BDC4", marginBottom: 6 }}>Baris Jurnal</div>
        {lines.map((l, i) => (
          <div key={i} className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
            <select value={l.accountCode} onChange={(e) => setLine(i, { accountCode: e.target.value })} style={{ ...inputStyle, flex: 2, padding: "0.5rem" }} className="v3-input">
              {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
            </select>
            <input inputMode="numeric" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: "" })} placeholder="Debit" style={{ ...inputStyle, flex: 1, padding: "0.5rem" }} className="v3-input v3-mono" />
            <input inputMode="numeric" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: "" })} placeholder="Kredit" style={{ ...inputStyle, flex: 1, padding: "0.5rem" }} className="v3-input v3-mono" />
            {lines.length > 2 && <button onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><Trash2 size={15} style={{ color: "#D1574A" }} /></button>}
          </div>
        ))}
        <button onClick={() => setLines((ls) => [...ls, { accountCode: accounts[0]?.code || "", debit: "", credit: "" }])} className="flex items-center" style={{ gap: 5, fontSize: "0.74rem", color: "#C9A227", marginTop: 4, marginBottom: 10 }}>
          <Plus size={14} /> Tambah baris
        </button>

        <div className="flex items-center justify-between" style={{ fontSize: "0.76rem", padding: "0.6rem 0.75rem", borderRadius: 10, background: balanced ? "rgba(76,175,97,0.12)" : "rgba(209,87,74,0.12)", marginBottom: 12 }}>
          <span style={{ color: balanced ? "#4CAF61" : "#D1574A", fontWeight: 700 }}>{balanced ? "Seimbang" : "Belum seimbang"}</span>
          <span className="v3-mono" style={{ color: "#8A9099" }}>D {formatRupiah(totalD)} · K {formatRupiah(totalC)}</span>
        </div>
        <button onClick={save} disabled={!balanced} className="v3-gold-bg" style={{ width: "100%", padding: "0.75rem", borderRadius: 12, fontWeight: 800, opacity: balanced ? 1 : 0.45 }}>Simpan</button>
      </div>
    </div>
  );
}

// ================= Jurnal Umum (tabel) =================
function JournalTable({ entries, accByCode, kantongAccounts, canEdit, onDelete, accounts, onAdd, config }) {
  const [fMonth, setFMonth] = useState("");
  const [fKantong, setFKantong] = useState("");
  const [fAccount, setFAccount] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [showManual, setShowManual] = useState(false);

  const months = useMemo(() => [...new Set(entries.map((e) => monthOf(e.date)))].filter(Boolean).sort().reverse(), [entries]);

  const filtered = useMemo(() => entries.filter((e) => {
    if (fMonth && monthOf(e.date) !== fMonth) return false;
    if (fKantong && e.kantong !== fKantong) return false;
    if (fAccount && !(e.lines || []).some((l) => l.accountCode === fAccount)) return false;
    return true;
  }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0)), [entries, fMonth, fKantong, fAccount]);

  return (
    <div className="space-y-3">
      <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
        <Filter size={14} style={{ color: "#8A9099" }} />
        <select value={fMonth} onChange={(e) => setFMonth(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "0.4rem 0.6rem", fontSize: "0.76rem" }} className="v3-input">
          <option value="">Semua bulan</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <select value={fKantong} onChange={(e) => setFKantong(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "0.4rem 0.6rem", fontSize: "0.76rem" }} className="v3-input">
          <option value="">Semua kantong</option>
          {kantongAccounts.map((a) => <option key={a.code} value={a.kantong}>{a.kantong}</option>)}
        </select>
        <select value={fAccount} onChange={(e) => setFAccount(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "0.4rem 0.6rem", fontSize: "0.76rem" }} className="v3-input">
          <option value="">Semua akun</option>
          {accounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
        </select>
        {canEdit && (
          <button onClick={() => setShowManual(true)} className="v3-gold-bg flex items-center" style={{ gap: 5, padding: "0.4rem 0.8rem", borderRadius: 999, fontSize: "0.74rem", fontWeight: 700, marginLeft: "auto" }}>
            <Plus size={14} /> Jurnal Manual
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="v3-muted" style={{ fontSize: "0.8rem", textAlign: "center", padding: "2rem 0" }}>Belum ada jurnal untuk filter ini.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => {
            const bal = entryBalanced(e);
            return (
              <div key={e.id} className="v3-surface" style={{ borderRadius: 12, padding: "0.75rem 0.85rem", border: bal ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(209,87,74,0.5)", background: bal ? undefined : "rgba(209,87,74,0.06)" }}>
                <div className="flex items-center justify-between" style={{ gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#EDEFF2" }}>{e.description}</div>
                    <div className="v3-mono" style={{ fontSize: "0.64rem", color: "#8A9099", marginTop: 1 }}>
                      {e.date}{e.tanggalMain ? ` · main ${e.tanggalMain}` : ""} · {e.noBukti}
                    </div>
                  </div>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    {!bal && <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#D1574A", border: "1px solid rgba(209,87,74,0.5)", borderRadius: 6, padding: "2px 5px" }}>TAK SEIMBANG</span>}
                    {canEdit && (confirmId === e.id ? (
                      <span className="flex items-center" style={{ gap: 4 }}>
                        <button onClick={() => { onDelete(e.id); setConfirmId(null); }} style={{ fontSize: "0.66rem", color: "#fff", background: "#D1574A", borderRadius: 6, padding: "3px 7px", fontWeight: 700 }}>Hapus</button>
                        <button onClick={() => setConfirmId(null)} style={{ fontSize: "0.66rem", color: "#8A9099", padding: "3px 5px" }}>Batal</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmId(e.id)} aria-label="Hapus jurnal"><Trash2 size={15} style={{ color: "#8A9099" }} /></button>
                    ))}
                  </div>
                </div>
                <table style={{ width: "100%", fontSize: "0.72rem", borderCollapse: "collapse", marginTop: 6 }}>
                  <tbody>
                    {(e.lines || []).map((l, i) => (
                      <tr key={i}>
                        <td style={{ padding: "2px 0", color: "#B8BDC4" }}>
                          <span style={{ fontFamily: "monospace", color: "#6b7280", marginRight: 6 }}>{l.accountCode}</span>
                          {!l.debit && <span style={{ paddingLeft: 12 }} />}{accByCode[l.accountCode]?.name || l.accountCode}
                        </td>
                        <td className="v3-mono" style={{ textAlign: "right", color: "#4D7FB0", width: 96 }}>{l.debit ? formatRupiah(l.debit) : ""}</td>
                        <td className="v3-mono" style={{ textAlign: "right", color: "#3F9E8A", width: 96 }}>{l.credit ? formatRupiah(l.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {e.entity && <div style={{ fontSize: "0.66rem", color: "#8A9099", marginTop: 4 }}>👤 {e.entity}</div>}
              </div>
            );
          })}
        </div>
      )}

      {showManual && (
        <ManualEntryModal accounts={accounts} onClose={() => setShowManual(false)} onSave={async (ent) => { const ok = await onAdd(ent); if (ok) setShowManual(false); }} />
      )}
    </div>
  );
}

// ================= Buku Besar Kas & Bank =================
function CashBankLedger({ entries, kantongAccounts, accByCode }) {
  const [code, setCode] = useState(kantongAccounts[0]?.code || "");
  const rows = useMemo(() => {
    const list = [];
    entries.forEach((e) => (e.lines || []).forEach((l) => {
      if (l.accountCode === code) list.push({ date: e.date, desc: e.description, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, createdAt: e.createdAt });
    }));
    list.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.createdAt || 0) - (b.createdAt || 0));
    let run = 0;
    return list.map((r) => { run += r.debit - r.credit; return { ...r, running: run }; });
  }, [entries, code]);
  const balance = rows.length ? rows[rows.length - 1].running : 0;

  return (
    <div className="space-y-3">
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
        {kantongAccounts.map((a) => {
          const b = accountBalance(entries, a.code).net;
          const active = a.code === code;
          return (
            <button key={a.code} onClick={() => setCode(a.code)} className="v3-surface" style={{ textAlign: "left", borderRadius: 12, padding: "0.7rem 0.8rem", border: active ? "1px solid #C9A227" : "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: "0.72rem", color: "#8A9099" }}>{a.name}</div>
              <div className="v3-mono" style={{ fontSize: "0.95rem", fontWeight: 800, color: b < 0 ? "#D1574A" : "#EDEFF2", marginTop: 2 }}>{formatRupiah(b)}</div>
              {b < 0 && <div style={{ fontSize: "0.6rem", color: "#D1574A", marginTop: 2 }}>⚠ saldo negatif</div>}
            </button>
          );
        })}
      </div>

      <div className="v3-surface" style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between" style={{ padding: "0.7rem 0.85rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{accByCode[code]?.name}</span>
          <span className="v3-mono" style={{ fontWeight: 800, color: balance < 0 ? "#D1574A" : "#3F9E8A" }}>{formatRupiah(balance)}</span>
        </div>
        {rows.length === 0 ? (
          <div className="v3-muted" style={{ fontSize: "0.78rem", padding: "1.5rem", textAlign: "center" }}>Belum ada mutasi.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "0.72rem", borderCollapse: "collapse", minWidth: 460 }}>
              <thead>
                <tr style={{ color: "#8A9099", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Tgl</th>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Keterangan</th>
                  <th style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>Masuk</th>
                  <th style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>Keluar</th>
                  <th style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td className="v3-mono" style={{ padding: "0.45rem 0.6rem", color: "#8A9099", whiteSpace: "nowrap" }}>{r.date}</td>
                    <td style={{ padding: "0.45rem 0.6rem", color: "#EDEFF2" }}>{r.desc}</td>
                    <td className="v3-mono" style={{ padding: "0.45rem 0.6rem", textAlign: "right", color: "#3F9E8A" }}>{r.debit ? formatRupiah(r.debit) : ""}</td>
                    <td className="v3-mono" style={{ padding: "0.45rem 0.6rem", textAlign: "right", color: "#D9772E" }}>{r.credit ? formatRupiah(r.credit) : ""}</td>
                    <td className="v3-mono" style={{ padding: "0.45rem 0.6rem", textAlign: "right", fontWeight: 700, color: r.running < 0 ? "#D1574A" : "#EDEFF2" }}>{formatRupiah(r.running)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ================= Dashboard Kewajiban =================
function LiabilitiesDashboard({ entries, accounts, accByCode }) {
  const liabilities = accounts.filter((a) => a.group === "Liabilitas");
  const cards = liabilities.map((a) => ({ ...a, bal: -accountBalance(entries, a.code).net })).filter((c) => Math.abs(c.bal) > 0.5);

  // Rincian DP per entitas (kredit DP - debit DP).
  const dpByEntity = useMemo(() => {
    const map = {};
    entries.forEach((e) => (e.lines || []).forEach((l) => {
      if (l.accountCode === A.DP_MUKA) {
        const key = e.entity || "(tanpa nama)";
        map[key] = map[key] || { entity: key, amount: 0, tanggalMain: e.tanggalMain };
        map[key].amount += (Number(l.credit) || 0) - (Number(l.debit) || 0);
        if (e.tanggalMain && (!map[key].tanggalMain || e.tanggalMain < map[key].tanggalMain)) map[key].tanggalMain = e.tanggalMain;
      }
    }));
    return Object.values(map).filter((x) => Math.round(x.amount) > 0).sort((a, b) => (a.tanggalMain || "").localeCompare(b.tanggalMain || ""));
  }, [entries]);

  // Umur piutang karyawan / reimburse per entitas.
  const aging = useMemo(() => {
    const build = (code) => {
      const map = {};
      entries.forEach((e) => (e.lines || []).forEach((l) => {
        if (l.accountCode === code) {
          const key = e.entity || "(tanpa nama)";
          map[key] = map[key] || { entity: key, amount: 0, oldest: e.date };
          const isDebtIncrease = code === A.PIUTANG_KARYAWAN ? (Number(l.debit) || 0) - (Number(l.credit) || 0) : (Number(l.credit) || 0) - (Number(l.debit) || 0);
          map[key].amount += isDebtIncrease;
          if (e.date && e.date < map[key].oldest) map[key].oldest = e.date;
        }
      }));
      return Object.values(map).filter((x) => Math.round(x.amount) > 0);
    };
    return { piutang: build(A.PIUTANG_KARYAWAN), reimburse: build(A.UTANG_REIMBURSE) };
  }, [entries]);

  const daysAgo = (iso) => { if (!iso) return 0; return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); };

  return (
    <div className="space-y-4">
      <div style={{ fontSize: "0.72rem", color: "#8A9099" }}>Ini panel paling penting: uang yang Anda pegang tapi bukan milik V3BKS (pajak dipungut, fee terutang, DP, reimburse).</div>
      {cards.length === 0 ? (
        <div className="v3-muted" style={{ fontSize: "0.8rem", textAlign: "center", padding: "1.5rem 0" }}>Belum ada kewajiban tercatat.</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
          {cards.map((c) => (
            <div key={c.code} className="v3-surface" style={{ borderRadius: 12, padding: "0.85rem", border: "1px solid rgba(209,87,74,0.25)" }}>
              <div style={{ fontSize: "0.72rem", color: "#B8BDC4" }}>{c.name}</div>
              <div className="v3-mono" style={{ fontSize: "1.05rem", fontWeight: 800, color: "#D1574A", marginTop: 3 }}>{formatRupiah(c.bal)}</div>
            </div>
          ))}
        </div>
      )}

      {dpByEntity.length > 0 && (
        <div className="v3-surface" style={{ borderRadius: 12, padding: "0.9rem", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontWeight: 700, fontSize: "0.82rem", marginBottom: 8 }}>Rincian DP per Pelanggan (belum diakui)</div>
          {dpByEntity.map((d, i) => (
            <div key={i} className="flex items-center justify-between" style={{ padding: "0.35rem 0", borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none", fontSize: "0.76rem" }}>
              <span style={{ color: "#EDEFF2" }}>{d.entity}{d.tanggalMain ? <span style={{ color: "#8A9099" }}> · main {d.tanggalMain}</span> : ""}</span>
              <span className="v3-mono" style={{ color: "#C9A227", fontWeight: 700 }}>{formatRupiah(d.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {(aging.piutang.length > 0 || aging.reimburse.length > 0) && (
        <div className="v3-surface" style={{ borderRadius: 12, padding: "0.9rem", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontWeight: 700, fontSize: "0.82rem", marginBottom: 8 }}>Umur Piutang & Reimburse</div>
          {[...aging.piutang.map((x) => ({ ...x, kind: "Kasbon" })), ...aging.reimburse.map((x) => ({ ...x, kind: "Reimburse" }))].map((x, i) => {
            const d = daysAgo(x.oldest);
            const tone = d > 30 ? "#D1574A" : d > 14 ? "#D9772E" : d > 7 ? "#C9A227" : "#8A9099";
            return (
              <div key={i} className="flex items-center justify-between" style={{ padding: "0.35rem 0", borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none", fontSize: "0.76rem" }}>
                <span style={{ color: "#EDEFF2" }}>{x.entity} <span style={{ color: "#8A9099" }}>· {x.kind}</span></span>
                <span className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontSize: "0.66rem", color: tone }}>{d} hari</span>
                  <span className="v3-mono" style={{ fontWeight: 700 }}>{formatRupiah(x.amount)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ================= Neraca Saldo =================
function TrialBalance({ entries, accounts }) {
  const rows = accounts.map((a) => {
    const { net } = accountBalance(entries, a.code);
    const debit = net > 0 ? net : 0;
    const credit = net < 0 ? -net : 0;
    return { ...a, debit, credit };
  }).filter((r) => r.debit || r.credit);
  const totalD = rows.reduce((s, r) => s + r.debit, 0);
  const totalC = rows.reduce((s, r) => s + r.credit, 0);
  const ok = Math.round(totalD - totalC) === 0;

  return (
    <div className="v3-surface" style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: "0.74rem", borderCollapse: "collapse", minWidth: 420 }}>
          <thead>
            <tr style={{ color: "#8A9099", textAlign: "left", background: "rgba(255,255,255,0.03)" }}>
              <th style={{ padding: "0.6rem" }}>Akun</th>
              <th style={{ padding: "0.6rem", textAlign: "right" }}>Debit</th>
              <th style={{ padding: "0.6rem", textAlign: "right" }}>Kredit</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => {
              const gr = rows.filter((r) => r.group === g);
              if (!gr.length) return null;
              return (
                <React.Fragment key={g}>
                  <tr><td colSpan={3} style={{ padding: "0.4rem 0.6rem", fontWeight: 800, fontSize: "0.68rem", color: GROUP_TONE[g], background: "rgba(255,255,255,0.02)" }}>{g}</td></tr>
                  {gr.map((r) => (
                    <tr key={r.code} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "0.45rem 0.6rem", color: "#EDEFF2" }}><span style={{ fontFamily: "monospace", color: "#6b7280", marginRight: 6 }}>{r.code}</span>{r.name}</td>
                      <td className="v3-mono" style={{ padding: "0.45rem 0.6rem", textAlign: "right", color: "#4D7FB0" }}>{r.debit ? formatRupiah(r.debit) : ""}</td>
                      <td className="v3-mono" style={{ padding: "0.45rem 0.6rem", textAlign: "right", color: "#3F9E8A" }}>{r.credit ? formatRupiah(r.credit) : ""}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid rgba(201,162,39,0.4)", fontWeight: 800 }}>
              <td style={{ padding: "0.6rem", color: ok ? "#4CAF61" : "#D1574A" }}>{ok ? "Seimbang ✓" : "Tidak seimbang!"}</td>
              <td className="v3-mono" style={{ padding: "0.6rem", textAlign: "right", color: "#4D7FB0" }}>{formatRupiah(totalD)}</td>
              <td className="v3-mono" style={{ padding: "0.6rem", textAlign: "right", color: "#3F9E8A" }}>{formatRupiah(totalC)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ================= Laba Rugi =================
function IncomeStatement({ entries, accounts }) {
  const months = useMemo(() => [...new Set(entries.map((e) => monthOf(e.date)))].filter(Boolean).sort().reverse(), [entries]);
  const [ym, setYm] = useState("");

  const inScope = useMemo(() => entries.filter((e) => !ym || monthOf(e.date) === ym), [entries, ym]);
  const revAccts = accounts.filter((a) => a.group === "Pendapatan").map((a) => ({ ...a, val: -accountBalance(inScope, a.code).net })).filter((a) => Math.abs(a.val) > 0.5);
  const expAccts = accounts.filter((a) => a.group === "Beban").map((a) => ({ ...a, val: accountBalance(inScope, a.code).net })).filter((a) => Math.abs(a.val) > 0.5);
  const totalRev = revAccts.reduce((s, a) => s + a.val, 0);
  const totalExp = expAccts.reduce((s, a) => s + a.val, 0);
  const laba = totalRev - totalExp;

  const Section = ({ title, items, tone }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: "0.72rem", color: tone, marginBottom: 4 }}>{title}</div>
      {items.length === 0 ? <div className="v3-muted" style={{ fontSize: "0.72rem" }}>—</div> : items.map((a) => (
        <div key={a.code} className="flex items-center justify-between" style={{ padding: "0.25rem 0", fontSize: "0.76rem" }}>
          <span style={{ color: "#B8BDC4" }}>{a.name}</span>
          <span className="v3-mono" style={{ color: "#EDEFF2" }}>{formatRupiah(a.val)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="v3-surface" style={{ borderRadius: 12, padding: "1rem", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <span style={{ fontWeight: 800, fontSize: "0.9rem" }}>Laba Rugi</span>
        <select value={ym} onChange={(e) => setYm(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "0.4rem 0.6rem", fontSize: "0.76rem" }} className="v3-input">
          <option value="">Semua periode</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      <Section title="PENDAPATAN" items={revAccts} tone="#3F9E8A" />
      <div className="flex items-center justify-between" style={{ padding: "0.4rem 0", borderTop: "1px solid rgba(255,255,255,0.08)", fontWeight: 700, fontSize: "0.8rem" }}>
        <span style={{ color: "#3F9E8A" }}>Total Pendapatan (net PBJT)</span>
        <span className="v3-mono">{formatRupiah(totalRev)}</span>
      </div>
      <div style={{ height: 12 }} />
      <Section title="BEBAN" items={expAccts} tone="#D9772E" />
      <div className="flex items-center justify-between" style={{ padding: "0.4rem 0", borderTop: "1px solid rgba(255,255,255,0.08)", fontWeight: 700, fontSize: "0.8rem" }}>
        <span style={{ color: "#D9772E" }}>Total Beban</span>
        <span className="v3-mono">{formatRupiah(totalExp)}</span>
      </div>
      <div className="flex items-center justify-between" style={{ padding: "0.7rem 0.8rem", marginTop: 12, borderRadius: 10, background: laba >= 0 ? "rgba(76,175,97,0.12)" : "rgba(209,87,74,0.12)", fontWeight: 800 }}>
        <span style={{ color: laba >= 0 ? "#4CAF61" : "#D1574A" }}>{laba >= 0 ? "Laba Bersih" : "Rugi Bersih"}</span>
        <span className="v3-mono" style={{ color: laba >= 0 ? "#4CAF61" : "#D1574A" }}>{formatRupiah(laba)}</span>
      </div>
    </div>
  );
}

// ================= Saldo Awal =================
function OpeningBalance({ entries, accounts, config, canEdit, onAdd, onDeleteEntry }) {
  const existing = entries.find((e) => e.noBukti === "SALDO-AWAL");
  const assetLiab = accounts.filter((a) => a.group === "Aset" || a.group === "Liabilitas");
  const [vals, setVals] = useState({});
  const [date, setDate] = useState("2026-08-31");

  const setV = (code, v) => setVals((s) => ({ ...s, [code]: v }));

  // Debit = aset, Kredit = liabilitas. Selisih masuk Ekuitas Pemilik supaya seimbang.
  const totalAset = assetLiab.filter((a) => a.group === "Aset").reduce((s, a) => s + money(vals[a.code]), 0);
  const totalLiab = assetLiab.filter((a) => a.group === "Liabilitas").reduce((s, a) => s + money(vals[a.code]), 0);
  const ekuitas = totalAset - totalLiab;

  const save = async () => {
    const lines = [];
    assetLiab.forEach((a) => {
      const v = money(vals[a.code]);
      if (v <= 0) return;
      if (a.group === "Aset") lines.push({ accountCode: a.code, debit: v, credit: 0 });
      else lines.push({ accountCode: a.code, debit: 0, credit: v });
    });
    if (lines.length === 0) return;
    // Penyeimbang ekuitas
    if (ekuitas >= 0) lines.push({ accountCode: A.EKUITAS, debit: 0, credit: ekuitas });
    else lines.push({ accountCode: A.EKUITAS, debit: -ekuitas, credit: 0 });
    await onAdd({ noBukti: "SALDO-AWAL", date, description: "Jurnal pembuka — saldo awal", entity: "", kantong: "", tanggalMain: "", status: "Lunas", lines });
  };

  if (existing) {
    return (
      <div className="v3-surface" style={{ borderRadius: 12, padding: "1rem", border: "1px solid rgba(76,175,97,0.3)" }}>
        <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
          <CheckCircle2 size={18} style={{ color: "#4CAF61" }} />
          <span style={{ fontWeight: 800, fontSize: "0.88rem" }}>Saldo awal sudah dicatat ({existing.date})</span>
        </div>
        <table style={{ width: "100%", fontSize: "0.74rem", borderCollapse: "collapse" }}>
          <tbody>
            {existing.lines.map((l, i) => {
              const a = accounts.find((x) => x.code === l.accountCode);
              return (
                <tr key={i} style={{ borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <td style={{ padding: "0.4rem 0", color: "#EDEFF2" }}>{a?.name || l.accountCode}</td>
                  <td className="v3-mono" style={{ textAlign: "right", color: "#4D7FB0" }}>{l.debit ? formatRupiah(l.debit) : ""}</td>
                  <td className="v3-mono" style={{ textAlign: "right", color: "#3F9E8A" }}>{l.credit ? formatRupiah(l.credit) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {canEdit && (
          <button onClick={() => onDeleteEntry(existing.id)} className="flex items-center" style={{ gap: 6, marginTop: 12, fontSize: "0.74rem", color: "#D1574A" }}>
            <Trash2 size={14} /> Hapus & catat ulang
          </button>
        )}
      </div>
    );
  }

  if (!canEdit) return <div className="v3-muted" style={{ fontSize: "0.8rem" }}>Saldo awal belum dicatat.</div>;

  return (
    <div className="v3-surface" style={{ borderRadius: 12, padding: "1rem", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: "0.74rem", color: "#8A9099", marginBottom: 12 }}>
        Isi saldo per <b>31 Agustus 2026</b> dari hitung fisik kas & rekening koran. Selisih otomatis masuk ke Ekuitas Pemilik supaya seimbang. (PRD R7)
      </div>
      <Field label="Tanggal saldo awal"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} className="v3-input" /></Field>
      {["Aset", "Liabilitas"].map((g) => (
        <div key={g} style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: "0.7rem", color: GROUP_TONE[g], marginBottom: 6 }}>{g}</div>
          {assetLiab.filter((a) => a.group === g).map((a) => (
            <div key={a.code} className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: "0.76rem", color: "#B8BDC4" }}>{a.name}</span>
              <input inputMode="numeric" value={vals[a.code] || ""} onChange={(e) => setV(a.code, e.target.value)} placeholder="0" style={{ ...inputStyle, width: 150, padding: "0.45rem 0.6rem" }} className="v3-input v3-mono" />
            </div>
          ))}
        </div>
      ))}
      <div className="flex items-center justify-between" style={{ padding: "0.6rem 0.75rem", borderRadius: 10, background: "rgba(138,99,179,0.12)", marginBottom: 12, fontSize: "0.78rem" }}>
        <span style={{ color: "#8A63B3", fontWeight: 700 }}>Ekuitas Pemilik (penyeimbang)</span>
        <span className="v3-mono" style={{ fontWeight: 800 }}>{formatRupiah(ekuitas)}</span>
      </div>
      <button onClick={save} className="v3-gold-bg" style={{ width: "100%", padding: "0.75rem", borderRadius: 12, fontWeight: 800 }}>Catat Jurnal Pembuka</button>
    </div>
  );
}

// ================= Bagan Akun + Setelan =================
function AccountsManager({ accounts, config, canEdit, onSaveAccounts, onSaveConfig }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("Beban");
  const [rate, setRate] = useState(String(config.pbjtRate));
  const [inclusive, setInclusive] = useState(config.pbjtInclusive);

  useEffect(() => { setRate(String(config.pbjtRate)); setInclusive(config.pbjtInclusive); }, [config]);

  const nextCode = (g) => {
    const prefix = { Aset: "1", Liabilitas: "2", Ekuitas: "3", Pendapatan: "4", Beban: "5" }[g];
    const nums = accounts.filter((a) => a.code.startsWith(prefix + "-")).map((a) => Number(a.code.split("-")[1]) || 0);
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    return `${prefix}-${String(n).padStart(3, "0")}`;
  };

  const addAccount = () => {
    if (!name.trim()) return;
    const code = nextCode(group);
    onSaveAccounts([...accounts, { code, name: name.trim(), group, system: false }]);
    setName(""); setShowAdd(false);
  };
  const removeAccount = (code) => {
    onSaveAccounts(accounts.filter((a) => a.code !== code));
  };

  return (
    <div className="space-y-4">
      {/* Setelan PBJT */}
      <div className="v3-surface" style={{ borderRadius: 12, padding: "1rem", border: "1px solid rgba(201,162,39,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: "0.85rem", marginBottom: 4 }}>Setelan PBJT (Pajak Barang & Jasa Tertentu)</div>
        <div style={{ fontSize: "0.7rem", color: "#8A9099", marginBottom: 12 }}>
          Menentukan cara memisahkan pajak dari pendapatan (PRD Q1 & Q2). Kalau Bapenda menjawab tarif berbeda, cukup ubah di sini — rumus lain otomatis ikut.
        </div>
        <div className="grid grid-cols-2" style={{ gap: 10 }}>
          <Field label="Tarif PBJT (%)"><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} style={inputStyle} className="v3-input v3-mono" /></Field>
          <Field label="Harga di pricelist">
            <select value={inclusive ? "in" : "ex"} onChange={(e) => setInclusive(e.target.value === "in")} style={inputStyle} className="v3-input">
              <option value="in">Sudah termasuk PBJT</option>
              <option value="ex">Belum termasuk PBJT</option>
            </select>
          </Field>
        </div>
        <div style={{ fontSize: "0.68rem", color: "#B8BDC4", marginBottom: 10 }}>
          Contoh Rp1.200.000: {inclusive
            ? `PBJT = ${formatRupiah(Math.round(1200000 * (Number(rate) || 0) / (100 + (Number(rate) || 0))))}, pendapatan bersih = ${formatRupiah(1200000 - Math.round(1200000 * (Number(rate) || 0) / (100 + (Number(rate) || 0))))}`
            : `PBJT = ${formatRupiah(Math.round(1200000 * (Number(rate) || 0) / 100))} ditambah di atas harga`}
        </div>
        {canEdit && (
          <button onClick={() => onSaveConfig({ pbjtRate: Number(rate) || 0, pbjtInclusive: inclusive })} className="v3-gold-bg" style={{ padding: "0.55rem 1rem", borderRadius: 10, fontWeight: 700, fontSize: "0.78rem" }}>Simpan Setelan</button>
        )}
      </div>

      {/* Daftar akun */}
      <div className="v3-surface" style={{ borderRadius: 12, padding: "1rem", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>Bagan Akun</span>
          {canEdit && <button onClick={() => setShowAdd((s) => !s)} className="flex items-center" style={{ gap: 5, fontSize: "0.74rem", color: "#C9A227" }}><Plus size={14} /> Tambah</button>}
        </div>
        {showAdd && (
          <div className="flex items-center" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama akun" style={{ ...inputStyle, flex: 1, minWidth: 140, padding: "0.5rem" }} className="v3-input" />
            <select value={group} onChange={(e) => setGroup(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "0.5rem" }} className="v3-input">
              {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <button onClick={addAccount} className="v3-gold-bg" style={{ padding: "0.5rem 0.9rem", borderRadius: 10, fontWeight: 700, fontSize: "0.76rem" }}>Simpan</button>
          </div>
        )}
        {GROUPS.map((g) => {
          const gr = accounts.filter((a) => a.group === g);
          if (!gr.length) return null;
          return (
            <div key={g} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: "0.66rem", color: GROUP_TONE[g], marginBottom: 4 }}>{g}</div>
              {gr.map((a) => (
                <div key={a.code} className="flex items-center justify-between" style={{ padding: "0.3rem 0", fontSize: "0.76rem", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ color: "#EDEFF2" }}>
                    <span style={{ fontFamily: "monospace", color: "#6b7280", marginRight: 6 }}>{a.code}</span>{a.name}
                    {a.taxable && <span style={{ fontSize: "0.58rem", color: "#C9A227", marginLeft: 6 }}>PBJT</span>}
                  </span>
                  {canEdit && !a.system && <button onClick={() => removeAccount(a.code)} aria-label="Hapus akun"><Trash2 size={14} style={{ color: "#8A9099" }} /></button>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
