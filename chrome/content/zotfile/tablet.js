/**
 * Zotero.ZotFile.Tablet
 * Functions related to tablet features
 */
Zotero.ZotFile.Tablet = new function() {

    this.extractPdfs = [];

    /**
     * Add tablet tag to attachment and parent item. A separate save() for attachment and parent item
     *     is required to update the database.
     * @param {Zotero.Item} att Zotero attachment item
     * @param {string}      tag Name of tag
     * @return {void}
     */
    this.addTabletTag = function (att, tag) {
        // get parent item
        var item = Zotero.Items.get(att.parentItemID);
        // get tag IDs
        var tag_remove = (tag == this.Tablet.tag) ? this.Tablet.tagMod : this.Tablet.tag;
        // add tag to parent and attachment
        att.addTag(tag);
        item.addTag(tag);
        // remove other tag from parent and attachment
        att.removeTag(tag_remove);
        if (item.hasTag(tag_remove)) {
            var atts = Zotero.Items.get(item.getAttachments());
            if (!atts.some(att => att.hasTag(tag_remove)))
                item.removeTag(tag_remove);
        }
    }.bind(Zotero.ZotFile);

    /**
     * Remove tablet tag from attachment and parent item
     * @param  {Zotero.Item} att Zotero attachment item
     * @param  {string}      tag Name of tag to remove
     * @return {void}
     */
    this.removeTabletTag = function(att, tag) {
        // remove from attachment
        att.removeTag(tag);
        // remove from parent item
        var item = Zotero.Items.get(att.parentItemID);
        if(item.hasTag(tag)) {
            var atts = Zotero.Items.get(item.getAttachments());
            if(!atts.some(att => att.hasTag(tag)))
                item.removeTag(tag);
        }
    }.bind(Zotero.ZotFile);

    this.createSavedSearch = function(which) {
        if(which == 'tablet' || which == 'both') {
            var search = new Zotero.Search();
            search.addCondition('tag', 'contains', this.Tablet.tag);
            search.addCondition('includeParentsAndChildren', 'true');
            search.addCondition('noChildren', 'true');
            search.name = 'Tablet Files';
            search.saveTx();
        }
        if(which == 'tablet_modified' || which == 'both') {
            var search_modified = new Zotero.Search();
            search_modified.addCondition('tag', 'is', this.Tablet.tagMod);
            search_modified.name = 'Tablet Files (modified)';
            search_modified.saveTx();
        }
    }.bind(Zotero.ZotFile);

    this.getSelectedAttachmentsFromTablet = Zotero.Promise.coroutine(function* () {
        this.Tablet.extractPdfs = [];
        // get selected attachments, filter for tablet
        var atts = Zotero.Items.get(this.getSelectedAttachments())
            .filter(this.Tablet.getTabletStatus)
            .filter(this.checkFileType);
        // confirm
        if (this.getPref("confirmation_batch_ask") && atts.length >= this.getPref("confirmation_batch"))
            if(!confirm(this.ZFgetString('tablet.getAttachments', [atts.length])))
                return;
        // show notification
        var progressWin = this.progressWindow(this.ZFgetString('tablet.AttsGot')),
            description = atts.length == 0;
        // iterate through attachments
        for (let i = 0; i < atts.length; i++) {
            var att = atts[i],
                progress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title'));
            // check attachment
            if(!(yield att.fileExists()) || att.isTopLevelItem()) {
                description = true;
                progress.setError();
                continue;
            }
            // get attachment from tablet
            att = yield this.Tablet.getAttachmentFromTablet(att, false);
            // update progress window
            progress.complete(att.attachmentFilename, att.getImageSrc());
        }
        // show messages and handle errors
        if(description) progressWin.addDescription(this.ZFgetString('general.warning.skippedAtt.msg'));
        progressWin.startCloseTimer(this.getPref("info_window_duration"));
        // extract annotations
        if(this.Tablet.extractPdfs.length > 0)
            this.pdfAnnotations.getAnnotations(this.Tablet.extractPdfs);
    }.bind(Zotero.ZotFile));

    this.clearInfo = function (att) {
        try {
            var parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
                    .createInstance(Components.interfaces.nsIDOMParser);
            var content = att.getNote().replace(/zotero:\/\//g, 'http://zotfile.com/'),
                doc = parser.parseFromString(content, 'text/html'),
                p = doc.querySelector('#zotfile-data');
            if(p === null) p = doc.querySelector('[title*="lastmod"][title*="projectFolder"]');
            if (p !== null) doc.removeChild(p);
            // save content back to note
            content = doc.documentElement.innerHTML
                // remove old zotfile data
                .replace(/(lastmod|mode|location|projectFolder)\{.*?\};?/g,'')
                // replace links with zotero links
                .replace(/http:\/\/zotfile.com\//g, 'zotero://');
            att.setNote(content);
        }
        catch(e) {
            att.setNote('');
        }
    }.bind(Zotero.ZotFile);

    this.getInfo = function(att, key) {
        try {
            var parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
                    .createInstance(Components.interfaces.nsIDOMParser);
            var value,
                content = att.getNote(),
                doc = parser.parseFromString(content, 'text/html'),
                p = doc.querySelector('#zotfile-data');
            if(p === null) p = doc.querySelector('[title*="lastmod"][title*="projectFolder"]');
            if(p === null) {
                // support for old system
                var search = content.search(key);
                value = content.substring(search);
                value = value.substring(value.search('{') + 1, value.search('}'));
            }
            else {
                var data = JSON.parse(p.getAttribute('title').replace(/&quot;/g, '"'));
                value = key in data ? data[key] : undefined;
            }
            // for location tag: replace [BaseFolder] with destination folder
            if(key == 'location') value = value.replace('[BaseFolder]', this.getPref('tablet.dest_dir'));
            // for location tag: correct window/mac file system
            if(key == 'location' && Zotero.isWin) value = value.replace(/\//g, '\\');
            if(key == 'location' && !Zotero.isWin) value = value.replace(/\\/g, '/');
            // return
            return value;
        }
        catch (err) {
            return '';
        }
    }.bind(Zotero.ZotFile);

    /**
     * Add tablet information to attachment note. A separate save() is required to update the database.
     * @param {Zotero.Item} att   Zotero attachment item.
     * @param {Object}      data  Object with data to save in zotero note
     * @yield {void}
     */
    this.addInfo = function(att, data) {
        // get current content of note
        var win = Services.wm.getMostRecentWindow('navigator:browser'),
            parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
                        .createInstance(Components.interfaces.nsIDOMParser),
            content = att.getNote().replace(/zotero:\/\//g, 'http://zotfile.com/'),
            doc = parser.parseFromString(content, 'text/html'),
            p = doc.querySelector('#zotfile-data');
        if(p === null) p = doc.querySelector('[title*="lastmod"][title*="projectFolder"]');
        // for location tag: replace destination folder with [BaseFolder]
        if('location' in data && this.getPref('tablet.dest_dir_relativePath'))
            data.location = data.location.replace(this.getPref('tablet.dest_dir'), '[BaseFolder]');
        // doesn't exists...
        if (p === null) {
            p = win.document.createElementNS(this.xhtml, 'p');
            p.setAttribute('id', 'zotfile-data');
            p.setAttribute('style', 'color: #cccccc;');
            p.setAttribute('title', JSON.stringify(data));
            p.textContent = '(hidden zotfile data)';
            doc.body.appendChild(p);
        }
        // already exists...
        else {
             var attData = JSON.parse(p.getAttribute('title').replace(/&quot;/g, '"'));
            for (var attr in data) attData[attr] = data[attr];
            p.setAttribute('title', JSON.stringify(attData));
        }
        // save changes in zotero note
        att.setNote(doc.documentElement.innerHTML.replace(/http:\/\/zotfile.com\//g, 'zotero://'));
    }.bind(Zotero.ZotFile);

    this.getTabletStatus = function(att) {
        if(!att) return false;
        return att.isAttachment() && (att.hasTag(this.Tablet.tag) || att.hasTag(this.Tablet.tagMod));
    }.bind(Zotero.ZotFile);

    /**
     * Was the tablet file modified?
     * @param {Zotero.Item} att Zotero attachment item.
     * @yield {bool}            Was the tablet file modified?
     */
    this.getTabletStatusModified = Zotero.Promise.coroutine(function* (att) {
        if (!this.Tablet.getTabletStatus(att))
            return false;
        var path = yield this.Tablet.getTabletFilePath(att);
        if (!path) return false;
        // compare modification time in att note with modification time of tablet file
        var lastmod_tablet = this.Tablet.getInfo(att, 'lastmod'),
            lastmod_file = Date.parse((yield OS.File.stat(path)).lastModificationDate) + '';
        return lastmod_file != lastmod_tablet && lastmod_tablet != '';
    }.bind(Zotero.ZotFile));

    /**
     * Reveal tablet file by showing enclosing folder
     * @yield {void}
     */
    this.showTabletFile = Zotero.Promise.coroutine(function* () {
        var win = Services.wm.getMostRecentWindow("navigator:browser"),
            att = win.ZoteroPane.getSelectedItems()[0],
            tablet = this.Tablet.getTabletStatus(att);
        if (!tablet) return;
        var path = yield this.Tablet.getTabletFilePath(att);
        if(yield OS.File.exists(path)) Zotero.File.pathToFile(path).reveal();
    }.bind(Zotero.ZotFile));

    /**
     * Open tablet file in default application
     * @yield {void}
     */
    this.openTabletFile = Zotero.Promise.coroutine(function* () {
        var win = Services.wm.getMostRecentWindow("navigator:browser"),
            att = win.ZoteroPane.getSelectedItems()[0],
            tablet = this.Tablet.getTabletStatus(att);
        if (!tablet) return;
        var path = yield this.Tablet.getTabletFilePath(att);
        if(yield OS.File.exists(path)) Zotero.launchFile(path);
    }.bind(Zotero.ZotFile));

    /**
     * Get the path to the tablet file
     * @param {Zotero.Item} att     Zotero attachment item.
     * @param {bool}        verbose Show error message if file does not exists
     * @yield {string}              Path to file on tablet or false if file does not exists.
     */
    this.getTabletFilePath = Zotero.Promise.coroutine(function* (att, verbose) {
        var verbose = typeof verbose !== 'undefined' ? verbose : true;
        // foreground mode
        if(this.Tablet.getInfo(att, 'mode') == 2)
            return yield att.getFilePathAsync();
        // background mode
        var path = this.Tablet.getInfo(att, 'location');
        if(!(yield OS.File.exists(path))) {
            if (verbose) this.infoWindow('ZotFile Error', 'The file "' + path + '" does not exist.');
            return false;
        }
        return path;
    }.bind(Zotero.ZotFile));

    this.getTabletLocationFile = function(subfolder) {
        if(subfolder == null) subfolder = '';
        // OS.Path.join(this.getPref('tablet.dest_dir'), subfolder)
        return this.Utils.joinPath(this.getPref('tablet.dest_dir'), subfolder)
    }.bind(Zotero.ZotFile);

    this.getAttachmentsOnTablet = Zotero.Promise.coroutine(function* (subfolder) {
        // search for attachments with tag
        var search = new Zotero.Search();
        search.addCondition('itemType', 'is', 'attachment');
        search.addCondition('tag', 'contains', this.Tablet.tag);
        // search.addCondition('tag', 'is', this.Tablet.tagMod);
        var search_results = yield search.search();
        var atts = Zotero.Items.get(search_results)
            .filter(item => item.isAttachment() && !item.isTopLevelItem());
        // show warning if no information in note
        if(this.getPref('tablet.showwarning'))
            atts.filter(att => this.Tablet.getInfo(att, 'mode') === '')
                .forEach(att => this.infoWindow(this.ZFgetString('general.warning'), this.ZFgetString('tablet.attachmentNoteMissing') + ' (' + att.key + ')'));
        // return attachments on tablet
        atts = atts.filter(att => this.Tablet.getInfo(att, 'mode') != '')
            .filter(att => subfolder === undefined || this.Tablet.getInfo(att, 'projectFolder').toLowerCase() == subfolder.toLowerCase());
        return atts;
    }.bind(Zotero.ZotFile));

    this.getModifiedAttachmentsOnTablet = Zotero.Promise.coroutine(function* (subfolder) {
        var atts = yield this.Tablet.getAttachmentsOnTablet(subfolder);
        atts = yield Zotero.Promise.filter(atts, att => this.Tablet.getTabletStatusModified(att));
        return atts;
    }.bind(Zotero.ZotFile));

    this.setTabletFolder = Zotero.Promise.coroutine(function* (atts, projectFolder) {
        projectFolder = typeof projectFolder !== 'undefined' ? projectFolder : '';
        var tablet_folder = this.Utils.joinPath(this.getPref('tablet.dest_dir'), projectFolder),
            tablet_subfolder = !this.getPref('import') & this.getPref('tablet.subfolder') ? this.getPref('tablet.subfolderFormat') : '';
        atts = atts.filter(att => !att.isTopLevelItem());
        // show infoWindow
        var loc = (projectFolder !== '') ? ("'..." + projectFolder + "'.") : this.ZFgetString('tablet.baseFolder');
        var progressWin = this.progressWindow(this.ZFgetString('tablet.movedAttachments', [loc]));
        // iterature over attachments
        for (let i = 0; i < atts.length; i++) {
            let att = atts[i],
                progress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title'));
            try {
                let item = Zotero.Items.get(att.parentItemID),
                    path = yield this.Tablet.getTabletFilePath(att),
                    folder = this.getLocation(tablet_folder, item, tablet_subfolder),
                    pathNew = this.Utils.joinPath(folder, OS.Path.basename(path)),
                    att_mode = this.Tablet.getInfo(att, 'mode');
                let time_saved  = parseInt(this.Tablet.getInfo(att, 'lastmod'), 10),
                    time_tablet = path ? Date.parse((yield OS.File.stat(path)).lastModificationDate) : 0;
                // update tablet folder (background mode)
                if(att_mode == 1)
                    yield this.moveFile(path, pathNew);
                // update tablet folder (foreground mode)
                if(att_mode == 2)
                    yield this.moveLinkedAttachmentFile(att, folder, OS.Path.basename(path), false);
                // update tablet information
                this.Tablet.addInfo(att, {
                    'lastmod': time_saved == time_tablet ? Date.parse((yield OS.File.stat(pathNew)).lastModificationDate) : time_saved,
                    'location': pathNew,
                    'projectFolder': projectFolder
                });
                yield att.saveTx();
                // update progress window
                progress.complete(att.attachmentFilename, att.getImageSrc());
            }
            catch(e) {
                progress.setError();
                this.messages_fatalError.push(e);
            }
        }
        // show messages and handle errors
        progressWin.startCloseTimer(this.getPref("info_window_duration"));
        this.handleErrors();
    }.bind(Zotero.ZotFile));

    this.checkSelectedSearch = function() {
        // get selected saved search
        var win = Services.wm.getMostRecentWindow('navigator:browser'),
            search = win.ZoteroPane.getSelectedSavedSearch();
        // returns false if no saved search is selected (e.g. collection)
        if (!search) return false;
        // check whether saved search 'tablet files (modified)' is selected based on search conditions
        var conditions = search.getConditions();
        for (var key in conditions) {
            var cond = conditions[key];
            if(cond.condition == 'tag' && [this.Tablet.tag, this.Tablet.tagMod].includes(cond.value))
                return true;
        }
        return false;
    }.bind(Zotero.ZotFile);

    this.updateModifiedAttachmentsSearch = Zotero.Promise.coroutine(function* () {
        // update saved search only if 'tablet files (modified)' saved search is selected
        if(!this.Tablet.checkSelectedSearch()) return;
        // add tag for modified tablet item and remove tablet tag
        var atts = yield this.Tablet.getModifiedAttachmentsOnTablet();
        yield Zotero.DB.executeTransaction(function* () {
            for (let att of atts) {
                this.Tablet.addTabletTag(att, this.Tablet.tagMod);
                yield att.save();
                yield Zotero.Items.get(att.parentItemID).save();
            }
        }.bind(this));
    }.bind(Zotero.ZotFile));

    this.restrictTabletSearch = Zotero.Promise.coroutine(function* (which) {
        var win = Services.wm.getMostRecentWindow("navigator:browser"),
            subfolders = JSON.parse(this.getPref("tablet.subfolders"));
        // get tablet searches
        var search_filter = s => s.getConditions()
            .some(c => c.condition == 'tag' && c.operator != 'isNot' && c.value.indexOf(this.tag) !== -1)
        var searches = Zotero.Searches.getAll().filter(search_filter);
        // remove all note related conditions
        for (let search of searches) {
            search.getConditions()
                .filter(c => c.condition == 'note' && c.operator == 'contains')
                .forEach(c => search.removeCondition(c.id))
            yield search.saveTx();
        }
        // restrict to subfolder or unfiled items (basefolder)
        var note_contains = which > 0 ? subfolders[which - 1].path : '&quot;projectFolder&quot;:&quot;&quot;';
        for (let search of searches) {
            search.addCondition('note', 'contains', note_contains);
            yield search.saveTx();
            var win = Services.wm.getMostRecentWindow('navigator:browser');
            win.ZoteroPane.onCollectionSelected();
        }
    }.bind(Zotero.ZotFile));


    /**
     * Send the selected attachment to tablet folder
     * @param {Zotero.Item} att            Zotero attachment item
     * @param {string}      project_folder Subfolder in tablet folder
     * @param {bool}        verbose        Show progress message
     * @yield {Zotero.Item}                Zotero attachment item
     */
    this.sendAttachmentToTablet = Zotero.Promise.coroutine(function* (att, project_folder, verbose) {
        verbose = (typeof verbose == 'undefined') ? true : verbose;
        // valid attachment
        if (!att.isAttachment() || att.isTopLevelItem())
            throw("Zotero.ZotFile.Tablet.sendAttachmentToTablet(): att is not a Zotero attachment");
        if (!(yield att.fileExists()) || !this.checkFileType(att)) return;
        var item = Zotero.Items.get(att.parentItemID),
            path = att.getFilePath(),
            tablet_status = this.Tablet.getTabletStatus(att);
        // settings
        var tablet_mode = this.getPref('tablet.mode'),
            tablet_rename = this.getPref('tablet.rename'),
            // OS.Path.join(this.getPref('tablet.dest_dir'), project_folder)
            tablet_dest = this.Utils.joinPath(this.getPref('tablet.dest_dir'), project_folder),
            tablet_subfolder = !this.getPref('import') & this.getPref('tablet.subfolder') ? this.getPref('tablet.subfolderFormat') : '';
        // background mode: Rename and Move Attachment
        if (tablet_mode == 1) {
            // change name of attachment file
            if (tablet_rename)  {
                var filename = this.getFilename(item, att.attachmentFilename);
                if(filename != att.attachmentFilename) {
                    yield att.renameAttachmentFile(filename);
                    att.setField('title', filename);
                    yield att.saveTx();
                    path = att.getFilePath();
                }
            }
            // create copy of file on tablet and catch errors
            var folder = this.getLocation(tablet_dest, item, tablet_subfolder);
            if (!tablet_status) path = yield this.copyFile(path, folder, att.attachmentFilename);
            if (tablet_status) {
                var path_tablet = yield this.Tablet.getTabletFilePath(att);
                if(path_tablet) {
                    path = yield this.moveFile(path_tablet, folder, att.attachmentFilename);
                }
                else {
                    this.infoWindow('ZotFile Warning', 'File on tablet not found. Zotfile is creating a new copy on tablet.');
                    path = yield this.copyFile(path, folder, att.attachmentFilename);
                }
            }
        }
        // foreground mode: Rename and Move Attachment
        if(tablet_mode == 2) {
            att = yield this.renameAttachment(att, false, tablet_rename, tablet_dest, tablet_subfolder, false);
            path = att.getFilePath();
        }
        // add info to note (date of modification to attachment, location, and mode)
        this.Tablet.addInfo(att, {
            'lastmod': Date.parse((yield OS.File.stat(path)).lastModificationDate),
            'mode': tablet_mode,
            'location': path,
            'projectFolder': project_folder
        });
        // add tags
        if (!tablet_status) {
            this.Tablet.addTabletTag(att, this.Tablet.tag);
            if (this.getPref('tablet.tagParentPush')) item.addTag(this.getPref('tablet.tagParentPush_tag'));
            yield item.saveTx();
        }
        yield att.saveTx();
        // notification
        if(verbose) this.messages_report.push("'" + OS.Path.basename(path) + "'");
        return att;
    }.bind(Zotero.ZotFile));

    /**
     * Send selected Zotero attachments to tablet
     * @param {int} idx_subfolder  Index of subfolder
     * @yield {void}
     */
    this.sendSelectedAttachmentsToTablet = Zotero.Promise.coroutine(function* (idx_subfolder) {
        // get selected attachments
        var atts = Zotero.Items.get(this.getSelectedAttachments())
            .filter(this.checkFileType);
        // get project folder
        var project_folder = '';
        if (idx_subfolder !== undefined) {
            if(this.getPref('tablet.projectFolders') == 1)
                project_folder = this.projectPath[idx_subfolder];
            if(this.getPref('tablet.projectFolders') == 2) {
                var subfolders = JSON.parse(this.getPref('tablet.subfolders'));
                project_folder = subfolders[idx_subfolder].path;
            }
        }
        // confirm
        var atts_tablet = yield Zotero.Promise.filter(atts, att =>
                this.Tablet.getTabletStatus(att) && this.Tablet.getTabletFilePath(att, false)),
            pref_repush = !this.getPref('tablet.confirmRepush');
        if (this.getPref('confirmation_batch_ask') && atts.length >= this.getPref('confirmation_batch'))
            if(!confirm(this.ZFgetString('tablet.sendAttachments', [atts.length]))) return;
        if (!pref_repush && (atts_tablet.length > 0))
            pref_repush = confirm(this.ZFgetString('tablet.replaceAttachAlready', [atts_tablet.length]));
        // show infoWindow
        var progressWin = this.progressWindow(this.ZFgetString('tablet.AttsMoved')),
            description = atts.length == 0 || atts_tablet == atts.length;
        // iterate through attachments
        for (let i = 0; i < atts.length; i++) {
            var att = atts[i],
                path_tablet = yield this.Tablet.getTabletFilePath(att, false);
            if(this.Tablet.getTabletStatus(att) && path_tablet && !pref_repush) continue;
            // get attachment and add line to infoWindow
            var att_mode = this.Tablet.getInfo(att, 'mode'),
                progress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title'));
            // check attachment
            if (!(yield att.fileExists()) || att.isTopLevelItem()) {
                description = true;
                progress.setError();
                continue;
            }
            // First remove from tablet if mode has changed or tablet file was moved
            if(this.Tablet.getTabletStatus(att) && (att_mode != this.getPref('tablet.mode') || !path_tablet))
                att = yield this.Tablet.getAttachmentFromTablet(att, true);
            // send to tablet
            att = yield this.Tablet.sendAttachmentToTablet(att, project_folder, false);
            // update progress window
            progress.complete(att.attachmentFilename, att.getImageSrc());
        }
        // show messages and handle errors
        if(description) progressWin.addDescription(this.ZFgetString('general.warning.skippedAtt.msg'));
        progressWin.startCloseTimer(this.getPref('info_window_duration'));
    }.bind(Zotero.ZotFile));

    this.updateSelectedTabletAttachments = Zotero.Promise.coroutine(function* () {
        // get selected attachments, filter for tablet
        var atts = Zotero.Items.get(this.getSelectedAttachments())
            .filter(this.Tablet.getTabletStatus)
            .filter(this.checkFileType);
        // show notification
        var progressWin = this.progressWindow('ZotFile: Update Modification Time'),
            description = atts.length == 0;
        // iterate through selected attachments
        for (let i = 0; i < atts.length; i++) {
            var att = atts[i],
                item = Zotero.Items.get(att.parentItemID),
                path = yield this.Tablet.getTabletFilePath(att),
                progress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title')),
                att_mode = this.Tablet.getInfo(att, 'mode');
            if(!path || att.isTopLevelItem()) {
                description = true;
                progress.setError();
                continue;
            }
            if (!(yield this.Tablet.getTabletStatusModified(att))) {
                progress.complete(att.attachmentFilename, att.getImageSrc());
                continue;
            }
            // update status (foreground mode)
            if(att_mode == 2) {
                let lastModificationDate = Date.parse((yield OS.File.stat(path)).lastModificationDate);
                this.Tablet.addInfo(att, {'lastmod': lastModificationDate});
                this.Tablet.addTabletTag(att, this.Tablet.tag);
                yield att.saveTx();
                yield item.saveTx();
            }
            // update status (background mode)
            if(att_mode == 1) {
                var project_folder = this.Tablet.getInfo(att, 'projectFolder');
                // first get from tablet
                att = yield this.Tablet.getAttachmentFromTablet(att, true);
                // now send back to reader
                att = yield this.Tablet.sendAttachmentToTablet(att, project_folder, false);
            }
            // extract annotations
            if (this.getPref('tablet.updateExtractAnnotations'))
                this.pdfAnnotations.getAnnotations([att.id]);
            // update progress window
            progress.complete(att.attachmentFilename, att.getImageSrc());
        }
        // show messages and handle errors
        if(description) progressWin.addDescription(this.ZFgetString('general.warning.skippedAtt.msg'));
        progressWin.startCloseTimer(this.getPref('info_window_duration'));
    }.bind(Zotero.ZotFile));

    this.getLastModifiedTabletFile = Zotero.Promise.coroutine(function* (att) {
        // foreground mode
        if (this.Tablet.getInfo(att, 'mode') == 2)
            return yield att.getFilePathAsync();
        // background mode
        var path_zotero = yield att.getFilePathAsync(),
            path_tablet = yield this.Tablet.getTabletFilePath(att);
        // get times
        var time_tablet = path_tablet ? Date.parse((yield OS.File.stat(path_tablet)).lastModificationDate) : 0,
            time_saved  = parseInt(this.Tablet.getInfo(att, 'lastmod'), 10),
            time_zotero = path_zotero ? Date.parse((yield OS.File.stat(path_zotero)).lastModificationDate) : 0;
        if (time_tablet == 0 && time_zotero == 0)
            return false;
        // set options
        var tablet_status = undefined;
        if (time_tablet > time_saved  && time_zotero <= time_saved) tablet_status = 0;
        if (time_tablet <= time_saved && time_zotero <= time_saved) tablet_status = 2;
        if (time_tablet <= time_saved && time_zotero > time_saved) tablet_status = 2;
        if (time_tablet > time_saved  && time_zotero > time_saved) tablet_status = 1;
        // prompt if both file have been modified
        if(tablet_status == 1) tablet_status = this.promptUser(
            this.ZFgetString('extraction.fileConflict',
            [OS.Path.basename(path_zotero)]),
            this.ZFgetString('extraction.fileConflict.useT'),
            this.ZFgetString('general.cancel'),
            this.ZFgetString('extraction.fileConflict.useZ'));
        if(tablet_status == 0) return path_tablet;
        if(tablet_status == 2) return path_zotero;
        if(tablet_status == 1) return false;
    }.bind(Zotero.ZotFile));

    this.getAttachmentFromTablet = Zotero.Promise.coroutine(function* (att, fake_remove) {
        var item = Zotero.Items.get(att.parentItemID),
            tablet_status = 1, 
            item_pulled = false,
            att_deleted = false,
            att_mode = this.Tablet.getInfo(att, 'mode'),
            attSubfolder = this.Tablet.getInfo(att, 'projectFolder').trim();
        // get files
        var path_zotero = yield att.getFilePathAsync(),
            path_tablet = yield this.Tablet.getTabletFilePath(att, false);
        if (path_tablet === false) {
            // clear tablet tag and info from att and parent item
            this.Tablet.removeTabletTag(att, this.Tablet.tag);
            this.Tablet.clearInfo(att);
            yield att.saveTx();
            yield item.saveTx();
            if (!fake_remove)
                this.infoWindow('ZotFile Warning', 'The tablet file "' + att.attachmentFilename + '" was manually moved and does not exist.');
            return att;
        }
        var tablet_folder = OS.Path.dirname(path_tablet);
        // get modification times for files
        var time_tablet = path_tablet ? Date.parse((yield OS.File.stat(path_tablet)).lastModificationDate) : 0,
            time_saved  = parseInt(this.Tablet.getInfo(att, 'lastmod'), 10),
            time_zotero = path_zotero ? Date.parse((yield OS.File.stat(path_zotero)).lastModificationDate) : 0;
        // background mode
        if(att_mode == 1 && (time_tablet != 0 || time_zotero != 0)) {
            // set options
            if (time_tablet > time_saved  && time_zotero <= time_saved) tablet_status = 0;
            if (time_tablet <= time_saved && time_zotero <= time_saved) tablet_status = 2;
            if (time_tablet <= time_saved && time_zotero > time_saved) tablet_status = 2;
            if (time_tablet > time_saved  && time_zotero > time_saved) tablet_status = 1;
            // if attachment gets replaced
            if (!this.getPref('tablet.storeCopyOfFile')) {
                // prompt if both file have been modified
                if (tablet_status == 1) {
                    tablet_status = this.promptUser(this.ZFgetString('tablet.fileConflict', [att.attachmentFilename]),
                        this.ZFgetString('tablet.fileConflict.replaceZ'),
                        this.ZFgetString('general.cancel'),
                        this.ZFgetString('tablet.fileConflict.removeT'));
                    //att_deleted is true to display a special message when the attachments have been deleted from tablet without being sent back to Zotero
                    if (tablet_status == 2) att_deleted = true;
                }
                // replace zotero file
                if(tablet_status == 0) {
                    yield OS.File.move(path_tablet, path_zotero);
                    item_pulled = true;
                }
            }
            // if saving a copy of the file as a new attachment with suffix and reader file was modified
            if (this.getPref('tablet.storeCopyOfFile') && tablet_status != 2)  {
                var filename = this.Utils.addSuffix(OS.Path.basename(path_zotero), this.getPref('tablet.storeCopyOfFile_suffix'));
                //add linked attachment
                if (item.library.libraryType == 'user' && !this.getPref('import')) {
                    let path_copied = OS.Path.join(OS.Path.dirname(path_zotero), filename);
                    yield OS.File.move(path_tablet, path_copied);
                    var options = {file: path_copied, libraryID: item.libraryID, parentItemID: item.id, collections: undefined};
                    att_new = yield Zotero.Attachments.linkFromFile(options);
                    item_pulled = true;
                    // extract annotations from attachment and add note
                    if (this.getPref('pdfExtraction.Pull'))
                        this.Tablet.extractPdfs.push(att_new.id);
                }
                //imports attachment
                if (item.library.libraryType != 'user' || this.getPref('import')) {
                    // import file on reader
                    var options = {file: path_tablet, libraryID: item.libraryID, parentItemID: item.id, collections: undefined};
                    att_new = yield Zotero.Attachments.importFromFile(options);
                    // rename file associated with attachment
                    yield att_new.renameAttachmentFile(filename);
                    // change title of attachment item
                    att_new.setField('title', filename);
                    yield att_new.saveTx();
                    // remove file on reader
                    yield OS.File.remove(path_tablet);
                    item_pulled = true;
                    // extract annotations from attachment and add note
                    if (this.getPref('pdfExtraction.Pull'))
                        this.Tablet.extractPdfs.push(att_new.id);
                }
            }
            // Pull without replacement (i.e. remove file on tablet)
            if(tablet_status == 2) {
                yield OS.File.remove(path_tablet);
                item_pulled = true;
            }
        }
        // foreground mode
        if(att_mode == 2) {
            // add parent key to array for excluded items from auto rename
            this.excludeAutorenameKeys.push(item.key);
            // get note content
            var note = att.getNote();
            // rename and move attachment
            var subfolder = !this.getPref('import') & this.getPref('subfolder') ? this.getPref('subfolderFormat') : '';
            att = yield this.renameAttachment(att, this.getPref('import'), this.getPref('tablet.rename'),
                            this.getPref('dest_dir'), subfolder, false);
            // finish up
            item_pulled = true;
            tablet_status = time_zotero > time_saved ? 0 : 2;
            // add note content
            att.setNote(note);
            yield att.saveTx();
        }
        // remove subfolder if empty
        if (attSubfolder != "" && tablet_folder != OS.Path.normalize(this.getPref('tablet.dest_dir')))
            this.removeFile(tablet_folder);
        // post-processing if attachment has been removed & it's not a fake-pull
        if (item_pulled && !fake_remove) {
            // remove tag from attachment and parent item
            this.Tablet.removeTabletTag(att, this.Tablet.tag);
            // clear attachment note
            this.Tablet.clearInfo(att);
            // extract annotations from attachment and add note
            if (this.getPref('pdfExtraction.Pull') && tablet_status != 2 && !this.getPref('tablet.storeCopyOfFile'))
                this.Tablet.extractPdfs.push(att.id);
            // remove tag from parent item
            var tag_parent = this.getPref('tablet.tagParentPush_tag');
            if(item.hasTag(tag_parent)) item.removeTag(tag_parent);
            // add tag to parent item
            if (this.getPref('tablet.tagParentPull'))
                item.addTag(this.getPref('tablet.tagParentPull_tag'));
            // notification (display a different message when the attachments have been deleted from tablet without being sent back to Zotero)
            var message = "'" + att.attachmentFilename + "' " + (att_deleted ? this.ZFgetString('tablet.attsDel') : '');
            this.messages_report.push(message);
        }
        // remove modified tag from attachment
        if (item_pulled) this.Tablet.removeTabletTag(att, this.Tablet.tagMod);
        yield att.saveTx();
        yield item.saveTx();
        // return new id
        return att;
    }.bind(Zotero.ZotFile));
}
