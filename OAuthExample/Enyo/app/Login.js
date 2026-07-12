/*
 * Login.js — example sign-in view built on Helpers.OAuthBroker.
 *
 * Copy this into your app and change three things:
 *   1. the appName on the "broker" component (your slug on the broker)
 *   2. what storeTokens() persists (depends on your flow — see below)
 *   3. what you do after success (here we fire onLoginSuccess for the owner)
 *
 * The code + URL are shown INLINE (not in a ModalDialog): old Enyo builds a
 * dialog's children lazily, so setContent() on them before it opens throws
 * "setContent of undefined". Plain inline controls exist from create().
 */
enyo.kind({
    name: "OAuthExample.Login",
    kind: enyo.VFlexBox,

    events: {
        onLoginSuccess: "",   // (inSender, tokens) — the owner proceeds into the app
        onLoginCancel: ""
    },

    components: [
        { kind: "Helpers.OAuthBroker", name: "broker",
          appName: "myapp",                       // <-- CHANGE ME
          onCode:      "showCode",
          onConnected: "storeTokens",
          onExpired:   "codeExpired",
          onError:     "brokerError" },

        // ── Step 1: the Sign In button ────────────────────────────────────────
        { name: "startPanel", kind: enyo.VFlexBox, components: [
            { content: "Tap Sign In, then finish on a phone or computer.",
              style: "padding:16px;text-align:center;" },
            { kind: "HFlexBox", pack: "center", components: [
                { name: "signInBtn", kind: "Button", caption: "Sign In",
                  onclick: "signInTapped", className: "enyo-button-affirmative" }
            ]},
            { name: "spinner", kind: "Spinner", showing: false }
        ]},

        // ── Step 2: the "enter this code" panel (shown once we have a code) ────
        { name: "codePanel", kind: enyo.VFlexBox, showing: false,
          style: "padding:12px;text-align:center;", components: [
            { content: "On a modern phone or computer, go to:",
              style: "padding:4px;" },
            { name: "codeUrl", content: "",
              style: "font-size:18px;font-weight:bold;padding:2px 0 14px;word-break:break-all;" },
            { content: "and enter this code:" },
            { name: "codeValue", content: "",
              style: "font-size:38px;font-weight:bold;letter-spacing:6px;font-family:monospace;padding:6px 0;" },
            { name: "codeStatus", content: "Waiting for you to finish signing in…",
              style: "padding:8px;color:#888;" },
            { kind: "HFlexBox", pack: "center", components: [
                { name: "checkNowBtn", kind: "Button", caption: "Check now",
                  onclick: "checkNowTapped", style: "margin-right:8px;" },
                { name: "cancelBtn", kind: "Button", caption: "Cancel",
                  onclick: "cancelTapped" }
            ]}
        ]}
    ],

    signInTapped: function() {
        this.$.signInBtn.setDisabled(true);
        this.$.spinner.show();
        this.$.broker.start();            // fetch a code + begin background polling
    },

    // onCode: the broker minted a code and started polling. Show it.
    showCode: function(inSender, codeInfo) {
        this.$.spinner.hide();
        this.$.codeUrl.setContent(codeInfo.useUrl);
        this.$.codeValue.setContent(codeInfo.code);
        this.$.codeStatus.setContent("Waiting for you to finish signing in…");
        this.$.startPanel.hide();
        this.$.codePanel.show();
    },

    // Manual fallback — force an immediate check.
    checkNowTapped: function() {
        this.$.codeStatus.setContent("Checking…");
        this.$.broker.checkNow();
    },

    // onConnected: tokens are here (returned exactly once). Persist what your flow
    // needs, then proceed. This example assumes localStorage; use whatever your app
    // already uses for credentials.
    storeTokens: function(inSender, tokens) {
        if (tokens.access_token) {
            // oauth2_authcode
            localStorage["myapp.access"]  = tokens.access_token;
            localStorage["myapp.refresh"] = tokens.refresh_token || "";
            localStorage["myapp.expires"] = tokens.expires_in || "";
        } else {
            // oauth1_xauth
            localStorage["myapp.token"]        = tokens.oauth_token;
            localStorage["myapp.token_secret"] = tokens.oauth_token_secret;
            localStorage["myapp.username"]     = tokens.username || "";
        }
        this.$.codePanel.hide();
        this.$.startPanel.show();
        this.$.signInBtn.setDisabled(false);
        this.doLoginSuccess(tokens);      // owner moves into the app
    },

    // onExpired: the code died (broker 404). Let the user start over.
    codeExpired: function() {
        this.$.codeStatus.setContent("That code expired. Tap Cancel, then Sign In again.");
    },

    // onError: couldn't reach the broker at all.
    brokerError: function(inSender, message) {
        this.$.spinner.hide();
        this.$.codePanel.hide();
        this.$.startPanel.show();
        this.$.signInBtn.setDisabled(false);
        enyo.windows.addBannerMessage(message || "Could not connect to the sign-in service.", "{}");
    },

    cancelTapped: function() {
        this.$.broker.stop();
        this.$.codePanel.hide();
        this.$.startPanel.show();
        this.$.signInBtn.setDisabled(false);
        this.doLoginCancel();
    }
});
