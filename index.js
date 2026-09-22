// Marketplace-only shim: dsh-plugin-hub fails any install whose package has no
// resolvable entry (`exports["."]` → `main` → `index.js`) on either channel. The host
// never imports a bundle entry unless a config row's `name` points at this package,
// and no row does — so this module is intentionally empty. Do not delete.
export {};
