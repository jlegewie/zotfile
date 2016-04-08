// Only create main object once
if (!Zotero.ZotFile) {
    var zotfileLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                    .getService(Components.interfaces.mozIJSSubScriptLoader);
    var scripts = ['zotfile', 'pdfAnnotations', 'pdfOutline', 'wildcards', 'tablet', 'utils', 'notifier', 'openPDF-protocol-handler'];
    scripts.forEach(s => zotfileLoader.loadSubScript('chrome://zotfile/content/' + s + '.js'));
}

window.addEventListener('load', function(e) {
    Zotero.ZotFile.init();
    if(window.ZoteroPane) {
        // add event listener for zotfile menu items
        window.ZoteroPane.document.getElementById('zotero-itemmenu').addEventListener('popupshowing', Zotero.ZotFile.showMenu, false);
        // add event listener for zotfile collection menu
        window.ZoteroPane.document.getElementById('zotero-collectionmenu').addEventListener('popupshowing', Zotero.ZotFile.showCollectionMenu, false);
        // add event listener to update saved search for modified tablet attachments
        window.ZoteroPane.document.getElementById('zotero-collections-tree').addEventListener('click', Zotero.ZotFile.Tablet.updateModifiedAttachmentsSearch, false);
    }
}, false);
