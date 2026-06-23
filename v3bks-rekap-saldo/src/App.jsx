import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Plus, X, Landmark, Banknote, ArrowLeftRight, Pencil, Trash2,
  TrendingUp, TrendingDown, RefreshCw, Settings, Search, Loader2,
  AlertCircle, CheckCircle2, AlertTriangle, ClipboardCheck, Trophy, BarChart3, Wallet, Download,
  LayoutDashboard, ListChecks, Tag, ShieldCheck, Zap, FileText, Clock, HandCoins,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";

const STORAGE_KEY = "v3bks_finance_data";
const TEMPLATES_KEY = "v3bks_templates";
const METHODS = ["Cash", "BCA", "Mandiri", "BNI"];
const METHOD_META = {
  Cash: { accent: "#C9A227", icon: Banknote },
  BCA: { accent: "#4D7FB0", icon: Landmark },
  Mandiri: { accent: "#3F9E8A", icon: Landmark },
  BNI: { accent: "#D9772E", icon: Landmark },
};
const INCOME_CATEGORIES = [
  "Rental", "Photographer", "Wasit", "Recording", "New Member",
  "Sewa Rompi", "Fee Samkot", "Event/Turnamen", "Sponsor", "Lainnya",
];
const EXPENSE_CATEGORIES = [
  "Gaji Karyawan", "Cleaning Service", "Fee Photographer", "Listrik", "Air",
  "Solar", "Alat Kebersihan", "Stock Bola", "Maintenance", "Wifi",
  "Telkomsel", "Marketing", "Pajak", "Bonus/Insentif/THR", "Other Expenses", "Lainnya",
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
const STATUS_OPTIONS = ["Lunas", "DP", "Belum Lunas"];
const STATUS_META = {
  Lunas: { color: "#4CAF61" },
  DP: { color: "#C9A227" },
  "Belum Lunas": { color: "#D1574A" },
};
const DEFAULT_RECURRING_CATEGORIES = ["Gaji Karyawan", "Listrik", "Air", "Wifi", "Telkomsel", "Pajak"];
const PIUTANG_CATEGORIES = ["Owner", "PT / Perusahaan Lain"];

function formatRupiah(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  return sign + "Rp" + Math.round(Math.abs(num)).toLocaleString("id-ID");
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function timeAgo(date) {
  if (!date) return "belum pernah";
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 10) return "baru saja";
  if (sec < 60) return sec + " detik lalu";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + " menit lalu";
  const hr = Math.floor(min / 60);
  return hr + " jam lalu";
}
function computeBalanceAsOf(transactions, initialBalances, dateStr) {
  const bal = { ...initialBalances };
  transactions.forEach((t) => {
    if (t.date > dateStr) return;
    if (t.type === "income") {
      if (t.splits && t.splits.length) t.splits.forEach((s) => { bal[s.method] = (bal[s.method] || 0) + s.amount; });
      else bal[t.method] = (bal[t.method] || 0) + t.amount;
    } else if (t.type === "expense" || t.type === "prive" || t.type === "piutang_keluar") {
      if (t.splits && t.splits.length) t.splits.forEach((s) => { bal[s.method] = (bal[s.method] || 0) - s.amount; });
      else bal[t.method] = (bal[t.method] || 0) - t.amount;
    } else if (t.type === "piutang_balik") {
      bal[t.method] = (bal[t.method] || 0) + t.amount;
    } else if (t.type === "transfer") {
      bal[t.fromMethod] = (bal[t.fromMethod] || 0) - t.amount;
      bal[t.toMethod] = (bal[t.toMethod] || 0) + t.amount;
    }
  });
  return bal;
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [initialBalances, setInitialBalances] = useState({ Cash: 0, BCA: 0, Mandiri: 0, BNI: 0 });
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [recurringCategories, setRecurringCategories] = useState(DEFAULT_RECURRING_CATEGORIES);
  const [reconciliations, setReconciliations] = useState([]);
  const [lastSynced, setLastSynced] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showReconModal, setShowReconModal] = useState(false);
  const [showLunasModal, setShowLunasModal] = useState(false);
  const [selectedPiutang, setSelectedPiutang] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [actuals, setActuals] = useState({ Cash: "", BCA: "", Mandiri: "", BNI: "" });
  const [templates, setTemplates] = useState([]);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [prefillData, setPrefillData] = useState(null);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const modalOpenRef = useRef(false);
  useEffect(() => {
    modalOpenRef.current = showForm || showSettings || showReconModal || showLunasModal || showTemplateManager || !!confirmDelete;
  }, [showForm, showSettings, showReconModal, confirmDelete]);

  const loadData = useCallback(async (isInitial) => {
    if (!isInitial) setSyncing(true);
    try {
      const res = await window.storage.get(STORAGE_KEY, true);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        setTransactions(Array.isArray(parsed.transactions) ? parsed.transactions : []);
        setInitialBalances(parsed.initialBalances || { Cash: 0, BCA: 0, Mandiri: 0, BNI: 0 });
        setMonthlyTarget(typeof parsed.monthlyTarget === "number" ? parsed.monthlyTarget : 0);
        setRecurringCategories(Array.isArray(parsed.recurringCategories) ? parsed.recurringCategories : DEFAULT_RECURRING_CATEGORIES);
        setReconciliations(Array.isArray(parsed.reconciliations) ? parsed.reconciliations : []);
        // Load templates dari shared storage terpisah
        try {
          const tplRes = await window.storage.get(TEMPLATES_KEY, true);
          if (tplRes && tplRes.value) setTemplates(JSON.parse(tplRes.value));
        } catch (e) { /* belum ada template */ }
      }
      setLastSynced(new Date());
      setErrorMsg("");
    } catch (e) {
      if (isInitial) {
        setTransactions([]);
        setInitialBalances({ Cash: 0, BCA: 0, Mandiri: 0, BNI: 0 });
      }
    } finally {
      if (isInitial) setLoaded(true);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => {
      if (!modalOpenRef.current) loadData(false);
    }, 25000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    setSelectedMonth(null);
  }, [selectedYear]);

  const persist = useCallback(async (data) => {
    setSyncing(true);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(data), true);
      setLastSynced(new Date());
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("Gagal menyimpan data. Periksa koneksi lalu coba lagi.");
    } finally {
      setSyncing(false);
    }
  }, []);

  const handleSaveTransaction = (tx) => {
    setTransactions((prev) => {
      const exists = prev.some((t) => t.id === tx.id);
      const next = exists ? prev.map((t) => (t.id === tx.id ? tx : t)) : [...prev, tx];
      persist({ transactions: next, initialBalances, reconciliations, monthlyTarget, recurringCategories });
      return next;
    });
    setShowForm(false);
    setEditingTx(null);
  };

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === "transaction") {
      setTransactions((prev) => {
        const next = prev.filter((t) => t.id !== confirmDelete.id);
        persist({ transactions: next, initialBalances, reconciliations, monthlyTarget, recurringCategories });
        return next;
      });
    } else if (confirmDelete.type === "reconciliation") {
      setReconciliations((prev) => {
        const next = prev.filter((r) => r.id !== confirmDelete.id);
        persist({ transactions, initialBalances, reconciliations: next, monthlyTarget, recurringCategories });
        return next;
      });
    }
    setConfirmDelete(null);
  };

  const handleSaveSettings = (nextBalances, nextTarget, nextRecurring) => {
    setInitialBalances(nextBalances);
    setMonthlyTarget(nextTarget);
    setRecurringCategories(nextRecurring);
    persist({ transactions, initialBalances: nextBalances, reconciliations, monthlyTarget: nextTarget, recurringCategories: nextRecurring });
    setShowSettings(false);
  };

  const handleSaveReconciliation = (entry) => {
    setReconciliations((prev) => {
      const next = [...prev, entry];
      persist({ transactions, initialBalances, reconciliations: next, monthlyTarget, recurringCategories });
      return next;
    });
    setShowReconModal(false);
  };

  const handleTandaiLunas = (piutang, pelunasanData) => {
    setTransactions((prev) => {
      const pelunasanId = uid();
      const pelunasanTx = {
        id: pelunasanId,
        type: "income",
        date: pelunasanData.date,
        amount: piutang.sisa,
        category: piutang.category,
        entity: piutang.entity || "",
        status: "Lunas",
        note: "Pelunasan otomatis dari panel Piutang Aktif",
        recordedBy: pelunasanData.recordedBy || "",
        ...(pelunasanData.splitMode
          ? { splits: pelunasanData.splits }
          : { method: pelunasanData.method }),
      };
      const updated = prev.map((t) =>
        t.id === piutang.id ? { ...t, status: "Lunas" } : t
      );
      const next = [...updated, pelunasanTx];
      persist({ transactions: next, initialBalances, reconciliations, monthlyTarget, recurringCategories });
      return next;
    });
    setShowLunasModal(false);
    setSelectedPiutang(null);
  };

  const persistTemplates = async (nextTemplates) => {
    try {
      await window.storage.set(TEMPLATES_KEY, JSON.stringify(nextTemplates), true);
      setTemplates(nextTemplates);
    } catch (e) {
      setErrorMsg("Gagal menyimpan template.");
    }
  };

  const handleSaveTemplate = (tpl) => {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === tpl.id);
      const next = exists ? prev.map((t) => (t.id === tpl.id ? tpl : t)) : [...prev, tpl];
      persistTemplates(next);
      return next;
    });
  };

  const handleDeleteTemplate = (id) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      persistTemplates(next);
      return next;
    });
  };

  const openWithPrefill = (data) => {
    setPrefillData(data);
    setEditingTx(null);
    setShowForm(true);
  };

  const handleExport = () => {
    const txRows = transactions.length
      ? transactions.map((t) => ({
          Tanggal: t.date,
          Tipe: t.type,
          Kategori: t.category || "",
          "Dari/Kantong": t.type === "transfer"
            ? t.fromMethod
            : t.splits && t.splits.length
            ? t.splits.map((s) => `${s.method}:${s.amount}`).join(" | ")
            : t.method || "",
          "Ke Kantong": t.type === "transfer" ? t.toMethod : "",
          Status: t.status || "",
          "Klien/Entitas": t.entity || "",
          "Durasi (Jam)": t.duration || "",
          Promo: t.promo || "",
          Jumlah: t.amount,
          Catatan: t.note || "",
          "Dicatat Oleh": t.recordedBy || "",
        }))
      : [{ Catatan: "Belum ada transaksi" }];

    const reconRows = reconciliations.length
      ? reconciliations.map((r) => ({
          Tanggal: r.date,
          "Cash Sistem": r.perMethod.Cash.system,
          "Cash Aktual": r.perMethod.Cash.actual,
          "Cash Selisih": r.perMethod.Cash.diff,
          "BCA Sistem": r.perMethod.BCA.system,
          "BCA Aktual": r.perMethod.BCA.actual,
          "BCA Selisih": r.perMethod.BCA.diff,
          "Mandiri Sistem": r.perMethod.Mandiri.system,
          "Mandiri Aktual": r.perMethod.Mandiri.actual,
          "Mandiri Selisih": r.perMethod.Mandiri.diff,
          "BNI Sistem": r.perMethod.BNI.system,
          "BNI Aktual": r.perMethod.BNI.actual,
          "BNI Selisih": r.perMethod.BNI.diff,
          "Total Selisih": r.totalDiff,
          "Dicatat Oleh": r.recordedBy || "",
          Catatan: r.note || "",
        }))
      : [{ Catatan: "Belum ada rekonsiliasi" }];

    const summaryRows = [
      ...monthlyData.map((r) => ({ Bulan: r.label, Income: r.income, Expense: r.expense, Profit: r.profit })),
      { Bulan: "TOTAL", Income: yearTotals.income, Expense: yearTotals.expense, Profit: yearTotals.profit },
    ];

    const piutangRows = piutangNonBisnisList.length
      ? piutangNonBisnisList.map((e) => ({
          Entitas: e.name,
          Kategori: e.category,
          "Total Keluar": e.keluar,
          "Total Kembali": e.balik,
          "Sisa Piutang": Math.max(0, e.sisa),
          Status: e.sisa <= 0 ? "Lunas" : "Belum Lunas",
        }))
      : [{ Catatan: "Tidak ada piutang non-bisnis" }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), "Transaksi");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(piutangRows), "Piutang Non-Bisnis");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reconRows), "Rekonsiliasi");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), `Ringkasan ${selectedYear}`);
    XLSX.writeFile(wb, `V3BKS-Rekap-Saldo-${todayISO()}.xlsx`);
  };

  const years = useMemo(() => {
    const set = new Set(transactions.map((t) => new Date(t.date).getFullYear()));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [transactions]);

  const dashboardAsOfDate = useMemo(() => {
    const now = new Date();
    if (selectedMonth !== null) {
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      return `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
    if (selectedYear === now.getFullYear()) return todayISO();
    return `${selectedYear}-12-31`;
  }, [selectedYear, selectedMonth]);

  const balances = useMemo(
    () => computeBalanceAsOf(transactions, initialBalances, dashboardAsOfDate),
    [transactions, initialBalances, dashboardAsOfDate]
  );  const totalSaldo = useMemo(
    () => METHODS.reduce((sum, m) => sum + (balances[m] || 0), 0),
    [balances]
  );

  const initialBalancesTotal = useMemo(
    () => METHODS.reduce((sum, m) => sum + (initialBalances[m] || 0), 0),
    [initialBalances]
  );

  const saldoBersih = totalSaldo - initialBalancesTotal;

  const cekSaldoResult = useMemo(() => {
    const currentBalances = computeBalanceAsOf(transactions, initialBalances, todayISO());
    return METHODS.map((m) => {
      const sistem = currentBalances[m] || 0;
      const rawActual = actuals[m];
      const hasInput = rawActual !== "" && rawActual !== null && rawActual !== undefined;
      const aktual = hasInput ? (parseFloat(rawActual) || 0) : null;
      const diff = aktual !== null ? aktual - sistem : null;
      return { method: m, sistem, aktual, diff, hasInput };
    });
  }, [transactions, initialBalances, actuals]);

  const cekSaldoTotalDiff = useMemo(
    () => cekSaldoResult.filter((r) => r.hasInput).reduce((sum, r) => sum + (r.diff || 0), 0),
    [cekSaldoResult]
  );
  const cekSaldoInputCount = cekSaldoResult.filter((r) => r.hasInput).length;
  const cekSaldoHasSelisih = cekSaldoResult.some((r) => r.hasInput && Math.round(r.diff) !== 0);

  const monthlyData = useMemo(() => {
    const rows = MONTHS.map((label, idx) => ({ idx, label, income: 0, expense: 0 }));
    transactions.forEach((t) => {
      if (t.type === "transfer") return;
      const d = new Date(t.date);
      if (d.getFullYear() !== selectedYear) return;
      const m = d.getMonth();
      if (t.type === "income") rows[m].income += t.amount;
      else if (t.type === "expense") rows[m].expense += t.amount;
    });
    return rows.map((r) => ({
      ...r,
      profit: r.income - r.expense,
      targetPct: monthlyTarget > 0 ? Math.round((r.income / monthlyTarget) * 100) : null,
    }));
  }, [transactions, selectedYear, monthlyTarget]);

  const yearTargetProgress = useMemo(() => {
    if (monthlyTarget <= 0) return null;
    const now = new Date();
    const monthsElapsed =
      selectedYear < now.getFullYear() ? 12 : selectedYear === now.getFullYear() ? now.getMonth() + 1 : 0;
    if (monthsElapsed <= 0) return null;
    const targetSoFar = monthlyTarget * monthsElapsed;
    const incomeSoFar = monthlyData.slice(0, monthsElapsed).reduce((sum, r) => sum + r.income, 0);
    return { pct: Math.round((incomeSoFar / targetSoFar) * 100), monthsElapsed };
  }, [monthlyTarget, monthlyData, selectedYear]);

  const yearTotals = useMemo(
    () =>
      monthlyData.reduce(
        (acc, r) => ({
          income: acc.income + r.income,
          expense: acc.expense + r.expense,
          profit: acc.profit + r.profit,
        }),
        { income: 0, expense: 0, profit: 0 }
      ),
    [monthlyData]
  );

  const maxAbsProfit = useMemo(
    () => Math.max(1, ...monthlyData.map((r) => Math.abs(r.profit))),
    [monthlyData]
  );

  const todayStr = todayISO();
  const currentMonthKey = todayStr.slice(0, 7);
  const missingRecurring = useMemo(() => {
    const presentCategories = new Set(
      transactions
        .filter((t) => t.type === "expense" && t.date.slice(0, 7) === currentMonthKey)
        .map((t) => t.category)
    );
    return recurringCategories.filter((c) => !presentCategories.has(c));
  }, [transactions, recurringCategories, currentMonthKey]);

  const todayRecon = useMemo(() => {
    const todays = reconciliations.filter((r) => r.date === todayStr);
    if (todays.length === 0) return null;
    return todays.reduce((latest, r) => (r.timestamp > latest.timestamp ? r : latest), todays[0]);
  }, [reconciliations, todayStr]);

  const yearReconciliations = useMemo(
    () =>
      reconciliations
        .filter((r) => new Date(r.date).getFullYear() === selectedYear)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.timestamp - a.timestamp)),
    [reconciliations, selectedYear]
  );

  const reconStats = useMemo(() => {
    const withDiff = yearReconciliations.filter((r) => Math.round(r.totalDiff) !== 0).length;
    return { total: yearReconciliations.length, withDiff };
  }, [yearReconciliations]);

  const periodTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.date);
      if (d.getFullYear() !== selectedYear) return false;
      if (selectedMonth !== null && d.getMonth() !== selectedMonth) return false;
      return true;
    });
  }, [transactions, selectedYear, selectedMonth]);

  const periodIncome = useMemo(
    () => periodTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0),
    [periodTransactions]
  );
  const taxEstimate = periodIncome * 0.005;

  const periodRentalIncome = useMemo(
    () =>
      periodTransactions
        .filter((t) => t.type === "income" && t.category === "Rental")
        .reduce((sum, t) => sum + t.amount, 0),
    [periodTransactions]
  );
  const taxDaerahEstimate = periodRentalIncome * 0.1;

  const durationBreakdown = useMemo(() => {
    const map = {};
    periodTransactions.forEach((t) => {
      if (t.type !== "income" || !t.duration) return;
      const key = t.duration;
      if (!map[key]) map[key] = { duration: key, count: 0, amount: 0 };
      map[key].count += 1;
      map[key].amount += t.amount;
    });
    return Object.values(map).sort((a, b) => a.duration - b.duration);
  }, [periodTransactions]);

  const existingPromos = useMemo(
    () => Array.from(new Set(transactions.filter((t) => t.promo).map((t) => t.promo))).sort(),
    [transactions]
  );

  const promoBreakdown = useMemo(() => {
    const map = {};
    periodTransactions.forEach((t) => {
      if (t.type !== "income" || t.category !== "Rental" || !t.promo) return;
      if (!map[t.promo]) map[t.promo] = { promo: t.promo, count: 0, amount: 0, clients: new Set() };
      map[t.promo].count += 1;
      map[t.promo].amount += t.amount;
      if (t.entity) map[t.promo].clients.add(t.entity);
    });
    return Object.values(map)
      .map((p) => ({ ...p, clients: Array.from(p.clients) }))
      .sort((a, b) => b.count - a.count);
  }, [periodTransactions]);

  const periodPrive = useMemo(
    () => periodTransactions.filter((t) => t.type === "prive").reduce((sum, t) => sum + t.amount, 0),
    [periodTransactions]
  );

  const categoryBreakdown = useMemo(() => {
    const income = {};
    const expense = {};
    periodTransactions.forEach((t) => {
      if (t.type === "income") income[t.category] = (income[t.category] || 0) + t.amount;
      else if (t.type === "expense") expense[t.category] = (expense[t.category] || 0) + t.amount;
    });
    const toSorted = (obj) =>
      Object.entries(obj)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);
    return { income: toSorted(income), expense: toSorted(expense) };
  }, [periodTransactions]);

  const topClients = useMemo(() => {
    const map = {};
    periodTransactions.forEach((t) => {
      if (t.type !== "income" || t.category !== "Rental") return;
      const key = (t.entity || "").trim();
      if (!key) return;
      const normKey = key.toLowerCase();
      if (!map[normKey]) map[normKey] = { name: key, total: 0, count: 0 };
      map[normKey].total += t.amount;
      map[normKey].count += 1;
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [periodTransactions]);

  const openItems = useMemo(() => {
    let count = 0;
    let amount = 0;
    periodTransactions.forEach((t) => {
      if (t.type !== "transfer" && t.status && t.status !== "Lunas") {
        count += 1;
        amount += t.amount;
      }
    });
    return { count, amount };
  }, [periodTransactions]);

  const todaySummary = useMemo(() => {
    const todayTxs = transactions
      .filter((t) => t.date === todayStr)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const income = todayTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = todayTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const prive = todayTxs.filter((t) => t.type === "prive").reduce((s, t) => s + t.amount, 0);
    const transfer = todayTxs.filter((t) => t.type === "transfer").length;
    return { txs: todayTxs, income, expense, prive, transfer };
  }, [transactions, todayStr]);

  const piutangList = useMemo(() => {
    return transactions
      .filter((t) =>
        t.type === "income" &&
        t.status !== "Lunas" &&
        t.totalKontrak > 0 &&
        t.totalKontrak > t.amount
      )
      .map((t) => ({
        ...t,
        sisa: t.totalKontrak - t.amount,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [transactions]);

  const totalPiutang = piutangList.reduce((sum, p) => sum + p.sisa, 0);

  const piutangNonBisnisList = useMemo(() => {
    const map = {};
    transactions.forEach((t) => {
      if (t.type !== "piutang_keluar" && t.type !== "piutang_balik") return;
      const key = (t.entity || "—").trim().toLowerCase();
      if (!map[key]) map[key] = { name: (t.entity || "—").trim(), category: t.category || "", keluar: 0, balik: 0, txs: [] };
      if (t.type === "piutang_keluar") map[key].keluar += t.amount;
      if (t.type === "piutang_balik") map[key].balik += t.amount;
      map[key].txs.push(t);
    });
    return Object.values(map)
      .map((e) => ({ ...e, sisa: e.keluar - e.balik }))
      .sort((a, b) => b.sisa - a.sisa);
  }, [transactions]);

  const totalPiutangNonBisnis = piutangNonBisnisList.reduce((sum, e) => sum + e.sisa, 0);
  const totalPiutangNonBisnisKeluar = piutangNonBisnisList.reduce((sum, e) => sum + e.keluar, 0);

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((t) => {
        if (dateFrom && t.date < dateFrom) return false;
        if (dateTo && t.date > dateTo) return false;
        if (filterType !== "all" && t.type !== filterType) return false;
        if (filterStatus !== "all" && t.status !== filterStatus) return false;
        if (filterCategory !== "all" && t.category !== filterCategory) return false;
        if (filterMethod !== "all") {
          const matchesSplit = t.splits && t.splits.some((s) => s.method === filterMethod);
          const matchesSingle = t.method === filterMethod || t.fromMethod === filterMethod || t.toMethod === filterMethod;
          if (!matchesSplit && !matchesSingle) return false;
        }
        if (searchTerm) {
          const splitMethods = t.splits && t.splits.length ? t.splits.map((s) => s.method).join(" ") : "";
          const hay = `${t.category || ""} ${t.entity || ""} ${t.note || ""} ${t.method || ""} ${t.fromMethod || ""} ${t.toMethod || ""} ${t.recordedBy || ""} ${t.promo || ""} ${splitMethods}`.toLowerCase();
          if (!hay.includes(searchTerm.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, dateFrom, dateTo, filterType, filterStatus, filterCategory, filterMethod, searchTerm]);

  const allCategories = useMemo(
    () => Array.from(new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES])),
    []
  );

  const hasActiveFilters = dateFrom || dateTo || filterType !== "all" || filterStatus !== "all" || filterCategory !== "all" || filterMethod !== "all" || searchTerm;
  const resetFilters = () => {
    setDateFrom("");
    setDateTo("");
    setFilterType("all");
    setFilterStatus("all");
    setFilterCategory("all");
    setFilterMethod("all");
    setSearchTerm("");
  };

  if (!loaded) {
    return (
      <div className="v3-root" style={{ minHeight: "100vh" }}>
        <style>{FONT_IMPORTS}</style>
        <div className="flex items-center justify-center" style={{ height: "100vh" }}>
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="v3-gold animate-spin" size={28} />
            <p className="v3-muted text-sm">Memuat data saldo...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="v3-root" style={{ minHeight: "100vh", paddingBottom: "6rem" }}>
      <style>{CSS}</style>

      {/* Header */}
      <div className="v3-surface" style={{ position: "sticky", top: 0, zIndex: 30, borderBottom: "1px solid rgba(201,162,39,0.18)" }}>
        <div className="flex items-center justify-between px-4 py-3 md:px-6">
          <div>
            <p className="v3-display v3-gold" style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: "0.04em" }}>V3BKS</p>
            <p className="v3-muted" style={{ fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "-2px" }}>
              Rekap Saldo Real
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(false)}
              className="v3-surface-alt flex items-center justify-center"
              style={{ width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(201,162,39,0.2)" }}
              aria-label="Sinkronkan data"
              title="Sinkronkan data"
            >
              <RefreshCw className="v3-muted" size={16} style={syncing ? { animation: "spin 0.8s linear infinite" } : {}} />
            </button>
            <button
              onClick={handleExport}
              className="v3-surface-alt flex items-center justify-center"
              style={{ width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(201,162,39,0.2)" }}
              aria-label="Export ke Excel"
              title="Export ke Excel"
            >
              <Download className="v3-muted" size={16} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="v3-surface-alt flex items-center justify-center"
              style={{ width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(201,162,39,0.2)" }}
              aria-label="Pengaturan"
              title="Pengaturan"
            >
              <Settings className="v3-muted" size={16} />
            </button>
            <button
              onClick={() => { setEditingTx(null); setShowForm(true); }}
              className="v3-gold-bg hidden md:flex items-center gap-1.5"
              style={{ borderRadius: 999, padding: "0.55rem 1rem", fontWeight: 600, fontSize: "0.85rem" }}
            >
              <Plus size={16} /> Tambah Transaksi
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 px-4 py-2 md:px-6" style={{ background: "rgba(209,87,74,0.12)", color: "#D1574A", fontSize: "0.8rem" }}>
          <AlertCircle size={14} /> {errorMsg}
        </div>
      )}

      <div className="px-4 py-5 md:px-6" style={{ maxWidth: 1100, margin: "0 auto" }}>
        {activeTab === "dashboard" && (
          <>
        {/* Quick Actions */}
        <div className="flex gap-2" style={{ marginBottom: "0.9rem" }}>
          <button
            onClick={() => openWithPrefill({ type: "transfer", fromMethod: "Cash" })}
            className="v3-surface flex items-center gap-1.5"
            style={{ flex: 1, borderRadius: 12, padding: "0.65rem 0.8rem", border: "1.5px solid rgba(201,162,39,0.25)" }}
          >
            <Zap size={15} className="v3-gold" />
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Setor Tunai</span>
          </button>
          <button
            onClick={() => setShowTemplateManager(true)}
            className="v3-surface flex items-center gap-1.5"
            style={{ flex: 1, borderRadius: 12, padding: "0.65rem 0.8rem", border: "1.5px solid rgba(201,162,39,0.25)" }}
          >
            <FileText size={15} className="v3-gold" />
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>Template</span>
          </button>
        </div>

        {/* Ringkasan Harian */}
        <div className="v3-surface" style={{ borderRadius: 16, padding: "1rem 1.1rem", marginBottom: "0.9rem" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: "0.5rem" }}>
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="v3-gold" />
              <p className="v3-display" style={{ fontSize: "0.88rem", fontWeight: 600 }}>Hari Ini · {todayStr}</p>
            </div>
            <span className="v3-muted" style={{ fontSize: "0.72rem" }}>{todaySummary.txs.length} transaksi</span>
          </div>

          {todaySummary.txs.length === 0 ? (
            <p className="v3-muted" style={{ fontSize: "0.78rem" }}>Belum ada transaksi hari ini.</p>
          ) : (
            <>
              <div className="flex gap-2" style={{ marginBottom: "0.6rem", flexWrap: "wrap" }}>
                {todaySummary.income > 0 && (
                  <span className="v3-mono v3-surface-alt" style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem", borderRadius: 999 }}>
                    <span className="v3-green">+{formatRupiah(todaySummary.income)}</span>
                  </span>
                )}
                {todaySummary.expense > 0 && (
                  <span className="v3-mono v3-surface-alt" style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem", borderRadius: 999 }}>
                    <span className="v3-red">-{formatRupiah(todaySummary.expense)}</span>
                  </span>
                )}
                {todaySummary.prive > 0 && (
                  <span className="v3-mono v3-surface-alt" style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem", borderRadius: 999 }}>
                    <span className="v3-gold">Prive {formatRupiah(todaySummary.prive)}</span>
                  </span>
                )}
                {todaySummary.transfer > 0 && (
                  <span className="v3-mono v3-surface-alt" style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem", borderRadius: 999, color: "#8A9099" }}>
                    {todaySummary.transfer} transfer
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {todaySummary.txs.slice(0, 6).map((t) => {
                  const isIncome = t.type === "income";
                  const isExpense = t.type === "expense";
                  const isPrive = t.type === "prive";
                  const isTransfer = t.type === "transfer";
                  const color = isIncome ? "#4CAF61" : isExpense ? "#D1574A" : "#C9A227";
                  const label = isTransfer ? `${t.fromMethod}→${t.toMethod}` : isPrive ? "Prive" : t.category;
                  const kantong = isTransfer ? "" : t.splits && t.splits.length ? t.splits.map((s) => s.method).join("+") : t.method;
                  return (
                    <div key={t.id} className="flex items-center justify-between">
                      <span style={{ fontSize: "0.72rem" }}>
                        {label}{t.entity ? ` · ${t.entity}` : ""}{kantong ? ` · ${kantong}` : ""}
                      </span>
                      <span className="v3-mono" style={{ fontSize: "0.72rem", color, flexShrink: 0, marginLeft: "0.5rem" }}>
                        {isExpense || isPrive ? "-" : isIncome ? "+" : ""}{formatRupiah(t.amount)}
                      </span>
                    </div>
                  );
                })}
                {todaySummary.txs.length > 6 && (
                  <button
                    onClick={() => setActiveTab("transaksi")}
                    className="v3-muted"
                    style={{ fontSize: "0.7rem", textAlign: "left", marginTop: "0.2rem" }}
                  >
                    +{todaySummary.txs.length - 6} lainnya → lihat di tab Transaksi
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Pilih Periode */}
        <div className="flex items-center justify-between" style={{ marginBottom: "0.6rem" }}>
          <p className="v3-muted" style={{ fontSize: "0.72rem" }}>Lihat saldo per periode</p>
          <div className="flex gap-1.5">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="v3-input"
              style={{ borderRadius: 8, padding: "0.35rem 0.5rem", fontSize: "0.78rem" }}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={selectedMonth === null ? "all" : selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value === "all" ? null : Number(e.target.value))}
              className="v3-input"
              style={{ borderRadius: 8, padding: "0.35rem 0.5rem", fontSize: "0.78rem" }}
            >
              <option value="all">Saat Ini</option>
              {MONTHS.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* Total saldo */}
        <div className="v3-surface" style={{ borderRadius: 18, padding: "1.25rem 1.4rem", marginBottom: "0.9rem" }}>
          <p className="v3-muted" style={{ fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Total Saldo Real{selectedMonth !== null ? " · " + MONTHS[selectedMonth] + " " + selectedYear : ""}
          </p>
          <p className="v3-mono v3-gold" style={{ fontSize: "2rem", fontWeight: 600, marginTop: "0.2rem" }}>
            {formatRupiah(totalSaldo)}
          </p>
          <div style={{ height: 1, background: "rgba(201,162,39,0.15)", margin: "0.6rem 0" }} />
          <p className="v3-muted" style={{ fontSize: "0.72rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Saldo Bersih (Saldo Real &minus; Modal Awal)
          </p>
          <p className={"v3-mono " + (saldoBersih >= 0 ? "v3-green" : "v3-red")} style={{ fontSize: "1.3rem", fontWeight: 600, marginTop: "0.15rem" }}>
            {formatRupiah(saldoBersih)}
          </p>
          <p className="v3-muted" style={{ fontSize: "0.72rem", marginTop: "0.5rem" }}>
            Disinkron {timeAgo(lastSynced)} &middot; data ini bisa dilihat & diubah siapa pun yang punya link
          </p>
        </div>

        {/* Per-kantong balances */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ marginBottom: "1.4rem" }}>
          {METHODS.map((m) => {
            const Icon = METHOD_META[m].icon;
            return (
              <div key={m} className="v3-surface" style={{ borderRadius: 14, overflow: "hidden" }}>
                <div style={{ height: 4, background: METHOD_META[m].accent }} />
                <div style={{ padding: "0.8rem 0.9rem" }}>
                  <div className="flex items-center gap-1.5" style={{ marginBottom: "0.4rem" }}>
                    <Icon size={14} style={{ color: METHOD_META[m].accent }} />
                    <span className="v3-muted" style={{ fontSize: "0.75rem", fontWeight: 600 }}>{m}</span>
                  </div>
                  <p className="v3-mono" style={{ fontSize: "1.05rem", fontWeight: 600 }}>
                    {formatRupiah(balances[m] || 0)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Piutang Aktif */}
        <div className="v3-surface" style={{ borderRadius: 16, padding: "1.1rem 1.2rem", marginBottom: "1.4rem" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: "0.5rem" }}>
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={15} style={{ color: piutangList.length > 0 ? "#D1574A" : "#8A9099" }} />
              <p className="v3-display" style={{ fontSize: "0.95rem", fontWeight: 600, letterSpacing: "0.03em" }}>
                Piutang Aktif
              </p>
            </div>
            {piutangList.length > 0 && (
              <span className="v3-mono" style={{ fontSize: "0.78rem", fontWeight: 700, color: "#D1574A" }}>
                {formatRupiah(totalPiutang)}
              </span>
            )}
          </div>

          {piutangList.length === 0 ? (
            <div className="flex items-center gap-2" style={{ background: "rgba(76,175,97,0.1)", borderRadius: 10, padding: "0.6rem 0.8rem" }}>
              <CheckCircle2 size={14} className="v3-green" />
              <p style={{ fontSize: "0.78rem" }}>Tidak ada piutang aktif. Semua kontrak sudah lunas.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {piutangList.map((p) => (
                <div key={p.id} className="v3-surface-alt" style={{ borderRadius: 10, padding: "0.6rem 0.75rem", borderLeft: "3px solid #D1574A" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        {p.entity || p.category}
                      </p>
                      <p className="v3-muted" style={{ fontSize: "0.68rem" }}>
                        {p.date} · {p.category} · {p.status}
                      </p>
                      <div className="flex gap-2" style={{ marginTop: "0.25rem", flexWrap: "wrap" }}>
                        <span className="v3-mono" style={{ fontSize: "0.7rem", color: "#8A9099" }}>
                          Sudah masuk: <span style={{ color: "#4CAF61" }}>{formatRupiah(p.amount)}</span>
                        </span>
                        <span className="v3-mono" style={{ fontSize: "0.7rem" }}>
                          Sisa: <span style={{ color: "#D1574A", fontWeight: 700 }}>{formatRupiah(p.sisa)}</span>
                        </span>
                        <span className="v3-mono" style={{ fontSize: "0.7rem", color: "#8A9099" }}>
                          Total: {formatRupiah(p.totalKontrak)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedPiutang(p); setShowLunasModal(true); }}
                      className="v3-gold-bg"
                      style={{ borderRadius: 8, padding: "0.35rem 0.7rem", fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                      Tandai Lunas
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Piutang Non-Bisnis */}
        <div className="v3-surface" style={{ borderRadius: 16, padding: "1.1rem 1.2rem", marginBottom: "1.4rem" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: "0.5rem" }}>
            <div className="flex items-center gap-1.5">
              <HandCoins size={15} style={{ color: totalPiutangNonBisnis > 0 ? "#C9A227" : "#8A9099" }} />
              <p className="v3-display" style={{ fontSize: "0.95rem", fontWeight: 600, letterSpacing: "0.03em" }}>
                Piutang Non-Bisnis
              </p>
            </div>
            {totalPiutangNonBisnis > 0 && (
              <div style={{ textAlign: "right" }}>
                <p className="v3-mono v3-gold" style={{ fontSize: "0.78rem", fontWeight: 700 }}>
                  {formatRupiah(totalPiutangNonBisnis)}
                </p>
                <p className="v3-muted" style={{ fontSize: "0.65rem" }}>belum kembali</p>
              </div>
            )}
          </div>

          <p className="v3-muted" style={{ fontSize: "0.7rem", marginBottom: "0.6rem" }}>
            Uang yang dipinjamkan ke owner/PT lain. Tidak dihitung sebagai expense bisnis.
          </p>

          {piutangNonBisnisList.length === 0 ? (
            <div className="flex items-center gap-2" style={{ background: "rgba(76,175,97,0.1)", borderRadius: 10, padding: "0.6rem 0.8rem" }}>
              <CheckCircle2 size={14} className="v3-green" />
              <p style={{ fontSize: "0.78rem" }}>Tidak ada piutang non-bisnis aktif.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {piutangNonBisnisList.map((e) => {
                const lunas = e.sisa <= 0;
                return (
                  <div
                    key={e.name}
                    className="v3-surface-alt"
                    style={{ borderRadius: 10, padding: "0.65rem 0.75rem", borderLeft: `3px solid ${lunas ? "#4CAF61" : "#C9A227"}` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center gap-1.5">
                          <p style={{ fontSize: "0.82rem", fontWeight: 600 }}>{e.name}</p>
                          {e.category && (
                            <span className="v3-muted" style={{ fontSize: "0.65rem", padding: "0.05rem 0.4rem", borderRadius: 999, background: "rgba(255,255,255,0.07)" }}>
                              {e.category}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3" style={{ marginTop: "0.3rem", flexWrap: "wrap" }}>
                          <span className="v3-mono" style={{ fontSize: "0.68rem", color: "#D1574A" }}>
                            Keluar: {formatRupiah(e.keluar)}
                          </span>
                          <span className="v3-mono" style={{ fontSize: "0.68rem", color: "#4CAF61" }}>
                            Kembali: {formatRupiah(e.balik)}
                          </span>
                          <span className="v3-mono" style={{ fontSize: "0.68rem", fontWeight: 700, color: lunas ? "#4CAF61" : "#C9A227" }}>
                            Sisa: {formatRupiah(Math.max(0, e.sisa))}
                          </span>
                        </div>
                      </div>
                      {!lunas && (
                        <button
                          onClick={() => openWithPrefill({ type: "piutang_balik", entity: e.name, category: e.category })}
                          className="v3-surface"
                          style={{ borderRadius: 8, padding: "0.3rem 0.65rem", fontSize: "0.7rem", fontWeight: 700, border: "1px solid rgba(201,162,39,0.4)", color: "#C9A227", whiteSpace: "nowrap", flexShrink: 0 }}
                        >
                          Catat Kembali
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => openWithPrefill({ type: "piutang_keluar" })}
            className="v3-surface-alt flex items-center justify-center gap-1.5"
            style={{ borderRadius: 10, padding: "0.5rem 0", fontWeight: 600, fontSize: "0.78rem", width: "100%", marginTop: "0.8rem" }}
          >
            <Plus size={13} /> Catat Piutang Baru
          </button>
        </div>

        {/* Rekonsiliasi Kas Harian */}
        <div className="v3-surface" style={{ borderRadius: 16, padding: "1.1rem 1.2rem", marginBottom: "1.4rem" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: "0.7rem" }}>
            <p className="v3-display" style={{ fontSize: "0.95rem", fontWeight: 600, letterSpacing: "0.03em" }}>
              Rekonsiliasi Kas Harian
            </p>
            <button
              onClick={() => setShowReconModal(true)}
              className="v3-surface-alt flex items-center gap-1.5"
              style={{ borderRadius: 999, padding: "0.4rem 0.8rem", fontSize: "0.75rem", fontWeight: 600 }}
            >
              <ClipboardCheck size={13} /> Cek Kas
            </button>
          </div>

          {todayRecon ? (
            Math.round(todayRecon.totalDiff) === 0 ? (
              <div className="flex items-center gap-2" style={{ background: "rgba(76,175,97,0.12)", borderRadius: 10, padding: "0.6rem 0.8rem" }}>
                <CheckCircle2 size={16} className="v3-green" style={{ flexShrink: 0 }} />
                <p style={{ fontSize: "0.8rem" }}>Kas hari ini sudah cocok dengan sistem.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2" style={{ background: "rgba(209,87,74,0.12)", borderRadius: 10, padding: "0.6rem 0.8rem" }}>
                <AlertTriangle size={16} className="v3-red" style={{ flexShrink: 0 }} />
                <p style={{ fontSize: "0.8rem" }}>
                  Ada selisih hari ini: <span className="v3-mono v3-red" style={{ fontWeight: 700 }}>{formatRupiah(todayRecon.totalDiff)}</span>
                </p>
              </div>
            )
          ) : (
            <div className="flex items-center gap-2" style={{ background: "rgba(201,162,39,0.12)", borderRadius: 10, padding: "0.6rem 0.8rem" }}>
              <AlertTriangle size={16} className="v3-gold" style={{ flexShrink: 0 }} />
              <p style={{ fontSize: "0.8rem" }}>Hari ini ({todayStr}) belum direkonsiliasi.</p>
            </div>
          )}

          <p className="v3-muted" style={{ fontSize: "0.72rem", marginTop: "0.6rem" }}>
            {reconStats.total} kali dicek tahun {selectedYear} &middot; {reconStats.withDiff} kali ada selisih
          </p>

          {yearReconciliations.length > 0 && (
            <div className="flex flex-col gap-1.5" style={{ marginTop: "0.8rem" }}>
              {yearReconciliations.slice(0, 6).map((r) => {
                const ok = Math.round(r.totalDiff) === 0;
                return (
                  <div key={r.id} className="v3-surface-alt flex items-center justify-between" style={{ borderRadius: 10, padding: "0.55rem 0.75rem" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: "0.78rem", fontWeight: 600 }}>{r.date}</p>
                      <p className="v3-muted" style={{ fontSize: "0.68rem" }}>
                        {METHODS.map((m) => `${m} ${r.perMethod[m].diff === 0 ? "0" : formatRupiah(r.perMethod[m].diff)}`).join(" · ")}
                      </p>
                      {(r.recordedBy || r.note) && (
                        <p className="v3-muted" style={{ fontSize: "0.68rem", fontStyle: "italic" }}>
                          {r.recordedBy ? "Oleh " + r.recordedBy : ""}{r.recordedBy && r.note ? " · " : ""}{r.note}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                      <span className={"v3-mono " + (ok ? "v3-green" : "v3-red")} style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                        {formatRupiah(r.totalDiff)}
                      </span>
                      <button onClick={() => setConfirmDelete({ type: "reconciliation", id: r.id })} aria-label="Hapus rekonsiliasi">
                        <Trash2 size={13} className="v3-muted" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pengingat Biaya Rutin */}
        {missingRecurring.length > 0 && (
          <div className="v3-surface" style={{ borderRadius: 16, padding: "1rem 1.2rem", marginBottom: "1.4rem" }}>
            <div className="flex items-center gap-1.5" style={{ marginBottom: "0.5rem" }}>
              <AlertTriangle size={15} className="v3-gold" />
              <p className="v3-display" style={{ fontSize: "0.95rem", fontWeight: 600, letterSpacing: "0.03em" }}>
                Pengingat Biaya Rutin
              </p>
            </div>
            <p style={{ fontSize: "0.8rem" }}>
              Belum tercatat bulan ini: <span style={{ fontWeight: 600 }}>{missingRecurring.join(", ")}</span>
            </p>
            <p className="v3-muted" style={{ fontSize: "0.7rem", marginTop: "0.3rem" }}>
              Daftar kategori rutin bisa diatur di Pengaturan.
            </p>
          </div>
        )}

          </>
        )}

        {activeTab === "analitik" && (
          <>
        {/* Year selector + scoreboard */}
        <div className="flex items-center justify-between" style={{ marginBottom: "0.6rem" }}>
          <p className="v3-display" style={{ fontSize: "0.95rem", fontWeight: 600, letterSpacing: "0.03em" }}>
            Papan Skor Bulanan
          </p>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="v3-input"
            style={{ borderRadius: 8, padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="v3-scroll flex gap-2" style={{ overflowX: "auto", paddingBottom: "0.5rem", marginBottom: "1.4rem" }}>
          {monthlyData.map((r) => {
            const isSelected = selectedMonth === r.idx;
            const barPct = Math.min(100, (Math.abs(r.profit) / maxAbsProfit) * 100);
            const isProfit = r.profit >= 0;
            return (
              <button
                key={r.idx}
                onClick={() => setSelectedMonth(isSelected ? null : r.idx)}
                className="v3-surface-alt"
                style={{
                  flexShrink: 0,
                  minWidth: 108,
                  borderRadius: 12,
                  padding: "0.6rem 0.7rem",
                  textAlign: "left",
                  border: isSelected ? "1.5px solid #C9A227" : "1.5px solid transparent",
                  cursor: "pointer",
                }}
              >
                <p className="v3-display v3-gold" style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.05em" }}>
                  {r.label.toUpperCase()}
                </p>
                <p className="v3-mono v3-green" style={{ fontSize: "0.68rem", marginTop: "0.3rem" }}>
                  +{formatRupiah(r.income)}
                  {r.targetPct !== null && (
                    <span style={{ color: r.targetPct >= 100 ? "#4CAF61" : r.targetPct >= 70 ? "#C9A227" : "#D1574A" }}>
                      {" "}({r.targetPct}%)
                    </span>
                  )}
                </p>
                <p className="v3-mono v3-red" style={{ fontSize: "0.68rem" }}>-{formatRupiah(r.expense)}</p>
                <p className={"v3-mono " + (isProfit ? "v3-green" : "v3-red")} style={{ fontSize: "0.78rem", fontWeight: 700, marginTop: "0.15rem" }}>
                  {formatRupiah(r.profit)}
                </p>
                <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: "0.4rem" }}>
                  <div style={{ height: 3, width: barPct + "%", background: isProfit ? "#4CAF61" : "#D1574A", borderRadius: 2 }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Year summary chips */}
        <div className="flex flex-wrap gap-2" style={{ marginBottom: "0.8rem" }}>
          <SummaryChip label={"Income " + selectedYear} value={yearTotals.income} tone="green" />
          <SummaryChip label={"Expense " + selectedYear} value={yearTotals.expense} tone="red" />
          <SummaryChip label={"Profit " + selectedYear} value={yearTotals.profit} tone={yearTotals.profit >= 0 ? "green" : "red"} />
          {openItems.count > 0 && (
            <SummaryChip label={openItems.count + " transaksi DP/Belum Lunas"} value={openItems.amount} tone="amber" />
          )}
          {yearTargetProgress && (
            <div className="v3-surface-alt" style={{ borderRadius: 999, padding: "0.4rem 0.85rem", fontSize: "0.75rem" }}>
              <span className="v3-muted">Target {yearTargetProgress.monthsElapsed} bln: </span>
              <span className="v3-mono" style={{ color: yearTargetProgress.pct >= 100 ? "#4CAF61" : yearTargetProgress.pct >= 70 ? "#C9A227" : "#D1574A", fontWeight: 600 }}>
                {yearTargetProgress.pct}%
              </span>
            </div>
          )}
          {periodIncome > 0 && (
            <div className="v3-surface-alt" style={{ borderRadius: 999, padding: "0.4rem 0.85rem", fontSize: "0.75rem" }}>
              <span className="v3-muted">Estimasi PPh Final 0,5%: </span>
              <span className="v3-mono v3-gold" style={{ fontWeight: 600 }}>{formatRupiah(taxEstimate)}</span>
            </div>
          )}
          {periodRentalIncome > 0 && (
            <div className="v3-surface-alt" style={{ borderRadius: 999, padding: "0.4rem 0.85rem", fontSize: "0.75rem" }}>
              <span className="v3-muted">Estimasi Pajak Daerah 10%: </span>
              <span className="v3-mono v3-gold" style={{ fontWeight: 600 }}>{formatRupiah(taxDaerahEstimate)}</span>
            </div>
          )}
          {periodPrive > 0 && (
            <div className="v3-surface-alt" style={{ borderRadius: 999, padding: "0.4rem 0.85rem", fontSize: "0.75rem" }}>
              <span className="v3-muted">Prive/Dividen: </span>
              <span className="v3-mono v3-gold" style={{ fontWeight: 600 }}>{formatRupiah(periodPrive)}</span>
            </div>
          )}
        </div>

        {(periodIncome > 0 || periodRentalIncome > 0) && (
          <p className="v3-muted" style={{ fontSize: "0.68rem", marginTop: "-0.4rem", marginBottom: "0.8rem" }}>
            PPh Final dari 0,5% total omzet (PP 23/2018), Pajak Daerah dari 10% income kategori Rental — keduanya estimasi,
            bukan nasihat pajak resmi. Konsultasikan ke konsultan pajak untuk perhitungan final.
          </p>
        )}

        {/* Chart */}
        <div className="v3-surface" style={{ borderRadius: 16, padding: "1rem 0.6rem 0.6rem 0", marginBottom: "1.4rem" }}>
          <p className="v3-muted" style={{ fontSize: "0.78rem", padding: "0 1rem", marginBottom: "0.4rem" }}>
            Tren Income vs Expense — {selectedYear}
          </p>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={monthlyData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" stroke="#8A9099" fontSize={11} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
              <YAxis stroke="#8A9099" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => (v === 0 ? "0" : (v / 1000000).toFixed(1) + "jt")} width={42} />
              <Tooltip
                formatter={(value, name) => [formatRupiah(value), name]}
                labelStyle={{ color: "#0B0D10" }}
                contentStyle={{ background: "#F2EFE9", border: "none", borderRadius: 8, fontSize: "0.78rem" }}
              />
              <Legend wrapperStyle={{ fontSize: "0.72rem", color: "#8A9099" }} />
              <Bar dataKey="income" name="Income" fill="#4CAF61" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name="Expense" fill="#D1574A" radius={[3, 3, 0, 0]} />
              <Line dataKey="profit" name="Profit" stroke="#C9A227" strokeWidth={2} dot={{ r: 3, fill: "#C9A227" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Analitik: breakdown kategori & top klien */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ marginBottom: "1.4rem" }}>
          <CategoryBreakdownCard
            title="Kategori Income"
            icon={BarChart3}
            data={categoryBreakdown.income}
            accent="#4CAF61"
          />
          <CategoryBreakdownCard
            title="Kategori Expense"
            icon={BarChart3}
            data={categoryBreakdown.expense}
            accent="#D1574A"
          />
        </div>

        <div className="v3-surface" style={{ borderRadius: 16, padding: "1rem 1.1rem", marginBottom: "1.4rem" }}>
          <div className="flex items-center gap-1.5" style={{ marginBottom: "0.7rem" }}>
            <BarChart3 size={14} style={{ color: "#C9A227" }} />
            <p className="v3-display" style={{ fontSize: "0.88rem", fontWeight: 600, letterSpacing: "0.02em" }}>Durasi Bermain</p>
          </div>
          {durationBreakdown.length === 0 ? (
            <p className="v3-muted" style={{ fontSize: "0.78rem" }}>
              Belum ada transaksi dengan durasi tercatat untuk periode ini. Isi "Durasi Bermain" saat tambah transaksi Income.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {(() => {
                const maxCount = Math.max(1, ...durationBreakdown.map((d) => d.count));
                return durationBreakdown.map((d) => (
                  <div key={d.duration}>
                    <div className="flex items-center justify-between" style={{ marginBottom: "0.25rem" }}>
                      <span style={{ fontSize: "0.78rem" }}>{d.duration} Jam</span>
                      <span className="v3-mono v3-muted" style={{ fontSize: "0.72rem" }}>{d.count} booking · {formatRupiah(d.amount)}</span>
                    </div>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3 }}>
                      <div style={{ height: 5, width: (d.count / maxCount) * 100 + "%", background: "#C9A227", borderRadius: 3 }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        <div className="v3-surface" style={{ borderRadius: 16, padding: "1rem 1.1rem", marginBottom: "1.4rem" }}>
          <div className="flex items-center gap-1.5" style={{ marginBottom: "0.7rem" }}>
            <Tag size={14} style={{ color: "#C9A227" }} />
            <p className="v3-display" style={{ fontSize: "0.88rem", fontWeight: 600, letterSpacing: "0.02em" }}>Riwayat Penggunaan Promo (Rental)</p>
          </div>
          {promoBreakdown.length === 0 ? (
            <p className="v3-muted" style={{ fontSize: "0.78rem" }}>
              Belum ada transaksi Rental dengan promo tercatat untuk periode ini. Isi "Promo yang dipakai" saat tambah transaksi Income kategori Rental.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {promoBreakdown.map((p) => (
                <div key={p.promo} className="v3-surface-alt" style={{ borderRadius: 10, padding: "0.55rem 0.75rem" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{p.promo}</span>
                  <p className="v3-muted" style={{ fontSize: "0.68rem", marginTop: "0.15rem" }}>
                    {p.count} transaksi{p.clients.length ? " · " + p.clients.join(", ") : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="v3-surface" style={{ borderRadius: 16, padding: "1rem 1.1rem", marginBottom: "1.4rem" }}>
          <div className="flex items-center gap-1.5" style={{ marginBottom: "0.7rem" }}>
            <Trophy size={15} className="v3-gold" />
            <p className="v3-display" style={{ fontSize: "0.95rem", fontWeight: 600, letterSpacing: "0.03em" }}>
              Top Klien Rental {selectedMonth !== null ? MONTHS[selectedMonth] : ""} {selectedYear}
            </p>
          </div>
          {topClients.length === 0 ? (
            <p className="v3-muted" style={{ fontSize: "0.8rem" }}>
              Belum ada transaksi Rental dengan nama klien untuk periode ini.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {topClients.map((c, idx) => {
                const rankColor = idx === 0 ? "#C9A227" : idx === 1 ? "#B8C0C8" : idx === 2 ? "#C98A52" : "#5A6068";
                return (
                  <div key={c.name} className="v3-surface-alt flex items-center gap-3" style={{ borderRadius: 10, padding: "0.55rem 0.75rem" }}>
                    <div
                      className="v3-mono flex items-center justify-center"
                      style={{ width: 24, height: 24, borderRadius: 999, background: rankColor, color: "#0B0D10", fontSize: "0.72rem", fontWeight: 700, flexShrink: 0 }}
                    >
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.82rem", fontWeight: 600 }}>{c.name}</p>
                      <p className="v3-muted" style={{ fontSize: "0.68rem" }}>{c.count} transaksi</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

          </>
        )}

        {activeTab === "transaksi" && (
          <>
        {/* Filters */}
        <div className="v3-surface" style={{ borderRadius: 14, padding: "0.8rem 0.9rem", marginBottom: "0.9rem" }}>
          <div className="v3-input flex items-center gap-2" style={{ borderRadius: 10, padding: "0.5rem 0.7rem", marginBottom: "0.6rem" }}>
            <Search size={14} className="v3-muted" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari kategori, klien, atau catatan..."
              style={{ background: "transparent", border: "none", outline: "none", color: "#F2EFE9", fontSize: "0.85rem", width: "100%" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2" style={{ marginBottom: "0.6rem" }}>
            <div>
              <span className="v3-muted" style={{ fontSize: "0.68rem", display: "block", marginBottom: "0.2rem" }}>Dari Tanggal</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="v3-input"
                style={{ borderRadius: 8, padding: "0.45rem 0.5rem", width: "100%", fontSize: "0.8rem" }}
              />
            </div>
            <div>
              <span className="v3-muted" style={{ fontSize: "0.68rem", display: "block", marginBottom: "0.2rem" }}>Sampai Tanggal</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="v3-input"
                style={{ borderRadius: 8, padding: "0.45rem 0.5rem", width: "100%", fontSize: "0.8rem" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: "0.6rem" }}>
            <span className="v3-muted" style={{ fontSize: "0.68rem", display: "block", marginBottom: "0.2rem" }}>Kategori</span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="v3-input"
              style={{ borderRadius: 8, padding: "0.45rem 0.5rem", width: "100%", fontSize: "0.8rem" }}
            >
              <option value="all">Semua Kategori</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="v3-scroll flex gap-1.5" style={{ overflowX: "auto", marginBottom: "0.5rem" }}>
            {[["all", "Semua"], ["income", "Income"], ["expense", "Expense"], ["transfer", "Transfer"], ["prive", "Prive"], ["piutang_keluar", "Piutang Keluar"], ["piutang_balik", "Pengembalian"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterType(val)}
                className={filterType === val ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
                style={{ borderRadius: 999, padding: "0.4rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="v3-scroll flex gap-1.5" style={{ overflowX: "auto" }}>
            {[["all", "Semua Status"], ["Lunas", "Lunas"], ["DP", "DP"], ["Belum Lunas", "Belum Lunas"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterStatus(val)}
                className={filterStatus === val ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
                style={{ borderRadius: 999, padding: "0.35rem 0.7rem", fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="v3-scroll flex gap-1.5" style={{ overflowX: "auto" }}>
            {[["all", "Semua Kantong"], ...METHODS.map((m) => [m, m])].map(([val, label]) => {
              const isActive = filterMethod === val;
              const accent = val !== "all" ? METHOD_META[val]?.accent : null;
              return (
                <button
                  key={val}
                  onClick={() => setFilterMethod(val)}
                  style={{
                    borderRadius: 999,
                    padding: "0.35rem 0.7rem",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    background: isActive ? (accent || "#C9A227") : "rgba(255,255,255,0.05)",
                    color: isActive ? "#0B0D10" : "#8A9099",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="v3-muted flex items-center gap-1"
              style={{ fontSize: "0.75rem", marginTop: "0.6rem" }}
            >
              <X size={12} /> Reset semua filter
            </button>
          )}
        </div>

        {/* Transaction list */}
        <div className="flex flex-col gap-2">
          {filteredTransactions.length === 0 && (
            <div className="v3-surface flex flex-col items-center text-center" style={{ borderRadius: 16, padding: "2.5rem 1.5rem" }}>
              <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.3rem" }}>Belum ada transaksi</p>
              <p className="v3-muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
                Catat transaksi pertama untuk periode ini.
              </p>
              <button
                onClick={() => { setEditingTx(null); setShowForm(true); }}
                className="v3-gold-bg flex items-center gap-1.5"
                style={{ borderRadius: 999, padding: "0.55rem 1.1rem", fontWeight: 600, fontSize: "0.85rem" }}
              >
                <Plus size={16} /> Tambah Transaksi
              </button>
            </div>
          )}

          {filteredTransactions.map((t) => (
            <TransactionRow
              key={t.id}
              tx={t}
              onEdit={() => { setEditingTx(t); setShowForm(true); }}
              onDelete={() => setConfirmDelete({ type: "transaction", id: t.id })}
            />
          ))}
        </div>
          </>
        )}

        {activeTab === "ceksaldo" && (
          <CekSaldoTab
            cekSaldoResult={cekSaldoResult}
            cekSaldoTotalDiff={cekSaldoTotalDiff}
            cekSaldoInputCount={cekSaldoInputCount}
            cekSaldoHasSelisih={cekSaldoHasSelisih}
            actuals={actuals}
            setActuals={setActuals}
            onSaveRecon={handleSaveReconciliation}
            todayStr={todayStr}
          />
        )}

        <p className="v3-muted" style={{ fontSize: "0.7rem", textAlign: "center", marginTop: "2rem" }}>
          V3BKS Mini Soccer &amp; Cafe &middot; Samarinda
        </p>
      </div>

      {/* Bottom tab navigation */}
      <div
        className="v3-surface flex items-center"
        style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 35, borderTop: "1px solid rgba(201,162,39,0.18)", padding: "0.4rem 0.6rem" }}
      >
        {[
          ["dashboard", "Dashboard", LayoutDashboard],
          ["analitik", "Analitik", BarChart3],
          ["transaksi", "Transaksi", ListChecks],
          ["ceksaldo", "Cek Saldo", ShieldCheck],
        ].map(([key, label, TabIcon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex flex-col items-center justify-center"
            style={{ flex: 1, padding: "0.4rem 0", gap: "0.2rem" }}
          >
            <TabIcon size={19} style={{ color: activeTab === key ? "#C9A227" : "#8A9099" }} />
            <span style={{ fontSize: "0.65rem", fontWeight: 600, color: activeTab === key ? "#C9A227" : "#8A9099" }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => { setEditingTx(null); setShowForm(true); }}
        className="v3-gold-bg md:hidden flex items-center justify-center"
        style={{
          position: "fixed", bottom: "4.6rem", right: "1.2rem", width: 54, height: 54,
          borderRadius: 999, boxShadow: "0 6px 18px rgba(0,0,0,0.4)", zIndex: 40,
        }}
        aria-label="Tambah transaksi"
      >
        <Plus size={24} />
      </button>

      {showForm && (
        <TransactionModal
          editingTx={editingTx}
          prefillData={prefillData}
          existingPromos={existingPromos}
          onSave={handleSaveTransaction}
          onClose={() => { setShowForm(false); setEditingTx(null); setPrefillData(null); }}
        />
      )}

      {showSettings && (
        <SettingsModal
          initialBalances={initialBalances}
          monthlyTarget={monthlyTarget}
          recurringCategories={recurringCategories}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showTemplateManager && (
        <TemplateManager
          templates={templates}
          onUse={(tpl) => {
            setShowTemplateManager(false);
            openWithPrefill(tpl);
          }}
          onSave={handleSaveTemplate}
          onDelete={handleDeleteTemplate}
          onClose={() => setShowTemplateManager(false)}
        />
      )}

      {showLunasModal && selectedPiutang && (
        <LunasModal
          piutang={selectedPiutang}
          onConfirm={(data) => handleTandaiLunas(selectedPiutang, data)}
          onClose={() => { setShowLunasModal(false); setSelectedPiutang(null); }}
        />
      )}

      {showReconModal && (
        <ReconciliationModal
          transactions={transactions}
          initialBalances={initialBalances}
          onSave={handleSaveReconciliation}
          onClose={() => setShowReconModal(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message={confirmDelete.type === "reconciliation" ? "Hapus catatan rekonsiliasi ini?" : "Hapus transaksi ini?"}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function TemplateManager({ templates, onUse, onSave, onDelete, onClose }) {
  const [showForm, setShowForm] = useState(false);
  const [editingTpl, setEditingTpl] = useState(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [method, setMethod] = useState(METHODS[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const openNew = () => {
    setEditingTpl(null);
    setName(""); setType("expense"); setCategory(EXPENSE_CATEGORIES[0]);
    setMethod(METHODS[0]); setAmount(""); setNote("");
    setShowForm(true);
  };

  const openEdit = (tpl) => {
    setEditingTpl(tpl);
    setName(tpl.name); setType(tpl.type); setCategory(tpl.category || EXPENSE_CATEGORIES[0]);
    setMethod(tpl.method || METHODS[0]); setAmount(tpl.amount ? String(tpl.amount) : ""); setNote(tpl.note || "");
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    onSave({
      id: editingTpl?.id || uid(),
      name: name.trim(),
      type,
      category: type !== "transfer" && type !== "prive" ? category : undefined,
      method: type !== "transfer" ? method : undefined,
      amount: parseFloat(amount) > 0 ? parseFloat(amount) : null,
      note: note.trim(),
    });
    setShowForm(false);
  };

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>Template Transaksi</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>

        <div style={{ padding: "1rem 1.2rem" }}>
          {!showForm ? (
            <>
              <p className="v3-muted" style={{ fontSize: "0.75rem", marginBottom: "0.8rem" }}>
                Template membantu kamu input transaksi rutin lebih cepat. Tap "Gunakan" untuk buka form yang sudah terisi.
              </p>

              {templates.length === 0 ? (
                <p className="v3-muted" style={{ fontSize: "0.8rem", marginBottom: "0.8rem" }}>
                  Belum ada template. Buat template untuk transaksi rutin seperti "Uang Makan Holil", "Fee Wasit 2 Jam", dll.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5" style={{ marginBottom: "0.8rem" }}>
                  {templates.map((tpl) => (
                    <div key={tpl.id} className="v3-surface-alt flex items-center gap-2" style={{ borderRadius: 10, padding: "0.6rem 0.75rem" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "0.82rem", fontWeight: 600 }}>{tpl.name}</p>
                        <p className="v3-muted" style={{ fontSize: "0.68rem" }}>
                          {tpl.type}{tpl.category ? " · " + tpl.category : ""}{tpl.method ? " · " + tpl.method : ""}
                          {tpl.amount ? " · " + formatRupiah(tpl.amount) : ""}
                        </p>
                      </div>
                      <div className="flex gap-1.5" style={{ flexShrink: 0 }}>
                        <button
                          onClick={() => onUse(tpl)}
                          className="v3-gold-bg"
                          style={{ borderRadius: 7, padding: "0.3rem 0.65rem", fontSize: "0.72rem", fontWeight: 700 }}
                        >
                          Gunakan
                        </button>
                        <button onClick={() => openEdit(tpl)} aria-label="Edit template">
                          <Pencil size={13} className="v3-muted" />
                        </button>
                        <button onClick={() => onDelete(tpl.id)} aria-label="Hapus template">
                          <Trash2 size={13} className="v3-muted" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={openNew}
                className="v3-gold-bg flex items-center justify-center gap-1.5"
                style={{ borderRadius: 10, padding: "0.6rem 0", fontWeight: 700, fontSize: "0.85rem", width: "100%" }}
              >
                <Plus size={15} /> Buat Template Baru
              </button>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>{editingTpl ? "Edit Template" : "Template Baru"}</p>

              <Field label="Nama Template">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="cth. Uang Makan Holil"
                  className="v3-input"
                  style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
                  autoFocus
                />
              </Field>

              <Field label="Tipe">
                <div className="grid grid-cols-2 gap-1.5">
                  {[["income", "Income"], ["expense", "Expense"], ["transfer", "Transfer"], ["prive", "Prive"]].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => { setType(val); setCategory(val === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]); }}
                      className={type === val ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
                      style={{ borderRadius: 8, padding: "0.45rem 0", fontSize: "0.78rem", fontWeight: 600 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              {(type === "income" || type === "expense") && (
                <Field label="Kategori">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="v3-input"
                    style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              )}

              {type !== "transfer" && (
                <Field label="Kantong">
                  <select value={method} onChange={(e) => setMethod(e.target.value)} className="v3-input"
                    style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                    {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              )}

              <Field label="Jumlah (opsional — bisa dikosongkan jika nilainya berubah-ubah)">
                <input
                  type="number"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="v3-input"
                  style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
                />
              </Field>

              <Field label="Catatan (opsional)">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="cth. petty cash uang makan holil"
                  className="v3-input"
                  style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
                />
              </Field>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="v3-surface-alt v3-muted"
                  style={{ flex: 1, borderRadius: 10, padding: "0.55rem 0", fontSize: "0.82rem", fontWeight: 600 }}
                >
                  Batal
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!name.trim()}
                  className="v3-gold-bg"
                  style={{ flex: 1, borderRadius: 10, padding: "0.55rem 0", fontSize: "0.82rem", fontWeight: 700, opacity: name.trim() ? 1 : 0.4 }}
                >
                  Simpan Template
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LunasModal({ piutang, onConfirm, onClose }) {
  const [date, setDate] = useState(todayISO());
  const [splitMode, setSplitMode] = useState(false);
  const [method, setMethod] = useState(piutang.method || METHODS[0]);
  const [splits, setSplits] = useState([
    { method: METHODS[0], amount: String(Math.round(piutang.sisa)) },
    { method: METHODS[1], amount: "" },
  ]);
  const [recordedBy, setRecordedBy] = useState(piutang.recordedBy || "");

  const splitsTotal = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const splitsValid =
    splits.length > 0 &&
    splits.every((s) => s.method && parseFloat(s.amount) > 0) &&
    new Set(splits.map((s) => s.method)).size === splits.length &&
    Math.round(splitsTotal) === Math.round(piutang.sisa);

  const addSplitRow = () => {
    const unused = METHODS.find((m) => !splits.some((s) => s.method === m));
    setSplits((prev) => [...prev, { method: unused || METHODS[0], amount: "" }]);
  };
  const removeSplitRow = (idx) => setSplits((prev) => prev.filter((_, i) => i !== idx));
  const updateSplitRow = (idx, field, value) =>
    setSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));

  const handleConfirm = () => {
    onConfirm({
      date,
      recordedBy: recordedBy.trim(),
      splitMode,
      method: splitMode ? null : method,
      splits: splitMode ? splits.map((s) => ({ method: s.method, amount: parseFloat(s.amount) })) : null,
    });
  };

  const isValid = splitMode ? splitsValid : !!method;

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>Tandai Lunas</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>

        <div style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div className="v3-surface-alt" style={{ borderRadius: 10, padding: "0.7rem 0.85rem" }}>
            <p style={{ fontSize: "0.82rem", fontWeight: 600 }}>{piutang.entity || piutang.category}</p>
            <p className="v3-muted" style={{ fontSize: "0.7rem" }}>{piutang.category} · {piutang.date}</p>
            <div className="flex gap-3" style={{ marginTop: "0.35rem" }}>
              <span className="v3-mono" style={{ fontSize: "0.75rem", color: "#8A9099" }}>
                Sudah: <span style={{ color: "#4CAF61" }}>{formatRupiah(piutang.amount)}</span>
              </span>
              <span className="v3-mono" style={{ fontSize: "0.75rem" }}>
                Sisa: <span style={{ color: "#D1574A", fontWeight: 700 }}>{formatRupiah(piutang.sisa)}</span>
              </span>
            </div>
          </div>

          <Field label="Tanggal Pelunasan">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="v3-input"
              style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
            />
          </Field>

          <div className="flex items-center justify-between">
            <span className="v3-muted" style={{ fontSize: "0.72rem" }}>Kantong Penerima</span>
            <button
              type="button"
              onClick={() => setSplitMode((v) => !v)}
              style={{ fontSize: "0.68rem", fontWeight: 600, color: "#C9A227", textDecoration: "underline" }}
            >
              {splitMode ? "Pakai 1 kantong" : "Split ke beberapa kantong"}
            </button>
          </div>

          {!splitMode ? (
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="v3-input"
              style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
            >
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <div className="flex flex-col gap-2">
              {splits.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={s.method}
                    onChange={(e) => updateSplitRow(idx, "method", e.target.value)}
                    className="v3-input"
                    style={{ borderRadius: 8, padding: "0.5rem 0.6rem", fontSize: "0.85rem", flex: "1 1 0%" }}
                  >
                    {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={s.amount}
                    onChange={(e) => updateSplitRow(idx, "amount", e.target.value)}
                    placeholder="0"
                    className="v3-input"
                    style={{ borderRadius: 8, padding: "0.5rem 0.6rem", fontSize: "0.85rem", flex: "1 1 0%" }}
                  />
                  {splits.length > 1 && (
                    <button type="button" onClick={() => removeSplitRow(idx)}><X size={14} className="v3-muted" /></button>
                  )}
                </div>
              ))}
              {splits.length < METHODS.length && (
                <button
                  type="button"
                  onClick={addSplitRow}
                  className="v3-surface-alt v3-muted flex items-center justify-center gap-1"
                  style={{ borderRadius: 8, padding: "0.4rem 0", fontSize: "0.75rem", fontWeight: 600 }}
                >
                  <Plus size={13} /> Tambah Kantong
                </button>
              )}
              <div className="v3-surface-alt" style={{ borderRadius: 8, padding: "0.5rem 0.7rem" }}>
                <span className="v3-muted" style={{ fontSize: "0.72rem" }}>Total split: </span>
                <span className="v3-mono" style={{ fontWeight: 700, fontSize: "0.85rem", color: Math.round(splitsTotal) === Math.round(piutang.sisa) ? "#4CAF61" : "#D1574A" }}>
                  {formatRupiah(splitsTotal)}
                </span>
                <span className="v3-muted" style={{ fontSize: "0.72rem" }}> / {formatRupiah(piutang.sisa)}</span>
              </div>
              {splitMode && !splitsValid && splitsTotal > 0 && Math.round(splitsTotal) !== Math.round(piutang.sisa) && (
                <p style={{ color: "#D1574A", fontSize: "0.72rem" }}>
                  Total split harus sama persis dengan sisa piutang ({formatRupiah(piutang.sisa)}).
                </p>
              )}
            </div>
          )}

          <Field label="Dicatat oleh (opsional)">
            <input
              value={recordedBy}
              onChange={(e) => setRecordedBy(e.target.value)}
              placeholder="cth. Holil / Josua"
              className="v3-input"
              style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
            />
          </Field>

          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="v3-gold-bg"
            style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.9rem", opacity: isValid ? 1 : 0.4, cursor: isValid ? "pointer" : "not-allowed" }}
          >
            Konfirmasi Pelunasan {formatRupiah(piutang.sisa)}
          </button>
        </div>
      </div>
    </div>
  );
}

function CekSaldoTab({ cekSaldoResult, cekSaldoTotalDiff, cekSaldoInputCount, cekSaldoHasSelisih, actuals, setActuals, onSaveRecon, todayStr }) {
  const [recordedBy, setRecordedBy] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("v3bks_last_recorder_name", false);
        if (res && res.value) setRecordedBy(res.value);
      } catch (e) {}
    })();
  }, []);

  const handleSave = () => {
    const perMethod = {};
    cekSaldoResult.forEach((r) => {
      perMethod[r.method] = {
        system: r.sistem,
        actual: r.aktual !== null ? r.aktual : r.sistem,
        diff: r.diff !== null ? r.diff : 0,
      };
    });
    onSaveRecon({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: todayStr,
      recordedBy: recordedBy.trim(),
      note: note.trim(),
      perMethod,
      totalDiff: cekSaldoTotalDiff,
      timestamp: Date.now(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const allFilled = cekSaldoResult.every((r) => r.hasInput);
  const statusColor = cekSaldoInputCount === 0
    ? "#8A9099"
    : !cekSaldoHasSelisih
    ? "#4CAF61"
    : "#D1574A";
  const statusText = cekSaldoInputCount === 0
    ? "Belum ada input"
    : !cekSaldoHasSelisih
    ? "Semua kantong cocok ✓"
    : `Ada selisih di ${cekSaldoResult.filter((r) => r.hasInput && Math.round(r.diff) !== 0).length} kantong`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      {/* Status header */}
      <div
        className="v3-surface"
        style={{ borderRadius: 18, padding: "1.2rem 1.4rem", borderLeft: `4px solid ${statusColor}` }}
      >
        <p className="v3-muted" style={{ fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Status Saldo Hari Ini · {todayStr}
        </p>
        <p style={{ fontSize: "1.05rem", fontWeight: 700, color: statusColor, marginTop: "0.3rem" }}>
          {statusText}
        </p>
        {cekSaldoInputCount > 0 && (
          <p className="v3-mono" style={{ fontSize: "0.95rem", fontWeight: 600, marginTop: "0.15rem", color: cekSaldoHasSelisih ? "#D1574A" : "#4CAF61" }}>
            Total selisih: {formatRupiah(cekSaldoTotalDiff)}
          </p>
        )}
        <p className="v3-muted" style={{ fontSize: "0.7rem", marginTop: "0.4rem" }}>
          Ketik saldo fisik / saldo bank aktual di bawah. Selisih muncul otomatis, tidak perlu disimpan dulu.
        </p>
      </div>

      {/* Per kantong input + diff */}
      {cekSaldoResult.map((r) => {
        const { method, sistem, aktual, diff, hasInput } = r;
        const Icon = METHOD_META[method].icon;
        const accent = METHOD_META[method].accent;
        const diffOk = hasInput && Math.round(diff) === 0;
        const diffBad = hasInput && Math.round(diff) !== 0;
        return (
          <div
            key={method}
            className="v3-surface"
            style={{ borderRadius: 14, overflow: "hidden", border: diffBad ? "1.5px solid #D1574A" : diffOk ? "1.5px solid #4CAF61" : undefined }}
          >
            <div style={{ height: 4, background: accent }} />
            <div style={{ padding: "0.85rem 1rem" }}>
              <div className="flex items-center gap-1.5" style={{ marginBottom: "0.5rem" }}>
                <Icon size={14} style={{ color: accent }} />
                <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>{method}</span>
                {diffOk && <span style={{ fontSize: "0.68rem", color: "#4CAF61", fontWeight: 600 }}>✓ Cocok</span>}
                {diffBad && <span style={{ fontSize: "0.68rem", color: "#D1574A", fontWeight: 600 }}>⚠ Selisih {formatRupiah(diff)}</span>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="v3-muted" style={{ fontSize: "0.65rem", marginBottom: "0.2rem" }}>Saldo Sistem</p>
                  <p className="v3-mono" style={{ fontSize: "0.9rem", fontWeight: 600 }}>{formatRupiah(sistem)}</p>
                </div>
                <div>
                  <p className="v3-muted" style={{ fontSize: "0.65rem", marginBottom: "0.2rem" }}>Saldo Aktual (ketik)</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={actuals[method]}
                    onChange={(e) => setActuals((prev) => ({ ...prev, [method]: e.target.value }))}
                    placeholder={String(Math.round(sistem))}
                    className="v3-input"
                    style={{ borderRadius: 8, padding: "0.4rem 0.5rem", width: "100%", fontSize: "0.85rem" }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Tombol simpan rekonsiliasi */}
      <div className="v3-surface" style={{ borderRadius: 14, padding: "0.9rem 1rem" }}>
        <p className="v3-muted" style={{ fontSize: "0.72rem", marginBottom: "0.5rem" }}>
          Simpan hasil cek ini sebagai catatan rekonsiliasi resmi:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.6rem" }}>
          <input
            value={recordedBy}
            onChange={(e) => setRecordedBy(e.target.value)}
            placeholder="Dicatat oleh (cth. Holil / Josua)"
            className="v3-input"
            style={{ borderRadius: 8, padding: "0.45rem 0.6rem", fontSize: "0.82rem" }}
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan (opsional, cth: selisih karena kembalian belum dicatat)"
            rows={2}
            className="v3-input"
            style={{ borderRadius: 8, padding: "0.45rem 0.6rem", fontSize: "0.82rem", resize: "none" }}
          />
        </div>
        <button
          onClick={handleSave}
          disabled={cekSaldoInputCount === 0}
          className="v3-gold-bg"
          style={{
            borderRadius: 10,
            padding: "0.6rem 0",
            fontWeight: 700,
            fontSize: "0.85rem",
            width: "100%",
            opacity: cekSaldoInputCount === 0 ? 0.4 : 1,
            cursor: cekSaldoInputCount === 0 ? "not-allowed" : "pointer",
          }}
        >
          {saved ? "✓ Tersimpan!" : "Simpan sebagai Rekonsiliasi"}
        </button>
        {cekSaldoInputCount === 0 && (
          <p className="v3-muted" style={{ fontSize: "0.7rem", marginTop: "0.3rem", textAlign: "center" }}>
            Isi minimal 1 kantong dulu untuk bisa menyimpan.
          </p>
        )}
      </div>
    </div>
  );
}

function SummaryChip({ label, value, tone }) {
  const color = tone === "green" ? "#4CAF61" : tone === "red" ? "#D1574A" : "#C9A227";
  return (
    <div className="v3-surface-alt" style={{ borderRadius: 999, padding: "0.4rem 0.85rem", fontSize: "0.75rem" }}>
      <span className="v3-muted">{label}: </span>
      <span className="v3-mono" style={{ color, fontWeight: 600 }}>{formatRupiah(value)}</span>
    </div>
  );
}

function CategoryBreakdownCard({ title, icon: Icon, data, accent }) {
  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const max = Math.max(1, ...data.map((d) => d.amount));
  return (
    <div className="v3-surface" style={{ borderRadius: 16, padding: "1rem 1.1rem" }}>
      <div className="flex items-center gap-1.5" style={{ marginBottom: "0.7rem" }}>
        <Icon size={14} style={{ color: accent }} />
        <p className="v3-display" style={{ fontSize: "0.88rem", fontWeight: 600, letterSpacing: "0.02em" }}>{title}</p>
      </div>
      {data.length === 0 ? (
        <p className="v3-muted" style={{ fontSize: "0.78rem" }}>Belum ada data untuk periode ini.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {data.slice(0, 8).map((d) => {
            const pct = total > 0 ? Math.round((d.amount / total) * 100) : 0;
            const barPct = (d.amount / max) * 100;
            return (
              <div key={d.category}>
                <div className="flex items-center justify-between" style={{ marginBottom: "0.25rem" }}>
                  <span style={{ fontSize: "0.78rem" }}>{d.category}</span>
                  <span className="v3-mono v3-muted" style={{ fontSize: "0.72rem" }}>{formatRupiah(d.amount)} · {pct}%</span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3 }}>
                  <div style={{ height: 5, width: barPct + "%", background: accent, borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TransactionRow({ tx, onEdit, onDelete }) {
  const isIncome = tx.type === "income";
  const isExpense = tx.type === "expense";
  const isTransfer = tx.type === "transfer";
  const isPrive = tx.type === "prive";
  const isPiutangKeluar = tx.type === "piutang_keluar";
  const isPiutangBalik = tx.type === "piutang_balik";

  const Icon = isTransfer ? ArrowLeftRight
    : isPrive ? Wallet
    : isPiutangKeluar || isPiutangBalik ? HandCoins
    : isIncome ? TrendingUp : TrendingDown;

  const color = isIncome ? "#4CAF61"
    : isExpense ? "#D1574A"
    : isTransfer || isPrive ? "#C9A227"
    : isPiutangKeluar ? "#D1574A"
    : "#4CAF61"; // piutang_balik

  const typeLabel = isTransfer ? `${tx.fromMethod} → ${tx.toMethod}`
    : isPrive ? "Prive / Tarik Pribadi"
    : isPiutangKeluar ? `Piutang Keluar · ${tx.entity || ""}`
    : isPiutangBalik ? `Pengembalian Piutang · ${tx.entity || ""}`
    : tx.category;

  const kantong = isTransfer ? "" : tx.splits && tx.splits.length
    ? tx.splits.map((s) => s.method).join("+")
    : tx.method || "";

  const sign = isExpense || isPrive || isPiutangKeluar ? "-"
    : isIncome || isPiutangBalik ? "+"
    : "";

  return (
    <div className="v3-surface flex items-center gap-3" style={{ borderRadius: 12, padding: "0.7rem 0.9rem" }}>
      <div className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 999, background: "rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-1.5">
          <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>{typeLabel}</p>
          {!isTransfer && !isPrive && !isPiutangKeluar && !isPiutangBalik && tx.status && tx.status !== "Lunas" && (
            <span className="v3-mono" style={{ fontSize: "0.62rem", fontWeight: 700, padding: "0.05rem 0.4rem", borderRadius: 999, background: STATUS_META[tx.status].color, color: "#0B0D10" }}>
              {tx.status}
            </span>
          )}
          {(isPiutangKeluar || isPiutangBalik) && tx.category && (
            <span className="v3-muted" style={{ fontSize: "0.62rem", padding: "0.05rem 0.4rem", borderRadius: 999, background: "rgba(201,162,39,0.15)" }}>
              {tx.category}
            </span>
          )}
        </div>
        <p className="v3-muted" style={{ fontSize: "0.72rem" }}>
          {tx.date}{!isTransfer && !isPiutangKeluar && !isPiutangBalik && tx.entity ? " · " + tx.entity : ""}
          {kantong ? " · " + kantong : ""}
          {tx.duration ? " · " + tx.duration + " Jam" : ""}
          {tx.promo ? " · Promo: " + tx.promo : ""}
          {tx.recordedBy ? " · oleh " + tx.recordedBy : ""}
        </p>
        {tx.note && <p className="v3-muted" style={{ fontSize: "0.72rem", fontStyle: "italic" }}>{tx.note}</p>}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p className="v3-mono" style={{ fontWeight: 600, color, fontSize: "0.9rem" }}>
          {sign}{formatRupiah(tx.amount)}
        </p>
        <div className="flex gap-2" style={{ justifyContent: "flex-end", marginTop: "0.25rem" }}>
          <button onClick={onEdit} aria-label="Edit"><Pencil size={13} className="v3-muted" /></button>
          <button onClick={onDelete} aria-label="Hapus"><Trash2 size={13} className="v3-muted" /></button>
        </div>
      </div>
    </div>
  );
}

function TransactionModal({ editingTx, prefillData, existingPromos, onSave, onClose }) {
  const src = editingTx || prefillData || {};
  const [type, setType] = useState(src.type || "income");
  const [date, setDate] = useState(src.date || todayISO());
  const [category, setCategory] = useState(src.category || INCOME_CATEGORIES[0]);
  const [method, setMethod] = useState(src.method || METHODS[0]);
  const [status, setStatus] = useState(src.status || "Lunas");
  const [splitMode, setSplitMode] = useState(!!(src.splits && src.splits.length));
  const [splits, setSplits] = useState(
    src.splits && src.splits.length
      ? src.splits.map((s) => ({ method: s.method, amount: String(s.amount) }))
      : [{ method: METHODS[0], amount: "" }, { method: METHODS[1], amount: "" }]
  );
  const [promo, setPromo] = useState(src.promo || "");
  const [fromMethod, setFromMethod] = useState(src.fromMethod || METHODS[0]);
  const [toMethod, setToMethod] = useState(src.toMethod || METHODS[1]);
  const [amount, setAmount] = useState(src.amount ? String(src.amount) : "");
  const [entity, setEntity] = useState(src.entity || "");
  const [duration, setDuration] = useState(src.duration ? String(src.duration) : "");
  const [totalKontrak, setTotalKontrak] = useState(src.totalKontrak ? String(src.totalKontrak) : "");
  const [note, setNote] = useState(src.note || "");
  const [recordedBy, setRecordedBy] = useState(src.recordedBy || "");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (editingTx) return;
    (async () => {
      try {
        const res = await window.storage.get("v3bks_last_recorder_name", false);
        if (res && res.value) setRecordedBy(res.value);
      } catch (e) {
        // belum pernah tersimpan, biarkan kosong
      }
    })();
  }, []);

  useEffect(() => {
    if (type === "income" && !INCOME_CATEGORIES.includes(category)) setCategory(INCOME_CATEGORIES[0]);
    if (type === "expense" && !EXPENSE_CATEGORIES.includes(category)) setCategory(EXPENSE_CATEGORIES[0]);
  }, [type]);

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const isMoneyType = type === "income" || type === "expense";
  const isPiutangType = type === "piutang_keluar" || type === "piutang_balik";
  const splitsTotal = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const splitsValid =
    splits.length > 0 &&
    splits.every((s) => s.method && parseFloat(s.amount) > 0) &&
    new Set(splits.map((s) => s.method)).size === splits.length;
  const amountNum = isMoneyType && splitMode ? splitsTotal : parseFloat(amount);
  const isValid =
    amountNum > 0 &&
    !!date &&
    (type === "transfer"
      ? fromMethod !== toMethod
      : type === "prive" || isPiutangType
      ? !!method
      : splitMode
      ? splitsValid
      : !!category && !!method);

  const addSplitRow = () => {
    const unused = METHODS.find((m) => !splits.some((s) => s.method === m));
    setSplits((prev) => [...prev, { method: unused || METHODS[0], amount: "" }]);
  };
  const removeSplitRow = (idx) => setSplits((prev) => prev.filter((_, i) => i !== idx));
  const updateSplitRow = (idx, field, value) =>
    setSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    const base = { id: editingTx?.id || uid(), type, date, amount: amountNum, note: note.trim(), recordedBy: recordedBy.trim() };
    let tx;
    if (type === "transfer") tx = { ...base, fromMethod, toMethod };
    else if (type === "prive") tx = { ...base, method };
    else if (isPiutangType) tx = { ...base, method, entity: entity.trim(), category };
    else {
      const durationNum = parseFloat(duration);
      const totalKontrakNum = parseFloat(totalKontrak);
      const common = {
        category,
        status,
        entity: entity.trim(),
        duration: durationNum > 0 ? durationNum : null,
        promo: type === "income" ? promo.trim() : "",
        totalKontrak: type === "income" && totalKontrakNum > 0 ? totalKontrakNum : null,
      };
      tx = splitMode
        ? { ...base, ...common, splits: splits.map((s) => ({ method: s.method, amount: parseFloat(s.amount) })) }
        : { ...base, ...common, method };
    }
    if (recordedBy.trim()) {
      window.storage.set("v3bks_last_recorder_name", recordedBy.trim(), false).catch(() => {});
    }
    onSave(tx);
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>
            {editingTx ? "Edit Transaksi" : "Tambah Transaksi"}
          </p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <div className="grid grid-cols-3 gap-1.5">
            {[["income", "Income"], ["expense", "Expense"], ["transfer", "Transfer"], ["prive", "Prive"], ["piutang_keluar", "Piutang Keluar"], ["piutang_balik", "Pengembalian"]].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setType(val)}
                className={type === val ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
                style={{ borderRadius: 10, padding: "0.45rem 0", fontSize: "0.72rem", fontWeight: 600 }}
              >
                {label}
              </button>
            ))}
          </div>

          <Field label="Tanggal">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} />
          </Field>

          <Field label="Dicatat oleh">
            <input
              value={recordedBy}
              onChange={(e) => setRecordedBy(e.target.value)}
              placeholder="cth. Holil / Josua"
              className="v3-input"
              style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
            />
          </Field>

          {type === "income" || type === "expense" ? (
            <>
              <Field label="Kategori">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <div className="flex items-center justify-between">
                <span className="v3-muted" style={{ fontSize: "0.72rem" }}>Kantong / Metode</span>
                <button
                  type="button"
                  onClick={() => setSplitMode((v) => !v)}
                  className="v3-mono"
                  style={{ fontSize: "0.68rem", fontWeight: 600, color: "#C9A227", textDecoration: "underline" }}
                >
                  {splitMode ? "Pakai 1 kantong saja" : "Split ke beberapa kantong"}
                </button>
              </div>

              {!splitMode ? (
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <div className="flex flex-col gap-2">
                  {splits.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={s.method}
                        onChange={(e) => updateSplitRow(idx, "method", e.target.value)}
                        className="v3-input"
                        style={{ borderRadius: 8, padding: "0.5rem 0.6rem", fontSize: "0.85rem", flex: "1 1 0%" }}
                      >
                        {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={s.amount}
                        onChange={(e) => updateSplitRow(idx, "amount", e.target.value)}
                        placeholder="0"
                        className="v3-input"
                        style={{ borderRadius: 8, padding: "0.5rem 0.6rem", fontSize: "0.85rem", flex: "1 1 0%" }}
                      />
                      {splits.length > 1 && (
                        <button type="button" onClick={() => removeSplitRow(idx)} aria-label="Hapus baris">
                          <X size={16} className="v3-muted" />
                        </button>
                      )}
                    </div>
                  ))}
                  {splits.length < METHODS.length && (
                    <button
                      type="button"
                      onClick={addSplitRow}
                      className="v3-surface-alt v3-muted flex items-center justify-center gap-1"
                      style={{ borderRadius: 8, padding: "0.4rem 0", fontSize: "0.75rem", fontWeight: 600 }}
                    >
                      <Plus size={13} /> Tambah Kantong
                    </button>
                  )}
                  <div className="v3-surface-alt" style={{ borderRadius: 8, padding: "0.5rem 0.7rem" }}>
                    <span className="v3-muted" style={{ fontSize: "0.72rem" }}>Total: </span>
                    <span className="v3-mono v3-gold" style={{ fontWeight: 700, fontSize: "0.85rem" }}>{formatRupiah(splitsTotal)}</span>
                  </div>
                  {touched && !splitsValid && (
                    <p style={{ color: "#D1574A", fontSize: "0.72rem" }}>
                      Setiap baris perlu kantong & jumlah valid, dan kantong tidak boleh dipilih dobel.
                    </p>
                  )}
                </div>
              )}
              <Field label="Status Pembayaran">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Nama Klien / Entitas (opsional)">
                <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="cth. Indofams FC" className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} />
              </Field>
              {type === "income" && (
                <Field label="Durasi Bermain (Jam, opsional)">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="cth. 2"
                    className="v3-input"
                    style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
                  />
                </Field>
              )}
              {type === "income" && (
                <Field label="Promo yang dipakai (opsional)">
                  <input
                    value={promo}
                    onChange={(e) => setPromo(e.target.value)}
                    placeholder="cth. Promo Triwulan"
                    list="promo-suggestions"
                    className="v3-input"
                    style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
                  />
                </Field>
              )}
            </>
          ) : isPiutangType ? (
            <>
              <p className="v3-muted" style={{ fontSize: "0.75rem", padding: "0.4rem 0.6rem", background: "rgba(201,162,39,0.08)", borderRadius: 8 }}>
                {type === "piutang_keluar"
                  ? "Uang keluar dari saldo tapi TIDAK dihitung sebagai expense bisnis — akan muncul di panel Piutang Non-Bisnis di Dashboard."
                  : "Uang masuk kembali ke saldo tapi TIDAK dihitung sebagai income bisnis."}
              </p>
              <Field label="Nama Entitas (wajib)">
                <input
                  value={entity}
                  onChange={(e) => setEntity(e.target.value)}
                  placeholder="cth. Pak Josua / PT Harapan Jaya"
                  className="v3-input"
                  style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
                />
              </Field>
              <Field label="Kategori">
                <select
                  value={category || PIUTANG_CATEGORIES[0]}
                  onChange={(e) => setCategory(e.target.value)}
                  className="v3-input"
                  style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
                >
                  {PIUTANG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Kantong">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="v3-input"
                  style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
                >
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </>
          ) : type === "prive" ? (
            <>
              <p className="v3-muted" style={{ fontSize: "0.75rem" }}>
                Untuk tarik dana pribadi/dividen owner. Saldo kantong tetap berkurang, tapi tidak dihitung sebagai expense bisnis di laporan profit & kategori.
              </p>
              <Field label="Kantong / Metode">
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Dari Kantong">
                <select value={fromMethod} onChange={(e) => setFromMethod(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Ke Kantong">
                <select value={toMethod} onChange={(e) => setToMethod(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              {touched && fromMethod === toMethod && (
                <p style={{ color: "#D1574A", fontSize: "0.75rem" }}>Kantong asal dan tujuan tidak boleh sama.</p>
              )}
            </>
          )}

          {!(isMoneyType && splitMode) && (
            <Field label="Jumlah (Rp)">
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="v3-input"
                style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
              />
              {touched && !(amountNum > 0) && <p style={{ color: "#D1574A", fontSize: "0.75rem", marginTop: "0.25rem" }}>Jumlah harus lebih dari 0.</p>}
            </Field>
          )}

          {type === "income" && (
            <Field label="Total Kontrak (Rp) — isi jika ada sisa yang belum dibayar">
              <input
                type="number"
                inputMode="numeric"
                value={totalKontrak}
                onChange={(e) => setTotalKontrak(e.target.value)}
                placeholder="cth. 1200000 (isi jika ada DP/cicilan)"
                className="v3-input"
                style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
              />
              {totalKontrak && amountNum > 0 && parseFloat(totalKontrak) > amountNum && (
                <p style={{ color: "#C9A227", fontSize: "0.72rem", marginTop: "0.25rem" }}>
                  Sisa piutang: {formatRupiah(parseFloat(totalKontrak) - amountNum)} — akan muncul di panel Piutang Aktif
                </p>
              )}
              {totalKontrak && parseFloat(totalKontrak) > 0 && parseFloat(totalKontrak) <= amountNum && (
                <p style={{ color: "#D1574A", fontSize: "0.72rem", marginTop: "0.25rem" }}>
                  Total Kontrak harus lebih besar dari Jumlah yang sudah dibayar.
                </p>
              )}
            </Field>
          )}

          <Field label="Catatan (opsional)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem", resize: "none" }} />
          </Field>

          <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.9rem", marginTop: "0.3rem" }}>
            {editingTx ? "Simpan Perubahan" : "Simpan Transaksi"}
          </button>

          <datalist id="promo-suggestions">
            {(existingPromos || []).map((p) => <option key={p} value={p} />)}
          </datalist>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <span className="v3-muted" style={{ fontSize: "0.72rem", display: "block", marginBottom: "0.3rem" }}>{label}</span>
      {children}
    </label>
  );
}

function SettingsModal({ initialBalances, monthlyTarget, recurringCategories, onSave, onClose }) {
  const [vals, setVals] = useState({ ...initialBalances });
  const [target, setTarget] = useState(monthlyTarget || 0);
  const [recurring, setRecurring] = useState(recurringCategories || DEFAULT_RECURRING_CATEGORIES);

  const toggleRecurring = (cat) => {
    setRecurring((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>Pengaturan</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>
        <div style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <p className="v3-muted" style={{ fontSize: "0.78rem" }}>
            Atur saldo awal per kantong sebelum mulai mencatat transaksi, supaya total saldo real akurat sejak hari pertama.
          </p>
          {METHODS.map((m) => (
            <Field key={m} label={m}>
              <input
                type="number"
                inputMode="numeric"
                value={vals[m]}
                onChange={(e) => setVals((v) => ({ ...v, [m]: parseFloat(e.target.value) || 0 }))}
                className="v3-input"
                style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
              />
            </Field>
          ))}

          <div style={{ height: 1, background: "rgba(201,162,39,0.15)" }} />

          <p className="v3-muted" style={{ fontSize: "0.78rem" }}>
            Target income per bulan dipakai untuk menghitung progress di Papan Skor Bulanan. Isi 0 kalau belum mau pakai target.
          </p>
          <Field label="Target Income Bulanan (Rp)">
            <input
              type="number"
              inputMode="numeric"
              value={target}
              onChange={(e) => setTarget(parseFloat(e.target.value) || 0)}
              className="v3-input"
              style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
            />
          </Field>

          <div style={{ height: 1, background: "rgba(201,162,39,0.15)" }} />

          <p className="v3-muted" style={{ fontSize: "0.78rem" }}>
            Pilih kategori expense yang rutin tiap bulan. Kalau bulan ini belum tercatat, akan muncul pengingat di dashboard.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.filter((c) => c !== "Lainnya" && c !== "Other Expenses").map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleRecurring(c)}
                className={recurring.includes(c) ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
                style={{ borderRadius: 999, padding: "0.35rem 0.7rem", fontSize: "0.72rem", fontWeight: 600 }}
              >
                {c}
              </button>
            ))}
          </div>

          <button onClick={() => onSave(vals, target, recurring)} className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.9rem" }}>
            Simpan Pengaturan
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 16, width: "100%", maxWidth: 360, padding: "1.3rem" }}>
        <p style={{ fontWeight: 700, marginBottom: "0.4rem" }}>{message || "Hapus item ini?"}</p>
        <p className="v3-muted" style={{ fontSize: "0.82rem", marginBottom: "1.1rem" }}>
          Tindakan ini tidak bisa dibatalkan.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="v3-surface-alt" style={{ flex: 1, borderRadius: 10, padding: "0.55rem 0", fontSize: "0.85rem", fontWeight: 600 }}>
            Batal
          </button>
          <button onClick={onConfirm} style={{ flex: 1, borderRadius: 10, padding: "0.55rem 0", fontSize: "0.85rem", fontWeight: 700, background: "#D1574A", color: "#F2EFE9" }}>
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

function ReconciliationModal({ transactions, initialBalances, onSave, onClose }) {
  const [date, setDate] = useState(todayISO());
  const [actuals, setActuals] = useState({ Cash: "", BCA: "", Mandiri: "", BNI: "" });
  const [recordedBy, setRecordedBy] = useState("");
  const [note, setNote] = useState("");

  const systemBalances = useMemo(
    () => computeBalanceAsOf(transactions, initialBalances, date),
    [transactions, initialBalances, date]
  );

  const preview = METHODS.map((m) => {
    const raw = parseFloat(actuals[m]);
    const actual = isNaN(raw) ? systemBalances[m] : raw;
    return { method: m, system: systemBalances[m], actual, diff: actual - systemBalances[m] };
  });
  const totalDiff = preview.reduce((sum, p) => sum + p.diff, 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const perMethod = {};
    preview.forEach((p) => { perMethod[p.method] = { system: p.system, actual: p.actual, diff: p.diff }; });
    onSave({
      id: uid(),
      date,
      recordedBy: recordedBy.trim(),
      note: note.trim(),
      perMethod,
      totalDiff,
      timestamp: Date.now(),
    });
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>Rekonsiliasi Kas</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <p className="v3-muted" style={{ fontSize: "0.78rem" }}>
            Hitung uang fisik & cek saldo bank, lalu masukkan jumlah aktualnya. Kosongkan kantong yang belum dicek.
          </p>

          <Field label="Tanggal">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} />
          </Field>

          {METHODS.map((m) => {
            const p = preview.find((x) => x.method === m);
            return (
              <Field key={m} label={`${m} — saldo sistem ${formatRupiah(p.system)}`}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={actuals[m]}
                  onChange={(e) => setActuals((v) => ({ ...v, [m]: e.target.value }))}
                  placeholder={String(Math.round(p.system))}
                  className="v3-input"
                  style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
                />
                {actuals[m] !== "" && Math.round(p.diff) !== 0 && (
                  <p className="v3-mono v3-red" style={{ fontSize: "0.72rem", marginTop: "0.2rem" }}>
                    Selisih: {formatRupiah(p.diff)}
                  </p>
                )}
              </Field>
            );
          })}

          <div className="v3-surface-alt" style={{ borderRadius: 10, padding: "0.6rem 0.8rem" }}>
            <p className="v3-muted" style={{ fontSize: "0.72rem" }}>Total Selisih</p>
            <p className={"v3-mono " + (Math.round(totalDiff) === 0 ? "v3-green" : "v3-red")} style={{ fontWeight: 700, fontSize: "1rem" }}>
              {formatRupiah(totalDiff)}
            </p>
          </div>

          <Field label="Dicatat oleh (opsional)">
            <input value={recordedBy} onChange={(e) => setRecordedBy(e.target.value)} placeholder="cth. Holil" className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} />
          </Field>

          <Field label="Catatan (opsional)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="cth. selisih karena kembalian belum dicatat" className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem", resize: "none" }} />
          </Field>

          <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.9rem", marginTop: "0.3rem" }}>
            Simpan Rekonsiliasi
          </button>
        </form>
      </div>
    </div>
  );
}

const FONT_IMPORTS = `@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`;

const CSS = `
${FONT_IMPORTS}
.v3-root { background:#0B0D10; color:#F2EFE9; font-family:'Inter',sans-serif; }
.v3-display { font-family:'Oswald',sans-serif; }
.v3-mono { font-family:'IBM Plex Mono',monospace; }
.v3-surface { background:#15191D; border:1px solid rgba(201,162,39,0.14); }
.v3-surface-alt { background:#1B2025; border:1px solid rgba(255,255,255,0.04); }
.v3-muted { color:#8A9099; }
.v3-gold { color:#C9A227; }
.v3-gold-bg { background:#C9A227; color:#0B0D10; border:none; cursor:pointer; }
.v3-gold-bg:hover { background:#DDB740; }
.v3-green { color:#4CAF61; }
.v3-red { color:#D1574A; }
.v3-overlay { background:rgba(6,7,8,0.78); }
.v3-input { background:#0F1216; border:1px solid rgba(201,162,39,0.2); color:#F2EFE9; }
.v3-input:focus { outline:none; border-color:#C9A227; }
.v3-scroll::-webkit-scrollbar { height:6px; }
.v3-scroll::-webkit-scrollbar-thumb { background:rgba(201,162,39,0.4); border-radius:3px; }
button { font-family:inherit; }
*:focus-visible { outline:2px solid #C9A227; outline-offset:2px; }
@keyframes spin { from { transform:rotate(0deg);} to { transform:rotate(360deg);} }
@media (prefers-reduced-motion: reduce) { * { transition:none !important; animation:none !important; } }
`;
