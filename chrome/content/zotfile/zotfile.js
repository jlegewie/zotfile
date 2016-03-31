/**
ZotFile: Advanced PDF management for Zotero
Joscha Legewie

Zotfile is a Zotero plugin to manage your attachments:
automatically rename, move, and attach PDFs (or other files)
to Zotero items, sync PDFs from your Zotero library to your (mobile)
PDF reader (e.g. an iPad, Android tablet, etc.) and extract
annotations from PDF files.

Webpage: http://www.zotfile.com
Github: https://github.com/jlegewie/zotfile

License
The source code is released under GNU General Public License, version 3.0
Contributions preferably through pull requests are welcome!

Zotero JavaScript API
http://www.zotero.org/support/dev/client_coding/javascript_api
*/

Zotero.ZotFile = {

    prefs: null,
    wm: null,
    fileMap: {}, //maps collections to their file objects
    folderSep:null,
    projectNr: new Array("01","02","03","04","05","06","07","08","09","10","11","12","13","14","15"),
    projectPath: new Array("","","","","","","","","","","","","","",""),
    projectMax:15,
    zotfileURL:"http://www.zotfile.com",
    changelogURL:"http://zotfile.com/index.html#changelog",
    lastModifiedFile:null,
    temp:"",
    messages_warning:[],
    messages_report:[],
    messages_error:[],
    messages_fatalError:[],
    excludeAutorenameKeys: [],
    // tablet tags
    renameNotifierID:null,
    outlineNotifierID:null,
    xhtml:'http://www.w3.org/1999/xhtml',

    versionChanges: function (currentVersion) {
        // open webpage
        var open_page = ["4.1.1", "4.1", "4.0", "3.3", "3.2", "3.1", "2.0", "2.3"];
        if(this.prefs.getCharPref("version")==="" || open_page.indexOf(currentVersion) != -1) {
            if(!Zotero.isStandalone) this.futureRun(function(){gBrowser.selectedTab = gBrowser.addTab(Zotero.ZotFile.changelogURL); });
            if( Zotero.isStandalone) this.futureRun(function(){ZoteroPane_Local.loadURI(Zotero.ZotFile.changelogURL); });
        }

        if(currentVersion=="4.2" && this.prefs.getBoolPref("pdfExtraction.openPdfMac_skim")) {
            this.prefs.setCharPref("pdfExtraction.openPdfMac", "Skim");
        }

        // set current version
        this.prefs.setCharPref("version",currentVersion);

    },

    init: function () {

        // only do this stuff for the first run
        if(this.prefs===null) {
            //get preference objects
            this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefService)
                        .getBranch("extensions.zotfile.");

            this.ffPrefs = Components.classes["@mozilla.org/preferences-service;1"].
                        getService(Components.interfaces.nsIPrefService).getBranch("browser.download.");
            // save some preferences
            this.Tablet.tag = this.prefs.getCharPref("tablet.tag");
            this.Tablet.tagMod = this.prefs.getCharPref("tablet.tagModified");

            this.wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);

            // set source dir to custom folder if zotero standalone
            if(Zotero.isStandalone && this.prefs.getBoolPref('source_dir_ff')) this.prefs.setBoolPref('source_dir_ff',false);

            // version handeling
            var oldVersion=this.prefs.getCharPref("version");
            if(!Zotero.isFx36) Components.utils.import("resource://gre/modules/AddonManager.jsm");

            // update current version
            if(!Zotero.isFx36) AddonManager.getAddonByID("zotfile@columbia.edu",function(aAddon) {
                var currentVersion=aAddon.version;
                // if different version then previously
                if(currentVersion!=oldVersion) Zotero.ZotFile.versionChanges(currentVersion);
            });

            if(Zotero.isFx36) {
                var em = Components.classes["@mozilla.org/extensions/manager;1"].getService(Components.interfaces.nsIExtensionManager);
                var addon = em.getItemForID("zotfile@columbia.edu");
                if(addon.version!=oldVersion) this.versionChanges(addon.version);
            }

            // run in future to not burden start-up
            this.futureRun(function(){
                // determine folder seperator depending on OS
                Zotero.ZotFile.folderSep="/";
                if (Zotero.isWin) Zotero.ZotFile.folderSep="\\";

                // check whether extraction of annotations is supported
                if (Zotero.ZotFile.pdfAnnotations.popplerSupportedPlatforms.join().indexOf(Zotero.platform)!=-1) Zotero.ZotFile.pdfAnnotations.popplerExtractorSupported=true;

                // set path and check whether installed
                if (Zotero.ZotFile.pdfAnnotations.popplerExtractorSupported) {
                    // set Extractor Path
                    Zotero.ZotFile.pdfAnnotations.popplerExtractorSetPath();

                    // check whether tool is installed
                    Zotero.ZotFile.pdfAnnotations.popplerExtractorTool=Zotero.ZotFile.pdfAnnotations.popplerExtractorCheckInstalled();

                    // set to pdf.js if poppler is not installed
                    if(!Zotero.ZotFile.pdfAnnotations.popplerExtractorTool) Zotero.ZotFile.prefs.setBoolPref("pdfExtraction.UsePDFJS",true);
                }

                // set to pdf.js if poppler is not supported
                if(!Zotero.ZotFile.pdfAnnotations.popplerExtractorSupported) Zotero.ZotFile.prefs.setBoolPref("pdfExtraction.UsePDFJS",true);
                
            });
        }

        // Register callbacks in Zotero as item observers
        if(Zotero.ZotFile.renameNotifierID===null)
            Zotero.ZotFile.renameNotifierID = Zotero.Notifier.registerObserver(this.autoRename, ['item']);
        if(Zotero.ZotFile.outlineNotifierID===null)
            Zotero.ZotFile.outlineNotifierID = Zotero.Notifier.registerObserver(this.autoOutline, ['item']);
        // var renameNotifierID = Zotero.Notifier.registerObserver(this.autoTablet, ['item-tag']);
        // Unregister callback when the window closes (important to avoid a memory leak)
        window.addEventListener('unload', function(e) {
                Zotero.Notifier.unregisterObserver(Zotero.ZotFile.renameNotifierID);
                Zotero.Notifier.unregisterObserver(Zotero.ZotFile.outlineNotifierID);
                Zotero.ZotFile.renameNotifierID = null;
                Zotero.ZotFile.outlineNotifierID = null;
        }, false);        

        // Load zotero.js first
        Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
            .getService(Components.interfaces.mozIJSSubScriptLoader)
            .loadSubScript("chrome://zotfile/content/ProgressWindow.js", Zotero.ZotFile);

        // add event listener for selecting items in zotero tree
        if(Zotero.ZotFile.prefs.getBoolPref('tablet')) {
            var pane = this.wm.getMostRecentWindow("navigator:browser").ZoteroPane,
                tree = pane.document.getElementById('zotero-items-tree');
            tree.removeEventListener('select', Zotero.ZotFile.attboxUpdateTabletStatus);
            tree.addEventListener('select', Zotero.ZotFile.attboxUpdateTabletStatus);
        }
    },

	//Localization (borrowed from Zotero sourcecode)
	ZFgetString: function (name, params){
        var l10n = '';
		this.stringsBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
			.getService(Components.interfaces.nsIStringBundleService)
			.createBundle("chrome://zotfile/locale/zotfile.properties");
		try {
			if (params !== undefined){
				if (typeof params != 'object'){
					params = [params];
				}
				l10n = this.stringsBundle.formatStringFromName(name, params, params.length);
			}
			else {
				l10n = this.stringsBundle.GetStringFromName(name);
			}
		}
		catch (e){
			throw ('Localized string not available for ' + name);
		}
		return l10n;
	},

    watchFolder: function() {
        var zz = Zotero.ZotFile, item;
        if(!zz.prefs.getBoolPref('watch_folder')) return;
        // get source dir
        // JSON.parse('[1, 5, "false"]') JSON.parse(zz.getCharPref('watch_folder_list'))
        var source_dir=zz.getSourceDir(true);
        if (source_dir==-1) return;
        // get last modified file in source folder
        var file = zz.getLastFileInFolder(source_dir)[0];
        if(!file) return;
        if(file==-1 || file==-2) return;
        if (zz.lastModifiedFile===null) zz.lastModifiedFile=file.lastModifiedTime;
        // compare to last file
        if (file.lastModifiedTime==zz.lastModifiedFile)
            return;
        // callback
        var on_confirm = function() {
            // recognize PDF from metadata
            var recognizePDF = function(file) {
                var installed = ZoteroPane_Local.checkPDFConverter();
                if (!installed) return;
                // create file
                if(typeof(file)=='string') file = Zotero.ZotFile.createFile(file);
                // change to library of saved search is selected
                var lib = win.ZoteroPane.getSelectedLibraryID();
                var search = win.ZoteroPane.getSelectedSavedSearch();
                if(search) win.ZoteroPane.collectionsView.selectLibrary(lib);
                // attach file
                var attID = Zotero.Attachments.importFromFile(file, false, lib);
                var att = Zotero.Items.get(attID);
                // add attachment to collection if collection selected
                var collection = win.ZoteroPane.getSelectedCollection();
                if(collection) collection.addItem(attID);
                // select item
                win.ZoteroPane.itemsView.selectItems([attID]);
                // recognize PDF using metadata
                var itemRecognizer = new Zotero_RecognizePDF.ItemRecognizer();
                itemRecognizer.recognizeItems([att]);
                // rename attachment
                /*// itemRecognizer._progressIndicator.value = 100
                var test = function() {
                    Zotero.ZotFile.infoWindow('_progressIndicator','value: ' + itemRecognizer._progressIndicator.value);
                    // win.ZoteroPane.itemsView.selectItems([att.getID()]);
                    att.renameAttachmentFile('test.pdf');
                    // itemRecognizer._items
                }
                setTimeout(test,2000);*/
            };
            // get selected items
            var win = zz.wm.getMostRecentWindow("navigator:browser");
            var items = win.ZoteroPane.getSelectedItems();
            // continue if nothing is selected
            if(items.length===0) {
                recognizePDF(file);
                return;
            }
            // get parent if attachment is selected
            if (items[0].isAttachment()) {
                var id_parent = items[0].getSource();
                if(!id_parent) recognizePDF(file);
                item = Zotero.Items.get(id_parent);
            }
            else {
                item = items[0];
            }
            // rename and attach if regular item or child attachment
            if(item.isRegularItem()) {
                // attach file
                var att = zz.attachFile(item, file);
                // show messages
                zz.infoWindow(zz.ZFgetString('general.newAttachmentAdded'), {lines: [att.getField('title')], icons: [att.getImageSrc()]});
                zz.handleErrors();
                // set lastModifiedFile variable to previous file
                file=zz.getLastFileInFolder(source_dir)[0];
                zz.lastModifiedFile=file.lastModifiedTime;
            }
            else {
                recognizePDF(file);
            }
            // else zz.infoWindow(zz.ZFgetString('general.error'),zz.ZFgetString('watchFolder.noRegularItem'));
        };
        // ask user whether s/he wants to attach and rename the new file
        var icon = 'chrome://zotero/skin/' + (file.leafName.indexOf('.pdf')>0 ? 'treeitem-attachment-pdf.png' : 'treeitem-attachment-file.png'),
            message = {
                lines:[file.leafName],
                icons: [icon],
                txt:zz.ZFgetString('watchFolder.clickRename')
            };
        zz.infoWindow(zz.ZFgetString('watchFolder.newFile'), message, zz.prefs.getIntPref("info_window_duration_clickable"),on_confirm);
        zz.lastModifiedFile = file.lastModifiedTime;
    },

    // Callback implementing the notify() method to pass to the Notifier
    autoRename: {
        parent: this,
        notify: function(event, type, ids, extraData) {
            var zz = Zotero.ZotFile;
            // 'add item' event
            if (type != 'item' || event != 'add')
                return;
            // get preference object
            var prefs = Zotero.ZotFile.prefs;
            var auto_rename = prefs.getIntPref("automatic_renaming");
            if (auto_rename==1) return;
            // Retrieve the added/modified items as Item objects
            var items = Zotero.Items.get(ids);
            setTimeout(function() {
                var progressWin = new Zotero.ZotFile.ProgressWindow(),
                    progressWin_showing = false;
                progressWin.changeHeadline(zz.ZFgetString('general.newAttachmentRenamed'));
                // function to rename attachments
                var on_confirm = function() {
                    var file_renamed = false;
                    try {
                        // Rename the file (linked attachment)
                        if(!prefs.getBoolPref("import")) {
                            // rename and move attachment
                            var id_item = zz.renameAttachment(item);
                            // set flag for notification
                            file_renamed = true;
                            // get new attachment file
                            item = Zotero.Items.get(id_item);
                        }
                        // Rename the file (imported attachment)
                        else {
                            // get filename
                            var filename = zz.getFilename(parent, file.leafName);
                            // check whether attachment already has the correct name
                            if (filename!=file.leafName) {
                                // rename file associated with attachment
                                item.renameAttachmentFile(filename);
                                // change title of attachment item
                                item.setField('title', filename);
                                item.save();
                                file_renamed = true;
                            }
                        }
                        // user notification
                        if (file_renamed) {
                            // get object of attached file
                            file = item.getFile();
                            // show zotfile report
                            if(!progressWin_showing)
                                progressWin_showing = progressWin.show();
                            attProgress = new progressWin.ItemProgress(item.getImageSrc(), item.getField('title'));
                            attProgress.setProgress(100);
                            // remove id from in progress array
                            // var idx = zz.keys.indexOf(id);
                            // if(idx!=-1) zz.keys.splice(idx,1);
                        }
                    }
                    catch(e) {
                        zz.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
                    }
                    // handle errors
                    zz.handleErrors();
                };
                // iterate through added attachments
                for each(var item in items){
                    try {
                        // Is the item an (imported) attachment?
                        if(!item.isAttachment()) continue;
                        if(!item.isImportedAttachment()) continue;
                        // get id and key
                        var id = item.id,
                            key = item.key,
                            file = item.getFile(),
                            id_parent = item.getSource();
                        // Continue if ...
                        if(!id_parent || !file || !zz.checkFileType(file))                            
                            continue;
                        // get parent item
                        var parent = Zotero.Items.get(id_parent);
                        // check whether key is excluded
                        if(zz.excludeAutorenameKeys.indexOf(key)!=-1 || zz.excludeAutorenameKeys.indexOf(parent.key)!=-1) {
                            zz.removeFromArray(zz.excludeAutorenameKeys,parent.key);
                            continue;
                        }
                        // skip if file already has correct filename
                        var filename = item.getFilename().replace(/\.[^/.]+$/, "");
                        if(filename.indexOf(zz.getFilename(parent,filename))===0) continue;
                        // exclude current key for next event
                        zz.excludeAutorenameKeys.push(key);
                        // ask user
                        var message = {
                            lines: [file.leafName],
                            txt: zz.ZFgetString('renaming.clickMoveRename'),
                            icons: [item.getImageSrc()]
                        };
                        if(auto_rename==2) {
                            zz.infoWindow(zz.ZFgetString('general.newAttachment'), message,
                                prefs.getIntPref("info_window_duration_clickable"), on_confirm);
                        }
                        // ask user if item has other attachments
                        if(auto_rename==3) {
                            var checkAtt = function (att) {
                                return (att.isImportedAttachment() ||
                                    att.attachmentLinkMode==Zotero.Attachments.LINK_MODE_LINKED_FILE) &&
                                    zz.checkFileType(att);
                            };
                            var atts = Zotero.Items.get(parent.getAttachments()).filter(checkAtt);

                            if (atts.length>1)
                                zz.infoWindow(zz.ZFgetString('general.newAttachment'), message,
                                    prefs.getIntPref("info_window_duration_clickable"), on_confirm);
                            else
                                on_confirm();
                        }
                        // just rename
                        if(auto_rename==4) on_confirm();
                    } catch (e) {
                        on_click = function() {
                            Zotero.ZotFile.Utils.copy2Clipboard(e);
                        };
                        var message = zz.ZFgetString('renaming.renamingFailed') + ' ' + zz.ZFgetString('error.clickToCopy');
                        zz.infoWindow(zz.ZFgetString('general.error'), message, 8000, on_click);
                    }
                }
                progressWin.startCloseTimer();
            },100);
        }
    },

    autoOutline: {
        parent: this,
        notify: function(event, type, ids, extraData) {
            // check event and preferences
            if (type != 'item' || event != 'add')
                return;
            var zz = Zotero.ZotFile;
            if(!zz.prefs.getBoolPref('pdfOutline.getToc'))
                return;
            // get pdf outline
            setTimeout(function() {
                zz.pdfOutline.getOutline(ids);
            },100);
        }
    },

    // Automatically send and remove attachment from tablet when the tablet tag is assigned or removed by the user
    // Callback implementing the notify() method to pass to the Notifier
    autoTablet: {
        notify: function(event, type, ids, extraData) {
            var zz = Zotero.ZotFile;
            // var prefs = Zotero.ZotFile.prefs;
            // exit if tablet features are not enabled
            if(!zz.prefs.getBoolPref("tablet")) return;
            // get item and tag id
            var changes = ids.map(function(id) {
                var id = id.split('-');
                return {
                    'itemID': id[0],
                    'tagID': id[1],
                    'item': Zotero.Items.get(id[0]),
                    'tag': Zotero.Tags.getName(id[1])
                };
            });
            // exit if not tablet tags
            if(changes.every(
                function(change) {return change.tag!=zz.tag && change.tag!=zz.tagMod; }))
                return;
            // filter list of changes
            changes = changes.filter(function(obj) {
                var not_excluded = true;
                if(event == 'add') {
                    not_excluded = zz.Tablet.blacklistTagAdd.indexOf(obj.item.key)==-1;
                    if (!not_excluded) zz.removeFromArray(zz.Tablet.blacklistTagAdd, obj.item.key);
                }
                if(event == 'remove') {
                    not_excluded = zz.Tablet.blacklistTagRemove.indexOf(obj.item.key)==-1;
                    if (!not_excluded) zz.removeFromArray(zz.Tablet.blacklistTagRemove, obj.item.key);
                }
                return not_excluded &&
                    obj.tag.indexOf(zz.tag)!=-1 &&
                    (obj.item.isRegularItem() || obj.item.isAttachment());
            }, zz);
            // exit if no changes left...
            if(changes.length==0) return;

            // iterate through changes
            var item, onTablet, action;
            for (var i = 0; i < changes.length; i++) {
                // get item
                item = changes[i].item;
                // check whether item is on tablet
                if(item.isRegularItem())
                    onTablet =  Zotero.Items.get(item.getAttachments())
                                    .some(zz.Tablet.getTabletStatus, zz);
                if(item.isAttachment()) onTablet = zz.Tablet.getInfo(item, 'lastmod')!='';
                // continue to next change if...
                if (event != 'add' && event != 'remove') continue;
                if (!onTablet && event == 'remove') continue;
                // if(changes[i].tag==zz.tag) {}
                action = (!onTablet) ? 'send' : 'remove';
                // send attachments to tablet
                if(action=='send') {
                    try {
                        if(item.isRegularItem())
                            Zotero.Items.get(item.getAttachments())
                                .forEach(function(att) {
                                    zz.Tablet.sendAttachmentToTablet(item, att, '');
                                }, zz);
                        if(item.isAttachment())
                            zz.Tablet.sendAttachmentToTablet(zz.getParent(item), item, '');
                    }
                    catch(e) {
                        zz.messages_fatalError.push("Error: " + JSON.stringify(e));
                    }
                    // show messages and handle errors
                    zz.showWarningMessages(zz.ZFgetString('general.warning.skippedAtt'),zz.ZFgetString('general.warning.skippedAtt.msg'));
                    zz.showReportMessages(zz.ZFgetString('tablet.AttsMoved'));
                    zz.handleErrors();
                }
                // remove attachments from tablet
                if(action=='remove') {
                    try {
                        if(item.isRegularItem())
                            Zotero.Items.get(item.getAttachments())
                                .filter(zz.Tablet.getTabletStatus, zz)
                                .forEach(function(att) {
                                    zz.Tablet.getAttachmentFromTablet(item, att, false);
                                }, zz);
                        if(item.isAttachment())
                            zz.Tablet.getAttachmentFromTablet(zz.getParent(item), item, '');
                    }
                    catch(e) {
                        zz.messages_fatalError.push("Error: " + JSON.stringify(e));
                    }
                    // show messages and handle errors
                    zz.showWarningMessages(zz.ZFgetString('general.warning.skippedAtt'),zz.ZFgetString('general.warning.skippedAtt.msg'));
                    zz.showReportMessages(zz.ZFgetString('tablet.AttsGot'));
                    zz.handleErrors();
                }
                // TABLET TAG (MODIFIED)
                // if(changes[i].tag==zz.tagMod) {}
            }
        }
    },

    /**
     * Check whether attachment is valid for zotfile (not top-level item, file exists and not a web attachment)
     * @param  {ztime}  att     Zotero attachment item or ID of item
     * @param  {bool}   warning Show warning message (default is true)
     * @return {bool}
     */
    validAttachment: function (att, warning) {
        // set default setting
        warning = typeof warning !== 'undefined' ? warning : true;
        att = typeof att == 'number' ? Zotero.Items.get(att) : att;
        // check whether attachment is valid (not top-level item, file exists and not a web attachment)
        if(!att.isAttachment()) return false;
        if (att.isTopLevelItem() || !att.fileExists() || Zotero.File.getExtension(att.getFile()) == "html") {
            if(warning) this.messages_warning.push("'" + att.getField('title') + "'");
            return false;
        }
        return true;
    },

    /**
     * Get preference value
     * @param  {string} name     Name of preference in 'extensions.zotfile' branch
     * @return {string|int|bool} Value of preference.     
     */
    getPref: function(name) {
        var type = this.prefs.getPrefType(name);
        if (type == 0)
            throw("Zotero.ZotFile.getPref(): Invalid preference value for '" + name + "'")
        if (type == 32)
            return this.prefs.getComplexValue(name, Components.interfaces.nsISupportsString).data;
        if (type == 64)
            return this.prefs.getIntPref(name);
        if (type == 128)
            return this.prefs.getBoolPref(name);
    },

    getParent: function(att) {
        var id_parent = att.getSource();
        return Zotero.Items.get(id_parent);
    },

    /**
     * Get array of select attachment IDs including all attachments for selected regular items
     * @param  {bool} all Get all attachments or only valid attachments (default is false)
     * @return {array}    Array with attachment ids
     */
    getSelectedAttachments: function (all) {
        all = typeof all !== 'undefined' ? all : false;
        // get selected items
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var attachments = win.ZoteroPane.getSelectedItems()
            .map(item => item.isRegularItem() ? item.getAttachments() : item)
            .reduce((a, b) => a.concat(b), [])
            .map(item => typeof item == 'number' ? Zotero.Items.get(item) : item)
            .filter(item => item.isAttachment())
            .filter(att => att.attachmentLinkMode != Zotero.Attachments.LINK_MODE_LINKED_URL)
            .filter(att => (!all && this.validAttachment(att)) || (all && this.checkFileType(att)))
            .map(att => att.getID());
        // remove duplicate elements
        if(attachments.length > 0) attachments = this.Utils.removeDuplicates(attachments);
        // return array with attachment ids
        return attachments;
    },

    futureRun: function(aFunc) {
        var tm = Components.classes["@mozilla.org/thread-manager;1"].getService(Components.interfaces.nsIThreadManager);
        tm.mainThread.dispatch({run: function(){aFunc();}},Components.interfaces.nsIThread.DISPATCH_NORMAL);
    },

    createSavedSearch: function(which) {
        if(which=="tablet" || which=="both") {
            var search = new Zotero.Search();
            search.addCondition('tag', 'contains', this.Tablet.tag);
            // search.addCondition('tag', 'is', this.Tablet.tagMod);
            // search.addCondition('itemType', 'is', 'attachment');
            search.addCondition('includeParentsAndChildren', 'true');
            // search.addCondition('joinMode', 'any');
            search.addCondition('noChildren', 'true');
            search.setName("Tablet Files");
            search.save();
        }

        if(which=="tablet_modified" || which=="both") {
            var search_modified = new Zotero.Search();
            search_modified.addCondition('tag', 'is', this.Tablet.tagMod);
            search_modified.setName("Tablet Files (modified)");
            search_modified.save();
        }
    },

    openPreferenceWindow: function (paneID, action) {
        var io = {
            pane: paneID,
            action: action
        };
        window.openDialog('chrome://zotfile/content/options.xul',
            'zotfile-options',
            'chrome,titlebar,toolbar,centerscreen'+ Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal',io
        );
    },

    openSubfolderWindow: function (paneID, action) {
        var io = {
            pane: paneID,
            action: action
        };
        var prefWindow=window.openDialog('chrome://zotfile/content/options-projects.xul',
            'zotfile-tablet-subfolders',
            'chrome,titlebar,toolbar,centerscreen'+ Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal',io
        );
    },

    chooseDirectory: function () {
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
            .getService(Components.interfaces.nsIWindowMediator);
        var win = wm.getMostRecentWindow('navigator:browser');

        var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(Components.interfaces.nsIPromptService);

        var nsIFilePicker = Components.interfaces.nsIFilePicker;
        while (true) {
            var fp = Components.classes["@mozilla.org/filepicker;1"]
                        .createInstance(nsIFilePicker);
            fp.init(win, Zotero.getString('dataDir.selectDir'), nsIFilePicker.modeGetFolder);
            fp.appendFilters(nsIFilePicker.filterAll);
            if (fp.show() == nsIFilePicker.returnOK) {
                var file = fp.file;

                // Set preference
                //Zotero.ZotFile.prefs.setCharPref(pref,file.path);
                return(file.path);
            }
            else {
                return("");
            }
        }
    },

    // show report messages
    showReportMessages: function(title){
        if(this.messages_report.length>0) this.infoWindow(title,{lines:this.messages_report});
        this.messages_report = [];
    },

    // show warnings messages
    showWarningMessages: function(title,txt){
        // default argument
        txt = typeof txt !== 'undefined' ? txt : "";
        // show warning messages
        if(this.messages_warning.length>0) this.infoWindow(title,{lines:this.messages_warning,txt:txt});
        this.messages_warning = [];
    },

    handleErrors: function() {
        var errors = {lines:this.messages_error},
            on_click = null,
            duration = this.prefs.getIntPref("info_window_duration");
        // fatal errors
        if(this.messages_fatalError.length>0) {
            duration = this.prefs.getIntPref("info_window_duration_clickable");
            errors.lines.push(this.ZFgetString('error.unknown'));
            errors.txt = this.ZFgetString('error.clickToCopy');
            // prepare error message for clipboard
            var format_error = function(e) {
                var name = e.name ? e.name : "Error",
                    message = e.message ? e.message : "undefined message",
                    fileName = e.fileName ? e.fileName : (e.filename ? e.filename : "undefined file"),
                    lineNumber = e.lineNumber ? e.lineNumber : "undefined line number";
                return name + ": " + message + " \n(" + fileName + ", " + lineNumber + ")";
            };
            var errors_str = this.messages_fatalError.map(function(e) {
                if (typeof e == 'object') Zotero.logError(e);
                return typeof e == 'object' ? format_error(e) : e;
            });
            errors_str = this.Utils.removeDuplicates(errors_str).join("\n\n");
            on_click = function() {
                Zotero.ZotFile.Utils.copy2Clipboard(errors_str);
            };
        }
        // error messages
        if(errors.lines.length>0) {
            // remove duplicates
            errors.lines = this.Utils.removeDuplicates(errors.lines);
            // show errors
            this.infoWindow(this.ZFgetString('general.error'),errors,duration,on_click);
        }
        // empty error arrays
        this.messages_error = [];
        this.messages_fatalError = [];
    },

    infoWindow: function(main, message, time, callback){
        // default arguments
        main = typeof main !== 'undefined' ? main : 'title';
        message = typeof message !== 'undefined' ? message : 'message';
        callback = typeof callback !== 'undefined' ? callback : null;
        time = typeof time !== 'undefined' ? time : this.prefs.getIntPref("info_window_duration");
        // show window
        var pw = new (this.ProgressWindow);
        pw.changeHeadline(main);
        if (main=="error") pw.changeHeadline(Zotero.getString("general.errorHasOccurred"));

        if (typeof(message) == "object" && message.lines) {
            for (i =0;i<message.lines.length;i++) {
                // pw.addLines(message.lines[i]);
                var icon = message.icons ? message.icons[i] : null;
                var line = new  pw.ItemProgress(icon, message.lines[i]);
                line.setProgress(100);
            }
            if (message.txt!==undefined) pw.addDescription(message.txt);
        }
        else if(typeof(message) == "object") {
            pw.addDescription(JSON.stringify(message));
        }
        else
            pw.addDescription(message);

        pw.show();
        pw.startCloseTimer(time);
        // add callback
        if (callback!==null)
            pw.addCallback(callback);
        // return window
        return(pw);
    },

    progressWindow: function(title) {
        var progressWin = new Zotero.ZotFile.ProgressWindow();
        progressWin.changeHeadline(title);
        progressWin.show();
        return progressWin;
    },

    promptUser: function(message,but_0,but_1_cancel,but_2) {
        var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                    .getService(Components.interfaces.nsIPromptService);

        var check = {value: false};                  // default the checkbox to false

        var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING +
                prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_IS_STRING  +
                prompts.BUTTON_POS_2 * prompts.BUTTON_TITLE_IS_STRING;

        var button = prompts.confirmEx(null, "ZotFile Dialog", message,
                    flags,  but_0,but_1_cancel,but_2, null, check);

        return(button);

    },

    showCollectionMenu: function() {
        // ZoteroPane object
        var doc = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser").ZoteroPane.document;
        // check regular item or attachment selected & custom subfolders
        var showCollectionMenu = Zotero.ZotFile.prefs.getBoolPref("tablet") && Zotero.ZotFile.Tablet.checkSelectedSearch() && Zotero.ZotFile.prefs.getIntPref("tablet.projectFolders")==2;
        // show or hide zotfile menu items
        doc.getElementById("id-zotfile-collection-separator").hidden = !showCollectionMenu;
        doc.getElementById("id-zotfile-collection-showall").hidden = !showCollectionMenu;
        doc.getElementById("id-zotfile-collection-restrict").hidden = !showCollectionMenu;
    },

    buildZotFileCollectionMenu: function () {
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var nodes = win.ZoteroPane.document.getElementById('id-zotfile-collection-menu').childNodes;
        // Hide all items by default
        for (i=0;i<nodes.length;i++) nodes[i].setAttribute('hidden', true);
        // get subfolders
        var subfolders = JSON.parse(this.prefs.getCharPref("tablet.subfolders"));
        // show basefolder
        // nodes[0].setAttribute('label', 'Unfiled Attachments');
        nodes[0].setAttribute('hidden', false);
        nodes[1].setAttribute('hidden', false);
        nodes[2].setAttribute('hidden', false);
        // show subfolders
        subfolders.forEach(function(folder, i) {
            // set attributes of menu item
            nodes[i+3].setAttribute('label', folder.label);
            nodes[i+3].setAttribute('tooltiptext', this.ZFgetString('menu.collection.tooltip', [folder.path]));
            // this.ZFgetString('menu.sendAttToSubfolder',[folder.path])
            // show menu item
            nodes[i+3].setAttribute('hidden', false);
        },Zotero.ZotFile);
    },

    showMenu: function() {
        // get selected items
        var ZP = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser").ZoteroPane;
        var items = ZP.getSelectedItems();
        // check regular item or attachment selected
        var showMenu = items.some(function(item) { return item.isAttachment() || item.isRegularItem();});
        // show or hide zotfile menu items
        ZP.document.getElementById("id-zotfile-separator").hidden = !showMenu;
        ZP.document.getElementById("id-zotfile-attach-file").hidden = !showMenu;
        ZP.document.getElementById("id-zotfile-manage-attachments").hidden = !showMenu;
    },

    buildZotFileMenu: function() {
        var menuItemExtract=true;

        // get selected items
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var items = win.ZoteroPane.getSelectedItems();
        var item;

        // get menu and recreate structure of child items
        var menu = win.ZoteroPane.document.getElementById('id-zotfile-menu');
        var m = {
            warning1:0,
            rename: 1,
            extractanno: 2,
            getoutline: 3,
            sep1: 4,
            warning2: 5,
            push2reader: 6,
            updatefile: 7,
            pullreader: 8,
            sep2: 9,
            tablet: 10,
            warning3: 11,
            subfolders:new Array(12,13,14,15,16,17,18,19,20,21,22,23,24,25,26),
            sep3: 27,
            menuConfigure: 28,
            length:29
        };

        // list of disabled and show menu-items
        var disable = [m.tablet,m.warning1,m.warning2,m.warning3], show = [];

        // check selected items
        var groupLib=1,
            oneItem=0,
            oneAtt=0,
            onePushed=0,
            tagIDs = [Zotero.Tags.getID(this.Tablet.tag,0), Zotero.Tags.getID(this.Tablet.tagMod,0)];

        if (!items[0].libraryID) groupLib=0;

        for (var i=0; i < items.length; i++) {
            item=items[i];
            if(item.isRegularItem()) {
                oneItem=1;
                // get all attachments
                var attachments = item.getAttachments();

                // go through all attachments
                for (var j=0; j < attachments.length; j++) {
                    oneAtt=1;
                    // get current attachments
                    var att = Zotero.Items.get(attachments[j]);
                    if(att.hasTags(tagIDs)) onePushed=1;
                }
            }

            // attachment item
            if(item.isAttachment())  {
                oneAtt=1;
                oneItem=1;
                if(item.hasTags(tagIDs)) onePushed=1;
            }
            if(onePushed==1) break;

        }

        // check whether destination folder is defined (and valid)
        var dest_dir_valid=this.fileExists(this.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data);
//      if(this.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data!="") var dest_dir_valid=1;

        // warnings
        if(!oneItem) {
            show.push(m.warning1);
            menu.childNodes[m.warning1].setAttribute('label',this.ZFgetString('menu.noItemSelected'));
        }


        // at least one item and one attachment
        if(oneItem) {
            // add 'new att' and 'rename'
            show = [
                m.rename
            ];

            // warning
            if(!oneAtt) {
                disable.push(m.rename, m.extractanno, m.getoutline);
                show.push(m.sep1,m.warning2);
                menu.childNodes[m.warning2].setAttribute('label',this.ZFgetString('menu.itemHasNoAtts'));
            }

            // add 'Extract annotations'
            if(this.prefs.getBoolPref("pdfExtraction.MenuItem")) show.push(m.extractanno);
            if(this.prefs.getBoolPref("pdfOutline.menuItem")) show.push(m.getoutline);

            // tablet menu part
            if(this.prefs.getBoolPref("tablet") && oneAtt) {
                // add sep
                show.push(m.sep1);

                // warnings
                if(!dest_dir_valid) {
                    show.push(m.warning2);
                    menu.childNodes[m.warning2].setAttribute('label',this.ZFgetString('menu.invalidTabletLocation'));
                }
                if(groupLib) {
                    show.push(m.warning2);
                    menu.childNodes[m.warning2].setAttribute('label',this.ZFgetString('menu.itemIsInGroupLibrary'));
                }

                if(dest_dir_valid && !groupLib) {
                    show.push(m.push2reader,m.pullreader);

                    // set tooltip for base folder
                    menu.childNodes[m.push2reader].setAttribute('tooltiptext',this.ZFgetString('menu.sendAttToBaseFolder',[this.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data]));

                    if(!onePushed) disable.push(m.pullreader);

                    // add update menu item
                    if(this.Tablet.checkSelectedSearch() || this.prefs.getBoolPref("tablet.updateAlwaysShow")) {
                        show.push(m.updatefile);
                        if(!onePushed) disable.push(m.updatefile);
                    }

                    // Collection based project folders
                    var projectsSet=0;
                    if(this.prefs.getIntPref("tablet.projectFolders")==1) {
                        show.push(m.sep2,m.tablet);

                        // get first selected item
                        item=items[0];
                        if(item.isAttachment()) if(item.getSource()) item=Zotero.Items.get(item.getSource());

                        // create folders from collections
                        var folders = [];
                        var collections=item.getCollections();
                        for (i=0;i<collections.length;i++) {
                            var collection=Zotero.Collections.get(collections[i]);
                            var folder=this.folderSep + collection.getName();
                            var parent=collection.getParent();
                            while (parent) {
                                parent=Zotero.Collections.get(parent);
                                folder=this.folderSep + parent.getName() + folder;
                                parent=parent.getParent();
                            }
                            folders.push(folder);
                        }

                        // add folders to menu
                        if(folders.length) {
                            projectsSet=1;
                            folders=folders.sort();
                            for (i=0;i<folders.length;i++) {
                                show.push(m.subfolders[i]);
                                menu.childNodes[m.subfolders[i]].setAttribute('label',folders[i]);
                                menu.childNodes[m.subfolders[i]].setAttribute('tooltiptext',this.ZFgetString('menu.sendAttToSubfolder',[folders[i]]));
                                this.projectPath[i]=folders[i];
                                if(i>9) break;
                            }
                        }
                    }

                    // User defined project folders
                    if(this.prefs.getIntPref("tablet.projectFolders")==2) {
                        show.push(m.sep2,m.tablet,m.sep3,m.menuConfigure);
                        var subfolders = JSON.parse(this.prefs.getCharPref("tablet.subfolders"));
                        subfolders.forEach(function(folder, i) {
                            show.push(m.subfolders[i]);
                            menu.childNodes[m.subfolders[i]].setAttribute('label', folder.label);
                            menu.childNodes[m.subfolders[i]].setAttribute('tooltiptext', this.ZFgetString('menu.sendAttToSubfolder',[folder.path]));
                        },Zotero.ZotFile);
                        if(subfolders.length>0) projectsSet=1;
                    }

                    // message that no folders are defined
                    if(!projectsSet && this.prefs.getIntPref("tablet.projectFolders")!=0) {
                        var warning;
                        show.push(m.warning3);
                        if(this.prefs.getIntPref("tablet.projectFolders")==1) warning=this.ZFgetString('menu.itemIsInNoCollection');
                        if(this.prefs.getIntPref("tablet.projectFolders")==2) warning=this.ZFgetString('menu.noSubfoldersDefined');
                        menu.childNodes[m.warning3].setAttribute('label', warning);
                    }
                }
            }
        }


        // enable all items by default
        for (i=0;i<m.length;i++) menu.childNodes[i].setAttribute('disabled', false);
        // disable menu items
        for (i in disable) menu.childNodes[disable[i]].setAttribute('disabled', true);
        // Hide all items by default
        for (i=0;i<m.length;i++) menu.childNodes[i].setAttribute('hidden', true);
        // Show items
        for (i in show) menu.childNodes[show[i]].setAttribute('hidden', false);

    },

    buildTabletMenu: function() {
        // get selected items
        var pane = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser").ZoteroPane,
            att = pane.getSelectedItems()[0],
            tablet = Zotero.ZotFile.Tablet.getTabletStatus(att);
        if(!att.isAttachment())
            return;
        
        // update popupmenu
        var menupopup = pane.document.getElementById('zotfile-tablet-popup');
        // remove all children
        while (menupopup.firstChild) {
            menupopup.removeChild(menupopup.firstChild);
        }
            
        // add menu items
        var items = [
            {
                'label': 'View PDF',
                'tooltiptext': '',
                'command': function(e) {Zotero.ZotFile.Tablet.openTabletFile();},
                'hidden': tablet ? 'false' : 'true'
            },
            {
                'label': 'Show File',
                'tooltiptext': '',
                'command': function(e) {Zotero.ZotFile.Tablet.showTabletFile();},
                'hidden': tablet ? 'false' : 'true'
            },
            {
                'label': 'Send to Tablet',
                'tooltiptext': '',
                'command': function(e) {
                    Zotero.ZotFile.Tablet.sendSelectedAttachmentsToTablet(-1);
                    Zotero.ZotFile.buildTabletMenu();
                },
                'disabled': tablet ? 'true' : 'false'
            },
            {
                'label': 'Get from Tablet',
                'tooltiptext': '',
                'command': function(e) {
                    Zotero.ZotFile.Tablet.getSelectedAttachmentsFromTablet();
                    Zotero.ZotFile.buildTabletMenu();
                },
                'disabled': tablet ? 'false' : 'true'
            }
        ];
        for(i in items) {
            var item = items[i],
                keys = Object.keys(item),
                menuitem = pane.document.createElement("menuitem");
            for(key in Object.keys(item))
                if (keys[key]!='command')
                    menuitem.setAttribute(keys[key], item[keys[key]]);
                else
                    menuitem.addEventListener(keys[key], item[keys[key]]);
            menupopup.appendChild(menuitem);
            if(item.label=='Show File' && tablet)
                menupopup.appendChild(pane.document.createElement("menuseparator"));
        }
        
        if(Zotero.ZotFile.prefs.getIntPref("tablet.projectFolders")==2) {
            // add seperater and heading
            menupopup.appendChild(pane.document.createElement("menuseparator"));
            var menuitem = pane.document.createElement("menuitem");
            menuitem.setAttribute('label', 'Send to Subfolder on Tablet');
            menuitem.setAttribute('disabled', 'true');
            menuitem.setAttribute('style', 'font-size: 80%; background: none; -moz-appearance: none;');    
            menupopup.appendChild(menuitem);
    //         add subfolders
            var subfolders = JSON.parse(Zotero.ZotFile.prefs.getCharPref("tablet.subfolders"));
            subfolders.forEach(function(folder, i) {
                var menuitem = pane.document.createElement("menuitem");
                menuitem.setAttribute('label', folder.label);
                menuitem.addEventListener('command', function(event) {
                    Zotero.ZotFile.Tablet.sendSelectedAttachmentsToTablet(i);
                    Zotero.ZotFile.buildTabletMenu();
                });
                menupopup.appendChild(menuitem);
            }, Zotero.ZotFile);
            if(subfolders.length>0) projectsSet=1;
            // add 'change subfolder' item
            menupopup.appendChild(pane.document.createElement("menuseparator"));
            var menuitem = pane.document.createElement("menuitem");
            menuitem.setAttribute('label', 'Change subfolders...');
            menuitem.addEventListener('command', Zotero.ZotFile.openSubfolderWindow);
            menupopup.appendChild(menuitem);
        }    
    },

    attboxAddTabletRow: function() {
        // add tablet row to attachment info
        var pane = this.wm.getMostRecentWindow("navigator:browser").ZoteroPane,
            row = pane.document.createElement("row");
        row.setAttribute('id', 'zotfile-tablet-row');
        var rows = pane.document.getElementById('indexStatusRow').parentNode,
            lab1 = pane.document.createElement("label"),
            lab2 = pane.document.createElement("label");
        lab1.setAttribute('id', 'zotfile-tabletLabel');
        lab1.setAttribute('value', 'Tablet:');
        row.appendChild(lab1);
        lab2.setAttribute('id', 'zotfile-tabletStatus');
        lab2.setAttribute('value', '');
        lab2.setAttribute('crop', 'end');
        lab2.setAttribute('class', 'zotero-clicky');
        lab2.setAttribute('popup', 'zotfile-tablet-popup');
        lab2.addEventListener('click', Zotero.ZotFile.buildTabletMenu);
        row.appendChild(lab2);
        rows.appendChild(row);
        // add popup menu to DOM
        var popupset = pane.document.getElementById('seeAlsoPopup').parentNode,
           menupopup = pane.document.createElement("menupopup");
        menupopup.setAttribute('id', 'zotfile-tablet-popup');
        popupset.appendChild(menupopup);
        return row;
    },

    attboxUpdateTabletStatus: function() {
        var zz = Zotero.ZotFile,
            pane = zz.wm.getMostRecentWindow("navigator:browser").ZoteroPane,
            items = pane.getSelectedItems(),
            row = pane.document.getElementById('zotfile-tablet-row');
        if(items.length!=1) return;
        var att = items[0];
        if(!zz.prefs.getBoolPref('tablet') || !att.isAttachment() || att._attachmentMIMEType!='application/pdf') {
            if(row) row.setAttribute('hidden', 'true');
            return;
        }
        // add row if it does not exist
        if(!row) row = zz.attboxAddTabletRow();
        // pdf attachment
        row.setAttribute('hidden', 'false');
        // update tablet status
        lab = pane.document.getElementById('zotfile-tabletStatus');
        if(Zotero.ZotFile.Tablet.getTabletStatus(att)) {
            var subfolder = Zotero.ZotFile.Tablet.getInfo(att, 'projectFolder'),
                folder = subfolder==='' ? '[Basefolder]' : '[Basefolder]' + subfolder;
            lab.setAttribute('value', folder);
        }
        else {
            lab.setAttribute('value', 'No');
        }
    },

    addUserInput: function(filename, original_filename){
        var default_str = this.prefs.getCharPref("userInput_Default");
        if (default_str=="[original filename]") default_str=original_filename;
        var filesuffix = prompt(this.ZFgetString('renaming.addUserInput.prompt', [original_filename, filename]), default_str);
        if (filesuffix != '' && filesuffix != null) {
            // add file type to the file name
            filename = filename + " (" + filesuffix + ")";
        }
        return(filename);
    },

    // Array.prototype.remove = function() {
    removeFromArray: function(arr) {
        //var args = Array.prototype.slice.call(arguments).splice(1);
        var what, a = Array.prototype.slice.call(arguments).splice(1), L = a.length, ax;
        while (L && arr.length) {
            what = a[--L];
            while ((ax = arr.indexOf(what)) !== -1) {
                arr.splice(ax, 1);
            }
        }
        return arr;
    },

    checkFileType: function (obj) {
        if(!this.prefs.getBoolPref("useFileTypes")) return(true);
        var filename;
        if(obj.leafName) {
            filename = obj.leafName;
        } else {
            if(typeof(obj)=="number") obj = Zotero.Items.get(obj);
            if (obj.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL)  return false;
            filename = obj.getFilename();
        }
        // check
        var filetype = this.Utils.getFiletype(filename).toLowerCase(),
            regex = this.prefs.getCharPref("filetypes").toLowerCase().replace(/,/gi,"|");
        // return value
        return filetype.search(new RegExp(regex))>=0 ? true : false;
    },

    completePath: function(location,filename) {
        var path = location.charAt(location.length-1)==this.folderSep ? location + filename : location + this.folderSep + filename;
        return this.Utils.normalize_path(path);
    },

    /**
     * Get filename based on metadata from zotero item
     * @param  {zitem}  item   Zotero item for metadata
     * @param  {string} name   Current filename as fallback and for extension
     * @param  {string} format Formatting rules based on wildcards
     * @return {string}        Formatted filename with extension
     */
    getFilename: function(item, name, format) {
        // check function arguments
        if (!item.isRegularItem()) throw('getFilename: Not regular zotero item.');
        // check whether renaming is disabled
        if(this.prefs.getBoolPref('disable_renaming')) return(name);
        // rename format
        var filename = '',
            item_type =  item.getType(),
            format_default = item_type == 19 ? this.prefs.getCharPref("renameFormat_patent") : this.prefs.getCharPref("renameFormat");
        format = typeof format !== 'undefined' ? format : format_default;
        // create the new filename from the selected item
        if (!this.prefs.getBoolPref('useZoteroToRename')) {
            filename = this.Wildcards.replaceWildcard(item, format);
            // Strip invalid characters (adopted from Zotero, modified to accept periods)
            filename = filename.replace(/[\/\\\?\*:|"<>]/g, '');
            // replace multiple blanks in filename with single blank & remove whitespace
            filename = Zotero.Utilities.trimInternal(filename);
            // remove periods, replace blanks with '_', convert to lower case
            if (this.prefs.getBoolPref('removePeriods')) filename = filename.replace(/\./g, '');
            if (this.prefs.getBoolPref('replace_blanks'))  filename = filename.replace(/ /g, '_');
            if (this.prefs.getBoolPref('lower_case')) filename = filename.toLowerCase();
            // remove all the accents and other strange characters from filename
            if (Zotero.version[0] >= 3 && this.prefs.getBoolPref('removeDiacritics'))
                filename = Zotero.Utilities.removeDiacritics(filename);
        }
        // Use Zotero to get filename
        if (this.prefs.getBoolPref('useZoteroToRename')) filename = Zotero.Attachments.getFileBaseNameFromItem(item.itemID);
        // Add user input to filename
        if(this.prefs.getBoolPref('userInput')) filename = this.addUserInput(filename, name);
        // add filetype to filename
        var filetype = this.Utils.getFiletype(name);
        if(filetype != '') filename = filename + '.' + filetype;
        // valid zotero name
        filename = Zotero.File.getValidFileName(filename);
        // return
        return(filename);
    },

    /**
     * Format subfolder based on rule
     * @param  {zitem}  item   Zotero item for metadata
     * @param  {string} format Rule to construct subfolder with wildcards (e.g. '%j/%y')
     * @return {string}        Formatted subfolder such as 'Author/2010'
     */
    formatSubfolder: function(item, format) {
        if (format == '') return '';
        var subfolder = this.Wildcards.replaceWildcard(item, format);
        if (subfolder[0] == this.folderSep) subfolder = subfolder.slice(1);
        // replace invalid characters        
        subfolder = OS.Path.split(subfolder).components
            .map(s => s == '' ? 'undefined' : s)
            .map(s => Zotero.File.getValidFileName(s))
            .join(this.folderSep);
        return OS.Path.normalize(subfolder);
    },

    /**
     * Function to get location of file based on zotero item metadata
     * @param  {string} basefolder Basefolder
     * @param  {zitem}  item       Zotero item  for metadata
     * @param  {string} format     Rule to construct subfolder with wildcards (e.g. '%j/%y')
     * @return {string}            Folder path
     */
    getLocation: function(basefolder, item, format) {
        // check function arguments
        if (!item.isRegularItem()) throw('getLocation: Not regular zotero item.');
        if (typeof basefolder != 'string') throw("getLocation: 'basefolder' not string.");
        if (typeof format != 'string') throw("getLocation: 'format' not string.");
        // combine folder and subfolder
        var subfolder = this.formatSubfolder(item, format);
        return OS.Path.join(OS.Path.normalize(basefolder), subfolder);
    },

    /**
     * Create nsIFile from path (https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIFile)
     * @param  {string}  path Valid file path.
     * @return {nsIFile}      nsIFile file object
     */
    createFile: function(path) {
        try {
            var file = Components.classes["@mozilla.org/file/local;1"].
                createInstance(Components.interfaces.nsIFile);
            file.initWithPath(path);
        }
        catch (err) {
            if(err.name == "NS_ERROR_FILE_UNRECOGNIZED_PATH")
                throw("Zotero.ZotFile.createFile(): 'path' not an absolute file path.")
            throw("Zotero.ZotFile.createFile(): Unkown error.")
        }
        return(file);
    },

    runProcess: function(command, args, blocking) {
        // default arguments
        blocking = typeof blocking !== 'undefined' ? blocking : true;
        try {
            // set up process
            var cmd = this.createFile(command);
            var proc = Components.classes["@mozilla.org/process/util;1"].
                        createInstance(Components.interfaces.nsIProcess);
            proc.init(cmd);

            // run process
            if (!Zotero.isFx36) {
                proc.runw(blocking, args, args.length);
            }
            else {
                proc.run(blocking, args, args.length);
            }
        }
        catch(err) {
            Components.utils.reportError(err);
            return (-1);
        }
    },

    /**
     * Check whether file exists
     * @param  {nslFile|string|zitem} obj      nslFile, path to directory or string (string) or Zotero attachment item
     * @param  {string}               filename Filename if obj is string
     * @return {bool}
     */
    fileExists: function(obj, filename) {
        // nsIFile object
        if (obj instanceof Components.interfaces.nsIFile) {
            if (typeof filename == 'string') obj = this.createFile(OS.Path.join(obj.path, filename));
            return obj.exists();
        }
        // string
        if (typeof obj == 'string') {
            if (typeof filename == 'string') obj = OS.Path.join(obj, filename);
            return this.createFile(obj).exists();
        }
        // Zotero attachment item
        if (typeof obj == 'object')
            if (obj.isAttachment())
                return obj.fileExists();
        // return false
        return false;
    },

    /**
     * Move file to new location
     * @param  {nsIFile} file    File to move.
     * @param  {string} target   Target directory.
     * @param  {string} filename Name of file.
     * @return {string}          Path to new location of file.
     */
    moveFile: function(file, target, filename) {
        // check arguments
        if (!(file instanceof Components.interfaces.nsIFile)) throw("Zotero.ZotFile.moveFile(): 'file' is not nsIFile object.")
        if (!file.exists()) throw("Zotero.ZotFile.moveFile(): 'file' does not exists.")
        // if target is '/' or '\', use file's parent directory
        if(target.trim() == this.folderSep)
            target = file.isFile() ? file.parent.path : file.path;
        // define variables
        var target = this.createFile(target),
            file_dirname = OS.Path.dirname(file.path);
        // return if already at target
        if(file.path == OS.Path.join(target.path, filename)) return(file.path);
        // add suffix if target path exists
        var k = 2;
        while(this.fileExists(target, filename)) {
            filename = this.Utils.addSuffix(filename, k);
            if (file.path == OS.Path.join(target.path, filename)) return(file.path);
            k++;
            if(k > 999) throw("'Zotero.ZotFile.moveFile()': '" + filename + "' already exists.");
        }
        // move file to new location
        try {
            file.moveTo(target, filename);
        }
        catch(err) {
            if(err.name == "NS_ERROR_FILE_IS_LOCKED")
                this.messages_error.push(this.ZFgetString('error.movingFileLocked', [file.leafName]));
            else
                this.messages_error.push(this.ZFgetString('error.movingFileGeneral', [file.leafName, err]));
            return false;
        }
        // delete empty folders after moving file
        this.removeEmptyFolders(this.createFile(file_dirname));
        // return path to new location
        return(file.path);
    },

    /*
     * Move file associated with an link attachment
     * Adopted from `item.renameAttachmentFile` but allows for new location
     * 
     * -1       Destination file exists -- use _force_ to overwrite
     * -2       Error renaming
     * false    Attachment file not found
     */
    moveLinkedAttachmentFile: function(att, location, filename, overwrite) {
        if (!att.isAttachment() || att.attachmentLinkMode!==Zotero.Attachments.LINK_MODE_LINKED_FILE)
            return false;
        // get file
        var file = att.getFile();
        if (!file) return false;
        var origModDate = file.lastModifiedTime;
        try {
            if(location.trim() == this.folderSep) {
                //no place to move the file, so rename it in-place
                this.infoWindow(this.ZFgetString('general.warning'), 'Custom location for files not set. File is renamed only.');
                location = file.parent.path;
            }
            var dest = this.createFile(location);
            dest.append(filename);

            // Ignore if no change
            if (file.path === dest.path)
                return true;
            
            // Update mod time and clear hash so the file syncs
            // TODO: use an integer counter instead of mod time for change detection
            // Update mod time first, because it may fail for read-only files on Windows
            file.lastModifiedTime = new Date();
            // file.moveTo(null, newName);
            var newfile_path = this.moveFile(file, location, filename);
            if (!newfile_path) 
                return false;
            dest = this.createFile(newfile_path);
            att.relinkAttachmentFile(dest);
            att.setField('title', dest.leafName);
            att.save();
            
            Zotero.DB.beginTransaction();
            
            Zotero.Sync.Storage.setSyncedHash(att.id, null, false);
            Zotero.Sync.Storage.setSyncState(att.id, Zotero.Sync.Storage.SYNC_STATE_TO_UPLOAD);
            
            Zotero.DB.commitTransaction();
            
            return true;
        }
        catch (e) {
            // Restore original modification date in case we managed to change it
            try { file.lastModifiedTime = origModDate } catch (e) {}
            Zotero.debug(e);
            Components.utils.reportError(e);
            return false;
        }
    },

    copyFile: function(file, destination, filename){

        // create a nslFile Object of the destination folder
        var dir = this.createFile(destination);

        // check whether already exists and add name if it does
        if(file.path!=this.completePath(destination,filename)) {

            var filename_temp=filename;
            var k=2;

            while(this.fileExists(destination,filename_temp)) {
                filename_temp = this.Utils.addSuffix(filename,k);
                k++;
                if(k>99) break;
            }
            filename=filename_temp;

            // copy file
            file.copyTo(dir, filename);
        }

        // return file
        return(this.createFile(this.completePath(dir.path,filename)));

    },

    removeFile: function(f) {
        if(f.exists()) {
            try {
                if(!f.isDirectory()) {
                    f.remove(false);
                }
                // for directories, remove them them if no non-hidden files are inside
                else {
                    var files = f.directoryEntries;
                    while (files.hasMoreElements()) {
                        var file = files.getNext();
                        file.QueryInterface(Components.interfaces.nsIFile);
                        if (!file.isHidden()) return;
                    }
                    f.remove(true);
                }
            }
            catch(err){
                if(f.isDirectory()) this.infoWindow(this.ZFgetString('general.report'),this.ZFgetString('file.removeFolderFailed'));
            }
        }
    },

    removeEmptyFolders: function(f) {
        // Keep track of zotero's internal directory, current source and destination directory
        var base_folders = [Zotero.getStorageDirectory().path];
        var source_dir = this.getSourceDir(false),
            dest_dir = this.prefs.getComplexValue("dest_dir", Components.interfaces.nsISupportsString).data;
        if (source_dir != -1 && source_dir != "") base_folders.push(source_dir);
        if (dest_dir != "") base_folders.push(dest_dir);
        base_folders = base_folders.map(this.Utils.normalize_path);
        // Only delete folders if the file is located in any of the base folders
        if (!base_folders.map(dir => f.path.startsWith(dir)).some(x => x === true)) return;

        // Try to remove the original dir recursively until a non empty folder is found
        while(true) {
            if (f.isDirectory() && base_folders.indexOf(f.path) === -1) {
                this.removeFile(f);

                // Stop if the directory was not removed
                if (f.exists()) break;

                // Try the parent of the current folder too
                f = this.createFile(OS.Path.dirname(f.path));

            } else {
                // Also break if f is not a directory or if it is the same
                // directory as the source/zotero folder
                break;
            }
        }
    },

    showFolder: function(folderFile) {
        // create folder if it does not exsist
        Zotero.File.createDirectoryIfMissing(folderFile);

        // open folder in file system
        folderFile.QueryInterface(Components.interfaces.nsIFile);
        try {
            folderFile.reveal();
        }
        catch (e) {
            // On platforms that don't support nsIFile.reveal() (e.g. Linux), we
            // open a small window with a selected read-only textbox containing the
            // file path, so the user can open it, Control-c, Control-w, Alt-Tab, and
            // Control-v the path into another app
            var io = {alertText: folderFile.path};
            window.openDialog('chrome://zotero/content/selectableAlert.xul', "zotero-reveal-window", "chrome", io);
        }
    },

    getAllFilesInFolder: function(dir_path){
        var return_files=[];
        // create a nslFile Object for the dir
        try {
            var dir = this.createFile(dir_path);
            var success=0;

            // go through all the files in the dir
            var files = dir.directoryEntries;
            while (files.hasMoreElements()) {
                // get one after the other file
                var file = files.getNext();
                file.QueryInterface(Components.interfaces.nsIFile);
                // only look at files which are neither folders nor hidden
                if(!file.isDirectory() && !file.isHidden()) {
                // is this a file we want to work with?
                    if (this.checkFileType(file)) {
                        return_files[success]=file;
                        success=success+1;
                    }
                }
            }
            if (success>0)  return(return_files);
            else return(-1);

        } catch (e) {
            Components.utils.reportError(e);
            return (-2);
        }
    },

    getLastFileInFolder: function(dir_path){
        var return_files = [];
        // create a nslFile Object for the dir
        try {
            var dir = this.createFile(dir_path),
                lastfile_date = 0,
                lastfile_path = "",
                success = 0;

            // go through all the files in the dir
            var files = dir.directoryEntries;
            while (files.hasMoreElements()) {
                // get one after the other file
                var file = files.getNext();
                file.QueryInterface(Components.interfaces.nsIFile);
                // continue if file is folder or hidden
                if(file.isDirectory() || file.isHidden())
                    continue;
                // continue if filetype not included
                if (!this.checkFileType(file)) 
                    continue;
                // finally, we set return_files to the file with the most recent modification
                var modtime = file.lastModifiedTime;
                if (modtime > lastfile_date) {
                    lastfile_date = modtime;
                    return_files[0] = file;
                    success = 1;
                }
            }
            if (success==1) return(return_files);
            else return(-1);
        } catch (e) {
            Components.utils.reportError(e);
            return (-2);
        }

    },

    getFFDownloadFolder: function () {
        var path="";
        try {
            if(this.ffPrefs.getBoolPref('useDownloadDir')) {
                var downloadManager = Components.classes["@mozilla.org/download-manager;1"]
                                    .getService(Components.interfaces.nsIDownloadManager);
                path=downloadManager.userDownloadsDirectory.path;
            }
            if(!this.ffPrefs.getBoolPref('useDownloadDir') && this.ffPrefs.prefHasUserValue('lastDir') ) {
                        path=this.ffPrefs.getCharPref('lastDir');
            }
        }
        catch (err) {
            path="";
        }
        return(path);
    },

    getSourceDir: function(message) {
        var source_dir="";

        if ( this.prefs.getBoolPref("source_dir_ff")) source_dir = this.getFFDownloadFolder();
        if (!this.prefs.getBoolPref("source_dir_ff")) source_dir = this.prefs.getComplexValue("source_dir", Components.interfaces.nsISupportsString).data;

        // test whether valid source dir
        if (source_dir!="" && this.fileExists(source_dir)) {
            return (source_dir);
        } else {
            if(message) this.infoWindow(this.ZFgetString('general.error'),this.ZFgetString('file.invalidSourceFolder'));
            return(-1);
        }

    },

    attachFile: function(item, file) {
        var attID;
        // create linked attachment if local library
        if (!item.libraryID) attID=Zotero.Attachments.linkFromFile(file, item.itemID,item.libraryID);

        // import attachment if cloud library
        if (item.libraryID) {
            attID=Zotero.Attachments.importFromFile(file, item.itemID,item.libraryID);
            this.removeFile(file);
        }
        // Rename and Move Attachment
        var att = Zotero.Items.get(attID);
        var newAttID = this.renameAttachment(att);
        return Zotero.Items.get(newAttID);
    },

    // FUNCTION: Attach New File(s) from Download Folder
    attachNewFile: function(){
        // get selected items
        var win = this.wm.getMostRecentWindow("navigator:browser"),
            item = win.ZoteroPane.getSelectedItems()[0];
        //check whether it really is an bibliographic item (no Attachment, note or collection)
        if (!item.isRegularItem()) {
            // show messages and handle errors
            this.messages_error.push(this.ZFgetString('renaming.renameAttach.wrongItem'));
            this.handleErrors();
            return;
        }
        try {
            // check whether valid FF default download folder
            if(this.prefs.getBoolPref('source_dir_ff') &&  this.getSourceDir(false)==-1) {
                this.prefs.setBoolPref('source_dir_ff',false);
                var str = Components.classes["@mozilla.org/supports-string;1"]
                    .createInstance(Components.interfaces.nsISupportsString);
                str.data = prompt(this.ZFgetString('general.downloadFolder.prompt'));
                this.prefs.setComplexValue("source_dir", Components.interfaces.nsISupportsString, str);
                return;
            }

            // get source dir
            var source_dir=this.getSourceDir(true);
            if (source_dir==-1) return;

            // get files from source dir
            if (!this.prefs.getBoolPref("allFiles")) file=this.getLastFileInFolder(source_dir);
            if ( this.prefs.getBoolPref("allFiles")) file=this.getAllFilesInFolder(source_dir);

            // attach them
            if(file!=-1 && file!=-2) {
                if (this.prefs.getBoolPref("confirmation"))
                    if(!confirm(this.ZFgetString('renaming.renameAttach.confirm', [file[0].leafName])))
                        return;
                var progressWin = this.progressWindow(this.ZFgetString('general.newAttachmentsAdded'));
                for (var i=0; i < file.length; i++) {
                    var att = this.attachFile(item, file[i]);
                    progress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title'));
                    progress.setProgress(100);
                }
                progressWin.startCloseTimer(this.prefs.getIntPref("info_window_duration"));
            }
            else this.messages_error.push(this.ZFgetString('renaming.renameAttach.noFileFound'));
        }
        catch(e) {
            this.messages_fatalError.push(e);
        }
        // show messages and handle errors
        this.handleErrors();
    },

    /**
     * Rename attachment file based on parent item metadata.
     * @param  {zitem}  att       Zotero attachment item.
     * @param  {bool}   imported  Create imported Zotero attachment.
     * @param  {bool}   rename    Rename attachment file.
     * @param  {string} folder    Custom location if not imported attachment.
     * @param  {string} subfolder Subfolder location if not important attachment
     * @param  {book}   verbose   Notification about renaming.
     * @return {string}           Zotero ID (new) item.
     */
    renameAttachment: function(att, imported, rename, folder, subfolder, verbose) {
        // default arguments
        var subfolder_default = this.getPref('subfolder') ? this.getPref('subfolderFormat') : '';
        imported = typeof imported !== 'undefined' ? imported : this.getPref('import');
        rename = typeof rename !== 'undefined' ? rename : true;
        folder = typeof folder !== 'undefined' ? folder : this.getPref('dest_dir');
        subfolder = typeof subfolder !== 'undefined' ? subfolder : subfolder_default;
        verbose = typeof verbose !== 'undefined' ? verbose : true;
        // check function arguments
        if (!att.isAttachment()) throw('Zotero.ZotFile.renameAttachment(): No attachment item.');
        if (att.isTopLevelItem()) throw('Zotero.ZotFile.renameAttachment(): Attachment is top-level item.');
        if (!att.fileExists()) throw('Zotero.ZotFile.renameAttachment(): Attachment file does not exists.');
        // set variables
        var win = this.wm.getMostRecentWindow("navigator:browser"),
            selection = win.ZoteroPane.itemsView.saveSelection(),
            att_id = att.getID(),
            linkmode = att.attachmentLinkMode,
            item = Zotero.Items.get(att.getSource()),
            file = att.getFile(),
            note = att.getNote(),
            tags = att.getTags().map(tag => tag._get('name')),
            related_items = att.relatedItems;
        // only proceed if linked or imported attachment
        if(!att.isImportedAttachment() && !linkmode==Zotero.Attachments.LINK_MODE_LINKED_FILE)
            return att_id;
        // get filename and location
        var filename = rename ? this.getFilename(item, file.leafName) : file.leafName,
            location = this.getLocation(folder, item, subfolder);
        // (a) linked to imported attachment
        if (imported && linkmode == Zotero.Attachments.LINK_MODE_LINKED_FILE) {
            // attach file to selected Zotero item
            var id = Zotero.Attachments.importFromFile(file, item.getID(), item.libraryID);
            // remove file from hard-drive (and delete empty folders after importing file)
            file.remove(false);
            this.removeEmptyFolders(file.parent);
            // erase old attachment
            att.erase();
            // create new attachment object
            att = Zotero.Items.get(id);
            // rename file associated with attachment
            att.renameAttachmentFile(filename);
            // change title of attachment item
            att.setField('title', filename);
            // restore attachment data
            att.relatedItems = related_items;
            if(note != "") att.setNote(note);
            if(tags) att.addTags(tags);
            att.save();
            // restore selection
            selection = this.Utils.arrayReplace(selection, att_id, id);
            if(Zotero.version >= "3") win.ZoteroPane.itemsView.selectItems(selection);
            // notification
            if (verbose) this.messages_report.push(this.ZFgetString('renaming.imported', [filename]));
        }
        // (b) imported to imported attachment (or cloud library)
        if ((imported && att.isImportedAttachment()) || item.libraryID) {
            // rename file associated with attachment
            att.renameAttachmentFile(filename);
            // change title of attachment item
            att.setField('title', filename);
            att.save();
            // notification
            if (verbose) this.messages_report.push(this.ZFgetString('renaming.imported', [filename]));
        }
        // (c) imported to linked attachment (only if library is local)
        if (att.isImportedAttachment() && !imported && !item.libraryID) {
            // move pdf file
            var path = this.moveFile(file, location, filename);
            if (!path) return att_id;
            // recreate the outfile nslFile Object
            file = this.createFile(path);
            // create linked attachment
            var id = Zotero.Attachments.linkFromFile(file, item.getID(), item.libraryID);
            // erase old attachment
            att.erase();
            // create new attachment object
            att = Zotero.Items.get(id);
            // rename file associated with attachment
            att.renameAttachmentFile(filename);
            // change title of attachment item
            att.setField('title', filename);
            // restore attachment data
            att.relatedItems = related_items;
            if(note != '') att.setNote(note);
            if(tags) att.addTags(tags);
            att.save();
            // restore selection
            selection = this.Utils.arrayReplace(selection, att_id, id);
            if(Zotero.version >= '3') win.ZoteroPane.itemsView.selectItems(selection);
            // notification and return
            if(verbose) this.messages_report.push(this.ZFgetString('renaming.linked', [filename]));
        }
        // (d) linked to linked attachment (only if library is local)
        if (!att.isImportedAttachment() && !imported && !item.libraryID) {
            // relink attachment
            this.moveLinkedAttachmentFile(att, location, filename, false);
            // notification
            if(verbose) this.messages_report.push(this.ZFgetString('renaming.linked', [filename]));
        }
        // return id of attachment
        return att.getID();
    },

    // FUNCTION: Rename & Move Existing Attachments
    renameSelectedAttachments: function(){
        // get selected attachments
        var attIDs = this.getSelectedAttachments(true);
        if (attIDs.length===0) {
            this.infoWindow('Zotfile: Renaming Attachments...', this.ZFgetString('general.warning.skippedAtt.msg'));
            return;
        }
        // confirm renaming
        if (this.prefs.getBoolPref("confirmation_batch_ask") && attIDs.length>=this.prefs.getIntPref("confirmation_batch")) 
            if(!confirm(this.ZFgetString('renaming.moveRename', [attIDs.length])))
                return;
        // show infoWindow        
        var progressWin = this.progressWindow(this.ZFgetString('renaming.renamed')),
            addDescription = false;
        // rename attachments
        for (var i=0; i < attIDs.length; i++) {
            // get attachment and add line to infoWindow
            var att = Zotero.Items.get(attIDs[i]),
                attProgress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title'));
            try {
                // Rename and Move Attachment
                if(this.fileExists(att) && !att.isTopLevelItem() && !this.Tablet.getTabletStatus(att)) {
                    var item = Zotero.Items.get(att.getSource()),
                        file = att.getFile();
                    // move & rename
                    var attID = this.renameAttachment(att);
                    att = Zotero.Items.get(attID);
                    if(!att) {
                        attProgress.setError();
                        continue;
                    }
                    // update progress window
                    attProgress.complete(att.getFilename(), att.getImageSrc());
                }                
                else {
                    addDescription = true;
                    attProgress.setError();
                }
            }
            catch(e) {
                attProgress.setError();
                this.messages_fatalError.push(e);
            }
        }
        // show messages and handle errors
        if(addDescription)
            progressWin.addDescription(this.ZFgetString('general.warning.skippedAtt.msg'));
        progressWin.startCloseTimer(this.prefs.getIntPref("info_window_duration"));
        this.handleErrors();
    }
};
