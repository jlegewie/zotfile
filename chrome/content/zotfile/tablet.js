/**
 * Zotero.ZotFile.Tablet
 * Functions related to tablet features
 */
Zotero.ZotFile.Tablet = new function() {

    this.addTabletTag = addTabletTag.bind(Zotero.ZotFile);
    this.removeTabletTag = removeTabletTag.bind(Zotero.ZotFile);
    this.createSavedSearch = createSavedSearch.bind(Zotero.ZotFile);
    this.getSelectedAttachmentsFromTablet = getSelectedAttachmentsFromTablet.bind(Zotero.ZotFile);
    this.getInfo = getInfo.bind(Zotero.ZotFile);
    this.addInfo = addInfo.bind(Zotero.ZotFile);
    this.clearInfo = clearInfo.bind(Zotero.ZotFile);
    this.getTabletStatus = getTabletStatus.bind(Zotero.ZotFile);
    this.getTabletStatusModified = getTabletStatusModified.bind(Zotero.ZotFile);
    this.showTabletFile = showTabletFile.bind(Zotero.ZotFile);
    this.openTabletFile = openTabletFile.bind(Zotero.ZotFile);
    this.getTabletFile = getTabletFile.bind(Zotero.ZotFile);
    this.getTabletLocationFile = getTabletLocationFile.bind(Zotero.ZotFile);
    this.getAttachmentsOnTablet = getAttachmentsOnTablet.bind(Zotero.ZotFile);
    this.getModifiedAttachmentsOnTablet = getModifiedAttachmentsOnTablet.bind(Zotero.ZotFile);
    this.setTabletFolder = setTabletFolder.bind(Zotero.ZotFile);
    this.checkSelectedSearch = checkSelectedSearch.bind(Zotero.ZotFile);
    this.updateModifiedAttachmentsSearch = updateModifiedAttachmentsSearch.bind(Zotero.ZotFile);
    this.restrictTabletSearch = restrictTabletSearch.bind(Zotero.ZotFile);
    this.sendAttachmentToTablet = sendAttachmentToTablet.bind(Zotero.ZotFile);
    this.sendSelectedAttachmentsToTablet = sendSelectedAttachmentsToTablet.bind(Zotero.ZotFile);
    this.updateSelectedTabletAttachments = updateSelectedTabletAttachments.bind(Zotero.ZotFile);
    this.getAttachmentFromTablet = getAttachmentFromTablet.bind(Zotero.ZotFile);

    function addTabletTag(att, tag) {
        // get parent item
        var item = Zotero.Items.get(att.getSource());
        // get tag IDs
        var tag_remove = (tag == this.Tablet.tag) ? this.Tablet.tagMod : this.Tablet.tag,
            tag_id = Zotero.Tags.getID(tag, 0),
            tag_id_remove = Zotero.Tags.getID(tag_remove, 0);
        // add tag to attachment
        if (!att.hasTag(tag_id)) att.addTag(tag);
        // remove other tag from attachment
        if(att.hasTag(tag_id_remove)) att.removeTag(tag_id_remove);
        // add tag to parent item
        if(!item.hasTag(tag_id)) item.addTag(tag);
        // remove other tag from parent item
        if(item.hasTag(tag_id_remove)) {
            var atts = Zotero.Items.get(item.getAttachments());
            if (!atts.some(att => att.hasTag(tag_id_remove)))
                item.removeTag(tag_id_remove);
        }
    }

    function removeTabletTag(att, tag) {
        var tag_id = Zotero.Tags.getID(tag, 0);
        // remove from attachment
        if (att.hasTag(tag_id)) att.removeTag(tag_id);
        // remove from parent item
        var item = Zotero.Items.get(att.getSource());
        if(item.hasTag(tag_id)) {
            var atts = Zotero.Items.get(item.getAttachments());
            if(!atts.some(att => att.hasTag(tag_id)))
                item.removeTag(tag_id);
        }
    }

    function createSavedSearch (which) {
        if(which == 'tablet' || which == 'both') {
            var search = new Zotero.Search();
            search.addCondition('tag', 'contains', this.Tablet.tag);
            search.addCondition('includeParentsAndChildren', 'true');
            search.addCondition('noChildren', 'true');
            search.setName('Tablet Files');
            search.save();
        }
        if(which == 'tablet_modified' || which == 'both') {
            var search_modified = new Zotero.Search();
            search_modified.addCondition('tag', 'is', this.Tablet.tagMod);
            search_modified.setName('Tablet Files (modified)');
            search_modified.save();
        }
    }

    function getSelectedAttachmentsFromTablet() {
        // get selected attachments, filter for tablet
        var atts = Zotero.Items.get(this.getSelectedAttachments())
            .filter(this.Tablet.getTabletStatus);
        var att_extract = [];
        // confirm
        if (this.getPref("confirmation_batch_ask") && atts.length >= this.getPref("confirmation_batch"))
            if(!confirm(this.ZFgetString('tablet.getAttachments', [atts.length])))
                return;
        // show notification
        var progress_win = this.progressWindow(this.ZFgetString('tablet.AttsGot'));
        // iterate through attachments
        for (var i = 0; i < atts.length; i++) {
            var att = atts[i],
                attProgress = new progress_win.ItemProgress(att.getImageSrc(), att.getField('title'));
            try {
                // get attachment and item object
                let item = Zotero.Items.get(att.getSource());
                // get attachment from tablet
                let att2 = this.Tablet.getAttachmentFromTablet(item, att, false);
                // update progress window
                attProgress.complete(att2.att.getFilename(), att2.att.getImageSrc());
                // extract annotations
                if(att2.extract) att_extract.push(att2.id);
            }
            catch(e) {
                attProgress.setError();
                this.messages_fatalError.push('Error: ' + e);
            }
        }
        // show messages and handle errors
        progress_win.startCloseTimer(this.getPref("info_window_duration"));
        this.handleErrors();
        // extract annotations
        if(att_extract.length > 0) this.pdfAnnotations.getAnnotations(att_extract);
    }

    function clearInfo(att) {
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
            att.save();
        }
        catch(e) {
            att.setNote('');
            att.save();
        }
    }

    function getInfo(att, key) {
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
    }

    function addInfo(att, key, value) {
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
        att.save();
    }

    function getTabletStatus(att) {
        if(!att) return false;
        var ids_tag = [Zotero.Tags.getID(this.Tablet.tag, 0), Zotero.Tags.getID(this.Tablet.tagMod, 0)];
        return att.isAttachment() && att.hasTags(ids_tag);
    }

    function getTabletStatusModified(item) {
        if (!this.Tablet.getTabletStatus(item))
            return false;
        var file = this.Tablet.getTabletFile(item);
        if (!file) return false;
        if (!file.exists()) return false;
        // get last modified time from att note and add att to list if file was modified
        var lastmod = this.Tablet.getInfo(item, 'lastmod');
        return file.lastModifiedTime + '' != lastmod && lastmod != '';
    }

    function showTabletFile() {
        var win = this.wm.getMostRecentWindow("navigator:browser"),
            att = win.ZoteroPane.getSelectedItems()[0],
            tablet = this.Tablet.getTabletStatus(att);
        if (!tablet) return;
        var file = this.Tablet.getTabletFile(att);
        if(file.exists()) file.reveal();
    }

    function openTabletFile() {
        var win = this.wm.getMostRecentWindow("navigator:browser"),
            att = win.ZoteroPane.getSelectedItems()[0],
            tablet = this.Tablet.getTabletStatus(att);
        if (!tablet) return;
        var file = this.Tablet.getTabletFile(att);
        if(file.exists()) Zotero.launchFile(file);
    }

    function getTabletFile(att, verbose) {
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
    }

    function getTabletLocationFile(subfolder) {
        if(subfolder == null) subfolder = '';
        return this.createFile(this.getPref('tablet.dest_dir') + subfolder);
    }

    function getAttachmentsOnTablet(subfolder) {
        // search for attachments with tag
        var search = new Zotero.Search();
        search.addCondition('itemType', 'is', 'attachment');        
        search.addCondition('tag', 'contains', this.Tablet.tag);
        // search.addCondition('tag', 'is', this.Tablet.tagMod);
        var search_results = search.search();
        var atts = Zotero.Items.get(search_results)
                .filter(item => item.isAttachment() && !item.isTopLevelItem());
        // show warning if no information in note
        atts.filter(att => this.Tablet.getInfo(att, 'mode') === '')
            .forEach(att => this.infoWindow(this.ZFgetString('general.warning'), this.ZFgetString('tablet.attachmentNoteMissing') + ' (' + att.key + ')'));
        // return attachments on tablet
        atts = atts.filter(att => this.Tablet.getInfo(att, 'mode') != '')
            .filter(att => subfolder === undefined || this.Tablet.getInfo(att, 'projectFolder').toLowerCase() == subfolder.toLowerCase());
        return atts;
    }

    function getModifiedAttachmentsOnTablet(subfolder) {
        var atts = this.Tablet.getAttachmentsOnTablet(subfolder)
            .filter(att => this.Tablet.getTabletStatusModified(att));
        return atts;
    }

    function setTabletFolder(items, project_folder) {
        items = items.filter(item => item.getSource());
        for (var i = 0; i < items.length; i++) {
            try {
                var item = items[i],
                    parent = Zotero.Items.get(item.getSource());
                // first pull if background mode
                var att_mode = this.Tablet.getInfo(item, 'mode');
                if(att_mode == 1 || att_mode != this.getPref('tablet.mode')) {
                    var id_item = this.Tablet.getAttachmentFromTablet(parent, item, true).id;
                    item = Zotero.Items.get(id_item);
                }
                // now push
                if(parent.isRegularItem()) {
                    if(project_folder !== null) this.Tablet.sendAttachmentToTablet(parent, item, project_folder, false);
                    if(project_folder === null) this.Tablet.sendAttachmentToTablet(parent, item, this.Tablet.getInfo(item,'projectFolder'), false);
                    this.messages_report.push("'" + item.getField('title') + "'");
                }
            }
            catch(e) {
                this.messages_fatalError.push(e);
            }
        }
        // show messages and handle errors
        var mess_loc = (project_folder !== '' && project_folder !== null) ? ("'..." + project_folder + "'.") : this.ZFgetString('tablet.baseFolder');
        this.showReportMessages(this.ZFgetString('tablet.movedAttachments', [mess_loc]));
        this.handleErrors();
    }

    function checkSelectedSearch() {
        // get selected saved search
        var win = this.wm.getMostRecentWindow('navigator:browser'),
            search = win.ZoteroPane.getSelectedSavedSearch();
        // returns false if no saved search is selected (e.g. collection)
        if (!search) return false;
        // check whether saved search 'tablet files (modified)' is selected based on search conditions
        var search_conditions = search.getSearchConditions();
        for (var i = 1; i < search_conditions.length; i++) {
            if(search_conditions[i].condition == 'tag' && search_conditions[i].value.indexOf(this.Tablet.tag) !== -1) return true;
        }
        return false;
    }

    function updateModifiedAttachmentsSearch(event) {
        // update saved search only if 'tablet files (modified)' saved search is selected
        if(!this.Tablet.checkSelectedSearch()) return;
        // add tag for modified tablet item and remove tablet tag
        var atts = this.Tablet.getModifiedAttachmentsOnTablet();
        atts.forEach(att => this.Tablet.addTabletTag(att, this.Tablet.tagMod));
    }

    function restrictTabletSearch(which) {
        var win = this.wm.getMostRecentWindow("navigator:browser"),
            subfolders = JSON.parse(this.getPref("tablet.subfolders"));
        // get tablet searches
        var search_filter = function(search) {
            return search.getSearchConditions()
                .some(c => c.condition == 'tag' && c.operator != 'isNot' && c.value.indexOf(this.tag) !== -1);
        };
        var searches = Zotero.Searches.getAll().filter(search_filter);
        // remove all note related conditions
        searches.forEach(function(search) {
            search.getSearchConditions()
                .filter(c => c.condition == 'note' && c.operator == 'contains')
                .forEach(c => search.removeCondition(c.id))
            search.save();
        });
        // restrict to subfolder or unfiled items (basefolder)
        var note_contains = which > 0 ? subfolders[which-1].path : '&quot;projectFolder&quot;:&quot;&quot;';
        searches.forEach(function(search) {
            search.addCondition('note', 'contains', note_contains);
            search.save();
            var win = this.wm.getMostRecentWindow('navigator:browser');
            win.ZoteroPane.onCollectionSelected();
        });
    }

    function sendAttachmentToTablet(item, att, project_folder, verbose) {
        verbose = (typeof verbose == 'undefined') ? true : verbose;
        if (!att.getFile() || !this.checkFileType(att)) return;
        var file_new,
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
                    att.renameAttachmentFile(filename);
                    att.setField('title', filename);
                    att.save();
                    file = att.getFile();
                }
            }
            // create copy of file on tablet and catch errors
            var folder = this.getLocation(tablet_dest, item, tablet_subfolder);
            if (!tablet_status) file_new = this.copyFile(file, folder, file.leafName);
            if (tablet_status) {
                var tablet_file = this.Tablet.getTabletFile(att);
                if(tablet_file.exists()) {
                    var path = this.moveFile(tablet_file, folder, file.leafName);
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
            var id_att_new = this.renameAttachment(att, false, tablet_rename, tablet_dest, tablet_subfolder, false);
            att = Zotero.Items.get(id_att_new);
            file_new = att.getFile();
        }
        // add info to note (date of modification to attachment, location, and mode)
        this.Tablet.addInfo(att, 'lastmod', file_new.lastModifiedTime);
        this.Tablet.addInfo(att, 'mode', tablet_mode);
        this.Tablet.addInfo(att, 'location', file_new.path);
        this.Tablet.addInfo(att, 'projectFolder', project_folder);
        // add tags
        if (!tablet_status) {
            this.Tablet.addTabletTag(att, this.Tablet.tag);
            if (this.getPref('tablet.tagParentPush')) item.addTag(this.getPref('tablet.tagParentPush_tag'));
        }
        // notification
        if(verbose) this.messages_report.push("'" + file_new.leafName + "'");
        return att.id;
    }

    function sendSelectedAttachmentsToTablet(idx_subfolder) {
        // get selected attachments
        var id_atts = this.getSelectedAttachments(true),
            atts = Zotero.Items.get(id_atts),
            id_att,
            description = false,
            // Check which attachments are already on the tablet
            att_tablet = atts.map(this.Tablet.getTabletStatus),
            att_tablet_count = att_tablet.reduce((pv, cv) => pv + cv, 0),
            repush = !this.getPref('tablet.confirmRepush');
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
        if (this.getPref('confirmation_batch_ask') && id_atts.length >= this.getPref('confirmation_batch'))
                if(!confirm(this.ZFgetString('tablet.sendAttachments', [id_atts.length]))) return;
        if (!repush && att_tablet_count > 0)
            repush = confirm(this.ZFgetString('tablet.replaceAttachAlready', [att_tablet_count]));
        if (!repush && att_tablet_count == id_atts.length) {
            this.handleErrors();
            return;
        }
        // show infoWindow
        var progress_win = this.progressWindow(this.ZFgetString('tablet.AttsMoved'));
        // iterate through attachments
        for (i = 0; i < id_atts.length; i++) {
            if(att_tablet[i] && !repush) continue;
            var att = atts[i],
                progress = new progress_win.ItemProgress(att.getImageSrc(), att.getField('title'));
            try {
                if(!att.getFile() || att.isTopLevelItem()) {
                    description = true;
                    progress.setError();
                    continue;
                }
                var item = Zotero.Items.get(att.getSource()),
                    att_mode = this.Tablet.getInfo(att, 'mode');
                // First remove from tablet if mode has changed
                if(att_tablet[i] && att_mode != this.getPref('tablet.mode')) {
                    id_att = this.Tablet.getAttachmentFromTablet(item, att, true).id;
                    att = Zotero.Items.get(id_att);
                }
                // send to tablet
                var id_att_new = this.Tablet.sendAttachmentToTablet(item, att, project_folder, false);
                att = Zotero.Items.get(id_att_new);
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
    }

    function updateSelectedTabletAttachments() {

        // get selected attachments
        var items = this.getSelectedAttachments()
            .map(id => Zotero.Items.get(id))
            .filter(item => this.Tablet.getTabletStatusModified(item));
        // iterate through selected attachments
        for (i = 0; i < items.length; i++) {
            try {
                var id_att,
                    item = items[i],
                    parent = Zotero.Items.get(item.getSource()),
                    file = this.Tablet.getTabletFile(item),
                    filename = file.leafName,
                    att_mode=this.Tablet.getInfo(item, 'mode');
                if(att_mode == 2) {
                    this.Tablet.addInfo(item, 'lastmod', file.lastModifiedTime);
                    this.Tablet.addTabletTag(item, this.Tablet.tag);
                    id_att = item.id;
                }
                if(att_mode == 1) {
                    var project_folder = this.Tablet.getInfo(item, 'projectFolder');
                    // first get from tablet
                    var id_item = this.Tablet.getAttachmentFromTablet(parent, item, true).id;
                    item = Zotero.Items.get(id_item);
                    // now send back to reader
                    id_att = this.Tablet.sendAttachmentToTablet(parent, item, project_folder, false);
                }
                // extract annotations
                if (this.getPref('tablet.updateExtractAnnotations')) this.pdfAnnotations.getAnnotations([id_att]);
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
    }

    function getAttachmentFromTablet (item, att, fake_remove) {
        var id_att = att.id,
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
                if (!item.libraryID && !this.getPref('import')) {
                    file_tablet.moveTo(file_zotero.parent,filename);
                    id_att=Zotero.Attachments.linkFromFile(file_tablet, item.itemID,item.libraryID);
                    item_pulled=true;
                }
                //imports attachment
                if (item.libraryID || this.getPref('import')) {
                    // import file on reader
                    id_att = Zotero.Attachments.importFromFile(file_tablet, item.itemID, item.libraryID);
                    var att_annotated = Zotero.Items.get(id_att);
                    // rename file associated with attachment
                    att_annotated.renameAttachmentFile(filename);
                    // change title of attachment item
                    att_annotated.setField('title', filename);
                    att_annotated.save();
                    // remove file on reader
                    this.Tablet.removeFile(file_tablet);
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
            id_att = this.renameAttachment(att, this.getPref('import'), this.getPref('tablet.rename'),
                            this.getPref('dest_dir'), subfolder, false);
            // get new attachment object
            att = Zotero.Items.get(id_att);
            // finish up
            item_pulled = true;
            tablet_status = time_zotero > time_saved ? 0 : 2;
            // add note content
            att.setNote(note);
            att.save();
        }
        // remove subfolder if empty
        if(!folder.equals(this.createFile(this.getPref('tablet.dest_dir'))))
            this.removeFile(folder);
        // post-processing if attachment has been removed & it's not a fake-pull
        var extract = false;
        if (item_pulled && !fake_remove) {
            // remove tag from attachment and parent item
            this.Tablet.removeTabletTag(att, this.Tablet.tag);
            // clear attachment note
            this.Tablet.clearInfo(att);
            // extract annotations from attachment and add note
            extract = this.getPref('pdfExtraction.Pull') && tablet_status != 2;
            // remove tag from parent item
            var tag_parent = Zotero.Tags.getID(this.getPref('tablet.tagParentPush_tag'),0);
            if(item.hasTag(tag_parent)) item.removeTag(tag_parent);
            // add tag to parent item
            if (this.getPref('tablet.tagParentPull')) item.addTag(this.getPref('tablet.tagParentPull_tag'));
            // notification (display a different message when the attachments have been deleted from tablet without being sent back to Zotero)
            var message = "'" + att.getFile().leafName + "' " + (att_deleted ? this.ZFgetString('tablet.attsDel') : '');
            this.messages_report.push(message);
        }
        // remove modified tag from attachment
        if (item_pulled) this.Tablet.removeTabletTag(att, this.Tablet.tagMod);
        // return new id
        return({'id': id_att, 'att': Zotero.Items.get(id_att), 'extract': extract});
    }
}
