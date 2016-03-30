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
    blacklistTagAdd: [],
    blacklistTagRemove: [],
    // tablet tags
    tag:null,
    tagMod:null,
    renameNotifierID:null,
    outlineNotifierID:null,
    xhtml:'http://www.w3.org/1999/xhtml',


    // ========================= //
    // FUNCTIONS: INIT FUNCTIONS //
    // ========================= //

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
            this.tag = this.prefs.getCharPref("tablet.tag");
            this.tagMod = this.prefs.getCharPref("tablet.tagModified");

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
                            var id_item = zz.renameAttachment(parent, item, true, prefs.getBoolPref("import"), prefs.getComplexValue("dest_dir", Components.interfaces.nsISupportsString).data, prefs.getBoolPref("subfolder"), prefs.getCharPref("subfolderFormat"), false);
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
                            Zotero.ZotFile.copy2Clipboard(e);
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
                    not_excluded = zz.blacklistTagAdd.indexOf(obj.item.key)==-1;
                    if (!not_excluded) zz.removeFromArray(zz.blacklistTagAdd, obj.item.key);
                }
                if(event == 'remove') {
                    not_excluded = zz.blacklistTagRemove.indexOf(obj.item.key)==-1;
                    if (!not_excluded) zz.removeFromArray(zz.blacklistTagRemove, obj.item.key);
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
                                    .some(zz.getTabletStatus, zz);
                if(item.isAttachment()) onTablet = zz.getInfo(item, 'lastmod')!='';
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
                                    zz.sendAttachmentToTablet(item, att, '');
                                }, zz);
                        if(item.isAttachment())
                            zz.sendAttachmentToTablet(zz.getParent(item), item, '');
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
                                .filter(zz.getTabletStatus, zz)
                                .forEach(function(att) {
                                    zz.getAttachmentFromTablet(item, att, false);
                                }, zz);
                        if(item.isAttachment())
                            zz.getAttachmentFromTablet(zz.getParent(item), item, '');
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

    // ============================ //
    // FUNCTIONS: HELPER FUNCTIONS //
    // ============================ //

    // detect duplicates in array
    removeDuplicates: function (x) {
        x = x.sort();
        var y = [];

        y.push(x[0]);
        for (var i=1; i < (x.length); i++) {
            if (x[i-1] != x[i]) y.push(x[i]);
        }
        return(y);
    },

    //  search and replace in array
    arrayReplace: function (x,search, replace) {
        for(var i=0; i<x.length;i++ ) {
            if(x[i]==search) x.splice(i,1,replace);
        }
        return(x);
    },

    // format array using named placeholders such as '%(test)'
    str_format: function() {
        var args = arguments;
        return args['0'].replace(/%\((\w+)\)/g, function(match, name) {
          return args['1'][name];
       });
    },

    /**
     * Normalize a path by removing any unneeded characters
     * Adopted from OS.Path module
     * https://dxr.mozilla.org/mozilla-central/source/toolkit/components/osfile/modules/ospath_unix.jsm
     * https://dxr.mozilla.org/mozilla-central/source/toolkit/components/osfile/modules/ospath_win.jsm
     */
    normalize_path: function (path) {
        var normalize_path_win = function(path) {
            var winGetDrive = function(path) {
                if (path == null) {
                    throw new TypeError("path is invalid");
                }

                if (path.startsWith("\\\\")) {
                // UNC path
                if (path.length == 2) {
                    return null;
                }
                let index = path.indexOf("\\", 2);
                if (index == -1) {
                    return path;
                }
                return path.slice(0, index);
                }
                // Non-UNC path
                let index = path.indexOf(":");
                if (index <= 0) return null;
                return path.slice(0, index + 1);
            };

            var winIsAbsolute = function(path) {
                let index = path.indexOf(":");
                return path.length > index + 1 && path[index + 1] == "\\";
            };
        
            let stack = [];

            if (!path.startsWith("\\\\")) {
                // Normalize "/" to "\\"
                path = path.replace(/\//g, "\\");
            }

            // Remove the drive (we will put it back at the end)
            let root = winGetDrive(path);
            if (root) {
                path = path.slice(root.length);
            }

            // Remember whether we need to restore a leading "\\" or drive name.
            let absolute = winIsAbsolute(path);

            // And now, fill |stack| from the components,
            // popping whenever there is a ".."
            path.split("\\").forEach(function loop(v) {
                switch (v) {
                    case "":  case ".": // Ignore
                        break;
                    case "..":
                        if (stack.length == 0) {
                        if (absolute) {
                          throw new Error("Path is ill-formed: attempting to go past root");
                        } else {
                         stack.push("..");
                        }
                        } else {
                        if (stack[stack.length - 1] == "..") {
                          stack.push("..");
                        } else {
                          stack.pop();
                        }
                        }
                        break;
                    default:
                        stack.push(v);
                }
            });

            // Put everything back together
            let result = stack.join("\\");
            if (absolute || root) {
                result = "\\" + result;
            }
            if (root) {
                result = root + result;
            }
            return result;
        };

        var normalize_path_unix = function(path) {
            let stack = [];
            let absolute;
            if (path.length >= 0 && path[0] == "/") {
                absolute = true;
            } else {
                absolute = false;
            }
            path.split("/").forEach(function(v) {
                switch (v) {
                    case "":  case ".":// fallthrough
                        break;
                    case "..":
                    if (stack.length == 0) {
                        if (absolute) {
                            throw new Error("Path is ill-formed: attempting to go past root");
                        } else {
                            stack.push("..");
                        }
                        } else {
                        if (stack[stack.length - 1] == "..") {
                            stack.push("..");
                        } else {
                            stack.pop();
                        }
                    }
                    break;
                    default:
                      stack.push(v);
                }
            });
            let string = stack.join("/");
            return absolute ? "/" + string : string;
        };

        if (Zotero.isWin) path = normalize_path_win(path);
        if (!Zotero.isWin) path = normalize_path_unix(path);
        return(path)
    },

    // check whether valid attachment
    // argument: zotero item, or item ID
    validAttachment: function (att, warning) {
        // set default setting
        warning = typeof warning !== 'undefined' ? warning : true;
        // get item if passed itemID
        if(typeof(att)=="number") att=Zotero.Items.get(att);
        // check whether attachment is valid (not top-level item, file exists and not a web attachment)
        if(att.isAttachment()) {
            var file = att.getFile();
            if (!att.isTopLevelItem() && this.fileExists(file) && Zotero.File.getExtension(file) != "html")
                return(true);
            else {
                // show warning
                if(warning) this.messages_warning.push("'" + att.getField("title") + "'");
                // return false
                return(false);
            }
        }
        return(false);
    },

    getParent: function(att) {
        var id_parent = att.getSource();
        return Zotero.Items.get(id_parent);
    },

    getSelectedAttachments: function (all) {
        all = typeof all !== 'undefined' ? all : false;
        // get selected items
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var items = win.ZoteroPane.getSelectedItems();
        // create array of attachments from selection
        var attIDs=[];
        for (var i=0; i < items.length; i++) {
            var item = items[i];
            // regular item
            if(item.isRegularItem()) {
                // get all attachments
                var attachments = item.getAttachments();
                // go through all attachments and add those with a tag
                for (var j=0; j < attachments.length; j++) {
                    if (attachments[j].attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_URL)
                        continue;
                    if (!all) if(this.validAttachment(attachments[j])) 
                        attIDs.push(attachments[j]);
                    if (all && this.checkFileType(attachments[j]))
                        attIDs.push(attachments[j]);
                }
            }
            // attachment item that is not top level
            if(item.isAttachment()) {
                if (item.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_URL)
                    continue;
                if (!all) if(this.validAttachment(item))
                    attIDs.push(item.id);
                if (all && this.checkFileType(item))
                    attIDs.push(item.id);
            }
        }

        // remove duplicate elements
        if(attIDs.length>0) attIDs=this.removeDuplicates(attIDs);
        // return array of attachment IDs
        return(attIDs);
    },

    futureRun: function(aFunc) {
        var tm = Components.classes["@mozilla.org/thread-manager;1"].getService(Components.interfaces.nsIThreadManager);
        tm.mainThread.dispatch({run: function(){aFunc();}},Components.interfaces.nsIThread.DISPATCH_NORMAL);
    },

    createSavedSearch: function(which) {
        if(which=="tablet" || which=="both") {
            var search = new Zotero.Search();
            search.addCondition('tag', 'contains', this.tag);
            // search.addCondition('tag', 'is', this.tagMod);
            // search.addCondition('itemType', 'is', 'attachment');
            search.addCondition('includeParentsAndChildren', 'true');
            // search.addCondition('joinMode', 'any');
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
    },


    // ================== //
    // FUNCTIONS: WINDOWS //
    // ================== //

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
            errors_str = this.removeDuplicates(errors_str).join("\n\n");
            on_click = function() {
                Zotero.ZotFile.copy2Clipboard(errors_str);
            };
        }
        // error messages
        if(errors.lines.length>0) {
            // remove duplicates
            errors.lines = this.removeDuplicates(errors.lines);
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

    copy2Clipboard: function(txt) {
        const gClipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
            .getService(Components.interfaces.nsIClipboardHelper);
        gClipboardHelper.copyString(txt);
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

    // ======================= //
    // FUNCTIONS: ZOTFILE MENU //
    // ======================= //

    showCollectionMenu: function() {
        // ZoteroPane object
        var doc = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser").ZoteroPane.document;
        // check regular item or attachment selected & custom subfolders
        var showCollectionMenu = Zotero.ZotFile.prefs.getBoolPref("tablet") && Zotero.ZotFile.checkSelectedSearch() && Zotero.ZotFile.prefs.getIntPref("tablet.projectFolders")==2;
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
            tagIDs = [Zotero.Tags.getID(this.tag,0), Zotero.Tags.getID(this.tagMod,0)];

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
                    if(this.checkSelectedSearch() || this.prefs.getBoolPref("tablet.updateAlwaysShow")) {
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
            tablet = Zotero.ZotFile.getTabletStatus(att);
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
                'command': function(e) {Zotero.ZotFile.openTabletFile();},
                'hidden': tablet ? 'false' : 'true'
            },
            {
                'label': 'Show File',
                'tooltiptext': '',
                'command': function(e) {Zotero.ZotFile.showTabletFile();},
                'hidden': tablet ? 'false' : 'true'
            },
            {
                'label': 'Send to Tablet',
                'tooltiptext': '',
                'command': function(e) {
                    Zotero.ZotFile.sendSelectedAttachmentsToTablet(-1);
                    Zotero.ZotFile.buildTabletMenu();
                },
                'disabled': tablet ? 'true' : 'false'
            },
            {
                'label': 'Get from Tablet',
                'tooltiptext': '',
                'command': function(e) {
                    Zotero.ZotFile.getSelectedAttachmentsFromTablet();
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
                    Zotero.ZotFile.sendSelectedAttachmentsToTablet(i);
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
        if(Zotero.ZotFile.getTabletStatus(att)) {
            var subfolder = Zotero.ZotFile.getInfo(att, 'projectFolder'),
                folder = subfolder==='' ? '[Basefolder]' : '[Basefolder]' + subfolder;
            lab.setAttribute('value', folder);
        }
        else {
            lab.setAttribute('value', 'No');
        }
    },

    // =================================== //
    // FUNCTIONS: GET FILE- & FOLDER NAME  //
    // =================================== //

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

    // filename.substr(filename.lastIndexOf('.') + 1)
    getFiletype: function(filename) {
        if (typeof filename != 'string') throw('getFiletype: Not a string.')
        var pos = filename.lastIndexOf('.');
        return pos == -1 ? '' : filename.substr(pos + 1);
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
        var filetype = this.getFiletype(filename).toLowerCase(),
            regex = this.prefs.getCharPref("filetypes").toLowerCase().replace(/,/gi,"|");
        // return value
        return filetype.search(new RegExp(regex))>=0 ? true : false;
    },

    completePath: function(location,filename) {
        var path = location.charAt(location.length-1)==this.folderSep ? location + filename : location + this.folderSep + filename;
        return this.normalize_path(path);
    },

    addSuffix: function(filename,k) {
        var temp = [];
        // If filename includes an extension split on last dot
        // otherwise keep the filename untouched and add "k"
        // Fixes GitHub issue #171
        var i = filename.lastIndexOf('.');
        if (i === -1) {
          temp = filename;
        } else {
          temp = filename.slice(0, i);
        }
        return(temp + "_" + k + "." + this.getFiletype(filename));
    },

    getFilename: function(item, current_filename, rename_format) {
        // check function arguments
        if (!item.isRegularItem()) throw('getFilename: Not regular zotero item.');
        // check whether renaming is disabled
        if(this.prefs.getBoolPref("disable_renaming")) return(current_filename);
        // rename format
        var filename = "",
            item_type =  item.getType(),
            rename_format_default = item_type == 19 ? this.prefs.getCharPref("renameFormat_patent") : this.prefs.getCharPref("renameFormat");
        rename_format = typeof rename_format !== 'undefined' ? rename_format : rename_format_default;
        // create the new filename from the selected item
        if (!this.prefs.getBoolPref("useZoteroToRename")) {
            filename = this.Wildcards.replaceWildcard(item, rename_format);
            // Strip potentially invalid characters
            // (code line adopted from Zotero, modified to accept periods)
            filename = filename.replace(/[\/\\\?\*:|"<>]/g, '');
            // replace multiple blanks in filename with single blank & remove whitespace
            filename = Zotero.Utilities.trimInternal(filename);
            // remove periods
            if (this.prefs.getBoolPref("removePeriods")) filename = filename.replace(/\./g, '');
            // replace blanks with '_'
            if (this.prefs.getBoolPref("replace_blanks"))  filename = filename.replace(/ /g, '_');
            // set to lower case
            if (this.prefs.getBoolPref("lower_case")) filename = filename.toLowerCase();
            // remove all the accents and other strange characters from filename
            if (Zotero.version[0] >= 3 && this.prefs.getBoolPref("removeDiacritics"))
                filename = Zotero.Utilities.removeDiacritics(filename);
        }
        // Use Zotero to get filename
        if (this.prefs.getBoolPref("useZoteroToRename")) filename = Zotero.Attachments.getFileBaseNameFromItem(item.itemID);
        // Add user input to filename
        if(this.prefs.getBoolPref("userInput")) filename = this.addUserInput(filename, current_filename);
        // add filetype to filename
        var filetype = this.getFiletype(current_filename);
        if(filetype != '') filename = filename + "." + filetype;
        // valid zotero name
        filename = Zotero.File.getValidFileName(filename);
        // return
        return(filename);
    },

    getLocation: function(zitem, dest_dir,subfolder, rule) {
        var subfolderFormat="";
        if(subfolder) {
            // get subfolder
            subfolderFormat=this.Wildcards.replaceWildcard(zitem, rule);
            // correct for missing fields
            if (!Zotero.isWin) subfolderFormat=subfolderFormat.replace('//','/undefined/');
            if ( Zotero.isWin) subfolderFormat=subfolderFormat.replace('\\\\','\\undefined\\');
            // replace invalid characters
            subfolderFormat = subfolderFormat.split(this.folderSep);
            for (var i = 0; i < subfolderFormat.length; i++) {
                if(subfolderFormat[i]!=="") subfolderFormat[i] = Zotero.File.getValidFileName(subfolderFormat[i]);
            }
            subfolderFormat = subfolderFormat.join(this.folderSep);
        }
        // complete folder and return
        dest_dir = (dest_dir.substr(-1)!=this.folderSep) ? dest_dir : dest_dir.substr(0,dest_dir.length-1);
        var folder = dest_dir + this.folderSep + subfolderFormat;
        return(folder);
    },

    // ================ //
    // FUNCTIONS: FILES //
    // ================ //

    createFile: function(path) {
        try {
            var file = Components.classes["@mozilla.org/file/local;1"].
                createInstance(Components.interfaces.nsIFile);
                file.initWithPath(path);
            return(file);
        }
        catch (err) {
            return(-1);
        }
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

    // function to check whether a file exists
    // argument: path as string (with optional filename), zotero att, or file obj
    fileExists: function  (arg, filename) {
        var file;
        // when undefined
        if (arg===undefined)
            return(false);
        // when string is passed
        if(typeof(arg)=='string') {
            if(filename!=null) arg=this.completePath(arg,filename);
            file=this.createFile(arg);
        }
        // when object (i.e. zotero attachment item) is passed
        if(typeof(arg)=='object') {
            if( arg.getFile) file=arg.getFile();
            if(!arg.getFile) file=arg;
        }

        // check whether the file exsists
        try {
            return(file.exists());
        }
        catch (err) {
            return(false);
        }
    },

    moveFile: function(file, destination, filename, att_name){
        /* moves 'file' to 'destination' path an renames it to 'filename'; 'att_name' is the attachment title used in error messages
        * -> returns the path to the new (created) file, in case of an error returns false
        */

        //if the destination is only "/" or "\" then destination should be the file's parent directory
        if(destination.trim() == this.folderSep) {
            if(file.isFile())                   
                destination = file.parent.path;
            else
                destination = file.path; //if file is a directory then destination should be that directory
        }

        if(file.path == this.completePath(destination,filename))
            return(file.path);

        var filename_temp = filename;
        var original_filename = file.path;
        var k = 2;
        while(this.fileExists(destination, filename_temp)) {
            filename_temp = this.addSuffix(filename,k);
            k++;
            if(k>999) break;
            //TODO There should be a prompt window which let the user choose a name
            // If not, it would create an error like file exists or more severe: it will override the existing file
        }
        filename = filename_temp;

        // move file to new location
        try {
            if(destination.trim() == this.folderSep) {
                //no place to move the file, so rename it in-place
                this.infoWindow(this.ZFgetString('general.warning'), 'Custom location for files not set. File is renamed only.');
                file.moveTo(null, filename);
            }
            else {
                // create a nslFile Object of the destination folder
                var dir = this.createFile(destination);
                file.moveTo(dir, filename);
            }
        }
        catch(err) {
            if(err.name == "NS_ERROR_FILE_IS_LOCKED")
                this.messages_error.push(this.ZFgetString('error.movingFileLocked', [att_name]));
            else
                this.messages_error.push(this.ZFgetString('error.movingFileGeneral', [att_name, err]));
            return false;
        }

        // If after moving we leave behind empty folders, try to remove them
        var original_dir = this.createFile(OS.Path.dirname(original_filename));
        this.removeEmptyFolders(original_dir);

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
            var newfile_path = this.moveFile(file, location, filename, att.getDisplayTitle());
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
                filename_temp = this.addSuffix(filename,k);
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
        base_folders = base_folders.map(this.normalize_path);
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

    // ============================== //
    // FUNCTIONS: ATTACHING NEW FILES //
    // ============================== //

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
        var newAttID = this.renameAttachment(item, att, true, this.prefs.getBoolPref("import"), this.prefs.getComplexValue("dest_dir", Components.interfaces.nsISupportsString).data, this.prefs.getBoolPref("subfolder"), this.prefs.getCharPref("subfolderFormat"), false);
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


    // ============================ //
    // FUNCTIONS: TABLET FUNCTIONS //
    // =========================== //

    // https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/DOM_Building_and_HTML_Insertion#Safely_Using_Remote_HTML
    /**
     * Safely parse an HTML fragment, removing any executable
     * JavaScript, and return a document fragment.
     *
     * @param {Document} doc The document in which to create the
     *     returned DOM tree.
     * @param {string} html The HTML fragment to parse.
     * @param {boolean} allowStyle If true, allow <style> nodes and
     *     style attributes in the parsed fragment. Gecko 14+ only.
     * @param {nsIURI} baseURI The base URI relative to which resource
     *     URLs should be processed. Note that this will not work for
     *     XML fragments.
     * @param {boolean} isXML If true, parse the fragment as XML.
     */
    parseHTML: function(html) {
        var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                        .getService(Components.interfaces.nsIIOService);
        var allowStyle = true,
            baseURI = ioService.newURI(this.xhtml, null, null),
            isXML = false,
            PARSER_UTILS = "@mozilla.org/parserutils;1";

        // User the newer nsIParserUtils on versions that support it.
        if (PARSER_UTILS in Components.classes) {
            var parser = Components.classes[PARSER_UTILS]
                                   .getService(Components.interfaces.nsIParserUtils);
            if ("parseFragment" in parser)
                return parser.parseFragment(html, allowStyle ? parser.SanitizerAllowStyle : 0,
                                            !!isXML, baseURI, document.documentElement);
        }

        return Components.classes["@mozilla.org/feed-unescapehtml;1"]
                         .getService(Components.interfaces.nsIScriptableUnescapeHTML)
                         .parseFragment(html, !!isXML, baseURI, document.documentElement);
    },

    clearInfo: function (att) {
        try {
            var win = this.wm.getMostRecentWindow("navigator:browser"),
                content = att.getNote().replace(/zotero:\/\//g, 'http://zotfile.com/'),
                fragment = this.parseHTML(content),
                note = win.document.createElementNS(this.xhtml, 'div');
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
    },

    getInfo: function (att, key) {
        var win = this.wm.getMostRecentWindow("navigator:browser"),
            note = win.document.createElementNS(this.xhtml, 'div'),
            content = att.getNote(),
            value;
        try {
            try {
                note.appendChild(this.parseHTML(content));
            }
            catch(e) {
                var match = content.match(/<p id="zotfile-data".+<\/p>/);
                if (match===null)
                    match = content.match(/lastmod{.+}/);
                if (match===null)
                    return '';
                note.appendChild(this.parseHTML(match[0]));
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
            if(key=="location") value = value.replace("[BaseFolder]",this.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data);
            // for location tag: correct window/mac file system
            if(key=="location" && Zotero.isWin) value = value.replace(/\//g, '\\');
            if(key=="location" && (Zotero.isMac || Zotero.isLinux)) value = value.replace(/\\/g, '/');
            // return
            return(value);
        }
        catch (err) {
            return '';
        }
    },

    addInfo: function(att, key, value) {
        // get current content of note
        var win = this.wm.getMostRecentWindow("navigator:browser"),
            content = att.getNote().replace(/zotero:\/\//g, 'http://zotfile.com/'),
            note = win.document.createElementNS(this.xhtml, 'div'),
            data = {};
        try {
            note.appendChild(this.parseHTML(content));
        }
        catch (e){
            var match = content.match(/<p id="zotfile-data".+<\/p>/);
            if (match!==null)
                note.appendChild(this.parseHTML(match[0]));
        }
        // for location tag: replace destination folder with [BaseFolder]
        if(key=="location" && this.prefs.getBoolPref("tablet.dest_dir_relativePath"))
            value = value.replace(this.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data,"[BaseFolder]");
        // get zotfile element
        var p = note.querySelector("#zotfile-data");
        // doesn't exists...
        if (p===null) {
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
    },

    getTabletStatus: function(att) {
        if(att) {
            var tagIDs = [Zotero.Tags.getID(this.tag,0), Zotero.Tags.getID(this.tagMod,0)];
            return(att.isAttachment() && att.hasTags(tagIDs));
        }
        return(false);
    },


    getTabletStatusModified: function(item) {
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
    },

    showTabletFile: function() {
        var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser"),
            att = win.ZoteroPane.getSelectedItems()[0],
            tablet = Zotero.ZotFile.getTabletStatus(att);
        if(!tablet)
            return;
        var file = Zotero.ZotFile.getTabletFile(att);
        if(!file.exists())
            return;
        file.reveal();
    },

    openTabletFile: function() {
        var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser"),
            att = win.ZoteroPane.getSelectedItems()[0],
            tablet = Zotero.ZotFile.getTabletStatus(att);
        if(!tablet)
            return;
        var file = Zotero.ZotFile.getTabletFile(att);
        if(!file.exists())
            return;
        Zotero.launchFile(file);
    },

    getTabletFile: function(att, verbose) {
        var verbose = typeof verbose !== 'undefined' ?  verbose : true;
        try {
            // get file depending on mode
            if(this.getInfo(att, "mode")==1) {
                var loc = this.getInfo(att, "location");
                if(!this.fileExists(loc)) {
                    if (verbose)
                        this.infoWindow('ZotFile Error', 'The file "' + loc + '" does not exist.');
                    return(false);
                }
                return(this.createFile(loc));
            }
            else {
                return(att.getFile());
            }
        }
        catch (err) {
            return(false);
        }
    },

    getTabletLocationFile: function(subfolder) {
        if(subfolder==null) subfolder="";
        return(this.createFile(this.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data+subfolder));
    },

    getAttachmentsOnTablet: function(subfolder) {
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
                    this.infoWindow(this.ZFgetString('general.warning'),this.ZFgetString('tablet.attachmentNoteMissing') + ' (' + item.key + ')');
                if(this.getInfo(item,"mode")!="") {
                    if(subfolder===undefined) atts.push(item);
                    if(subfolder!==undefined) if(this.getInfo(item,"projectFolder").toLowerCase()==subfolder.toLowerCase()) atts.push(item);
                }
            }
        }
        // return attachments
        return(atts);
    },

    getModifiedAttachmentsOnTablet: function (subfolder) {
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
    },

    setTabletFolder:function (items,projectFolder) {
        for (var i=0; i < items.length; i++) {
            try {
                var item = items[i];
                if(item.getSource()) {

                    // get parent item
                    var parent=Zotero.Items.get(item.getSource());

                    // first pull if background mode
                    var att_mode=this.getInfo(item,"mode");
                    if(att_mode==1 || att_mode!=this.prefs.getIntPref("tablet.mode")) {
                        var itemID = this.getAttachmentFromTablet(parent, item, true).id;
                        item = Zotero.Items.get(itemID);
                    }
                    // now push
                    if(parent.isRegularItem()) {
                        if(projectFolder!==null) this.sendAttachmentToTablet(parent,item,projectFolder,false);
                        if(projectFolder===null) this.sendAttachmentToTablet(parent,item,this.getInfo(item,"projectFolder"),false);
                        this.messages_report.push("'" + item.getField("title") + "'");
                    }
                }
            }
            catch(e) {
                this.messages_fatalError.push(e);
            }
        }
        // show messages and handle errors
        var mess_loc=(projectFolder!=="" && projectFolder!==null) ? ("'..." + projectFolder + "'.") : this.ZFgetString('tablet.baseFolder');
        this.showReportMessages(this.ZFgetString('tablet.movedAttachments', [mess_loc]));
        this.handleErrors();
    },

    checkSelectedSearch: function() {
        // get selected saved search
        var win = this.wm.getMostRecentWindow("navigator:browser");
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
    },

    updateModifiedAttachmentsSearch: function(event) {
        var zz = Zotero.ZotFile;
        // update saved search only if 'tablet files (modified)' saved search is selected
        if(zz.checkSelectedSearch()) {
            var atts = zz.getModifiedAttachmentsOnTablet();
            // add tag for modified tablet item and remove tablet tag
            for (var j=0; j < atts.length; j++) zz.addTabletTag(atts[j], zz.tagMod);
        }
    },

    restrictTabletSearch: function(which) {
        // get selected saved search
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var savedSearch = win.ZoteroPane.getSelectedSavedSearch();
        // get subfolders
        var subfolders = JSON.parse(this.prefs.getCharPref("tablet.subfolders"));
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
                var win = this.wm.getMostRecentWindow("navigator:browser");
                win.ZoteroPane.onCollectionSelected();
            });
        }
    },

    sendAttachmentToTablet: function(item, att, projectFolder, verbose) {
        verbose = (typeof verbose == 'undefined') ? true : verbose;
        var newFile,
            file = att.getFile(),
            tagID = Zotero.Tags.getID(this.tag,0),
            tagIDMod = Zotero.Tags.getID(this.tagMod,0),
            tablet_status = this.getTabletStatus(att);
        // settings
        var tablet_mode = this.prefs.getIntPref("tablet.mode"),
            tablet_rename = this.prefs.getBoolPref("tablet.rename"),
            tablet_dest = this.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data+projectFolder,
            tablet_subfolder = this.prefs.getBoolPref("tablet.subfolder"),
            tablet_subfolderFormat = this.prefs.getCharPref("tablet.subfolderFormat");

        if(!this.fileExists(att) || !this.checkFileType(att))
            return false;

        // background mode: Rename and Move Attachment
        if(tablet_mode==1) {
            // change name of file
            if (tablet_rename)  {
                var filename=this.getFilename(item,file.leafName);
                if(filename!=file.leafName) {
                    att.renameAttachmentFile(filename);
                    att.setField('title', filename);
                    att.save();
                    file = att.getFile();
                }
            }
            // create copy of file on tablet and catch errors
            var folder = this.getLocation(item, tablet_dest, tablet_subfolder, tablet_subfolderFormat);
            if (!tablet_status)
                newFile = this.copyFile(file, folder, file.leafName);
            else {
                var tablet_file = this.getTabletFile(att);
                if(tablet_file.exists()) {
                    var path = this.moveFile(tablet_file, folder, file.leafName);
                    newFile = this.createFile(path);
                }
                else {
                    this.infoWindow('ZotFile Warning', 'File on tablet not found. Zotfile is creating a new copy on tablet.');
                    newFile = this.copyFile(file, folder, file.leafName);
                }
            }
        }
        // foreground mode: Rename and Move Attachment
        if(tablet_mode==2) {
            var newAttID = this.renameAttachment(item, att, tablet_rename, false, tablet_dest, tablet_subfolder, tablet_subfolderFormat, false);
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
            if (this.prefs.getBoolPref("tablet.tagParentPush")) item.addTag(this.prefs.getCharPref("tablet.tagParentPush_tag"));
        }
        // notification
        if(verbose) this.messages_report.push("'" + newFile.leafName + "'");

        return att.id;
    },

    sendSelectedAttachmentsToTablet: function(idx_subfolder) {
        // get selected attachments
        var attIDs = this.getSelectedAttachments(true),
            atts = Zotero.Items.get(attIDs),
            attID, addDescription=false,
            // Check which attachments are already on the reader
            attOnReader = atts.map(this.getTabletStatus, Zotero.ZotFile),
            attOnReaderCount = attOnReader.reduce(function(pv, cv) { return pv + cv; }, 0),
            repush = !this.prefs.getBoolPref("tablet.confirmRepush");
        // get projectFolder
        var projectFolder = '';
        if (idx_subfolder!=-1) {
            if(this.prefs.getIntPref("tablet.projectFolders")==1)
                projectFolder = this.projectPath[idx_subfolder];
            if(this.prefs.getIntPref("tablet.projectFolders")==2) {
                var subfolders = JSON.parse(this.prefs.getCharPref("tablet.subfolders"));
                projectFolder = subfolders[idx_subfolder].path;
                // subfolders[idx_subfolder].label
            }
        }        
        // confirm
        if (this.prefs.getBoolPref("confirmation_batch_ask") &&
            attIDs.length>=this.prefs.getIntPref("confirmation_batch"))
                if(!confirm(this.ZFgetString('tablet.sendAttachments', [attIDs.length])))
                    return;
        if (!repush && attOnReaderCount>0)
            repush = confirm(this.ZFgetString('tablet.replaceAttachAlready', [attOnReaderCount]));
        if (!repush && attOnReaderCount==attIDs.length) {
            this.handleErrors();
            return;
        }
        // show infoWindow
        var progressWin = this.progressWindow(this.ZFgetString('tablet.AttsMoved'));
        // iterate through attachments
        for (i=0; i < attIDs.length; i++) {
            if(attOnReader[i] && !repush)
                continue;
            var att = atts[i],
                attProgress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title'));
            try {
                if(!this.fileExists(att) || att.isTopLevelItem()) {
                    addDescription = true;
                    attProgress.setError();
                    continue;
                }
                var item = Zotero.Items.get(att.getSource()),
                    att_mode = this.getInfo(att,"mode");
                // First remove from tablet if mode has changed
                if(attOnReader[i] && att_mode!=this.prefs.getIntPref("tablet.mode")) {
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
                this.messages_fatalError.push(e);
            }
        }
        // show messages and handle errors
        /*if(projectFolder!=='')
            progressWin.addDescription('Subfolder: ...' + projectFolder);*/
        if(addDescription)
            progressWin.addDescription(this.ZFgetString('general.warning.skippedAtt.msg'));
        progressWin.startCloseTimer(this.prefs.getIntPref("info_window_duration"));
        this.handleErrors();
    },

    updateSelectedTabletAttachments: function () {
        // get selected attachments
        var itemIDs = this.getSelectedAttachments();
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
                    if (this.prefs.getBoolPref("tablet.updateExtractAnnotations")) this.pdfAnnotations.getAnnotations([newAttID]);

                    // show message
                    this.messages_report.push("'" + filename + "'");
                }
            }
            catch(e) {
                this.messages_fatalError.push(e);
            }
        }

        // show messages and handle errors
        this.showWarningMessages(this.ZFgetString('general.warning.skippedAtt'),this.ZFgetString('general.warning.skippedAtt.msg'));
        this.showReportMessages(this.ZFgetString('tablet.AttsSynced'));
        this.handleErrors();
    },

    getAttachmentFromTablet: function (item, att, fakeRemove) {
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
        var time_reader = this.fileExists(file_reader) ? parseInt(file_reader.lastModifiedTime+"",10) : 0;
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
                if (!this.prefs.getBoolPref("tablet.storeCopyOfFile")) {
                    // prompt if both file have been modified
                    if (option==1) {
                        option=this.promptUser(this.ZFgetString('tablet.fileConflict', [file_zotero.leafName]),
                            this.ZFgetString('tablet.fileConflict.replaceZ'),
                            this.ZFgetString('general.cancel'),
                            this.ZFgetString('tablet.fileConflict.removeT'));
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
                if (this.prefs.getBoolPref("tablet.storeCopyOfFile"))  {
                    // only if reader file was modified
                    if(option!=2) {
                        var filename=this.addSuffix(file_zotero.leafName,this.prefs.getCharPref("tablet.storeCopyOfFile_suffix"));

                        //add linked attachment
                        if (!item.libraryID && !this.prefs.getBoolPref("import")) {
                            file_reader.moveTo(file_zotero.parent,filename);
                            attID=Zotero.Attachments.linkFromFile(file_reader, item.itemID,item.libraryID);
                            itemPulled=true;
                        }
                        //imports attachment
                        if (item.libraryID || this.prefs.getBoolPref("import")) {
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
                    this.removeFile(file_reader);
                    itemPulled=true;
                }
            }
        }
        // foreground mode
        if(att_mode==2) {
            // add parent key to array for excluded items from auto rename
            this.excludeAutorenameKeys.push(item.key);
            // get note content
            var note = att.getNote();
            // rename and move attachment
            attID = this.renameAttachment(item, att, this.prefs.getBoolPref("tablet.rename"), this.prefs.getBoolPref("import"), this.prefs.getComplexValue("dest_dir", Components.interfaces.nsISupportsString).data, this.prefs.getBoolPref("subfolder"), this.prefs.getCharPref("subfolderFormat"), false);
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
        if(!folder.equals(this.createFile(this.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data)))
            this.removeFile(folder);

        // post-processing if attachment has been removed & it's not a fake-pull
        var extract = false;
        if (itemPulled && !fakeRemove) {
            // remove tag from attachment and parent item
            this.removeTabletTag(att, this.tag);
            // clear attachment note
            this.clearInfo(att);
            // extract annotations from attachment and add note
            extract = this.prefs.getBoolPref("pdfExtraction.Pull") && option!=2;
            // remove tag from parent item
            var tagParent=Zotero.Tags.getID(this.prefs.getCharPref("tablet.tagParentPush_tag"),0);
            if(item.hasTag(tagParent)) item.removeTag(tagParent);
            // add tag to parent item
            if (this.prefs.getBoolPref("tablet.tagParentPull")) item.addTag(this.prefs.getCharPref("tablet.tagParentPull_tag"));
            // notification (display a different message when the attachments have been deleted from tablet without being sent back to Zotero)
			if (attsDeleted === true) {
				this.messages_report.push("'" + att.getFile().leafName + "' " + this.ZFgetString('tablet.attsDel'));
			}
			else {
				this.messages_report.push("'" + att.getFile().leafName + "'");
			}
        }
        // remove modified tag from attachment
        if (itemPulled) this.removeTabletTag(att, this.tagMod);

        // return new id
        return({'id': attID, 'att': Zotero.Items.get(attID), 'extract': extract});
    },

    // removes item tag only if no child item has that tag
    removeItemTag: function(item, tag) {
        if(item.isRegularItem() && item.hasTag(tag)) {
            if(!Zotero.Items.get(item.getAttachments())
                .some(function(att) {return att.hasTag(tag);}))
                    item.removeTag(tag);
        }
    },

    // add tag to item and add item blacklist for event
    /*addTabletTag: function(item, tag) {
        var tagID = Zotero.Tags.getID(tag,0);
        if(item.hasTag(tagID)) return;
        this.blacklistTagAdd.push(item.id);
        item.addTag(tag);
    },*/

    addTabletTag: function(att, tag) {
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
    },

    removeTabletTag: function(att, tag) {
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
    },

    getSelectedAttachmentsFromTablet: function() {
        // get selected attachments, filter for tablet
        var atts = Zotero.Items.get(this.getSelectedAttachments()).filter(this.getTabletStatus, Zotero.ZotFile),
            attExtract = [];
        // confirm
        if (this.prefs.getBoolPref("confirmation_batch_ask") && atts.length>=this.prefs.getIntPref("confirmation_batch"))
            if(!confirm(this.ZFgetString('tablet.getAttachments', [atts.length])))
                return;
        // show infoWindow
        var progressWin = this.progressWindow(this.ZFgetString('tablet.AttsGot'));
        // iterate through attachments
        for (var i=0; i < atts.length; i++) {
            var att = atts[i],
                attProgress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title'));
            try {
                // get attachment and item object
                var item = Zotero.Items.get(att.getSource());
                // get attachment from tablet
                var attGet = Zotero.ZotFile.getAttachmentFromTablet(item,att,false);
                // update progress window
                attProgress.complete(attGet.att.getFilename(), attGet.att.getImageSrc());
                // extract annotations
                if(attGet.extract)
                    attExtract.push(attGet.id);
            }
            catch(e) {
                attProgress.setError();
                this.messages_fatalError.push('Error: ' + e);
            }
        }
        // show messages and handle errors
        progressWin.startCloseTimer(this.prefs.getIntPref("info_window_duration"));
        this.handleErrors();
        // extract annotations
        if(attExtract.length>0)
            this.pdfAnnotations.getAnnotations(attExtract);
    },


    // ============================= //
    // FUNCTIONS: RENAME ATTACHMENTS //
    // ============================ //

    // Rename & Move Existing Attachments
    renameAttachment: function(item, att, rename, import_att, dest_dir, subfolder, subfolderFormat, notification) {
        var attID = att.id,
            newAttID = attID,
            note = att.getNote(),
            tags = att.getTags(),
            linkmode = att.attachmentLinkMode,
            itemID = item.id,
            file = att.getFile(),
            path = file.path;
        if(tags.length>0) for (var j=0; j < tags.length; j++) tags[j]= tags[j]._get('name');
        // only proceed if linked or imported attachment
        if(!att.isImportedAttachment() && !linkmode==Zotero.Attachments.LINK_MODE_LINKED_FILE)
            return attID;
        // create file name using ZotFile rules
        var filename = rename ? Zotero.ZotFile.getFilename(item, file.leafName) : file.leafName,
            location = this.getLocation(item,dest_dir,subfolder,subfolderFormat);
        // (a) LINKED TO IMPORTED ATTACHMENT
        if (linkmode==Zotero.Attachments.LINK_MODE_LINKED_FILE && import_att) {                
            try {
                var win = this.wm.getMostRecentWindow("navigator:browser"),
                    selection = win.ZoteroPane.itemsView.saveSelection();
                // Attach file to selected Zotero item
                newAttID = Zotero.Attachments.importFromFile(file, itemID, item.libraryID);
                // remove file from hard-drive
                file.remove(false);
                // erase old attachment
                att.erase();
                // create new attachment object
                att = Zotero.Items.get(newAttID);
                // rename file associated with attachment
                att.renameAttachmentFile(filename);
                // change title of attachment item
                att.setField('title', filename);
                if(note!="") att.setNote(note);
                if(tags) for each(var tag in tags) att.addTag(tag);
                att.save();
                // restore selection
                selection = this.arrayReplace(selection, attID, newAttID);
                if(Zotero.version>="3") win.ZoteroPane.itemsView.selectItems(selection);
            }
            catch (e){
                var msg = "Failed renaming file " + file.path;
                Components.utils.reportError(msg);
                // cleanup
                try {
                    var itemDir = Zotero.Attachments.getStorageDirectory(attID);
                    if (itemDir.exists()) {
                        itemDir.remove(true);
                    }
                }
                catch (e) {}
            }
            // notification and return
            if(notification) this.messages_report.push(this.ZFgetString('renaming.imported', [filename]));
            return newAttID;
        }
        // (b) IMPORTED TO IMPORTED ATTACHMENT
        if ((att.isImportedAttachment() && import_att) || item.libraryID) {
            // rename file associated with attachment
            att.renameAttachmentFile(filename);
            // change title of attachment item
            att.setField('title', filename);
            att.save();
            // notification and return
            if (linkmode!=Zotero.Attachments.LINK_MODE_LINKED_FILE && notification)
                this.messages_report.push(this.ZFgetString('renaming.imported', [filename]));
            return attID;
        }
        // (c) IMPORTED TO LINKED ATTACHMENT (only if library is local and not cloud)
        if (att.isImportedAttachment() && !import_att && !item.libraryID) {
            var win = this.wm.getMostRecentWindow("navigator:browser"),
                selection = win.ZoteroPane.itemsView.saveSelection();
            // move pdf file
            var newfile_path = this.moveFile(file, location, filename, att.getDisplayTitle());
            if (!newfile_path) 
                return newAttID;
            // recreate the outfile nslFile Object
            file = this.createFile(newfile_path);
            // create linked attachment
            newAttID = Zotero.Attachments.linkFromFile(file, itemID, item.libraryID);
            // erase old attachment
            att.erase();
            // create new attachment object
            att = Zotero.Items.get(newAttID);
            // rename file associated with attachment
            att.renameAttachmentFile(filename);
            // change title of attachment item
            att.setField('title', filename);
            if(note!="") att.setNote(note);
            if(tags) for each(var tag in tags) att.addTag(tag);
            att.save();
            // restore selection
            selection = this.arrayReplace(selection, attID, newAttID);
            if(Zotero.version>="3") win.ZoteroPane.itemsView.selectItems(selection);
            // notification and return
            if(notification) this.messages_report.push(this.ZFgetString('renaming.linked', [filename]));
            return newAttID;
        }
        // (d) LINKED TO LINKED ATTACHMENT (only if library is local and not cloud)
        if (!att.isImportedAttachment() && !import_att && !item.libraryID) {
            // relink attachment
            this.moveLinkedAttachmentFile(att, location, filename, false);
            // notification
            if(notification) this.messages_report.push(this.ZFgetString('renaming.linked', [filename]));
            return attID;
        }
        // return id of attachment
        return attID;
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
        var progressWin = this.progressWindow(this.ZFgetString('renaming.renamed'));
        // settings
        var imported = this.prefs.getBoolPref("import"),
            dest_dir = this.prefs.getComplexValue("dest_dir", Components.interfaces.nsISupportsString).data,
            subfolder = this.prefs.getBoolPref("subfolder"),
            subfolderFormat = this.prefs.getCharPref("subfolderFormat"),
            addDescription = false;
        // rename attachments
        for (var i=0; i < attIDs.length; i++) {
            // get attachment and add line to infoWindow
            var att = Zotero.Items.get(attIDs[i]),
                attProgress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title'));
            try {
                // Rename and Move Attachment
                if(this.fileExists(att) && !att.isTopLevelItem() && !this.getTabletStatus(att)) {
                    var item = Zotero.Items.get(att.getSource()),
                        file = att.getFile();
                    // move & rename
                    var attID = this.renameAttachment(item, att, true, imported, dest_dir, subfolder, subfolderFormat, false);
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
    },

    getPDFReader: function() {
        var wrk = Components.classes["@mozilla.org/windows-registry-key;1"]
                            .createInstance(Components.interfaces.nsIWindowsRegKey);

        //get handler for PDFs
        var tryKeys = [
        	{
        		root: wrk.ROOT_KEY_CURRENT_USER,
        		path: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoice',
        		value: 'Progid'
        	},
        	{
        		root: wrk.ROOT_KEY_CLASSES_ROOT,
        		path: '.pdf',
        		value: ''
        	}
        ];
        var progId;
        for(var i=0; !progId && i<tryKeys.length; i++) {
            try {
                wrk.open(tryKeys[i].root,
                     tryKeys[i].path,
                     wrk.ACCESS_READ);
                progId = wrk.readStringValue(tryKeys[i].value);
            } catch(e) {}
        }

        if(!progId) {
        	wrk.close();
        	return;
        }
        
        //get version specific handler, if it exists
        try {
            wrk.open(wrk.ROOT_KEY_CLASSES_ROOT,
                progId + '\\CurVer',
                wrk.ACCESS_READ);
            progId = wrk.readStringValue('') || progId;
        } catch(e) {}

        //get command
        var success = false;
        tryKeys = [
        	progId + '\\shell\\Read\\command',
        	progId + '\\shell\\Open\\command'
        ];
        for(var i=0; !success && i<tryKeys.length; i++) {
            try {
                wrk.open(wrk.ROOT_KEY_CLASSES_ROOT,
                     tryKeys[i],
                     wrk.ACCESS_READ);
                success = true;
            } catch(e) {}
        }

        if(!success) {
        	wrk.close();
        	return;
        }

        var command = wrk.readStringValue('').match(/^(?:".+?"|[^"]\S+)/);
        
        wrk.close();
        
        if(!command) return;
        return command[0].replace(/"/g, '');
    }
};
