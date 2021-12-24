# webOS Common

Shared libraries for webOS mobile development. You can either copy these into your projects, and manually update, or symlink in from this repo.

## Contents

### app-model.js

This is a model that manages saved settings, and is used across most of my apps. Install in the models sub-folder of your Mojo app.

### updater-model.js

This is a model you can use to support automatic update notifications in your app.

### system-model.js

Makes it easier to access a number of platform-level features. Some functions require your App Id to start with com.palm.*

## Mojo Additions

Understanding Mojo can be challenging, and some functions are overly complex. This was an early common component I developed to help.