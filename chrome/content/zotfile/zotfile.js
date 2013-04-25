
/**
ZotFile: Zotero plugin to manage your attachments
Joscha Legewie

Zotfile is a Zotero plugin to manage your attachments: 
automatically rename, move, and attach PDFs (or other files)
to Zotero items, sync PDFs from your Zotero library to your (mobile)
PDF reader (e.g. an iPad, Android tablet, etc.) and extract
annotations from PDF files.

Webpage: http://www.jlegewie.com/zotfile.html
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
    zotfileURL:"http://www.jlegewie.com/zotfile.html",
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


    // ========================= //
    // FUNCTIONS: INIT FUNCTIONS //
    // ========================= //
    
    versionChanges: function (currentVersion) {
        // open webpage
        if(this.prefs.getCharPref("version")==="" || currentVersion=="2.0") {
            if(!Zotero.isStandalone) this.futureRun(function(){gBrowser.selectedTab = gBrowser.addTab(Zotero.ZotFile.zotfileURL); });
            if( Zotero.isStandalone) this.futureRun(function(){ZoteroPane_Local.loadURI(Zotero.ZotFile.zotfileURL); });
        }
        // open webpage with changelog
        if(this.prefs.getCharPref("version")!=="" && currentVersion=="2.3") {
            if(!Zotero.isStandalone) this.futureRun(function(){gBrowser.selectedTab = gBrowser.addTab("http://www.columbia.edu/~jpl2136/zotfile.html#changelog"); });
            if( Zotero.isStandalone) this.futureRun(function(){ZoteroPane_Local.loadURI("http://www.columbia.edu/~jpl2136/zotfile.html#changelog"); });
        }
        // version 3
        // - add tags to parent items for attachments on tablet
        // - transfer project folder preferences to JSON format
        if(this.prefs.getCharPref("version")!=="" && currentVersion.indexOf('3')==0 &&
            !this.prefs.getBoolPref("zotfile3update")) {
            
            // change tablet tags
            var atts = this.getAttachmentsOnTablet();
            for (var j=0; j < atts.length; j++) {     
                // if attachment on tablet, add tag for modified tablet item and remove tablet tag
                if(!this.getTabletStatusModified(atts[j])) { 
                    this.addTabletTag(atts[j], this.tag); 
                }
                // attachment on tablet (modified)
                else { 
                    this.addTabletTag(atts[j], this.tagMod);
                }
            }
            // change saved searches
            var searches=Zotero.Searches.getAll();
            for(var i=0; i<searches.length;i++ ) {
                var conditions=searches[i].getSearchConditions();
                for(var j=1; j<conditions.length;j++ ) {
                    if(conditions[j].condition=="tag" && conditions[j].value=="_tablet") {
                        searches[i].updateCondition(conditions[j].id,'tag','contains','_tablet');
                        searches[i].save();
                    }
                }
            }
            // transfer project folder preferences to JSON format
            if(this.prefs.getCharPref("tablet.subfolders")=="[]") {
                var subfolders = [],
                    projectNr= new Array("01","02","03","04","05","06","07","08","09","10","11","12","13","14","15");
                for (i=0;i<this.projectMax;i++) {
                    var used = this.prefs.getBoolPref("tablet.projectFolders"+projectNr[i]);
                    var folder = this.prefs.getCharPref("tablet.projectFolders"+projectNr[i]+"_folder");
                    var label = this.prefs.getCharPref("tablet.projectFolders"+projectNr[i]+"_label");
                    if(used) subfolders.push({'label':label,'path':folder});
                }
                this.prefs.setCharPref("tablet.subfolders",JSON.stringify(subfolders));
            }
            // updated to version 3
            this.prefs.setBoolPref("zotfile3update", true);            
        }

        // add saved search and change tag when upgrading to 2.1
        if(currentVersion=="2.1" && this.prefs.getBoolPref("tablet")) {
            // create saved search for modified tablet items
            this.createSavedSearch("tablet_modified");

            if(Zotero.Tags.getID("_READ",0)!==false) {
                try {
                    // change tablet tag
                    Zotero.Tags.rename(Zotero.Tags.getID("_READ",0), "_tablet");

                    // show message
                    this.infoWindow(this.ZFgetString('general.warning'),this.ZFgetString('tablet.oldTagName'),8000);

                } catch (ex) {
                    alert("Warning: ZotFile has changed the tag for attachments on the tablet from '_READ' to '_tablet' but was unable to automatically change the existing tag. Please make the changes manually or ask for help in the zotfile thread on the zotero forum.");
                }
            }

            // change saved searches
            var searches=Zotero.Searches.getAll();
            for(var i=0; i<searches.length;i++ ) {
                var conditions=searches[i].getSearchConditions();
                for(var j=1; j<conditions.length;j++ ) {
                    if(conditions[j].condition=="tag" && conditions[j].value=="_READ") {
                        searches[i].updateCondition(conditions[j].id,'tag',conditions[j].operator,'_tablet');
                        searches[i].save();
                    }
                }
            }
        }
        
        // set current version
        this.prefs.setCharPref("version",currentVersion);

//      code for specific version upgrades
//      if(currentVersion=="2.1" && oldVersion!="2.1")

    },

    init: function () {

        // only do this stuff for the first run
        if(this.prefs===null) {
            //get preference objects
            this.prefs = Components.classes["@mozilla.org/preferences-service;1"].
                        getService(Components.interfaces.nsIPrefService);
            this.prefs = this.prefs.getBranch("extensions.zotfile.");

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

        // add event listener for automatically renaming attachments
        var notifierID = Zotero.Notifier.registerObserver(this.autoRename, ['item']);
        // add event listener for tablet tags 
        var notifierID = Zotero.Notifier.registerObserver(this.autoTablet, ['item-tag']);

        // Load zotero.js first
        Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
            .getService(Components.interfaces.mozIJSSubScriptLoader)
            .loadSubScript("chrome://zotfile/content/ProgressWindow.js", Zotero.ZotFile);

        
    },

	//Localization (borrowed from Zotero sourcecode)
	ZFgetString: function (name, params){
		this.stringsBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
			.getService(Components.interfaces.nsIStringBundleService)
			.createBundle("chrome://zotfile/locale/zotfile.properties");
		try {
			if (params != undefined){
				if (typeof params != 'object'){
					params = [params];
				}
				var l10n = this.stringsBundle.formatStringFromName(name, params, params.length);
			}
			else {
				var l10n = this.stringsBundle.GetStringFromName(name);
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
        var file=zz.getLastFileInFolder(source_dir)[0];
        if(file==-1 || file==-2) return;
        if (zz.lastModifiedFile===null) zz.lastModifiedFile=file.lastModifiedTime;
        // compare to last file
        if (file.lastModifiedTime!=zz.lastModifiedFile) {
            var on_confirm = function() {
                // get selected items
                var win = zz.wm.getMostRecentWindow("navigator:browser");
                var items = win.ZoteroPane.getSelectedItems();
                // continue if nothing is selected
                if(items.length==0) {
                    zz.infoWindow(zz.ZFgetString('general.error'),zz.ZFgetString('watchFolder.noRegularItem'));
                    return(false);
                }
                // get parent if attachment is selected                
                if (items[0].isAttachment()) {
                    var id_parent = items[0].getSource();
                    if(!id_parent) return(false);
                    item = Zotero.Items.get(id_parent);
                }
                else {
                    item = items[0];
                }
                // rename and attach if regular item or child attachment
                if(item.isRegularItem()) {
                    // attach file
                    zz.attachFile(item, file);
                    // show messages
                    zz.showReportMessages(zz.ZFgetString('general.newAttachmentAdded'));
                    zz.handleErrors();
                    // set lastModifiedFile variable to previous file
                    file=zz.getLastFileInFolder(source_dir)[0];
                    zz.lastModifiedFile=file.lastModifiedTime;
                }
                else zz.infoWindow(zz.ZFgetString('general.error'),zz.ZFgetString('watchFolder.noRegularItem'));
            };
            // ask user whether s/he wants to attach and rename the new file
            zz.infoWindow(zz.ZFgetString('watchFolder.newFile'),{lines:["'" + file.leafName + "'"],txt:zz.ZFgetString('watchFolder.clickRename')},zz.prefs.getIntPref("info_window_duration_clickable"),on_confirm);
            zz.lastModifiedFile=file.lastModifiedTime;
        }
    },

    // Callback implementing the notify() method to pass to the Notifier
    autoRename: {
        parent: this,
        notify: function(event, type, ids, extraData) {
            var zz = Zotero.ZotFile;
            // 'add item' event
            if (type == 'item' && event == 'add') {
                // get preference object
                var prefs = Zotero.ZotFile.prefs;
                var auto_rename = prefs.getIntPref("automatic_renaming");
                if (auto_rename==1) return;
                // Retrieve the added/modified items as Item objects
                var items = Zotero.Items.get(ids);
                setTimeout(function() {
                    // iterate through added attachments
                    for each(var item in items){
                        try {
                            // Is the item an attachment?
                            if(item.isAttachment()) {
                                // Is imported attachment?
                                if (item.isImportedAttachment()) {
                                    // get id and key
                                    var id = item.getID();
                                    var key = item.key;
                                    // try to get the file
                                    var file = item.getFile();
                                    // If you can't then it isn't a proper attachment so continue
                                    if(!file) continue;
                                    // If it's a HTML file then exit so we don't rename snapshorts
                                    if (Zotero.File.getExtension(file) == "html") continue;
                                    // check if attachment has parent item
                                    var id_parent = item.getSource();
                                    if(!id_parent) continue;
                                    // get parent item
                                    var parent = Zotero.Items.get(id_parent);
                                    // check whether key is excluded                                
                                    if(zz.excludeAutorenameKeys.indexOf(key)!=-1 || zz.excludeAutorenameKeys.indexOf(parent.key)!=-1) {                                        
                                        zz.removeFromArray(zz.excludeAutorenameKeys,parent.key);
                                        continue;
                                    }
                                    // skip if file already has correct filename
                                    var filename = item.getFilename().replace(/\.[^/.]+$/, "");
                                    //zz.infoWindow(zz.ZFgetString('general.report'),{lines:[zz.getFilename(parent,filename),filename]});
                                    if(filename.indexOf(zz.getFilename(parent,filename))==0) continue;
                                    // flag for notification
                                    var file_renamed=false;
                                    // function to rename attachments
                                    var on_confirm = function() {
                                        try {
                                            // Rename the file (linked attachment)
                                            if(!prefs.getBoolPref("import")) {
                                                // rename and move attachment
                                                var id_item = zz.renameAttachment(parent, item, true, prefs.getBoolPref("import"),prefs.getCharPref("dest_dir"), prefs.getBoolPref("subfolder"), prefs.getCharPref("subfolderFormat"), false);
                                                // set flag for notification
                                                file_renamed=true;
                                                // get new attachment file
                                                item = Zotero.Items.get(id_item);
                                            }

                                            // Rename the file (imported attachment)
                                            if(prefs.getBoolPref("import")) {
                                                // get filename
                                                var filename = zz.getFilename(parent, file.leafName);
                                                // check whether attachment already has the correct name
                                                if (filename!=file.leafName) {
                                                    // rename file associated with attachment
                                                    item.renameAttachmentFile(filename);
                                                    // change title of attachment item
                                                    item.setField('title', filename);
                                                    item.save();

                                                    file_renamed=true;
                                                }
                                            }

                                            // user notification
                                            if (file_renamed) {
                                                // get object of attached file
                                                file = item.getFile();                                
                                                // show zotfile report                                                
                                                zz.messages_report.push("'" + file.leafName + "'");
                                                // remove id from in progress array
                                                // var idx = zz.keys.indexOf(id);
                                                // if(idx!=-1) zz.keys.splice(idx,1);
                                            }
                                        }
                                        catch(e) {
                                            zz.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
                                        }
                                        // show messages and handle errors
                                        // zz.showWarningMessages(zz.ZFgetString('general.warning.skippedAtt'),zz.ZFgetString('general.warning.skippedAtt.msg'));
                                        zz.showReportMessages(zz.ZFgetString('general.newAttachmentRenamed'));
                                        zz.handleErrors();                                        
                                    }
                                    
                                    zz.excludeAutorenameKeys.push(key);
                                    // ask user
                                    if(auto_rename==2) {                                    
                                        zz.infoWindow(zz.ZFgetString('general.newAttachment'),{lines:["'" + file.leafName + "'"],txt:zz.ZFgetString('renaming.clickMoveRename')},prefs.getIntPref("info_window_duration_clickable"),on_confirm);
                                    }
                                    // ask user if item has other attachments
                                    if(auto_rename==3) {
                                        function checkAtt (id) {
                                            var att = Zotero.Items.get(id);
                                            return !(att._attachmentLinkMode == Zotero.Attachments.LINK_MODE_IMPORTED_URL && att._attachmentMIMEType != 'application/pdf');
                                        }
                                        var atts = parent.getAttachments().filter(checkAtt);
                                        
                                        if (atts.length>1)
                                            zz.infoWindow(zz.ZFgetString('general.newAttachment'),{lines:["'" + file.leafName + "'"],txt:zz.ZFgetString('renaming.clickMoveRename')},prefs.getIntPref("info_window_duration_clickable"),on_confirm);
                                        else
                                            on_confirm();
                                    }
                                    // just rename
                                    if(auto_rename==4) on_confirm();
                                }
                            }
                        } catch (e) {
                            zz.infoWindow(zz.ZFgetString('general.error'),zz.ZFgetString('renaming.renamingFailed'),8000);
                        }
                    }
                },100);
            }
        }
    },
    
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
            // filter list of changes
            }).filter(function(obj) {
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
            });
            // exit if no changes left...
            if(changes.length==0) return;
            // tag was added
            var tagModID = Zotero.Tags.getID(zz.tagMod, 0);
            if(type == 'item-tag' && event == 'add')
                // iterate through changes
                for (var i = 0; i < changes.length; i++) {
                    // tablet tag
                    if (changes[i].tag==zz.tag && changes[i].item.isRegularItem()) {
                        if(!changes[i].item.hasTag(tagModID)) {
                            zz.infoWindow('event','send all attachments to tablet', 8000);
                        }
                        else {
                            zz.infoWindow('event','remove attachments from tablet', 8000);
                        }                        
                    }
                    if (changes[i].tag==zz.tag && changes[i].item.isAttachment()) {
                        if(!changes[i].item.hasTag(tagModID)) {
                            zz.infoWindow('event','send attachment to tablet', 8000);
                        }
                        else {
                            zz.infoWindow('event','remove attachment from tablet', 8000);
                        }
                    }
                    // tablet modified tag
                }
            // tag was removed
            if (type == 'item-tag' && event == 'remove') 
                // iterate through changes
                for (var i = 0; i < changes.length; i++) {
                    // tablet tag
                    if (changes[i].tag==zz.tag && changes[i].item.isRegularItem()) {
                        zz.infoWindow('event','remove attachments from tablet', 8000);
                    }
                    if (changes[i].tag==zz.tag && changes[i].item.isAttachment()) {
                        zz.infoWindow('event','remove attachment from tablet', 8000);                        
                    }
                    // tablet modified tag
                    // zz.infoWindow('tag removed from attachment','{lines:obj}', 8000);
                }
/*
            // blacklistTagAdd
            // tag, parent item, not exclude list
            var itemIDs = ids.map(function(id) {return id.split('-')[0];}),
                tagIDs = ids.map(function(id) {return id.split('-')[1];}),
                tags = tagIDs.map(function(id) {return Zotero.Tags.getName(id);});
            // exit if no tablet tag
            if(tags.every(function(tag) {return tag.indexOf(zz.tag)==-1;})) return;
            // iterate through changes
            var obj = ['event: ' + event, 'type: ' + type, 'ids: ' + ids, 'extraData: ' + extraData];
            for (var i = 0; i < itemIDs.length; i++) {
                // adding tags
                if (tags[i].indexOf(zz.tag)!=-1 & type == 'item-tag' && event == 'add') {
                    var item = Zotero.Items.get(itemIDs[i]);
                    // regular item tagged
                    if (item.isRegularItem()) {
                        // check whether any attachment has tablet status
                        if(!Zotero.Items.get(item.getAttachments())
                            .some(function(att) {return zz.getTabletStatus(att);}))
                            zz.infoWindow('Tag all attachments',{lines:obj}, 8000);
                            // if not, send all attachments to tablet

                    }
                    if (item.isAttachment()) {
                        // get parent
                        var id_parent = item.getSource();
                        if(!id_parent) return;
                        var parent = Zotero.Items.get(id_parent);
                        // check whether on tablet
                        if(zz.getInfo(item, 'lastmod')=='')
                            zz.infoWindow('Tag this attachments',{lines:obj}, 8000);
                    }
                    // distunish between _tablet and _tablet_modified tag
                }
                // removing tags
                if (tags[i].indexOf(zz.tag)!=-1 & type == 'item-tag' && event == 'remove') {
                    var item = Zotero.Items.get(itemIDs[i]);
                    // regular item tagged
                    if (item.isRegularItem()) {
                        // check whether any attachment has tablet status
                        if(Zotero.Items.get(item.getAttachments())
                            .some(function(att) {return zz.getTabletStatus(att);}))
                            zz.infoWindow('remove all attachments',{lines:obj}, 8000);
                            // if not, send all attachments to tablet

                    }
                    if (item.isAttachment()) {
                        // get parent
                        var id_parent = item.getSource();
                        if(!id_parent) return;
                        var parent = Zotero.Items.get(id_parent);
                        // check whether on tablet
                        if(zz.getInfo(item, 'lastmod')!='')
                            zz.infoWindow('remove this attachments',{lines:obj}, 8000);
                    }                    
                }
            }
*/
            //Zotero.Tags.getID(zz.tag,0)
            
            // item-tag
            // add|remove
            // ids: 63-4
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

    getSelectedAttachments: function () {
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
                for (var j=0; j < attachments.length; j++) 
                    if (this.validAttachment(attachments[j])) attIDs.push(attachments[j]);
            }
            // attachment item that is not top level
            if(item.isAttachment()) 
                if (this.validAttachment(item)) attIDs.push(item.getID());
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
        if(this.messages_report.length>0) this.infoWindow(title,{lines:this.messages_report}, 8000);
        this.messages_report = [];
    },

    // show warnings messages
    showWarningMessages: function(title,txt){
        // default argument
        txt = typeof txt !== 'undefined' ? txt : "";
        // show warning messages
        if(this.messages_warning.length>0) this.infoWindow(title,{lines:this.messages_warning,txt:txt}, 8000);
        this.messages_warning = [];
    },

    handleErrors: function() {
        var errors = {lines:this.messages_error},
            on_click = null,
            duration = 8000;
        // fatal errors
        if(this.messages_fatalError.length>0) {
            duration = this.prefs.getIntPref("info_window_duration_clickable");
            errors.lines.push(this.ZFgetString('error.unknown'));
            errors.txt = this.ZFgetString('error.clickToCopy')
            // prepare error message for clipboard
            var errors_str=this.removeDuplicates(this.messages_fatalError).join("\n\n");
            on_click = function() {
                Zotero.ZotFile.copy2Clipboard(errors_str);
            }
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
        callback = typeof callback !== 'undefined' ? callback : null;
        time = typeof time !== 'undefined' ? time : 8000;
        // show window
        var pw = new (this.ProgressWindow);
        pw.changeHeadline(main);
        if (main=="error") pw.changeHeadline(Zotero.getString("general.errorHasOccurred"));

        if (typeof(message) == "object") {
            if (message.txt!==undefined) pw.addDescription(message.txt);
            for (i =0;i<message.lines.length;i++)
                pw.addLines(message.lines[i]);
        }
        else
            pw.addDescription(message);

        pw.show();
        pw.startCloseTimer(time);
        // add callback
        if (callback!==null) pw.addCallback(callback)
        // return window
        return(pw);
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
        // show subfolders
        subfolders.forEach(function(folder, i) {                
            // set attributes of menu item
            nodes[i].setAttribute('label', folder.label);
            nodes[i].setAttribute('tooltiptext', "Show items in '" + folder.path + "'");
            // this.ZFgetString('menu.sendAttToSubfolder',[folder.path])
            // show menu item
            nodes[i].setAttribute('hidden', false);
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

    buildZotFileMenu: function () {
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
            sep1: 3,
            warning2: 4,
            push2reader: 5,
            updatefile: 6,
            pullreader: 7,
            sep2: 8,
            tablet: 9,
            warning3: 10,
            subfolders:new Array(11,12,13,14,15,16,17,18,19,20,21,22,23,24,25),
            sep3: 26,
            menuConfigure: 27,
            length:28
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
        var dest_dir_valid=this.fileExists(this.prefs.getCharPref("tablet.dest_dir"));
//      if(this.prefs.getCharPref("tablet.dest_dir")!="") var dest_dir_valid=1;

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
                disable.push(m.rename, m.extractanno);
                show.push(m.sep1,m.warning2);
                menu.childNodes[m.warning2].setAttribute('label',this.ZFgetString('menu.itemHasNoAtts'));
                            
            }

            // add 'Extract annotations'
            if(this.prefs.getBoolPref("pdfExtraction.MenuItem")) show.push(m.extractanno);

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
                    menu.childNodes[m.push2reader].setAttribute('tooltiptext',this.ZFgetString('menu.sendAttToBaseFolder',[this.prefs.getCharPref("tablet.dest_dir")]));

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
    
    truncateTitle: function(title){
        
        // truncate title after : . and ?
        if(this.prefs.getBoolPref("truncate_title")) {
            var truncate = title.search(/:|\.|\?/);
            if(truncate!=-1) title = title.substr(0,truncate);
        }
    
        // truncate if to long
        var title_length =  title.length;
        if (title_length>this.prefs.getIntPref("max_titlelength")) {
            var max_titlelength=this.prefs.getIntPref("max_titlelength");
            var before_trunc_char = title.substr(max_titlelength,1);
            
            // truncate title at max length
            title = title.substr(0,max_titlelength);
            
            // remove the last word until a space is found
            if(this.prefs.getBoolPref("truncate_smart") && title.search(" ")!=-1 && before_trunc_char.search(/[a-zA-Z0-9]/!=-1)) {
                while (title.substring(title.length-1, title.length) != ' ') title = title.substring(0, title.length-1);
                title = title.substring(0, title.length-1);
            }
        } else {
            // remove some non letter characters if they apear at the end of the title that was not truncated
            var endchar = title.substring(title.length-1, title.length);
            if (endchar == ':' || endchar == '?' || endchar == '.' || endchar == '/' || endchar == '\\' || endchar == '>' || endchar == '<' || endchar == '*' || endchar == '|') {
                title = title.substring(0, title.length-1);
            }
        }
        
        // replace forbidden characters with meaningful alternatives (they can only apear in the middle of the text at this point)
        title = title.replace(/[\/\\]/g, '-');
        title = title.replace(/[\*|"<>]/g, '');
        title = title.replace(/[\?:]/g, ' -');
        return(title);
    },

    /*
     * Performs a binary search that returns the index of the array before which the
     * search should be inserted into the array to maintain a sorted order.
     */
    // Array.prototype.binaryIndex = function(find) {
    binaryArrayIndex: function(obj, find) {
        var low = 0, high = obj.length - 1, i;
        while (low <= high) {
            i = Math.floor((low + high) / 2);
            if (obj[i] < find) {
                low = i + 1;
                continue;
            }
            if (obj[i] > find) {
                high = i - 1;
                continue;
            }
            return i;
        }
        if (obj[i] < find) return i + 1;
        else return i;
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

    /*
     * Collects all positions of a particular substring in an Array.
     */
    findStrPos: function(rule, str) {
        var positions = new Array();
        var last = rule.indexOf(str);
        while (last > -1) {
            positions.push(last);
            last = rule.indexOf(str, last + 1);
        }
        return positions;
    },

    /*
     * Iterates through a string or until a mismatch between opening and closing
     * character is found. Returns the start and end position of the first outer
     * match or -1 if no match was found.
     */
    findOuterPairs: function(rule, open, close) {
        open = (typeof(open) === "undefined") ? "{" : open;
        close = (typeof(close) === "undefined") ? "}" : close;
        var matching = new Array();
        var outer = new Array();
        var res = {"start": -1, "end": -1};
        for (var i = 0; i < rule.length; ++i) {
            if (rule[i] === open) {
                matching.push(i);
                if (res.start < 0) res.start = i;
            }
            else if (rule[i] === close) {
                if (matching.length === 0) {
                    this.messages_error.push(this.ZFgetString('renaming.errorFormat.closing', [close, i]));
                }
                matching.pop();
                if (matching.length === 0) {
                    res.end = i;
                    outer.push(res);
                    res = {"start": -1, "end": -1};
                }
            }
        }
        if (matching.length > 0) {
			this.messages_error.push(this.ZFgetString('renaming.errorFormat.opening', [open, matching[0]]));
        }
        return outer;
    },

    wildcardTable: function(zitem) {
        var table = new Object();
        // get item type
        var item_type =  zitem.getType();
        var item_type_string = Zotero.ItemTypes.getLocalizedString(item_type);
        // get creator and create authors string
        // creator types: author/editor(1,3) for book(2), inventor(14) for patent(19),programmer(24) for computer prog.(27),presenter(21) for presentation(32)
        var creatorType = [1];
        if (item_type === 2)  creatorType = [1, 3];
        else if (item_type === 19) creatorType = [14];
        else if (item_type === 32) creatorType = [21];
        else if (item_type === 27) creatorType = [24];
        var add_etal = this.prefs.getBoolPref("add_etal");
        var author = "", author_lastf="", author_initials="";
        var creators = zitem.getCreators();
        var numauthors = creators.length;
        for (var i = 0; i < creators.length; ++i) {
            if (creatorType.indexOf(creators[i].creatorTypeID) === -1) numauthors=numauthors-1;
        }
        var max_authors = (this.prefs.getBoolPref("truncate_authors")) ? this.prefs.getIntPref("max_authors") : 500;
        if (numauthors <= max_authors) add_etal = false;
        else numauthors = 1;
        var delimiter = this.prefs.getCharPref("authors_delimiter");
        var j = 0;
        for (i = 0; i < creators.length; ++i) {
            if (j < numauthors && creatorType.indexOf(creators[i].creatorTypeID) != -1) {
                if (author !== "") author += delimiter + creators[i].ref.lastName;
                if (author === "") author = creators[i].ref.lastName;
                var lastf =  creators[i].ref.lastName + creators[i].ref.firstName.substr(0, 1).toUpperCase();
                if (author_lastf !== "") author_lastf += delimiter + lastf;
                if (author_lastf === "") author_lastf = lastf;
                var initials = creators[i].ref.firstName.substr(0, 1).toUpperCase() + creators[i].ref.lastName.substr(0, 1).toUpperCase()
                if (author_initials !== "") author_initials += delimiter + initials;
                if (author_initials === "") author_initials = initials;
                j=j+1;
            }
        }
        if (add_etal) {
            author = author + this.prefs.getCharPref("etal");
            author_lastf = author_lastf + this.prefs.getCharPref("etal");
            author_initials = author_initials + this.prefs.getCharPref("etal");
        }
        // generate look-up table
        // author
        table["%a"] = author;
        table["%A"] = table["%a"].substr(0, 1).toUpperCase();
        table["%F"] = author_lastf;
        table["%I"] = author_initials;
        // title
        table["%t"] = this.truncateTitle(zitem.getField("title"));
        table["%h"] = zitem.getField("shortTitle");
        // journal
        table["%j"] = zitem.getField("publicationTitle");
        table["%s"] = zitem.getField("journalAbbreviation");
        // publisher
        table["%p"] = zitem.getField("publisher");
        // journal or publisher
        table["%w"] = (table["%j"] != "") ? table["%j"] : table["%p"];
        // patent
        table["%n"] = zitem.getField("patentNumber");
        table["%i"] = zitem.getField("assignee");
        // date
        table["%u"] = "";
        table["%y"] = zitem.getField("date", true).substr(0,4);
        if (item_type === 19) {
            table["%u"] = zitem.getField("issueDate", true).substr(0,4);
            table["%y"] = table["%u"];
        }
        // volume
        table["%v"] = zitem.getField("volume");
        // issue
        table["%e"] = zitem.getField("issue");
        // item type
        table["%T"] = item_type_string;
        // pages
        table["%f"] = zitem.getField("pages");
        // return
        return table;
    },

    /*
     *
     */
    fillRule: function(rule, table, offset) {
        var wildcards = this.findStrPos(rule, "%");
        var bars = this.findStrPos(rule, "|");
        var exclusive = "";
        var str = new Array();
        var complete = true;
        // for first loop excl_complete must be true
        var excl_complete = true;
        var pos = 0;
        var last = -1;
        var lookup = "";
        for (var i = 0; i < bars.length; ++i) {
            // position of current | in wildcards
            pos = this.binaryArrayIndex(wildcards,bars[i]);
            // no wildcard between previous and current |
            if (pos - 1 < last || pos === 0) {
				this.messages_error.push(this.ZFgetString('renaming.errorFormat.left', [offset + bars[i]]));
            }
            // no wildcard between current and next | or no more wildcards left
            if (wildcards[pos] > bars[i + 1] || pos === wildcards.length) {
				this.messages_error.push(this.ZFgetString('renaming.errorFormat.right', [offset + bars[i]]));
            }
            if (pos - last > 1) {
                // all look-ups in an exclusive group failed
                if (!excl_complete) complete = false;
                // reset
                excl_complete = false;
                if (exclusive !== "") {
                    // add content of previous exclusive group
                    str.push(exclusive);
                    // reset
                    exclusive = "";
                }
                for (var j = last + 1; j < pos - 1; ++j) {
                    // add rule content before wildcard
                    // wildcards[-1] is undefined, undefined + 2 is NaN
                    // substring(NaN, x) is from the beginning of the string ;-]
                    str.push(rule.substring(wildcards[j - 1] + 2, wildcards[j]));
                    // add content of wildcard
                    lookup = table[rule.substr(wildcards[j], 2)];
                    if (lookup === "" || typeof(lookup) === "undefined") complete = false;
                    else str.push(lookup);
                }
                // add rule content between last and current wildcard
                str.push(rule.substring(wildcards[j - 1] + 2, wildcards[j]));
            }
            lookup = table[rule.substr(wildcards[pos - 1], 2)];
            if (lookup === "" || typeof(lookup) === "undefined") excl_complete |= false;
            else {
                exclusive = exclusive || lookup;
                excl_complete |= true;
            }
            lookup = table[rule.substr(wildcards[pos], 2)];
            if (lookup === "" || typeof(lookup) === "undefined") excl_complete |= false;
            else {
                exclusive = exclusive || lookup;
                excl_complete |= true;
            }
            last = pos;
        }
        if (!excl_complete) complete = false;
        if (exclusive !== "") {
            str.push(exclusive);
        }
        for (var j = last + 1; j < wildcards.length; ++j) {
            // add rule content before wildcard
            str.push(rule.substring(wildcards[j - 1] + 2, wildcards[j]));
            // add content of wildcard
            lookup = table[rule.substr(wildcards[j], 2)];
            if (lookup === "" || typeof(lookup) === "undefined") complete = false;
            else str.push(lookup);
        }
        // add rule content after last wildcard
        str.push(rule.substring(wildcards[j - 1] + 2));
        return {"str": str.join(""), "complete": complete};
    },

    /*
     * Replace wildcards both for filename and subfolder definition
     * List of field names: https://api.zotero.org/itemFields?pprint=1
     */
    replaceWildcard: function(zitem, rule, table, offset) {
        if (rule === "" || typeof(rule) === "undefined") {
            return;
        }
        table = (typeof(table) === "undefined") ? this.wildcardTable(zitem) : table;
        offset = (typeof(offset) === "undefined") ? 0 : offset;
        var conditional = this.findOuterPairs(rule);
        var name = new Array();
        var last = -1;
        var res;
        var complete = true;
        for (var i = 0; i < conditional.length; ++i) {
            res = this.fillRule(rule.substring(last + 1, conditional[i].start), table, last + 1);
            complete &= res.complete;
            name.push(res.str);
            name.push(this.replaceWildcard(zitem, rule.substring(conditional[i].start + 1, conditional[i].end), table, conditional[i].start + 1));
            last = conditional[i].end;
        }
        res = this.fillRule(rule.substring(last + 1, rule.length), table, last + 1);
        complete &= res.complete;
        // we're in recursive call and a wildcard was not complete
        if (offset > 0 && !complete) return "";
        name.push(res.str);
        return name.join("");
    },

    getFiletype: function(fname){
        var pos = fname.lastIndexOf('.');
        return pos==-1 ? '' : fname.substr(pos+1);
    },
    
    checkFileType: function (file) {
        if(!this.prefs.getBoolPref("useFileTypes")) return(true);
        
        // check
        var filetype=this.getFiletype(file.leafName);
    
        var type=filetype.search(new RegExp(this.prefs.getCharPref("filetypes").replace(/,/gi,"|")));
        if (type>=0) {
        return(true);
        }
        else {
            return(false);
        }
    },

    completePath: function(location,filename) {
        return (location + this.folderSep + filename);
    },

    addSuffix: function(filename,k) {
        var temp = [];
        temp = filename.split('.');
        return(temp[0] + k + "." + this.getFiletype(filename));
    },
        
    getFilename: function(item,filename_org,rename_format){
        // check whether renaming is disables
        if(this.prefs.getBoolPref("disable_renaming")) return(filename_org);
        // check whether regular item
        if (!item.isRegularItem()) return(null);
        // rename format
        var item_type =  item.getType();
        var rename_format_setting = item_type==19 ? this.prefs.getCharPref("renameFormat_patent") : this.prefs.getCharPref("renameFormat");
        rename_format = typeof rename_format !== 'undefined' ? rename_format : rename_format_setting;        
        // create the new filename from the selected item
        var filename;
        if (!this.prefs.getBoolPref("useZoteroToRename")) {
            
            filename=this.replaceWildcard(item, rename_format);
            //var filename =  author + "_" + year + "_" + title;

            // Strip potentially invalid characters
            // (code line adopted from Zotero, modified to accept periods)
            filename = filename.replace(/[\/\\\?\*:|"<>]/g, '');

            // remove periods
            if (this.prefs.getBoolPref("removePeriods"))  filename = filename.replace(/\./g, '');

            // replace multiple blanks in filename with single blank & remove whitespace
            //var filename = filename.replace(/ {2,}/g, ' ');
            filename = Zotero.Utilities.trimInternal(filename);

            // replace blanks with '_' if option selected
            if (this.prefs.getBoolPref("replace_blanks"))  filename = filename.replace(/ /g, '_');
            
            // set to lower case
            if (this.prefs.getBoolPref("lower_case"))  filename = filename.toLowerCase();

            // remove all the accents and other strange characters from filename
            if (Zotero.version[0]>=3 && this.prefs.getBoolPref("removeDiacritics")) filename = Zotero.Utilities.removeDiacritics(filename);
        
        }
        if (this.prefs.getBoolPref("useZoteroToRename")) filename=Zotero.Attachments.getFileBaseNameFromItem(item.itemID);
                    
        if(this.prefs.getBoolPref("userInput")) filename=this.addUserInput(filename,filename_org);
        
        // add filetype to filename
        var filetype = this.getFiletype(filename_org);
        if(filename_org!="" && filetype!="") filename = filename + "." + filetype;
        
        // return
        filename = Zotero.File.getValidFileName(filename);
        return(filename);
        
    },

    getLocation: function(zitem, dest_dir,subfolder, rule) {
        var subfolderFormat="";
        if(subfolder) {
            // get subfolder
            subfolderFormat=this.replaceWildcard(zitem, rule);
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
     * -> returns the path to the new (created) file, in case of an error: path="NULL"
     */
    
        //  file.path!= this.createFile(this.completePath(location, filename)).path
        if(file.path!=this.completePath(destination,filename)) {
            var filename_temp=filename;
            var k=2;
            while(this.fileExists(destination, filename_temp)) {
                filename_temp = this.addSuffix(filename,k);
                k++;
                if(k>99)  break;
                //TODO There should be a prompt window which let the user choose a name
                // If not, it would create an error like file exists or more severe: it will override the existing file
            }
            filename=filename_temp;
            
            try {
              // create a nslFile Object of the destination folder
              var dir = this.createFile(destination);
              // move file to new location
              file.moveTo(dir, filename);
            }
            catch(err) {
                if(err.name == "NS_ERROR_FILE_IS_LOCKED")
                    this.messages_error.push(this.ZFgetString('error.movingFileLocked', [att_name]));
                else
                    this.messages_error.push(this.ZFgetString('error.movingFileGeneral', [att_name, err]));
                file.path = "NULL";
            }
        }
        return(file.path);
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

    removeFile: function(file) {
        if(file.exists()) {
            try {
                file.remove(false);
            }
            catch(err){
                if(file.isDirectory()) this.infoWindow(this.ZFgetString('general.report'),this.ZFgetString('file.removeFolderFailed'),8000);
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
        var return_files=[];
        // create a nslFile Object for the dir
        try {
            var dir = this.createFile(dir_path);
            var lastfile_date=0;
            var lastfile_path="";
            var success=0;

            // go through all the files in the dir
            var i=0;
            var files = dir.directoryEntries;
            while (files.hasMoreElements()) {
                // get one after the other file
                var file = files.getNext();
                file.QueryInterface(Components.interfaces.nsIFile);
                // only look at files which are neither folders nor hidden
                if(!file.isDirectory() && !file.isHidden()) {
                    // now we want to check which filetype we are looking at
                    // we only want to consider pdfs, docs, ...
                    if (this.checkFileType(file)) {
                        var modtime = file.lastModifiedTime;
                        i=i+1;
                        // finally, we set return_files to the file with the most recent modification
                        if (modtime>lastfile_date){
                            lastfile_date=modtime;
                            return_files[0]=file;
    //                      lastfile=file;
                            success=1;
                        }
                    }
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
                        
        if ( this.prefs.getBoolPref("source_dir_ff")) source_dir=this.getFFDownloadFolder();
        if (!this.prefs.getBoolPref("source_dir_ff")) source_dir=this.prefs.getCharPref("source_dir");
                                   
        // test whether valid source dir
        if (source_dir!="" && this.fileExists(source_dir)) {
            return (source_dir);
        } else {
            if(message) this.infoWindow(this.ZFgetString('general.error'),this.ZFgetString('file.invalidSourceFolder'),8000);
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
        var newAttID = this.renameAttachment(item, att, true, this.prefs.getBoolPref("import"),this.prefs.getCharPref("dest_dir"),this.prefs.getBoolPref("subfolder"),this.prefs.getCharPref("subfolderFormat"),false);
        // show message
        var new_file_name = Zotero.Items.get(newAttID).getFile().leafName;                            
        this.messages_report.push("'" + new_file_name + "'");
    },
    
    // FUNCTION: Attach New File(s) from Download Folder
    attachNewFile: function(){
        // get selected items
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var items = win.ZoteroPane.getSelectedItems();
        var item = items[0];

        //check whether it really is an bibliographic item (no Attachment, note or collection)
        if (item.isRegularItem()) {
            try {
                // check whether valid FF default download folder
                if(this.prefs.getBoolPref('source_dir_ff') &&  this.getSourceDir(false)==-1) {
                    this.prefs.setBoolPref('source_dir_ff',false);
                    this.prefs.setCharPref('source_dir',prompt(this.ZFgetString('general.downloadFolder.prompt')));
                    return;
                }

                // get source dir
                var source_dir=this.getSourceDir(true);

                // exit if getting source dir was not successful
                if (source_dir==-1) return;

                // get files from source dir
                if (!this.prefs.getBoolPref("allFiles")) file=this.getLastFileInFolder(source_dir);
                if ( this.prefs.getBoolPref("allFiles")) file=this.getAllFilesInFolder(source_dir);

                // attach them
                if(file!=-1 && file!=-2) {
                    for (var i=0; i < file.length; i++) {                        
                        // get confirmation
                        var file_oldpath=file[i].leafName;
                        var confirmed=true;
                        if (this.prefs.getBoolPref("confirmation"))
                            confirmed=confirm(this.ZFgetString('renaming.renameAttach.confirm', [file_oldpath]));
                        if(confirmed) this.attachFile(item, file[i]);
                    }
                }
                else this.messages_error.push(this.ZFgetString('renaming.renameAttach.wrongItem'));
            }
            catch(e) {
                this.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
            }

        }
        else this.messages_error.push(this.ZFgetString('renaming.renameAttach.wrongItem'));

        // show messages and handle errors
        // this.showWarningMessages(this.ZFgetString('general.warning.skippedAtt'),this.ZFgetString('general.warning.skippedAtt.tablet.msg'));
        this.showReportMessages(this.ZFgetString('general.newAttachmentsAdded'));
        this.handleErrors();
    },
    
    
    // ============================ //
    // FUNCTIONS: TABLET FUNCTIONS //
    // =========================== //
    
    clearInfo: function (att) {
        note = att.getNote().split("; lastmod{")[0];
        att.setNote(note.split("lastmod{")[0]);
        att.save();
    },

    getInfo: function (att,tagname) {
        try {
            var note = att.getNote();
            var search=note.search(tagname);
            var content=note.substring(search);
            content=content.substring(content.search("{")+1,content.search("}"));

            // for location tag: replace [BaseFolder] with destination folder
            if(tagname=="location") content=content.replace("[BaseFolder]",this.prefs.getCharPref("tablet.dest_dir"));

            return(content);
        }
        catch (err) {
            return("");
        }
    },

    addInfo: function(att,tagname,value) {

        var note = att.getNote();
        var tag_content=this.getInfo(att,tagname).replace(this.prefs.getCharPref("tablet.dest_dir"),"[BaseFolder]");

        // for location tag: replace destination folder with [BaseFolder]
        if(tagname=="location" && this.prefs.getBoolPref("tablet.dest_dir_relativePath")) value=value.replace(this.prefs.getCharPref("tablet.dest_dir"),"[BaseFolder]");

        // check whether tag already exists
        var search=note.search(tagname);

        // tag already exists
        if (search!=-1) {
                att.setNote(note.replace(tagname +"{"+tag_content+"}",tagname +"{"+value+"}"));
        }
        // tag does not exists
        else {
            if(note=="") att.setNote(note + tagname +"{"+value+"}");
            if(note!="") att.setNote(note + "; " + tagname +"{"+value+"}");
        }
        att.save();
    },

    getTabletStatus: function(att) {        
        if(att!=false) {
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

    getTabletFile: function(att) {
        try {
            if(this.getTabletStatus(att)) {
                // get file depending on mode
                var file=this.getInfo(att,"mode")==1 ? this.createFile(this.getInfo(att,"location")) : att.getFile();
                return(file);
            }
            return(false);
        }
        catch (err) {
            return(false);
        }
    },
    
    getTabletLocationFile: function(subfolder) {
        if(subfolder==null) subfolder="";
        return(this.createFile(this.prefs.getCharPref("tablet.dest_dir")+subfolder));
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
                if(this.getInfo(item,"mode")==="") this.infoWindow(this.ZFgetString('general.warning'),this.ZFgetString('tablet.attachmentNoteMissing'),8000);
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
                        var itemID=this.getAttachmentFromTablet(parent,item,true);
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
                this.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
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
            return search.getSearchConditions().some(function(cond) {return cond.condition=="tag" && cond.value.indexOf(Zotero.ZotFile.tag) !== -1; });
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
        if(which!=-1) searches.forEach(function(search) {
            search.addCondition('note', 'contains', subfolders[which].path);
            search.save();
        });
    },
                
    sendAttachmentToTablet: function(item, att, projectFolder, verbose) {
        verbose = (typeof verbose == 'undefined') ? true : verbose;
        var newFile,
            newAttID=null,
            file = att.getFile(),
            tagID = Zotero.Tags.getID(this.tag,0),
            tagIDMod = Zotero.Tags.getID(this.tagMod,0);

        if(this.fileExists(att) && this.checkFileType(att.getFile())) {
            
            // background mode: Rename and Move Attachment
            if(this.prefs.getIntPref("tablet.mode")==1) {

                // change name of file
                if (this.prefs.getBoolPref("tablet.rename"))  {
                    var filename=this.getFilename(item,file.leafName);
                    if(filename!=file.leafName) {
                        att.renameAttachmentFile(filename);
                        att.setField('title', filename);
                        att.save();
                        file = att.getFile();
                    }
                }
                newAttID=att.getID();

                // create copy of file on tablet and catch errors
                // create copy on tablet
                var folder=this.getLocation(item,this.prefs.getCharPref("tablet.dest_dir")+projectFolder,this.prefs.getBoolPref("tablet.subfolder"),this.prefs.getCharPref("tablet.subfolderFormat"));
                newFile=this.copyFile(file,folder,file.leafName);

            }

            // foreground mode: Rename and Move Attachment
            if(this.prefs.getIntPref("tablet.mode")==2) {
                // save note content
                var note = att.getNote();
                // rename attachment
                newAttID=this.renameAttachment(item, att, this.prefs.getBoolPref("tablet.rename"),false,this.prefs.getCharPref("tablet.dest_dir")+projectFolder,this.prefs.getBoolPref("tablet.subfolder"),this.prefs.getCharPref("tablet.subfolderFormat"),false);
                // get new attachment and file
                att = Zotero.Items.get(newAttID);
                newFile = att.getFile();
                // add note content
                att.setNote(note);
                att.save();
            }
            
            // add info to note (date of modification to attachment, location, and mode)
            this.addInfo(att,"lastmod",newFile.lastModifiedTime);
            this.addInfo(att,"mode",this.prefs.getIntPref("tablet.mode"));
            this.addInfo(att,"location",newFile.path);
            this.addInfo(att,"projectFolder",projectFolder);
            // add tags
            this.addTabletTag(att, this.tag);
            if (this.prefs.getBoolPref("tablet.tagParentPush")) item.addTag(this.prefs.getCharPref("tablet.tagParentPush_tag"));            
            // notification
            if(verbose) this.messages_report.push("'" + newFile.leafName + "'");
        }        
        return(newAttID);
    },
    
    sendSelectedAttachmentsToTablet: function(idx_subfolder) {
        // save current selection
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var selection = win.ZoteroPane.itemsView.saveSelection();
        
        // get selected attachments
        var attIDs=this.getSelectedAttachments();
        var attID;
            
        // get projectFolder
        var projectFolder="";
        if (idx_subfolder!=-1) {
            var subfolders = JSON.parse(this.prefs.getCharPref("tablet.subfolders"));
            if(this.prefs.getIntPref("tablet.projectFolders")==1) projectFolder = this.projectPath[parseInt(idx_subfolder,10)-1];
            if(this.prefs.getIntPref("tablet.projectFolders")==2) projectFolder = subfolders[idx_subfolder].path;
        }
        
        // Check which attachments are already on the reader
        var attOnReader=[];
        var attOnReaderCount=0;
        for (var i=0; i < attIDs.length; i++) {
            var hasTag=this.getTabletStatus(Zotero.Items.get(attIDs[i]));
            attOnReader.push(hasTag);
            if (hasTag) attOnReaderCount++;
        }
        
        var repush=!this.prefs.getBoolPref("tablet.confirmRepush");
    
        // Push attachments
        var confirmed=1;
        if (this.prefs.getBoolPref("confirmation_batch_ask") && 
            attIDs.length>=this.prefs.getIntPref("confirmation_batch")) 
                confirmed=confirm(this.ZFgetString('tablet.sendAttachments', [attIDs.length]));
        if(confirmed) {
            if (!repush && attOnReaderCount>0) repush=confirm(this.ZFgetString('tablet.replaceAttachAlready', [attOnReaderCount]));
            for (i=0; i < attIDs.length; i++) {
                try { 
                    var att = Zotero.Items.get(attIDs[i]);
                    var item= Zotero.Items.get(att.getSource());
                    if(!attOnReader[i] || (attOnReader[i] && repush)) {
                        // first pull if already on reader
                        if (attOnReader[i]) {
                            var att_mode=this.getInfo(att,"mode");
                            if(att_mode==1 || att_mode!=this.prefs.getIntPref("tablet.mode")) {
                                attID=this.getAttachmentFromTablet(item,att,true);
                                att = Zotero.Items.get(attID);
                            }
                        }
                        // now push
                        attID=this.sendAttachmentToTablet(item,att,projectFolder);
                        if(attID!==null && attIDs[i]!=attID) selection=this.arrayReplace(selection,attIDs[i],attID);
                    }
                }
                catch(e) {
                    this.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
                }
            }
            // restore selection
            if(Zotero.version>="3") win.ZoteroPane.itemsView.selectItems(selection);
        }
        // show messages and handle errors
        this.showWarningMessages(this.ZFgetString('general.warning.skippedAtt'),this.ZFgetString('general.warning.skippedAtt.msg'));
        this.showReportMessages(this.ZFgetString('tablet.AttsMoved'));
        this.handleErrors();
    },

    updateSelectedTabletAttachments: function () {
        // get selected attachments
        var itemIDs=this.getSelectedAttachments();
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
                        this.addInfo(item,"lastmod",file.lastModifiedTime);
                        this.addTabletTag(item, this.tag);
                        // new attachment ID
                        newAttID=item.getID();
                    }
                    if(att_mode==1) {
                        var projectFolder=this.getInfo(item,"projectFolder");
                        // first get from tablet
                        var itemID=this.getAttachmentFromTablet(parent,item,true);
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
                this.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
            }
        }

        // show messages and handle errors
        this.showWarningMessages(this.ZFgetString('general.warning.skippedAtt'),this.ZFgetString('general.warning.skippedAtt.msg'));
        this.showReportMessages(this.ZFgetString('tablet.AttsSynced'));
        this.handleErrors();
    },
    
    getAttachmentFromTablet: function (item, att,fakeRemove) {
        var attID=att.getID(),
            option=1,
            itemPulled=false, attsDeleted=false,
            att_mode=this.getInfo(att,"mode"),
            tagID = Zotero.Tags.getID(this.tag,0),
            tagIDMod = Zotero.Tags.getID(this.tagMod,0);

        // get files
        var file_zotero=att.getFile();
        var file_reader=this.getTabletFile(att);

        // get modification times for files
        var time_reader = this.fileExists(file_reader) ? parseInt(file_reader.lastModifiedTime+"",10) : 0;
        var time_saved  = parseInt(this.getInfo(att,"lastmod"),10);
        var time_zotero = (file_zotero!=false) ? parseInt(file_zotero.lastModifiedTime+"",10) : 0;

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
            attID=this.renameAttachment(item, att, this.prefs.getBoolPref("tablet.rename"), this.prefs.getBoolPref("import"),this.prefs.getCharPref("dest_dir"),this.prefs.getBoolPref("subfolder"),this.prefs.getCharPref("subfolderFormat"),false);
            // get new attachment object
            att = Zotero.Items.get(attID);
            // finish up
            itemPulled=true;
            option = time_zotero>time_saved ? 0 : 2;
            // add note content
            att.setNote(note);
            att.save();
        }
        
        // post-processing if attachment has been removed & it's not a fake-pull
        if (itemPulled && !fakeRemove) {
            // remove tag from attachment and parent item
            this.removeTabletTag(att, this.tag);
            // clear attachment note
            this.clearInfo(att);
            // extract annotations from attachment and add note
            if (this.prefs.getBoolPref("pdfExtraction.Pull") && option!=2) this.pdfAnnotations.getAnnotations([attID]);
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
        return(attID);
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
        // save current selection
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var selection=win.ZoteroPane.itemsView.saveSelection();

        // get selected attachments, filter for tablet        
        var atts = Zotero.Items.get(this.getSelectedAttachments()).filter(this.getTabletStatus, Zotero.ZotFile),
            attIDs = atts.map(function(att) {return att.id;});
        var tagID = Zotero.Tags.getID(this.tag,0);

        // confirm        
        var confirmed=true;
        if (this.prefs.getBoolPref("confirmation_batch_ask") && atts.length>=this.prefs.getIntPref("confirmation_batch")) 
            confirmed=confirm(this.ZFgetString('tablet.getAttachments', [atts.length]));
        if(confirmed) {
            for (var i=0; i < atts.length; i++) {
                try {
                    // get attachment and item object
                    var att = atts[i];
                    var item= Zotero.Items.get(att.getSource());
                    // get attachment from tablet
                    var attID=Zotero.ZotFile.getAttachmentFromTablet(item,att,false);
                    // save message
                    if(attID!==null && attIDs[i]!=attID) selection=Zotero.ZotFile.arrayReplace(selection,attIDs[i],attID);
                }
                catch(e) {
                    this.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
                }
            }            
        }
        // restore selection
        if(Zotero.version>="3") win.ZoteroPane.itemsView.selectItems(selection);
        // show messages and handle errors
        this.showWarningMessages(this.ZFgetString('general.warning.skippedAtt'),this.ZFgetString('general.warning.skippedAtt.msg'));
        this.showReportMessages(this.ZFgetString('tablet.AttsGot'));
        this.handleErrors();
    },
    
    
    // ============================= //
    // FUNCTIONS: RENAME ATTACHMENTS //
    // ============================ //
            
    // Rename & Move Existing Attachments
    renameAttachment: function(item, att, rename, import_att, dest_dir, subfolder, subfolderFormat, notification) {
        var newAttID=null;
        // get link mode and item ID
        var linkmode = att.attachmentLinkMode;
        var itemID = item.id;
    
        // only proceed if linked or imported attachment
        if(att.isImportedAttachment() || linkmode==Zotero.Attachments.LINK_MODE_LINKED_FILE) {
    
            // get object of attached file
            var file = att.getFile();
            // create file name using ZotFile rules
            var filename = rename ? this.getFilename(item, file.leafName) : file.leafName;
            var location = this.getLocation(item,dest_dir,subfolder,subfolderFormat);

            // (a) LINKED ATTACHMENT TO IMPORTED ATTACHMENT
            if (linkmode==Zotero.Attachments.LINK_MODE_LINKED_FILE  && import_att) {
                // Attach file to selected Zotero item
                newAttID=Zotero.Attachments.importFromFile(file, itemID,item.libraryID);
                // remove file from hard-drive
                file.remove(false);
                // erase old attachment
                att.erase();
                // create new attachment object
                att = Zotero.Items.get(newAttID);
                // notification
                if(notification) this.messages_report.push(this.ZFgetString('renaming.imported', [filename]));                    
            }
            // RENAME ATTACHMENT FILE
            if (import_att || item.libraryID) {
                // rename file associated with attachment
                att.renameAttachmentFile(filename);
                // change title of attachment item
                att.setField('title', filename);
                att.save();
                // notification
                if (linkmode!=Zotero.Attachments.LINK_MODE_LINKED_FILE && notification) this.messages_report.push(this.ZFgetString('renaming.imported', [filename]));
            }
            // (b) TO LINKED ATTACHMENT (only if library is local and not cloud)
            if (!import_att && !item.libraryID) {
                // move pdf file
                var newfile_path=this.moveFile(file,location, filename, att.getDisplayTitle());
                if (newfile_path!="NULL") {
                    // recreate the outfile nslFile Object
                    file = this.createFile(newfile_path);
                    // create linked attachment
                    newAttID=Zotero.Attachments.linkFromFile(file, itemID,item.libraryID);
                    // erase old attachment
                    att.erase();
                    // notification
                    if(notification) this.messages_report.push(this.ZFgetString('renaming.linked', [filename]));
                }
            }
        }
        // return id of attachment
        return newAttID;
    },
            
    // FUNCTION: Rename & Move Existing Attachments
    renameSelectedAttachments: function(){
        // save current selection
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var selection=win.ZoteroPane.itemsView.saveSelection();
        
        // get selected attachments
        var attIDs=this.getSelectedAttachments();
        
        // Pull attachments
        var confirmed=1;
        if (this.prefs.getBoolPref("confirmation_batch_ask") && attIDs.length>=this.prefs.getIntPref("confirmation_batch")) confirmed=confirm(this.ZFgetString('renaming.moveRename', [attIDs.length]));
        if(confirmed) {
            for (var i=0; i < attIDs.length; i++) {
                try { 
                    //lksdfsdf
                    // get attachment and item
                    var att = Zotero.Items.get(attIDs[i]);
                    var item= Zotero.Items.get(att.getSource());

                    // preserve attachment note and tags
                    var att_note=att.getNote();
                    var att_tags=att.getTags();
                    if(att_tags.length>0) for (var j=0; j < att_tags.length; j++) att_tags[j]= att_tags[j]._get('name');
                
                    // Rename and Move Attachment
                    var file = att.getFile();
                    if(this.fileExists(att) && this.checkFileType(file) && !this.getTabletStatus(att)) {
                        // move & rename
                        var attID=this.renameAttachment(item, att, true,this.prefs.getBoolPref("import"),this.prefs.getCharPref("dest_dir"),this.prefs.getBoolPref("subfolder"),this.prefs.getCharPref("subfolderFormat"),true);
                        
                        //update list of selected item
                        if(attID!==null && attIDs[i]!=attID) selection=this.arrayReplace(selection,attIDs[i],attID);

                        // restore attachments note and tags
                        if(att_note!="" || att_tags.length>0) {
                            att = Zotero.Items.get(attID);
                            if(att!=false) {
                                if(att_note!="") att.setNote(att_note);
                                if(att_tags) for each(var tag in att_tags) att.addTag(tag);
                                att.save();
                            }
                        }
                    }
                    if(this.getTabletStatus(att)) this.messages_warning.push("'" + file.leafName + "'");
                }
                catch(e) {
                    this.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
                }
            }
            // restore selection
            if(Zotero.version>="3") win.ZoteroPane.itemsView.selectItems(selection);
        }
        // show messages and handle errors
        this.showWarningMessages(this.ZFgetString('general.warning.skippedAtt'),this.ZFgetString('general.warning.skippedAtt.tablet.msg'));
        this.showReportMessages(this.ZFgetString('renaming.renamed'));
        this.handleErrors();
    },
    
    
    // =========================================== //
    // FUNCTIONS: PDF ANNOTATION EXTRACTION CLASS //
    // ========================================== //
    
    // class to extract pdf annotations
    pdfAnnotations : {
        popplerExtractorFileName: 'ExtractPDFAnnotations',
        popplerExtractorPath:null,
        popplerExtractorVersion:1.0,
        popplerSupportedPlatforms:['MacIntel'],
        pdfExtraction:false,
        popplerExtractorTool:false,
        popplerExtractorSupported:false,
        popplerExtractorBaseURL:'http://www.columbia.edu/~jpl2136/PDFTools/',

        /** The list of PDFs we should extract annotations from.  Each
        element is an object with the following fields:
        attachment: the Zotero object representing the attachment
        path: an absolute path to the attachment file
        item: the Zotero item containing the attachment
        */
        pdfAttachmentsForExtraction: [],
        numTotalPdfAttachments: 0,
        errorExtractingAnnotations: false,
        /** The hidden browser where PDFs get rendered by pdf.js. */
        pdfHiddenBrowser: null,
        PDF_EXTRACT_URL: 'chrome://zotfile/content/pdfextract/extract.html',

        popplerExtractorSetPath: function() {
            // extractor filename
            this.popplerExtractorFileName += '-' + Zotero.platform;
            if (Zotero.isWin) this.popplerExtractorFileName+='.exe';
            //â€œpdftotext-{platform}â€?, where {platform} is â€œWin32â€?, â€œMacIntelâ€?, â€œMacPPCâ€?, â€œLinux-i686â€?, etc. (To determine your current platform, type javascript:alert(navigator.platform) in the Firefox URL bar and hit Enter.)

            // extractor path
            this.popplerExtractorPath = Zotero.getZoteroDirectory().path + "/ExtractPDFAnnotations/" + this.popplerExtractorFileName;
            if (Zotero.isWin) this.popplerExtractorPath.replace(/\\\//g,"\\").replace(/\//g,"\\");
        },

        popplerExtractorCheckInstalled: function  () {
//          str = toolIsRegistered ? "Installed..." : "Download Tool to Extract PDF Annotations";
            try {
                    var fileobj = Zotero.ZotFile.createFile(this.popplerExtractorPath);
                    if (fileobj.exists()) return(1);
                    if (!fileobj.exists()) return(0);
            }
            catch (err) {
                return(0);
            }

        },

        openFileStream: function  (file) {
            var istream = Components.classes["@mozilla.org/network/file-input-stream;1"].
                            createInstance(Components.interfaces.nsIFileInputStream);
            istream.init(file, 0x01, 0444, 0);
            istream.QueryInterface(Components.interfaces.nsILineInputStream);

            /* Need to find out what the character encoding is. Using UTF-8 for this example: */
            var charset = "UTF-8";
            var is = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
                                .createInstance(Components.interfaces.nsIConverterInputStream);
            // This assumes that fis is the template.Interface("nsIInputStream") you want to read from
            is.init(istream, charset, 1024, 0xFFFD);
            is.QueryInterface(Components.interfaces.nsIUnicharLineInputStream);

            return(is);
        },        

        getAnnotations: function(attIDs) {        
            // get selected attachments if no att ids are passed
            if(attIDs==null) {
                attIDs=Zotero.ZotFile.getSelectedAttachments();
                Zotero.ZotFile.showWarningMessages(Zotero.ZotFile.ZFgetString('general.warning.skippedAtt'),Zotero.ZotFile.ZFgetString('general.warning.skippedAtt.msg'));
            }
            // iterate through attachment items
            var file;
            if(attIDs!=null) for (var i=0; i < attIDs.length; i++) {
                try {                    
                    // get attachment item, parent and file
                    var att  = Zotero.Items.get(attIDs[i]);
                    var item = Zotero.Items.get(att.getSource());
            
                    // if file is on tablet in background mode, take the one which was modified
                    if(Zotero.ZotFile.getTabletStatus(att) && Zotero.ZotFile.getInfo(att,"mode")==1) {
                        var file_zotero=att.getFile();
                        var file_reader=Zotero.ZotFile.getTabletFile(att);
                        
                        // get times
                        var time_reader = Zotero.ZotFile.fileExists(file_reader) ? parseInt(file_reader.lastModifiedTime+"",10) : 0;
                        var time_saved  = parseInt(Zotero.ZotFile.getInfo(att,"lastmod"),10);
                        var time_zotero = (file_zotero!=false) ? parseInt(file_zotero.lastModifiedTime+"",10) : 0;

                        if (time_reader!=0 || time_zotero!=0) {

                            // set options
                            var option;
                            if (time_reader>time_saved  && time_zotero<=time_saved) option=0;
                            if (time_reader<=time_saved && time_zotero<=time_saved) option=2;
                            if (time_reader<=time_saved && time_zotero>time_saved) option=2;
                            if (time_reader>time_saved  && time_zotero>time_saved) option=1;

                            // prompt if both file have been modified
                            if(option==1) option =Zotero.ZotFile.promptUser(Zotero.ZotFile.ZFgetString('extraction.fileConflict', [file_zotero.leafName]),
                                Zotero.ZotFile.ZFgetString('extraction.fileConflict.useT'),
                                Zotero.ZotFile.ZFgetString('general.cancel'),
                                Zotero.ZotFile.ZFgetString('extraction.fileConflict.useZ'));
                            if(option==0) file   =file_reader;
                            if(option==2) file   =file_zotero;
                            if(option==1) return(false);
                        }
                    }
                    else {
                        file = att.getFile();
                    }

                    // extract annotations from pdf and create note with annotations
                    if(Zotero.ZotFile.getFiletype(file.leafName)=="pdf") {
                        if (Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJS") || Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJSandPoppler")) {
                            var a = {};
                            a.attachment = att;
                            a.path = file.path;
                            a.item = item;
                            this.pdfAttachmentsForExtraction.push(a);
                        }
                        if (this.popplerExtractorTool && (
                            !Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJS") || 
                            Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJSandPoppler"))) {
                                
                            var outputFile=file.path.replace(".pdf",".txt");
                            Zotero.ZotFile.runProcess(this.popplerExtractorPath, [file.path, outputFile]);
                            var annotations = this.popplerExtractorGetAnnotationsFromFile(outputFile);
                            if(annotations.length!=0) this.createNote(annotations, item, att, "poppler");

                            // delete output text file
                            if(Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.popplerDeleteTxtFile")) Zotero.ZotFile.removeFile(Zotero.ZotFile.createFile(outputFile));
                        }
                    }
                }
                catch(e) {
                    Zotero.ZotFile.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
                }
            }
            if (this.pdfAttachmentsForExtraction.length > 0 &&
                    (Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJS") || Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJSandPoppler"))) {
                if (!Zotero.isFx36) {
                    try {
                        // setup extraction process
                        this.errorExtractingAnnotations = false;
                        this.numTotalPdfAttachments = this.pdfAttachmentsForExtraction.length;
                        Zotero.showZoteroPaneProgressMeter(Zotero.ZotFile.ZFgetString('extraction.progressBar'),true);
                        var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser");
                        win.ZoteroPane.document.addEventListener('keypress', this.cancellationListener,false);
                        this.pdfHiddenBrowser = Zotero.Browser.createHiddenBrowser();
                        this.pdfHiddenBrowser.loadURI(this.PDF_EXTRACT_URL);
                    }
                    catch(e) {
                        Zotero.ZotFile.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
                    }
                }
                else Zotero.ZotFile.infoWindow(Zotero.ZotFile.ZFgetString('general.error'),Zotero.ZotFile.ZFgetString('extraction.outdatedFirefox'),8000);
            }
            // show messages and handle errors
            // this.showReportMessages(Zotero.ZotFile.ZFgetString('tablet.AttsMoved'));
            Zotero.ZotFile.handleErrors();
        },

        popplerExtractorGetAnnotationsFromFile: function(outputFile) {
            var annotations = [];
            var file=Zotero.ZotFile.createFile(outputFile);
            
            if(file.exists()) {
                // open an input stream from file
                    var istream=this.openFileStream(file);

                // read lines into array
                var line = {};
                do {
                    // get line
                    cont = istream.readLine(line);
                    var line_split = line.value.split(' ; ');
                    var strMarkUp  = (line_split[5]) ? this.trim(line_split[5].replace(/\\n/g,"<br>")) : "";
                    var strText    = (line_split[4]) ? this.trim(line_split[4].replace(/\\n/g,"<br>")) : "";

    //              if(strText!="") var strText=this.removeHyphens(strText);

                    // create annotation object
                    /*                  structure: filename ; page ; ID ; type ; text ; textMarkUp */
                    if(strMarkUp!="" || strText!="") {
                        a = {
                            filename:line_split[0],
                            page:parseInt(line_split[1],10),
                            ID:parseInt(line_split[2],10),
                            type:line_split[3],
            //              date:line_split[7],
            //              creator:line_split[11],
                            content:strText,
                            markup:strMarkUp
                        };
                        annotations.push(a);
                    }

                } while (cont);

                istream.close();
            }
            else Zotero.ZotFile.messages_error.push(Zotero.ZotFile.ZFgetString('extraction.failedNoFile'));                
            return annotations;
        },

        createNote: function(annotations, item, att, method) {
            var note_content=this.getNoteContent(annotations, item, att, method);
            var note = new Zotero.Item("note");
            note.libraryID = item._libraryID;
//          note.setNote(Zotero.Utilities.text2html(note_content));
            note.setNote(note_content);
            note.setSource(item.getID());
            var noteID = note.save();

//          Zotero.ZotFile.infoWindow(Zotero.ZotFile.ZFgetString('general.report'),"TAB:" + prefWindow.document.getElementById('zotfile-tabbox').selectedTab,8000);
        },

        getNoteContent: function(annotations, item, att, method) {
            // get current date
			var date_str = Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.localeDateInNote") ? new Date().toLocaleString() : new Date().toUTCString();

            // set note title
            var note="<b>" + Zotero.ZotFile.ZFgetString('extraction.noteTitle') + " (" + date_str;
            if (Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJSandPoppler")) note += ", " + method;
            note += ")</b><br><br>";

            // get html tags for notes and highlights
            var htmlTagNoteStart=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.NoteHtmlTagStart");
            var htmlTagNoteEnd=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.NoteHtmlTagEnd");
            var htmlTagHighlightStart=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.HighlightHtmlTagStart");
            var htmlTagHighlightEnd=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.HighlightHtmlTagEnd");
            var htmlTagUnderlineStart=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.UnderlineHtmlTagStart");
            var htmlTagUnderlineEnd=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.UnderlineHtmlTagEnd");
			var openingQMarks=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.openingQuotationMarks");
			var closingQMarks=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.closingQuotationMarks");

            // iterature through annotations
            for (var i=0; i < annotations.length; i++) {
                var anno=annotations[i];

                // get page
                var page=anno.page;
                if(Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.NoteTruePage")) {
                    try {
                        var itemPages=item.getField('pages');
                        if(itemPages) page=parseInt(itemPages.split('-')[0],10)+page-1;
                    }
                    catch(err) {}
                }

                // get citation
                var cite="p. ";
                if(Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.NoteFullCite")) 
                    cite=Zotero.ZotFile.replaceWildcard(item, "%a %y:").replace(/_(?!.*_)/," and ").replace(/_/g,", ");
                // get uri
                var lib = att.libraryID===null ? 0 : att.libraryID;
                var uri = 'zotfile://open/' + lib + '_' + att.key + '/' + anno.page;                

                // add to note text pdfExtractionNoteRemoveHtmlNote
                if(anno.content && anno.content != "" &&
                    (!anno.markup || this.strDistance(anno.content,anno.markup)>0.15 )) {
                    var content = anno.content.replace(/(\r\n|\n|\r)/gm,"<br/>");
                    note += "<p>"+htmlTagNoteStart+content+" (note on p." + page + ")"+htmlTagNoteEnd+"</p><br>";
                }

                if(anno.markup && anno.markup != "") {
                    var markup = this.trim(anno.markup)
                    // translate ligatures (e.g. 'ﬁ')
                        .replace('\ufb00','ff')
                        .replace('\ufb01','fi')
                        .replace('\ufb02','fl')
                        .replace('\ufb03','ffi')
                        .replace('\ufb04','ffl')
                        .replace('\ufb05','ft')
                        .replace('\ufb06','st');

                    // create formated markup
                    if(Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.NoteRemoveHyphens")) markup = this.removeHyphens(markup);
                    var tagStart = htmlTagHighlightStart;
                    var tagEnd = htmlTagHighlightEnd;
                    if (anno.type == "Highlight") {
                        tagStart = htmlTagHighlightStart;
                        tagEnd = htmlTagHighlightEnd;
                    } else if (anno.type == "Underline") {
                        tagStart = htmlTagUnderlineStart;
                        tagEnd = htmlTagUnderlineEnd;
                    }
                    note += "<p>"+tagStart+openingQMarks+markup+closingQMarks+' (<a href="' + uri + '">' + cite + page + "</a>)" +tagEnd+"</p>";
                }
            }
            return note;

        },

        trim: function(str) {
            //return str.replace (/^\s+/, '').replace (/\s+$/, '');
            return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
        },

        strDistance: function (s1,s2) {
            s1=Zotero.Utilities.trimInternal(s1).replace(/ /g,"");
            s2=Zotero.Utilities.trimInternal(s2).replace(/ /g,"");
            var l = (s1.length > s2.length) ? s1.length : s2.length;
            return Zotero.Utilities.levenshtein(s1,s2)/l;
        },

        removeHyphens: function(str) {
            while (true) {
                var pos = str.search(/[a-zA-Z]- [a-zA-Z]/g);
                if (pos == -1) break;
                str = str.substring(0,pos+1) + str.substring(pos+3,str.length);
            }
            return str;
        },

            /* Runs the annotation extraction code in extract.html/extract.js,
             * to extract annotations from a single PDF. */
            extractAnnotationsFromFiles: function() {
                var attachment = this.pdfAttachmentsForExtraction.shift();
                var args = {};
                args.url = attachment.path;
                args.item = attachment.item;
                args.att = attachment.attachment;
                args.callbackObj = this;
                args.callback = this.extractionComplete;
                Zotero.ZotFile.PdfExtractor.extractAnnotations(args);
            },

            /** Called from extract.js whenever a page is processed. */
            pageExtractionComplete: function(pagesProcessed, totalPages) {
                // update progress bar
                var fractionDone = (this.numTotalPdfAttachments - this.pdfAttachmentsForExtraction.length - 1) /
                    this.numTotalPdfAttachments;
                fractionDone += ((pagesProcessed / totalPages) * (1.0 / this.numTotalPdfAttachments));
                Zotero.updateZoteroPaneProgressMeter(fractionDone * 100.0);
            },

            /** Keypress listener that cancels the extraction if the user presses escape. */
            cancellationListener: function(keyEvent) {
                if (keyEvent.keyCode == KeyboardEvent.DOM_VK_ESCAPE) {
                    var zzpa = Zotero.ZotFile.pdfAnnotations;
                    zzpa.pdfAttachmentsForExtraction = [];
                    zzpa.extractionComplete([], null);
                    keyEvent.currentTarget.removeEventListener('keypress', zzpa.cancellationListener);
                }
            },

            /* Called from extract.js when all annotations for a single PDF have
             * been extracted.
             * @param annotations An array of annotation objects. Each element
             * contains the following fields: url (a url pointing to the file
             * this annotation came from), page (the page number within the
             * document where this annotation appears), type (the type of
             * annotation, e.g. "Highlight", or "Text"), content (the text of
             * any pop-up note in this annotation), and markup (the words from
             * the document, if any, that were highlighted/underlined).
             * @param item The Zotero item these annotations came from */
            extractionComplete: function(annotations, item, att) {
                // put annotations into a Zotero note
                if (annotations.length > 0) this.createNote(annotations, item, att, "pdf.js");
                
                // move on to the next pdf, if there is one
                if (this.pdfAttachmentsForExtraction.length > 0) {
                    this.extractAnnotationsFromFiles();
                } else { // we're done
                    if (this.errorExtractingAnnotations) {
                        Zotero.ZotFile.infoWindow(Zotero.ZotFile.ZFgetString('general.report'),Zotero.ZotFile.ZFgetString('extraction.pdfjsFailed'),8000);
                    }
                    this.errorExtractingAnnotations = false;
                    Zotero.Browser.deleteHiddenBrowser(this.pdfHiddenBrowser);
                    this.pdfHiddenBrowser = null;
                    this.numTotalPdfAttachments = 0;
                    Zotero.hideZoteroPaneOverlay(); // hide progress bar
                }
            }

    }
                
};


