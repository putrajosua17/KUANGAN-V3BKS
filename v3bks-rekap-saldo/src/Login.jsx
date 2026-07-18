import React, { useState, useEffect } from "react";
import { Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { anyUsersExist, createFirstAdmin, login, mapAuthError } from "./auth.js";

export default function Login() {
  const [checking, setChecking] = useState(true);
  const [bootstrap, setBootstrap] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    anyUsersExist()
      .then((exists) => setBootstrap(!exists))
      .catch(() => setBootstrap(false))
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (bootstrap && !name.trim()) {
      setError("Nama wajib diisi.");
      return;
    }
    if (password.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }
    setLoading(true);
    try {
      if (bootstrap) {
        await createFirstAdmin({ email, password, name });
      } else {
        await login(email, password);
      }
      // Setelah berhasil, onAuthStateChanged di App.jsx akan otomatis mengambil alih.
    } catch (err) {
      setError(mapAuthError(err));
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="v3-root flex items-center justify-center" style={{ minHeight: "100vh" }}>
        <Loader2 className="v3-gold animate-spin" size={28} />
      </div>
    );
  }

  return (
    <div className="v3-root flex items-center justify-center" style={{ minHeight: "100vh", padding: "1.2rem" }}>
      <div className="v3-surface" style={{ width: "100%", maxWidth: 380, borderRadius: 20, padding: "1.8rem 1.6rem" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: "0.3rem" }}>
          <p className="v3-display v3-gold" style={{ fontSize: "1.4rem", fontWeight: 700, letterSpacing: "0.04em" }}>V3BKS</p>
        </div>
        <p className="v3-muted" style={{ fontSize: "0.78rem", marginBottom: "1.4rem" }}>
          Platform Admin &amp; Finance · Mini Soccer, Badminton &amp; Padel, Sports Studio
        </p>

        {bootstrap && (
          <div className="flex items-start gap-2" style={{ background: "rgba(201,162,39,0.12)", borderRadius: 12, padding: "0.75rem 0.9rem", marginBottom: "1.2rem" }}>
            <UserPlus size={16} className="v3-gold" style={{ flexShrink: 0, marginTop: "0.1rem" }} />
            <p style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
              Belum ada akun sama sekali. Buat akun <strong>Admin pertama</strong> — akun ini otomatis
              mendapat akses penuh ke semua unit dan bisa mengundang akun lain nanti.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          {bootstrap && (
            <label style={{ display: "block" }}>
              <span className="v3-muted" style={{ fontSize: "0.72rem", display: "block", marginBottom: "0.3rem" }}>Nama</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="v3-input"
                style={{ borderRadius: 8, padding: "0.6rem 0.7rem", width: "100%", fontSize: "0.88rem" }}
                placeholder="Nama Anda"
                required
              />
            </label>
          )}
          <label style={{ display: "block" }}>
            <span className="v3-muted" style={{ fontSize: "0.72rem", display: "block", marginBottom: "0.3rem" }}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="v3-input"
              style={{ borderRadius: 8, padding: "0.6rem 0.7rem", width: "100%", fontSize: "0.88rem" }}
              placeholder="nama@email.com"
              autoComplete="username"
              required
            />
          </label>
          <label style={{ display: "block" }}>
            <span className="v3-muted" style={{ fontSize: "0.72rem", display: "block", marginBottom: "0.3rem" }}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="v3-input"
              style={{ borderRadius: 8, padding: "0.6rem 0.7rem", width: "100%", fontSize: "0.88rem" }}
              placeholder="Minimal 6 karakter"
              autoComplete={bootstrap ? "new-password" : "current-password"}
              required
            />
          </label>

          {error && (
            <p style={{ color: "#D1574A", fontSize: "0.78rem" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="v3-gold-bg flex items-center justify-center gap-2"
            style={{ borderRadius: 10, padding: "0.7rem 0", fontWeight: 700, fontSize: "0.9rem", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : bootstrap ? (
              <ShieldCheck size={16} />
            ) : (
              <LogIn size={16} />
            )}
            {bootstrap ? "Buat Akun Admin" : "Masuk"}
          </button>
        </form>

        {!bootstrap && (
          <p className="v3-muted" style={{ fontSize: "0.72rem", marginTop: "1.1rem", textAlign: "center" }}>
            Belum punya akun? Minta admin untuk menambahkan Anda lewat menu Kelola Pengguna.
          </p>
        )}
      </div>
    </div>
  );
}
