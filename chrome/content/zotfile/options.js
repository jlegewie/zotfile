
// ============================== //
// FUNCTIONS: PREFERENCES WINDOW  //
// ============================== //

// function to disable prefernce in pref window
// 'pref' can be passed as string or array
// returns setting if needed for further changes
function disablePreference(setting, pref, revert) {
    setting = document.getElementById('pref-zotfile-' + setting).value;
    if(revert) setting = !setting;
    if(typeof(pref)=='string') document.getElementById('id-zotfile-' + pref).disabled = !setting;
    if(typeof(pref)=='object') for (var i=0;i<pref.length;i++) document.getElementById('id-zotfile-' + pref[i]).disabled = !setting;
    return(setting);
}

function updatePreferenceWindow(which) {
    var setting;
    if(which=="all") {
        updatePDFToolsStatus();
        updateFolderIcon("all",false);
        Zotero.ZotFile.temp = Zotero.ZotFile.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data;
        /*if(document.getElementById('pref-zotfile-tablet-mode').value==2) {
            document.getElementById('id-zotfile-tablet-storeCopyOfFile').disabled = true;
            document.getElementById('id-zotfile-tablet-storeCopyOfFile_suffix').disabled = true;
        }*/
    }
    
    // disable ff download folder option for standalone
    if(Zotero.isStandalone) document.getElementById('id-zotfile-source_dir_ff-true').disabled=true;
    if(Zotero.version[0]<=2) document.getElementById('id-zotfile-removeDiacritics').disabled=true;

    // dis- and enable poppler extractor option
    document.getElementById('id-zotfile-pdfExtraction-UsePDFJS-false').disabled=!Zotero.ZotFile.pdfAnnotations.popplerExtractorTool;
    
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
                if(confirm(Zotero.ZotFile.ZFgetString('tablet.createSavedSearches', [Zotero.ZotFile.prefs.getCharPref("tablet.tag")]))) Zotero.ZotFile.createSavedSearch("both");
            }
        }

    }
}

function checkRenameFormat(which) {
    try {
        // get current item
        var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser");
        var items = win.ZoteroPane.getSelectedItems();
        var item = items.length>0 ? items[0] : Zotero.Items.get(1);
        // get renaming rules
        var rename_format = document.getElementById('pref-zotfile-' + which).value;
        // check whether error in rule
        var filename;
        if(item.isRegularItem()) filename=Zotero.ZotFile.getFilename(item, "", rename_format);
        if(item.getSource()) if(item.isAttachment()) filename=Zotero.ZotFile.getFilename(Zotero.Items.get(item.getSource()), "", rename_format);
    }
    catch (err) {}
    // alert user
    if (Zotero.ZotFile.messages_error.length>0) {
        alert(Zotero.ZotFile.messages_error.join("\n\n"));
        Zotero.ZotFile.messages_error=[];
    }
}

function updateFolderIcon(which,revert) {
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
            if(checkFolderLocation("source_dir")) {
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
            if(checkFolderLocation("dest_dir")) {
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
        if(checkFolderLocation("tablet.dest_dir")) {
            icon_ok.setAttribute('hidden', false);
            icon_error.setAttribute('hidden', true);
        }
        else {
            icon_ok.setAttribute('hidden', true);
            icon_error.setAttribute('hidden', false);
        }
        if(which!="all") changedBasefolder(Zotero.ZotFile.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data);
    }
}

function checkFolderLocation(folder) {
    var path=Zotero.ZotFile.prefs.getComplexValue(folder, Components.interfaces.nsISupportsString).data;
    if(path!="") if(Zotero.ZotFile.fileExists(path)) return(true);
    return(false);
}

function previewFilename() {
    try {
        // get current item
        var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser");
        var items = win.ZoteroPane.getSelectedItems();
        var item = items[0];
        // get renaming rules
        var rename_format = document.getElementById('pref-zotfile-renameFormat').value;
        // get filename for preview
        var filename;
        if(item.isRegularItem()) filename=Zotero.ZotFile.getFilename(item, "", rename_format);
        if(item.getSource()) if(item.isAttachment()) filename=Zotero.ZotFile.getFilename(Zotero.Items.get(item.getSource()), "", rename_format);
        // return preview of filename
        return(filename);
    }
    catch (err) {
        return(Zotero.ZotFile.ZFgetString('renaming.preview'));
    }
    if (Zotero.ZotFile.messages_error.length>0) {
        alert(Zotero.ZotFile.messages_error.join("\n\n"));
        Zotero.ZotFile.messages_error=[];
    }
}

function changedBasefolder(dest_dir) {
    var baseFolderOld=Zotero.ZotFile.temp;
    var baseFolderOldValid=Zotero.ZotFile.fileExists(baseFolderOld);
    var baseFolder=Zotero.ZotFile.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data;
    var baseFolderValid=checkFolderLocation("tablet.dest_dir");

    // only proceed if folder has changed and the old location was valid
    if(baseFolderOld!=baseFolder && baseFolderOldValid) {
        var atts=Zotero.ZotFile.getAttachmentsOnTablet();
        
        // change from valid to invalid subfolder
        if(!baseFolderValid) {
            if(!confirm(Zotero.ZotFile.ZFgetString('tablet.invalidFolder', [atts.length]))) {
                var str = Components.classes["@mozilla.org/supports-string;1"]
                    .createInstance(Components.interfaces.nsISupportsString);
                str.data = baseFolderOld;
                Zotero.ZotFile.prefs.setComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString, str);
                updateFolderIcon("tablet",false);
            }
        }
        // change from valid to valid
        if(baseFolderValid && atts.length>0) {
            // prompt user
            if(!confirm(Zotero.ZotFile.ZFgetString('tablet.baseFolderChanged.prompt', [atts.length]))) {
                var str = Components.classes["@mozilla.org/supports-string;1"]
                    .createInstance(Components.interfaces.nsISupportsString);
                str.data = baseFolderOld;
                Zotero.ZotFile.prefs.setComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString, str);
            }
        }
    }

    Zotero.ZotFile.temp=Zotero.ZotFile.prefs.getComplexValue("tablet.dest_dir", Components.interfaces.nsISupportsString).data;
}


// =========================== //
// FUNCTIONS: SUBFOLDER WINDOW //
// =========================== //

function editSubfolderSetting (index) {

    var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');
    var treerow;
    if (index != undefined || treechildren.childNodes.length<Zotero.ZotFile.projectMax) {
        
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
        Zotero.ZotFile.infoWindow(Zotero.ZotFile.ZFgetString('general.error'),Zotero.ZotFile.ZFgetString('tablet.maxSubfolders', [Zotero.ZotFile.projectMax]),8000);
    }
}
  
function buildFolderList () {
    var zz = Zotero.ZotFile;
    // clear tree
    var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');
    while (treechildren.hasChildNodes()) treechildren.removeChild(treechildren.firstChild);
    // get list of subfolders (labels and folders)
    var subfolders = JSON.parse(zz.prefs.getCharPref("tablet.subfolders"));
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
}
          
function updateSubfolderPreferences () {
    var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');
    // populate preferences with tree items
    var subfolders = [];
    for (var i=0;i<treechildren.childNodes.length;i++) {
        var treerow = treechildren.childNodes[i].firstChild;
        var label = treerow.childNodes[0].getAttribute('label');
        var folder = treerow.childNodes[1].getAttribute('label');
        if (label!="" && folder!="") subfolders.push({'label':label,'path':folder});
    }
    Zotero.ZotFile.prefs.setCharPref("tablet.subfolders", JSON.stringify(subfolders));
}

function deleteSelectedSubfolder () {
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
}

function deleteSubfolder (subfolder) {
    
    //create folder file
    var folder=Zotero.ZotFile.getTabletLocationFile(subfolder);
    
    if(folder.exists()) {
        // get attachments in old subfolder
        var attInFolder=Zotero.ZotFile.getAttachmentsOnTablet(subfolder);
        
        // iterate through attachments in folder
        if (attInFolder.length>0) {
            // ask user
            // promptUser: function(message,but_0,but_1_cancel,but_2) {
            var userInput=Zotero.ZotFile.promptUser(Zotero.ZotFile.ZFgetString('tablet.attsInDeletedSub', [attInFolder.length]),
                Zotero.ZotFile.ZFgetString('tablet.attsInDeletedSub.getThem'),
                Zotero.ZotFile.ZFgetString('general.cancel'),
                Zotero.ZotFile.ZFgetString('tablet.attsInDeletedSub.moveThemToBase'));
    
            // Pull attachment
            if(userInput===0) {
                for (var i=0; i < attInFolder.length; i++) {
                    try {
                        var att  = attInFolder[i];
                        var item = Zotero.Items.get(att.getSource());
                        var attID=Zotero.ZotFile.getAttachmentFromTablet(item,att,false);
                    }
                    catch (e) {
                        Zotero.ZotFile.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
                    }
                }
                // show messages and handle errors
                Zotero.ZotFile.showReportMessages(Zotero.ZotFile.ZFgetString('tablet.AttsGotFromT'));
                Zotero.ZotFile.handleErrors();
            }

            // move attachments to base folder
            if(userInput==2) Zotero.ZotFile.setTabletFolder(attInFolder,"");
            
            // return false if user canceled
            if(userInput==1) return(false);
            
        }
        
        // remove folder
        Zotero.ZotFile.removeFile(folder);
    }

    // return true if no false was returned so far
    return(true);
            
}

function changedSubfolder (projectFolderOld,projectFolderNew) {
    // get attachments in old subfolder
    var attInFolder=Zotero.ZotFile.getAttachmentsOnTablet(projectFolderOld);
    // create file file old subfolder
    var file=Zotero.ZotFile.getTabletLocationFile(projectFolderOld);
    // move attachments to new subfolder
    var confirmed=0;
    if(attInFolder.length>0) confirmed=confirm(Zotero.ZotFile.ZFgetString('tablet.moveAttsToNewSubfolder', [attInFolder.length, projectFolderOld, projectFolderNew]));
    if (confirmed) {
//      var path=attInFolder[0].getFile().parent.path;
        Zotero.ZotFile.setTabletFolder(attInFolder,projectFolderNew);
        // remove folder if empty
        Zotero.ZotFile.removeFile(file);
    }
    if(attInFolder.length==0) Zotero.ZotFile.removeFile(file);
}

function moveSelectedSubfolderUp () {
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
}

function moveSelectedSubfolderDown () {
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
}

function showSelectedSubfolder() {
    // getSelectedRowIndex
    var tree = document.getElementById('id-zotfile-tablet-projectFolders-tree');
    var index = tree.currentIndex;
    
    // get subfolder from tree
    var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');
    var treerow = treechildren.childNodes[index].firstChild;
    var folder = treerow.childNodes[1].getAttribute('label');
    
    // get folder object
    var folderFile=Zotero.ZotFile.getTabletLocationFile(folder);

    // show folder
    Zotero.ZotFile.showFolder(folderFile);

}


// ==================== //
// FUNCTIONS: PDF TOOL //
// =================== //

function updatePDFToolsStatus() {
    var toolIsCompatible = Zotero.ZotFile.pdfAnnotations.popplerExtractorSupported;
    var toolIsRegistered = Zotero.ZotFile.pdfAnnotations.popplerExtractorTool;
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
        var installedVersion = getInstalledVersion();
        // disable download botton if registered
        updateButton.setAttribute('disabled', true);
        // check for updated
        checkForUpdates(updateButton,installedVersion);
        // set version text
        var versionText = document.getElementById('pdf-annotations-extractor-version');
        versionText.setAttribute('hidden', false);
        versionText.setAttribute('value', Zotero.ZotFile.ZFgetString('extraction.popplerInstalledVersion', [installedVersion]));
    }
    // disable button if poppler tool is not compatible
    if(!toolIsCompatible) updateButton.setAttribute('disabled', true);
    
    // extraction of pdfs
    // var annotation_prefs=['Pull','NoteFullCite','NoteTruePage'];
    // for (var i=0;i<annotation_prefs.length;i++) document.getElementById('id-zotfile-pdfExtraction-' + annotation_prefs[i]).disabled = !Zotero.ZotFile.pdfAnnotations.popplerExtractorTool;
        
}

function checkForUpdates(button,installedVersion) {
    var url = Zotero.ZotFile.pdfAnnotations.popplerExtractorBaseURL + Zotero.ZotFile.pdfAnnotations.popplerExtractorFileName + '.version';
    
    // Find latest version for this platform
    var sent = Zotero.HTTP.doGet(url, function (xmlhttp) {
        try {
            if (xmlhttp.status == 200) {
                
                var serverVersion = parseFloat(xmlhttp.responseText);

                // if server version higher... update!
                if(serverVersion>installedVersion) button.setAttribute('disabled', false);
                                    
            }
        }
        catch (e) {
//          onPDFToolsDownloadError(e);
        }
    });
        
}

function getInstalledVersion () {
    var filepath = Zotero.ZotFile.pdfAnnotations.popplerExtractorPath+'.version';
    var file=Zotero.ZotFile.createFile(filepath);
    if(Zotero.ZotFile.fileExists(filepath)) {
        var istream=Zotero.ZotFile.pdfAnnotations.openFileStream(file);
    
        // get line
        var line = {};
        cont = istream.readLine(line);
        return(parseFloat(line['value']));
    }
    else return(1);
}

function downloadPDFTool() {
    Components.utils.import("resource://gre/modules/Downloads.jsm");
    // url
    var fileName = Zotero.ZotFile.pdfAnnotations.popplerExtractorFileName;
    var url = Zotero.ZotFile.pdfAnnotations.popplerExtractorBaseURL + fileName + ".zip";
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
            proc.init(Zotero.ZotFile.createFile("/usr/bin/unzip"));
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
            var extractorFile=Zotero.ZotFile.createFile(Zotero.ZotFile.pdfAnnotations.popplerExtractorPath);
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
}
      
   
