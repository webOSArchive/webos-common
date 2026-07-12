# CLAUDE.md — brokered OAuth sign-in for a legacy webOS app

You're helping add "sign in with a modern service" (Box, Google, Dropbox, Instapaper, …)
to a webOS app for a 2009–2012 device (Pre / Pixi / TouchPad). Read this before writing code.

## The one hard rule: do NOT do OAuth on the device

The device physically cannot:
- **complete a TLS handshake** with a modern OAuth endpoint (its 2009-era stack predates TLS 1.2), and
- **render a consent screen** (its browser goes blank on modern login pages).

So: no embedded WebView login, no client secret in the `.ipk`, no on-device redirect listener.
Every one of those has been tried and failed. Background: `webos://knowledge/oauth` and
`webos://knowledge/tls-and-networking` (the webos-mcp knowledge base).

## Instead: broker it, and reduce the device to "show a code, poll for tokens"

All the OAuth happens on a shared hosted helper — the **webOS OAuth broker** at
`https://oauth.wosa.link`. The device does exactly three things:

1. **get-code** — ask the broker for a short activation code and show it (with a URL).
2. **poll check-code** — the user finishes signing in on a real browser (phone/PC); the device
   polls until the broker hands back tokens.
3. **store tokens** — and, for OAuth2, **refresh** through the broker later.

The client secret lives only on the broker. The device holds just a public app *slug*.

## What's in this folder

| File | What it is |
|------|------------|
| `../Enyo/OAuthBroker-Helper.js` | **The reusable engine.** A non-visual Enyo 1 kind `Helpers.OAuthBroker` that does get-code → background poll → tokens (+ `refresh()`). Copy it into your app (or symlink from webos-common). |
| `Enyo/app/Login.js` | An **example view** using the helper: a Sign In button, an inline "enter this code" panel, a manual "Check now" fallback, and token storage. Adapt, don't ship as-is. |
| `Enyo/depends.js` | Shows the two lines you must register (the view + the helper). New JS that isn't in `depends.js` **silently won't load** on webOS. |
| `broker-app-config.example.php` | The **server-side** app config — what you contribute (via PR) to get your app added. You don't host this. |

## Wiring it into an app (the whole recipe)

1. Copy `OAuthBroker-Helper.js` into your app and add it (and your login view) to `depends.js`.
2. Put the component in your sign-in view and point it at your slug:
   ```javascript
   { kind: "Helpers.OAuthBroker", name: "broker", appName: "myapp",
     onCode: "showCode", onConnected: "storeTokens",
     onExpired: "codeExpired", onError: "brokerError" }
   ```
3. `this.$.broker.start()` on a button tap. In `onCode`, show `codeInfo.code` + `codeInfo.useUrl`.
4. In `onConnected`, persist the tokens for your flow (see below) and proceed into the app.
5. OAuth2 only: when the access token expires, call `this.$.broker.refresh(refreshToken)`.

### Which token fields you get (depends on the flow)

- **oauth2_authcode** → `{ status:"ready", access_token, refresh_token, expires_in, token_type }`
- **oauth1_xauth** → `{ status:"ready", oauth_token, oauth_token_secret, username }`

`onConnected` hands you the whole object; store what your API client needs. Store it wherever
your app already keeps credentials (usually `localStorage`).

## Pitfalls that will waste your afternoon

- **ES5 only.** 2009 WebKit: no `let`/`const`, arrow functions, `Promise`, `fetch`, or template
  literals. `var` and callbacks. Modern JS "looks fine" and silently breaks on-device.
- **Register every new JS file** in `depends.js` (Enyo) — forgetting is a silent no-op, not an error.
- **Show the code inline, not in a `ModalDialog`.** Old Enyo creates a dialog's children lazily,
  so `this.$.child.setContent(...)` before it opens throws `setContent of undefined`. The example
  uses plain inline controls for exactly this reason.
- **Poll in the background; don't force a "Verify" tap.** Poll every ~1.5s and offer "Check now"
  only as a fallback. (A version that required a manual Verify tap confused everyone — the app had
  already signed in, it just didn't *say* so. Make success visible: a banner, a state change, or
  auto-advance.)
- **404 from check-code means the code is dead** (expired or already claimed) — stop polling and
  offer a fresh code. Don't treat it as a transient error.
- **Tokens are handed over exactly once**, then deleted server-side. Persist them in `onConnected`;
  you can't re-fetch the same code.
- **Never put the client secret in the app.** It's on the broker. (For oauth1_xauth apps the app
  does hold the provider *consumer* key/secret to sign its own API calls — that's expected — and it
  must be the same consumer the broker uses.)

## Getting your app added to the broker (the server side)

You do **not** run the broker — `oauth.wosa.link` is a shared community service whose code lives at
**github.com/webOSArchive/oauth-broker-for-webos**. Onboard an app by opening a **pull request**
there that adds `apps/<yourslug>/config.example.php` (start from `broker-app-config.example.php` in
this folder). Put the **non-secret** parts in the PR:

- a **slug** (your `?app=` value, and the folder name), the **flow**, and a display **title**;
- **OAuth2:** public `client_id`, `authorize_url`, `token_url`, `scope`, any `authorize_extra`;
- **OAuth1 xAuth:** `consumer_key`, `access_token_url`.

**Keep secrets out of the PR.** `client_secret` / `consumer_secret` go into the git-ignored
`apps/<slug>/config.php` on the server; the maintainer will arrange to receive yours privately while
reviewing — never commit them. For **OAuth2**, `https://oauth.wosa.link/callback.php` must also be
registered as an authorized redirect URI in the provider's developer console (the maintainer can advise).

## Reference implementations to copy from

- **Box for webOS** (`com.box.webos`) — `oauth2_authcode`, refreshable. `source/views/login.js` + `source/api/api.js`.
- **ReadOnTouch / Instapaper** (`org.webosarchive.readontouch`) — `oauth1_xauth`, long-lived. `source/Welcome.js` + `source/Services.js`.

Both drove the design of `Helpers.OAuthBroker`; this example is the distilled, reusable version.
