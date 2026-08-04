# webOS App Storage

Cloud key/value storage for webOS apps and PWAs, tied to the user's webOS
Account (the same account used by App Museum II). Save small per-user values —
settings, preferences, reading/game progress — and read them back on any
device the user signs into, including community apps running as PWAs on other
platforms.

One file, no dependencies, framework-agnostic: plain ES5 + XMLHttpRequest +
callbacks, so the identical `webos-app-storage.js` runs in Mojo apps, Enyo
apps, and modern browsers. Copy it into your project or symlink it from this
repo, like the other webos-common libraries.

## What it is (and isn't)

- Values are **scrambled on the client** (XXTEA, salted per app+key) before
  upload, so user data is never plainly readable on the server, in transit
  logs, or in a database export. This is obfuscation, not encryption — the
  scheme ships in this open-source file. **Never store secrets** (passwords,
  API keys, tokens) in app storage.
- It is a **sync store, not a file store**. Quotas (server-side): 32 KB per
  value, 200 keys and 512 KB per app per account, 2 MB per account.
- Writes are **last-write-wins** by default, with optional revision checks
  for conflict-aware syncing (see below).

## Quick start

```js
var store = new WebOSAppStorage({ appId: "com.example.myapp" });

// On webOS: reuse the device's webOS Account sign-in (no password prompt):
store.useDeviceAccount(function (err) {
    if (!err) { syncNow(); }
});

// In a browser/PWA: sign in with the account login + password once; the
// token persists in localStorage:
if (!store.isSignedIn()) {
    store.signIn(login, password, function (err, account) { ... });
}

// Save and load (any JSON-serializable value):
store.set("settings", { theme: 2, fontSize: 18 }, function (err, res) { ... });
store.get("settings", function (err, rec) {
    if (err && err.code === "not_found") { /* first run */ }
    else if (!err) { applySettings(rec.value); }
});
```

## API

All callbacks are Node-style `callback(err, result)`; `err` is `null` on
success, otherwise `{ code, status, message, ... }`. Common codes:
`unauthorized`, `not_found`, `conflict`, `quota_exceeded`, `rate_limited`,
`network`.

### Auth

| Method | Notes |
|---|---|
| `signIn(login, password, cb)` | Browser/PWA sign-in. Generates and persists a `pwa-<uuid>` device id; the browser becomes one revocable "device" on the account. `cb(err, account)` |
| `useDeviceAccount(cb)` | webOS only: adopt the token from the device's webOS Account via the Luna bus. |
| `setToken(token[, deviceId])` | Bring your own token (apps with their own account plumbing). |
| `refreshToken(cb)` | Trade the token for a fresh one (tokens live 365 days). |
| `signOut(cb)` | Revoke this device's token server-side and forget it locally. |
| `isSignedIn()` / `getAccount()` | Local state accessors. |

### Storage

| Method | Notes |
|---|---|
| `set(key, value[, opts], cb)` | `value` is any JSON-serializable value. `opts.expectedRevision` for conflict-aware writes (`0` = create-only). `cb(err, {revision, usage})` |
| `get(key, cb)` | `cb(err, {key, value, revision, updatedAt})` |
| `getAll(cb)` | `cb(err, {items, usage})` |
| `list(cb)` | Keys + revisions only, no values — cheap "anything changed?" poll. |
| `setMany(items, cb)` | `items = [{key, value, expectedRevision?}]`, max 100. Per-item failures land in `results[i].error`, they don't fail the batch. |
| `remove(key, cb)` | `cb(err, {deleted, usage})` |
| `usage(cb)` | Quota usage for this app and the account. |

### Conflict-aware sync

Every record has a server-side `revision`, bumped on each write. For state
where blind last-write-wins could lose data (e.g. reading progress advancing
on two devices), remember the revision you last saw and pass it back:

```js
store.set("progress", localState, { expectedRevision: lastSeenRev }, function (err, res) {
    if (err && err.code === "conflict") {
        // err.current = the server's record, already unscrambled.
        var merged = mergeProgress(localState, err.current.value);
        store.set("progress", merged, { expectedRevision: err.current.revision }, done);
    }
});
```

Never compare client timestamps — device clocks drift; revisions are the only
ordering that counts.

## Conventions

- **Keys**: 1–128 chars of `A-Za-z0-9 . _ : @ -`. Suggested naming:
  `settings`, `progress`, or namespaced per item like `book:<id>`,
  `save:<slot>`.
- **appId**: your app's reverse-DNS id. All keys live in your app's own
  namespace. Note that tokens are per account+device, not per app — any app
  the user runs on a signed-in device could technically address your
  namespace (it gets scrambled blobs, but treat the namespace as shared-trust,
  same as the device filesystem).
- **Sync pattern** (what Papyrus uses): pull on open, push on close, throttled
  background push while active, `list()` to poll cheaply.

## Platform notes

- Old webOS WebKit: the transport retries once on `status === 0` (cold TLS
  handshake) automatically. Everything is ES5 — no Promises, no fetch.
- Browsers: requests carry an `Authorization` header, which triggers CORS
  preflight; the service answers it. Tokens persist in `localStorage`.
- The service base URL defaults to the webOS Archive catalog service and can
  be overridden via `opts.serviceBase` (discoverable from
  `getConfig.php` → `storage_host`).
