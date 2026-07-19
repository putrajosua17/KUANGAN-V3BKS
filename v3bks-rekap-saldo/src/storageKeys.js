// Key penyimpanan Firebase Realtime Database, satu set per unit bisnis.
export function storageKeyFor(unitId) { return `v3bks_finance_data__${unitId}`; }
export function templatesKeyFor(unitId) { return `v3bks_templates__${unitId}`; }
export function membershipKeyFor(unitId) { return `v3bks_membership__${unitId}`; }
export function payrollKeyFor(unitId) { return `v3bks_payroll__${unitId}`; }

// Key lama sebelum aplikasi ini mendukung multi-unit — dipakai V3BKS Mini Soccer saja.
// Data di key ini otomatis dipindahkan (sekali) ke key baru supaya tidak hilang.
export const LEGACY_STORAGE_KEY = "v3bks_finance_data";
export const LEGACY_TEMPLATES_KEY = "v3bks_templates";
