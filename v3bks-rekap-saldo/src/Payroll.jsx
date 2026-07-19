// Modul Payroll Coach — rekap kehadiran/kelas per coach, hitung komisi otomatis sesuai
// tarif per jenis kelas, dan ringkasan payout siap transfer per bulan (dipakai HSC
// Sports Studio). Menggantikan tabel kehadiran manual yang dihitung tangan tiap bulan.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, X, Loader2, Trash2, Pencil, User, Wallet, ChevronDown, ChevronUp,
} from "lucide-react";
import { payrollKeyFor } from "./storageKeys.js";

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function formatRupiah(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  return sign + "Rp" + Math.round(Math.abs(num)).toLocaleString("id-ID");
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

export default function Payroll({ unitId, classCommissionRates, canEdit }) {
  const [loaded, setLoaded] = useState(false);
  const [coaches, setCoaches] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [adjustments, setAdjustments] = useState([]);

  const [showCoachForm, setShowCoachForm] = useState(false);
  const [editingCoach, setEditingCoach] = useState(null);
  const [showAttendanceForm, setShowAttendanceForm] = useState(false);
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expandedCoach, setExpandedCoach] = useState(null);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const classNames = Object.keys(classCommissionRates || {});

  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const res = await window.storage.get(payrollKeyFor(unitId), true);
      const parsed = res?.value ? JSON.parse(res.value) : null;
      setCoaches(Array.isArray(parsed?.coaches) ? parsed.coaches : []);
      setAttendance(Array.isArray(parsed?.attendance) ? parsed.attendance : []);
      setAdjustments(Array.isArray(parsed?.adjustments) ? parsed.adjustments : []);
    } catch (e) {
      setCoaches([]); setAttendance([]); setAdjustments([]);
    } finally {
      setLoaded(true);
    }
  }, [unitId]);

  useEffect(() => { load(); }, [load]);

  const persist = async (next) => {
    const data = {
      coaches: next.coaches ?? coaches,
      attendance: next.attendance ?? attendance,
      adjustments: next.adjustments ?? adjustments,
    };
    if (next.coaches) setCoaches(next.coaches);
    if (next.attendance) setAttendance(next.attendance);
    if (next.adjustments) setAdjustments(next.adjustments);
    try {
      await window.storage.set(payrollKeyFor(unitId), JSON.stringify(data), true);
    } catch (e) { /* akan tersinkron lagi saat load berikutnya */ }
  };

  const handleSaveCoach = (coach) => {
    const exists = coaches.some((c) => c.id === coach.id);
    persist({ coaches: exists ? coaches.map((c) => (c.id === coach.id ? coach : c)) : [...coaches, coach] });
    setShowCoachForm(false);
    setEditingCoach(null);
  };

  const handleSaveAttendance = (entry) => {
    persist({ attendance: [...attendance, entry] });
    setShowAttendanceForm(false);
  };

  const handleSaveAdjustment = (entry) => {
    persist({ adjustments: [...adjustments, entry] });
    setShowAdjustmentForm(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === "coach") persist({ coaches: coaches.filter((c) => c.id !== confirmDelete.id) });
    if (confirmDelete.type === "attendance") persist({ attendance: attendance.filter((a) => a.id !== confirmDelete.id) });
    if (confirmDelete.type === "adjustment") persist({ adjustments: adjustments.filter((a) => a.id !== confirmDelete.id) });
    setConfirmDelete(null);
  };

  const monthAttendance = attendance.filter((a) => a.date.startsWith(selectedMonth));
  const monthAdjustments = adjustments.filter((a) => a.date.startsWith(selectedMonth));

  const summary = useMemo(() => {
    return coaches.map((coach) => {
      const entries = monthAttendance.filter((a) => a.coachId === coach.id);
      const byClass = {};
      let totalRevenue = 0;
      let totalCommission = 0;
      entries.forEach((e) => {
        const rate = (classCommissionRates?.[e.classType] ?? 0) / 100;
        const commission = e.revenue * rate;
        totalRevenue += e.revenue;
        totalCommission += commission;
        if (!byClass[e.classType]) byClass[e.classType] = { revenue: 0, commission: 0, count: 0 };
        byClass[e.classType].revenue += e.revenue;
        byClass[e.classType].commission += commission;
        byClass[e.classType].count += 1;
      });
      const coachAdjustments = monthAdjustments.filter((a) => a.coachId === coach.id);
      const kasbon = coachAdjustments.filter((a) => a.type === "kasbon").reduce((s, a) => s + a.amount, 0);
      const bonus = coachAdjustments.filter((a) => a.type === "bonus").reduce((s, a) => s + a.amount, 0);
      const totalPayout = totalCommission - kasbon + bonus;
      return { coach, entries, byClass, totalRevenue, totalCommission, kasbon, bonus, totalPayout, adjustments: coachAdjustments };
    });
  }, [coaches, monthAttendance, monthAdjustments, classCommissionRates]);

  const grandTotalPayout = summary.reduce((s, r) => s + r.totalPayout, 0);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center" style={{ padding: "3rem 0" }}>
        <Loader2 className="v3-gold animate-spin" size={24} />
      </div>
    );
  }

  return (
    <div>
      <div className="v3-surface" style={{ borderRadius: 14, padding: "0.9rem 1rem", marginBottom: "1rem" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: "0.6rem" }}>
          <p className="v3-display" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Periode Payroll</p>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="v3-input"
            style={{ borderRadius: 8, padding: "0.4rem 0.6rem", fontSize: "0.82rem" }}
          />
        </div>
        <p className="v3-muted" style={{ fontSize: "0.75rem" }}>Total Payout Bulan Ini</p>
        <p className="v3-mono v3-gold" style={{ fontSize: "1.6rem", fontWeight: 700 }}>{formatRupiah(grandTotalPayout)}</p>
      </div>

      {canEdit && (
        <div className="flex gap-2" style={{ marginBottom: "1rem" }}>
          <button
            onClick={() => setShowAttendanceForm(true)}
            className="v3-surface flex items-center justify-center gap-1.5"
            style={{ flex: 1, borderRadius: 12, padding: "0.65rem 0", fontWeight: 600, fontSize: "0.82rem", border: "1.5px solid rgba(201,162,39,0.25)" }}
            disabled={coaches.length === 0}
          >
            <Plus size={14} className="v3-gold" /> Catat Kehadiran
          </button>
          <button
            onClick={() => setShowAdjustmentForm(true)}
            className="v3-surface flex items-center justify-center gap-1.5"
            style={{ flex: 1, borderRadius: 12, padding: "0.65rem 0", fontWeight: 600, fontSize: "0.82rem", border: "1.5px solid rgba(201,162,39,0.25)" }}
            disabled={coaches.length === 0}
          >
            <Plus size={14} className="v3-gold" /> Kasbon/Bonus
          </button>
          <button
            onClick={() => { setEditingCoach(null); setShowCoachForm(true); }}
            className="v3-surface flex items-center justify-center gap-1.5"
            style={{ flex: 1, borderRadius: 12, padding: "0.65rem 0", fontWeight: 600, fontSize: "0.82rem", border: "1.5px solid rgba(201,162,39,0.25)" }}
          >
            <User size={14} className="v3-gold" /> Coach
          </button>
        </div>
      )}

      {coaches.length === 0 ? (
        <div className="v3-surface flex flex-col items-center text-center" style={{ borderRadius: 16, padding: "2.5rem 1.5rem" }}>
          <User size={28} className="v3-muted" style={{ marginBottom: "0.6rem" }} />
          <p className="v3-muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>Belum ada coach terdaftar.</p>
          {canEdit && (
            <button onClick={() => setShowCoachForm(true)} className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.55rem 1.1rem", fontWeight: 700, fontSize: "0.85rem" }}>
              + Tambah Coach
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: "0.7rem" }}>
          {summary.map((row) => {
            const isOpen = expandedCoach === row.coach.id;
            return (
              <div key={row.coach.id} className="v3-surface" style={{ borderRadius: 14, overflow: "hidden" }}>
                <button
                  onClick={() => setExpandedCoach(isOpen ? null : row.coach.id)}
                  className="flex items-center justify-between"
                  style={{ width: "100%", padding: "0.9rem 1.1rem", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <div>
                    <p style={{ fontSize: "0.9rem", fontWeight: 700 }}>{row.coach.name}</p>
                    <p className="v3-muted" style={{ fontSize: "0.72rem" }}>
                      {row.coach.bank ? `${row.coach.bank} · ` : ""}{row.coach.bankAccount || "belum ada rekening"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div style={{ textAlign: "right" }}>
                      <p className="v3-mono v3-gold" style={{ fontSize: "0.95rem", fontWeight: 700 }}>{formatRupiah(row.totalPayout)}</p>
                      <p className="v3-muted" style={{ fontSize: "0.68rem" }}>{row.entries.length} sesi</p>
                    </div>
                    {isOpen ? <ChevronUp size={16} className="v3-muted" /> : <ChevronDown size={16} className="v3-muted" />}
                  </div>
                </button>
                {isOpen && (
                  <div style={{ padding: "0 1.1rem 1rem" }}>
                    <div style={{ height: 1, background: "rgba(201,162,39,0.15)", marginBottom: "0.7rem" }} />
                    {Object.entries(row.byClass).length > 0 && (
                      <div className="flex flex-col" style={{ gap: "0.35rem", marginBottom: "0.7rem" }}>
                        {Object.entries(row.byClass).map(([cls, v]) => (
                          <div key={cls} className="flex items-center justify-between" style={{ fontSize: "0.78rem" }}>
                            <span className="v3-muted">{cls} · {v.count}x ({classCommissionRates?.[cls] ?? 0}%)</span>
                            <span className="v3-mono">{formatRupiah(v.commission)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between" style={{ fontSize: "0.78rem", marginBottom: "0.2rem" }}>
                      <span className="v3-muted">Total Komisi</span>
                      <span className="v3-mono">{formatRupiah(row.totalCommission)}</span>
                    </div>
                    {row.kasbon > 0 && (
                      <div className="flex items-center justify-between" style={{ fontSize: "0.78rem", marginBottom: "0.2rem" }}>
                        <span className="v3-red">Kasbon</span>
                        <span className="v3-mono v3-red">-{formatRupiah(row.kasbon)}</span>
                      </div>
                    )}
                    {row.bonus > 0 && (
                      <div className="flex items-center justify-between" style={{ fontSize: "0.78rem", marginBottom: "0.2rem" }}>
                        <span className="v3-green">Bonus</span>
                        <span className="v3-mono v3-green">+{formatRupiah(row.bonus)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between" style={{ fontSize: "0.85rem", fontWeight: 700, marginTop: "0.4rem" }}>
                      <span>Total Payout</span>
                      <span className="v3-mono v3-gold">{formatRupiah(row.totalPayout)}</span>
                    </div>

                    {canEdit && (row.entries.length > 0 || row.adjustments.length > 0) && (
                      <div className="flex flex-col" style={{ gap: "0.3rem", marginTop: "0.8rem" }}>
                        <p className="v3-muted" style={{ fontSize: "0.68rem", textTransform: "uppercase" }}>Rincian</p>
                        {row.entries.map((e) => (
                          <div key={e.id} className="flex items-center justify-between v3-surface-alt" style={{ borderRadius: 8, padding: "0.4rem 0.6rem", fontSize: "0.72rem" }}>
                            <span>{e.date} · {e.classType} ({e.sessionType})</span>
                            <div className="flex items-center gap-2">
                              <span className="v3-mono">{formatRupiah(e.revenue)}</span>
                              <button onClick={() => setConfirmDelete({ type: "attendance", id: e.id })}><Trash2 size={11} className="v3-muted" /></button>
                            </div>
                          </div>
                        ))}
                        {row.adjustments.map((a) => (
                          <div key={a.id} className="flex items-center justify-between v3-surface-alt" style={{ borderRadius: 8, padding: "0.4rem 0.6rem", fontSize: "0.72rem" }}>
                            <span>{a.date} · {a.type === "kasbon" ? "Kasbon" : "Bonus"}{a.note ? ` (${a.note})` : ""}</span>
                            <div className="flex items-center gap-2">
                              <span className="v3-mono">{formatRupiah(a.amount)}</span>
                              <button onClick={() => setConfirmDelete({ type: "adjustment", id: a.id })}><Trash2 size={11} className="v3-muted" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {canEdit && (
                      <div className="flex gap-2" style={{ marginTop: "0.8rem" }}>
                        <button onClick={() => { setEditingCoach(row.coach); setShowCoachForm(true); }} className="v3-surface-alt flex items-center gap-1" style={{ borderRadius: 999, padding: "0.35rem 0.7rem", fontSize: "0.72rem", fontWeight: 600 }}>
                          <Pencil size={11} /> Edit Coach
                        </button>
                        <button onClick={() => setConfirmDelete({ type: "coach", id: row.coach.id })} className="v3-surface-alt flex items-center gap-1 v3-red" style={{ borderRadius: 999, padding: "0.35rem 0.7rem", fontSize: "0.72rem", fontWeight: 600 }}>
                          <Trash2 size={11} /> Hapus Coach
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCoachForm && (
        <CoachFormModal coach={editingCoach} onSave={handleSaveCoach} onClose={() => { setShowCoachForm(false); setEditingCoach(null); }} />
      )}
      {showAttendanceForm && (
        <AttendanceFormModal coaches={coaches} classNames={classNames} onSave={handleSaveAttendance} onClose={() => setShowAttendanceForm(false)} />
      )}
      {showAdjustmentForm && (
        <AdjustmentFormModal coaches={coaches} onSave={handleSaveAdjustment} onClose={() => setShowAdjustmentForm(false)} />
      )}
      {confirmDelete && (
        <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
          <div className="v3-surface" style={{ borderRadius: 16, width: "100%", maxWidth: 360, padding: "1.3rem" }}>
            <p style={{ fontWeight: 700, marginBottom: "0.9rem" }}>Hapus data ini?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="v3-surface-alt" style={{ flex: 1, borderRadius: 10, padding: "0.6rem 0", fontSize: "0.85rem" }}>Batal</button>
              <button onClick={handleDelete} style={{ flex: 1, borderRadius: 10, padding: "0.6rem 0", fontSize: "0.85rem", fontWeight: 700, background: "#D1574A", color: "#fff", border: "none" }}>Hapus</button>
            </div>
          </div>
        </div>
      )}
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

function CoachFormModal({ coach, onSave, onClose }) {
  const [name, setName] = useState(coach?.name || "");
  const [bank, setBank] = useState(coach?.bank || "");
  const [bankAccount, setBankAccount] = useState(coach?.bankAccount || "");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ id: coach?.id || uid(), name: name.trim(), bank: bank.trim(), bankAccount: bankAccount.trim() });
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 380 }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>{coach ? "Edit Coach" : "Tambah Coach"}</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <Field label="Nama Coach"><input value={name} onChange={(e) => setName(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} required /></Field>
          <Field label="Bank"><input value={bank} onChange={(e) => setBank(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} placeholder="mis. Mandiri" /></Field>
          <Field label="No. Rekening"><input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.6rem 0", fontWeight: 700, fontSize: "0.88rem" }}>Simpan</button>
        </form>
      </div>
    </div>
  );
}

function AttendanceFormModal({ coaches, classNames, onSave, onClose }) {
  const [coachId, setCoachId] = useState(coaches[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const [classType, setClassType] = useState(classNames[0] || "");
  const [sessionType, setSessionType] = useState("reguler");
  const [revenue, setRevenue] = useState("");
  const [note, setNote] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!coachId || !classType) return;
    onSave({ id: uid(), coachId, date, classType, sessionType, revenue: Number(revenue) || 0, note: note.trim() });
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 400 }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>Catat Kehadiran</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <Field label="Coach">
            <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Tanggal"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <Field label="Jenis Kelas">
            <select value={classType} onChange={(e) => setClassType(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
              {classNames.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Jenis Sesi">
            <select value={sessionType} onChange={(e) => setSessionType(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
              <option value="reguler">Reguler</option>
              <option value="private">Private</option>
            </select>
          </Field>
          <Field label="Revenue Sesi (Rp)"><input type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} required /></Field>
          <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.6rem 0", fontWeight: 700, fontSize: "0.88rem" }}>Simpan</button>
        </form>
      </div>
    </div>
  );
}

function AdjustmentFormModal({ coaches, onSave, onClose }) {
  const [coachId, setCoachId] = useState(coaches[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState("kasbon");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!coachId) return;
    onSave({ id: uid(), coachId, date, type, amount: Number(amount) || 0, note: note.trim() });
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 380 }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>Kasbon / Bonus</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <Field label="Coach">
            <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Jenis">
            <div className="flex gap-2">
              {["kasbon", "bonus"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={type === t ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
                  style={{ flex: 1, borderRadius: 8, padding: "0.5rem 0", fontSize: "0.82rem", fontWeight: 600, textTransform: "capitalize" }}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Tanggal"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <Field label="Jumlah (Rp)"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} required /></Field>
          <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.6rem 0", fontWeight: 700, fontSize: "0.88rem" }}>Simpan</button>
        </form>
      </div>
    </div>
  );
}
