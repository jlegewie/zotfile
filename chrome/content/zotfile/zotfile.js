Zotero.ZotFile = {
    
    prefs: null,
    wm: null,
    fileMap: {}, //maps collections to their file objects
    folderSep:null,
    projectNr: new Array("01","02","03","04","05","06","07","08","09","10","11","12","13","14","15"),
    projectPath: new Array("","","","","","","","","","","","","","",""),
    projectMax:15,
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
        
        this.wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
            
        // set source dir to custom folder if zotero standalone
        if(Zotero.isStandalone && this.prefs.getBoolPref('source_dir_ff')) this.prefs.setBoolPref('source_dir_ff',false);

        // version handeling
        var oldVersion=this.prefs.getCharPref("version");
        if(!Zotero.isFx36) Components.utils.import("resource://gre/modules/AddonManager.jsm");
        
        // if first run, check for zotfile reader and transfer preferences
        if (oldVersion=="") this.firstRun();

        // update current version
        if(!Zotero.isFx36) AddonManager.getAddonByID("zotfile@columbia.edu",function(aAddon) {
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

//          code for specific version upgrades
//          if(currentVersion=="2.1" && oldVersion!="2.1")
            
        });
        
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

        // show items in right-click menu conditional on options using an event listener
        // CODE NOT IMPLEMENTED (just to remember how it works if needed)
        /*var cm = document.getElementById('zotero-itemmenu');
        cm.addEventListener("popupshowing", this.showMenu, false);
        // Register the callback in Zotero as an item observer
        var notifierID = Zotero.Notifier.registerObserver(this.notifierCallback, ['item']);*/
        
        //this.createUI()
    },

    /*showMenu: function(event) {
        Zotero.ZotFile.infoWindow("ZotFile Report","event fired!",8000);
    },*/
    
    
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
        attIDs=this.removeDuplicates(attIDs);

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

//      this.infoWindow("ZotReader Report","button " + button,8000);

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
            pullreader: 6,
            sep2: 7,
            subfolders: 8,
            warning3: 9,
            push2readerFolder:new Array(10,11,12,13,14,15,16,17,18,19,20,21,22,23,24),
            sep3: 25,
            menuConfigure: 26,
            length:27
        };

        // list of disabled and show menu-items
        var disable = [m.subfolders,m.warning1,m.warning2,m.warning3], show = [];

        // check selected items
        var groupLib=1;
        if (!items[0].libraryID) groupLib=0;
        var oneItem=0;
        var oneAtt=0;
        var onePushed=0;
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
                    if(att.hasTag(Zotero.Tags.getID(this.prefs.getCharPref("tablet.tag"),0))) onePushed=1;
                }
            }

            // attachment item
            if(item.isAttachment())  {
                oneAtt=1;
                oneItem=1;
                if(item.hasTag(Zotero.Tags.getID(this.prefs.getCharPref("tablet.tag"),0))) onePushed=1;
            }
            if(onePushed==1) break;

        }

        // check whether destitination folder is defined (and valid)
        var dest_dir_valid=this.fileExists(this.prefs.getCharPref("tablet.dest_dir"));
//      if(this.prefs.getCharPref("tablet.dest_dir")!="") var dest_dir_valid=1;

        // warnings
        if(!oneItem) {
            show.push(m.warning1);
            menu.childNodes[m.warning1].setAttribute('label',"No item or attachment selected.");
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
                menu.childNodes[m.warning2].setAttribute('label',"Selected item(s) have no attachments.");
                            
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
                    menu.childNodes[m.warning2].setAttribute('label',"Location for tablet files is not defined or invalid.");
                }
                if(groupLib) {
                    show.push(m.warning2);
                    menu.childNodes[m.warning2].setAttribute('label',"Selected item is in group library.");
                }
                                                
                if(dest_dir_valid && !groupLib) {
                    show.push(m.push2reader,m.pullreader);

                    // set tooltip for base folder
                    menu.childNodes[m.push2reader].setAttribute('tooltiptext',"Send Attachment File to \'" + this.prefs.getCharPref("tablet.dest_dir") + "\'");

                    if(!onePushed) disable.push(m.pullreader);

                    // Collection based project folders
                    var projectsSet=0;
                    if(this.prefs.getIntPref("tablet.projectFolders")==1) {
                        show.push(m.sep2,m.subfolders);

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
                                projectsSet=1;
                            }
                        }
                    }

                    // message that no folders are defined
                    if(!projectsSet && this.prefs.getIntPref("tablet.projectFolders")!=0) {
                        var warning;
                        show.push(m.warning3);
                        if(this.prefs.getIntPref("tablet.projectFolders")==1) warning="Item is in no collection.";
                        if(this.prefs.getIntPref("tablet.projectFolders")==2) warning="No subfolders defined.";
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
        var filesuffix = prompt("Enter file suffix (press Cancel to add nothing)\n\nOriginal Filename\n"+original_filename+"\n\nNew Filename\n"+filename + " (YOUR INPUT)", default_str);
        if (filesuffix != '' && filesuffix != null) {
            // add file type to the file name
            filename = filename + " (" + filesuffix + ")";
        }
        return(filename);
    },
    
    truncateTitle: function(title){
        
        // truncnate title after : . and ?
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
    
    // Function replaces wildcard both for filename and subfolder definition
    replaceWildcard: function(zitem, rule){
        // get item type
        var item_type =  zitem.getType();
        var item_type_string = Zotero.ItemTypes.getLocalizedString(item_type);
        
        // get title of selected item
        var title = zitem.getField('title');
    
        //  truncnate title
        title = this.truncateTitle(title);
        
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
        if (zitem.getType()==2)  creatorType=[1,3];
        if (zitem.getType()==19) creatorType=[14];
        if (zitem.getType()==32) creatorType=[21];
        if (zitem.getType()==27) creatorType=[24];
        var add_etal=this.prefs.getBoolPref("add_etal");
        var author = "";
        var creators = zitem.getCreators();
        var numauthors = creators.length;
        for (var i=0; i < creators.length; i++) {
            if(creatorType.indexOf(creators[i].creatorTypeID)==-1) numauthors=numauthors-1;
        }
        var max_authors=(this.prefs.getBoolPref("truncate_authors")) ? this.prefs.getIntPref("max_authors") : 500;
        if (numauthors<=max_authors) add_etal=0;
        if (numauthors>max_authors) numauthors = 1;
        var j=0;
        for (i=0; i < creators.length; i++) {
            if (j<numauthors && creatorType.indexOf(creators[i].creatorTypeID)!=-1) {
                if (author!="") author = author + "_" + creators[i].ref.lastName;
                if (author=="") author = creators[i].ref.lastName;
                j=j+1;
            }
        }
        if (add_etal==1) author = author + this.prefs.getCharPref("etal");

        // date
        var year_issue="";
        var year = zitem.getField('date', true).substr(0,4);
        if(item_type==19)  {
            year_issue = zitem.getField('issueDate', true).substr(0,4);
            year = year_issue;
        }
    
        // create output from rule
        var field=0;
        var output='';
        for (i=0; i<rule.length; i++) {
            var char=rule.charAt(i);
            switch (char) {
                case '%':
                    field=1;
                    break;

                case 'a':
                    if (field==1) output = output + author;
                    field=0;
                    break;
                
                case 'A':
                    if (field==1) output = output + author.substr(0,1).toUpperCase();
                    field=0;
                    break;

                case 't':
                    if (field==1) output = output + title;
                    field=0;
                    break;

                case 'y':
                    if (field==1) output = output + year;
                    field=0;
                    break;

                case 'j':
                    if (field==1) output = output + journal;
                    field=0;
                    break;

                case 'p':
                    if (field==1) output = output + publisher;
                    field=0;
                    break;

                case 'n':
                    if (field==1) output = output + patentnr;
                    field=0;
                    break;

                case 'i':
                    if (field==1) output = output + assignee;
                    field=0;
                    break;

                case 'u':
                    if (field==1) output = output + year_issue;
                    field=0;
                    break;

                case 'w':
                    if (field==1) {
                        output = output + journal;
                        if(journal=="") output = output + publisher;
                    }
                    field=0;
                break;

                case 's':
                    if (field==1) output = output + journal_abb;
                    field=0;
                    break;

                case 'v':
                    if (field==1) output = output + volume;
                    field=0;
                    break;

                case 'e':
                    if (field==1) output = output + issue;
                    field=0;
                    break;
        
                case 'T':
                    if (field==1) output = output + item_type_string;
                    field=0;
                    break;

                default: output = output + char;
            }
        }
    return(output);
    
    },
    
    getFiletype: function(fname){
        if(fname) {
            var temp = [];
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
        var temp = [];
        temp = filename.split('.');
        return(temp[0] + k + "." + this.getFiletype(filename));
    },
        
    getFilename: function(item,filename_org){
        var filename;
        // create the new filename from the selected item
        var item_type =  item.getType();
        var rename_rule=this.prefs.getCharPref("renameFormat");
        if(item_type==19) rename_rule=this.prefs.getCharPref("renameFormat_patent");
        if (!this.prefs.getBoolPref("useZoteroToRename")) {
            
            filename=this.replaceWildcard(item, rename_rule);
        //var filename =  author + "_" + year + "_" + title;

            // Strip potentially invalid characters
            // (code line adopted from Zotero)
            filename = filename.replace(/[\/\\\?\*:|"<>\.]/g, '');

            // replace multiple blanks in filename with single blank & remove whitespace
            //var filename = filename.replace(/ {2,}/g, ' ');
            filename = Zotero.Utilities.trimInternal(filename);

            // replace blanks with '_' if option selected
            if (this.prefs.getBoolPref("replace_blanks"))  filename = filename.replace(/ /g, '_');

            // remove all the accents and other strange characters from filename
            if (Zotero.version[0]>=3 && this.prefs.getBoolPref("removeDiacritics")) filename = Zotero.Utilities.removeDiacritics(filename);
        
        }
        if (this.prefs.getBoolPref("useZoteroToRename")) filename=Zotero.Attachments.getFileBaseNameFromItem(item.itemID);
                    
        if(this.prefs.getBoolPref("userInput")) filename=this.addUserInput(filename,filename_org);
        
        // add filetype to filename
        if(filename_org!="") filename = filename + "." + this.getFiletype(filename_org);
        
        // return
        filename = Zotero.File.getValidFileName(filename);
        return(filename);
        
    },

    getLocation: function(zitem, dest_dir,subfolder, rule) {
        var subfolderFormat="";
        if(subfolder) {
            subfolderFormat=this.replaceWildcard(zitem, rule);
        }

//      var journal = zitem.getField('publicationTitle');
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

    moveFile: function(file, destination, filename){
    //  file.path!= this.createFile(this.completePath(location, filename)).path
        if(file.path!=this.completePath(destination,filename)) {
            var filename_temp=filename;
            var k=2;
            while(this.fileExists(destination, filename_temp)) {
                filename_temp = this.addSuffix(filename,k);
                k++;
                if(k>99) break;
            }
            filename=filename_temp;

            // create a nslFile Object of the destination folder
            var dir = this.createFile(destination);

            // move file to new location
            file.moveTo(dir, filename);
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
            if(message) this.infoWindow("ZotFile Error","The source folder is not valid. Please change the the source folder under Zotero-Actions-Zotfile Preferences. You might have to use a custom folder.",8000);
            return(-1);
        }

    },
    
    // FUNCTION: Attach New File(s) from Download Folder
    attachNewFile: function(){
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var items = win.ZoteroPane.getSelectedItems();
//      var items = ZoteroPane.getSelectedItems();

        var item = items[0];

        //check whether it really is an bibliographic item (no Attachment, note or collection)
        if (item.isRegularItem()) {

                // check whether valid FF default download folder
                if(this.prefs.getBoolPref('source_dir_ff') &&  this.getSourceDir(false)==-1) {
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
                if(file!=-1 && file!=-2) {
                    for (var i=0; i < file.length; i++) {

                        // confirmation from user
                        var file_oldpath=file[i].leafName;
                        var confirmed=1;
                        if (this.prefs.getBoolPref("confirmation")) confirmed=confirm("Do you want to rename and attach/link the file \'" + file_oldpath + "\' to the currently selected Zotero item?");
                        if(confirmed){
                            var attID;
                            // create linked attachment if local library
                            if (!item.libraryID) attID=Zotero.Attachments.linkFromFile(file[i], item.itemID,item.libraryID);

                            // import attachment if cloud library
                            if (item.libraryID) {
                                attID=Zotero.Attachments.importFromFile(file[i], item.itemID,item.libraryID);
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
//      else this.infoWindow("Zotfile Error","Selected item is in a Group Library.",8000);

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
        var tagID=Zotero.Tags.getID(this.prefs.getCharPref("tablet.tag"),0);
        return(att.hasTag(tagID));
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
        search.addCondition('tag', 'is', this.prefs.getCharPref("tablet.tag"));
        var results = search.search();
        var items = Zotero.Items.get(results);
        var atts = [];
        
        // iterate through attachment items
        for (var i=0; i < items.length; i++) {
            var item = items[i];

            // show warning if regular item with tablet tag
            if(item.isRegularItem()) this.infoWindow("ZotFile Warning","A regular Zotero item has the \'" + this.prefs.getCharPref("tablet.tag") + "\' tag. This tag should only be used by zotfile and not assigned manually.",8000);

            // check whether non-top level attachment
            if(!item.isTopLevelItem() && item.isAttachment()) {

                // show warning if no information in note
                if(this.getInfo(item,"mode")==="") this.infoWindow("ZotFile Warning","The information stored in attachment notes is missing for an attachment on the tablet. Make sure that you do not delete this information manually.",8000);
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
            var parent=Zotero.Items.get(item.getSource());
            var file=this.getTabletFile(item);

            if (file.exists()) {
                // get last modified time from att note and add att to list if file was modified
                var lastmod=this.getInfo(item,"lastmod");
                if(file.lastModifiedTime + ""!=lastmod) if (lastmod!="") atts.push(item);
            }
        }
        // return attachments
        return(atts);
    },

    setTabletFolder:function (items,projectFolder) {
        for (var i=0; i < items.length; i++) {
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
                }
            }
        }
        // report
        var mess_loc=(projectFolder!=="" && projectFolder!==null) ? ("'..." + projectFolder + "'.") : "the base folder.";
        Zotero.ZotFile.infoWindow("ZotFile Report","ZotFile has moved " + items.length + " attachments to " + mess_loc,8000);
    },
        
    scanTabletFiles: function() {
        // get items on tablet
        var items = this.getModifiedAttachmentsOnTablet();
        if(items.length===0) this.infoWindow("ZotFile Report","Scan Tablet did not find any updated items in the destination folder.",8000);
        
        // iterate through attachment items
        for (var i=0; i < items.length; i++) {
            // get attachment item, parent and file
            var item = items[i];
            var parent=Zotero.Items.get(item.getSource());
            var file=this.getTabletFile(item);

            // ask user
            var userInput=this.promptUser("Attachment \'" + file.leafName + "\' was modified. What do you want to do?","Get Attachment from Tablet","Update Zotero File","Cancel");

            // Pull attachment
            if(userInput===0) this.getAttachmentFromTablet(parent,item,false);

            // change modification date of attachment and update file
            if(userInput==1) {
                if(this.getInfo(item,"mode")==2) this.addInfo(item,"lastmod",file.lastModifiedTime);
                if(this.getInfo(item,"mode")==1) {
                        var projectFolder=this.getInfo(item,"projectFolder");

                    // first pull if already on reader
                    // this.getAttachmentFromTablet(parent,item,true);
                    var att_mode=this.getInfo(item,"mode");
                    if(att_mode==1 || att_mode!=this.prefs.getIntPref("tablet.mode")) {
                        var itemID=this.getAttachmentFromTablet(parent,item,true);
                        item = Zotero.Items.get(itemID);
                    }
                    // now push
                    var newAttID=this.sendAttachmentToTablet(parent,item,projectFolder);
                }

            }
        }
    },
                
    sendAttachmentToTablet: function(item, att, projectFolder, verbose) {
        if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.sendAttachmentToTablet - sending attachment " + att.getID() + " (mode is " + this.prefs.getIntPref("tablet.mode") + ")");
        var newFile;
        verbose = (typeof verbose == 'undefined') ? true : verbose;
        var newAttID=null;
        var file = att.getFile();

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

                // add tags and catch error if it does not work
                try {
                    if(!this.getTabletStatus(att)) att.addTag(this.prefs.getCharPref("tablet.tag"));
                    if (this.prefs.getBoolPref("tablet.tagParentPush")) item.addTag(this.prefs.getCharPref("tablet.tagParentPush_tag"));
                }
                catch (err) {
                    this.infoWindow("ZotFile Error","Zotfile was unable to send the file \'" + file.leafName + "\' to the tablet (error: tag assignment). Please try again and report the problem if it happens again.",8000);
                    return(null);
                }

                // create copy of file on tablet and catch errors
                try {
                    // create copy on tablet
                    var folder=this.getLocation(item,this.prefs.getCharPref("tablet.dest_dir")+projectFolder,this.prefs.getBoolPref("tablet.subfolder"),this.prefs.getCharPref("tablet.subfolderFormat"));
                    newFile=this.copyFile(file,folder,file.leafName);
                }
                catch (err) {
                    if(this.getTabletStatus(att)) att.removeTag(Zotero.Tags.getID(this.prefs.getCharPref("tablet.tag"),0));
                    this.infoWindow("ZotFile Error","Zotfile was unable to send the file \'" + file.leafName + "\' to the tablet (error: moving the file). Please try again and report the problem if it happens again.",8000);
                    return(null);
                }
            }

            // foreground mode: Rename and Move Attachment
            if(this.prefs.getIntPref("tablet.mode")==2) {
                newAttID=this.renameAttachment(item, att,false,this.prefs.getCharPref("tablet.dest_dir")+projectFolder,this.prefs.getBoolPref("tablet.subfolder"),this.prefs.getCharPref("tablet.subfolderFormat"),false);

                // get new attachment and file
                att = Zotero.Items.get(newAttID);
                newFile = att.getFile();

                // add tag to attachment
                if(!this.getTabletStatus(att)) att.addTag(this.prefs.getCharPref("tablet.tag"));
                if (this.prefs.getBoolPref("tablet.tagParentPush")) item.addTag(this.prefs.getCharPref("tablet.tagParentPush_tag"));
            }
            
            // add info to note (date of modification to attachment, location, and mode)
            this.addInfo(att,"lastmod",newFile.lastModifiedTime);
            this.addInfo(att,"mode",this.prefs.getIntPref("tablet.mode"));
            this.addInfo(att,"location",newFile.path);
            this.addInfo(att,"projectFolder",projectFolder);
            
            // notification
            if(verbose) this.infoWindow("ZotFile Report","The attachment \'" + newFile.leafName + "\' was sent to the tablet.",8000); // at \'" + projectFolder + "\'.
        }
        if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.sendAttachmentToTablet - attachment send with new ID " + newAttID);
        return(newAttID);
    },
    
    sendSelectedAttachmentsToTablet: function(project) {
        // save current selection
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var selection=win.ZoteroPane.itemsView.saveSelection();
        
        // get selected attachments
        var attIDs=this.getSelectedAttachments();
        var attID;

        // debug
        if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.sendSelectedAttachmentsToTablet - sending " + attIDs.length + " attachments to tablet");
            
        // get projectFolder
        var projectFolder="";
        if (project!='') {
            if(this.prefs.getIntPref("tablet.projectFolders")==1) projectFolder=this.projectPath[parseInt(project,10)-1];
            if(this.prefs.getIntPref("tablet.projectFolders")==2) projectFolder=this.prefs.getCharPref("tablet.projectFolders" + project + "_folder");
        }

        // debug
        if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.sendSelectedAttachmentsToTablet - projectFolder set to '" + projectFolder +"'");
        
        // Check which attachments are already on the reader
        var attOnReader=[];
        var attOnReaderCount=0;
        for (var i=0; i < attIDs.length; i++) {
            var hasTag=this.getTabletStatus(Zotero.Items.get(attIDs[i]));
            attOnReader.push(hasTag);
            if (hasTag) attOnReaderCount++;
        }

        // debug
        if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.sendSelectedAttachmentsToTablet - attachments on tablet: " + attOnReaderCount);
        
        var repush=!this.prefs.getBoolPref("tablet.confirmRepush");
    
        // Push attachments
        var confirmed=1;
        if (this.prefs.getBoolPref("confirmation_batch_ask") && attIDs.length>=this.prefs.getIntPref("confirmation_batch")) confirmed=confirm("Do you want to send " + attIDs.length + " attachments to the tablet?");
        if(confirmed) {
                if (!repush && attOnReaderCount>0) repush=confirm(attOnReaderCount + " of the selected attachments are already on the tablet. Do you want to replace these files on the tablet?");
                if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.sendSelectedAttachmentsToTablet - iterating through " + attIDs.length + " attachments...");
                for (i=0; i < attIDs.length; i++) {
                    var att = Zotero.Items.get(attIDs[i]);
                    var item= Zotero.Items.get(att.getSource());
                    if(!attOnReader[i] || (attOnReader[i] && repush)) {
                        // first pull if already on reader
                        if (attOnReader[i]) {
                            if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.sendSelectedAttachmentsToTablet - get attachment " + i + " from tablet before sending it");
                            var att_mode=this.getInfo(att,"mode");
                            if(att_mode==1 || att_mode!=this.prefs.getIntPref("tablet.mode")) {
                                attID=this.getAttachmentFromTablet(item,att,true);
                                att = Zotero.Items.get(attID);
                            }
                        }
                        // now push
                        if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.sendSelectedAttachmentsToTablet - send attachment " + i);
                        attID=this.sendAttachmentToTablet(item,att,projectFolder);
                        if(attID!==null && attIDs[i]!=attID) selection=this.arrayReplace(selection,attIDs[i],attID);
                    }
                }
                // restore selection
            if(Zotero.version>="3") win.ZoteroPane.itemsView.selectItems(selection);

            // debug
            if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.sendSelectedAttachmentsToTablet - attachments sent to tablet");
        }
        if(confirmed===0 && this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.sendSelectedAttachmentsToTablet - sending attachments canceled by user");
    },
    
    getAttachmentFromTablet: function (item, att,fakeRemove) {
        var attID=att.getID();
        var option=2;
        var itemPulled=false;
        var att_mode=this.getInfo(att,"mode");

        //debug
        if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.getAttachmentFromTablet - begin with mode " + att_mode);

        // get files
        var file_zotero=att.getFile();
        var file_reader=this.getTabletFile(att);

        // get modification times for files
        var time_reader = file_reader.exists() ? parseInt(file_reader.lastModifiedTime+"",10) : 0;
        var time_saved  = parseInt(this.getInfo(att,"lastmod"),10);
        var time_zotero = (file_zotero!=false) ? parseInt(file_zotero.lastModifiedTime+"",10) : 0;

        //debug
        if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.getAttachmentFromTablet - modification times: tablet=" + time_reader + "; saved=" + time_saved + "; zotero=" + time_zotero);

        // background mode
        if(att_mode==1) {
            if (time_reader!=0 || time_zotero!=0) {
                // set options
                if (time_reader>time_saved  && time_zotero<=time_saved) option=0;
                if (time_reader<=time_saved && time_zotero<=time_saved) option=1;
                if (time_reader<=time_saved && time_zotero>time_saved) option=1;
                if (time_reader>time_saved  && time_zotero>time_saved) option=2;
            
                // if attachment gets replaced
                if (!this.prefs.getBoolPref("tablet.storeCopyOfFile")) {
                    // prompt if both file have been modified
                    if (option==2) option=this.promptUser("Both copies of the attachment file \'" + file_zotero.leafName + "\'  have been modified. What do you want to do?\n\nRemoving the tablet file discards all changes made to the file on the tablet.","Replace Zotero File","Remove Tablet File","Cancel");

                    // Replace Zotero file
                    if(option==0) {
                            file_reader.moveTo(file_zotero.parent,file_zotero.leafName);
                        itemPulled=true;
                    }
                }
                // if saving a copy of the file as a new attachment with suffix
                if (this.prefs.getBoolPref("tablet.storeCopyOfFile"))  {
                    // only if reader file was modified
                    if(option!=1) {
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
                if(option==1) {
                    this.removeFile(file_reader);
                    itemPulled=true;
                }
            }
        }
        // foreground mode
        if(att_mode==2) {
            attID=this.renameAttachment(item, att,this.prefs.getBoolPref("import"),this.prefs.getCharPref("dest_dir"),this.prefs.getBoolPref("subfolder"),this.prefs.getCharPref("subfolderFormat"),false);
            att = Zotero.Items.get(attID);
            itemPulled=true;
            option = time_zotero>time_saved ? 0 : 1;
        }
        
        // post-processing if attachment has been removed & it's not a fake-pull
        if (itemPulled && !fakeRemove) {
            if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.getAttachmentFromTablet - post-processing after attachment was removed");
                // remove info (tag and att note)
            var tagID=Zotero.Tags.getID(this.prefs.getCharPref("tablet.tag"),0);
            att.removeTag(tagID);
            this.clearInfo(att);
        
            // extract annotations from attachment and add note
            if (this.prefs.getBoolPref("pdfExtraction.Pull") && option!=1) this.pdfAnnotations.getAnnotations([attID]);
        
            // remove tag from parent item
            tagID=Zotero.Tags.getID(this.prefs.getCharPref("tablet.tagParentPush_tag"),0);
            if(item.hasTag(tagID)) item.removeTag(tagID);
        
            // add tag to parent item
            if (this.prefs.getBoolPref("tablet.tagParentPull")) item.addTag(this.prefs.getCharPref("tablet.tagParentPull_tag"));
            
            // notification
            this.infoWindow("ZotFile Report","The attachment \'" + att.getFile().leafName + "\' was removed from the tablet.",8000);
            
        }

        //debug
        if(this.prefs.getBoolPref("debug")) Zotero.debug("zotfile.getAttachmentFromTablet - end");
        
        // return new id
        return(attID);
    },
    
    getSelectedAttachmentsFromTablet: function() {
        // save current selection
        var win = this.wm.getMostRecentWindow("navigator:browser");
        var selection=win.ZoteroPane.itemsView.saveSelection();

        // get selected attachments
        var attIDs=this.getSelectedAttachments();
        
        // Pull attachments
        var tagID=Zotero.Tags.getID(this.prefs.getCharPref("tablet.tag"),0);
        var confirmed=1;
        if (this.prefs.getBoolPref("confirmation_batch_ask") && attIDs.length>=this.prefs.getIntPref("confirmation_batch")) confirmed=confirm("Do you want to get the " + attIDs.length + " selected attachments from your tablet?");
        if(confirmed) for (var i=0; i < attIDs.length; i++) {
            var att = Zotero.Items.get(attIDs[i]);
            var item= Zotero.Items.get(att.getSource());
            if(att.hasTag(tagID)) {
                var attID=this.getAttachmentFromTablet(item,att,false);
                if(attID!==null && attIDs[i]!=attID) selection=this.arrayReplace(selection,attIDs[i],attID);
            }
        }
            // restore selection
        if(Zotero.version>="3") win.ZoteroPane.itemsView.selectItems(selection);
    },
    
    
    // ============================= //
    // FUNCTIONS: RENAME ATTACHMENTS //
    // ============================ //
            
    // Rename & Move Existing Attachments
    renameAttachment: function(item, att,import_att,dest_dir,subfolder,subfolderFormat,notification) {
        var file;
        var newAttID=null;
        // get link mode and item ID
        var linkmode = att.attachmentLinkMode;
        var itemID = item.id;
    
        // only proceed if linked or imported attachment
        if(att.isImportedAttachment() || linkmode==Zotero.Attachments.LINK_MODE_LINKED_FILE) {
    
            // get object of attached file
            file = att.getFile();

            // create file name using ZotFile rules
            var filename = this.getFilename(item, file.leafName);
            var location = this.getLocation(item,dest_dir,subfolder,subfolderFormat);

            if (import_att || item.libraryID) {
                                        
                // rename file associated with attachment
                att.renameAttachmentFile(filename);

                // change title of attachment item
                att.setField('title', filename);
                att.save();
        
                // get object of attached file
                file = att.getFile();
            
                // output
                if (linkmode!=Zotero.Attachments.LINK_MODE_LINKED_FILE && notification) this.infoWindow("Zotfile Report","Imported Attachment renamed to \'" + filename + "\'.",8000);
                                
            }
    
            // (a) LINKED ATTACHMENT TO IMPORTED ATTACHMENT
            if (linkmode==Zotero.Attachments.LINK_MODE_LINKED_FILE  && import_att) {
                                                                    
                // Attach file to selected Zotero item
                newAttID=Zotero.Attachments.importFromFile(file, itemID,item.libraryID);
        
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
    //      if (linkmode==Zotero.Attachments.LINK_MODE_IMPORTED_FILE && !import_att) {
            if (!import_att && !item.libraryID) {
                // move pdf file
                var newfile_path=this.moveFile(file,location, filename);
            
                if (newfile_path!="NULL") {
                                
                    // recreate the outfile nslFile Object
                    file = this.createFile(newfile_path);
    
                    // create linked attachment
                    newAttID=Zotero.Attachments.linkFromFile(file, itemID,item.libraryID);
        
                    // erase old attachment
                    att.erase();
        
                    if(notification) this.infoWindow("Zotfile Report","Linked Attachment \'" + file.leafName + "\'.",8000);
                    
                    // return id of attachment
                    return newAttID;
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
        if (this.prefs.getBoolPref("confirmation_batch_ask") && attIDs.length>=this.prefs.getIntPref("confirmation_batch")) confirmed=confirm("Do you want to move and rename " + attIDs.length + " attachments?");
        if(confirmed) {
            for (var i=0; i < attIDs.length; i++) {
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
                    var attID=this.renameAttachment(item, att,this.prefs.getBoolPref("import"),this.prefs.getCharPref("dest_dir"),this.prefs.getBoolPref("subfolder"),this.prefs.getCharPref("subfolderFormat"),true);
                    
                    //update list of selected item
                    if(attID!==null && attIDs[i]!=attID) selection=this.arrayReplace(selection,attIDs[i],attID);

                    // restore attachments note and tags
                    if(att_note!="" || att_tags.length>0) {
                        att = Zotero.Items.get(attID);
                        if(att_note!="") att.setNote(att_note);
                        if(att_tags) for each(var tag in att_tags) att.addTag(tag);
                        att.save();
                    }
                }
                if(this.getTabletStatus(att)) this.infoWindow("Zotfile Error","Attachment could not be renamed because it is on the tablet.",8000);

            }
                // restore selection
            if(Zotero.version>="3") win.ZoteroPane.itemsView.selectItems(selection);
        }
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
            //“pdftotext-{platform}”, where {platform} is “Win32”, “MacIntel”, “MacPPC”, “Linux-i686”, etc. (To determine your current platform, type javascript:alert(navigator.platform) in the Firefox URL bar and hit Enter.)

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

        popplerExtractorCall: function (pdfFilePath,outputFile) {
            // set up process
            var extractorFile=Zotero.ZotFile.createFile(this.popplerExtractorPath);
            var proc = Components.classes["@mozilla.org/process/util;1"].
                        createInstance(Components.interfaces.nsIProcess);
            proc.init(extractorFile);

            // define arguments
            var args = [pdfFilePath,outputFile];

            // run process
            if (!Zotero.isFx36) {
                proc.runw(true, args, args.length);
            }
            else {
                proc.run(true, args, args.length);
            }

        },

        getAnnotations: function(attIDs) {
//          Zotero.debug("ZotFile - pdfAnnotations - getAnnotations() - called");
            
                // get selected attachments if no att ids are passed
                if(attIDs==null) attIDs=Zotero.ZotFile.getSelectedAttachments();

//              Zotero.debug("ZotFile - pdfAnnotations - getAnnotations() - " + attIDs.length + " attachments");
                
                // iterate through attachment items
                var file;
                if(attIDs!=null) for (var i=0; i < attIDs.length; i++) {
                    
                    // get attachment item, parent and file
                    var att  = Zotero.Items.get(attIDs[i]);
                    var item = Zotero.Items.get(att.getSource());
            
                    // if file is on tablet in background mode, take the one which was modified
                    if(Zotero.ZotFile.getTabletStatus(att) && Zotero.ZotFile.getInfo(att,"mode")==1) {
                        var file_zotero=att.getFile();
                        var file_reader=Zotero.ZotFile.getTabletFile(att);
                        
                        // get times
                        var time_reader = file_reader.exists() ? parseInt(file_reader.lastModifiedTime+"",10) : 0;
                        var time_saved  = parseInt(Zotero.ZotFile.getInfo(att,"lastmod"),10);
                        var time_zotero = (file_zotero!=false) ? parseInt(file_zotero.lastModifiedTime+"",10) : 0;

                        if (time_reader!=0 || time_zotero!=0) {

                            // set options
                            var option;
                            if (time_reader>time_saved  && time_zotero<=time_saved) option=0;
                            if (time_reader<=time_saved && time_zotero<=time_saved) option=1;
                            if (time_reader<=time_saved && time_zotero>time_saved) option=1;
                            if (time_reader>time_saved  && time_zotero>time_saved) option=2;

                            // prompt if both file have been modified
                            if(option==2) option =Zotero.ZotFile.promptUser("Both copies of the attachment file \'" + file_zotero.leafName + "\'  have been modified. From which copy do you want to extract annotations?","Use Copy on Tablet","Use Copy in Zotero","Cancel");
                            if(option==0) file   =file_reader;
                            if(option==1) file   =file_zotero;
                            if(option==2) return(false);
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
                            this.popplerExtractorCall(file.path,outputFile);
                            var annotations = this.popplerExtractorGetAnnotationsFromFile(outputFile);
                            if(annotations.length!=0) this.createNote(annotations, item, "poppler");

                            // delete output text file
                            if(Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.popplerDeleteTxtFile")) Zotero.ZotFile.removeFile(Zotero.ZotFile.createFile(outputFile));
                        }
                    }
                }
                if (this.pdfAttachmentsForExtraction.length > 0 &&
                        (Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJS") || Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJSandPoppler"))) {
                        if (!Zotero.isFx36) {
                    // setup extraction process
                    this.errorExtractingAnnotations = false;
                    this.numTotalPdfAttachments = this.pdfAttachmentsForExtraction.length;
                    Zotero.showZoteroPaneProgressMeter("Extract PDF annotations (press ESC to cancel)",true);
                    var win = Zotero.ZotFile.wm.getMostRecentWindow("navigator:browser");
                    win.ZoteroPane.document.addEventListener('keypress', this.cancellationListener,false);
                    this.pdfHiddenBrowser = Zotero.Browser.createHiddenBrowser();
                    this.pdfHiddenBrowser.loadURI(this.PDF_EXTRACT_URL);
                    }
                    else Zotero.ZotFile.infoWindow("ZotFile Error","The extraction of pdf annotations with pdf.js is not supported on Firefox 3.6. Install the most recent Firefox version to use this feature. Mac users can also switch to poppler for the extraction of pdf annotations (in 'ZotFile Preferences' under 'Advanced Settings').",8000);
                }

//              Zotero.debug("ZotFile - pdfAnnotations - getAnnotations() - end - done");
            
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
            else Zotero.ZotFile.infoWindow("ZotFile Error","Annotation extraction failed.",8000);
            return annotations;
        },

        createNote: function(annotations, item, method) {
            var note_content=this.getNoteContent(annotations, item, method);
            var note = new Zotero.Item("note");
//          note.setNote(Zotero.Utilities.text2html(note_content));
            note.setNote(note_content);
            note.setSource(item.getID());
            var noteID = note.save();

//          Zotero.ZotFile.infoWindow("ZotFile Report","TAB:" + prefWindow.document.getElementById('zotfile-tabbox').selectedTab,8000);
        },

        getNoteContent: function(annotations, item, method) {
            // get current date
            var date_str=new Date().toUTCString();

            // set note title
            var note="<b>Extracted Annotations (" + date_str;
            if (Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJSandPoppler")) note += ", " + method;
            note += ")</b><br><br>";

            // get html tags for notes and highlights
            var htmlTagNoteStart=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.NoteHtmlTagStart");
            var htmlTagNoteEnd=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.NoteHtmlTagEnd");
            var htmlTagHighlightStart=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.HighlightHtmlTagStart");
            var htmlTagHighlightEnd=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.HighlightHtmlTagEnd");
            var htmlTagUnderlineStart=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.UnderlineHtmlTagStart");
            var htmlTagUnderlineEnd=Zotero.ZotFile.prefs.getCharPref("pdfExtraction.UnderlineHtmlTagEnd");

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
                if(Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.NoteFullCite")) cite=Zotero.ZotFile.replaceWildcard(item, "%a %y:").replace(/_(?!.*_)/," and ").replace(/_/g,", ");

                // add to note text pdfExtractionNoteRemoveHtmlNote
                if(anno.content && anno.content != "" &&
                    (!anno.markup || this.strDistance(anno.content,anno.markup)>0.15 )) {
                    var content = anno.content.replace(/(\r\n|\n|\r)/gm,"<br/>");
                    note += "<p>"+htmlTagNoteStart+content+" (note on p." + page + ")"+htmlTagNoteEnd+"</p><br>";
                }

                if(anno.markup && anno.markup != "") {
                    var markup = this.trim(anno.markup);
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
                    note += "<p>"+tagStart+"\""+markup+"\" (" + cite + page + ")" +tagEnd+"</p>";
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
                args.url = 'file://'+attachment.path;
                args.item = attachment.item;
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
            extractionComplete: function(annotations, item) {
                // put annotations into a Zotero note
                if (annotations.length > 0) this.createNote(annotations, item, "pdf.js");
                
                // move on to the next pdf, if there is one
                if (this.pdfAttachmentsForExtraction.length > 0) {
                    this.extractAnnotationsFromFiles();
                } else { // we're done
                    if (this.errorExtractingAnnotations) {
                        Zotero.ZotFile.infoWindow("ZotFile Report","ZotFile was unable to extract all annotations because pdf.js does not support certain PDF standards yet. Please see the JavaScript error console for more details.",8000);
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