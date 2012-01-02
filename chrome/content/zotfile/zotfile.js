Zotero.ZotFile = {
	
	prefs: null,
    wm: null,
	fileMap: {}, //maps collections to their file objects
	folderSep:null,
	projectNr: new Array("01","02","03","04","05","06","07","08","09","10","11","12","13","14","15"),     
	projectPath: new Array("","","","","","","","","","","","","","",""),
	projectMax:15,
	folderSep:null,
	zotfileURL:"http://www.columbia.edu/~jpl2136/zotfile.html",
	temp:"",

	mergeObserver: {
		observe: function(a, b, c){
			//this should get called when the dynamic overlay loading in createUI is complete.
			//we adjust UI stuff according to preferences here.
			document.getElementById("zotfile-usetags").setAttribute("checked",
				 Zotero.ZotFile.prefs.getBoolPref("useTags").toString());
		}		
 	},	


	// ========================= //
	// FUNCTIONS: INIT FUNCTIONS //
	// ========================= //

	createUI: function() {
		//load the overlay
		document.loadOverlay("chrome://zotfile/content/overlay.xul", this.mergeObserver);		
	},       
	
	firstRun: function() {
		// create saved search
		this.createSavedSearch();
		
		// transfer preferences and uninstall zotreader
		if(!Zotero.isFx36) AddonManager.getAddonByID("zotreader@columbia.edu",function(aAddon) { 
			
			// transfer preferences						
			Zotero.ZotFile.prefs.setCharPref("tablet.dest_dir",Zotero.ZotReader.prefs.getCharPref("dest_dir"));
			Zotero.ZotFile.prefs.setCharPref("tablet.subfolderFormat",Zotero.ZotReader.prefs.getCharPref("subfolderFormat"));
			Zotero.ZotFile.prefs.setBoolPref("tablet.subfolder",Zotero.ZotReader.prefs.getBoolPref("subfolder"));
			Zotero.ZotFile.prefs.setIntPref("tablet.mode",Zotero.ZotReader.prefs.getIntPref("mode"));
			Zotero.ZotFile.prefs.setIntPref("tablet.projectFolders",Zotero.ZotReader.prefs.getIntPref("projectFolders"));
			Zotero.ZotFile.prefs.setIntPref("tablet.mode",Zotero.ZotReader.prefs.getIntPref("mode"));

			for (i=0;i<Zotero.ZotFile.projectMax;i++) {
				Zotero.ZotFile.prefs.setBoolPref("tablet.projectFolders"+Zotero.ZotFile.projectNr[i],Zotero.ZotReader.prefs.getBoolPref("projectFolders"+Zotero.ZotFile.projectNr[i]));
				Zotero.ZotFile.prefs.setCharPref("tablet.projectFolders"+Zotero.ZotFile.projectNr[i]+"_folder",Zotero.ZotReader.prefs.getCharPref("projectFolders"+Zotero.ZotFile.projectNr[i]+"_folder"));
				Zotero.ZotFile.prefs.setCharPref("tablet.projectFolders"+Zotero.ZotFile.projectNr[i]+"_label",Zotero.ZotReader.prefs.getCharPref("projectFolders"+Zotero.ZotFile.projectNr[i]+"_label"));
			}	
			Zotero.ZotFile.prefs.setBoolPref("tablet",true);
			 
			//uninstall zotreader
			aAddon.uninstall();
			
			// prompt for restart
			if (confirm("ZotFile has transfered most of your preferences from ZotFile Reader to the new version of ZotFile and uninstalled the ZotFile Reader add-on.\n\nPlease restart Firefox now!")) {
				var boot = Components.classes["@mozilla.org/toolkit/app-startup;1"].getService(Components.interfaces.nsIAppStartup);  
				boot.quit(Components.interfaces.nsIAppStartup.eForceQuit|Components.interfaces.nsIAppStartup.eRestart);
				
			}								
		});
	},
	
	init: function () {
		//get preference objects
		this.prefs = Components.classes["@mozilla.org/preferences-service;1"].
		            getService(Components.interfaces.nsIPrefService);
		this.prefs = this.prefs.getBranch("extensions.zotfile.");

		this.ffPrefs = Components.classes["@mozilla.org/preferences-service;1"].
		            getService(Components.interfaces.nsIPrefService).getBranch("browser.download.");
		
		this.wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator);
			
		// set source dir to custom folder if zotero standalone
		if(Zotero.isStandalone & this.prefs.getBoolPref('source_dir_ff')) this.prefs.setBoolPref('source_dir_ff',false);

		// version handeling
		var oldVersion=this.prefs.getCharPref("version");
		if(!Zotero.isFx36) Components.utils.import("resource://gre/modules/AddonManager.jsm");  
		
		// if first run, check for zotfile reader and transfer preferences
		if (oldVersion=="") this.firstRun();

		// update current version
		if(!Zotero.isFx36) if(!Zotero.isFx36) AddonManager.getAddonByID("zotfile@columbia.edu",function(aAddon) {  
			var currentVersion=aAddon.version;
			
			// if different version then previously
			if(currentVersion!=oldVersion) {
				// open webpage
				if(currentVersion=="2.0") {
					if(!Zotero.isStandalone) Zotero.ZotFile.futureRun(function(){gBrowser.selectedTab = gBrowser.addTab(Zotero.ZotFile.zotfileURL); });
					if( Zotero.isStandalone) Zotero.ZotFile.futureRun(function(){ZoteroPane_Local.loadURI(Zotero.ZotFile.zotfileURL); });
				}
				
				// set current version
				Zotero.ZotFile.prefs.setCharPref("version",currentVersion);
			}

//			code for specific version upgrades
//			if(currentVersion=="2.1" & oldVersion!="2.1")
			
		});								
		
		// run in future to not burden start-up
		this.futureRun(function(){							
			// determine folder seperator depending on OS
		   Zotero.ZotFile.folderSep="/";
		   if (Zotero.isWin) Zotero.ZotFile.folderSep="\\";  	
		});
		
		//this.createUI()
	},  
	
	
	// ============================ //
	// FUNCTIONS: HELPER FUNCTIONS //
	// ============================ //
	
	// detect duplicates in array	
	removeDuplicates: function (x) {
		var x = x.sort();
		var y = [];

		y.push(x[0]);
		for (var i=1; i < (x.length); i++) {
	        if (x[i-1] != x[i]) y.push(x[i]);
		}
		return(y);		
	},

	//	search and replace in array
	arrayReplace: function (x,search, replace) {
		for(var i=0; i<x.length;i++ ) {  
			if(x[i]==search) x.splice(i,1,replace);  
		}  
		return(x);
	},

	getSelectedAttachments: function () {
		// get selected items
		var win = this.wm.getMostRecentWindow("navigator:browser"); 
		var items = win.ZoteroPane.getSelectedItems();

		// create array of attachments to pull
		var attIDs=[];
	    for (var i=0; i < items.length; i++) {
			var item = items[i]; 
			// regular item  				
	    	if(item.isRegularItem()) { 
		    	// get all attachments
				var attachments = item.getAttachments();

				// go through all attachments and add those with a tag
				for (var j=0; j < attachments.length; j++) attIDs.push(attachments[j]);

			}
			// attachment item  							
			if(item.isAttachment()) attIDs.push(item.getID());				
	  	}     
		// remove duplicate elements
	    var attIDs=this.removeDuplicates(attIDs);

		return(attIDs);
	},

	futureRun: function(aFunc) {
		var tm = Components.classes["@mozilla.org/thread-manager;1"].getService(Components.interfaces.nsIThreadManager);
		tm.mainThread.dispatch({run: function(){aFunc();}},Components.interfaces.nsIThread.DISPATCH_NORMAL);
	},
	
	createSavedSearch: function() {
		var search = new Zotero.Search(); 
		search.addCondition('tag', 'is', "_READ");
		search.addCondition('includeParentsAndChildren', 'true');
		search.addCondition('noChildren', 'true');
		search.setName("Files on Tablet");
		search.save();				
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
			'chrome,titlebar,toolbar,centerscreen'
				+ Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal',
			io
		);   
	},

	openSubfolderWindow: function (paneID, action) {
		var io = {
			pane: paneID,
			action: action
		};
		var prefWindow=window.openDialog('chrome://zotfile/content/options-projects.xul',
			'zotfile-tablet-subfolders',
			'chrome,titlebar,toolbar,centerscreen'
				+ Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal',
			io
		);  		
//		Zotero.ZotFile.infoWindow("ZotReader Report","TAB:" + prefWindow.document.getElementById('zotfile-tabbox').selectedTab,8000); 
//		prefWindow.getElementById('zotfile-tabbox').selectedTab=2;
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

	infoWindow: function(main, message, time){

		  var pw = new (Zotero.ProgressWindow);
		  pw.changeHeadline(main); 
		  if (main=="error") pw.changeHeadline(Zotero.getString("general.errorHasOccurred"));  pw.addDescription(message);
		  pw.show();
		  pw.startCloseTimer(time);

	},

	promptUser: function(message,option1,option2,option3) {
		var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
					.getService(Components.interfaces.nsIPromptService);

		var check = {value: false};                  // default the checkbox to false

		var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING +
				prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_IS_STRING  +
				prompts.BUTTON_POS_2 * prompts.BUTTON_TITLE_IS_STRING;

		var button = prompts.confirmEx(null, "ZotFile Dialog", message,
					flags,  option1,option2,option3, null, check);

//		this.infoWindow("ZotReader Report","button " + button,8000);

		return(button);

	},

	// ======================= //
	// FUNCTIONS: ZOTFILE MENU //
	// ======================= //


	buildZotFileMenu: function () {
	   var menuItemExtract=true;

	   // get selected items 
	   var win = this.wm.getMostRecentWindow("navigator:browser"); 
	   var items = win.ZoteroPane.getSelectedItems();

	   // get menu and recreate structure of child items
	   var menu = win.ZoteroPane.document.getElementById('id-zotfile-menu'); 
	   var m = {
			warning1:0,
			newatt: 1,
			rename: 2,
			extractanno: 3,			
			sep1: 4,			
			warning2: 5,
			push2reader: 6,
			pullreader: 7,
			sep2: 8,						
			subfolders: 9,
			warning3: 10,
			push2readerFolder:new Array(11,12,13,14,15,16,17,18,19,20,21,22,23,24,25),
			sep3: 26,
			menuConfigure: 27,
			length:28,
		}; 

		// list of disabled and show menu-items
		var disable = [m.subfolders,m.warning1,m.warning2,m.warning3], show = [];  

		// check selected items
		var groupLib=1;
		if (!items[0].libraryID) var groupLib=0;		
		var oneItem=0;
		var oneAtt=0;
		var onePushed=0;
		for (var i=0; i < items.length; i++) {				
			var item=items[i];			
			if(item.isRegularItem()) { 
				var oneItem=1;			
				// get all attachments
				var attachments = item.getAttachments();

				// go through all attachments
				for (var j=0; j < attachments.length; j++) {  
					var oneAtt=1;			
					// get current attachments
					var att = Zotero.Items.get(attachments[j]);
					if(att.hasTag(Zotero.Tags.getID(this.prefs.getCharPref("tablet.tag"),0))) var onePushed=1; 
				}
			}  

		   // attachment item 
		   if(item.isAttachment())  { 
				var oneAtt=1;						
				var oneItem=1;
				if(item.hasTag(Zotero.Tags.getID(this.prefs.getCharPref("tablet.tag"),0))) var onePushed=1; 				
			} 
			if(onePushed==1) break;

		} 

		// check whether destitination folder is defined (and valid)
		var dest_dir_valid=this.fileExists(this.prefs.getCharPref("tablet.dest_dir"));		
//		if(this.prefs.getCharPref("tablet.dest_dir")!="") var dest_dir_valid=1;

		// warnings
		if(!oneItem) {
			show.push(m.warning1);
			menu.childNodes[m.warning1].setAttribute('label',"No item or attachment selected.");			
		} 


		// at least one item and one attachment
		if(oneItem) {
			// add 'new att' and 'rename'
			show = [
				m.newatt,
				m.rename,
			];
			
			// warning
			if(!oneAtt) {
				disable.push(m.rename, m.extractanno);
				show.push(m.sep1,m.warning2);
				menu.childNodes[m.warning2].setAttribute('label',"Selected item(s) have no attachments.");						
							
			}

			// add 'Extract annotations'
			if(this.prefs.getBoolPref("pdfExtraction.MenuItem")) show.push(m.extractanno);			

			// tablet menu part
			if(this.prefs.getBoolPref("tablet") & oneAtt) {
				// add sep 
				show.push(m.sep1);
				
				// warnings
				if(!dest_dir_valid) {
					show.push(m.warning2);
					menu.childNodes[m.warning2].setAttribute('label',"Location for tablet files is not defined or invalid.");									
				}
				if(groupLib) {
					show.push(m.warning2);
					menu.childNodes[m.warning2].setAttribute('label',"Selected item is in group library.");												
				}
												
				if(dest_dir_valid & !groupLib) {
					show.push(m.push2reader,m.pullreader);

					// set tooltip for base folder
					menu.childNodes[m.push2reader].setAttribute('tooltiptext',"Send Attachment File to \'" + this.prefs.getCharPref("tablet.dest_dir") + "\'"); 															

					if(!onePushed) disable.push(m.pullreader);

					// Collection based project folders
					var projectsSet=0;						
					if(this.prefs.getIntPref("tablet.projectFolders")==1) { 
						show.push(m.sep2,m.subfolders);

						// get first selected item
						var item=items[0];
						if(item.isAttachment()) if(item.getSource()) var item=Zotero.Items.get(item.getSource()); 

						// create folders from collections
						var folders = []; 
						var collections=item.getCollections();
						for (i=0;i<collections.length;i++) {
							var collection=Zotero.Collections.get(collections[i]);
							var folder=this.folderSep + collection.getName();					
							var parent=collection.getParent();
			                while (parent) {
								var parent=Zotero.Collections.get(parent);  
			                    var folder=this.folderSep + parent.getName() + folder;
								var parent=parent.getParent();	            	
							}
							folders.push(folder);    
						}

						// add folders to menu
						if(folders.length) {
							var projectsSet=1;
							var folders=folders.sort();
							for (i=0;i<folders.length;i++) {
				                show.push(m.push2readerFolder[i]);
								menu.childNodes[m.push2readerFolder[i]].setAttribute('label',folders[i]); 
								menu.childNodes[m.push2readerFolder[i]].setAttribute('tooltiptext',"Send Attachment File to \'..." + folders[i] + "\'"); 												
								this.projectPath[i]=folders[i];
								if(i>9) break;
							} 
						}										
					}

					// User defined project folders		
					if(this.prefs.getIntPref("tablet.projectFolders")==2) {
					   show.push(m.sep2,m.subfolders,m.sep3,m.menuConfigure);
					   for (i=0;i<this.projectMax;i++) {
							if(this.prefs.getBoolPref("tablet.projectFolders" + this.projectNr[i])) {
								show.push(m.push2readerFolder[i]);
								menu.childNodes[m.push2readerFolder[i]].setAttribute('label', this.prefs.getCharPref("tablet.projectFolders" + this.projectNr[i] +"_label")); 
								menu.childNodes[m.push2readerFolder[i]].setAttribute('tooltiptext',"Send Attachment File to \'..." + this.prefs.getCharPref("tablet.projectFolders" + this.projectNr[i] +"_folder") + "\'"); 																		
								var projectsSet=1;
							}
						}
			        }  

			   		// message that no folders are defined
					if(!projectsSet & this.prefs.getIntPref("tablet.projectFolders")!=0) {
						show.push(m.warning3);
						if(this.prefs.getIntPref("tablet.projectFolders")==1) var warning="Item is in no collection."; 
						if(this.prefs.getIntPref("tablet.projectFolders")==2) var warning="No subfolders defined."; 
						menu.childNodes[m.warning3].setAttribute('label', warning); 				
					}
				}
			} 
		}      					   


		// enable all items by default
		for (i=0;i<m.length;i++) menu.childNodes[i].setAttribute('disabled', false);
		// disable menu items 
		for (var i in disable) menu.childNodes[disable[i]].setAttribute('disabled', true);
		// Hide all items by default
		for (i=0;i<m.length;i++) menu.childNodes[i].setAttribute('hidden', true);
		// Show items
		for (var i in show) menu.childNodes[show[i]].setAttribute('hidden', false);

	},


	// =================================== //
	// FUNCTIONS: GET FILE- & FOLDER NAME  //
	// =================================== //
	
	addUserInput: function(filename, original_filename){
		var default_str = this.prefs.getCharPref("userInput_Default");   
		if (default_str=="[original filename]") var default_str=original_filename;
		var filesuffix = prompt("Enter file suffix (press Cancel to add nothing)\n\nOriginal Filename\n"+original_filename+"\n\nNew Filename\n"+filename + " (YOUR INPUT)", default_str);
		if (filesuffix != '' & filesuffix != null) {
			// add file type to the file name
			filename = filename + " (" + filesuffix + ")";
		}             
		return(filename);	  
	},
	      
	truncateTitle: function(title){
		
	  // truncnate title after : . and ?	
  	  if(this.prefs.getBoolPref("truncate_title")) {
		  var truncate = title.search(/:|\.|\?/);
		  if(truncate!=-1) var title = title.substr(0,truncate);
	  }
	  
	  // truncate if to long
	  var title_length =  title.length;
	  if (title_length>this.prefs.getIntPref("max_titlelength")) {   
		var max_titlelength=this.prefs.getIntPref("max_titlelength");
		var before_trunc_char = title.substr(max_titlelength,1);
		
		// truncate title at max length
		var title = title.substr(0,max_titlelength);
	    
	   	// remove the last word until a space is found 
	    if(this.prefs.getBoolPref("truncate_smart") & title.search(" ")!=-1 & before_trunc_char.search(/[a-zA-Z0-9]/!=-1)) {
			while (title.substring(title.length-1, title.length) != ' ') title = title.substring(0, title.length-1);
			var title = title.substring(0, title.length-1);
		}   
	  } else {   
		// remove some non letter characters if they apear at the end of the title that was not truncated
		var endchar = title.substring(title.length-1, title.length);
		if (endchar == ':' || endchar == '?' || endchar == '.' || endchar == '/' || endchar == '\\' || endchar == '>' || endchar == '<' || endchar == '*' || endchar == '|') {
		  var title = title.substring(0, title.length-1);
		}
	  }
		
		// replace forbidden characters with meaningful alternatives (they can only apear in the middle of the text at this point)
		var title = title.replace(/[\/\\]/g, '-');
		var title = title.replace(/[\*|"<>]/g, '');
		var title = title.replace(/[\?:]/g, ' -');
		return(title);
	},
	
	// Function replaces wildcard both for filename and subfolder definition
	replaceWildcard: function(zitem, rule){
	  // get item type
	  var item_type =  zitem.getType();
	  var item_type_string = Zotero.ItemTypes.getLocalizedString(item_type);
	  	
	  // get title of selected item 
	  var title = zitem.getField('title');        
	
	  //  truncnate title 
	  var title = this.truncateTitle(title);
	  
	  // get journal
	  var journal = zitem.getField('publicationTitle');

	  // get journal abbreviation
	  var journal_abb = zitem.getField('journalAbbreviation');

	  // get publisher
	  var publisher = zitem.getField('publisher');

	  // get volume and issue
	  var volume = zitem.getField('volume');
	  var issue = zitem.getField('issue');

	  // get patent stuff
	  // var inventor
	  var assignee = zitem.getField('assignee');
	  var patentnr = zitem.getField('patentNumber');
	  var priority_date = patentnr.substr(2,4);

	  // get creator and create authors string
	  // creator types: author/editor(1,3) for book(2), inventor(14) for patent(19),programmer(24) for computer prog.(27),presenter(21) for presentation(32)
	  var creatorType=[1];
	  if (zitem.getType()==2)  var creatorType=[1,3];
	  if (zitem.getType()==19) var creatorType=[14];
	  if (zitem.getType()==32) var creatorType=[21];
	  if (zitem.getType()==27) var creatorType=[24];
	  var add_etal=this.prefs.getBoolPref("add_etal");
	  var author = "";
	  var creators = zitem.getCreators();
	  var numauthors = creators.length;
	  for (var i=0; i < creators.length; i++) {
	    if(creatorType.indexOf(creators[i].creatorTypeID)==-1) var numauthors=numauthors-1;
	  }
	  var max_authors=(this.prefs.getBoolPref("truncate_authors")) ? this.prefs.getIntPref("max_authors") : 500;
	  if (numauthors<=max_authors) var add_etal=0;
	  if (numauthors>max_authors) var numauthors = 1;
	  var j=0;
	  for (var i=0; i < creators.length; i++) {
	    if (j<numauthors & creatorType.indexOf(creators[i].creatorTypeID)!=-1) {
	      if (author!="") var author = author + "_" + creators[i].ref.lastName;  
	      if (author=="") var author = creators[i].ref.lastName;
	      var j=j+1;
	    }
	  }
	  if (add_etal==1) var author = author + this.prefs.getCharPref("etal");

	  // date
	  var year = zitem.getField('date', true).substr(0,4);	
	  if(item_type==19)  {
		var year_issue = zitem.getField('issueDate', true).substr(0,4);
		var year = year_issue;		  
	  }
	
	  // create output from rule
	  var field=0;
	  var output='';
	  for (var i=0; i<rule.length; i++) {  
	    var char=rule.charAt(i);
	    switch (char) {
	      case '%':
		 	var field=1;
		  break;

	      case 'a':
	        if (field==1) var output = output + author;
		 	var field=0;
	      break;
	                  
	      case 'A':
	        if (field==1) var output = output + author.substr(0,1).toUpperCase();
		 	var field=0;
	      break;	

	      case 't':
	         if (field==1) var output = output + title;
		 	 var field=0;
	      break;

	      case 'y':
	         if (field==1) var output = output + year;
		 	 var field=0;
		  break;

	      case 'j':
	         if (field==1) var output = output + journal;
		     var field=0;
	      break;

	      case 'p':
	         if (field==1) var output = output + publisher;
		 	 var field=0;
	      break;

	      case 'n':
	         if (field==1) var output = output + patentnr;
		 	 var field=0;
	      break;

	      case 'i':
	         if (field==1) var output = output + assignee;
		 	 var field=0;
	      break;

	      case 'u':
	         if (field==1) var output = output + year_issue;
		 	 var field=0;
	      break;

	      case 'w':
	         if (field==1) {
	            var output = output + journal;
	            if(journal=="") var output = output + publisher;
	         }
		     var field=0;
	      break;

	      case 's':
	         if (field==1) var output = output + journal_abb;
		 	 var field=0;
	      break;

	      case 'v':
	         if (field==1) var output = output + volume;
		 	 var field=0;
	      break;

	      case 'e':
	         if (field==1) var output = output + issue;
		 	 var field=0;
	      break;       
	
		  case 'T':
	         if (field==1) var output = output + item_type_string;
		 	 var field=0;
	      break;       		

	      default: var output = output + char;
	    }
	  }
	return(output);
	
	},
	
	getFiletype: function(fname){
		 if(fname) {	    
			 var temp = new Array();
			 temp = fname.split('.');
			 return(temp[temp.length-1].toLowerCase());     
		 }
		 else {
             return("");						
		 }
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
		var temp = new Array();
	 	temp = filename.split('.');
		return(temp[0] + k + "." + this.getFiletype(filename));
	},
		
	getFilename: function(item,filename_org){
	    // create the new filename from the selected item
		var item_type =  item.getType();
		var rename_rule=this.prefs.getCharPref("renameFormat");
		if(item_type==19) var rename_rule=this.prefs.getCharPref("renameFormat_patent");
		if (!this.prefs.getBoolPref("useZoteroToRename")) {
			
		  var filename=this.replaceWildcard(item, rename_rule);
		 //var filename =  author + "_" + year + "_" + title;

		  // Strip potentially invalid characters
		  // (code line adopted from Zotero)
		  var filename = filename.replace(/[\/\\\?\*:|"<>\.]/g, '');

		  // replace multiple blanks in filename with single blank
		  var filename = filename.replace(/ {2,}/g, ' ');

		  // replace blanks with '_' if option selected 	
		  if (this.prefs.getBoolPref("replace_blanks"))  var filename = filename.replace(/ /g, '_');
		
		}
		if (this.prefs.getBoolPref("useZoteroToRename")) filename=Zotero.Attachments.getFileBaseNameFromItem(item.itemID);
		        
		if(this.prefs.getBoolPref("userInput")) filename=this.addUserInput(filename,filename_org);
		
		// add filetype to filename
		if(filename_org!="") var filename = filename + "." + this.getFiletype(filename_org);
		
		// return 
		var filename = Zotero.File.getValidFileName(filename);
		return(filename);
		
	},

	getLocation: function(zitem, dest_dir,subfolder, rule) {
		var subfolderFormat="";
		if(subfolder) {
			subfolderFormat=this.replaceWildcard(zitem, rule);
		}

//		var journal = zitem.getField('publicationTitle');
		var folder = dest_dir + subfolderFormat;
		return(folder);
	},

	// ================ //
	// FUNCTIONS: FILES //
	// ================ //

	createFile: function(path) { 
	   try {
			var file = Components.classes["@mozilla.org/file/local;1"].
		    createInstance(Components.interfaces.nsILocalFile);
		  	file.initWithPath(path);
			return(file);
		}
		catch (err) {
			return(-1);
		}
	},

	// function to check whether a file exists
	// argument: path as string (with optional filename), zotero att, or file obj
	fileExists: function  (arg, filename) {
		// when string is passed
		if(typeof(arg)=='string') {
			if(filename!=null) var arg=this.completePath(arg,filename);		
			var file=this.createFile(arg);
		}
		// when object (i.e. zotero attachment item) is passed		
		if(typeof(arg)=='object') {
			if( arg.getFile) var file=arg.getFile();			
			if(!arg.getFile) var file=arg;
		}
		
		// check whether the file exsists
		try {				
		    return(file.exists());
		}
		catch (err) {
			 return(false);
		}	
	},

	moveFile: function(file, destination, filename){
	//	file.path!= this.createFile(this.completePath(location, filename)).path 
		if(file.path!=this.completePath(destination,filename)) {		
			var filename_temp=filename;
			var k=2;
			while(this.fileExists(destination, filename_temp)) {
				var filename_temp = this.addSuffix(filename,k);
				k++;
				if(k>99) break;				
			}
			var filename=filename_temp;

			// create a nslFile Object of the destination folder
			var dir = this.createFile(destination);

		    // move file to new location  
		    file.moveTo(dir, filename);
		}	
		return(file.path);

	},

	copyFile: function(file, destination, filename){

			// check whether already exists and add name if it does 
		if(file.path!=this.completePath(destination,filename)) {		

			var filename_temp=filename;
			var k=2;
					
			while(this.fileExists(destination,filename_temp)) {
				var filename_temp = this.addSuffix(filename,k);
				k++;
				if(k>99) break;
			}
			var filename=filename_temp;  	    		

			// create a nslFile Object of the destination folder
			var dir = this.createFile(destination);

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
				if(file.isDirectory()) this.infoWindow("ZotFile Report","ZotFile was unable delete the old folder probably because other files are in the folder.",8000);			
			}
		}
	},
		
	showFolder: function(folderFile) {
		// create folder if it does not exsist
		Zotero.File.createDirectoryIfMissing(folderFile);

		// open folder in file system
		folderFile.QueryInterface(Components.interfaces.nsILocalFile);
		try {
			folderFile.reveal();
		}
		catch (e) {
			// On platforms that don't support nsILocalFile.reveal() (e.g. Linux), we
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
		 var return_files=new Array();
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
			    if(!file.isDirectory() & !file.isHidden()) {    
					// is this a file we want to work with?
				     if (this.checkFileType(file))  {           			          
						return_files[success]=file;
					    var success=success+1;
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
		 var return_files=new Array();
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
		    if(!file.isDirectory() & !file.isHidden()) {    
		     // now we want to check which filetype we are looking at
		     // we only want to consider pdfs, docs, ... 
		      if (this.checkFileType(file)) {  
		        var modtime = file.lastModifiedTime;
		        var i=i+1;
		        // finally, we set return_files to the file with the most recent modification
		        if (modtime>lastfile_date){   
		          var lastfile_date=modtime;  
		          return_files[0]=file;
//		          lastfile=file;
		          var success=1;
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
				var path=downloadManager.userDownloadsDirectory.path;
		  }
	      if(!this.ffPrefs.getBoolPref('useDownloadDir') & this.ffPrefs.prefHasUserValue('lastDir') ) {									  				
		  	    var path=this.ffPrefs.getCharPref('lastDir');
		  }
		} 
		catch (err) {
			 var path="";
		}		
		 
		return(path);
	}, 
	
	getSourceDir: function(message) {
		var source_dir="";
				   	
		if ( this.prefs.getBoolPref("source_dir_ff")) var source_dir=this.getFFDownloadFolder();  	                                 		 
		if (!this.prefs.getBoolPref("source_dir_ff")) var source_dir=this.prefs.getCharPref("source_dir");
                                   
		// test whether valid source dir
		if (source_dir!="" & this.fileExists(source_dir)) {
			return (source_dir);			
		} else {
			if(message) this.infoWindow("ZotFile Error","The source folder is not valid. Please change the the source folder under Zotero-Actions-Zotfile Preferences. You might have to use a custom folder.",8000);
			return(-1);
		}		

	},
	
	// FUNCTION: Attach New File(s) from Download Folder
	attachNewFile: function(){
		var win = this.wm.getMostRecentWindow("navigator:browser"); 
		var items = win.ZoteroPane.getSelectedItems();		
//		var items = ZoteroPane.getSelectedItems();

		var item = items[0];

		//check whether it really is an bibliographic item (no Attachment, note or collection)
		if (item.isRegularItem()) { 

			  // check whether valid FF default download folder
			  if(this.prefs.getBoolPref('source_dir_ff') &  this.getSourceDir(false)==-1) {
				this.prefs.setBoolPref('source_dir_ff',false);
			  	this.prefs.setCharPref('source_dir',prompt("ZotFile Settings\n\nZotfile is not able to determine your default FF download folder. Please enter a custom source dir. The source dir is the directory where ZotFile looks for the most recently modified file when you use the ZotFile function 'Attach New File'."));  			
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
			  if(file!=-1 & file!=-2) {
					for (var i=0; i < file.length; i++) {

						// confirmation from user
						var file_oldpath=file[i].leafName;								
						var confirmed=1;
						if (this.prefs.getBoolPref("confirmation")) var confirmed=confirm("Do you want to rename and attach/link the file \'" + file_oldpath + "\' to the currently selected Zotero item?");  		
						if(confirmed){

							// create linked attachment if local library
							if (!item.libraryID) var attID=Zotero.Attachments.linkFromFile(file[i], item.itemID,item.libraryID);

							// import attachment if cloud library
							if (item.libraryID) {
								var attID=Zotero.Attachments.importFromFile(file[i], item.itemID,item.libraryID);
								this.removeFile(file[i]);
							}

							// Rename and Move Attachment
							var att = Zotero.Items.get(attID);
							this.renameAttachment(item, att,this.prefs.getBoolPref("import"),this.prefs.getCharPref("dest_dir"),this.prefs.getBoolPref("subfolder"),this.prefs.getCharPref("subfolderFormat"),true);

						}
					}	

			  }
			  else this.infoWindow("Zotfile Error","Unable to find file(s) in " + source_dir,8000);           

		}
		else this.infoWindow("Zotfile Error","Selected item is either an Attachment, a note, or a collection.",8000);	
//		else this.infoWindow("Zotfile Error","Selected item is in a Group Library.",8000);	

	},
	
	
	// ============================ //
	// FUNCTIONS: TABLET FUNCTIONS //
	// =========================== //	
	
	clearInfo: function (att) {
		att.setNote("");
	    att.save();  
	},

	getInfo: function (att,tagname) {
	  try {      
		  var note = att.getNote();
		  var search=note.search(tagname);
		  var content=note.substring(search);
		  var content=content.substring(content.search("{")+1,content.search("}"));

		  // for location tag: replace [BaseFolder] with destination folder
		  if(tagname=="location") var content=content.replace("[BaseFolder]",this.prefs.getCharPref("tablet.dest_dir"));

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
		if(tagname=="location" & this.prefs.getBoolPref("tablet.dest_dir_relativePath")) var value=value.replace(this.prefs.getCharPref("tablet.dest_dir"),"[BaseFolder]");

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
		var tagID=Zotero.Tags.getID(this.prefs.getCharPref("tablet.tag"),0);
		return(att.hasTag(tagID));
	},

	getTabletFile: function(att) {
		if(this.getTabletStatus(att)) {
			if(this.getInfo(att,"mode")==1) var file = this.createFile(this.getInfo(att,"location"));
			if(this.getInfo(att,"mode")==2) var file = att.getFile();
			return(file);										
		}
		return(false);
	},
	
	getTabletLocationFile: function(subfolder) {
		if(subfolder==null) var subfolder="";
		return(this.createFile(this.prefs.getCharPref("tablet.dest_dir")+subfolder));
	},
	
	getAttachmentsOnTablet: function(subfolder) {
		// search for attachments with tag
		var search = new Zotero.Search(); 
		search.addCondition('tag', 'is', this.prefs.getCharPref("tablet.tag"));
		var results = search.search();
		var items = Zotero.Items.get(results);
		var atts = [];

	    // if subfolder argument defined, iterate through attachments from search
		if(subfolder!=null) {
			for (var i=0; i < items.length; i++) {
				var item = items[i];   

				// attachment item with tag
				if(item.isAttachment()) if(this.getInfo(item,"projectFolder").toLowerCase()==subfolder.toLowerCase()) atts.push(item);					
			}
			return(atts);   	
		}
		if(subfolder==null) return(items);

	},

	setTabletFolder:function (items,projectFolder) {
	   	for (var i=0; i < items.length; i++) {
			var item = items[i];   				
			if(item.getSource()) {

				// get parent item
				var parent=Zotero.Items.get(item.getSource());

				// Rename and Move Attachment 

				// first pull if already on reader
				var att_mode=this.getInfo(item,"mode");
				/*
				// background mode: Move to new location				
				if(att_mode==1) {
					var file=item.getFile();
					var folder=this.getInfo(item,"location").replace(file.leafName,"");
					if(projectFolder!=null) var folder=folder.replace(this.getInfo(item,"projectFolder"),projectFolder);			   										        	
					var path=this.moveFile(file,folder,file.leafName);
					var newFile=this.createFile(path);
					
				}
				
				// foreground mode: Move to new location	
				if(att_mode==2) {
					var newAttID=this.renameAttachment(parent, item,false,this.prefs.getCharPref("tablet.dest_dir")+projectFolder,this.prefs.getBoolPref("tablet.subfolder"),this.prefs.getCharPref("tablet.subfolderFormat"),false);					

			   		if(projectFolder!=null) var newAttID=this.renameAttachment(parent, item,false,this.prefs.getCharPref("tablet.dest_dir")+projectFolder,this.prefs.getBoolPref("tablet.subfolder"),this.prefs.getCharPref("tablet.subfolderFormat"),false);
			   		if(projectFolder==null) var newAttID=this.renameAttachment(parent, item,false,this.prefs.getCharPref("tablet.dest_dir")+this.getInfo(item,"projectFolder"),this.prefs.getBoolPref("tablet.subfolder"),this.prefs.getCharPref("tablet.subfolderFormat"),false);

					// get new attachment and file
					var att = Zotero.Items.get(newAttID);
					var newFile = att.getFile();    											
					
				}
					
				// add info to note (date of modification to attachment, location, and mode)
//				this.addInfo(att,"lastmod",newFile.lastModifiedTime);  
//				this.addInfo(att,"mode",this.prefs.getIntPref("tablet.mode"));  
		        this.addInfo(att,"location",newFile.path);
				this.addInfo(att,"projectFolder",projectFolder);									
				*/
				if(att_mode==1 | att_mode!=this.prefs.getIntPref("tablet.mode")) {
					var itemID=this.removeAttachmentFromTablet(parent,item,true);
					var item = Zotero.Items.get(itemID); 											   
				}
				// now push
			   if(parent.isRegularItem()) {
			   		if(projectFolder!=null) this.moveAttachmentToTablet(parent,item,projectFolder,false);
			   		if(projectFolder==null) this.moveAttachmentToTablet(parent,item,this.getInfo(item,"projectFolder"),false);
			   }
	   		}
		}
		// report 
		var mess_loc=(projectFolder!="") ? ("'..." + projectFolder + "'.") : "the base folder."		
		Zotero.ZotFile.infoWindow("ZotFile Report","ZotFile has moved " + items.length + " attachments to " + mess_loc,8000);			   
	},
		
	scanTabletFiles: function() {
		var count=0;
		
		// get items on tablet
		var items = this.getAttachmentsOnTablet();
		
		// iterate through attachment items
		for (var i=0; i < items.length; i++) {
			var item = items[i];   

			// regular item with tag
			//if(item.isRegularItem()) this.infoWindow("ZotFile Error","A regular Zotero item has the \'" + this.prefs.getCharPref("tablet.tag") + "\' tag. This tag should only be used by zotfile and not assigned manually.",8000);		

			// attachment item with tag
			if(item.getSource()) if(item.isAttachment()) {

				// get parent item
				var parent=Zotero.Items.get(item.getSource());

				// Rename and Move Attachment
				if(parent.isRegularItem()) { 

					// get file    
					var file=this.getTabletFile(item);

					if (file.exists() & this.getInfo(item,"mode")!="") {

						// get last modified time from att note
						var lastmod=this.getInfo(item,"lastmod");

						// check whether file was modified and prompt if it was
						if(file.lastModifiedTime + ""!=lastmod) if (lastmod!="") {

							// ask user 
							var userInput=this.promptUser("Attachment \'" + file.leafName + "\' was modified. What do you want to do?","Get Attachment from Tablet","Update Zotero File","Cancel");

							// Pull attachment
							if(userInput==0) this.removeAttachmentFromTablet(parent,item,false); 

							// change modification date of attachment and update file   					
							if(userInput==1) {
								if(this.getInfo(item,"mode")==2) this.addInfo(item,"lastmod",file.lastModifiedTime); 
	 							if(this.getInfo(item,"mode")==1) { 
		     						var projectFolder=this.getInfo(item,"projectFolder");

									// first pull if already on reader
									// this.removeAttachmentFromTablet(parent,item,true);									
									var att_mode=this.getInfo(item,"mode");
									if(att_mode==1 | att_mode!=this.prefs.getIntPref("tablet.mode")) {
										var itemID=this.removeAttachmentFromTablet(parent,item,true);
										var item = Zotero.Items.get(itemID); 											   
									}
									// now push								
									var newAttID=this.moveAttachmentToTablet(parent,item,projectFolder);
								}

							}
							var count=count+1;

						}
					}
				}
			}				
		}
		if(count==0) this.infoWindow("ZotFile Report","Scan Tablet did not find any updated items in the destination folder.",8000);	  	    		
	},	
				
	moveAttachmentToTablet: function(item, att, projectFolder, verbose) {

		var verbose = (typeof verbose == 'undefined') ? true : verbose;
		var newAttID=null; 
		var file = att.getFile();     

	   if(this.fileExists(att) & this.checkFileType(att.getFile())) {
			
			// background mode: Rename and Move Attachment    				
	        if(this.prefs.getIntPref("tablet.mode")==1) {
				// change name of file
				if (this.prefs.getBoolPref("tablet.rename"))  {
					var filename=this.getFilename(item,file.leafName);
					if(filename!=file.leafName) {
						att.renameAttachmentFile(filename);
						att.setField('title', filename);
						att.save();
						var file = att.getFile();
					}
				}
				// create copy on tablet
		        var folder=this.getLocation(item,this.prefs.getCharPref("tablet.dest_dir")+projectFolder,this.prefs.getBoolPref("tablet.subfolder"),this.prefs.getCharPref("tablet.subfolderFormat"));		
				var newFile=this.copyFile(file,folder,file.leafName);
				var newAttID=att.getID();
			}

			// foreground mode: Rename and Move Attachment
			if(this.prefs.getIntPref("tablet.mode")==2) {
				var newAttID=this.renameAttachment(item, att,false,this.prefs.getCharPref("tablet.dest_dir")+projectFolder,this.prefs.getBoolPref("tablet.subfolder"),this.prefs.getCharPref("tablet.subfolderFormat"),false);					

				// get new attachment and file
				var att = Zotero.Items.get(newAttID);
				var newFile = att.getFile();    											
			}

			// add tag to attachment
			att.addTag(this.prefs.getCharPref("tablet.tag"));  
			
			// add tag to parent item
			if (this.prefs.getBoolPref("tablet.tagParentPush")) item.addTag(this.prefs.getCharPref("tablet.tagParentPush_tag"));  
			
			// add info to note (date of modification to attachment, location, and mode)
			this.addInfo(att,"lastmod",newFile.lastModifiedTime);  
			this.addInfo(att,"mode",this.prefs.getIntPref("tablet.mode"));  
	        this.addInfo(att,"location",newFile.path);
			this.addInfo(att,"projectFolder",projectFolder);		
			
			// notification
			if(verbose) this.infoWindow("ZotFile Report","The attachment \'" + newFile.leafName + "\' was sent to the tablet.",8000); // at \'" + projectFolder + "\'.
		} 
		return(newAttID);
	},    
	
	moveSelectedAttachmentsToTablet: function(project) {
	   // save current selection
	   var win = this.wm.getMostRecentWindow("navigator:browser"); 
	   var selection=win.ZoteroPane.itemsView.saveSelection();		
	                 		
	   // get selected attachments   
	   var attIDs=this.getSelectedAttachments();
	    
	   // get projectFolder
	   var projectFolder="";                                     
	   if (project!='') {
			if(this.prefs.getIntPref("tablet.projectFolders")==1) var projectFolder=this.projectPath[parseInt(project)-1];
			if(this.prefs.getIntPref("tablet.projectFolders")==2) var projectFolder=this.prefs.getCharPref("tablet.projectFolders" + project + "_folder");		
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
	   if (this.prefs.getBoolPref("confirmation_batch_ask") & attIDs.length>=this.prefs.getIntPref("confirmation_batch")) var confirmed=confirm("Do you want to send " + attIDs.length + " attachments to the reader?");  			   		
	   if(confirmed) {
		    if (!repush & attOnReaderCount>0) var repush=confirm(attOnReaderCount + " of the selected attachments are already on the reader. Do you want to replace these files on the reader?"); 
   	    	for (var i=0; i < attIDs.length; i++) { 
		        var att = Zotero.Items.get(attIDs[i]);			
		  		var item= Zotero.Items.get(att.getSource());
		  		if(!attOnReader[i] | (attOnReader[i] & repush)) {
					// first pull if already on reader
					if (attOnReader[i]) { 
						var att_mode=this.getInfo(att,"mode");
						if(att_mode==1 | att_mode!=this.prefs.getIntPref("tablet.mode")) {
							var attID=this.removeAttachmentFromTablet(item,att,true);
							var att = Zotero.Items.get(attID); 											   
						}
					}
					// now push
					var attID=this.moveAttachmentToTablet(item,att,projectFolder);
					if(attIDs[i]!=attID) var selection=this.arrayReplace(selection,attIDs[i],attID);
				}
		   	}
	   		// restore selection
			win.ZoteroPane.itemsView.selectItems(selection);   	
        }	   	
	},    
	
	removeAttachmentFromTablet: function (item, att,fakeRemove) {
		var itemPulled=false;
		// background mode
		if(this.getInfo(att,"mode")==1) {
			var attID=att.getID();             
			var file_zotero=att.getFile();
			var file_reader=this.getTabletFile(att);

			// get times				
			if(file_reader.exists()) var time_reader=parseInt(file_reader.lastModifiedTime+"");
			else var time_reader=0;
			var time_saved=parseInt(this.getInfo(att,"lastmod"));
			if(file_zotero!=false) var time_zotero=parseInt(file_zotero.lastModifiedTime+"");
			else var time_zotero=0;

			if (time_reader!=0 || time_zotero!=0) {
				// set options
				if (time_reader>time_saved  & time_zotero<=time_saved) var option=0;
				if (time_reader<=time_saved & time_zotero<=time_saved) var option=1;
				if (time_reader<=time_saved & time_zotero>time_saved) var option=1;
				if (time_reader>time_saved  & time_zotero>time_saved) var option=2;			
			
				// if attachment gets replaced			
				if (!this.prefs.getBoolPref("tablet.storeCopyOfFile")) {						
					// prompt if both file have been modified
					if (option==2) var option=this.promptUser("Both copies of the attachment file \'" + file_zotero.leafName + "\'  have been modified. What do you want to do?\n\nRemoving without replacement discards all changes made to the file on the reader.","Replace Zotero File","Get from Reader without Replacement","Cancel");					    					

					// Replace Zotero file
					if(option==0) {	
				        file_reader.moveTo(file_zotero.parent,file_zotero.leafName);
						var itemPulled=true;		
					}
				} 
				// if saving a copy of the file as a new attachment with suffix
				if (this.prefs.getBoolPref("tablet.storeCopyOfFile"))  {
					// only if reader file was modified
					if(option!=1) {					
						var filename=this.addSuffix(file_zotero.leafName,this.prefs.getCharPref("tablet.storeCopyOfFile_suffix"));
						
						//add linked attachment
	 					if (!item.libraryID & !this.prefs.getBoolPref("import")) {
							file_reader.moveTo(file_zotero.parent,filename);	
							var attID=Zotero.Attachments.linkFromFile(file_reader, item.itemID,item.libraryID);
							var itemPulled=true;
						}
						//imports attachment					
	 					if (item.libraryID | this.prefs.getBoolPref("import")) {
							// import file on reader
							var attID=Zotero.Attachments.importFromFile(file_reader, item.itemID,item.libraryID);
							var attAnnotated = Zotero.Items.get(attID);

							// rename file associated with attachment
							attAnnotated.renameAttachmentFile(filename);

							// change title of attachment item
							attAnnotated.setField('title', filename);
							attAnnotated.save();													
						
							// remove file on reader
							this.removeFile(file_reader);
						
							var itemPulled=true;
						}								        
					}				
				}			
				// Pull without replacement
				if(option==1) {	
					this.removeFile(file_reader);
					var itemPulled=true;	
				}	
			}		
		}
		// foreground mode
		if(this.getInfo(att,"mode")==2) {
			var attID=this.renameAttachment(item, att,this.prefs.getBoolPref("import"),this.prefs.getCharPref("dest_dir"),this.prefs.getBoolPref("subfolder"),this.prefs.getCharPref("subfolderFormat"),false);					
			var att = Zotero.Items.get(attID); 
			var itemPulled=true;
		}
      	
		// post-processing if attachment has been removed & it's not a fake-pull
		if (itemPulled & !fakeRemove) {
	        // remove info (tag and att note)
			var tagID=Zotero.Tags.getID(this.prefs.getCharPref("tablet.tag"),0);
			att.removeTag(tagID);		
			this.clearInfo(att);
		
			// extract annotations from attachment and add note    
			if (this.prefs.getBoolPref("pdfExtraction.Pull") & option!=1) this.pdfAnnotations.getAnnotations([attID]);
		
			// remove tag from parent item
			var tagID=Zotero.Tags.getID(this.prefs.getCharPref("tablet.tagParentPush_tag"),0);
			if(item.hasTag(tagID)) item.removeTag(tagID);
		
			// add tag to parent item
			if (this.prefs.getBoolPref("tablet.tagParentPull")) item.addTag(this.prefs.getCharPref("tablet.tagParentPull_tag"));  
			
			// notification
			this.infoWindow("ZotFile Report","The attachment \'" + att.getFile().leafName + "\' was removed from the tablet.",8000);
			
		}		
		
		// return new id   	
		return(attID);		
	},     
	
	removeSelectedAttachmentsFromTablet: function() { 
		// save current selection
		var win = this.wm.getMostRecentWindow("navigator:browser"); 
		var selection=win.ZoteroPane.itemsView.saveSelection();		

 		// get selected attachments   
		var attIDs=this.getSelectedAttachments();
		
		// Pull attachments
		var tagID=Zotero.Tags.getID(this.prefs.getCharPref("tablet.tag"),0);
		var confirmed=1;
		if (this.prefs.getBoolPref("confirmation_batch_ask") & attIDs.length>=this.prefs.getIntPref("confirmation_batch")) var confirmed=confirm("Do you want to get the " + attIDs.length + " selected attachments from your tablet?");  		
		if(confirmed) for (var i=0; i < attIDs.length; i++) {   	        
            var att = Zotero.Items.get(attIDs[i]);			
			var item= Zotero.Items.get(att.getSource());
       		if(att.hasTag(tagID)) var attID=this.removeAttachmentFromTablet(item,att,false);
       		if(attIDs[i]!=attID) var selection=this.arrayReplace(selection,attIDs[i],attID);
	    }
	    // restore selection
		win.ZoteroPane.itemsView.selectItems(selection);
	},
	
	
	// ============================= //
	// FUNCTIONS: RENAME ATTACHMENTS //
	// ============================ //
			
	// Rename & Move Existing Attachments
	renameAttachment: function(item, att,import_att,dest_dir,subfolder,subfolderFormat,notification) {
		// get link mode and item ID
		var linkmode = att.attachmentLinkMode;
		var itemID = item.id;
	
		// only proceed if linked or imported attachment
		if(att.isImportedAttachment() | linkmode==Zotero.Attachments.LINK_MODE_LINKED_FILE) {
	
			// get object of attached file
			var file = att.getFile();

			// create file name using ZotFile rules
			var filename = this.getFilename(item, file.leafName);
			var location = this.getLocation(item,dest_dir,subfolder,subfolderFormat);

			if (import_att | item.libraryID) {	
										
				// rename file associated with attachment
				att.renameAttachmentFile(filename);

				// change title of attachment item
				att.setField('title', filename);
				att.save();
		
				// get object of attached file
				var file = att.getFile();	
			
				// output
				if (linkmode!=Zotero.Attachments.LINK_MODE_LINKED_FILE & notification) this.infoWindow("Zotfile Report","Imported Attachment renamed to \'" + filename + "\'.",8000);	
								
			}
	
			// (a) LINKED ATTACHMENT TO IMPORTED ATTACHMENT
			if (linkmode==Zotero.Attachments.LINK_MODE_LINKED_FILE	& import_att) {	
																	
				// Attach file to selected Zotero item
	            var newAttID=Zotero.Attachments.importFromFile(file, itemID,item.libraryID);
		
				// remove file from hard-drive  
	            file.remove(false);

				// erase old attachment
				att.erase();
		
				// output
				if(notification) this.infoWindow("Zotfile Report","Imported Attachment \'" + filename + "\'.",8000);	
				
				// return id of attachment
				return newAttID;
			}
		
			// (b) TO LINKED ATTACHMENT (only if library is local and not cloud)
	//		if (linkmode==Zotero.Attachments.LINK_MODE_IMPORTED_FILE & !import_att) {
			if (!import_att & !item.libraryID) {												
				// move pdf file 
				var newfile_path=this.moveFile(file,location, filename);
			
				if (newfile_path!="NULL") {
					    	
			    	// recreate the outfile nslFile Object 
				    var file = this.createFile(newfile_path);
	
					// create linked attachment
					var newAttID=Zotero.Attachments.linkFromFile(file, itemID,item.libraryID);
		
					// erase old attachment
					att.erase();
		
					if(notification) this.infoWindow("Zotfile Report","Linked Attachment \'" + file.leafName + "\'.",8000);	
					
					// return id of attachment
					return newAttID;
				}
			}
		}
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
		if (this.prefs.getBoolPref("confirmation_batch_ask") & attIDs.length>=this.prefs.getIntPref("confirmation_batch")) var confirmed=confirm("Do you want to move and rename " + attIDs.length + " attachments?");  		
		if(confirmed) {
			for (var i=0; i < attIDs.length; i++) {			
				// get attachment and item
	            var att = Zotero.Items.get(attIDs[i]);			
				var item= Zotero.Items.get(att.getSource());

				// preserve attachment note and tags
				var att_note=att.getNote();
			    var att_tags=att.getTagIDs();
			
	            // Rename and Move Attachment 
				var file = att.getFile();
			    if(this.fileExists(att) & this.checkFileType(file)) {                                                  
					// move & rename
					var attID=this.renameAttachment(item, att,this.prefs.getBoolPref("import"),this.prefs.getCharPref("dest_dir"),this.prefs.getBoolPref("subfolder"),this.prefs.getCharPref("subfolderFormat"),true);												
					
					//update list of selected item
			        if(attIDs[i]!=attID) var selection=this.arrayReplace(selection,attIDs[i],attID);

					// restore attachments note and tags
					if(att_note!="" | att_tags) {
						var att = Zotero.Items.get(attID);  
						if(att_note!="") att.setNote(att_note);
						if(att_tags) for each (var tag in att_tags) att.addTagByID(tag);
						att.save();                   
					}
				}
			}			
		    // restore selection
			win.ZoteroPane.itemsView.selectItems(selection);  						
	    }           		  		
	},
	
	
	// =========================================== //
	// FUNCTIONS: PDF ANNOTATION EXTRACTION CLASS //
	// ========================================== //
	
	// class to extract pdf annotations
	pdfAnnotations : {
		pdfAttachmentsForExtraction: [],
		pdfTab: null,

		getAnnotations: function(attIDs) {
//			Zotero.debug("ZotFile - pdfAnnotations - getAnnotations() - called");
			
		 		// get selected attachments if no att ids are passed   
				if(attIDs==null) attIDs=Zotero.ZotFile.getSelectedAttachments();  			

//				Zotero.debug("ZotFile - pdfAnnotations - getAnnotations() - " + attIDs.length + " attachments");
				
				// iterate through attachment items
				if(attIDs!=null) for (var i=0; i < attIDs.length; i++) {
					
					// get attachment item, parent and file  	        
		            var att  = Zotero.Items.get(attIDs[i]);
					var item = Zotero.Items.get(att.getSource());     
			
					// if file is on tablet in background mode, take the one which was modified
					if(Zotero.ZotFile.getTabletStatus(att) & Zotero.ZotFile.getInfo(att,"mode")==1) {
						var file_zotero=att.getFile();
						var file_reader=Zotero.ZotFile.getTabletFile(att);
						
						// get times				
						if(file_reader.exists()) var time_reader=parseInt(file_reader.lastModifiedTime+"");
						else var time_reader=0;
						var time_saved=parseInt(Zotero.ZotFile.getInfo(att,"lastmod"));
						if(file_zotero!=false) var time_zotero=parseInt(file_zotero.lastModifiedTime+"");
						else var time_zotero=0;

						if (time_reader!=0 || time_zotero!=0) {

							// set options
							if (time_reader>time_saved  & time_zotero<=time_saved) var option=0;
							if (time_reader<=time_saved & time_zotero<=time_saved) var option=1;
							if (time_reader<=time_saved & time_zotero>time_saved) var option=1;
							if (time_reader>time_saved  & time_zotero>time_saved) var option=2;			

							// prompt if both file have been modified
							if(option==2) var option=Zotero.ZotFile.promptUser("Both copies of the attachment file \'" + file_zotero.leafName + "\'  have been modified. From which copy do you want to extract annotations?","Use Copy on Tablet","Use Copy in Zotero","Cancel");					    					
							if(option==0) var file=file_reader;		
							if(option==1) var file=file_zotero;
							if(option==2) return(false);
						}
					}
					else {
						var file = att.getFile();
					}

					// extract annotations from pdf and create note with annotations 
					if(Zotero.ZotFile.getFiletype(file.leafName)=="pdf") {
						var a = {};
						a.attachment = att;
						a.path = file.path;
						a.item = item;
						this.pdfAttachmentsForExtraction.push(a);
					}
				}
				if (this.pdfAttachmentsForExtraction.length > 0) {
					this.pdfTab = gBrowser.addTab('chrome://zotfile/content/pdfextract/extract.html');
					var tb = gBrowser.getBrowserForTab(this.pdfTab);
					var hasRun = false;
					var f = function () {
						tb.removeEventListener("load", f); // doesn't seem to work
						if (hasRun) return; 
						hasRun = true;
						Zotero.ZotFile.pdfAnnotations.extractAnnotationsFromFiles();
					}
					tb.addEventListener("load", f, true);
				}
//				Zotero.debug("ZotFile - pdfAnnotations - getAnnotations() - end - done");

		},

            /* open extract.html which runs the annotation extraction code */
            extractAnnotationsFromFiles: function() {
                var attachment = this.pdfAttachmentsForExtraction.shift();
                var args = {};
                args.url = 'file://'+attachment.path;
                args.item = attachment.item;
                args.callbackObj = this;
                args.callback = this.extractionComplete;
                Zotero.ZotFile.PdfExtractor.extractAnnotations(args);
            },

            /* called from extract.html when all annotations have been extracted. */
            extractionComplete: function(annotations, item) {
                //alert("extractionComplete() " + annotations.length); // jld
                // put annotations into a note
                if (annotations.length > 0) this.createNote(annotations, item);
                
                // move on to the next pdf, if there is one
                if (this.pdfAttachmentsForExtraction.length > 0) {
                    this.extractAnnotationsFromFiles();
                } else { // we're done
                    gBrowser.removeTab(this.pdfTab);
                    this.pdfTab = null;
                }
            },

	    createNote: function(annotations, item) {
		var note = new (Zotero.Item)("note"); 
//			note.setNote(Zotero.Utilities.text2html(note_content)); 
		var title = "<b>Extracted Annotations (" + (new Date()).toUTCString() + ")</b><br><br>";

		var note_content = title + this.getNoteContent(annotations, item);
		note.setNote(note_content);
		note.setSource(item.getID());
		var noteID = note.save();
//			Zotero.ZotFile.infoWindow("ZotFile Reader Report","TAB:" + prefWindow.document.getElementById('zotfile-tabbox').selectedTab,8000);
	    },

            getNoteContent: function(annotations, item) { 
		// get html tags for notes and highlights
		var htmlTagNoteStart = Zotero.ZotFile.prefs.getCharPref("pdfExtraction.NoteHtmlTagStart");
		var htmlTagNoteEnd = Zotero.ZotFile.prefs.getCharPref("pdfExtraction.NoteHtmlTagEnd");
		var htmlTagHighlightStart = Zotero.ZotFile.prefs.getCharPref("pdfExtraction.HighlightHtmlTagStart");
		var htmlTagHighlightEnd = Zotero.ZotFile.prefs.getCharPref("pdfExtraction.HighlightHtmlTagEnd");
		var htmlTagUnderlineStart = Zotero.ZotFile.prefs.getCharPref("pdfExtraction.UnderlineHtmlTagStart");
		var htmlTagUnderlineEnd = Zotero.ZotFile.prefs.getCharPref("pdfExtraction.UnderlineHtmlTagEnd");
                
		// iterate over annotations
                var note = "";
		for each (var anno in annotations) {
		    // get page
		    var page = anno.page;
		    if (Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.NoteTruePage")) {
			try {
			    var itemPages = item.getField('pages');
			    if (itemPages) {
                                page = parseInt(itemPages.split('-')[0])+page-1;
                            }
			}
			catch(err) {}
		    }
                    
		    // get citation
		    var cite = "p. ";
		    if (Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.NoteFullCite")) 
                        cite = Zotero.ZotFile.replaceWildcard(item, "%a %y:").replace(/_(?!.*_)/," and ").replace(/_/g,", ");
                    
		    // add to note text pdfExtractionNoteRemoveHtmlNote
                    var content = anno.content ? anno.content : "";
		    if (Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.NoteRemoveHyphens")) {
                        content = this.removeHyphens(content);
                    }
                    if (anno.type == "Text") {
			note += "<p>"+htmlTagNoteStart+content+htmlTagNoteEnd+"</p><br/>";
                    } else if (anno.type == "Highlight") {
			note += "<p>"+htmlTagHighlightStart+"\""+content+"\" (" + cite + page + ")" +htmlTagHighlightEnd+"</p><br/>";
                    } else if (anno.type == "Underline") {
			note += "<p>"+htmlTagUnderlineStart+"\""+content+"\" (" + cite + page + ")" +htmlTagUnderlineEnd+"</p><br/>";
                    }
		}
		return note;
	    },

		removeHyphens: function(str) {
			var pos = str.search(/[a-zA-Z]- [a-zA-Z]/g);
			while (pos != -1) {
			   str = str.substring(0,pos+1) + str.substring(pos+3,str.length);
			   pos = str.search(/[a-zA-Z]- [a-zA-Z]/g);
			}
			return str;
		}				

	}
				
};        