
/**
 * Functions for zotfile's preference window
 */

var Zotero = Components.classes["@zotero.org/Zotero;1"]
    .getService(Components.interfaces.nsISupports)
    .wrappedJSObject;

Components.utils.import("resource://gre/modules/osfile.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

// function to disable prefernce in pref window
// 'pref' can be passed as string or array
// returns setting if needed for further changes
var disablePreference = function (setting, pref, revert) {
    setting = document.getElementById('pref-zotfile-' + setting).value;
    if(revert) setting = !setting;
    if(typeof(pref)=='string') document.getElementById('id-zotfile-' + pref).disabled = !setting;
    if(typeof(pref)=='object') for (var i=0;i<pref.length;i++) document.getElementById('id-zotfile-' + pref[i]).disabled = !setting;
    return(setting);
}.bind(Zotero.ZotFile);

var updatePreferenceWindow = function (which) {
    var setting;
    if(which=="all") {
        updatePDFToolsStatus();
        updateFolderIcon("all", false);
        this.temp = this.getPref('tablet.dest_dir');
        /*if(document.getElementById('pref-zotfile-tablet-mode').value==2) {
            document.getElementById('id-zotfile-tablet-storeCopyOfFile').disabled = true;
            document.getElementById('id-zotfile-tablet-storeCopyOfFile_suffix').disabled = true;
        }*/
    }
    
    // disable ff download folder option for standalone
    if(Zotero.version[0]<=2) document.getElementById('id-zotfile-removeDiacritics').disabled=true;

    // dis- and enable poppler extractor option
    document.getElementById('id-zotfile-pdfExtraction-UsePDFJS-false').disabled=!this.pdfAnnotations.popplerExtractorTool;
    
    var revert=(which!="all") ? true : false;
        
    // Add 'et al'
    if(which=="etal" || which=="all") disablePreference("add_etal", "etal", revert);

    // max title length
    if(which=="truncate_title_max" || which=="all") disablePreference("truncate_title_max", "max_titlelength", revert);

    // max authors
    if(which=="truncate_authors" || which=="all") disablePreference("truncate_authors", "max_authors", "number_truncate_authors", revert);

    // creators delimiter
    // if(which=="creators_delimiter" || which=="all") disablePreference("creators_delimiter", "delimiter", revert);
	
    // subfolder
    if(which=="subfolder" || which=="all") disablePreference("subfolder", "subfolderFormat", revert);
    
    // subfolder-tablet
    if(which=="subfolder-tablet" || which=="all") disablePreference("tablet-subfolder", "tablet-subfolderFormat", revert);
    
    // storeCopyOfFile-tablet
    if(which=="storeCopyOfFile" || which=="all") disablePreference("tablet-storeCopyOfFile", "tablet-storeCopyOfFile_suffix", revert);
    
    // batch renaming
    if(which=="confirm" || which=="all") disablePreference("confirmation_batch_ask", "confirmation_batch", revert);
    

    // filetypes
    if(which=="filetypes" || which=="all") disablePreference("useFileTypes", 'filetypes', revert);
            
    // Source Folder
    if(which=="source" || which=="all") {
        disablePreference("source_dir_ff", ['source_dir','source_dir-button'], !revert);
        if(which!="all") updateFolderIcon("source",true);
    }

    // Destination Folder
    if(which=="dest" || which=="all") {
        setting=disablePreference("import", ['dest_dir','dest_dir-button','subfolder','subfolderFormat'], !revert);
        if (setting) document.getElementById('id-zotfile-subfolderFormat').disabled = !document.getElementById('pref-zotfile-subfolder').value;
        if(which!="all") updateFolderIcon("dest",true);
    }
    
    // userinput
    if(which=="userinput" || which=="all") disablePreference("userInput", "userInput_Default", revert);
    
    // Use Zotero to Rename
    if(which=="zotrename" || which=="all") {
        setting=disablePreference("useZoteroToRename", ['renameFormat', 'renameFormat-label', 'renameFormat-des1', 'renameFormat-des2', 'renameFormat-des3', 'renameFormat-des4', 'renameFormat_patent', 'renameFormat_patent-label', 'truncate_title', 'truncate_title_max', 'max_titlelength', 'max_authors','truncate_authors', 'number_truncate_authors', 'add_etal', 'etal', 'authors_delimiter', 'userInput', 'userInput_Default', 'replace_blanks', 'lower_case'], !revert);
        if (which=="all" && setting) {
            disablePreference("add_etal", "etal", false);
            disablePreference("userInput", "userInput_Default", false);
        }
        
    }
    
    // tablet features
    if(which=="zotfile-tablet" || which=="all") {
        setting=disablePreference("tablet", ['tablet-baseFolder', 'tablet-dest_dir', 'tablet-dest_dir-button', 'tablet-dest_dir-show', 'tablet-dest_dir-des', 'tablet-label-subfolders', 'tablet-projectFolders', 'tablet-projectFolders-button', 'tablet-subfolder', 'tablet-subfolderFormat', 'tablet-rename', 'tablet-storeCopyOfFile', 'tablet-storeCopyOfFile_suffix','pdfExtraction-Pull'], revert);
        if (which=="all" && setting) {
            disablePreference("tablet-storeCopyOfFile", "tablet-storeCopyOfFile_suffix", false);
            disablePreference("tablet-subfolder", "tablet-subfolderFormat", false);
        }
        // show alert about the tag used by zotfile
        if(which=="zotfile-tablet") {
            if(!document.getElementById('pref-zotfile-tablet').value) {
                if(confirm(this.ZFgetString('tablet.createSavedSearches', [this.getPref("tablet.tag")])))
                    this.Tablet.createSavedSearch("both");
            }
        }

    }
}.bind(Zotero.ZotFile);

var checkRenameFormat = function(which) {
    try {
        // get current item
        var win = Services.wm.getMostRecentWindow("navigator:browser");
        var items = win.ZoteroPane.getSelectedItems();
        var item = items.length > 0 ? items[0] : Zotero.Items.get(1);
        // get renaming rules
        var rename_format = document.getElementById('pref-zotfile-' + which).value;
        // check whether error in rule
        var filename;
        if(item.isRegularItem()) filename = this.getFilename(item, "", rename_format);
        if(item.parentItemID) if(item.isAttachment()) filename=this.getFilename(Zotero.Items.get(item.parentItemID), "", rename_format);
    }
    catch (err) {}
    // alert user
    if (this.messages_error.length>0) {
        alert(this.messages_error.join("\n\n"));
        this.messages_error=[];
    }
}.bind(Zotero.ZotFile);

var updateFolderIcon = Zotero.Promise.coroutine(function* (which, revert) {
    var setting, icon_clear,icon_ok,icon_error;
    // Source Folder
    if(which=="source" || which=="all") {
        setting = document.getElementById('pref-zotfile-source_dir_ff').value;
        if(revert) setting = !setting;

        icon_clear=document.getElementById('id-zotfile-source_dir-clear');
        icon_ok=document.getElementById('id-zotfile-source_dir-ok');
        icon_error=document.getElementById('id-zotfile-source_dir-error');
        
        // if source dir is set of ff download folder
        if(setting) {
            icon_clear.setAttribute('hidden', false);
            icon_error.setAttribute('hidden', true);
            icon_ok.setAttribute('hidden', true);
        }
        // if source dir is set custom folder
        if(!setting) {
            icon_clear.setAttribute('hidden', true);
            if(yield checkFolderLocation("source_dir")) {
                icon_ok.setAttribute('hidden', false);
                icon_error.setAttribute('hidden', true);
            }
            else {
                icon_error.setAttribute('hidden', false);
                icon_ok.setAttribute('hidden', true);
            }
        }
    }

    // Dest Folder
    if(which=="dest" || which=="all") {
        setting = document.getElementById('pref-zotfile-import').value;
        if(revert) setting = !setting;

        icon_clear=document.getElementById('id-zotfile-dest_dir-clear');
        icon_ok=document.getElementById('id-zotfile-dest_dir-ok');
        icon_error=document.getElementById('id-zotfile-dest_dir-error');
        
        // if dest dir is set of ff download folder
        if(setting) {
            icon_clear.setAttribute('hidden', false);
            icon_error.setAttribute('hidden', true);
            icon_ok.setAttribute('hidden', true);
        }
        // if dest dir is set custom folder
        if(!setting) {
            icon_clear.setAttribute('hidden', true);
            if(yield checkFolderLocation("dest_dir")) {
                icon_ok.setAttribute('hidden', false);
                icon_error.setAttribute('hidden', true);
            }
            else {
                icon_ok.setAttribute('hidden', true);
                icon_error.setAttribute('hidden', false);
            }
        }
    }

    // Tablet
    if(which=="tablet" || which=="all") {

        icon_ok=document.getElementById('id-zotfile-tablet-ok');
        icon_error=document.getElementById('id-zotfile-tablet-error');
        
        // if dest dir is set custom folder
        if(yield checkFolderLocation("tablet.dest_dir")) {
            icon_ok.setAttribute('hidden', false);
            icon_error.setAttribute('hidden', true);
        }
        else {
            icon_ok.setAttribute('hidden', true);
            icon_error.setAttribute('hidden', false);
        }
        if(which!='all') changedBasefolder(this.getPref('tablet.dest_dir'));
    }
}.bind(Zotero.ZotFile));

async function chooseDestinationDirectory() {
	var folder = await Zotero.ZotFile.chooseDirectory();
	if (folder != '') {
		Zotero.ZotFile.setPref('dest_dir', folder);
		updateFolderIcon('dest', false);
		onImportPrefChange();
	}
}

async function onImportPrefChange() {
	if (!document.getElementById('pref-zotfile-import').value) return;
	// If changing from default to custom, choose directory now
	if (document.getElementById('pref-zotfile-dest_dir').value == '') {
		let destDir = await Zotero.ZotFile.chooseDirectory();
		// DEBUG: What if cancelled?
		Zotero.ZotFile.setPref('dest_dir', destDir);
		updateFolderIcon('dest', true);
	}
}

var checkFolderLocation = Zotero.Promise.coroutine(function* (folder) {
    var path = this.getPref(folder);
    return path != '' && (yield OS.File.exists(path));
}.bind(Zotero.ZotFile));

var previewFilename = function() {
    try {
        // get current item
        var win = Services.wm.getMostRecentWindow("navigator:browser");
        var items = win.ZoteroPane.getSelectedItems();
        var item = items[0];
        // get renaming rules
        var rename_format = document.getElementById('pref-zotfile-renameFormat').value;
        // get filename for preview
        var filename;
        if(item.isRegularItem()) filename=this.getFilename(item, "", rename_format);
        if(item.parentItemID) if(item.isAttachment()) filename=this.getFilename(Zotero.Items.get(item.parentItemID), "", rename_format);
        // return preview of filename
        return(filename);
    }
    catch (err) {
        return(this.ZFgetString('renaming.preview'));
    }
    if (this.messages_error.length>0) {
        alert(this.messages_error.join("\n\n"));
        this.messages_error=[];
    }
}.bind(Zotero.ZotFile);

var changedBasefolder = Zotero.Promise.coroutine(function* (dest_dir) {
    var baseFolderOld = this.temp;
    var baseFolderOldValid = yield OS.File.exists(baseFolderOld);
    var baseFolder = this.getPref('tablet.dest_dir');
    var baseFolderValid = yield checkFolderLocation('tablet.dest_dir');

    // only proceed if folder has changed and the old location was valid
    if(baseFolderOld != baseFolder && baseFolderOldValid) {
        var atts = yield this.Tablet.getAttachmentsOnTablet();
        // change from valid to invalid subfolder
        if(!baseFolderValid) {
            if(!confirm(this.ZFgetString('tablet.invalidFolder', [atts.length]))) {
                this.setPref('tablet.dest_dir', baseFolderOld);
                updateFolderIcon('tablet', false);
            }
        }
        // change from valid to valid
        if(baseFolderValid && atts.length>0) {
            // prompt user
            if(!confirm(this.ZFgetString('tablet.baseFolderChanged.prompt', [atts.length])))
                this.setPref('tablet.dest_dir', baseFolderOld);
        }
    }
    this.temp = this.getPref('tablet.dest_dir');
}.bind(Zotero.ZotFile));


// =========================== //
// FUNCTIONS: SUBFOLDER WINDOW //
// =========================== //

var editSubfolderSetting = function(index) {

    var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');
    var treerow;
    if (index != undefined || treechildren.childNodes.length < this.projectMax) {
        
        var label  =null;
        var folder =null;
        // get selected tree item if defined
        if (index != undefined) {
            if (index == 'rightclickmenu') {
                var tree = document.getElementById('id-zotfile-tablet-projectFolders-tree');
                index    = tree.currentIndex;
            }
            
            treerow = treechildren.childNodes[index].firstChild;
            label   = treerow.childNodes[0].getAttribute('label');
            folder  = treerow.childNodes[1].getAttribute('label');
        }

        // open dialog
        var io = {label: label, folder: folder, ok: false};
        window.openDialog('chrome://zotfile/content/optionsFolderEditor.xul', "id-zotfile-options-FolderEditor", "chrome, modal", io);
    
        if (!io.ok) return;
                                                         
        // determine folder seperator depending on OS
        var folder_sep="/";
        if (navigator.appVersion.indexOf("Win")!=-1) folder_sep="\\";

        // check: when folder not defined set to project name
        if(io.folder=="") io.folder=io.label;
        // check: beginning / or \ missing, add to folder
        if(io.folder.substr(0,1)!=folder_sep) io.folder=folder_sep + io.folder;

        if (folder_sep=="/") io.folder.replace(/[\\]/g, folder_sep);
        if (folder_sep=="\\") io.folder.replace("/", folder_sep);

        io.folder=io.folder.replace(/[:.]/g, folder_sep);
        io.folder=io.folder.replace("&", "and");
        io.folder=io.folder.replace(/[\?]/g, ' -');
        io.folder=io.folder.replace(folder_sep + " ", folder_sep);

        //add new item to tree
        if (index == undefined && io.label!="") {
            var treeitem   = document.createElement('treeitem');
            treerow        = document.createElement('treerow');
            var labelCell  = document.createElement('treecell');
            var folderCell = document.createElement('treecell');

            labelCell.setAttribute('label',io.label);
            folderCell.setAttribute('label',io.folder);

            treerow.appendChild(labelCell);
            treerow.appendChild(folderCell);
            treeitem.appendChild(treerow);
            treechildren.appendChild(treeitem);
        }
        //change existing tree item
        if (index != undefined) {
            treerow.childNodes[0].setAttribute('label',io.label);
            treerow.childNodes[1].setAttribute('label',io.folder);
            if (folder.toLowerCase()!=io.folder.toLowerCase()) changedSubfolder(folder,io.folder);
        }

        updateSubfolderPreferences();
    }
    else {
        this.infoWindow(this.ZFgetString('general.error'),this.ZFgetString('tablet.maxSubfolders', [this.projectMax]),8000);
    }
}.bind(Zotero.ZotFile);
  
var buildFolderList = function() {
    // clear tree
    var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');
    while (treechildren.hasChildNodes()) treechildren.removeChild(treechildren.firstChild);
    // get list of subfolders (labels and folders)
    var subfolders = JSON.parse(this.getPref("tablet.subfolders"));
    var label = subfolders.map(function(obj) {return obj.label;});
    var folder = subfolders.map(function(obj) {return obj.path;});
   
    // populate tree with preferences
    for (var i=0; i<folder.length; i++) {
        var treeitem = document.createElement('treeitem');
        var treerow = document.createElement('treerow');
        var labelCell = document.createElement('treecell');
        var folderCell = document.createElement('treecell');

        labelCell.setAttribute('label',label[i]);
        folderCell.setAttribute('label',folder[i]);

        treerow.appendChild(labelCell);
        treerow.appendChild(folderCell);
        treeitem.appendChild(treerow);
        treechildren.appendChild(treeitem);
    }
    updateSubfolderPreferences();
}.bind(Zotero.ZotFile);
          
var updateSubfolderPreferences = function() {
    var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');
    // populate preferences with tree items
    var subfolders = [];
    for (var i=0;i<treechildren.childNodes.length;i++) {
        var treerow = treechildren.childNodes[i].firstChild;
        var label = treerow.childNodes[0].getAttribute('label');
        var folder = treerow.childNodes[1].getAttribute('label');
        if (label!="" && folder!="") subfolders.push({'label':label,'path':folder});
    }
    this.setPref("tablet.subfolders", JSON.stringify(subfolders));
}.bind(Zotero.ZotFile);

var deleteSelectedSubfolder = function() {
    try {
        // get tree and currently selected item
        var tree = document.getElementById('id-zotfile-tablet-projectFolders-tree');
        var index = tree.currentIndex;
        var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');

        // get folder name
        var treerow = treechildren.childNodes[index].firstChild;
        var subfolder = treerow.childNodes[1].getAttribute('label');
        
        // check whether items in folder
        if(deleteSubfolder(subfolder)) {
        
            // remove item
            treechildren.removeChild(treechildren.childNodes[index]);
        
            // refresh subfolder preferences
            updateSubfolderPreferences();
                
            // select tree item
            if(treechildren.childNodes[index]) tree.view.selection.select(index);
            if(!treechildren.childNodes[index]) tree.view.selection.select(index-1);
        
        }
    }
    catch (err) {
    
    }
}.bind(Zotero.ZotFile);

var deleteSubfolder = Zotero.Promise.coroutine(function* (subfolder) {
    //create folder file
    var folder = this.Tablet.getTabletLocationFile(subfolder);
    if(!(yield OS.File.exists(folder))) return true;
    // get attachments in old subfolder
    var attInFolder = yield this.Tablet.getAttachmentsOnTablet(subfolder);
    // iterate through attachments in folder
    if (attInFolder.length > 0) {
        // ask user
        // promptUser: function(message,but_0,but_1_cancel,but_2) {
        var userInput=this.promptUser(this.ZFgetString('tablet.attsInDeletedSub', [attInFolder.length]),
            this.ZFgetString('tablet.attsInDeletedSub.getThem'),
            this.ZFgetString('general.cancel'),
            this.ZFgetString('tablet.attsInDeletedSub.moveThemToBase'));
        // Pull attachment
        if(userInput === 0) {
            for (var i = 0; i < attInFolder.length; i++) {
                try {
                    var att = attInFolder[i];
                    var item = Zotero.Items.get(att.parentItemID);
                    yield this.Tablet.getAttachmentFromTablet(att,false);
                }
                catch (e) {
                    this.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
                }
            }
            // show messages and handle errors
            this.showReportMessages(this.ZFgetString('tablet.AttsGotFromT'));
            this.handleErrors();
        }
        // move attachments to base folder
        if(userInput == 2) yield this.Tablet.setTabletFolder(attInFolder);
        // return false if user canceled
        if(userInput == 1) return(false);
    }
    // remove folder
    this.removeFile(folder);
    // return true if no false was returned so far
    return(true);
}.bind(Zotero.ZotFile));

var changedSubfolder = Zotero.Promise.coroutine(function* (projectFolderOld, projectFolderNew) {
    // get attachments in old subfolder
    var attInFolder = yield this.Tablet.getAttachmentsOnTablet(projectFolderOld);
    // create file old subfolder
    var path = this.Tablet.getTabletLocationFile(projectFolderOld);
    // move attachments to new subfolder
    var confirmed=0;
    if(attInFolder.length>0) confirmed=confirm(this.ZFgetString('tablet.moveAttsToNewSubfolder', [attInFolder.length, projectFolderOld, projectFolderNew]));
    if (confirmed) {
        this.Tablet.setTabletFolder(attInFolder, projectFolderNew)
            // remove folder if empty
            .then(() => this.removeFile(path));
    }
    if(attInFolder.length==0) this.removeFile(path);
}.bind(Zotero.ZotFile));

var moveSelectedSubfolderUp = function() {
    var tree = document.getElementById('id-zotfile-tablet-projectFolders-tree');
    var index = tree.currentIndex;
    if (index>0) {
        var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');
        // get selected row
        var treerowSelected = treechildren.childNodes[index].firstChild;
        var labelSelected = treerowSelected.childNodes[0].getAttribute('label');
        var folderSelected = treerowSelected.childNodes[1].getAttribute('label');
        // get upper row
        var treerowAbove = treechildren.childNodes[index-1].firstChild;
        var labelAbove = treerowAbove.childNodes[0].getAttribute('label');
        var folderAbove = treerowAbove.childNodes[1].getAttribute('label');
        // set upper row
        treerowAbove.childNodes[0].setAttribute('label',labelSelected);
        treerowAbove.childNodes[1].setAttribute('label',folderSelected);
        // set selected
        treerowSelected.childNodes[0].setAttribute('label',labelAbove);
        treerowSelected.childNodes[1].setAttribute('label',folderAbove);
        // update preferences
        updateSubfolderPreferences();
        // select correct item in tree
        tree.view.selection.select(index-1);
    }
}.bind(Zotero.ZotFile);

var moveSelectedSubfolderDown = function() {
    // getSelectedRowIndex
    var tree = document.getElementById('id-zotfile-tablet-projectFolders-tree');
    var index = tree.currentIndex;
    
    var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');

    if (index<treechildren.childNodes.length) {
       
        // get selected row
        var treerowSelected = treechildren.childNodes[index].firstChild;
        var labelSelected = treerowSelected.childNodes[0].getAttribute('label');
        var folderSelected = treerowSelected.childNodes[1].getAttribute('label');

        // get upper row
        var treerowBelow = treechildren.childNodes[index+1].firstChild;
        var labelBelow = treerowBelow.childNodes[0].getAttribute('label');
        var folderBelow = treerowBelow.childNodes[1].getAttribute('label');

        // set upper row
        treerowBelow.childNodes[0].setAttribute('label',labelSelected);
        treerowBelow.childNodes[1].setAttribute('label',folderSelected);

        // set selected
        treerowSelected.childNodes[0].setAttribute('label',labelBelow);
        treerowSelected.childNodes[1].setAttribute('label',folderBelow);
    
        // update preferences
        updateSubfolderPreferences();

        // select correct item in tree
        tree.view.selection.select(index+1);
    }
}.bind(Zotero.ZotFile);

var showSelectedSubfolder = function() {
    // getSelectedRowIndex
    var tree = document.getElementById('id-zotfile-tablet-projectFolders-tree');
    var index = tree.currentIndex;
    // get subfolder from tree
    var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');
    var treerow = treechildren.childNodes[index].firstChild;
    var folder = treerow.childNodes[1].getAttribute('label');
    // get folder object
    var folder = this.Tablet.getTabletLocationFile(folder);
    // show folder
    this.showFolder(folder);
}.bind(Zotero.ZotFile);


// ==================== //
// FUNCTIONS: PDF TOOL //
// =================== //

var updatePDFToolsStatus = Zotero.Promise.coroutine(function* () {
    var toolIsCompatible = this.pdfAnnotations.popplerExtractorSupported;
    var toolIsRegistered = this.pdfAnnotations.popplerExtractorTool;
    var updateButton = document.getElementById('pdf-annotations-extractor-update-button');
    var stringsBundle = document.getElementById('zotfile-options');
    var installPoppler = stringsBundle.getString('installPoppler');
    var updatePoppler = stringsBundle.getString('updatePoppler');

    // set button label
    str = toolIsRegistered ? updatePoppler : installPoppler;
//  str = toolIsRegistered ? "Update Poppler Tool" : "Download & Install Poppler Tool";
    updateButton.setAttribute('label', str);
    updateButton.setAttribute('disabled', false);
    
    // poppler pdf tool status if compatible (only mac for now...)
    if(toolIsCompatible && toolIsRegistered) {
        // get installed version from file
        var installedVersion = yield getInstalledVersion();
        // disable download botton if registered
        updateButton.setAttribute('disabled', true);
        // check for updated
        checkForUpdates(updateButton, installedVersion);
        // set version text
        var versionText = document.getElementById('pdf-annotations-extractor-version');
        versionText.setAttribute('hidden', false);
        versionText.setAttribute('value', this.ZFgetString('extraction.popplerInstalledVersion', [installedVersion]));
    }
    // disable button if poppler tool is not compatible
    if(!toolIsCompatible) updateButton.setAttribute('disabled', true);
    
    // extraction of pdfs
    // var annotation_prefs=['Pull','NoteFullCite','NoteTruePage'];
    // for (var i=0;i<annotation_prefs.length;i++) document.getElementById('id-zotfile-pdfExtraction-' + annotation_prefs[i]).disabled = !Zotero.ZotFile.pdfAnnotations.popplerExtractorTool;
        
}.bind(Zotero.ZotFile));

var checkForUpdates = function(button, installedVersion) {
    var url = this.popplerExtractorBaseURL + this.popplerExtractorFileName + '.version';
    // Find latest version for this platform
    return Zotero.HTTP.request("GET", url).then(xmlhttp => {
        if (xmlhttp.status == 200) {
            var serverVersion = parseFloat(xmlhttp.responseText);
            // if server version higher... update!
            if(serverVersion > installedVersion) button.setAttribute('disabled', false);
        }
    });
}.bind(Zotero.ZotFile.pdfAnnotations);

var getInstalledVersion = Zotero.Promise.coroutine(function* () {
    var path = this.pdfAnnotations.popplerExtractorPath + '.version';
    if (!(yield OS.File.exists(path))) return 1;
    var decoder = new TextDecoder(),
        text = yield OS.File.read(path).then(array => decoder.decode(array));
    return parseFloat(text);
}.bind(Zotero.ZotFile));

var downloadPDFTool = function() {
    Components.utils.import("resource://gre/modules/Downloads.jsm");
    // url
    var fileName = this.pdfAnnotations.popplerExtractorFileName;
    var url = this.pdfAnnotations.popplerExtractorBaseURL + fileName + ".zip";
    // target
    var file = Zotero.getZoteroDirectory();
    var zotero_dir = file.path;
    file.append(fileName + ".zip");
    // create download object
    var download = Downloads.createDownload({source: url, target: file});
    // start download
    download.then(function success(d) {
        d.start().then(function success(p) {
            // extract zip file
            var proc = Components.classes["@mozilla.org/process/util;1"].
                createInstance(Components.interfaces.nsIProcess);
            proc.init(Zotero.File.pathToFile("/usr/bin/unzip"));
            // define arguments
            var args = ["-o","-q", file.path, "-d"  + zotero_dir + "/ExtractPDFAnnotations"];
            // run process
            if (!Zotero.isFx36) {
                proc.runw(true, args, args.length);
            }
            else {
                proc.run(true, args, args.length);
            }
            // Set permissions to 755
            var extractorFile = Zotero.File.pathToFile(Zotero.ZotFile.pdfAnnotations.popplerExtractorPath);
            if (Zotero.isMac) {
                extractorFile.permissions = 33261;
            }
            else if (Zotero.isLinux) {
                extractorFile.permissions = 493;
            }
            // set ZotFile variable
            Zotero.ZotFile.pdfAnnotations.popplerExtractorTool=true;
            // enable poppler extractor option
            document.getElementById('id-zotfile-pdfExtraction-UsePDFJS-false').disabled=false;
            // update settings
            updatePDFToolsStatus();
        }, function(e) {
            // Zotero.ZotFile.infoWindow(Zotero.ZotFile.ZFgetString('general.error'), Zotero.ZotFile.ZFgetString('extraction.unableToDwnldPoppler', [e.name, e.message]),8000);
            Zotero.ZotFile.infoWindow(Zotero.ZotFile.ZFgetString('general.error'), "Unable to download poppler.", 8000);
        });
    });     
}.bind(Zotero.ZotFile);
