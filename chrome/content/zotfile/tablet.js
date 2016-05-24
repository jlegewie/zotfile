/**
 * Zotero.ZotFile.Tablet
 * Functions related to tablet features
 */
Zotero.ZotFile.Tablet = new function() {

    this.extractPdfs = [];

    /**
     * Add tablet tag to attachment and parent item
     * @param {Zotero.Item} att Zotero attachment item
     * @param {string}      tag Name of tag
     */
    this.addTabletTag = function(att, tag) {
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
            search.setName('Tablet Files');
            search.saveTx();
        }
        if(which == 'tablet_modified' || which == 'both') {
            var search_modified = new Zotero.Search();
            search_modified.addCondition('tag', 'is', this.Tablet.tagMod);
            search_modified.setName('Tablet Files (modified)');
            search_modified.saveTx();
        }
    }.bind(Zotero.ZotFile);

    this.getSelectedAttachmentsFromTablet = Zotero.Promise.coroutine(function* () {
        this.Tablet.extractPdfs = [];
        // get selected attachments, filter for tablet
        var atts = Zotero.Items.get(this.getSelectedAttachments())
            .filter(this.Tablet.getTabletStatus);
        // confirm
        if (this.getPref("confirmation_batch_ask") && atts.length >= this.getPref("confirmation_batch"))
            if(!confirm(this.ZFgetString('tablet.getAttachments', [atts.length])))
                return;
        // show notification
        var progress_win = this.progressWindow(this.ZFgetString('tablet.AttsGot'));
        // iterate through attachments
        for (var i = 0; i < atts.length; i++) {
            var att = atts[i],
                item = Zotero.Items.get(att.parentItemID),
                progress = new progress_win.ItemProgress(att.getImageSrc(), att.getField('title'));
            try {
                // get attachment from tablet
                att = yield this.Tablet.getAttachmentFromTablet(att, false);
                // update progress window
                progress.complete(att.getFilename(), att.getImageSrc());
            }
            catch(e) {
                progress.setError();
                this.messages_fatalError.push('Error: ' + e);
            }
        }
        // show messages and handle errors
        progress_win.startCloseTimer(this.getPref("info_window_duration"));
        this.handleErrors();
        // extract annotations
        if(this.Tablet.extractPdfs.length > 0)
            this.pdfAnnotations.getAnnotations(this.Tablet.extractPdfs);
        this.Tablet.extractPdfs = [];
    }.bind(Zotero.ZotFile));

    this.clearInfo = Zotero.Promise.coroutine(function* (att) {
        try {
            var win = this.wm.getMostRecentWindow('navigator:browser'),
                content = att.getNote().replace(/zotero:\/\//g, 'http://zotfile.com/'),
                fragment = this.Utils.parseHTML(content),
                note = win.document.createElementNS(this.xhtml, 'div');
            note.appendChild(fragment);
            var p = note.querySelector("#zotfile-data");
            if (p !== null) note.removeChild(p);
            // save content back to note
            content = note.innerHTML
                // remove old zotfile data
                .replace(/(lastmod|mode|location|projectFolder)\{.*?\};?/g,'')
                // replace links with zotero links
                .replace(/http:\/\/zotfile.com\//g, 'zotero://');
            att.setNote(content);
            yield att.saveTx();
        }
        catch(e) {
            att.setNote('');
            yield att.saveTx();
        }
    }.bind(Zotero.ZotFile));

    this.getInfo = function(att, key) {
        var win = this.wm.getMostRecentWindow('navigator:browser'),
            note = win.document.createElementNS(this.xhtml, 'div'),
            content = att.getNote(),
            value;
        try {
            try {
                note.appendChild(this.Utils.parseHTML(content));
            }
            catch(e) {
                var match = content.match(/<p id="zotfile-data".+<\/p>/);
                if (match === null) match = content.match(/lastmod{.+}/);
                if (match === null) return '';
                note.appendChild(this.Utils.parseHTML(match[0]));
            }
            // get zotfile data
            var p = note.querySelector('#zotfile-data');
            if(p === null) {
                // support for old system
                var search = content.search(key);
                value = content.substring(search);
                value = value.substring(value.search('{') + 1, value.search('}'));
            }
            else {
                var data = JSON.parse(p.getAttribute('title'));
                value = data[key]===undefined ? '' : data[key];
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
     * Add tablet information to attachment note
     * @param {Zotero.Item}     att   Zotero attachment item.
     * @param {string}          key   Name of 'variable' to save
     * @param {string|numberic} value Value to save in note
     * @yield {void}
     */
    this.addInfo = Zotero.Promise.coroutine(function* (att, key, value) {
        // get current content of note
        var win = this.wm.getMostRecentWindow('navigator:browser'),
            content = att.getNote().replace(/zotero:\/\//g, 'http://zotfile.com/'),
            note = win.document.createElementNS(this.xhtml, 'div'),
            data = {};
        try {
            note.appendChild(this.Utils.parseHTML(content));
        }
        catch (e){
            var match = content.match(/<p id="zotfile-data".+<\/p>/);
            if (match !== null)
                note.appendChild(this.Utils.parseHTML(match[0]));
        }
        // for location tag: replace destination folder with [BaseFolder]
        if(key=="location" && this.getPref('tablet.dest_dir_relativePath'))
            value = value.replace(this.getPref('tablet.dest_dir'), '[BaseFolder]');
        // get zotfile element
        var p = note.querySelector('#zotfile-data');
        // doesn't exists...
        if (p === null) {
            data[key] = value;
            p = win.document.createElementNS(this.xhtml, 'p');
            p.setAttribute('id', 'zotfile-data');
            p.setAttribute('style', 'color: #cccccc;');
            p.setAttribute('title', JSON.stringify(data));
            p.textContent = '(hidden zotfile data)';
            note.appendChild(p);
        }
        // already exists...
        else {
            data = JSON.parse(p.getAttribute('title'));
            data[key] = value;
            p.setAttribute('title', JSON.stringify(data));
        }
        // save changes in zotero note
        att.setNote(note.innerHTML.replace(/http:\/\/zotfile.com\//g, 'zotero://'));
        yield att.saveTx();
    }.bind(Zotero.ZotFile));

    this.getTabletStatus = function(att) {
        if(!att) return false;
        return att.isAttachment() && (att.hasTag(this.Tablet.tag) || att.hasTag(this.Tablet.tagMod));
    }.bind(Zotero.ZotFile);

    this.getTabletStatusModified = function(item) {
        if (!this.Tablet.getTabletStatus(item))
            return false;
        var file = this.Tablet.getTabletFile(item);
        if (!file) return false;
        if (!file.exists()) return false;
        // get last modified time from att note and add att to list if file was modified
        var lastmod = this.Tablet.getInfo(item, 'lastmod');
        return file.lastModifiedTime + '' != lastmod && lastmod != '';
    }.bind(Zotero.ZotFile);

    this.showTabletFile = function() {
        var win = this.wm.getMostRecentWindow("navigator:browser"),
            att = win.ZoteroPane.getSelectedItems()[0],
            tablet = this.Tablet.getTabletStatus(att);
        if (!tablet) return;
        var file = this.Tablet.getTabletFile(att);
        if(file.exists()) file.reveal();
    }.bind(Zotero.ZotFile);

    this.openTabletFile = function() {
        var win = this.wm.getMostRecentWindow("navigator:browser"),
            att = win.ZoteroPane.getSelectedItems()[0],
            tablet = this.Tablet.getTabletStatus(att);
        if (!tablet) return;
        var file = this.Tablet.getTabletFile(att);
        if(file.exists()) Zotero.launchFile(file);
    }.bind(Zotero.ZotFile);

    this.getTabletFile = function(att, verbose) {
        var verbose = typeof verbose !== 'undefined' ? verbose : true;
        try {
            // get file depending on mode
            if(this.Tablet.getInfo(att, 'mode') == 1) {
                var loc = this.Tablet.getInfo(att, 'location');
                if(!this.fileExists(loc)) {
                    if (verbose)
                        this.infoWindow('ZotFile Error', 'The file "' + loc + '" does not exist.');
                    return false;
                }
                return this.createFile(loc);
            }
            else {
                return att.getFile();
            }
        }
        catch (err) {
            return false;
        }
    }.bind(Zotero.ZotFile);

    this.getTabletLocationFile = function(subfolder) {
        if(subfolder == null) subfolder = '';
        // OS.Path.join(this.getPref('tablet.dest_dir'), subfolder)
        return this.createFile(this.getPref('tablet.dest_dir') + subfolder);
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
        atts.filter(att => this.Tablet.getInfo(att, 'mode') === '')
            .forEach(att => this.infoWindow(this.ZFgetString('general.warning'), this.ZFgetString('tablet.attachmentNoteMissing') + ' (' + att.key + ')'));
        // return attachments on tablet
        atts = atts.filter(att => this.Tablet.getInfo(att, 'mode') != '')
            .filter(att => subfolder === undefined || this.Tablet.getInfo(att, 'projectFolder').toLowerCase() == subfolder.toLowerCase());
        return atts;
    }.bind(Zotero.ZotFile));

    this.getModifiedAttachmentsOnTablet = Zotero.Promise.coroutine(function* (subfolder) {
        var atts = yield this.Tablet.getAttachmentsOnTablet(subfolder)
            .filter(att => this.Tablet.getTabletStatusModified(att));
        return atts;
    }.bind(Zotero.ZotFile));

    this.setTabletFolder = Zotero.Promise.coroutine(function* (atts, project_folder) {
        this.infoWindow('Warning', 'why is project_folder == null????');
        project_folder = typeof project_folder !== 'undefined' ? project_folder : '';
        atts = atts.filter(att => !att.isTopLevelItem());
        for (var i = 0; i < atts.length; i++) {
            try {
                var att = atts[i],
                    item = Zotero.Items.get(att.parentItemID);
                if (!item.isRegularItem()) continue;
                // first pull if background mode
                var att_mode = this.Tablet.getInfo(att, 'mode');
                if(att_mode == 1 || att_mode != this.getPref('tablet.mode'))
                    att = yield this.Tablet.getAttachmentFromTablet(att, true);
                // send to tablet
                yield this.Tablet.sendAttachmentToTablet(att, project_folder, false);
                this.messages_report.push("'" + att.getField('title') + "'");
            }
            catch(e) {
                this.messages_fatalError.push(e);
            }
        }
        // show messages and handle errors
        var mess_loc = (project_folder !== '' && project_folder !== null) ? ("'..." + project_folder + "'.") : this.ZFgetString('tablet.baseFolder');
        this.showReportMessages(this.ZFgetString('tablet.movedAttachments', [mess_loc]));
        this.handleErrors();
    }.bind(Zotero.ZotFile));

    this.checkSelectedSearch = function() {
        // get selected saved search
        var win = this.wm.getMostRecentWindow('navigator:browser'),
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
        atts.forEach(att => this.Tablet.addTabletTag(att, this.Tablet.tagMod));
    }.bind(Zotero.ZotFile));

    this.restrictTabletSearch = Zotero.Promise.coroutine(function* (which) {
        var win = this.wm.getMostRecentWindow("navigator:browser"),
            subfolders = JSON.parse(this.getPref("tablet.subfolders"));
        // get tablet searches
        var search_filter = s => s.getConditions()
            .some(c => c.condition == 'tag' && c.operator != 'isNot' && c.value.indexOf(this.tag) !== -1)
        var searches = Zotero.Searches.getAll().filter(search_filter);
        // remove all note related conditions
        searches.forEach(function(search) {
            search.getConditions()
                .filter(c => c.condition == 'note' && c.operator == 'contains')
                .forEach(c => search.removeCondition(c.id))
            yield search.saveTx();
        });
        // restrict to subfolder or unfiled items (basefolder)
        var note_contains = which > 0 ? subfolders[which - 1].path : '&quot;projectFolder&quot;:&quot;&quot;';
        searches.forEach(function(search) {
            search.addCondition('note', 'contains', note_contains);
            yield search.saveTx();
            var win = this.wm.getMostRecentWindow('navigator:browser');
            win.ZoteroPane.onCollectionSelected();
        });
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
        if (!att.isAttachment() || att.isTopLevelItem())
            throw("Zotero.ZotFile.Tablet.sendAttachmentToTablet(): att is not a Zotero attachment");
        if (!att.getFile() || !this.checkFileType(att)) return;
        var item = Zotero.Items.get(att.parentItemID),
            file_new,
            file = att.getFile(),
            tablet_status = this.Tablet.getTabletStatus(att);
        // settings
        var tablet_mode = this.getPref('tablet.mode'),
            tablet_rename = this.getPref('tablet.rename'),
            tablet_dest = this.Utils.joinPath(this.getPref('tablet.dest_dir'), project_folder),
            tablet_subfolder = this.getPref('tablet.subfolder') ? this.getPref('tablet.subfolderFormat') : '';
        // background mode: Rename and Move Attachment
        if (tablet_mode == 1) {
            // change name of file
            if (tablet_rename)  {
                var filename = this.getFilename(item, file.leafName);
                if(filename != file.leafName) {
                    yield att.renameAttachmentFile(filename);
                    att.setField('title', filename);
                    yield att.saveTx();
                    file = att.getFile();
                }
            }
            // create copy of file on tablet and catch errors
            var folder = this.getLocation(tablet_dest, item, tablet_subfolder);
            if (!tablet_status) file_new = this.copyFile(file, folder, file.leafName);
            if (tablet_status) {
                var file_tablet = this.Tablet.getTabletFile(att);
                if(file_tablet.exists()) {
                    var path = this.moveFile(file_tablet, folder, file.leafName);
                    file_new = this.createFile(path);
                }
                else {
                    this.infoWindow('ZotFile Warning', 'File on tablet not found. Zotfile is creating a new copy on tablet.');
                    file_new = this.copyFile(file, folder, file.leafName);
                }
            }
        }
        // foreground mode: Rename and Move Attachment
        if(tablet_mode == 2) {
            att = yield this.renameAttachment(att, false, tablet_rename, tablet_dest, tablet_subfolder, false);
            file_new = att.getFile();
        }
        // add info to note (date of modification to attachment, location, and mode)
        yield this.Tablet.addInfo(att, 'lastmod', file_new.lastModifiedTime);
        yield this.Tablet.addInfo(att, 'mode', tablet_mode);
        yield this.Tablet.addInfo(att, 'location', file_new.path);
        yield this.Tablet.addInfo(att, 'projectFolder', project_folder);
        // add tags
        if (!tablet_status) {
            this.Tablet.addTabletTag(att, this.Tablet.tag);
            if (this.getPref('tablet.tagParentPush')) item.addTag(this.getPref('tablet.tagParentPush_tag'));
        }
        // notification
        if(verbose) this.messages_report.push("'" + file_new.leafName + "'");
        return att;
    }.bind(Zotero.ZotFile));

    /**
     * Send selected Zotero attachments to tablet
     * @param {int} idx_subfolder  Index of subfolder
     * @yield {void}
     */
    this.sendSelectedAttachmentsToTablet = Zotero.Promise.coroutine(function* (idx_subfolder) {
        // get selected attachments
        var atts = Zotero.Items.get(this.getSelectedAttachments(true)),
            description = false,
            // number of attachments on tablet
            atts_tablet = atts.map(this.Tablet.getTabletStatus).reduce((pv, cv) => pv + cv, 0),
            pref_repush = !this.getPref('tablet.confirmRepush');
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
        if (this.getPref('confirmation_batch_ask') && atts.length >= this.getPref('confirmation_batch'))
            if(!confirm(this.ZFgetString('tablet.sendAttachments', [atts.length]))) return;
        if (!pref_repush && atts_tablet > 0)
            pref_repush = confirm(this.ZFgetString('tablet.replaceAttachAlready', [atts_tablet]));
        if (!pref_repush && atts_tablet == atts.length) {
            this.handleErrors();
            return;
        }
        // show infoWindow
        var progress_win = this.progressWindow(this.ZFgetString('tablet.AttsMoved'));
        // iterate through attachments
        for (i = 0; i < atts.length; i++) {
            if(this.Tablet.getTabletStatus(atts[i]) && !pref_repush) continue;
            var att = atts[i],
                progress = new progress_win.ItemProgress(att.getImageSrc(), att.getField('title'));
            try {
                if(!att.getFile() || att.isTopLevelItem()) {
                    description = true;
                    progress.setError();
                    continue;
                }
                var item = Zotero.Items.get(att.parentItemID),
                    att_mode = this.Tablet.getInfo(att, 'mode');
                // First remove from tablet if mode has changed
                if(this.Tablet.getTabletStatus(atts[i]) && att_mode != this.getPref('tablet.mode'))
                    att = yield this.Tablet.getAttachmentFromTablet(att, true);
                // send to tablet
                att = yield this.Tablet.sendAttachmentToTablet(att, project_folder, false);
                // update progress window
                progress.complete(att.getFilename(), att.getImageSrc());                
            }
            catch(e) {
                progress.setError();
                this.messages_fatalError.push(e);
            }
        }
        // show messages and handle errors
        if(description) progress_win.addDescription(this.ZFgetString('general.warning.skippedAtt.msg'));
        progress_win.startCloseTimer(this.getPref('info_window_duration'));
        this.handleErrors();
    }.bind(Zotero.ZotFile));

    this.updateSelectedTabletAttachments = Zotero.Promise.coroutine(function* () {
        // get selected attachments
        var atts = this.getSelectedAttachments()
            .map(id => Zotero.Items.get(id))
            .filter(att => this.Tablet.getTabletStatusModified(att));
        // iterate through selected attachments
        for (i = 0; i < atts.length; i++) {
            try {
                var att = atts[i],
                    file = this.Tablet.getTabletFile(att),
                    filename = file.leafName,
                    att_mode = this.Tablet.getInfo(att, 'mode');
                if(att_mode == 2) {
                    yield this.Tablet.addInfo(att, 'lastmod', file.lastModifiedTime);
                    this.Tablet.addTabletTag(att, this.Tablet.tag);
                }
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
                // show message
                this.messages_report.push("'" + filename + "'");
            }
            catch(e) {
                this.messages_fatalError.push(e);
            }
        }
        // show messages and handle errors
        this.showWarningMessages(this.ZFgetString('general.warning.skippedAtt'), this.ZFgetString('general.warning.skippedAtt.msg'));
        this.showReportMessages(this.ZFgetString('tablet.AttsSynced'));
        this.handleErrors();
    }.bind(Zotero.ZotFile));

    this.getLastModifiedTabletFile = Zotero.Promise.coroutine(function* (att) {
        // foreground mode
        if (this.Tablet.getInfo(att, 'mode') == 2) return att.getFilePath();
        // background mode
        var path_zotero = att.getFilePath(),
            path_tablet = this.Tablet.getTabletFile(att).path;
        // get times
        var time_tablet = (yield OS.File.exists(path_tablet)) ?
                Date.parse((yield OS.File.stat(path_tablet)).lastModificationDate) : 0,
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
            att_mode = this.Tablet.getInfo(att, 'mode');
        // get files
        var file_zotero = att.getFile(),
            file_tablet = this.Tablet.getTabletFile(att),
            folder = file_tablet.parent;
        // get modification times for files
        var time_tablet = this.fileExists(file_tablet) ? parseInt(file_tablet.lastModifiedTime + '', 10) : 0,
            time_saved  = parseInt(this.Tablet.getInfo(att, 'lastmod'), 10),
            time_zotero = (file_zotero) ? parseInt(file_zotero.lastModifiedTime + '', 10) : 0;
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
                    tablet_status = this.promptUser(this.ZFgetString('tablet.fileConflict', [file_zotero.leafName]),
                        this.ZFgetString('tablet.fileConflict.replaceZ'),
                        this.ZFgetString('general.cancel'),
                        this.ZFgetString('tablet.fileConflict.removeT'));
                    //att_deleted is true to display a special message when the attachments have been deleted from tablet without being sent back to Zotero
                    if (tablet_status == 2) att_deleted = true;
                }
                // replace zotero file
                if(tablet_status == 0) {
                    file_tablet.moveTo(file_zotero.parent,file_zotero.leafName);
                    item_pulled = true;
                }
            }
            // if saving a copy of the file as a new attachment with suffix and reader file was modified
            if (this.getPref('tablet.storeCopyOfFile') && tablet_status != 2)  {
                var filename = this.Utils.addSuffix(file_zotero.leafName, this.getPref('tablet.storeCopyOfFile_suffix'));
                //add linked attachment
                if (item.library.libraryType == 'user' && !this.getPref('import')) {
                    file_tablet.moveTo(file_zotero.parent,filename);
                    var options = {file: file_tablet, libraryID: item.libraryID, parentItemID: item.id, collections: undefined};
                    att = yield Zotero.Attachments.linkFromFile(options);
                    item_pulled = true;
                }
                //imports attachment
                if (item.library.libraryType != 'user' || this.getPref('import')) {
                    // import file on reader
                    var options = {file: file_tablet, libraryID: item.libraryID, parentItemID: item.id, collections: undefined};
                    att = yield Zotero.Attachments.importFromFile(options);
                    // rename file associated with attachment
                    yield att.renameAttachmentFile(filename);
                    // change title of attachment item
                    att.setField('title', filename);
                    yield att.saveTx();
                    // remove file on reader
                    this.removeFile(file_tablet);
                    item_pulled = true;
                }
            }
            // Pull without replacement (i.e. remove file on tablet)
            if(tablet_status == 2) {
                this.removeFile(file_tablet);
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
            var subfolder = this.getPref('subfolder') ? this.getPref('subfolderFormat') : '';
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
        if(!folder.equals(this.createFile(this.getPref('tablet.dest_dir'))))
            this.removeFile(folder);
        // post-processing if attachment has been removed & it's not a fake-pull
        if (item_pulled && !fake_remove) {
            // remove tag from attachment and parent item
            this.Tablet.removeTabletTag(att, this.Tablet.tag);
            // clear attachment note
            yield this.Tablet.clearInfo(att);
            // extract annotations from attachment and add note
            if (this.getPref('pdfExtraction.Pull') && tablet_status != 2)
                this.Tablet.extractPdfs.push(att.id);
            // remove tag from parent item
            var tag_parent = this.getPref('tablet.tagParentPush_tag');
            if(item.hasTag(tag_parent)) item.removeTag(tag_parent);
            // add tag to parent item
            if (this.getPref('tablet.tagParentPull'))
                item.addTag(this.getPref('tablet.tagParentPull_tag'));
            // notification (display a different message when the attachments have been deleted from tablet without being sent back to Zotero)
            var message = "'" + att.getFile().leafName + "' " + (att_deleted ? this.ZFgetString('tablet.attsDel') : '');
            this.messages_report.push(message);
        }
        // remove modified tag from attachment
        if (item_pulled) this.Tablet.removeTabletTag(att, this.Tablet.tagMod);
        // return new id
        return att;
    }.bind(Zotero.ZotFile));
}
