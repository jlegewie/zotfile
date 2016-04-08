/**
 * Zotero.ZotFile.Tablet
 * Functions related to tablet features
 */
Zotero.ZotFile.Tablet = new function() {

    this.blacklistTagAdd = [];
    this.blacklistTagRemove = [];
    this.addTabletTag = addTabletTag;
    this.createSavedSearch = createSavedSearch;
    this.removeTabletTag = removeTabletTag;
    this.getSelectedAttachmentsFromTablet = getSelectedAttachmentsFromTablet;
    this.clearInfo = clearInfo;
    this.getInfo = getInfo;
    this.addInfo = addInfo;
    this.getTabletStatus = getTabletStatus;
    this.getTabletStatusModified = getTabletStatusModified;
    this.showTabletFile = showTabletFile;
    this.openTabletFile = openTabletFile;
    this.getTabletFile = getTabletFile;
    this.getTabletLocationFile = getTabletLocationFile;
    this.getAttachmentsOnTablet = getAttachmentsOnTablet;
    this.getModifiedAttachmentsOnTablet = getModifiedAttachmentsOnTablet;
    this.setTabletFolder = setTabletFolder;
    this.checkSelectedSearch = checkSelectedSearch;
    this.updateModifiedAttachmentsSearch = updateModifiedAttachmentsSearch;
    this.restrictTabletSearch = restrictTabletSearch;
    this.sendAttachmentToTablet = sendAttachmentToTablet;
    this.sendSelectedAttachmentsToTablet = sendSelectedAttachmentsToTablet;
    this.updateSelectedTabletAttachments = updateSelectedTabletAttachments;
    this.getAttachmentFromTablet = getAttachmentFromTablet;

    function addTabletTag(att, tag) {
        // get parent item
        var item = Zotero.Items.get(att.getSource());
        // get tag IDs
        var tagRemove = (tag == this.tag) ? this.tagMod : this.tag,
            tagID = Zotero.Tags.getID(tag, 0),
            tagIDRemove = Zotero.Tags.getID(tagRemove, 0);
        // add tag to attachment
        if(!att.hasTag(tagID)) {
            this.blacklistTagAdd.push(att.key);
            att.addTag(tag);
        }
        // remove other tag from attachment
        if(att.hasTag(tagIDRemove)) {
            this.blacklistTagRemove.push(att.key);
            att.removeTag(tagIDRemove);
        }
        // add tag to parent item
        if(!item.hasTag(tagID)) {
            this.blacklistTagAdd.push(item.key);
            item.addTag(tag);
        }
        // remove other tag from item
        if(item.hasTag(tagIDRemove)) {
            if(!Zotero.Items.get(item.getAttachments())
                .some(function(att) {return att.hasTag(tagIDRemove);})) {
                    this.blacklistTagRemove.push(item.key);
                    item.removeTag(tagIDRemove);
                }
        }
    }

    function createSavedSearch (which) {
        if(which=="tablet" || which=="both") {
            var search = new Zotero.Search();
            search.addCondition('tag', 'contains', this.tag);
            search.addCondition('includeParentsAndChildren', 'true');
            search.addCondition('noChildren', 'true');
            search.setName("Tablet Files");
            search.save();
        }

        if(which=="tablet_modified" || which=="both") {
            var search_modified = new Zotero.Search();
            search_modified.addCondition('tag', 'is', this.tagMod);
            search_modified.setName("Tablet Files (modified)");
            search_modified.save();
        }
    }

    function removeTabletTag(att, tag) {
        var tagID = Zotero.Tags.getID(tag,0);
        // remove from attachment
        if(att.hasTag(tagID)) {
            this.blacklistTagRemove.push(att.key);
            att.removeTag(tagID);
        }
        // remove from parent item
        var item = Zotero.Items.get(att.getSource());
        if(item.hasTag(tagID)) {
            if(!Zotero.Items.get(item.getAttachments())
                .some(function(att) {return att.hasTag(tagID);})) {
                    this.blacklistTagRemove.push(item.key);
                    item.removeTag(tagID);
                }
        }
    }

    function getSelectedAttachmentsFromTablet() {
        // get selected attachments, filter for tablet
        var atts = Zotero.Items.get(Zotero.ZotFile.getSelectedAttachments()).filter(this.getTabletStatus, Zotero.ZotFile.Tablet),
            attExtract = [];
        // confirm
        if (Zotero.ZotFile.getPref("confirmation_batch_ask") && atts.length>=Zotero.ZotFile.getPref("confirmation_batch"))
            if(!confirm(Zotero.ZotFile.ZFgetString('tablet.getAttachments', [atts.length])))
                return;
        // show infoWindow
        var progressWin = Zotero.ZotFile.progressWindow(Zotero.ZotFile.ZFgetString('tablet.AttsGot'));
        // iterate through attachments
        for (var i=0; i < atts.length; i++) {
            var att = atts[i],
                attProgress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title'));
            try {
                // get attachment and item object
                var item = Zotero.Items.get(att.getSource());
                // get attachment from tablet
                var attGet = this.getAttachmentFromTablet(item,att,false);
                // update progress window
                attProgress.complete(attGet.att.getFilename(), attGet.att.getImageSrc());
                // extract annotations
                if(attGet.extract)
                    attExtract.push(attGet.id);
            }
            catch(e) {
                attProgress.setError();
                Zotero.ZotFile.messages_fatalError.push('Error: ' + e);
            }
        }
        // show messages and handle errors
        progressWin.startCloseTimer(Zotero.ZotFile.getPref("info_window_duration"));
        Zotero.ZotFile.handleErrors();
        // extract annotations
        if(attExtract.length>0)
            Zotero.ZotFile.pdfAnnotations.getAnnotations(attExtract);
    }

    function clearInfo(att) {
        try {
            var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser"),
                content = att.getNote().replace(/zotero:\/\//g, 'http://zotfile.com/'),
                fragment = Zotero.ZotFile.Utils.parseHTML(content),
                note = win.document.createElementNS(Zotero.ZotFile.xhtml, 'div');
            note.appendChild(fragment);
            var p = note.querySelector("#zotfile-data");
            if (p!==null)
                note.removeChild(p);
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
        var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser"),
            note = win.document.createElementNS(Zotero.ZotFile.xhtml, 'div'),
            content = att.getNote(),
            value;
        try {
            try {
                note.appendChild(Zotero.ZotFile.Utils.parseHTML(content));
            }
            catch(e) {
                var match = content.match(/<p id="zotfile-data".+<\/p>/);
                if (match===null)
                    match = content.match(/lastmod{.+}/);
                if (match===null)
                    return '';
                note.appendChild(Zotero.ZotFile.Utils.parseHTML(match[0]));
            }
            // get zotfile data
            var p = note.querySelector("#zotfile-data");
            if(p===null) {
                // support for old system
                var search = content.search(key);
                value = content.substring(search);
                value = value.substring(value.search("{")+1,value.search("}"));
            }
            else {
                var data = JSON.parse(p.getAttribute('title'));
                value = data[key]===undefined ? '' : data[key];
            }
            // for location tag: replace [BaseFolder] with destination folder
            if(key=="location") value = value.replace("[BaseFolder]", Zotero.ZotFile.getPref('tablet.dest_dir'));
            // for location tag: correct window/mac file system
            if(key=="location" && Zotero.isWin) value = value.replace(/\//g, '\\');
            if(key=="location" && (Zotero.isMac || Zotero.isLinux)) value = value.replace(/\\/g, '/');
            // return
            return(value);
        }
        catch (err) {
            return '';
        }
    }

    function addInfo(att, key, value) {
        // get current content of note
        var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser"),
            content = att.getNote().replace(/zotero:\/\//g, 'http://zotfile.com/'),
            note = win.document.createElementNS(Zotero.ZotFile.xhtml, 'div'),
            data = {};
        try {
            note.appendChild(Zotero.ZotFile.Utils.parseHTML(content));
        }
        catch (e){
            var match = content.match(/<p id="zotfile-data".+<\/p>/);
            if (match!==null)
                note.appendChild(Zotero.ZotFile.Utils.parseHTML(match[0]));
        }
        // for location tag: replace destination folder with [BaseFolder]
        if(key=="location" && Zotero.ZotFile.getPref("tablet.dest_dir_relativePath"))
            value = value.replace(Zotero.ZotFile.getPref('tablet.dest_dir'), '[BaseFolder]');
        // get zotfile element
        var p = note.querySelector("#zotfile-data");
        // doesn't exists...
        if (p===null) {
            data[key] = value;
            p = win.document.createElementNS(Zotero.ZotFile.xhtml, 'p');
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
        if(att) {
            var tagIDs = [Zotero.Tags.getID(this.tag,0), Zotero.Tags.getID(this.tagMod,0)];
            return(att.isAttachment() && att.hasTags(tagIDs));
        }
        return(false);
    }

    function getTabletStatusModified(item) {
        var modified=false;
        if (this.getTabletStatus(item)) {
            var file=this.getTabletFile(item);

            if(file!==false) if (file.exists()) {
                // get last modified time from att note and add att to list if file was modified
                var lastmod=this.getInfo(item,"lastmod");
                if(file.lastModifiedTime + ""!=lastmod) if (lastmod!="") modified=true;
            }
        }
        return modified;
    }

    function showTabletFile() {
        var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser"),
            att = win.ZoteroPane.getSelectedItems()[0],
            tablet = this.getTabletStatus(att);
        if(!tablet)
            return;
        var file = this.getTabletFile(att);
        if(!file.exists())
            return;
        file.reveal();
    }

    function openTabletFile() {
        var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser"),
            att = win.ZoteroPane.getSelectedItems()[0],
            tablet = this.getTabletStatus(att);
        if(!tablet)
            return;
        var file = this.getTabletFile(att);
        if(!file.exists())
            return;
        Zotero.launchFile(file);
    }

    function getTabletFile(att, verbose) {
        var verbose = typeof verbose !== 'undefined' ?  verbose : true;
        try {
            // get file depending on mode
            if(this.getInfo(att, "mode")==1) {
                var loc = this.getInfo(att, "location");
                if(!Zotero.ZotFile.fileExists(loc)) {
                    if (verbose)
                        Zotero.ZotFile.infoWindow('ZotFile Error', 'The file "' + loc + '" does not exist.');
                    return(false);
                }
                return(Zotero.ZotFile.createFile(loc));
            }
            else {
                return(att.getFile());
            }
        }
        catch (err) {
            return(false);
        }
    }

    function getTabletLocationFile(subfolder) {
        if(subfolder==null) subfolder="";
        return(Zotero.ZotFile.createFile(Zotero.ZotFile.getPref('tablet.dest_dir') + subfolder));
    }

    function getAttachmentsOnTablet(subfolder) {
        // search for attachments with tag
        var search = new Zotero.Search();
        search.addCondition('itemType', 'is', 'attachment');
        // search.addCondition('joinMode', 'any');
        search.addCondition('tag', 'contains', this.tag);
        // search.addCondition('tag', 'is', this.tagMod);
        var results = search.search();
        var items = Zotero.Items.get(results);
        var atts = [];

        // iterate through attachment items
        for (var i=0; i < items.length; i++) {
            var item = items[i];

            // check whether non-top level attachment
            if(!item.isTopLevelItem() && item.isAttachment()) {

                // show warning if no information in note
                if(this.getInfo(item,"mode")==="")
                    Zotero.ZotFile.infoWindow(Zotero.ZotFile.ZFgetString('general.warning'),Zotero.ZotFile.ZFgetString('tablet.attachmentNoteMissing') + ' (' + item.key + ')');
                if(this.getInfo(item,"mode")!="") {
                    if(subfolder===undefined) atts.push(item);
                    if(subfolder!==undefined) if(this.getInfo(item,"projectFolder").toLowerCase()==subfolder.toLowerCase()) atts.push(item);
                }
            }
        }
        // return attachments
        return(atts);
    }

    function getModifiedAttachmentsOnTablet (subfolder) {
        var items=this.getAttachmentsOnTablet(subfolder);
        var atts=[];

        // iterate through attachment items
        for (var i=0; i < items.length; i++) {
            // get attachment item, parent and file
            var item = items[i];
            if(this.getTabletStatusModified(item)) atts.push(item);
        }
        // return attachments
        return(atts);
    }

    function setTabletFolder(items,projectFolder) {
        for (var i=0; i < items.length; i++) {
            try {
                var item = items[i];
                if(item.getSource()) {

                    // get parent item
                    var parent=Zotero.Items.get(item.getSource());

                    // first pull if background mode
                    var att_mode=this.getInfo(item,"mode");
                    if(att_mode==1 || att_mode!=Zotero.ZotFile.getPref("tablet.mode")) {
                        var itemID = this.getAttachmentFromTablet(parent, item, true).id;
                        item = Zotero.Items.get(itemID);
                    }
                    // now push
                    if(parent.isRegularItem()) {
                        if(projectFolder!==null) this.sendAttachmentToTablet(parent,item,projectFolder,false);
                        if(projectFolder===null) this.sendAttachmentToTablet(parent,item,this.getInfo(item,"projectFolder"),false);
                        Zotero.ZotFile.messages_report.push("'" + item.getField("title") + "'");
                    }
                }
            }
            catch(e) {
                Zotero.ZotFile.messages_fatalError.push(e);
            }
        }
        // show messages and handle errors
        var mess_loc=(projectFolder!=="" && projectFolder!==null) ? ("'..." + projectFolder + "'.") : Zotero.ZotFile.ZFgetString('tablet.baseFolder');
        Zotero.ZotFile.showReportMessages(Zotero.ZotFile.ZFgetString('tablet.movedAttachments', [mess_loc]));
        Zotero.ZotFile.handleErrors();
    }

    function checkSelectedSearch() {
        // get selected saved search
        var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser");
        var savedSearch = win.ZoteroPane.getSelectedSavedSearch();
        // returns false if no saved search is selected (e.g. collection)

        // check whether saved search 'tablet files (modified)' is selected based on search conditions
        var searchModifiedTabletFiles=false;
        if(savedSearch!==false) {
            var savedSearchConditions=savedSearch.getSearchConditions();
            for (var i=1; i < savedSearchConditions.length; i++) {
                if(savedSearchConditions[i].condition=="tag" && savedSearchConditions[i].value.indexOf(this.tag) !== -1) searchModifiedTabletFiles=true;
            }
        }
        return searchModifiedTabletFiles;
    }

    function updateModifiedAttachmentsSearch(event) {
        // update saved search only if 'tablet files (modified)' saved search is selected
        if(this.checkSelectedSearch()) {
            var atts = this.getModifiedAttachmentsOnTablet();
            // add tag for modified tablet item and remove tablet tag
            for (var j=0; j < atts.length; j++) this.addTabletTag(atts[j], this.tagMod);
        }
    }

    function restrictTabletSearch(which) {
        // get selected saved search
        var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser");
        var savedSearch = win.ZoteroPane.getSelectedSavedSearch();
        // get subfolders
        var subfolders = JSON.parse(Zotero.ZotFile.getPref("tablet.subfolders"));
        // get tablet searches
        var search_filter = function(search) {
            return search.getSearchConditions().some(function(cond) {
                return cond.condition=="tag" &&
                    cond.operator != "isNot" &&
                    cond.value.indexOf(Zotero.ZotFile.tag) !== -1;
                });
        };
        var searches=Zotero.Searches.getAll().filter(search_filter);
        // remove all note related conditions
        searches.forEach(function(search) {
            search.getSearchConditions()
                .filter(function(cond) {return cond.condition == "note" && cond.operator == "contains"; })
                .forEach(function(cond) {search.removeCondition(cond.id); });
            search.save();
        });
        // add note condition for selected subfolder
        var searches=Zotero.Searches.getAll().filter(search_filter);
        // restrict to subfolder
        if(which>0) searches.forEach(function(search) {
            search.addCondition('note', 'contains', subfolders[which-1].path);
            search.save();
            var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser");
            win.ZoteroPane.onCollectionSelected();
        });
        // restrict to unfiled items (basefolder)
        if(which==0) {
            searches.forEach(function(search) {
                search.addCondition('note', 'contains', '&quot;projectFolder&quot;:&quot;&quot;');
                search.save();
                var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser");
                win.ZoteroPane.onCollectionSelected();
            });
        }
    }

    function sendAttachmentToTablet(item, att, projectFolder, verbose) {
        verbose = (typeof verbose == 'undefined') ? true : verbose;
        var newFile,
            file = att.getFile(),
            tagID = Zotero.Tags.getID(this.tag,0),
            tagIDMod = Zotero.Tags.getID(this.tagMod,0),
            tablet_status = this.getTabletStatus(att);
        // settings
        var tablet_mode = Zotero.ZotFile.getPref('tablet.mode'),
            tablet_rename = Zotero.ZotFile.getPref('tablet.rename'),
            tablet_dest = Zotero.ZotFile.getPref('tablet.dest_dir') + projectFolder,
            tablet_subfolder = Zotero.ZotFile.getPref('tablet.subfolder') ? Zotero.ZotFile.getPref('tablet.subfolderFormat') : '';

        if(!Zotero.ZotFile.fileExists(att) || !Zotero.ZotFile.checkFileType(att))
            return false;

        // background mode: Rename and Move Attachment
        if(tablet_mode==1) {
            // change name of file
            if (tablet_rename)  {
                var filename=Zotero.ZotFile.getFilename(item,file.leafName);
                if(filename!=file.leafName) {
                    att.renameAttachmentFile(filename);
                    att.setField('title', filename);
                    att.save();
                    file = att.getFile();
                }
            }
            // create copy of file on tablet and catch errors
            var folder = Zotero.ZotFile.getLocation(tablet_dest, item, tablet_subfolder);
            if (!tablet_status)
                newFile = Zotero.ZotFile.copyFile(file, folder, file.leafName);
            else {
                var tablet_file = this.getTabletFile(att);
                if(tablet_file.exists()) {
                    var path = Zotero.ZotFile.moveFile(tablet_file, folder, file.leafName);
                    newFile = Zotero.ZotFile.createFile(path);
                }
                else {
                    Zotero.ZotFile.infoWindow('ZotFile Warning', 'File on tablet not found. Zotfile is creating a new copy on tablet.');
                    newFile = Zotero.ZotFile.copyFile(file, folder, file.leafName);
                }
            }
        }
        // foreground mode: Rename and Move Attachment
        if(tablet_mode==2) {
            var newAttID = Zotero.ZotFile.renameAttachment(att, false, tablet_rename, tablet_dest, tablet_subfolder, false);
            att = Zotero.Items.get(newAttID);
            newFile = att.getFile();
        }

        // add info to note (date of modification to attachment, location, and mode)
        this.addInfo(att,"lastmod", newFile.lastModifiedTime);
        this.addInfo(att,"mode", tablet_mode);
        this.addInfo(att,"location", newFile.path);
        this.addInfo(att,"projectFolder", projectFolder);
        // add tags
        if (!tablet_status) {
            this.addTabletTag(att, this.tag);
            if (Zotero.ZotFile.getPref("tablet.tagParentPush")) item.addTag(Zotero.ZotFile.getPref("tablet.tagParentPush_tag"));
        }
        // notification
        if(verbose) Zotero.ZotFile.messages_report.push("'" + newFile.leafName + "'");

        return att.id;
    }

    function sendSelectedAttachmentsToTablet(idx_subfolder) {
        // get selected attachments
        var attIDs = Zotero.ZotFile.getSelectedAttachments(true),
            atts = Zotero.Items.get(attIDs),
            attID, addDescription=false,
            // Check which attachments are already on the reader
            attOnReader = atts.map(this.getTabletStatus, Zotero.ZotFile.Tablet),
            attOnReaderCount = attOnReader.reduce(function(pv, cv) { return pv + cv; }, 0),
            repush = !Zotero.ZotFile.getPref("tablet.confirmRepush");
        // get projectFolder
        var projectFolder = '';
        if (idx_subfolder!=-1) {
            if(Zotero.ZotFile.getPref("tablet.projectFolders")==1)
                projectFolder = Zotero.ZotFile.projectPath[idx_subfolder];
            if(Zotero.ZotFile.getPref("tablet.projectFolders")==2) {
                var subfolders = JSON.parse(Zotero.ZotFile.getPref("tablet.subfolders"));
                projectFolder = subfolders[idx_subfolder].path;
                // subfolders[idx_subfolder].label
            }
        }
        // confirm
        if (Zotero.ZotFile.getPref("confirmation_batch_ask") &&
            attIDs.length>=Zotero.ZotFile.getPref("confirmation_batch"))
                if(!confirm(Zotero.ZotFile.ZFgetString('tablet.sendAttachments', [attIDs.length])))
                    return;
        if (!repush && attOnReaderCount>0)
            repush = confirm(Zotero.ZotFile.ZFgetString('tablet.replaceAttachAlready', [attOnReaderCount]));
        if (!repush && attOnReaderCount==attIDs.length) {
            Zotero.ZotFile.handleErrors();
            return;
        }
        // show infoWindow
        var progressWin = Zotero.ZotFile.progressWindow(Zotero.ZotFile.ZFgetString('tablet.AttsMoved'));
        // iterate through attachments
        for (i=0; i < attIDs.length; i++) {
            if(attOnReader[i] && !repush)
                continue;
            var att = atts[i],
                attProgress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title'));
            try {
                if(!Zotero.ZotFile.fileExists(att) || att.isTopLevelItem()) {
                    addDescription = true;
                    attProgress.setError();
                    continue;
                }
                var item = Zotero.Items.get(att.getSource()),
                    att_mode = this.getInfo(att,"mode");
                // First remove from tablet if mode has changed
                if(attOnReader[i] && att_mode!=Zotero.ZotFile.getPref("tablet.mode")) {
                    attID = this.getAttachmentFromTablet(item, att, true).id;
                    att = Zotero.Items.get(attID);
                }
                // send to tablet
                var newAttID = this.sendAttachmentToTablet(item, att, projectFolder, false);
                att = Zotero.Items.get(newAttID);
                // update progress window
                attProgress.complete(att.getFilename(), att.getImageSrc());                
            }
            catch(e) {
                attProgress.setError();
                Zotero.ZotFile.messages_fatalError.push(e);
            }
        }
        // show messages and handle errors
        /*if(projectFolder!=='')
            progressWin.addDescription('Subfolder: ...' + projectFolder);*/
        if(addDescription)
            progressWin.addDescription(Zotero.ZotFile.ZFgetString('general.warning.skippedAtt.msg'));
        progressWin.startCloseTimer(Zotero.ZotFile.getPref("info_window_duration"));
        Zotero.ZotFile.handleErrors();
    }

    function updateSelectedTabletAttachments() {
        // get selected attachments
        var itemIDs = Zotero.ZotFile.getSelectedAttachments();
        var attID, newAttID;
        // iterate through selected attachments
        for (i=0; i < itemIDs.length; i++) {
            try {
                var item = Zotero.Items.get(itemIDs[i]);

                if(this.getTabletStatusModified(item)) {
                    // get parent and file
                    var parent=Zotero.Items.get(item.getSource());
                    var file=this.getTabletFile(item);
                    var filename=file.leafName;

                    var att_mode=this.getInfo(item,"mode");
                    if(att_mode==2) {
                        this.addInfo(item, "lastmod", file.lastModifiedTime);
                        this.addTabletTag(item, this.tag);
                        // new attachment ID
                        newAttID=item.id;
                    }
                    if(att_mode==1) {
                        var projectFolder=this.getInfo(item,"projectFolder");
                        // first get from tablet
                        var itemID=this.getAttachmentFromTablet(parent,item,true).id;
                        item = Zotero.Items.get(itemID);
                        // now send back to reader
                        newAttID=this.sendAttachmentToTablet(parent,item,projectFolder,false);
                    }

                    // extract annotations
                    if (Zotero.ZotFile.getPref("tablet.updateExtractAnnotations")) Zotero.ZotFile.pdfAnnotations.getAnnotations([newAttID]);

                    // show message
                    Zotero.ZotFile.messages_report.push("'" + filename + "'");
                }
            }
            catch(e) {
                Zotero.ZotFile.messages_fatalError.push(e);
            }
        }

        // show messages and handle errors
        Zotero.ZotFile.showWarningMessages(Zotero.ZotFile.ZFgetString('general.warning.skippedAtt'),Zotero.ZotFile.ZFgetString('general.warning.skippedAtt.msg'));
        Zotero.ZotFile.showReportMessages(Zotero.ZotFile.ZFgetString('tablet.AttsSynced'));
        Zotero.ZotFile.handleErrors();
    }

    function getAttachmentFromTablet (item, att, fakeRemove) {
        var attID=att.id,
            option=1,
            itemPulled=false, attsDeleted=false,
            att_mode=this.getInfo(att,"mode"),
            tagID = Zotero.Tags.getID(this.tag,0),
            tagIDMod = Zotero.Tags.getID(this.tagMod,0);

        // get files
        var file_zotero = att.getFile();
        var file_reader = this.getTabletFile(att);
        var folder = file_reader.parent;

        // get modification times for files
        var time_reader = Zotero.ZotFile.fileExists(file_reader) ? parseInt(file_reader.lastModifiedTime+"",10) : 0;
        var time_saved  = parseInt(this.getInfo(att,"lastmod"),10);
        var time_zotero = (file_zotero) ? parseInt(file_zotero.lastModifiedTime+"",10) : 0;

        // background mode
        if(att_mode==1) {
            if (time_reader!=0 || time_zotero!=0) {
                // set options
                if (time_reader>time_saved  && time_zotero<=time_saved) option=0;
                if (time_reader<=time_saved && time_zotero<=time_saved) option=2;
                if (time_reader<=time_saved && time_zotero>time_saved) option=2;
                if (time_reader>time_saved  && time_zotero>time_saved) option=1;

                // if attachment gets replaced
                if (!Zotero.ZotFile.getPref("tablet.storeCopyOfFile")) {
                    // prompt if both file have been modified
                    if (option==1) {
                        option=Zotero.ZotFile.promptUser(Zotero.ZotFile.ZFgetString('tablet.fileConflict', [file_zotero.leafName]),
                            Zotero.ZotFile.ZFgetString('tablet.fileConflict.replaceZ'),
                            Zotero.ZotFile.ZFgetString('general.cancel'),
                            Zotero.ZotFile.ZFgetString('tablet.fileConflict.removeT'));
                        //attsDeleted is true to display a special message when the attachments have been deleted from tablet without being sent back to Zotero
                        if (option==2) attsDeleted=true;
                    }

                    // Replace Zotero file
                    if(option==0) {
                        file_reader.moveTo(file_zotero.parent,file_zotero.leafName);
                        itemPulled=true;
                    }
                }
                // if saving a copy of the file as a new attachment with suffix
                if (Zotero.ZotFile.getPref("tablet.storeCopyOfFile"))  {
                    // only if reader file was modified
                    if(option!=2) {
                        var filename=Zotero.ZotFile.Utils.addSuffix(file_zotero.leafName,Zotero.ZotFile.getPref("tablet.storeCopyOfFile_suffix"));

                        //add linked attachment
                        if (!item.libraryID && !Zotero.ZotFile.getPref("import")) {
                            file_reader.moveTo(file_zotero.parent,filename);
                            attID=Zotero.Attachments.linkFromFile(file_reader, item.itemID,item.libraryID);
                            itemPulled=true;
                        }
                        //imports attachment
                        if (item.libraryID || Zotero.ZotFile.getPref("import")) {
                            // import file on reader
                            attID=Zotero.Attachments.importFromFile(file_reader, item.itemID,item.libraryID);
                            var attAnnotated = Zotero.Items.get(attID);
                            // rename file associated with attachment
                            attAnnotated.renameAttachmentFile(filename);
                            // change title of attachment item
                            attAnnotated.setField('title', filename);
                            attAnnotated.save();
                            // remove file on reader
                            this.removeFile(file_reader);
                            itemPulled=true;
                        }
                    }
                }
                // Pull without replacement (i.e. remove file on tablet)
                if(option==2) {
                    Zotero.ZotFile.removeFile(file_reader);
                    itemPulled=true;
                }
            }
        }
        // foreground mode
        if(att_mode==2) {
            // add parent key to array for excluded items from auto rename
            Zotero.ZotFile.excludeAutorenameKeys.push(item.key);
            // get note content
            var note = att.getNote();
            // rename and move attachment
            var subfolder = Zotero.ZotFile.getPref('subfolder') ? Zotero.ZotFile.getPref('subfolderFormat') : '';
            attID = Zotero.ZotFile.renameAttachment(att, Zotero.ZotFile.getPref('import'), Zotero.ZotFile.getPref('tablet.rename'),
                                                    Zotero.ZotFile.getPref('dest_dir'), subfolder, false);
            // get new attachment object
            att = Zotero.Items.get(attID);
            // finish up
            itemPulled = true;
            option = time_zotero>time_saved ? 0 : 2;
            // add note content
            att.setNote(note);
            att.save();
        }
        // remove subfolder if empty
        if(!folder.equals(Zotero.ZotFile.createFile(Zotero.ZotFile.getPref('tablet.dest_dir'))))
            Zotero.ZotFile.removeFile(folder);

        // post-processing if attachment has been removed & it's not a fake-pull
        var extract = false;
        if (itemPulled && !fakeRemove) {
            // remove tag from attachment and parent item
            this.removeTabletTag(att, this.tag);
            // clear attachment note
            this.clearInfo(att);
            // extract annotations from attachment and add note
            extract = Zotero.ZotFile.getPref("pdfExtraction.Pull") && option!=2;
            // remove tag from parent item
            var tagParent=Zotero.Tags.getID(Zotero.ZotFile.getPref("tablet.tagParentPush_tag"),0);
            if(item.hasTag(tagParent)) item.removeTag(tagParent);
            // add tag to parent item
            if (Zotero.ZotFile.getPref("tablet.tagParentPull")) item.addTag(Zotero.ZotFile.getPref("tablet.tagParentPull_tag"));
            // notification (display a different message when the attachments have been deleted from tablet without being sent back to Zotero)
            if (attsDeleted === true) {
                Zotero.ZotFile.messages_report.push("'" + att.getFile().leafName + "' " + Zotero.ZotFile.ZFgetString('tablet.attsDel'));
            }
            else {
                Zotero.ZotFile.messages_report.push("'" + att.getFile().leafName + "'");
            }
        }
        // remove modified tag from attachment
        if (itemPulled) this.removeTabletTag(att, this.tagMod);

        // return new id
        return({'id': attID, 'att': Zotero.Items.get(attID), 'extract': extract});
    }    
}
