
/**
 * Callback implementing the notify() method to pass to the Notifier
 */
Zotero.ZotFile.notifierCallback = new function() {

    this.progress_win = null;

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
    this.notify = Zotero.Promise.coroutine(function* (event, type, ids, extraData) {
        // automatic renaming
        if (type == 'item' && event == 'add' && this.getPref('automatic_renaming') != 1) {
            // retrieve the added/modified items
            let atts = Zotero.Items.get(ids)
                .filter(att => att.isImportedAttachment() && !att.isTopLevelItem())
                .filter(Zotero.ZotFile.checkFileType);
            atts = yield Zotero.Promise.filter(atts, att => att.fileExists());
            // rename attachments
            if (atts.length > 0) setTimeout(() => rename(atts), 100);
        }
        // extract outline from pdf
        if (type == 'item' && event == 'add' && this.getPref('pdfOutline.getToc')) {
            let atts = Zotero.Items.get(ids)
                .filter(att => att.isAttachment())
                .filter(att => att.attachmentContentType == 'application/pdf');
            atts = yield Zotero.Promise.filter(atts, att => att.fileExists());
            // get outline of file
            if (atts.length > 0) setTimeout(() => this.pdfOutline.getOutline(atts.map(att => att.id)), 100);
        }
    }.bind(Zotero.ZotFile));

    /**
     * Automatic renaming of Items
     * @param  {array} attachments Array with attachment items
     * @return {void}
     */
    var rename = Zotero.Promise.coroutine(function* (attachments) {
        var auto_rename = this.getPref('automatic_renaming');
        // iterate through attachments
        for (var i = 0; i < attachments.length; i++) {
            // get id and key
            var att = attachments[i],
                item = Zotero.Items.get(att.parentItemID);
            // check whether key is excluded                
            if(this.excludeAutorenameKeys.includes(att.key) || this.excludeAutorenameKeys.includes(item.key)) {
                this.Utils.removeFromArray(this.excludeAutorenameKeys, item.key);
                continue;
            }
            // skip if file already has correct filename
            var filename = att.attachmentFilename.replace(/\.[^/.]+$/, '');
            if(filename.indexOf(this.getFilename(item, filename)) === 0) continue;
            // exclude current key for next event
            this.excludeAutorenameKeys.push(att.key);
            // user message
            var duration = this.getPref('info_window_duration_clickable');
            var message = {
                lines: [att.attachmentFilename],
                txt: this.ZFgetString('renaming.clickMoveRename'),
                icons: [att.getImageSrc()]
            };
            // always ask user
            if(auto_rename == 2)
                this.infoWindow(this.ZFgetString('general.newAttachment'), message, duration, () => on_confirm(att));
            // ask user if item has other attachments
            if(auto_rename == 3) {
                var item_atts = Zotero.Items.get(item.getAttachments())
                    .filter(this.checkFileType)
                    .filter(att => att.isImportedAttachment() || att.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_FILE);
                if (item_atts.length == 1) on_confirm(att);
                if (item_atts.length > 1)
                    this.infoWindow(this.ZFgetString('general.newAttachment'), message, duration, () => on_confirm(att));
            }
            // always rename
            if(auto_rename == 4) on_confirm(att);
        }
    }.bind(Zotero.ZotFile));

    var on_confirm = Zotero.Promise.coroutine(function* (att) {
        // rename attachment
        att = yield this.renameAttachment(att);
        // user notification
        var progress_win = this.progressWindow(this.ZFgetString('general.newAttachmentRenamed'));
        var progress = new progress_win.ItemProgress(att.getImageSrc(), att.getField('title'));
        progress.setProgress(100);
        progress_win.startCloseTimer();
    }.bind(Zotero.ZotFile));
}
