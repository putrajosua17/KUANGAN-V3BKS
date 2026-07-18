// Ringkasan lintas unit bisnis — dipakai saat pengguna (biasanya Admin) punya akses
// ke lebih dari 1 unit dan ingin melihat total omzet/saldo gabungan tanpa harus
// membuka satu-satu.
import React, { useState, useEffect } from "react";
import { ArrowLeft, LogOut, Loader2, Building2, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { storageKeyFor, LEGACY_STORAGE_KEY } from "./storageKeys.js";

function formatRupiah(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  return sign + "Rp" + Math.round(Math.abs(num)).toLocaleString("id-ID");
}

function summarize(parsed, methods) {
  const transactions = Array.isArray(parsed?.transactions) ? parsed.transactions : [];
  const initialBalances = parsed?.initialBalances || {};
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const todayStr = now.toISOString().slice(0, 10);

  const balances = { ...initialBalances };
  let monthIncome = 0, monthExpense = 0, todayIncome = 0;

  transactions.forEach((t) => {
    if (t.type === "income") {
      if (t.splits?.length) t.splits.forEach((s) => { balances[s.method] = (balances[s.method] || 0) + s.amount; });
      else balances[t.method] = (balances[t.method] || 0) + t.amount;
      if (t.date?.startsWith(monthStr)) monthIncome += t.amount;
      if (t.date === todayStr) todayIncome += t.amount;
    } else if (t.type === "expense" || t.type === "prive" || t.type === "piutang_keluar") {
      if (t.splits?.length) t.splits.forEach((s) => { balances[s.method] = (balances[s.method] || 0) - s.amount; });
      else balances[t.method] = (balances[t.method] || 0) - t.amount;
      if (t.type === "expense" && t.date?.startsWith(monthStr)) monthExpense += t.amount;
    } else if (t.type === "piutang_balik" || t.type === "pajak_masuk") {
      balances[t.method] = (balances[t.method] || 0) + t.amount;
    } else if (t.type === "transfer") {
      balances[t.fromMethod] = (balances[t.fromMethod] || 0) - t.amount;
      balances[t.toMethod] = (balances[t.toMethod] || 0) + t.amount;
    }
  });

  const totalSaldo = methods.reduce((sum, m) => sum + (balances[m] || 0), 0);
  return { totalSaldo, monthIncome, monthExpense, monthProfit: monthIncome - monthExpense, todayIncome, txCount: transactions.length };
}

export default function ConsolidatedDashboard({ accessibleUnits, onOpenUnit, onBack, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = {};
      for (const unit of accessibleUnits) {
        try {
          let res;
          try {
            res = await window.storage.get(storageKeyFor(unit.id), true);
          } catch (e) {
            if (unit.id === "mini-soccer") {
              try { res = await window.storage.get(LEGACY_STORAGE_KEY, true); } catch (e2) { /* belum ada data */ }
            }
          }
          const parsed = res?.value ? JSON.parse(res.value) : null;
          results[unit.id] = summarize(parsed, unit.methods);
        } catch (e) {
          results[unit.id] = summarize(null, unit.methods);
        }
      }
      if (!cancelled) { setSummaries(results); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [accessibleUnits]);

  const grandTotalSaldo = Object.values(summaries).reduce((s, u) => s + (u?.totalSaldo || 0), 0);
  const grandMonthIncome = Object.values(summaries).reduce((s, u) => s + (u?.monthIncome || 0), 0);
  const grandMonthExpense = Object.values(summaries).reduce((s, u) => s + (u?.monthExpense || 0), 0);

  return (
    <div style={{ minHeight: "100vh", paddingBottom: "3rem" }}>
      <div className="v3-surface" style={{ position: "sticky", top: 0, zIndex: 30, borderBottom: "1px solid rgba(201,162,39,0.18)" }}>
        <div className="flex items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="v3-surface-alt flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 999 }} aria-label="Kembali">
              <ArrowLeft size={16} className="v3-muted" />
            </button>
            <div>
              <p className="v3-display v3-gold" style={{ fontSize: "1.1rem", fontWeight: 700 }}>Ringkasan Semua Unit</p>
              <p className="v3-muted" style={{ fontSize: "0.68rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>CV V3BKS</p>
            </div>
          </div>
          <button onClick={onLogout} className="v3-surface-alt flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 999 }} aria-label="Keluar">
            <LogOut size={16} className="v3-muted" />
          </button>
        </div>
      </div>

      <div className="px-4 py-5 md:px-6" style={{ maxWidth: 1100, margin: "0 auto" }}>
        {loading ? (
          <div className="flex items-center justify-center" style={{ padding: "3rem 0" }}>
            <Loader2 className="v3-gold animate-spin" size={28} />
          </div>
        ) : (
          <>
            <div className="v3-surface" style={{ borderRadius: 18, padding: "1.4rem 1.5rem", marginBottom: "1.2rem" }}>
              <p className="v3-muted" style={{ fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Total Saldo Semua Unit</p>
              <p className="v3-mono v3-gold" style={{ fontSize: "2rem", fontWeight: 700, marginTop: "0.25rem" }}>{formatRupiah(grandTotalSaldo)}</p>
              <div className="flex gap-4" style={{ marginTop: "0.8rem" }}>
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={14} className="v3-green" />
                  <span className="v3-mono v3-green" style={{ fontSize: "0.85rem", fontWeight: 700 }}>{formatRupiah(grandMonthIncome)}</span>
                  <span className="v3-muted" style={{ fontSize: "0.72rem" }}>income bulan ini</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingDown size={14} className="v3-red" />
                  <span className="v3-mono v3-red" style={{ fontSize: "0.85rem", fontWeight: 700 }}>{formatRupiah(grandMonthExpense)}</span>
                  <span className="v3-muted" style={{ fontSize: "0.72rem" }}>expense bulan ini</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col" style={{ gap: "0.9rem" }}>
              {accessibleUnits.map((unit) => {
                const s = summaries[unit.id] || { totalSaldo: 0, monthIncome: 0, monthExpense: 0, monthProfit: 0, todayIncome: 0 };
                return (
                  <button
                    key={unit.id}
                    onClick={() => onOpenUnit(unit.id)}
                    className="v3-surface"
                    style={{ borderRadius: 16, padding: "1.1rem 1.3rem", textAlign: "left", border: "1.5px solid rgba(201,162,39,0.18)", cursor: "pointer" }}
                  >
                    <div className="flex items-center justify-between" style={{ marginBottom: "0.6rem" }}>
                      <div className="flex items-center gap-2">
                        <Building2 size={15} className="v3-gold" />
                        <p className="v3-display" style={{ fontSize: "0.95rem", fontWeight: 700 }}>{unit.name}</p>
                      </div>
                      <span className="v3-muted" style={{ fontSize: "0.72rem" }}>{unit.tagline}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="v3-muted" style={{ fontSize: "0.68rem", textTransform: "uppercase" }}>Saldo</p>
                        <p className="v3-mono" style={{ fontSize: "1rem", fontWeight: 700 }}>{formatRupiah(s.totalSaldo)}</p>
                      </div>
                      <div>
                        <p className="v3-muted" style={{ fontSize: "0.68rem", textTransform: "uppercase" }}>Income Bulan Ini</p>
                        <p className="v3-mono v3-green" style={{ fontSize: "1rem", fontWeight: 700 }}>{formatRupiah(s.monthIncome)}</p>
                      </div>
                      <div>
                        <p className="v3-muted" style={{ fontSize: "0.68rem", textTransform: "uppercase" }}>Profit Bulan Ini</p>
                        <p className={"v3-mono " + (s.monthProfit >= 0 ? "v3-green" : "v3-red")} style={{ fontSize: "1rem", fontWeight: 700 }}>{formatRupiah(s.monthProfit)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
