// Modul Jadwal & Booking — kalender per jam per lapangan/court, menggantikan grid Excel
// manual (Putih=Kosong, Kuning=Booked/DP, Biru=Lunas, Merah=Maintenance). Booking baru
// otomatis dicek bentrok, harga disarankan dari price band unit, dan bisa langsung
// tercatat sebagai transaksi income di modul Keuangan.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, X, Loader2, ChevronLeft, ChevronRight, Trash2, Pencil, AlertCircle,
} from "lucide-react";
import { bookingKeyFor } from "./storageKeys.js";

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function formatRupiah(n) {
  const num = Number(n) || 0;
  return "Rp" + Math.round(Math.abs(num)).toLocaleString("id-ID");
}
export function isWeekend(dateStr) {
  const day = new Date(dateStr + "T00:00:00").getDay();
  return day === 0 || day === 6;
}
export function hourLabel(h) {
  const hh = h % 24;
  return `${String(hh).padStart(2, "0")}.00`;
}
function shiftDate(dateStr, deltaDays) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
// Diekspor karena modul Kasir memakai perhitungan harga per jam yang sama.
export function suggestPrice(group, dateStr, startHour, durationHours) {
  const weekend = isWeekend(dateStr);
  const start = Number(startHour) || 0;
  const duration = Number(durationHours) || 0;
  let total = 0;
  for (let h = start; h < start + duration; h++) {
    const band = group.priceBands.find((b) => h >= b.start && h < b.end);
    total += band ? (weekend ? band.weekendRate : band.weekdayRate) : 0;
  }
  return total;
}

const STATUS_COLOR = {
  Booked: { bg: "rgba(201,162,39,0.55)", label: "Booked" },
  DP: { bg: "rgba(201,162,39,0.55)", label: "DP" },
  Lunas: { bg: "rgba(77,127,176,0.6)", label: "Lunas" },
  Maintenance: { bg: "rgba(209,87,74,0.55)", label: "Maintenance" },
};

export default function Booking({ unitId, bookingGroups, methods, canEdit, onRecordPayment }) {
  const [loaded, setLoaded] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedGroupId, setSelectedGroupId] = useState(bookingGroups[0]?.id);
  const [showForm, setShowForm] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState("");

  const group = bookingGroups.find((g) => g.id === selectedGroupId) || bookingGroups[0];

  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const res = await window.storage.get(bookingKeyFor(unitId), true);
      const parsed = res?.value ? JSON.parse(res.value) : null;
      setBookings(Array.isArray(parsed?.bookings) ? parsed.bookings : []);
    } catch (e) {
      setBookings([]);
    } finally {
      setLoaded(true);
    }
  }, [unitId]);

  useEffect(() => { load(); }, [load]);

  const persist = async (next) => {
    setBookings(next);
    try {
      await window.storage.set(bookingKeyFor(unitId), JSON.stringify({ bookings: next }), true);
    } catch (e) { /* akan tersinkron lagi saat load berikutnya */ }
  };

  const dayBookings = useMemo(
    () => bookings.filter((b) => b.groupId === group.id && b.date === selectedDate),
    [bookings, group.id, selectedDate]
  );

  const findBookingAt = (resource, hour) =>
    dayBookings.find((b) => b.resource === resource && hour >= b.startHour && hour < b.startHour + b.durationHours);

  const hasConflict = (resource, startHour, durationHours, excludeId) =>
    dayBookings.some((b) => {
      if (b.resource !== resource || b.id === excludeId) return false;
      const aStart = Number(startHour), aEnd = Number(startHour) + Number(durationHours);
      const bStart = Number(b.startHour), bEnd = Number(b.startHour) + Number(b.durationHours);
      return aStart < bEnd && bStart < aEnd;
    });

  const handleSave = (booking) => {
    if (hasConflict(booking.resource, booking.startHour, booking.durationHours, booking.id)) {
      setError(`Bentrok! ${booking.resource} jam ${hourLabel(booking.startHour)} sudah ada booking lain di jam itu.`);
      return;
    }
    setError("");
    const exists = bookings.some((b) => b.id === booking.id);
    const next = exists ? bookings.map((b) => (b.id === booking.id ? booking : b)) : [...bookings, booking];
    persist(next);
    if (!exists && booking.recordPayment && booking.status !== "Maintenance" && booking.amount > 0 && onRecordPayment) {
      onRecordPayment({
        amount: booking.amount,
        category: group.incomeCategory || `Rental ${group.label}`,
        method: booking.method,
        date: booking.date,
        entity: booking.clientName,
        note: `${group.label} ${booking.resource} · ${hourLabel(booking.startHour)}-${hourLabel(booking.startHour + booking.durationHours)}`,
        duration: booking.durationHours,
      });
    }
    setShowForm(false);
    setEditingBooking(null);
    setPrefill(null);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    persist(bookings.filter((b) => b.id !== confirmDelete));
    setConfirmDelete(null);
  };

  const hours = [];
  for (let h = group.startHour; h < group.endHour; h++) hours.push(h);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center" style={{ padding: "3rem 0" }}>
        <Loader2 className="v3-gold animate-spin" size={24} />
      </div>
    );
  }

  return (
    <div>
      <div className="v3-surface" style={{ borderRadius: 14, padding: "0.8rem 0.9rem", marginBottom: "0.9rem" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: bookingGroups.length > 1 ? "0.7rem" : 0 }}>
          <button onClick={() => setSelectedDate((d) => shiftDate(d, -1))} className="v3-surface-alt flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 999 }}>
            <ChevronLeft size={15} className="v3-muted" />
          </button>
          <div style={{ textAlign: "center" }}>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="v3-input"
              style={{ borderRadius: 8, padding: "0.35rem 0.5rem", fontSize: "0.82rem", textAlign: "center" }}
            />
            <p className="v3-muted" style={{ fontSize: "0.68rem", marginTop: "0.2rem" }}>
              {isWeekend(selectedDate) ? "Weekend" : "Weekday"} · {selectedDate === todayISO() ? "Hari ini" : ""}
            </p>
          </div>
          <button onClick={() => setSelectedDate((d) => shiftDate(d, 1))} className="v3-surface-alt flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 999 }}>
            <ChevronRight size={15} className="v3-muted" />
          </button>
        </div>
        {bookingGroups.length > 1 && (
          <div className="flex gap-1.5">
            {bookingGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                className={g.id === selectedGroupId ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
                style={{ flex: 1, borderRadius: 999, padding: "0.4rem 0", fontSize: "0.78rem", fontWeight: 600 }}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3" style={{ marginBottom: "0.8rem", flexWrap: "wrap" }}>
        {[["Kosong", "rgba(255,255,255,0.05)"], ["Booked/DP", STATUS_COLOR.Booked.bg], ["Lunas", STATUS_COLOR.Lunas.bg], ["Maintenance", STATUS_COLOR.Maintenance.bg]].map(([label, bg]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: "1px solid rgba(255,255,255,0.1)" }} />
            <span className="v3-muted" style={{ fontSize: "0.7rem" }}>{label}</span>
          </div>
        ))}
      </div>

      <div className="v3-surface v3-scroll" style={{ borderRadius: 14, padding: "0.8rem", overflowX: "auto", marginBottom: "1rem" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "#15191D", padding: "0.3rem 0.6rem", textAlign: "left", fontSize: "0.68rem", color: "#8A9099", zIndex: 1 }}>
                {group.label}
              </th>
              {hours.map((h) => (
                <th key={h} style={{ padding: "0.3rem 0.4rem", fontSize: "0.62rem", color: "#8A9099", fontWeight: 500, minWidth: 44 }}>
                  {hourLabel(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.resources.map((resource) => (
              <tr key={resource}>
                <td style={{ position: "sticky", left: 0, background: "#15191D", padding: "0.3rem 0.6rem", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap", zIndex: 1 }}>
                  {resource}
                </td>
                {hours.map((h) => {
                  const b = findBookingAt(resource, h);
                  const isStart = b && b.startHour === h;
                  const bg = b ? STATUS_COLOR[b.status]?.bg : "rgba(255,255,255,0.03)";
                  return (
                    <td
                      key={h}
                      onClick={() => {
                        if (!canEdit) return;
                        if (b) { setEditingBooking(b); setShowForm(true); }
                        else { setPrefill({ resource, hour: h }); setEditingBooking(null); setShowForm(true); }
                      }}
                      style={{
                        border: "1px solid rgba(255,255,255,0.05)",
                        background: bg,
                        height: 34,
                        cursor: canEdit ? "pointer" : "default",
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                      title={b ? `${b.clientName} · ${b.status}` : "Kosong"}
                    >
                      {isStart && (
                        <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#0B0D10", whiteSpace: "nowrap", padding: "0 2px" }}>
                          {b.clientName?.slice(0, 8) || (b.status === "Maintenance" ? "Maint." : "")}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dayBookings.length > 0 && (
        <div className="flex flex-col" style={{ gap: "0.5rem", marginBottom: "1rem" }}>
          <p className="v3-muted" style={{ fontSize: "0.7rem", textTransform: "uppercase" }}>Booking Hari Ini</p>
          {dayBookings.sort((a, b) => a.startHour - b.startHour).map((b) => (
            <div key={b.id} className="v3-surface-alt flex items-center justify-between" style={{ borderRadius: 10, padding: "0.55rem 0.8rem" }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                  {b.resource} · {hourLabel(b.startHour)}-{hourLabel(b.startHour + b.durationHours)}
                </p>
                <p className="v3-muted" style={{ fontSize: "0.72rem" }}>
                  {b.clientName || "-"}{b.clientPhone ? ` · ${b.clientPhone}` : ""} · {b.status}
                </p>
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <span className="v3-mono" style={{ fontSize: "0.78rem", fontWeight: 700 }}>{formatRupiah(b.amount)}</span>
                {canEdit && (
                  <>
                    <button onClick={() => { setEditingBooking(b); setShowForm(true); }}><Pencil size={13} className="v3-muted" /></button>
                    <button onClick={() => setConfirmDelete(b.id)}><Trash2 size={13} className="v3-muted" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <BookingFormModal
          booking={editingBooking}
          prefill={prefill}
          group={group}
          date={selectedDate}
          methods={methods}
          error={error}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingBooking(null); setPrefill(null); setError(""); }}
        />
      )}

      {confirmDelete && (
        <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
          <div className="v3-surface" style={{ borderRadius: 16, width: "100%", maxWidth: 360, padding: "1.3rem" }}>
            <div className="flex items-center gap-2" style={{ marginBottom: "0.8rem" }}>
              <AlertCircle size={18} className="v3-red" />
              <p style={{ fontWeight: 700 }}>Hapus booking ini?</p>
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

function BookingFormModal({ booking, prefill, group, date, methods, error, onSave, onClose }) {
  const [resource, setResource] = useState(booking?.resource || prefill?.resource || group.resources[0]);
  const [bookingDate, setBookingDate] = useState(booking?.date || date);
  const [startHour, setStartHour] = useState(booking?.startHour ?? prefill?.hour ?? group.startHour);
  const [durationHours, setDurationHours] = useState(booking?.durationHours || 1);
  const [clientName, setClientName] = useState(booking?.clientName || "");
  const [clientPhone, setClientPhone] = useState(booking?.clientPhone || "");
  const [status, setStatus] = useState(booking?.status || "DP");
  const [amount, setAmount] = useState(booking?.amount ?? "");
  const [amountTouched, setAmountTouched] = useState(!!booking);
  const [method, setMethod] = useState(booking?.method || methods[0]);
  const [notes, setNotes] = useState(booking?.notes || "");
  const [recordPayment, setRecordPayment] = useState(!booking);

  const suggested = suggestPrice(group, bookingDate, startHour, durationHours);

  useEffect(() => {
    if (!amountTouched) setAmount(suggested);
  }, [suggested, amountTouched]);

  const hourOptions = [];
  for (let h = group.startHour; h < group.endHour; h++) hourOptions.push(h);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (status !== "Maintenance" && !clientName.trim()) return;
    onSave({
      id: booking?.id || uid(),
      groupId: group.id,
      resource,
      date: bookingDate,
      startHour: Number(startHour),
      durationHours: Number(durationHours),
      clientName: status === "Maintenance" ? (clientName.trim() || "Maintenance") : clientName.trim(),
      clientPhone: clientPhone.trim(),
      status,
      amount: Number(amount) || 0,
      method,
      notes: notes.trim(),
      recordPayment,
      createdAt: booking?.createdAt || Date.now(),
    });
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>{booking ? "Edit Booking" : "Booking Baru"}</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          {error && <p style={{ color: "#D1574A", fontSize: "0.8rem" }}>{error}</p>}
          <Field label={group.label}>
            <select value={resource} onChange={(e) => setResource(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
              {group.resources.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Tanggal"><input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Jam Mulai">
              <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                {hourOptions.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </select>
            </Field>
            <Field label="Durasi (jam)">
              <input type="number" min="1" max="12" value={durationHours} onChange={(e) => setDurationHours(e.target.value === "" ? "" : Number(e.target.value))} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} />
            </Field>
          </div>
          <Field label="Status">
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {["DP", "Lunas", "Maintenance"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={status === s ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
                  style={{ flex: 1, borderRadius: 8, padding: "0.5rem 0", fontSize: "0.8rem", fontWeight: 600 }}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
          {status !== "Maintenance" && (
            <>
              <Field label="Nama Klien"><input value={clientName} onChange={(e) => setClientName(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} required /></Field>
              <Field label="No. HP (opsional)"><input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
              <Field label={`Harga (saran otomatis: ${formatRupiah(suggested)})`}>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }}
                  className="v3-input"
                  style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}
                />
              </Field>
              {!booking && (
                <>
                  <Field label="Kantong Pembayaran">
                    <select value={method} onChange={(e) => setMethod(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
                      {methods.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                  <label className="flex items-center gap-2" style={{ fontSize: "0.8rem" }}>
                    <input type="checkbox" checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)} />
                    Catat pembayaran ini sebagai transaksi income
                  </label>
                </>
              )}
            </>
          )}
          <Field label="Catatan (opsional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.9rem" }}>
            {booking ? "Simpan Perubahan" : "Simpan Booking"}
          </button>
        </form>
      </div>
    </div>
  );
}
