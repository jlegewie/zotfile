// Only create main object once
if (!Zotero.ZotFile) {
    var zotfileLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                    .getService(Components.interfaces.mozIJSSubScriptLoader);
    var scripts = ['zotfile', 'pdfAnnotations', 'pdfOutline', 'wildcards', 'tablet', 'utils', 'notifier', 'ui'];
    scripts.forEach(s => {
        // Skip zotfile itself which is already loaded via bootstrap file URI
        if (s === 'zotfile' && Zotero.ZotFile) return;
        try {
            zotfileLoader.loadSubScript('chrome://zotfile/content/' + s + '.js');
        } catch(e) {
            // Fallback to jar:file URI when chrome:// not registered (Zotero 10)
            let loaded = false;
            // Try gRootURI from bootstrap global (may be on Zotero object)
            try {
                let b = null;
                if (typeof gRootURI !== 'undefined' && gRootURI && gRootURI.spec) b = gRootURI.spec;
                else if (typeof Zotero !== 'undefined' && Zotero.ZotFileBootstrapRootURI && Zotero.ZotFileBootstrapRootURI.spec) b = Zotero.ZotFileBootstrapRootURI.spec;
                else if (typeof Services !== 'undefined' && Services.dirsvc) {
                    let profD = Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
                    let extFile = profD.clone(); extFile.append("extensions"); extFile.append("zotfile@columbia.edu.xpi");
                    if (extFile.exists()) b = "jar:file://" + extFile.path + "!/";
                } else {
                    let profD = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("ProfD", Components.interfaces.nsIFile);
                    let extFile = profD.clone(); extFile.QueryInterface(Components.interfaces.nsIFile); extFile.append("extensions"); extFile.append("zotfile@columbia.edu.xpi");
                    if (extFile.exists()) b = "jar:file://" + extFile.path + "!/";
                }
                if (b) {
                    if (!b.endsWith("/")) b += "/";
                    zotfileLoader.loadSubScript(b + 'chrome/content/zotfile/' + s + '.js');
                    loaded = true;
                }
            } catch(e2) {}
            if (!loaded) Components.utils.reportError("zotfile include fallback failed for " + s + ": " + e);
        }
    });
}

window.addEventListener('load', function(e) {
    Zotero.ZotFile.init();
    if(window.ZoteroPane) {
        var doc = window.ZoteroPane.document;
        // add event listener for zotfile menu items
        doc.getElementById('zotero-itemmenu').addEventListener('popupshowing', Zotero.ZotFile.UI.showMenu, false);
        // add event listener for zotfile collection menu
        doc.getElementById('zotero-collectionmenu').addEventListener('popupshowing', Zotero.ZotFile.UI.showCollectionMenu, false);
        // add event listener to update saved search for modified tablet attachments
        doc.getElementById('zotero-collections-tree').addEventListener('click', Zotero.ZotFile.Tablet.updateModifiedAttachmentsSearch, false);
    }
}, false);
