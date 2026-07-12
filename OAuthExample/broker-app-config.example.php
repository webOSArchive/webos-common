<?php
/**
 * broker-app-config.example.php
 *
 * This is the SERVER-SIDE config that describes your app to the shared webOS
 * OAuth broker (oauth.wosa.link). You do NOT host the broker yourself — it's a
 * shared community service whose code lives at:
 *     github.com/webOSArchive/oauth-broker-for-webos
 *
 * To get your app added, open a PULL REQUEST there adding
 * apps/<yourslug>/config.example.php (this file). Fill in the non-secret parts
 * below and leave the *_secret values as placeholders: real secrets go only into
 * the git-ignored apps/<slug>/config.php on the server, so never commit them —
 * the maintainer will arrange to receive yours privately while reviewing, and
 * (for OAuth2) register the callback redirect URI for you.
 *
 * The <yourslug> you pick is the ?app= value your device passes to get-code /
 * check-code / refresh (and the appName on the Helpers.OAuthBroker component).
 *
 * Pick ONE of the two flows below.
 */

// ---------------------------------------------------------------------------
// FLOW A — "oauth2_authcode": modern OAuth 2.0 authorization-code grant.
//   The user approves access on the provider's consent screen. Best for almost
//   every current service (Box, Google, Dropbox, Reddit, Microsoft, …).
//   Tokens are refreshable via the broker's refresh endpoint.
//
//   ALSO REQUIRED for OAuth2: register  https://oauth.wosa.link/callback.php
//   as an authorized redirect URI in the provider's developer console.
// ---------------------------------------------------------------------------
return array(
    'flow'  => 'oauth2_authcode',
    'title' => 'My Service',            // shown on the helper page + on the device
    'accent' => '#2b6cb0',              // optional brand colour

    'client_id'     => 'YOUR_CLIENT_ID',
    'client_secret' => 'YOUR_CLIENT_SECRET',

    'authorize_url' => 'https://provider.example.com/oauth/authorize',
    'token_url'     => 'https://provider.example.com/oauth/token',

    'scope' => '',                      // optional, provider-specific

    // Optional extra query params on the authorize URL. Many providers need
    // these to actually issue a refresh token, e.g. Google:
    //   'authorize_extra' => array('access_type' => 'offline', 'prompt' => 'consent'),
    'authorize_extra' => array(),
);

/*
 * ---------------------------------------------------------------------------
 * FLOW B — "oauth1_xauth": legacy OAuth 1.0a with direct credential exchange.
 *   The user types their provider username/password on the helper page (a
 *   trusted modern browser); the broker trades them for a long-lived token.
 *   Only for providers that still support xAuth (e.g. Instapaper). No refresh.
 *
 *   Note: the consumer_key/secret here MUST be the same consumer your device
 *   uses to sign its own API requests, or the minted token won't be accepted.
 *
 * return array(
 *     'flow'  => 'oauth1_xauth',
 *     'title' => 'Instapaper',
 *     'accent' => '#333333',
 *     'consumer_key'     => 'YOUR_CONSUMER_KEY',
 *     'consumer_secret'  => 'YOUR_CONSUMER_SECRET',
 *     'access_token_url' => 'https://www.instapaper.com/api/1/oauth/access_token',
 *     'username_label'   => 'Instapaper email',   // optional
 * );
 * ---------------------------------------------------------------------------
 */
