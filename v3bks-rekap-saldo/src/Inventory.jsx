// Modul Stok Barang (shuttlecock, grip, raket, bola padel, dst.) — mencatat stok
// masuk/keluar per item, saldo stok otomatis (bukan hitung manual), alert stok menipis,
// dan opsi langsung mencatat mutasi sebagai transaksi income/expense di Keuangan.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, X, Loader2, Trash2, Pencil, Package, ArrowDownCircle, ArrowUpCircle, AlertTriangle, AlertCircle,
} from "lucide-react";
import { inventoryKeyFor } from "./storageKeys.js";

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function formatRupiah(n) {
  const num = Number(n) || 0;
  return "Rp" + Math.round(Math.abs(num)).toLocaleString("id-ID");
}

export default function Inventory({ unitId, defaultItems, methods, canEdit, onRecordPayment, onRecordExpense }) {
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [movementMode, setMovementMode] = useState(null); // { type: "masuk"|"keluar" }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);

  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const res = await window.storage.get(inventoryKeyFor(unitId), true);
      const parsed = res?.value ? JSON.parse(res.value) : null;
      if (parsed && Array.isArray(parsed.items)) {
        setItems(parsed.items);
        setMovements(Array.isArray(parsed.movements) ? parsed.movements : []);
      } else if (defaultItems && defaultItems.length) {
        // Belum pernah dibuka — seed dari daftar default unit ini.
        setItems(defaultItems);
        setMovements([]);
        try {
          await window.storage.set(inventoryKeyFor(unitId), JSON.stringify({ items: defaultItems, movements: [] }), true);
        } catch (e) { /* akan tersimpan lagi saat ada perubahan berikutnya */ }
      } else {
        setItems([]);
        setMovements([]);
      }
    } catch (e) {
      setItems(defaultItems || []);
      setMovements([]);
    } finally {
      setLoaded(true);
    }
  }, [unitId, defaultItems]);

  useEffect(() => { load(); }, [load]);

  const persist = async (next) => {
    const data = { items: next.items ?? items, movements: next.movements ?? movements };
    if (next.items) setItems(next.items);
    if (next.movements) setMovements(next.movements);
    try {
      await window.storage.set(inventoryKeyFor(unitId), JSON.stringify(data), true);
    } catch (e) { /* akan tersinkron lagi saat load berikutnya */ }
  };

  const stockOf = useCallback(
    (itemId) => movements
      .filter((m) => m.itemId === itemId)
      .reduce((sum, m) => sum + (m.type === "masuk" ? m.quantity : -m.quantity), 0),
    [movements]
  );

  const lowStockItems = useMemo(
    () => items.filter((it) => stockOf(it.id) <= (it.lowStockThreshold ?? 0)),
    [items, stockOf]
  );

  const handleSaveItem = (item) => {
    const exists = items.some((it) => it.id === item.id);
    persist({ items: exists ? items.map((it) => (it.id === item.id ? item : it)) : [...items, item] });
    setShowItemForm(false);
    setEditingItem(null);
  };

  const handleDeleteItem = () => {
    if (!confirmDelete) return;
    persist({
      items: items.filter((it) => it.id !== confirmDelete),
      movements: movements.filter((m) => m.itemId !== confirmDelete),
    });
    setConfirmDelete(null);
  };

  const handleSaveMovement = (movement, item) => {
    persist({ movements: [...movements, movement] });
    if (movement.type === "keluar" && movement.recordPayment && onRecordPayment) {
      onRecordPayment({
        amount: movement.amount,
        category: item.incomeCategory,
        method: movement.method,
        date: movement.date,
        entity: movement.note || item.name,
        note: `${item.quantity ? movement.quantity : movement.quantity}x ${item.name}`,
      });
    }
    if (movement.type === "masuk" && movement.recordExpense && onRecordExpense) {
      onRecordExpense({
        amount: movement.amount,
        category: item.expenseCategory,
        method: movement.method,
        date: movement.date,
        note: `Beli ${movement.quantity}x ${item.name}${movement.note ? " · " + movement.note : ""}`,
      });
    }
    setMovementMode(null);
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
      {lowStockItems.length > 0 && (
        <div className="flex items-center gap-2" style={{ background: "rgba(209,87,74,0.12)", borderRadius: 12, padding: "0.75rem 0.9rem", marginBottom: "1rem" }}>
          <AlertTriangle size={16} className="v3-red" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: "0.82rem" }}>
            Stok menipis: <strong>{lowStockItems.map((it) => it.name).join(", ")}</strong>
          </p>
        </div>
      )}

      {canEdit && (
        <button
          onClick={() => { setEditingItem(null); setShowItemForm(true); }}
          className="v3-surface flex items-center justify-center gap-1.5"
          style={{ width: "100%", borderRadius: 12, padding: "0.6rem 0", fontWeight: 600, fontSize: "0.82rem", border: "1.5px dashed rgba(201,162,39,0.35)", marginBottom: "1rem" }}
        >
          <Plus size={14} className="v3-gold" /> Tambah Barang
        </button>
      )}

      {items.length === 0 ? (
        <div className="v3-surface flex flex-col items-center text-center" style={{ borderRadius: 16, padding: "2.5rem 1.5rem" }}>
          <Package size={28} className="v3-muted" style={{ marginBottom: "0.6rem" }} />
          <p className="v3-muted" style={{ fontSize: "0.85rem" }}>Belum ada barang terdaftar.</p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: "0.7rem" }}>
          {items.map((item) => {
            const stock = stockOf(item.id);
            const isLow = stock <= (item.lowStockThreshold ?? 0);
            const isOpen = expandedItem === item.id;
            const itemMovements = movements.filter((m) => m.itemId === item.id).sort((a, b) => (a.date < b.date ? 1 : -1));
            return (
              <div key={item.id} className="v3-surface" style={{ borderRadius: 14, overflow: "hidden" }}>
                <button
                  onClick={() => setExpandedItem(isOpen ? null : item.id)}
                  style={{ width: "100%", padding: "0.9rem 1.1rem", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p style={{ fontSize: "0.88rem", fontWeight: 700 }}>{item.name}</p>
                        {isLow && (
                          <span className="v3-mono" style={{ fontSize: "0.6rem", fontWeight: 700, padding: "0.05rem 0.4rem", borderRadius: 999, background: "#D1574A", color: "#fff" }}>
                            MENIPIS
                          </span>
                        )}
                      </div>
                      <p className="v3-muted" style={{ fontSize: "0.72rem" }}>{formatRupiah(item.unitPrice)} / {item.unit}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p className={"v3-mono " + (isLow ? "v3-red" : "v3-gold")} style={{ fontSize: "1.05rem", fontWeight: 700 }}>{stock}</p>
                      <p className="v3-muted" style={{ fontSize: "0.68rem" }}>{item.unit}</p>
                    </div>
                  </div>
                </button>
                {canEdit && (
                  <div className="flex gap-2" style={{ padding: "0 1.1rem 0.9rem" }}>
                    <button
                      onClick={() => setMovementMode({ type: "masuk", item })}
                      className="v3-surface-alt flex items-center justify-center gap-1"
                      style={{ flex: 1, borderRadius: 999, padding: "0.4rem 0", fontSize: "0.75rem", fontWeight: 600 }}
                    >
                      <ArrowDownCircle size={13} className="v3-green" /> Stok Masuk
                    </button>
                    <button
                      onClick={() => setMovementMode({ type: "keluar", item })}
                      disabled={stock <= 0}
                      className="v3-surface-alt flex items-center justify-center gap-1"
                      style={{ flex: 1, borderRadius: 999, padding: "0.4rem 0", fontSize: "0.75rem", fontWeight: 600, opacity: stock <= 0 ? 0.4 : 1 }}
                    >
                      <ArrowUpCircle size={13} className="v3-red" /> Stok Keluar
                    </button>
                    <button onClick={() => { setEditingItem(item); setShowItemForm(true); }} className="v3-surface-alt flex items-center justify-center" style={{ width: 34, borderRadius: 999 }}>
                      <Pencil size={12} className="v3-muted" />
                    </button>
                    <button onClick={() => setConfirmDelete(item.id)} className="v3-surface-alt flex items-center justify-center" style={{ width: 34, borderRadius: 999 }}>
                      <Trash2 size={12} className="v3-muted" />
                    </button>
                  </div>
                )}
                {isOpen && itemMovements.length > 0 && (
                  <div style={{ padding: "0 1.1rem 1rem" }}>
                    <div style={{ height: 1, background: "rgba(201,162,39,0.15)", marginBottom: "0.6rem" }} />
                    <div className="flex flex-col" style={{ gap: "0.3rem" }}>
                      {itemMovements.slice(0, 10).map((m) => (
                        <div key={m.id} className="flex items-center justify-between" style={{ fontSize: "0.75rem" }}>
                          <span className={m.type === "masuk" ? "v3-green" : "v3-red"}>
                            {m.date} · {m.type === "masuk" ? "+" : "-"}{m.quantity} {item.unit}{m.note ? ` (${m.note})` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showItemForm && (
        <ItemFormModal item={editingItem} onSave={handleSaveItem} onClose={() => { setShowItemForm(false); setEditingItem(null); }} />
      )}

      {movementMode && (
        <MovementFormModal
          type={movementMode.type}
          item={movementMode.item}
          methods={methods}
          onSave={(m) => handleSaveMovement(m, movementMode.item)}
          onClose={() => setMovementMode(null)}
        />
      )}

      {confirmDelete && (
        <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
          <div className="v3-surface" style={{ borderRadius: 16, width: "100%", maxWidth: 360, padding: "1.3rem" }}>
            <div className="flex items-center gap-2" style={{ marginBottom: "0.8rem" }}>
              <AlertCircle size={18} className="v3-red" />
              <p style={{ fontWeight: 700 }}>Hapus barang ini? Riwayat stoknya juga akan terhapus.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="v3-surface-alt" style={{ flex: 1, borderRadius: 10, padding: "0.6rem 0", fontSize: "0.85rem" }}>Batal</button>
              <button onClick={handleDeleteItem} style={{ flex: 1, borderRadius: 10, padding: "0.6rem 0", fontSize: "0.85rem", fontWeight: 700, background: "#D1574A", color: "#fff", border: "none" }}>Hapus</button>
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

function ItemFormModal({ item, onSave, onClose }) {
  const [name, setName] = useState(item?.name || "");
  const [unit, setUnit] = useState(item?.unit || "pcs");
  const [unitPrice, setUnitPrice] = useState(item?.unitPrice ?? "");
  const [lowStockThreshold, setLowStockThreshold] = useState(item?.lowStockThreshold ?? 5);
  const [incomeCategory, setIncomeCategory] = useState(item?.incomeCategory || "");
  const [expenseCategory, setExpenseCategory] = useState(item?.expenseCategory || "");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: item?.id || uid(),
      name: name.trim(),
      unit: unit.trim() || "pcs",
      unitPrice: Number(unitPrice) || 0,
      lowStockThreshold: Number(lowStockThreshold) || 0,
      incomeCategory: incomeCategory.trim(),
      expenseCategory: expenseCategory.trim(),
    });
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 400, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>{item ? "Edit Barang" : "Tambah Barang"}</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <Field label="Nama Barang"><input value={name} onChange={(e) => setName(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} required /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Satuan"><input value={unit} onChange={(e) => setUnit(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} placeholder="pcs / slop / tabung" /></Field>
            <Field label="Harga Jual per Satuan (Rp)"><input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          </div>
          <Field label="Batas Stok Menipis"><input type="number" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <Field label="Kategori Income (saat stok keluar/terjual)"><input value={incomeCategory} onChange={(e) => setIncomeCategory(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} placeholder="mis. Shuttlecock" /></Field>
          <Field label="Kategori Expense (saat stok masuk/beli)"><input value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} placeholder="mis. Stok Shuttlecock" /></Field>
          <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.6rem 0", fontWeight: 700, fontSize: "0.88rem" }}>Simpan</button>
        </form>
      </div>
    </div>
  );
}

function MovementFormModal({ type, item, methods, onSave, onClose }) {
  const isMasuk = type === "masuk";
  const [date, setDate] = useState(todayISO());
  const [quantity, setQuantity] = useState(1);
  const [amount, setAmount] = useState(item.unitPrice || "");
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState(methods[0]);
  const [note, setNote] = useState("");
  const [record, setRecord] = useState(true);

  useEffect(() => {
    if (!amountTouched) setAmount((Number(quantity) || 0) * (item.unitPrice || 0));
  }, [quantity, amountTouched, item.unitPrice]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const qty = Number(quantity) || 0;
    if (qty <= 0) return;
    onSave({
      id: uid(),
      itemId: item.id,
      date,
      type,
      quantity: qty,
      amount: Number(amount) || 0,
      method,
      note: note.trim(),
      recordPayment: isMasuk ? false : record,
      recordExpense: isMasuk ? record : false,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 400 }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>{isMasuk ? "Stok Masuk" : "Stok Keluar"} · {item.name}</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <Field label="Tanggal"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <Field label={`Jumlah (${item.unit})`}><input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <Field label={isMasuk ? "Total Biaya Beli (Rp)" : "Total Harga Jual (Rp)"}>
            <input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} />
          </Field>
          <Field label="Kantong">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }}>
              {methods.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Catatan (opsional, mis. nama pembeli / toko)"><input value={note} onChange={(e) => setNote(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" }} /></Field>
          <label className="flex items-center gap-2" style={{ fontSize: "0.8rem" }}>
            <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
            Catat sebagai transaksi {isMasuk ? "expense" : "income"} di modul Keuangan
          </label>
          <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.9rem" }}>
            Simpan
          </button>
        </form>
      </div>
    </div>
  );
}
