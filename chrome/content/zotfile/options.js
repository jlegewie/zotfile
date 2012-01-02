
// ============================== //
// FUNCTIONS: PREFERENCES WINDOW  //
// ============================== //

// function to disable prefernce in pref window
// 'pref' can be passed as string or array
// returns setting if needed for further changes
function disablePreference(setting, pref, revert) {
	var setting = document.getElementById('pref-zotfile-' + setting).value;
	if(revert) var setting = !setting;
	if(typeof(pref)=='string') document.getElementById('id-zotfile-' + pref).disabled = !setting;  			   
	if(typeof(pref)=='object') for (var i=0;i<pref.length;i++) document.getElementById('id-zotfile-' + pref[i]).disabled = !setting;
	return(setting);
}

function updatePreferenceWindow(which) {
		
	if(which=="all") {
		updatePDFToolsStatus();	           	
		updateFolderIcon("all",false);  
		Zotero.ZotFile.temp=Zotero.ZotFile.prefs.getCharPref("tablet.dest_dir");		
		/*if(document.getElementById('pref-zotfile-tablet-mode').value==2) {
		 	document.getElementById('id-zotfile-tablet-storeCopyOfFile').disabled = true;	
		 	document.getElementById('id-zotfile-tablet-storeCopyOfFile_suffix').disabled = true;
		}*/
	}
	
	if(Zotero.isStandalone) document.getElementById('id-zotfile-source_dir_ff-true').disabled=true;
	
	var revert=(which!="all") ? true : false;	
		
	// Add 'et al' 
	if(which=="etal" | which=="all") disablePreference("add_etal", "etal", revert);

	// max title length
	if(which=="truncate_title_max" | which=="all") disablePreference("truncate_title_max", "max_titlelength", revert);	

	// max authors 
	if(which=="truncate_authors" | which=="all") disablePreference("truncate_authors", "max_authors", revert);	

	// subfolder 
	if(which=="subfolder" | which=="all") disablePreference("subfolder", "subfolderFormat", revert);		
	
	// subfolder-tablet
	if(which=="subfolder-tablet" | which=="all") disablePreference("tablet-subfolder", "tablet-subfolderFormat", revert);
	
	// storeCopyOfFile-tablet
	if(which=="storeCopyOfFile" | which=="all") disablePreference("tablet-storeCopyOfFile", "tablet-storeCopyOfFile_suffix", revert);
	
	// batch renaming
	if(which=="confirm" | which=="all") disablePreference("confirmation_batch_ask", "confirmation_batch", revert);
	

	// filetypes
	if(which=="filetypes" | which=="all") disablePreference("useFileTypes", 'filetypes', revert);
			
	// Source Folder
	if(which=="source" | which=="all") {
		disablePreference("source_dir_ff", ['source_dir','source_dir-button'], !revert);
		if(which!="all") updateFolderIcon("source",true);  		
  	}

	// Destination Folder
	if(which=="dest" | which=="all") {
		var setting=disablePreference("import", ['dest_dir','dest_dir-button','subfolder','subfolderFormat'], !revert);		
		if (setting) document.getElementById('id-zotfile-subfolderFormat').disabled = !document.getElementById('pref-zotfile-subfolder').value;  			
		if(which!="all") updateFolderIcon("dest",true);  		
	}
	          
	// userinput 
	if(which=="userinput" | which=="all") disablePreference("userInput", "userInput_Default", revert);
	
	// Use Zotero to Rename
	if(which=="zotrename" | which=="all") {	
		var setting=disablePreference("useZoteroToRename", ['renameFormat', 'renameFormat-label', 'renameFormat-des1', 'renameFormat-des2', 'renameFormat-des3', 'renameFormat-des4', 'renameFormat_patent', 'renameFormat_patent-label', 'truncate_title', 'truncate_title_max', 'max_titlelength', 'max_authors','truncate_authors', 'add_etal', 'etal', 'userInput', 'userInput_Default', 'replace_blanks'], !revert);		
		if (which=="all" & setting) {
			  disablePreference("add_etal", "etal", false);
			  disablePreference("userInput", "userInput_Default", false);
		}
		
	}
	
	// tablet features
	if(which=="zotfile-tablet" | which=="all") {	
		var setting=disablePreference("tablet", ['tablet-baseFolder', 'tablet-dest_dir', 'tablet-dest_dir-button', 'tablet-dest_dir-show', 'tablet-dest_dir-des', 'tablet-label-subfolders', 'tablet-projectFolders', 'tablet-projectFolders-button', 'tablet-subfolder', 'tablet-subfolderFormat', 'tablet-rename', 'tablet-storeCopyOfFile', 'tablet-storeCopyOfFile_suffix','pdfExtraction-Pull'], revert);		
		if (which=="all" & setting) {
			disablePreference("tablet-storeCopyOfFile", "tablet-storeCopyOfFile_suffix", false);
  			disablePreference("tablet-subfolder", "tablet-subfolderFormat", false);
		}
		// show alert about the tag used by zotfile 
		if(which=="zotfile-tablet" & !document.getElementById('pref-zotfile-tablet').value) alert("Zotfile uses the tag '_READ' to remember files that are on the tablet. Please do not change this tag manually!");

	}
	
    	
}

function updateFolderIcon(which,revert) {
	// Source Folder
	if(which=="source" | which=="all") {
		var setting = document.getElementById('pref-zotfile-source_dir_ff').value;
		if(revert) var setting = !setting;

		var icon_clear=document.getElementById('id-zotfile-source_dir-clear');
		var icon_ok=document.getElementById('id-zotfile-source_dir-ok');
		var icon_error=document.getElementById('id-zotfile-source_dir-error');
		
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
	if(which=="dest" | which=="all") {
		var setting = document.getElementById('pref-zotfile-import').value;
		if(revert) var setting = !setting;

		var icon_clear=document.getElementById('id-zotfile-dest_dir-clear');
		var icon_ok=document.getElementById('id-zotfile-dest_dir-ok');
		var icon_error=document.getElementById('id-zotfile-dest_dir-error');
		
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
	if(which=="tablet" | which=="all") {

		var icon_ok=document.getElementById('id-zotfile-tablet-ok');
		var icon_error=document.getElementById('id-zotfile-tablet-error');
		
		// if dest dir is set custom folder
		if(checkFolderLocation("tablet.dest_dir")) {
			icon_ok.setAttribute('hidden', false);								
			icon_error.setAttribute('hidden', true);			
		}
		else {
			icon_ok.setAttribute('hidden', true);			
			icon_error.setAttribute('hidden', false);								
		}
		if(which!="all") changedBasefolder(Zotero.ZotFile.prefs.getCharPref("tablet.dest_dir"),Zotero.ZotFile.prefs.getCharPref("tablet.dest_dir"));		
	}
}

function checkFolderLocation(folder) {
	var path=Zotero.ZotFile.prefs.getCharPref(folder);
	if(path!="") if(Zotero.ZotFile.fileExists(path)) return(true);
	return(false);	
}

function previewFilename() {
	try {
		var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser"); 
		var items = win.ZoteroPane.getSelectedItems();		
		var item = items[0];    	
						
		if(item.isRegularItem()) var filename=Zotero.ZotFile.getFilename(item, "");
		if(item.getSource()) if(item.isAttachment()) var filename=Zotero.ZotFile.getFilename(Zotero.Items.get(item.getSource()), "");

		return(filename);		
	}
	catch (err) {
		return("[Please select a zotero item to see a preview of your renaming rules]");				
	}
}

function changedBasefolder(dest_dir) {
	var baseFolderOld=Zotero.ZotFile.temp;
	var baseFolderOldValid=Zotero.ZotFile.fileExists(baseFolderOld);	
	var baseFolder=Zotero.ZotFile.prefs.getCharPref("tablet.dest_dir");
	var baseFolderValid=checkFolderLocation("tablet.dest_dir");

	// only proceed if folder has changed and the old location was valid
	if(baseFolderOld!=baseFolder & baseFolderOldValid) {
		var atts=Zotero.ZotFile.getAttachmentsOnTablet();
		
		// change from valid to invalid subfolder
		if(!baseFolderValid) {
			if(!confirm("You have changed the location for tablet files to an invalid folder (" + atts.length + " files are in the old location).\n\nDo you want to proceed?")) {
				Zotero.ZotFile.prefs.setCharPref("tablet.dest_dir",baseFolderOld);
				updateFolderIcon("tablet",false);
			}
		}
		// change from valid to valid		
		if(baseFolderValid & atts.length>0) {
			// prompt user
			if(!confirm("You have changed the location for tablet files. There are " + atts.length + " files in the old location.\n\nDo you want to proceed?")) {
				Zotero.ZotFile.prefs.setCharPref("tablet.dest_dir",baseFolderOld);
			}
			
/*			var userInput=Zotero.ZotFile.promptUser("You have changed the location for tablet files. There are " + atts.length + " files in the old location.\n\nDo you want to move these files to the new location?","Move to new location","Revert change of location","Cancel");

			// Move to new location
			if(userInput==0) {
				Zotero.ZotFile.setTabletFolder(atts);
				// remove folder
				Zotero.ZotFile.removeFile(createFile(baseFolderOld));
			}

			// revert change  					
			if(userInput==1) Zotero.ZotFile.prefs.setCharPref("tablet.dest_dir",baseFolderOld);			
			*/
		}				
	}

	Zotero.ZotFile.temp=Zotero.ZotFile.prefs.getCharPref("tablet.dest_dir");
}


// =========================== //
// FUNCTIONS: SUBFOLDER WINDOW //
// =========================== //

function editSubfolderSetting (index) { 

	var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');

	if (index | treechildren.childNodes.length<Zotero.ZotFile.projectMax) {
			
		// get selected tree item if defined   
		if (index != undefined) {
			if (index == 'rightclickmenu') {					
				var tree = document.getElementById('id-zotfile-tablet-projectFolders-tree');
				var index = tree.currentIndex;	
			}
			
			var treerow = treechildren.childNodes[index].firstChild;
			var label = treerow.childNodes[0].getAttribute('label');
			var folder = treerow.childNodes[1].getAttribute('label');
		}

		// open dialog	
		var io = {label: label, folder: folder, ok: false};
		window.openDialog('chrome://zotfile/content/optionsFolderEditor.xul', "id-zotfile-options-FolderEditor", "chrome, modal", io);
	
		if (!io.ok) return;	   
                                                         
	   // determine folder seperator depending on OS   
	   var folder_sep="/";
	   if (navigator.appVersion.indexOf("Win")!=-1) var folder_sep="\\";  

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
		if (index == undefined & io.label!="") {	
			var treeitem = document.createElement('treeitem');
			var treerow = document.createElement('treerow');
			var labelCell = document.createElement('treecell');
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
		Zotero.ZotFile.infoWindow("ZotFile Error","ZotFile only supports up to " + Zotero.ZotFile.projectMax + " subfolders.",8000);
	}
} 
  
function buildFolderList () {
	// clear tree
	var treechildren = document.getElementById('id-zotfile-tablet-projectFolders-rows');
	while (treechildren.hasChildNodes()) treechildren.removeChild(treechildren.firstChild);

	// get list of subfolders (labels and folders)
	var label = [],folder = []; 
	for (i=0;i<Zotero.ZotFile.projectMax;i++) { 
		if(Zotero.ZotFile.prefs.getBoolPref("tablet.projectFolders" + Zotero.ZotFile.projectNr[i])) {
			label.push(Zotero.ZotFile.prefs.getCharPref("tablet.projectFolders" + Zotero.ZotFile.projectNr[i] + "_label"));
			folder.push(Zotero.ZotFile.prefs.getCharPref("tablet.projectFolders" + Zotero.ZotFile.projectNr[i] + "_folder"));
		}
	}
   
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

	// clear current preferences
    for (var i=0;i<Zotero.ZotFile.projectMax;i++) {
		Zotero.ZotFile.prefs.setBoolPref("tablet.projectFolders" + Zotero.ZotFile.projectNr[i],false);		 	
		Zotero.ZotFile.prefs.setCharPref("tablet.projectFolders" + Zotero.ZotFile.projectNr[i] + "_label","");		 	
		Zotero.ZotFile.prefs.setCharPref("tablet.projectFolders" + Zotero.ZotFile.projectNr[i] + "_folder","");		 			
	}

	// populate preferences with tree items
	for (var i=0;i<treechildren.childNodes.length;i++) { 
		var treerow = treechildren.childNodes[i].firstChild;
		var label = treerow.childNodes[0].getAttribute('label');
		var folder = treerow.childNodes[1].getAttribute('label');
		if (label!="" & folder!="") {
			Zotero.ZotFile.prefs.setBoolPref("tablet.projectFolders" + Zotero.ZotFile.projectNr[i],true);		 	
		 	Zotero.ZotFile.prefs.setCharPref("tablet.projectFolders" + Zotero.ZotFile.projectNr[i] + "_label",label);
		 	Zotero.ZotFile.prefs.setCharPref("tablet.projectFolders" + Zotero.ZotFile.projectNr[i] + "_folder",folder);
		}

	}

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
			var userInput=Zotero.ZotFile.promptUser("There are " + attInFolder.length + " attachments in the subfolder you want to delete. What do you want to do?","Get from Tablet","Move to Base Folder","Cancel");
	
			// Pull attachment
			if(userInput==0) {
				for (var i=0; i < attInFolder.length; i++) {   	        
		            var att  = attInFolder[i];			
					var item = Zotero.Items.get(att.getSource());
		       		var attID=Zotero.ZotFile.removeAttachmentFromTablet(item,att,false);
			    }
			}

			// move attachments to base folder  					
			if(userInput==1) Zotero.ZotFile.setTabletFolder(attInFolder,"");
			
			// return false if user canceled
			if(userInput==2) return(false);
			
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

	// move attachments to new subfolder
   	var confirmed=0;         
	if(attInFolder.length) var confirmed=confirm("There are " + attInFolder.length + " attachments in the subfolder \'" + projectFolderOld + "\'. You changed this folder to \'" + projectFolderNew + "\'. Do you want to move the attachments to the new folder?"); 
    if (confirmed) {
//		var path=attInFolder[0].getFile().parent.path;
		Zotero.ZotFile.setTabletFolder(attInFolder,projectFolderNew);  
		// remove folder if empty
		var file=Zotero.ZotFile.getTabletLocationFile(projectFolderOld);
		Zotero.ZotFile.removeFile(file);
	}	
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
	var toolIsRegistered = Zotero.ZotFile.pdfAnnotations.pdfExtraction;		
	var updateButton = document.getElementById('pdf-annotations-extractor-update-button');
			
	// button
	var installedVersion = getInstalledVersion();	
	str = toolIsRegistered ? "Update ExtractPDFAnnotations Tool" : "Download & Install ExtractPDFAnnotations Tool";
	updateButton.setAttribute('label', str);	
	if(toolIsRegistered) {
		updateButton.setAttribute('disabled', true);				
		checkForUpdates(updateButton,installedVersion);
	}
	
	// version
	if(toolIsRegistered) {
		var versionText = document.getElementById('pdf-annotations-extractor-version');
		versionText.setAttribute('hidden', false);
		versionText.setAttribute('value', "(installed version: "+installedVersion +")");		
	}

	// if tool is not campatible
	if (!Zotero.ZotFile.pdfAnnotations.pdfExtractionCompatible) updateButton.setAttribute('disabled', true);				
	
	// extraction of pdfs 
	var annotation_prefs=['MenuItem','Pull','NoteFullCite','NoteTruePage'];
	for (var i=0;i<annotation_prefs.length;i++) document.getElementById('id-zotfile-pdfExtraction-' + annotation_prefs[i]).disabled = !Zotero.ZotFile.pdfAnnotations.pdfExtraction; 
		
}

function checkForUpdates(button,installedVersion) {
	var url = Zotero.ZotFile.pdfAnnotations.extractorBaseURL + Zotero.ZotFile.pdfAnnotations.extractorFileName + '.version';
	
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
//			onPDFToolsDownloadError(e);
		}
	});
		
}

function getInstalledVersion () {
//	var filepath = '/Users/jpl2136/Documents/bibliography/Zotero' + "/ExtractPDFAnnotations/"+'ExtractPDFAnnotations-MacIntel'+'.version';	
	var filepath = Zotero.ZotFile.pdfAnnotations.extractorPath+'.version';
	var file=Zotero.ZotFile.createFile(filepath); 
	if(file.exists()) {	    	
		var istream=Zotero.ZotFile.pdfAnnotations.openFileStream(file);
	
		// get line
		var line = {};	
		cont = istream.readLine(line);	
		return(parseFloat(line['value']));	
	}
	else return(1);
}

function downloadPDFTool() {
	
		var ioService = Components.classes["@mozilla.org/network/io-service;1"]
							.getService(Components.interfaces.nsIIOService);
							
		
		var fileName=Zotero.ZotFile.pdfAnnotations.extractorFileName; 

		var url = Zotero.ZotFile.pdfAnnotations.extractorBaseURL + fileName+ ".zip";
		var uri = ioService.newURI(url, null, null);

		var file = Zotero.getZoteroDirectory();
	    var zotero_dir=file.path;
	    file.append(fileName+ ".zip");
		var fileURL = ioService.newFileURI(file);

		const nsIWBP = Components.interfaces.nsIWebBrowserPersist;
		var wbp = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
					.createInstance(nsIWBP);

		var progressListener = new Zotero.WebProgressFinishListener(function () {

		// extract zip file
		var proc = Components.classes["@mozilla.org/process/util;1"].
					createInstance(Components.interfaces.nsIProcess);
		proc.init(Zotero.ZotFile.createFile("/usr/bin/unzip"));
		// define arguments
		var args = ["-o","-q",file.path,"-d"  + zotero_dir + "/ExtractPDFAnnotations"];

 		// run process
		if (!Zotero.isFx36) {
			proc.runw(true, args, args.length);
		}
		else {
			proc.run(true, args, args.length);
		}

		// Set permissions to 755
		var extractorFile=Zotero.ZotFile.createFile(Zotero.ZotFile.pdfAnnotations.extractorPath); 
		if (Zotero.isMac) {
			extractorFile.permissions = 33261;
		}
		else if (Zotero.isLinux) {
			extractorFile.permissions = 493;
		}
		
		// set ZotFile variable
		Zotero.ZotFile.pdfAnnotations.pdfExtraction=true;
		
		// update settings
		updatePDFToolsStatus();	

	});
	
	document.getElementById('pdf-annotations-extractor-update-button').disabled = true;
	document.getElementById('pdf-annotations-extractor-update-button').setAttribute('label', "Downloading ExtractPDFAnnotations...");
	
	wbp.progressListener = progressListener;
//	Zotero.debug("Saving " + uri.spec + " to " + fileURL.spec);
	wbp.saveURI(uri, null, null, null, null, fileURL);
			
}
      
   