# webOS Common

Shared libraries for webOS mobile development. You can either copy these into your projects, and manually update, or symlink in from this repo.

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
this.$.myUpdater.CheckForUpdate(this, "Name of your app as listed in App Museum II", this.updateResponseCallBack);
...
updateResponseCallBack: function(self, message) {
     enyo.log("Got an updater response: " + message);
     self.$.SelfUpdater.PromptUserForUpdate(message);
},
```

For ultimate control, handle the UI yourself, then call the installer:

```
this.$.myUpdater.CheckForUpdate(this, "Name of your app as listed in App Museum II", this.updateResponseCallBack);
...
updateResponseCallBack: function(self, message) {
     enyo.log("Got an updater response: " + message);
     //Do your own UI
     if(UIResponse = true)
          self.$.SelfUpdater.DoInstall(LastUpdateResponse.downloadURI);
},
```
