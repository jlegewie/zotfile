// Only create main object once
Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
				.getService(Components.interfaces.mozIJSSubScriptLoader).loadSubScript("chrome://zotfile/content/zotfile.js");
window.addEventListener('load', function(e) { Zotero.ZotFile.init(); }, false);



