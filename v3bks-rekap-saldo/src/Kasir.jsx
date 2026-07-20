// Modul Kasir (POS) — input transaksi bergaya aplikasi kasir: tap menu → keranjang →
// bayar. Menu 100% bisa dikustom (grup, item, harga, warna) lewat editor di dalam tab.
// Saat bayar: tiap item tercatat sebagai transaksi income (kategori masing-masing,
// diikat satu nomor struk), item lapangan otomatis mengisi kalender Jadwal (dengan cek
// bentrok), item yang tertaut Stok otomatis memotong stok, dan struk teks siap-salin
// untuk WhatsApp.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Minus, X, Loader2, Trash2, Pencil, Settings2, Copy, Check,
  ShoppingCart, ReceiptText, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import { posKeyFor, bookingKeyFor, inventoryKeyFor } from "./storageKeys.js";
import { suggestPrice, isWeekend, hourLabel } from "./Booking.jsx";

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function formatRupiah(n) {
  const num = Number(n) || 0;
  return "Rp" + Math.round(Math.abs(num)).toLocaleString("id-ID");
}

const PALETTE = ["#C9A227", "#4D7FB0", "#3F9E8A", "#D9772E", "#8A63B3", "#B3596E", "#5F9E3F", "#4FA3C4"];

// Menu awal di-seed dari konfigurasi unit yang sudah ada (lapangan dari bookingGroups,
// add-ons dari inventoryItems, sisanya dari kategori income) — item berharga 0 akan
// menanyakan harga saat di-tap, dan semua bisa diubah lewat editor menu.
export function buildDefaultMenu(unitConfig) {
  const groups = [];
  const items = [];
  let color = 0;
  const nextColor = () => PALETTE[color++ % PALETTE.length];

  if (unitConfig.bookingGroups?.length) {
    groups.push({ id: "grp-lapangan", label: "Lapangan", order: 0 });
    unitConfig.bookingGroups.forEach((bg, i) => {
      items.push({
        id: `menu-lap-${bg.id}`,
        name: unitConfig.bookingGroups.length > 1 ? `Sewa ${bg.label}` : "Sewa Lapangan",
        groupId: "grp-lapangan",
        price: 0,
        priceType: "perHour",
        bookingGroupId: bg.id,
        incomeCategory: bg.incomeCategory,
        inventoryItemId: null,
        color: nextColor(),
        order: i,
        active: true,
      });
    });
  }

  if (unitConfig.inventoryItems?.length) {
    groups.push({ id: "grp-addons", label: "Add-Ons", order: 1 });
    unitConfig.inventoryItems.forEach((it, i) => {
      items.push({
        id: `menu-inv-${it.id}`,
        name: it.name,
        groupId: "grp-addons",
        price: it.unitPrice,
        priceType: "flat",
        bookingGroupId: null,
        incomeCategory: it.incomeCategory,
        inventoryItemId: it.id,
        color: nextColor(),
        order: i,
        active: true,
      });
    });
  }

  // Kategori income "jasa" yang belum tercakup lapangan/stok — di-seed harga 0
  // (kasir akan menanyakan harga saat di-tap), tinggal disesuaikan lewat editor.
  const covered = new Set(items.map((it) => it.incomeCategory));
  const serviceCats = unitConfig.incomeCategories.filter(
    (c) => !covered.has(c) && !c.toLowerCase().startsWith("rental") && !c.toLowerCase().startsWith("membership") &&
      !["Lainnya", "Sponsor", "Event/Turnamen", "Event", "New Member", "Fee Samkot"].includes(c)
  );
  if (serviceCats.length) {
    groups.push({ id: "grp-jasa", label: "Jasa & Lainnya", order: 2 });
    serviceCats.forEach((c, i) => {
      items.push({
        id: `menu-svc-${i}`,
        name: c,
        groupId: "grp-jasa",
        price: 0,
        priceType: "flat",
        bookingGroupId: null,
        incomeCategory: c,
        inventoryItemId: null,
        color: nextColor(),
        order: i,
        active: true,
      });
    });
  }

  return { groups, items };
}

// Bagi diskon proporsional per item supaya jumlah transaksi per kategori tetap sama
// persis dengan uang yang benar-benar diterima (item terakhir menanggung sisa pembulatan).
function allocateAfterDiscount(cartItems, discount) {
  const subtotal = cartItems.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  if (discount <= 0 || subtotal <= 0) return cartItems.map((it) => it.qty * it.unitPrice);
  let allocated = 0;
  return cartItems.map((it, idx) => {
    const gross = it.qty * it.unitPrice;
    let share;
    if (idx === cartItems.length - 1) share = discount - allocated;
    else { share = Math.round((discount * gross) / subtotal); allocated += share; }
    return Math.max(0, gross - share);
  });
}

function bookingsConflict(existing, candidate) {
  return existing.some((b) => {
    if (b.groupId !== candidate.groupId || b.resource !== candidate.resource || b.date !== candidate.date) return false;
    const aS = Number(candidate.startHour), aE = aS + Number(candidate.durationHours);
    const bS = Number(b.startHour), bE = bS + Number(b.durationHours);
    return aS < bE && bS < aE;
  });
}

function buildWhatsappText(unitName, receipt) {
  const lines = [
    `*${unitName.toUpperCase()}*`,
    `Struk ${receipt.number} · ${receipt.date}`,
    "",
    ...receipt.items.map((it) => `${it.name}${it.qty > 1 ? ` x${it.qty}` : ""} — ${formatRupiah(it.qty * it.unitPrice)}`),
    "--------------------",
  ];
  if (receipt.discount > 0) {
    lines.push(`Subtotal: ${formatRupiah(receipt.subtotal)}`);
    lines.push(`Diskon: -${formatRupiah(receipt.discount)}`);
  }
  lines.push(`*TOTAL: ${formatRupiah(receipt.total)}*`);
  lines.push(`Pembayaran: ${receipt.method} (${receipt.status})`);
  if (receipt.customer) lines.push(`Pelanggan: ${receipt.customer}`);
  lines.push("", "Terima kasih! 🙏");
  return lines.join("\n");
}

export default function Kasir({ unitId, unitConfig, canEdit, onRecordReceipt }) {
  const methods = unitConfig.methods;
  const [loaded, setLoaded] = useState(false);
  const [menu, setMenu] = useState({ groups: [], items: [] });
  const [receipts, setReceipts] = useState([]);
  const [inventory, setInventory] = useState({ items: [], movements: [] });
  const [bookings, setBookings] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [hourItem, setHourItem] = useState(null); // menu item perHour yang sedang dikonfigurasi
  const [priceItem, setPriceItem] = useState(null); // menu item harga-0 yang menanyakan harga
  const [viewReceipt, setViewReceipt] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const res = await window.storage.get(posKeyFor(unitId), true);
      const parsed = res?.value ? JSON.parse(res.value) : null;
      if (parsed && Array.isArray(parsed.menu?.items)) {
        setMenu({ groups: parsed.menu.groups || [], items: parsed.menu.items });
        setReceipts(Array.isArray(parsed.receipts) ? parsed.receipts : []);
      } else {
        const seeded = buildDefaultMenu(unitConfig);
        setMenu(seeded);
        setReceipts([]);
        try {
          await window.storage.set(posKeyFor(unitId), JSON.stringify({ menu: seeded, receipts: [] }), true);
        } catch (e) { /* tersimpan lagi saat perubahan berikutnya */ }
      }
      if (unitConfig.hasInventory) {
        const invRes = await window.storage.get(inventoryKeyFor(unitId), true);
        const inv = invRes?.value ? JSON.parse(invRes.value) : null;
        setInventory({ items: inv?.items || [], movements: inv?.movements || [] });
      }
      if (unitConfig.bookingGroups?.length) {
        const bkRes = await window.storage.get(bookingKeyFor(unitId), true);
        const bk = bkRes?.value ? JSON.parse(bkRes.value) : null;
        setBookings(Array.isArray(bk?.bookings) ? bk.bookings : []);
      }
    } catch (e) {
      setMenu(buildDefaultMenu(unitConfig));
      setReceipts([]);
    } finally {
      setLoaded(true);
    }
  }, [unitId, unitConfig]);

  useEffect(() => { load(); }, [load]);

  const persistPos = async (nextMenu, nextReceipts) => {
    const data = { menu: nextMenu ?? menu, receipts: nextReceipts ?? receipts };
    if (nextMenu) setMenu(nextMenu);
    if (nextReceipts) setReceipts(nextReceipts);
    try {
      await window.storage.set(posKeyFor(unitId), JSON.stringify(data), true);
    } catch (e) { /* tersinkron lagi saat load berikutnya */ }
  };

  const stockOf = useCallback(
    (invItemId) => inventory.movements
      .filter((m) => m.itemId === invItemId)
      .reduce((sum, m) => sum + (m.type === "masuk" ? m.quantity : -m.quantity), 0),
    [inventory.movements]
  );

  const sortedGroups = useMemo(
    () => [...menu.groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [menu.groups]
  );
  const currentGroupId = activeGroupId || sortedGroups[0]?.id;
  const visibleItems = useMemo(
    () => menu.items
      .filter((it) => it.groupId === currentGroupId && it.active !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [menu.items, currentGroupId]
  );

  const cartSubtotal = cart.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const cartCount = cart.reduce((s, it) => s + it.qty, 0);

  // ---- Aksi keranjang ----
  const addToCart = (menuItem) => {
    if (menuItem.priceType === "perHour") { setHourItem(menuItem); return; }
    if (!menuItem.price || menuItem.price <= 0) { setPriceItem(menuItem); return; }
    pushFlatItem(menuItem, 1, menuItem.price);
  };

  const pushFlatItem = (menuItem, qty, unitPrice) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === menuItem.id && !c.booking && c.unitPrice === unitPrice);
      if (existing) {
        return prev.map((c) => (c.key === existing.key ? { ...c, qty: c.qty + qty } : c));
      }
      return [...prev, {
        key: uid(),
        menuItemId: menuItem.id,
        name: menuItem.name,
        qty,
        unitPrice,
        incomeCategory: menuItem.incomeCategory,
        inventoryItemId: menuItem.inventoryItemId || null,
        booking: null,
      }];
    });
  };

  const addHourItem = ({ menuItem, group, date, resource, startHour, durationHours, price }) => {
    setCart((prev) => [...prev, {
      key: uid(),
      menuItemId: menuItem.id,
      name: `${menuItem.name} · ${resource} ${hourLabel(startHour)}-${hourLabel(startHour + durationHours)}`,
      qty: 1,
      unitPrice: price,
      incomeCategory: menuItem.incomeCategory,
      inventoryItemId: null,
      booking: { groupId: group.id, groupLabel: group.label, resource, date, startHour, durationHours },
    }]);
    setHourItem(null);
  };

  const changeQty = (key, delta) => {
    setCart((prev) => prev
      .map((c) => (c.key === key ? { ...c, qty: c.qty + delta } : c))
      .filter((c) => c.qty > 0));
  };
  const removeFromCart = (key) => setCart((prev) => prev.filter((c) => c.key !== key));

  // Booking di keranjang juga dihitung sebagai "sudah terisi" supaya dua item lapangan
  // di struk yang sama tidak bisa bentrok satu sama lain.
  const pendingBookings = cart.filter((c) => c.booking).map((c) => c.booking);

  // ---- Checkout ----
  const handleCheckout = async ({ method, status, customer, date, discountType, discountValue, note }) => {
    setSaving(true);
    setCheckoutError("");
    try {
      const discount = discountType === "pct"
        ? Math.round((cartSubtotal * (Number(discountValue) || 0)) / 100)
        : Math.min(cartSubtotal, Number(discountValue) || 0);
      const charged = allocateAfterDiscount(cart, discount);
      const receiptId = uid();
      const number = `#${String(receipts.length + 1).padStart(4, "0")}`;

      // 1. Cek bentrok booking terhadap data jadwal TERBARU (bisa saja berubah sejak tab dibuka).
      let freshBookings = bookings;
      const cartBookings = cart.filter((c) => c.booking);
      if (cartBookings.length) {
        try {
          const bkRes = await window.storage.get(bookingKeyFor(unitId), true);
          const bk = bkRes?.value ? JSON.parse(bkRes.value) : null;
          freshBookings = Array.isArray(bk?.bookings) ? bk.bookings : [];
        } catch (e) { /* pakai data yang sudah dimuat */ }
        for (const c of cartBookings) {
          if (bookingsConflict(freshBookings, c.booking)) {
            setCheckoutError(`Bentrok! ${c.booking.resource} tanggal ${c.booking.date} jam ${hourLabel(c.booking.startHour)} sudah terisi booking lain. Ubah atau hapus item lapangan itu dulu.`);
            setSaving(false);
            return;
          }
        }
      }

      // 2. Catat semua item sebagai transaksi income (satu nomor struk).
      onRecordReceipt(cart.map((c, idx) => ({
        amount: charged[idx],
        category: c.incomeCategory,
        method,
        date,
        entity: (c.booking ? customer || c.booking.resource : customer) || "",
        status,
        note: `Kasir ${number} · ${c.qty > 1 ? `${c.qty}x ` : ""}${c.name}${note ? " · " + note : ""}`,
        duration: c.booking ? c.booking.durationHours : undefined,
        receiptId,
      })));

      // 3. Isi kalender Jadwal untuk item lapangan (income sudah dicatat kasir → recordPayment: false).
      if (cartBookings.length) {
        const newBookings = cartBookings.map((c, i) => ({
          id: uid() + i,
          groupId: c.booking.groupId,
          resource: c.booking.resource,
          date: c.booking.date,
          startHour: c.booking.startHour,
          durationHours: c.booking.durationHours,
          clientName: customer || "Via Kasir",
          clientPhone: "",
          status: status === "DP" ? "DP" : "Lunas",
          amount: c.unitPrice,
          method,
          notes: `Via Kasir · Struk ${number}`,
          recordPayment: false,
          createdAt: Date.now(),
        }));
        const nextBookings = [...freshBookings, ...newBookings];
        setBookings(nextBookings);
        await window.storage.set(bookingKeyFor(unitId), JSON.stringify({ bookings: nextBookings }), true);
      }

      // 4. Potong stok untuk item yang tertaut Stok (income sudah dicatat kasir).
      const stockItems = cart.filter((c) => c.inventoryItemId);
      if (stockItems.length && unitConfig.hasInventory) {
        let freshInv = inventory;
        try {
          const invRes = await window.storage.get(inventoryKeyFor(unitId), true);
          const inv = invRes?.value ? JSON.parse(invRes.value) : null;
          if (inv?.items) freshInv = { items: inv.items, movements: inv.movements || [] };
        } catch (e) { /* pakai data yang sudah dimuat */ }
        const newMovements = stockItems.map((c, i) => ({
          id: uid() + "m" + i,
          itemId: c.inventoryItemId,
          date,
          type: "keluar",
          quantity: c.qty,
          amount: c.qty * c.unitPrice,
          method,
          note: `Kasir ${number}${customer ? " · " + customer : ""}`,
          recordPayment: false,
          recordExpense: false,
          createdAt: Date.now(),
        }));
        const nextInv = { items: freshInv.items, movements: [...freshInv.movements, ...newMovements] };
        setInventory(nextInv);
        await window.storage.set(inventoryKeyFor(unitId), JSON.stringify(nextInv), true);
      }

      // 5. Simpan struk untuk riwayat & WhatsApp.
      const receipt = {
        id: receiptId,
        number,
        date,
        items: cart.map((c) => ({ name: c.name, qty: c.qty, unitPrice: c.unitPrice })),
        subtotal: cartSubtotal,
        discount,
        total: cartSubtotal - discount,
        method,
        status,
        customer: customer || "",
        note: note || "",
        createdAt: Date.now(),
      };
      await persistPos(null, [...receipts, receipt]);

      setCart([]);
      setShowCheckout(false);
      setViewReceipt(receipt);
    } catch (e) {
      setCheckoutError(e?.message || "Gagal menyimpan. Periksa koneksi lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center" style={{ padding: "3rem 0" }}>
        <Loader2 className="v3-gold animate-spin" size={24} />
      </div>
    );
  }

  const recentReceipts = [...receipts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);

  return (
    <div style={{ paddingBottom: cart.length ? "4.5rem" : 0 }}>
      {/* Tab grup menu + tombol editor */}
      <div className="flex items-center gap-1.5" style={{ marginBottom: "0.8rem", flexWrap: "wrap" }}>
        {sortedGroups.map((g) => (
          <button
            key={g.id}
            onClick={() => setActiveGroupId(g.id)}
            className={g.id === currentGroupId ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
            style={{ borderRadius: 999, padding: "0.45rem 0.95rem", fontSize: "0.78rem", fontWeight: 600 }}
          >
            {g.label}
          </button>
        ))}
        {canEdit && (
          <button
            onClick={() => setShowEditor(true)}
            className="v3-surface-alt flex items-center gap-1"
            style={{ marginLeft: "auto", borderRadius: 999, padding: "0.45rem 0.8rem", fontSize: "0.75rem", fontWeight: 600 }}
            title="Atur Menu Kasir"
          >
            <Settings2 size={13} className="v3-gold" /> Atur Menu
          </button>
        )}
      </div>

      {/* Grid tombol menu */}
      {visibleItems.length === 0 ? (
        <div className="v3-surface flex flex-col items-center text-center" style={{ borderRadius: 16, padding: "2.5rem 1.5rem", marginBottom: "1rem" }}>
          <ShoppingCart size={28} className="v3-muted" style={{ marginBottom: "0.6rem" }} />
          <p className="v3-muted" style={{ fontSize: "0.85rem" }}>Belum ada item menu di grup ini. Tambahkan lewat "Atur Menu".</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: "0.6rem", marginBottom: "1.1rem" }}>
          {visibleItems.map((it) => {
            const stock = it.inventoryItemId ? stockOf(it.inventoryItemId) : null;
            const outOfStock = stock !== null && stock <= 0;
            return (
              <button
                key={it.id}
                onClick={() => addToCart(it)}
                className="v3-surface"
                style={{
                  borderRadius: 14,
                  padding: "0.7rem 0.6rem",
                  textAlign: "left",
                  border: `1.5px solid ${it.color || "#C9A227"}55`,
                  background: `linear-gradient(160deg, ${it.color || "#C9A227"}22, transparent 70%)`,
                  cursor: "pointer",
                  minHeight: 76,
                  opacity: outOfStock ? 0.55 : 1,
                }}
              >
                <p style={{ fontSize: "0.76rem", fontWeight: 700, lineHeight: 1.25, marginBottom: "0.3rem" }}>{it.name}</p>
                <p className="v3-mono" style={{ fontSize: "0.7rem", color: it.color || "#C9A227", fontWeight: 700 }}>
                  {it.priceType === "perHour" ? "per jam" : it.price > 0 ? formatRupiah(it.price) : "isi harga"}
                </p>
                {stock !== null && (
                  <p className="v3-muted" style={{ fontSize: "0.62rem", marginTop: "0.15rem" }}>
                    Stok: {stock}{outOfStock ? " (habis)" : ""}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Riwayat struk */}
      <button
        onClick={() => setShowHistory((v) => !v)}
        className="v3-surface-alt flex items-center justify-between"
        style={{ width: "100%", borderRadius: 12, padding: "0.65rem 0.9rem", marginBottom: "0.6rem" }}
      >
        <span className="flex items-center gap-2" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
          <ReceiptText size={14} className="v3-gold" /> Riwayat Struk ({receipts.length})
        </span>
        {showHistory ? <ChevronUp size={14} className="v3-muted" /> : <ChevronDown size={14} className="v3-muted" />}
      </button>
      {showHistory && (
        <div className="flex flex-col" style={{ gap: "0.4rem", marginBottom: "1rem" }}>
          {recentReceipts.length === 0 && (
            <p className="v3-muted" style={{ fontSize: "0.78rem", textAlign: "center", padding: "0.6rem 0" }}>Belum ada struk.</p>
          )}
          {recentReceipts.map((r) => (
            <button
              key={r.id}
              onClick={() => setViewReceipt(r)}
              className="v3-surface flex items-center justify-between"
              style={{ borderRadius: 10, padding: "0.55rem 0.8rem", textAlign: "left" }}
            >
              <div>
                <p style={{ fontSize: "0.78rem", fontWeight: 700 }}>{r.number} · {r.date}</p>
                <p className="v3-muted" style={{ fontSize: "0.68rem" }}>
                  {r.items.length} item{r.customer ? ` · ${r.customer}` : ""} · {r.method} ({r.status})
                </p>
              </div>
              <span className="v3-mono v3-gold" style={{ fontSize: "0.8rem", fontWeight: 700 }}>{formatRupiah(r.total)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Bar keranjang melayang */}
      {cart.length > 0 && (
        <button
          onClick={() => { setCheckoutError(""); setShowCheckout(true); }}
          className="v3-gold-bg flex items-center justify-between"
          style={{
            position: "fixed", bottom: "calc(4.4rem + env(safe-area-inset-bottom))", left: "0.8rem", right: "0.8rem", zIndex: 36,
            maxWidth: 520, margin: "0 auto",
            borderRadius: 14, padding: "0.8rem 1.1rem", fontWeight: 700,
            boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
          }}
        >
          <span className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
            <ShoppingCart size={16} /> {cartCount} item
          </span>
          <span className="v3-mono" style={{ fontSize: "0.9rem" }}>{formatRupiah(cartSubtotal)} · BAYAR</span>
        </button>
      )}

      {hourItem && (
        <HourItemModal
          menuItem={hourItem}
          bookingGroups={unitConfig.bookingGroups || []}
          existingBookings={bookings}
          pendingBookings={pendingBookings}
          onAdd={addHourItem}
          onClose={() => setHourItem(null)}
        />
      )}

      {priceItem && (
        <PricePromptModal
          menuItem={priceItem}
          onAdd={(qty, price) => { pushFlatItem(priceItem, qty, price); setPriceItem(null); }}
          onClose={() => setPriceItem(null)}
        />
      )}

      {showCheckout && (
        <CheckoutModal
          cart={cart}
          subtotal={cartSubtotal}
          methods={methods}
          saving={saving}
          error={checkoutError}
          onChangeQty={changeQty}
          onRemove={removeFromCart}
          onPay={handleCheckout}
          onClose={() => setShowCheckout(false)}
        />
      )}

      {viewReceipt && (
        <ReceiptModal
          receipt={viewReceipt}
          unitName={unitConfig.name}
          onClose={() => setViewReceipt(null)}
        />
      )}

      {showEditor && (
        <MenuEditorModal
          menu={menu}
          unitConfig={unitConfig}
          inventoryItems={inventory.items}
          onSave={(nextMenu) => persistPos(nextMenu, null)}
          onClose={() => setShowEditor(false)}
        />
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

const inputStyle = { borderRadius: 8, padding: "0.5rem 0.6rem", width: "100%", fontSize: "0.85rem" };

function ModalShell({ title, onClose, children, maxWidth = 420 }) {
  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 50, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)", position: "sticky", top: 0, background: "inherit", zIndex: 1 }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>{title}</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Item lapangan: tanya tanggal/lapangan/jam/durasi, harga otomatis dari price band
// (weekday/weekend), cek bentrok langsung terhadap kalender Jadwal + isi keranjang.
function HourItemModal({ menuItem, bookingGroups, existingBookings, pendingBookings, onAdd, onClose }) {
  const group = bookingGroups.find((g) => g.id === menuItem.bookingGroupId) || bookingGroups[0];
  const [date, setDate] = useState(todayISO());
  const [resource, setResource] = useState(group?.resources[0]);
  const [startHour, setStartHour] = useState(group?.startHour ?? 7);
  const [durationHours, setDurationHours] = useState(1);
  const [price, setPrice] = useState(0);
  const [priceTouched, setPriceTouched] = useState(false);

  const suggested = group ? suggestPrice(group, date, startHour, durationHours) : 0;
  useEffect(() => { if (!priceTouched) setPrice(suggested); }, [suggested, priceTouched]);

  if (!group) return null;

  const candidate = { groupId: group.id, resource, date, startHour: Number(startHour), durationHours: Number(durationHours) || 0 };
  const conflict = bookingsConflict(existingBookings, candidate) || bookingsConflict(
    pendingBookings.map((b) => ({ ...b })), candidate
  );

  const hourOptions = [];
  for (let h = group.startHour; h < group.endHour; h++) hourOptions.push(h);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (conflict || !durationHours) return;
    onAdd({
      menuItem, group, date, resource,
      startHour: Number(startHour),
      durationHours: Number(durationHours),
      price: Number(price) || 0,
    });
  };

  return (
    <ModalShell title={menuItem.name} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        <Field label="Tanggal">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="v3-input" style={inputStyle} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={group.label}>
            <select value={resource} onChange={(e) => setResource(e.target.value)} className="v3-input" style={inputStyle}>
              {group.resources.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Jam Mulai">
            <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className="v3-input" style={inputStyle}>
              {hourOptions.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Durasi (jam)">
          <input type="number" min="1" max="12" value={durationHours} onChange={(e) => setDurationHours(e.target.value === "" ? "" : Number(e.target.value))} className="v3-input" style={inputStyle} />
        </Field>
        <Field label={`Harga (saran otomatis ${isWeekend(date) ? "weekend" : "weekday"}: ${formatRupiah(suggested)})`}>
          <input type="number" value={price} onChange={(e) => { setPrice(e.target.value); setPriceTouched(true); }} className="v3-input" style={inputStyle} />
        </Field>
        {conflict && (
          <p className="flex items-center gap-1.5" style={{ color: "#D1574A", fontSize: "0.78rem" }}>
            <AlertTriangle size={13} /> Bentrok! {resource} jam {hourLabel(Number(startHour))} tanggal {date} sudah terisi.
          </p>
        )}
        <button type="submit" disabled={conflict} className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.9rem", opacity: conflict ? 0.5 : 1 }}>
          Masukkan ke Keranjang
        </button>
      </form>
    </ModalShell>
  );
}

// Item dengan harga 0 di menu — tanya harga (dan jumlah) saat di-tap.
function PricePromptModal({ menuItem, onAdd, onClose }) {
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(1);
  const handleSubmit = (e) => {
    e.preventDefault();
    const p = Number(price) || 0;
    const q = Number(qty) || 1;
    if (p <= 0) return;
    onAdd(q, p);
  };
  return (
    <ModalShell title={menuItem.name} onClose={onClose} maxWidth={340}>
      <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        <Field label="Harga (Rp)">
          <input type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} className="v3-input" style={inputStyle} autoFocus required />
        </Field>
        <Field label="Jumlah">
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="v3-input" style={inputStyle} />
        </Field>
        <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.9rem" }}>
          Masukkan ke Keranjang
        </button>
      </form>
    </ModalShell>
  );
}

function CheckoutModal({ cart, subtotal, methods, saving, error, onChangeQty, onRemove, onPay, onClose }) {
  const [method, setMethod] = useState(methods[0]);
  const [status, setStatus] = useState("Lunas");
  const [customer, setCustomer] = useState("");
  const [date, setDate] = useState(todayISO());
  const [discountType, setDiscountType] = useState("rp");
  const [discountValue, setDiscountValue] = useState("");
  const [note, setNote] = useState("");

  const discount = discountType === "pct"
    ? Math.round((subtotal * (Number(discountValue) || 0)) / 100)
    : Math.min(subtotal, Number(discountValue) || 0);
  const total = subtotal - discount;
  const hasBookingItem = cart.some((c) => c.booking);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (cart.length === 0) return;
    onPay({ method, status, customer: customer.trim(), date, discountType, discountValue, note: note.trim() });
  };

  return (
    <ModalShell title="Keranjang & Pembayaran" onClose={onClose} maxWidth={460}>
      <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        <div className="flex flex-col" style={{ gap: "0.5rem" }}>
          {cart.map((c) => (
            <div key={c.key} className="v3-surface-alt flex items-center justify-between" style={{ borderRadius: 10, padding: "0.55rem 0.7rem", gap: "0.5rem" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: "0.78rem", fontWeight: 600, lineHeight: 1.25 }}>{c.name}</p>
                <p className="v3-muted v3-mono" style={{ fontSize: "0.7rem" }}>
                  {c.qty} × {formatRupiah(c.unitPrice)} = {formatRupiah(c.qty * c.unitPrice)}
                </p>
              </div>
              <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                {!c.booking && (
                  <>
                    <button type="button" onClick={() => onChangeQty(c.key, -1)} className="v3-surface flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 999 }}>
                      <Minus size={12} className="v3-muted" />
                    </button>
                    <span className="v3-mono" style={{ fontSize: "0.8rem", fontWeight: 700, minWidth: 18, textAlign: "center" }}>{c.qty}</span>
                    <button type="button" onClick={() => onChangeQty(c.key, 1)} className="v3-surface flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 999 }}>
                      <Plus size={12} className="v3-muted" />
                    </button>
                  </>
                )}
                <button type="button" onClick={() => onRemove(c.key)} className="v3-surface flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 999 }}>
                  <Trash2 size={12} className="v3-red" />
                </button>
              </div>
            </div>
          ))}
          {cart.length === 0 && <p className="v3-muted" style={{ fontSize: "0.8rem", textAlign: "center" }}>Keranjang kosong.</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Tanggal">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="v3-input" style={inputStyle} />
          </Field>
          <Field label={hasBookingItem ? "Nama Pelanggan (untuk jadwal)" : "Nama Pelanggan (opsional)"}>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} className="v3-input" style={inputStyle} required={hasBookingItem} placeholder="mis. Pak Budi" />
          </Field>
        </div>

        <Field label="Kantong Pembayaran">
          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
            {methods.map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={method === m ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
                style={{ flex: 1, minWidth: 70, borderRadius: 8, padding: "0.5rem 0", fontSize: "0.8rem", fontWeight: 600 }}>
                {m}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Status">
          <div className="flex gap-2">
            {["Lunas", "DP"].map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)}
                className={status === s ? "v3-gold-bg" : "v3-surface-alt v3-muted"}
                style={{ flex: 1, borderRadius: 8, padding: "0.5rem 0", fontSize: "0.8rem", fontWeight: 600 }}>
                {s}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Diskon (opsional)">
          <div className="flex gap-2">
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="v3-input" style={{ ...inputStyle, width: 80 }}>
              <option value="rp">Rp</option>
              <option value="pct">%</option>
            </select>
            <input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="v3-input" style={inputStyle} placeholder="0" />
          </div>
        </Field>

        <Field label="Catatan (opsional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className="v3-input" style={inputStyle} />
        </Field>

        <div className="v3-surface-alt" style={{ borderRadius: 12, padding: "0.7rem 0.9rem" }}>
          <div className="flex justify-between" style={{ fontSize: "0.78rem" }}>
            <span className="v3-muted">Subtotal</span>
            <span className="v3-mono">{formatRupiah(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between" style={{ fontSize: "0.78rem" }}>
              <span className="v3-muted">Diskon</span>
              <span className="v3-mono v3-red">-{formatRupiah(discount)}</span>
            </div>
          )}
          <div className="flex justify-between" style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: "0.25rem" }}>
            <span>TOTAL</span>
            <span className="v3-mono v3-gold">{formatRupiah(total)}</span>
          </div>
        </div>

        {error && <p style={{ color: "#D1574A", fontSize: "0.78rem" }}>{error}</p>}

        <button type="submit" disabled={saving || cart.length === 0} className="v3-gold-bg flex items-center justify-center gap-2" style={{ borderRadius: 10, padding: "0.75rem 0", fontWeight: 700, fontSize: "0.95rem", opacity: saving ? 0.7 : 1 }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          BAYAR · {formatRupiah(total)}
        </button>
      </form>
    </ModalShell>
  );
}

function ReceiptModal({ receipt, unitName, onClose }) {
  const [copied, setCopied] = useState(false);
  const waText = buildWhatsappText(unitName, receipt);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(waText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Fallback untuk browser tanpa izin clipboard.
      const ta = document.createElement("textarea");
      ta.value = waText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <ModalShell title={`Struk ${receipt.number}`} onClose={onClose} maxWidth={380}>
      <div style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        <div className="v3-surface-alt" style={{ borderRadius: 12, padding: "0.9rem 1rem" }}>
          <p className="v3-display v3-gold" style={{ fontSize: "0.85rem", fontWeight: 700, textAlign: "center", marginBottom: "0.15rem" }}>{unitName}</p>
          <p className="v3-muted" style={{ fontSize: "0.7rem", textAlign: "center", marginBottom: "0.7rem" }}>{receipt.number} · {receipt.date}</p>
          <div className="flex flex-col" style={{ gap: "0.3rem" }}>
            {receipt.items.map((it, i) => (
              <div key={i} className="flex justify-between" style={{ fontSize: "0.78rem" }}>
                <span style={{ marginRight: "0.6rem" }}>{it.name}{it.qty > 1 ? ` x${it.qty}` : ""}</span>
                <span className="v3-mono" style={{ flexShrink: 0 }}>{formatRupiah(it.qty * it.unitPrice)}</span>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: "rgba(201,162,39,0.25)", margin: "0.6rem 0" }} />
          {receipt.discount > 0 && (
            <>
              <div className="flex justify-between" style={{ fontSize: "0.75rem" }}>
                <span className="v3-muted">Subtotal</span><span className="v3-mono">{formatRupiah(receipt.subtotal)}</span>
              </div>
              <div className="flex justify-between" style={{ fontSize: "0.75rem" }}>
                <span className="v3-muted">Diskon</span><span className="v3-mono v3-red">-{formatRupiah(receipt.discount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
            <span>TOTAL</span><span className="v3-mono v3-gold">{formatRupiah(receipt.total)}</span>
          </div>
          <p className="v3-muted" style={{ fontSize: "0.7rem", marginTop: "0.4rem" }}>
            {receipt.method} ({receipt.status}){receipt.customer ? ` · ${receipt.customer}` : ""}
          </p>
        </div>
        <button onClick={handleCopy} className="v3-gold-bg flex items-center justify-center gap-2" style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.88rem" }}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Tersalin!" : "Salin untuk WhatsApp"}
        </button>
      </div>
    </ModalShell>
  );
}

// Editor menu: kelola grup & item — bebas tambah/ubah/hapus, atur harga, kategori
// income, tautan ke Stok/Jadwal, warna tombol, dan aktif/nonaktif.
function MenuEditorModal({ menu, unitConfig, inventoryItems, onSave, onClose }) {
  const [groups, setGroups] = useState(menu.groups);
  const [items, setItems] = useState(menu.items);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);

  const save = (nextGroups, nextItems) => {
    setGroups(nextGroups);
    setItems(nextItems);
    onSave({ groups: nextGroups, items: nextItems });
  };

  const addGroup = () => {
    const label = newGroupName.trim();
    if (!label) return;
    save([...groups, { id: uid(), label, order: groups.length }], items);
    setNewGroupName("");
  };

  const renameGroup = (id, label) => {
    save(groups.map((g) => (g.id === id ? { ...g, label } : g)), items);
  };

  const deleteGroup = (id) => {
    if (items.some((it) => it.groupId === id)) {
      alert("Grup masih berisi item. Pindahkan atau hapus item-nya dulu.");
      return;
    }
    save(groups.filter((g) => g.id !== id), items);
  };

  const saveItem = (item) => {
    const exists = items.some((it) => it.id === item.id);
    save(groups, exists ? items.map((it) => (it.id === item.id ? item : it)) : [...items, item]);
    setShowItemForm(false);
    setEditingItem(null);
  };

  const toggleActive = (id) => {
    save(groups, items.map((it) => (it.id === id ? { ...it, active: it.active === false } : it)));
  };

  return (
    <ModalShell title="Atur Menu Kasir" onClose={onClose} maxWidth={480}>
      <div style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <p className="v3-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", marginBottom: "0.5rem" }}>Grup Menu</p>
          <div className="flex flex-col" style={{ gap: "0.4rem" }}>
            {groups.map((g) => (
              <div key={g.id} className="flex items-center gap-2">
                <input
                  defaultValue={g.label}
                  onBlur={(e) => { if (e.target.value.trim() && e.target.value !== g.label) renameGroup(g.id, e.target.value.trim()); }}
                  className="v3-input"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={() => deleteGroup(g.id)} className="v3-surface-alt flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0 }}>
                  <Trash2 size={13} className="v3-muted" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Nama grup baru" className="v3-input" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={addGroup} className="v3-gold-bg flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0 }}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: "0.5rem" }}>
            <p className="v3-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase" }}>Item Menu</p>
            <button
              onClick={() => { setEditingItem(null); setShowItemForm(true); }}
              className="v3-gold-bg flex items-center gap-1"
              style={{ borderRadius: 999, padding: "0.35rem 0.8rem", fontSize: "0.72rem", fontWeight: 700 }}
            >
              <Plus size={12} /> Tambah Item
            </button>
          </div>
          <div className="flex flex-col" style={{ gap: "0.4rem" }}>
            {groups.map((g) => {
              const groupItems = items.filter((it) => it.groupId === g.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
              if (!groupItems.length) return null;
              return (
                <div key={g.id}>
                  <p className="v3-muted" style={{ fontSize: "0.68rem", margin: "0.3rem 0" }}>{g.label}</p>
                  {groupItems.map((it) => (
                    <div key={it.id} className="v3-surface-alt flex items-center gap-2" style={{ borderRadius: 10, padding: "0.5rem 0.7rem", marginBottom: "0.3rem", opacity: it.active === false ? 0.5 : 1 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 999, background: it.color || "#C9A227", flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: "0.78rem", fontWeight: 600 }}>{it.name}</p>
                        <p className="v3-muted" style={{ fontSize: "0.66rem" }}>
                          {it.priceType === "perHour" ? "per jam (price band)" : it.price > 0 ? formatRupiah(it.price) : "harga diisi saat tap"} · {it.incomeCategory}
                          {it.inventoryItemId ? " · tertaut Stok" : ""}
                        </p>
                      </div>
                      <button onClick={() => toggleActive(it.id)} className="v3-surface flex items-center justify-center" style={{ borderRadius: 8, padding: "0.25rem 0.5rem", fontSize: "0.62rem", fontWeight: 700, flexShrink: 0 }}>
                        {it.active === false ? "OFF" : "ON"}
                      </button>
                      <button onClick={() => { setEditingItem(it); setShowItemForm(true); }} style={{ flexShrink: 0 }}>
                        <Pencil size={13} className="v3-muted" />
                      </button>
                      <button onClick={() => setConfirmDeleteItem(it.id)} style={{ flexShrink: 0 }}>
                        <Trash2 size={13} className="v3-muted" />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showItemForm && (
        <MenuItemFormModal
          item={editingItem}
          groups={groups}
          unitConfig={unitConfig}
          inventoryItems={inventoryItems}
          onSave={saveItem}
          onClose={() => { setShowItemForm(false); setEditingItem(null); }}
        />
      )}

      {confirmDeleteItem && (
        <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 60, padding: "1rem" }}>
          <div className="v3-surface" style={{ borderRadius: 16, width: "100%", maxWidth: 340, padding: "1.3rem" }}>
            <p style={{ fontWeight: 700, marginBottom: "0.8rem" }}>Hapus item menu ini?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteItem(null)} className="v3-surface-alt" style={{ flex: 1, borderRadius: 10, padding: "0.6rem 0", fontSize: "0.85rem" }}>Batal</button>
              <button
                onClick={() => { save(groups, items.filter((it) => it.id !== confirmDeleteItem)); setConfirmDeleteItem(null); }}
                style={{ flex: 1, borderRadius: 10, padding: "0.6rem 0", fontSize: "0.85rem", fontWeight: 700, background: "#D1574A", color: "#fff", border: "none" }}
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function MenuItemFormModal({ item, groups, unitConfig, inventoryItems, onSave, onClose }) {
  const [name, setName] = useState(item?.name || "");
  const [groupId, setGroupId] = useState(item?.groupId || groups[0]?.id);
  const [priceType, setPriceType] = useState(item?.priceType || "flat");
  const [price, setPrice] = useState(item?.price ?? "");
  const [bookingGroupId, setBookingGroupId] = useState(item?.bookingGroupId || unitConfig.bookingGroups?.[0]?.id || null);
  const [incomeCategory, setIncomeCategory] = useState(item?.incomeCategory || unitConfig.incomeCategories[0]);
  const [inventoryItemId, setInventoryItemId] = useState(item?.inventoryItemId || "");
  const [color, setColor] = useState(item?.color || PALETTE[0]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !groupId) return;
    onSave({
      id: item?.id || uid(),
      name: name.trim(),
      groupId,
      price: priceType === "perHour" ? 0 : Number(price) || 0,
      priceType,
      bookingGroupId: priceType === "perHour" ? bookingGroupId : null,
      incomeCategory,
      inventoryItemId: inventoryItemId || null,
      color,
      order: item?.order ?? 99,
      active: item?.active !== false,
    });
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 60, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 400, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>{item ? "Edit Item Menu" : "Tambah Item Menu"}</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <Field label="Nama di tombol kasir">
            <input value={name} onChange={(e) => setName(e.target.value)} className="v3-input" style={inputStyle} required />
          </Field>
          <Field label="Grup">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="v3-input" style={inputStyle}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </Field>
          {unitConfig.bookingGroups?.length > 0 && (
            <Field label="Tipe Harga">
              <select value={priceType} onChange={(e) => setPriceType(e.target.value)} className="v3-input" style={inputStyle}>
                <option value="flat">Harga tetap</option>
                <option value="perHour">Per jam (ikut price band lapangan + isi jadwal otomatis)</option>
              </select>
            </Field>
          )}
          {priceType === "perHour" ? (
            <Field label="Lapangan / Court">
              <select value={bookingGroupId || ""} onChange={(e) => setBookingGroupId(e.target.value)} className="v3-input" style={inputStyle}>
                {(unitConfig.bookingGroups || []).map((bg) => <option key={bg.id} value={bg.id}>{bg.label}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Harga (Rp — isi 0 supaya harga ditanyakan saat di-tap)">
              <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="v3-input" style={inputStyle} />
            </Field>
          )}
          <Field label="Kategori Income (untuk Laporan)">
            <select value={incomeCategory} onChange={(e) => setIncomeCategory(e.target.value)} className="v3-input" style={inputStyle}>
              {unitConfig.incomeCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          {unitConfig.hasInventory && priceType === "flat" && (
            <Field label="Tautkan ke Stok (otomatis potong stok saat terjual)">
              <select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} className="v3-input" style={inputStyle}>
                <option value="">Tidak tertaut</option>
                {inventoryItems.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Warna tombol">
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {PALETTE.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  style={{ width: 28, height: 28, borderRadius: 999, background: c, border: color === c ? "2.5px solid #fff" : "2.5px solid transparent", cursor: "pointer" }} />
              ))}
            </div>
          </Field>
          <button type="submit" className="v3-gold-bg" style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.9rem" }}>Simpan</button>
        </form>
      </div>
    </div>
  );
}
