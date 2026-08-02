// Context supaya sub-komponen (TransactionModal, SettingsModal, dll.) bisa membaca
// konfigurasi unit yang sedang aktif (kantong, kategori, dst.) tanpa harus dioper
// lewat props satu per satu.
import React, { createContext, useContext } from "react";

const UnitConfigContext = createContext(null);

export function UnitConfigProvider({ value, children }) {
  return <UnitConfigContext.Provider value={value}>{children}</UnitConfigContext.Provider>;
}

export function useUnitConfig() {
  const ctx = useContext(UnitConfigContext);
  if (!ctx) throw new Error("useUnitConfig harus dipakai di dalam <UnitConfigProvider>");
  return ctx;
}
