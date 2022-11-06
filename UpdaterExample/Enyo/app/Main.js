enyo.kind({
    name: "MyApp.SampleApp",
    kind: enyo.VFlexBox,
    components: [{
            kind: "myApp.AppMenu",
            name: "appMenu",
            components: [
                { caption: "Check for Updates", onclick: "menuClicked" }
            ],
            onItemSelected: 'handleItemSelected'
        },
        {
            kind: "Helpers.Updater", //Make sure the Updater Helper is included in your depends.json
            name: "myUpdater",
            /*
            //If you prefer to handle the user interaction yourself:
            handleUI: false,
            onUpdateFound: "showUpdateUI"
            */
        }
    ],

    create: function() {
        this.inherited(arguments);
        /* Updater Example #1: Check for updates when the app launches */
        this.$.myUpdater.CheckForUpdate("My App");
    },

    /* Updater Example #2: another great option might be to have a menu option,
        this would let the user decide when to check for updates.  */
    handleItemSelected: function(inSender, inEvent) {
        switch (inEvent) {
            case 'Check for Updates':
                this.$.myUpdater.CheckForUpdate(this, "My App");
                break;
        }
    },

    showUpdateUI: function() {
        var updateMsg = myUpdater.VersionNote;
        myUpdater.PromptUserForUpdate(updateMsg);
        /*
        //Or make your own UI, and when ready to install, call:
        myUpdater.InstallViaPreware();
        */
    }
});
