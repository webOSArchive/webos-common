# webOS Common

Shared libraries for webOS mobile development. You can either copy these into your projects, and manually update, or symlink in from this repo.

## AppStorage

### webos-app-storage.js

Cloud key/value storage tied to the user's webOS Account: save small per-user values (settings, preferences, progress) and read them back on any device the user signs into — including community apps running as PWAs on other platforms. Framework-agnostic ES5 (works in Mojo, Enyo, and modern browsers), values scrambled client-side before upload. See **[AppStorage/](AppStorage/)** for the API reference and sync patterns.

## Mojo

### app-model.js

This is a model that manages saved settings, and is used across most of my apps. Install in the models sub-folder of your Mojo app.

### updater-model.js

This is a model that implements almost everything you need to include an automatic updater in your app.

### system-model.js

Makes it easier to access a number of platform-level features. Some functions require your App Id to start with com.palm.*

## Mojo Additions

Understanding Mojo can be challenging, and some functions are overly complex. This was an early common component I developed to help.

## Enyo

### OAuthBroker-Helper.js

A complete Helper component that signs a legacy webOS app into a modern OAuth service (Box, Google, Dropbox, Instapaper, …) through the shared webOS OAuth broker at `oauth.wosa.link`. The device can't do OAuth itself — its 2009-era TLS can't reach modern endpoints and its browser can't render a consent screen — so the broker does it: the device shows a short code, the user finishes signing in on a real browser, and the device polls for the resulting tokens. Handles both broker flows (`oauth2_authcode` and `oauth1_xauth`) and OAuth2 token refresh.

To use, add to your `depends.js` and include a kind in your view:

```
{ kind: "Helpers.OAuthBroker", name: "broker", appName: "myapp",
  onCode: "showCode", onConnected: "storeTokens",
  onExpired: "codeExpired", onError: "brokerError" }
```

Then call `this.$.broker.start()` to begin. See **[OAuthExample/](OAuthExample/)** for a complete example view, a `CLAUDE.md` guide, and how to add your own app to the broker (open a PR at [oauth-broker-for-webos](https://github.com/webOSArchive/oauth-broker-for-webos)).

### Updater-Helper.js

This is a complete Helper control that implements virtually everything you need to include an automatic updater in your app.

To use, add to your depends.js and include a kind in your main app javascript:

```
{kind: "Helpers.Updater", name: "myUpdater" },
```

You can call it anywhere in your code, but I usually call it from the enyo creation function:

```
this.$.myUpdater.CheckForUpdate(this, "Name of your app as listed in App Museum II");
```

If you want more control over the user experience, you can pass in an optional call back method:

```
this.$.myUpdater.CheckForUpdate(this, "Name of your app in App Museum II", this.updateCallBack);
...
updateCallBack: function(self, message) {
     enyo.log("Got an updater response: " + message);
     self.$.SelfUpdater.PromptUserForUpdate(message);
},
```

For ultimate control, handle the UI yourself, then call the installer:

```
this.$.myUpdater.CheckForUpdate(this, "Name of your app in App Museum II", this.updateCallBack);
...
updateCallBack: function(self, message) {
     enyo.log("Got an updater response: " + message);
     var UIResponse = {}; //Do your own UI
     if(UIResponse == true)
          self.$.SelfUpdater.DoInstall(LastUpdateResponse.downloadURI);
},
```
