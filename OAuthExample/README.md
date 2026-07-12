# OAuthExample — brokered OAuth sign-in for legacy webOS apps

A copy-paste starter for logging a webOS app (Pre / Pixi / TouchPad) into a modern OAuth
service — Box, Google, Dropbox, Instapaper, and so on — despite the device's 2009-era TLS and
browser. It leans on the shared **webOS OAuth broker** so the device never has to do OAuth
itself.

> **Why not just do OAuth on the device?** It can't: the TLS stack is too old to reach modern
> OAuth endpoints, and the browser can't render a consent screen. All the OAuth is moved onto a
> hosted helper (`oauth.wosa.link`); the device only shows a code and polls for tokens. Full
> background: `webos://knowledge/oauth` in the [webos-mcp](https://github.com/webOSArchive/webos-mcp)
> knowledge base.

## What you get

| File | Purpose |
|------|---------|
| [`../Enyo/OAuthBroker-Helper.js`](../Enyo/OAuthBroker-Helper.js) | The reusable engine — a non-visual Enyo 1 kind `Helpers.OAuthBroker` (get-code → background poll → tokens, plus `refresh()`). |
| [`Enyo/app/Login.js`](Enyo/app/Login.js) | An example sign-in view: Sign In button → inline "enter this code" panel → token storage, with a "Check now" fallback. |
| [`Enyo/depends.js`](Enyo/depends.js) | The two lines you must register (new JS not in `depends.js` silently won't load). |
| [`broker-app-config.example.php`](broker-app-config.example.php) | The server-side app config you contribute to the broker (see below). |
| [`CLAUDE.md`](CLAUDE.md) | A guide written to get an AI assistant to a working integration. |

## Quick start

1. Copy `OAuthBroker-Helper.js` into your app; add it and your login view to `depends.js`.
2. Drop the component into your sign-in view with your slug:
   ```javascript
   { kind: "Helpers.OAuthBroker", name: "broker", appName: "myapp",
     onCode: "showCode", onConnected: "storeTokens",
     onExpired: "codeExpired", onError: "brokerError" }
   ```
3. Call `this.$.broker.start()` on a button tap. Show `codeInfo.code` + `codeInfo.useUrl` in
   `onCode`; persist the tokens in `onConnected`.
4. OAuth2 only: `this.$.broker.refresh(refreshToken)` when the access token expires.

Token fields depend on the flow:
- **oauth2_authcode** → `access_token`, `refresh_token`, `expires_in`
- **oauth1_xauth** → `oauth_token`, `oauth_token_secret`, `username`

Remember: **ES5 only** (no `let`/arrow/`Promise`/`fetch`), register new files in `depends.js`,
show the code **inline** (not in a lazy `ModalDialog`), poll in the background rather than making
the user press a button, and treat a `404` from check-code as "code expired."

## Add your app to the broker (open a PR)

The broker is a shared community service — you don't host it. To onboard an app, open a pull
request against **[github.com/webOSArchive/oauth-broker-for-webos](https://github.com/webOSArchive/oauth-broker-for-webos)**
that adds `apps/<yourslug>/config.example.php` (copy the repo's `apps/_example/config.php`, or
[`broker-app-config.example.php`](broker-app-config.example.php) here). Put the **non-secret**
parts in the PR: flow, title, authorize/token (or access-token) URLs, scope, and your public
`client_id` / `consumer_key`.

**Secrets stay out of git.** `client_secret` / `consumer_secret` go into the live, git-ignored
`apps/<slug>/config.php` on the server; the maintainer will arrange to receive yours privately
while reviewing — never commit them. For OAuth2, the maintainer also registers
`https://oauth.wosa.link/callback.php` as your provider redirect URI when merging.

## Reference implementations

- **Box for webOS** (`com.box.webos`) — `oauth2_authcode`, refreshable tokens.
- **ReadOnTouch / Instapaper** (`org.webosarchive.readontouch`) — `oauth1_xauth`, long-lived tokens.

Both shaped `Helpers.OAuthBroker`; this folder is the distilled, reusable version.
