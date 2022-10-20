enyo.kind({
	name: "myapp.MainView",
	kind: "FittableRows",
	components:[
		{kind: 'wosa.updater', name:"myUpdater", onUpdateFound:"handleUpdateFound"},
        {kind: "enyo.Popup", name: "popupModal", modal: true, autoDismiss: false, centered: true, classes: "popup", components: [
			{name:"popupMessage", content: "", allowHtml:true},
			{classes:"spacer"},
			{kind: "enyo.Button", name: "buttonCloseModal", content: "Close", ontap: "closeModal"}
		]},
    ],
    rendered: enyo.inherit(function(sup) {
		return function() {
			sup.apply(this, arguments);
            //Might need to wait for Cordova to be ready
            if (typeof device !== 'undefined' && device.platform) {
				enyo.log("doing update check right away")
				this.doUpdateCheck();
			}
			else {
				enyo.log("doing update check when ready")
				document.addEventListener('deviceready', this.doUpdateCheck.bind(this), false);
			}
		};
	}),
    doUpdateCheck: function() {
		//Check for updates
		this.$.myUpdater.CheckForUpdate("Check Mate HD");
	},
	handleUpdateFound: function(sender, message) {
		this.showModal("Update found!<br>" + this.$.myUpdater.UpdateMessage + "<br>Visit your App Store to download it!");
	},
});