// Only create main object once
if (!Zotero.ZotFile) {
    var zotfileLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                    .getService(Components.interfaces.mozIJSSubScriptLoader);
    var scripts = ['zotfile', 'pdfAnnotations', 'pdfOutline', 'wildcards', 'tablet', 'utils', 'notifier', 'ui'];
    scripts.forEach(s => zotfileLoader.loadSubScript('chrome://zotfile/content/' + s + '.js'));
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
