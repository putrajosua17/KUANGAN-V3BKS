// Modul Membership — daftar member paket (dipakai HSC Sports Studio). Melacak masa
// berlaku & sisa sesi supaya tidak ada member yang lolos expired tanpa follow-up, dan
// bisa langsung mencatat pembayaran sebagai transaksi income di modul Keuangan.
import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, X, Search, Loader2, Phone, RefreshCw as RenewIcon,
  Pencil, Trash2, CheckCircle2, AlertTriangle, AlertCircle, Users,
} from "lucide-react";
import { membershipKeyFor } from "./storageKeys.js";

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function formatRupiah(n) {
  const num = Number(n) || 0;
  return "Rp" + Math.round(Math.abs(num)).toLocaleString("id-ID");
}
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysLeftOf(expiredDate) {
  const today = new Date(todayISO());
  const exp = new Date(expiredDate);
  return Math.ceil((exp - today) / 86400000);
}
function statusOf(member) {
  const dl = daysLeftOf(member.expiredDate);
  if (dl < 0) return "Expired";
  if (dl <= 7) return "Akan Expired";
  return "Aktif";
}
const STATUS_COLOR = { Aktif: "#4CAF61", "Akan Expired": "#C9A227", Expired: "#D1574A" };

export default function Membership({ unitId, membershipClasses, methods, canEdit, onRecordPayment }) {
  const [loaded, setLoaded] = useState(false);
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [renewingMember, setRenewingMember] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const res = await window.storage.get(membershipKeyFor(unitId), true);
      const parsed = res?.value ? JSON.parse(res.value) : null;
      setMembers(Array.isArray(parsed?.members) ? parsed.members : []);
    } catch (e) {
      setMembers([]);
    } finally {
      setLoaded(true);
    }
  }, [unitId]);

  useEffect(() => { load(); }, [load]);

  const persist = async (nextMembers) => {
    setMembers(nextMembers);
    try {
      await window.storage.set(membershipKeyFor(unitId), JSON.stringify({ members: nextMembers }), true);
    } catch (e) { /* akan tersinkron lagi saat load berikutnya */ }
  };

  const handleSave = (member) => {
    const exists = members.some((m) => m.id === member.id);
    const next = exists ? members.map((m) => (m.id === member.id ? member : m)) : [...members, member];
    persist(next);
    setShowForm(false);
    setEditingMember(null);
  };

  const handleRenew = (member, renewData) => {
    const next = members.map((m) =>
      m.id === member.id
        ? {
            ...m,
            classType: renewData.classType,
            startDate: renewData.date,
            expiredDate: renewData.expiredDate,
            sessionsTotal: renewData.sessionsTotal,
            sessionsUsed: 0,
          }
        : m
    );
    persist(next);
    if (renewData.recordPayment && onRecordPayment) {
      onRecordPayment({
        amount: renewData.amount,
        category: `Membership ${renewData.classType}`,
        method: renewData.method,
        date: renewData.date,
        entity: member.name,
        note: "Perpanjangan membership",
      });
    }
    setRenewingMember(null);
  };

  const handleCheckIn = (member) => {
    if (member.sessionsUsed >= member.sessionsTotal) return;
    persist(members.map((m) => (m.id === member.id ? { ...m, sessionsUsed: m.sessionsUsed + 1 } : m)));
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    persist(members.filter((m) => m.id !== confirmDelete));
    setConfirmDelete(null);
  };

  const filtered = members
    .filter((m) => (filterStatus === "all" ? true : statusOf(m) === filterStatus))
    .filter((m) => {
      if (!searchTerm) return true;
      const hay = `${m.name} ${m.phone || ""} ${m.classType}`.toLowerCase();
      return hay.includes(searchTerm.toLowerCase());
    })
    .sort((a, b) => daysLeftOf(a.expiredDate) - daysLeftOf(b.expiredDate));

  const counts = {
    all: members.length,
    Aktif: members.filter((m) => statusOf(m) === "Aktif").length,
    "Akan Expired": members.filter((m) => statusOf(m) === "Akan Expired").length,
    Expired: members.filter((m) => statusOf(m) === "Expired").length,
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center" style={{ padding: "3rem 0" }}>
        <Loader2 className="v3-gold animate-spin" size={24} />
      </div>
    );
  }

  return (
    <div>
      {counts["Akan Expired"] + counts.Expired > 0 && (
        <div className="flex items-center gap-2" style={{ background: "rgba(209,87,74,0.12)", borderRadius: 12, padding: "0.75rem 0.9rem", marginBottom: "1rem" }}>
          <AlertTriangle size={16} className="v3-red" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: "0.82rem" }}>
            <strong>{counts.Expired}</strong> member sudah expired, <strong>{counts["Akan Expired"]}</strong> akan expired dalam 7 hari — perlu di-follow-up untuk perpanjangan.
          </p>
        </div>
      )}

      <div className="v3-surface" style={{ borderRadius: 14, padding: "0.8rem 0.9rem", marginBottom: "0.9rem" }}>
        <div className="v3-input flex items-center gap-2" style={{ borderRadius: 10, padding: "0.5rem 0.7rem", marginBottom: "0.6rem" }}>
          <Search size={14} className="v3-muted" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama, no HP, atau jenis kelas..."
            style={{ background: "transparent", border: "none", outline: "none", color: "#F2EFE9", fontSize: "0.85rem", width: "100%" }}
          />
        </div>
        <div className="v3-scroll flex gap-1.5" style={{ overflowX: "auto" }}>
          {[["all", "Semua"], ["Aktif", "Aktif"], ["Akan Expired", "Akan Expired"], ["Expired", "Expired"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterStatus(val)}
              className={filterStatus === val ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
              style={{ borderRadius: 999, padding: "0.4rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {label} ({counts[val]})
            </button>
          ))}
        </div>
      </div>

      {canEdit && (
        <button
          onClick={() => { setEditingMember(null); setShowForm(true); }}
          className="v3-gold-bg flex items-center justify-center gap-1.5"
          style={{ width: "100%", borderRadius: 12, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.85rem", marginBottom: "1rem" }}
        >
          <Plus size={16} /> Tambah Member
        </button>
      )}

      {filtered.length === 0 ? (
        <div className="v3-surface flex flex-col items-center text-center" style={{ borderRadius: 16, padding: "2.5rem 1.5rem" }}>
          <Users size={28} className="v3-muted" style={{ marginBottom: "0.6rem" }} />
          <p className="v3-muted" style={{ fontSize: "0.85rem" }}>Belum ada member yang cocok dengan filter ini.</p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: "0.7rem" }}>
          {filtered.map((m) => {
            const status = statusOf(m);
            const dl = daysLeftOf(m.expiredDate);
            const sessionsLeft = m.sessionsTotal - m.sessionsUsed;
            return (
              <div key={m.id} className="v3-surface" style={{ borderRadius: 14, padding: "0.9rem 1.1rem" }}>
                <div className="flex items-center justify-between" style={{ marginBottom: "0.4rem" }}>
                  <div className="flex items-center gap-2">
                    <p style={{ fontSize: "0.9rem", fontWeight: 700 }}>{m.name}</p>
                    <span className="v3-mono" style={{ fontSize: "0.62rem", fontWeight: 700, padding: "0.1rem 0.45rem", borderRadius: 999, background: STATUS_COLOR[status], color: "#0B0D10" }}>
                      {status}
                    </span>
                  </div>
                </div>
                <p className="v3-muted" style={{ fontSize: "0.78rem", marginBottom: "0.5rem" }}>
                  {m.classType}
                  {m.phone ? <> · <Phone size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> {m.phone}</> : ""}
                </p>
                <div className="grid grid-cols-3 gap-2" style={{ marginBottom: "0.6rem" }}>
                  <div>
                    <p className="v3-muted" style={{ fontSize: "0.65rem", textTransform: "uppercase" }}>Expired</p>
                    <p className="v3-mono" style={{ fontSize: "0.8rem", fontWeight: 600 }}>{m.expiredDate}</p>
                    <p className={"v3-mono " + (dl < 0 ? "v3-red" : dl <= 7 ? "v3-gold" : "v3-muted")} style={{ fontSize: "0.7rem" }}>
                      {dl < 0 ? `${Math.abs(dl)} hari lalu` : `${dl} hari lagi`}
                    </p>
                  </div>
                  <div>
                    <p className="v3-muted" style={{ fontSize: "0.65rem", textTransform: "uppercase" }}>Sesi</p>
                    <p className="v3-mono" style={{ fontSize: "0.8rem", fontWeight: 600 }}>{m.sessionsUsed}/{m.sessionsTotal}</p>
                    <p className="v3-muted" style={{ fontSize: "0.7rem" }}>{sessionsLeft} sisa</p>
                  </div>
                  <div>
                    <p className="v3-muted" style={{ fontSize: "0.65rem", textTransform: "uppercase" }}>Bayar</p>
                    <p className="v3-mono" style={{ fontSize: "0.8rem", fontWeight: 600 }}>{formatRupiah(m.amountPaid)}</p>
                    <p className="v3-muted" style={{ fontSize: "0.7rem" }}>{m.paymentStatus}</p>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                    <button
                      onClick={() => handleCheckIn(m)}
                      disabled={sessionsLeft <= 0}
                      className="v3-surface-alt flex items-center gap-1"
                      style={{ borderRadius: 999, padding: "0.35rem 0.7rem", fontSize: "0.72rem", fontWeight: 600, opacity: sessionsLeft <= 0 ? 0.4 : 1 }}
                    >
                      <CheckCircle2 size={12} /> +1 Sesi
                    </button>
                    <button
                      onClick={() => setRenewingMember(m)}
                      className="v3-surface-alt flex items-center gap-1"
                      style={{ borderRadius: 999, padding: "0.35rem 0.7rem", fontSize: "0.72rem", fontWeight: 600 }}
                    >
                      <RenewIcon size={12} /> Perpanjang
                    </button>
                    <button
                      onClick={() => { setEditingMember(m); setShowForm(true); }}
                      className="v3-surface-alt flex items-center gap-1"
                      style={{ borderRadius: 999, padding: "0.35rem 0.7rem", fontSize: "0.72rem", fontWeight: 600 }}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete(m.id)}
                      className="v3-surface-alt flex items-center gap-1 v3-red"
                      style={{ borderRadius: 999, padding: "0.35rem 0.7rem", fontSize: "0.72rem", fontWeight: 600 }}
                    >
                      <Trash2 size={12} /> Hapus
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <MemberFormModal
          member={editingMember}
          membershipClasses={membershipClasses}
          methods={methods}
          onSave={handleSave}
          onRecordPayment={onRecordPayment}
          onClose={() => { setShowForm(false); setEditingMember(null); }}
        />
      )}

      {renewingMember && (
        <RenewModal
          member={renewingMember}
          membershipClasses={membershipClasses}
          methods={methods}
          onConfirm={(data) => handleRenew(renewingMember, data)}
          onClose={() => setRenewingMember(null)}
        />
      )}

      {confirmDelete && (
        <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
          <div className="v3-surface" style={{ borderRadius: 16, width: "100%", maxWidth: 360, padding: "1.3rem" }}>
            <div className="flex items-center gap-2" style={{ marginBottom: "0.8rem" }}>
              <AlertCircle size={18} className="v3-red" />
              <p style={{ fontWeight: 700 }}>Hapus member ini?</p>
            </div>
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

function MemberFormModal({ member, membershipClasses, methods, onSave, onRecordPayment, onClose }) {
  const [name, setName] = useState(member?.name || "");
  const [phone, setPhone] = useState(member?.phone || "");
  const [address, setAddress] = useState(member?.address || "");
  const [classType, setClassType] = useState(member?.classType || membershipClasses[0]);
  const [startDate, setStartDate] = useState(member?.startDate || todayISO());
  const [durationDays, setDurationDays] = useState(30);
  const [expiredDate, setExpiredDate] = useState(member?.expiredDate || addDays(todayISO(), 30));
  const [sessionsTotal, setSessionsTotal] = useState(member?.sessionsTotal ?? 12);
  const [sessionsUsed, setSessionsUsed] = useState(member?.sessionsUsed ?? 0);
  const [amountPaid, setAmountPaid] = useState(member?.amountPaid ?? "");
  const [method, setMethod] = useState(methods[0]);
  const [paymentStatus, setPaymentStatus] = useState(member?.paymentStatus || "Lunas");
  const [notes, setNotes] = useState(member?.notes || "");
  const [recordPayment, setRecordPayment] = useState(!member);

  useEffect(() => {
    if (!member) setExpiredDate(addDays(startDate, durationDays));
  }, [startDate, durationDays, member]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const record = {
      id: member?.id || uid(),
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      classType,
      startDate,
      expiredDate,
      sessionsTotal: Number(sessionsTotal) || 0,
      sessionsUsed: Number(sessionsUsed) || 0,
      amountPaid: Number(amountPaid) || 0,
      paymentStatus,
      notes: notes.trim(),
      createdAt: member?.createdAt || Date.now(),
    };
    onSave(record);
    if (!member && recordPayment && Number(amountPaid) > 0 && onRecordPayment) {
      onRecordPayment({
        amount: Number(amountPaid),
        category: `Membership ${classType}`,
        method,
        date: startDate,
        entity: name.trim(),
        note: "Pendaftaran membership baru",
      });
    }
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>{member ? "Edit Member" : "Tambah Member"}</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <Field label="Nama"><input value={name} onChange={(e) => setName(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} required /></Field>
          <Field label="No. HP (opsional)"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <Field label="Alamat (opsional)"><input value={address} onChange={(e) => setAddress(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <Field label="Jenis Kelas">
            <select value={classType} onChange={(e) => setClassType(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
              {membershipClasses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tanggal Daftar"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
            {!member ? (
              <Field label="Masa Berlaku">
                <select value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                  <option value={30}>30 hari</option>
                  <option value={60}>60 hari</option>
                  <option value={90}>90 hari</option>
                </select>
              </Field>
            ) : (
              <Field label="Tanggal Expired"><input type="date" value={expiredDate} onChange={(e) => setExpiredDate(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Jumlah Sesi"><input type="number" value={sessionsTotal} onChange={(e) => setSessionsTotal(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
            <Field label="Sesi Terpakai"><input type="number" value={sessionsUsed} onChange={(e) => setSessionsUsed(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Jumlah Pembayaran (Rp)"><input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
            <Field label="Status Bayar">
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                <option value="Lunas">Lunas</option>
                <option value="Belum Lunas">Belum Lunas</option>
              </select>
            </Field>
          </div>
          {!member && (
            <>
              <Field label="Kantong Pembayaran">
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                  {methods.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2" style={{ fontSize: "0.8rem" }}>
                <input type="checkbox" checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)} />
                Catat pembayaran ini sebagai transaksi income di modul Keuangan
              </label>
            </>
          )}
          <Field label="Catatan (opsional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.9rem" }}>
            {member ? "Simpan Perubahan" : "Tambah Member"}
          </button>
        </form>
      </div>
    </div>
  );
}

function RenewModal({ member, membershipClasses, methods, onConfirm, onClose }) {
  const [classType, setClassType] = useState(member.classType);
  const [date, setDate] = useState(todayISO());
  const [durationDays, setDurationDays] = useState(30);
  const [sessionsTotal, setSessionsTotal] = useState(member.sessionsTotal);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(methods[0]);
  const [recordPayment, setRecordPayment] = useState(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm({
      classType,
      date,
      expiredDate: addDays(date, durationDays),
      sessionsTotal: Number(sessionsTotal) || 0,
      amount: Number(amount) || 0,
      method,
      recordPayment,
    });
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 420 }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>Perpanjang · {member.name}</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <Field label="Jenis Kelas">
            <select value={classType} onChange={(e) => setClassType(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
              {membershipClasses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Mulai"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
            <Field label="Masa Berlaku">
              <select value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                <option value={30}>30 hari</option>
                <option value={60}>60 hari</option>
                <option value={90}>90 hari</option>
              </select>
            </Field>
          </div>
          <Field label="Jumlah Sesi Baru"><input type="number" value={sessionsTotal} onChange={(e) => setSessionsTotal(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Jumlah Bayar (Rp)"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
            <Field label="Kantong">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                {methods.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2" style={{ fontSize: "0.8rem" }}>
            <input type="checkbox" checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)} />
            Catat pembayaran ini sebagai transaksi income
          </label>
          <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.9rem" }}>
            Simpan Perpanjangan
          </button>
        </form>
      </div>
    </div>
  );
}
