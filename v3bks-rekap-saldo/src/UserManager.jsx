import React, { useState, useEffect, useCallback } from "react";
import { X, Loader2, Trash2, UserPlus, ShieldCheck } from "lucide-react";
import { listUsers, createUserAsAdmin, updateUserProfile, deleteUserProfile, mapAuthError } from "./auth.js";
import { UNITS } from "./unitsConfig.js";

const ROLE_LABEL = {
  admin: "Admin (semua unit)",
  finance: "Finance (per unit)",
  coach: "Coach (lihat saja)",
};

export default function UserManager({ currentUid, onClose }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("finance");
  const [units, setUnits] = useState([]);

  const reload = useCallback(() => {
    listUsers().then(setUsers).catch((e) => setError(mapAuthError(e)));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const resetForm = () => {
    setName(""); setEmail(""); setPassword(""); setRole("finance"); setUnits([]);
    setShowForm(false);
  };

  const toggleUnit = (id) => {
    setUnits((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError("Lengkapi nama, email, dan password minimal 6 karakter.");
      return;
    }
    if (role !== "admin" && units.length === 0) {
      setError("Pilih minimal 1 unit untuk role Finance/Coach.");
      return;
    }
    setSaving(true);
    try {
      const unitsObj = role === "admin" ? { "*": true } : units.reduce((acc, id) => ({ ...acc, [id]: true }), {});
      await createUserAsAdmin({
        email, password, name,
        role,
        units: unitsObj,
      });
      resetForm();
      reload();
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u) => {
    if (u.uid === currentUid) {
      alert("Tidak bisa menghapus akun yang sedang dipakai login.");
      return;
    }
    if (!confirm(`Hapus profil "${u.name || u.email}"? Akun login-nya tetap ada di Firebase Auth — hapus manual lewat Firebase Console kalau perlu.`)) return;
    await deleteUserProfile(u.uid);
    reload();
  };

  return (
    <div className="v3-overlay flex items-center justify-center" style={{ position: "fixed", inset: 0, zIndex: 55, padding: "1rem" }}>
      <div className="v3-surface" style={{ borderRadius: 18, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between" style={{ padding: "1rem 1.2rem", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
          <p className="v3-display" style={{ fontSize: "1rem", fontWeight: 700 }}>Kelola Pengguna</p>
          <button onClick={onClose} aria-label="Tutup"><X size={18} className="v3-muted" /></button>
        </div>

        <div style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          {!users ? (
            <div className="flex items-center justify-center" style={{ padding: "1.5rem 0" }}>
              <Loader2 className="v3-gold animate-spin" size={20} />
            </div>
          ) : (
            users.map((u) => (
              <div key={u.uid} className="v3-surface-alt flex items-center justify-between" style={{ borderRadius: 12, padding: "0.7rem 0.9rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>{u.name || "(tanpa nama)"}</p>
                  <p className="v3-muted" style={{ fontSize: "0.72rem" }}>{u.email}</p>
                  <p className="v3-muted" style={{ fontSize: "0.72rem" }}>
                    {ROLE_LABEL[u.role] || u.role}
                    {u.role !== "admin" && u.units ? " · " + Object.keys(u.units).map((id) => UNITS.find((x) => x.id === id)?.shortName || id).join(", ") : ""}
                  </p>
                </div>
                <button onClick={() => handleDelete(u)} aria-label="Hapus pengguna" style={{ flexShrink: 0 }}>
                  <Trash2 size={15} className="v3-muted" />
                </button>
              </div>
            ))
          )}

          {error && <p style={{ color: "#D1574A", fontSize: "0.78rem" }}>{error}</p>}

          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="v3-surface flex items-center justify-center gap-2"
              style={{ borderRadius: 10, padding: "0.65rem 0", fontWeight: 700, fontSize: "0.85rem", border: "1.5px dashed rgba(201,162,39,0.35)" }}
            >
              <UserPlus size={15} className="v3-gold" /> Tambah Pengguna
            </button>
          ) : (
            <form onSubmit={handleCreate} className="v3-surface-alt" style={{ borderRadius: 12, padding: "0.9rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", fontSize: "0.85rem" }} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", fontSize: "0.85rem" }} />
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password awal (min. 6 karakter)" className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", fontSize: "0.85rem" }} />
              <select value={role} onChange={(e) => setRole(e.target.value)} className="v3-input" style={{ borderRadius: 8, padding: "0.5rem 0.6rem", fontSize: "0.85rem" }}>
                <option value="finance">Finance (per unit)</option>
                <option value="coach">Coach (lihat saja)</option>
                <option value="admin">Admin (semua unit)</option>
              </select>
              {role !== "admin" && (
                <div className="flex flex-wrap gap-1.5">
                  {UNITS.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUnit(u.id)}
                      className={units.includes(u.id) ? "v3-gold-bg" : "v3-surface v3-muted"}
                      style={{ borderRadius: 999, padding: "0.35rem 0.7rem", fontSize: "0.72rem", fontWeight: 600 }}
                    >
                      {u.shortName}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={resetForm} className="v3-surface" style={{ flex: 1, borderRadius: 8, padding: "0.55rem 0", fontSize: "0.82rem" }}>
                  Batal
                </button>
                <button type="submit" disabled={saving} className="v3-gold-bg flex items-center justify-center gap-1.5" style={{ flex: 1, borderRadius: 8, padding: "0.55rem 0", fontSize: "0.82rem", fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  Buat Akun
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
