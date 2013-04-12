// Only create main object once
if (!Zotero.ZotFile) {
	var zotfileLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
					.getService(Components.interfaces.mozIJSSubScriptLoader);
	zotfileLoader.loadSubScript("chrome://zotfile/content/zotfile.js");
}

window.addEventListener('load', function(e) {
	Zotero.ZotFile.init();
	if(window.ZoteroPane) {
		// attach focus handler for 'zotero-items-tree' element to check folder for changes
		window.ZoteroPane.document.getElementById('zotero-items-tree').addEventListener('focus', Zotero.ZotFile.watchFolder, false);
		// add event listener for zotfile menu items
		window.ZoteroPane.document.getElementById('zotero-itemmenu').addEventListener('popupshowing', Zotero.ZotFile.showMenu, false);
		// add event listener for zotfile collection menu
		window.ZoteroPane.document.getElementById('zotero-collectionmenu').addEventListener('popupshowing', Zotero.ZotFile.showCollectionMenu, false);
	}
}, false);

