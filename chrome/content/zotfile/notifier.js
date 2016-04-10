
/**
 * Callback implementing the notify() method to pass to the Notifier
 */
Zotero.ZotFile.notifierCallback = new function() {

    var zz = Zotero.ZotFile;
    // public functions
    this.notify = notify;

    /**
     * Callback function for the event listener
     * https://www.zotero.org/support/dev/client_coding/javascript_api#notification_system
     * @param  {string} event    Event: add (c, s, i, t, ci, it), modify (c, s, i, t),
     *    delete (c, s, i, t), remove (ci, it), move (c, for changing collection parent)
     * @param  {string} type     Item type: c = collection, s = search (saved search), i = item,
     *    t = tag, ci = collection-item, it = item-tag 
     * @param  {array}  ids       Array with object ids.
     * @param  {object} extraData Extra data (e.g. deleted items)
     * @return {void}
     */
    function notify(event, type, ids, extraData) {
        // automatic renaming
        if (type == 'item' && event == 'add' && zz.getPref('automatic_renaming') != 1) {
            // retrieve the added/modified items
            let atts = Zotero.Items.get(ids)
                .filter(att => att.isImportedAttachment() && !att.isTopLevelItem())
                .filter(att => att.fileExists() && Zotero.ZotFile.checkFileType(att.getFile()));
            // rename attachments
            Zotero.ZotFile.test = atts;
            if (atts.length > 0) setTimeout(() => rename(atts), 100);
        }
        // extract outline from pdf
        if (type == 'item' && event == 'add' && zz.getPref('pdfOutline.getToc')) {
            let atts = Zotero.Items.get(ids)
                .filter(att => att.isAttachment())
                .filter(att => att.fileExists() && att.attachmentMIMEType.indexOf('pdf') != -1)
                .map(att => att.getID());
            // get outline of file
            if (atts.length > 0) setTimeout(() => Zotero.ZotFile.pdfOutline.getOutline(atts), 100);
        }
    }

    /**
     * Automatic renaming of Items
     * @param  {array} attachments Array with attachment items
     * @return {void}
     */
    function rename(attachments) {
        var auto_rename = zz.getPref('automatic_renaming'),
            progress_win = new Zotero.ZotFile.ProgressWindow();
        progress_win.changeHeadline(zz.ZFgetString('general.newAttachmentRenamed'));
        // function to rename attachments
        var on_confirm = function(att) {
            // rename attachment
            var id = zz.renameAttachment(att);
            att = Zotero.Items.get(id);
            // user notification
            progress_win.show();
            progress = new progress_win.ItemProgress(att.getImageSrc(), att.getField('title'));
            progress.setProgress(100);
        };
        // iterate through attachments
        attachments.filter(att => att.isImportedAttachment() && !att.isTopLevelItem())
            .filter(att => att.fileExists() && Zotero.ZotFile.checkFileType(att.getFile()))
            .forEach(function(att) {
                // get id and key
                var item = Zotero.Items.get(att.getSource()),
                    file = att.getFile();
                // check whether key is excluded                
                if(zz.excludeAutorenameKeys.includes(att.key) || zz.excludeAutorenameKeys.includes(item.key)) {
                    zz.Utils.removeFromArray(zz.excludeAutorenameKeys, item.key);
                    return;
                }
                // skip if file already has correct filename
                var filename = att.getFilename().replace(/\.[^/.]+$/, '');
                if(filename.indexOf(zz.getFilename(item, filename)) === 0) return;
                // exclude current key for next event
                zz.excludeAutorenameKeys.push(att.key);
                // user message
                var duration = zz.getPref('info_window_duration_clickable');
                var message = {
                    lines: [file.leafName],
                    txt: zz.ZFgetString('renaming.clickMoveRename'),
                    icons: [att.getImageSrc()]
                };
                // always ask user
                if(auto_rename == 2)
                    zz.infoWindow(zz.ZFgetString('general.newAttachment'), message, duration, () => on_confirm(att));
                // ask user if item has other attachments
                if(auto_rename == 3) {
                    var item_atts = Zotero.Items.get(item.getAttachments())
                        .filter(att => zz.checkFileType(att))
                        .filter(att => att.isImportedAttachment() || att.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_FILE);
                    if (item_atts.length == 1) on_confirm(att);
                    if (item_atts.length > 1)
                        zz.infoWindow(zz.ZFgetString('general.newAttachment'), message, duration, () => on_confirm(att));
                }
                // always rename
                if(auto_rename == 4) on_confirm(att);
            })        
        progress_win.startCloseTimer();
    }
}
