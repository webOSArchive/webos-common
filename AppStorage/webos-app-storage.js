/*
 * webos-app-storage.js — client SDK for the webOS Archive cloud app storage.
 *
 * Lets any webOS app or PWA save small per-user values (settings, progress,
 * preferences) against the user's webOS Account and read them back from any
 * signed-in device. Framework-agnostic: plain ES5 + XMLHttpRequest +
 * callbacks, so the same file runs on device (Mojo or Enyo, old WebKit) and
 * in modern browsers.
 *
 * Values are SCRAMBLED in this file before upload (XXTEA, fixed key, salted
 * per app+key) so they are never plainly readable on the server or in
 * transit dumps. This is obfuscation, not encryption — the scheme is public.
 * Do NOT store secrets (passwords, API keys) in app storage.
 *
 * Usage:
 *   var store = new WebOSAppStorage({ appId: "com.example.myapp" });
 *
 *   // Browser/PWA sign-in (webOS apps: see useDeviceAccount below):
 *   store.signIn("user@example.com", "password", function(err, account) { ... });
 *
 *   // On webOS, reuse the device's webOS Account sign-in:
 *   store.useDeviceAccount(function(err) { ... });
 *
 *   store.set("settings", { theme: 2, fontSize: 18 }, function(err, res) { ... });
 *   store.get("settings", function(err, rec) { ... rec.value.theme ... });
 *   store.list(function(err, items) { ... });        // keys + revisions only
 *   store.remove("settings", function(err) { ... });
 *
 * Conflict-aware writes: pass {expectedRevision: N} as the options argument
 * to set(); on mismatch the callback gets err.code === "conflict" with
 * err.current holding the server's record (already unscrambled) to merge.
 *
 * All callbacks are Node-style: callback(err, result); err is null on
 * success, else { code, status, message, ... }.
 */
(function (global) {
    "use strict";

    var DEFAULT_BASE = "https://appcatalog.webosarchive.org/WebService";
    var LS_TOKEN = "wosaAppStorage_token";
    var LS_DEVICE = "wosaAppStorage_deviceId";
    var LS_ACCOUNT = "wosaAppStorage_account";

    // Fixed scramble master key (public by design — see header). The per-record
    // salt below keeps identical values from producing identical blobs.
    var MASTER = [0x77656253, 0x41726368, 0x53746f72, 0x65763101];

    // ---- Scramble internals (XXTEA + UTF-8 + base64, all ES5) --------------

    var DELTA = 0x9E3779B9;

    function mx(sum, y, z, p, e, k) {
        return ((z >>> 5 ^ y << 2) + (y >>> 3 ^ z << 4)) ^ ((sum ^ y) + (k[(p & 3) ^ e] ^ z));
    }

    function xxteaEncrypt(v, k) {
        var n = v.length - 1, z = v[n], y, sum = 0, e, p, q;
        if (n < 1) { return v; }
        q = Math.floor(6 + 52 / (n + 1));
        while (0 < q--) {
            sum = (sum + DELTA) >>> 0;
            e = sum >>> 2 & 3;
            for (p = 0; p < n; p++) {
                y = v[p + 1];
                z = v[p] = (v[p] + mx(sum, y, z, p, e, k)) >>> 0;
            }
            y = v[0];
            z = v[n] = (v[n] + mx(sum, y, z, n, e, k)) >>> 0;
        }
        return v;
    }

    function xxteaDecrypt(v, k) {
        var n = v.length - 1, y = v[0], z, sum, e, p, q;
        if (n < 1) { return v; }
        q = Math.floor(6 + 52 / (n + 1));
        sum = (q * DELTA) >>> 0;
        while (sum !== 0) {
            e = sum >>> 2 & 3;
            for (p = n; p > 0; p--) {
                z = v[p - 1];
                y = v[p] = (v[p] - mx(sum, y, z, p, e, k)) >>> 0;
            }
            z = v[n];
            y = v[0] = (v[0] - mx(sum, y, z, 0, e, k)) >>> 0;
            sum = (sum - DELTA) >>> 0;
        }
        return v;
    }

    function utf8Encode(str) {
        var out = [], i, c, c2, u;
        for (i = 0; i < str.length; i++) {
            c = str.charCodeAt(i);
            if (c < 0x80) {
                out.push(c);
            } else if (c < 0x800) {
                out.push(0xC0 | c >> 6, 0x80 | c & 63);
            } else if (c >= 0xD800 && c < 0xDC00 && i + 1 < str.length) {
                c2 = str.charCodeAt(++i);
                u = 0x10000 + ((c & 0x3FF) << 10) + (c2 & 0x3FF);
                out.push(0xF0 | u >> 18, 0x80 | u >> 12 & 63, 0x80 | u >> 6 & 63, 0x80 | u & 63);
            } else {
                out.push(0xE0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
            }
        }
        return out;
    }

    function utf8Decode(bytes) {
        var out = [], i = 0, b, u;
        while (i < bytes.length) {
            b = bytes[i++];
            if (b < 0x80) {
                out.push(String.fromCharCode(b));
            } else if (b < 0xE0) {
                out.push(String.fromCharCode((b & 31) << 6 | bytes[i++] & 63));
            } else if (b < 0xF0) {
                out.push(String.fromCharCode((b & 15) << 12 | (bytes[i++] & 63) << 6 | bytes[i++] & 63));
            } else {
                u = ((b & 7) << 18 | (bytes[i++] & 63) << 12 | (bytes[i++] & 63) << 6 | bytes[i++] & 63) - 0x10000;
                out.push(String.fromCharCode(0xD800 + (u >> 10), 0xDC00 + (u & 0x3FF)));
            }
        }
        return out.join("");
    }

    // First word is the byte length, so decode can strip block padding.
    function bytesToWords(bytes) {
        var words = [bytes.length >>> 0], i;
        for (i = 0; i < bytes.length; i++) {
            words[1 + (i >> 2)] = (words[1 + (i >> 2)] || 0) | (bytes[i] & 0xFF) << ((i & 3) << 3);
        }
        if (words.length < 2) { words.push(0); }
        for (i = 0; i < words.length; i++) { words[i] = words[i] >>> 0; }
        return words;
    }

    function wordsToBytes(words) {
        var len = words[0], bytes = [], i;
        if (typeof len !== "number" || len < 0 || len > (words.length - 1) * 4) {
            return null;
        }
        for (i = 0; i < len; i++) {
            bytes.push(words[1 + (i >> 2)] >>> ((i & 3) << 3) & 0xFF);
        }
        return bytes;
    }

    // Own base64 (linear, array-join) — btoa() is O(n^2) on old WebKit and
    // absent in some environments.
    var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    function base64Encode(bytes) {
        var out = [], i, b1, b2, b3;
        for (i = 0; i < bytes.length; i += 3) {
            b1 = bytes[i]; b2 = bytes[i + 1]; b3 = bytes[i + 2];
            out.push(B64.charAt(b1 >> 2));
            out.push(B64.charAt((b1 & 3) << 4 | (b2 === undefined ? 0 : b2 >> 4)));
            out.push(b2 === undefined ? "=" : B64.charAt((b2 & 15) << 2 | (b3 === undefined ? 0 : b3 >> 6)));
            out.push(b3 === undefined ? "=" : B64.charAt(b3 & 63));
        }
        return out.join("");
    }

    function base64Decode(str) {
        var out = [], i, e1, e2, e3, e4;
        str = str.replace(/[^A-Za-z0-9+\/]/g, "");
        for (i = 0; i < str.length; i += 4) {
            // charAt past the end returns "" and indexOf("") is 0, so guard
            // explicitly or a short final group gains phantom bytes.
            e1 = B64.indexOf(str.charAt(i));
            e2 = i + 1 < str.length ? B64.indexOf(str.charAt(i + 1)) : -1;
            e3 = i + 2 < str.length ? B64.indexOf(str.charAt(i + 2)) : -1;
            e4 = i + 3 < str.length ? B64.indexOf(str.charAt(i + 3)) : -1;
            out.push((e1 << 2 | e2 >> 4) & 0xFF);
            if (e3 >= 0) { out.push((e2 << 4 | e3 >> 2) & 0xFF); }
            if (e4 >= 0) { out.push((e3 << 6 | e4) & 0xFF); }
        }
        return out;
    }

    // Per-record key: master mixed with app_id + ":" + data_key, so the same
    // value under different keys yields different blobs. Deterministic on
    // every platform (plain 32-bit integer math).
    function recordKey(appId, dataKey) {
        var s = appId + ":" + dataKey;
        var k = [MASTER[0], MASTER[1], MASTER[2], MASTER[3]], i, w;
        for (i = 0; i < s.length; i++) {
            w = k[i & 3];
            k[i & 3] = (w ^ ((w << 5) + s.charCodeAt(i) + (w >>> 2))) >>> 0;
        }
        return k;
    }

    function scramble(appId, dataKey, plaintext) {
        var words = bytesToWords(utf8Encode(plaintext));
        var packed = xxteaEncrypt(words, recordKey(appId, dataKey));
        var bytes = [], i, w;
        for (i = 0; i < packed.length; i++) {
            w = packed[i];
            bytes.push(w & 0xFF, w >>> 8 & 0xFF, w >>> 16 & 0xFF, w >>> 24 & 0xFF);
        }
        return "v1:" + base64Encode(bytes);
    }

    function unscramble(appId, dataKey, blob) {
        if (typeof blob !== "string" || blob.indexOf("v1:") !== 0) {
            return null;
        }
        var bytes = base64Decode(blob.slice(3));
        if (bytes.length < 8 || bytes.length % 4 !== 0) {
            return null;
        }
        var words = [], i;
        for (i = 0; i < bytes.length; i += 4) {
            words.push((bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16 | bytes[i + 3] << 24) >>> 0);
        }
        var plainBytes = wordsToBytes(xxteaDecrypt(words, recordKey(appId, dataKey)));
        return plainBytes === null ? null : utf8Decode(plainBytes);
    }

    // ---- Small helpers -----------------------------------------------------

    function lsGet(key) {
        try { return global.localStorage ? global.localStorage.getItem(key) : null; }
        catch (e) { return null; }
    }

    function lsSet(key, value) {
        try {
            if (global.localStorage) {
                if (value === null) { global.localStorage.removeItem(key); }
                else { global.localStorage.setItem(key, value); }
            }
        } catch (e) { /* private mode / quota — token just won't persist */ }
    }

    function makeDeviceId() {
        var out = "pwa-", i;
        for (i = 0; i < 32; i++) {
            out += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
            if (i === 7 || i === 11 || i === 15 || i === 19) { out += "-"; }
        }
        return out;
    }

    function errorFrom(status, json, fallbackMessage) {
        var err = {
            code: (json && json.error) || (status === 0 ? "network" : "http_" + status),
            status: status,
            message: (json && json.message) || fallbackMessage || "Request failed"
        };
        if (json && json.usage) { err.usage = json.usage; }
        if (json && json.reason) { err.reason = json.reason; }
        return err;
    }

    // Default transport: XMLHttpRequest with one automatic retry on status 0
    // (old webOS WebKit can fail the first cold TLS handshake).
    function xhrTransport(req, cb) {
        function attempt(retriesLeft) {
            var xhr = new XMLHttpRequest();
            xhr.open(req.method, req.url, true);
            var h;
            for (h in req.headers) {
                if (req.headers.hasOwnProperty(h)) {
                    try { xhr.setRequestHeader(h, req.headers[h]); } catch (e) { }
                }
            }
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) { return; }
                if (xhr.status === 0 && retriesLeft > 0) {
                    setTimeout(function () { attempt(retriesLeft - 1); }, 1500);
                    return;
                }
                var json = null;
                try { json = JSON.parse(xhr.responseText); } catch (e) { }
                cb({ status: xhr.status, json: json });
            };
            xhr.send(req.body || null);
        }
        attempt(1);
    }

    // ---- The SDK -----------------------------------------------------------

    /**
     * Human-readable app name from a reverse-DNS id, for when the caller does
     * not supply one: "com.webosarchive.papyrus" -> "Papyrus".
     */
    function appNameFromId(appId) {
        var parts = String(appId || "").split(".");
        var last = parts[parts.length - 1] || "App";
        return last.charAt(0).toUpperCase() + last.slice(1);
    }

    /**
     * @param {object} opts
     *   appId       (required) reverse-DNS app id, e.g. "com.example.myapp"
     *   appName     (optional) display name used to label this browser in the
     *               account's device list; defaults to the last segment of
     *               appId, capitalised
     *   serviceBase (optional) API base, default the webOS Archive service
     *   token       (optional) preexisting account token
     *   deviceId    (optional) device id sent as writer metadata
     *   transport   (optional) replace the XHR layer (used by tests)
     */
    function WebOSAppStorage(opts) {
        opts = opts || {};
        if (!opts.appId) { throw new Error("WebOSAppStorage: opts.appId is required"); }
        this.appId = opts.appId;
        this.appName = opts.appName || appNameFromId(opts.appId);
        this.serviceBase = opts.serviceBase || DEFAULT_BASE;
        this._transport = opts.transport || xhrTransport;
        this._token = opts.token || lsGet(LS_TOKEN) || null;
        this._deviceId = opts.deviceId || lsGet(LS_DEVICE) || null;
        var acct = lsGet(LS_ACCOUNT);
        try { this._account = acct ? JSON.parse(acct) : null; } catch (e) { this._account = null; }
    }

    WebOSAppStorage.prototype._request = function (method, endpoint, m, query, bodyObj, cb) {
        var url = this.serviceBase + "/" + endpoint + "?m=" + m, q;
        for (q in query) {
            if (query.hasOwnProperty(q) && query[q] !== null && query[q] !== undefined) {
                url += "&" + q + "=" + encodeURIComponent(query[q]);
            }
        }
        // Cache-buster: old device WebKit happily caches GETs.
        if (method === "GET") { url += "&_=" + new Date().getTime(); }
        var headers = { "Content-Type": "application/json" };
        if (this._token) { headers["Authorization"] = "PalmAuth token=" + this._token; }
        if (this._deviceId) { headers["X-Palm-Device-Id"] = this._deviceId; }
        this._transport(
            { method: method, url: url, headers: headers, body: bodyObj ? JSON.stringify(bodyObj) : null },
            function (res) {
                if (res.status >= 200 && res.status < 300 && res.json) {
                    cb(null, res.json);
                } else {
                    cb(errorFrom(res.status, res.json), res.json || null);
                }
            }
        );
    };

    // -- Auth ----------------------------------------------------------------

    WebOSAppStorage.prototype.isSignedIn = function () {
        return this._token !== null;
    };

    WebOSAppStorage.prototype.getAccount = function () {
        return this._account;
    };

    /** Use a token you obtained elsewhere (e.g. an app's own account plumbing). */
    WebOSAppStorage.prototype.setToken = function (token, deviceId) {
        this._token = token || null;
        if (deviceId) { this._deviceId = deviceId; }
    };

    /**
     * Browser/PWA sign-in with the webOS Account login + password. Generates
     * and persists a stable synthetic device id ("pwa-<uuid>") so this browser
     * shows up as one revocable device on the account.
     *
     * Sends a device_name of "PWA-<AppName>" so the entry reads as a browser
     * session rather than sitting in the account's device list looking like a
     * handset. Sent on every sign-in, so the label follows a renamed app.
     */
    WebOSAppStorage.prototype.signIn = function (login, password, cb) {
        var self = this;
        if (!this._deviceId) {
            this._deviceId = makeDeviceId();
        }
        this._request("POST", "device.php", "authenticateWeb", null,
            { login: login, password: password, device_id: this._deviceId,
              device_name: "PWA-" + this.appName },
            function (err, json) {
                if (err) { return cb(err); }
                self._token = json.token;
                self._account = json.account || null;
                lsSet(LS_TOKEN, self._token);
                lsSet(LS_DEVICE, self._deviceId);
                lsSet(LS_ACCOUNT, self._account ? JSON.stringify(self._account) : null);
                cb(null, self._account);
            });
    };

    /** Revoke this device's token on the server and forget it locally. */
    WebOSAppStorage.prototype.signOut = function (cb) {
        var self = this, token = this._token;
        this._token = null;
        this._account = null;
        lsSet(LS_TOKEN, null);
        lsSet(LS_ACCOUNT, null);
        if (!token) { return cb && cb(null); }
        this._request("POST", "device.php", "deauthenticate", null, { token: token },
            function (err) { if (cb) { cb(err || null); } });
    };

    /** Trade the current token for a fresh one (call e.g. once per app launch month). */
    WebOSAppStorage.prototype.refreshToken = function (cb) {
        var self = this;
        if (!this._token) { return cb({ code: "unauthorized", status: 0, message: "Not signed in" }); }
        this._request("POST", "device.php", "refreshToken", null, { token: this._token },
            function (err, json) {
                if (err) { return cb(err); }
                self._token = json.token;
                lsSet(LS_TOKEN, self._token);
                cb(null);
            });
    };

    /**
     * On webOS, adopt the token minted when the user signed the DEVICE into
     * their webOS Account (no password prompt in your app). Talks to the
     * account service over the Luna bus; fails cleanly off-device.
     */
    WebOSAppStorage.prototype.useDeviceAccount = function (cb) {
        var self = this;
        if (typeof global.PalmServiceBridge === "undefined") {
            return cb({ code: "no_palm_bus", status: 0, message: "Not running on webOS" });
        }
        try {
            var bridge = new global.PalmServiceBridge();
            bridge.onservicecallback = function (msg) {
                var parsed = null;
                try { parsed = JSON.parse(msg); } catch (e) { }
                var token = parsed && (parsed.token || parsed.accountToken ||
                    (parsed.AuthenticateInfoEx && parsed.AuthenticateInfoEx.token));
                if (!token) {
                    return cb({ code: "no_device_account", status: 0, message: "No webOS Account signed in on this device" });
                }
                self._token = token;
                lsSet(LS_TOKEN, token);
                // The palmprofile service also returns the account alias
                // (accountparamsfetcher.js precedent: inResponse.accountAlias).
                if (parsed.accountAlias) {
                    self._account = { alias: parsed.accountAlias };
                    lsSet(LS_ACCOUNT, JSON.stringify(self._account));
                }
                cb(null);
            };
            bridge.call("palm://com.palm.accountservices/getAccountToken", "{}");
        } catch (e) {
            cb({ code: "palm_bus_error", status: 0, message: String(e) });
        }
    };

    // -- Storage -------------------------------------------------------------

    WebOSAppStorage.prototype._unscrambleRecord = function (rec) {
        var plain = unscramble(this.appId, rec.key, rec.value);
        if (plain === null) {
            // Not one of our blobs (or corrupted) — surface the raw string.
            return { key: rec.key, value: rec.value, raw: true,
                     revision: rec.revision, updatedAt: rec.updated_at };
        }
        var value;
        try { value = JSON.parse(plain); } catch (e) { value = plain; }
        return { key: rec.key, value: value, revision: rec.revision, updatedAt: rec.updated_at };
    };

    /** cb(err, {key, value, revision, updatedAt}); err.code "not_found" when absent. */
    WebOSAppStorage.prototype.get = function (key, cb) {
        var self = this;
        this._request("GET", "storage.php", "get", { app_id: this.appId, key: key }, null,
            function (err, json) {
                if (err) { return cb(err); }
                cb(null, self._unscrambleRecord(json));
            });
    };

    /** cb(err, {items: [...records...], usage}) */
    WebOSAppStorage.prototype.getAll = function (cb) {
        var self = this;
        this._request("GET", "storage.php", "getAll", { app_id: this.appId }, null,
            function (err, json) {
                if (err) { return cb(err); }
                var items = [], i;
                for (i = 0; i < json.items.length; i++) {
                    items.push(self._unscrambleRecord(json.items[i]));
                }
                cb(null, { items: items, usage: json.usage });
            });
    };

    /** Keys + revisions only (no values) — cheap "anything changed?" poll. */
    WebOSAppStorage.prototype.list = function (cb) {
        this._request("GET", "storage.php", "list", { app_id: this.appId }, null,
            function (err, json) {
                if (err) { return cb(err); }
                cb(null, json.items);
            });
    };

    /**
     * Save a value (any JSON-serializable value; scrambled before upload).
     * opts.expectedRevision: fail with err.code "conflict" (err.current =
     * server record, unscrambled) unless the server is at that revision;
     * 0 = only create. Omit opts for plain last-write-wins.
     * cb(err, {revision, usage})
     */
    WebOSAppStorage.prototype.set = function (key, value, opts, cb) {
        if (typeof opts === "function") { cb = opts; opts = null; }
        var self = this;
        var body = { app_id: this.appId, key: key, value: scramble(this.appId, key, JSON.stringify(value)) };
        if (opts && opts.expectedRevision !== undefined && opts.expectedRevision !== null) {
            body.expected_revision = opts.expectedRevision;
        }
        this._request("POST", "storage.php", "set", null, body,
            function (err, json) {
                if (err) {
                    if (err.code === "conflict" && json && json.current) {
                        err.current = self._unscrambleRecord(json.current);
                    }
                    return cb(err);
                }
                cb(null, { revision: json.revision, usage: json.usage });
            });
    };

    /**
     * Batch save: items = [{key, value, expectedRevision?}, ...] (max 100).
     * cb(err, {results, usage}); per-item conflicts/quota failures appear in
     * results[i].error rather than failing the whole call.
     */
    WebOSAppStorage.prototype.setMany = function (items, cb) {
        var self = this, payload = [], i, item;
        for (i = 0; i < items.length; i++) {
            item = items[i];
            var entry = { key: item.key, value: scramble(this.appId, item.key, JSON.stringify(item.value)) };
            if (item.expectedRevision !== undefined && item.expectedRevision !== null) {
                entry.expected_revision = item.expectedRevision;
            }
            payload.push(entry);
        }
        this._request("POST", "storage.php", "setMany", null, { app_id: this.appId, items: payload },
            function (err, json) {
                if (err) { return cb(err); }
                var results = json.results, r;
                for (i = 0; i < results.length; i++) {
                    r = results[i];
                    if (r.error === "conflict" && r.current) {
                        r.current = self._unscrambleRecord(r.current);
                    }
                }
                cb(null, { results: results, usage: json.usage });
            });
    };

    /** cb(err, {deleted, usage}) — deleted is false when the key didn't exist. */
    WebOSAppStorage.prototype.remove = function (key, cb) {
        this._request("POST", "storage.php", "delete", null, { app_id: this.appId, key: key },
            function (err, json) {
                if (err) { return cb(err); }
                cb(null, { deleted: json.deleted, usage: json.usage });
            });
    };

    /** cb(err, usage) — quota usage for this app and the whole account. */
    WebOSAppStorage.prototype.usage = function (cb) {
        this._request("GET", "storage.php", "usage", { app_id: this.appId }, null, cb);
    };

    // Exposed for tests and for apps that want the raw primitives.
    WebOSAppStorage.scramble = scramble;
    WebOSAppStorage.unscramble = unscramble;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = WebOSAppStorage;
    } else {
        global.WebOSAppStorage = WebOSAppStorage;
    }
}(typeof window !== "undefined" ? window : this));
