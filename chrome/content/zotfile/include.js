// Only create main object once
if (!Zotero.ZotFile) {
	var zotfileLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
					.getService(Components.interfaces.mozIJSSubScriptLoader);
	zotfileLoader.loadSubScript("chrome://zotfile/content/zotfile.js");
	
} 

window.addEventListener('load', function(e) {
	Zotero.ZotFile.init();
	// attach focus handler for 'zotero-items-tree' element to check folder for changes
	window.ZoteroPane.document.getElementById('zotero-items-tree').addEventListener('focus', Zotero.ZotFile.watchFolder, false);
}, false);

