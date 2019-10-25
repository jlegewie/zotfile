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


Zotero.ZotFile = new function() {
    this.folderSep = null;
    this.projectNr = new Array('01','02','03','04','05','06','07','08','09','10','11','12','13','14','15');
    this.projectPath = new Array('','','','','','','','','','','','','','','');
    this.projectMax = 15;
    this.zotfileURL = 'http://www.zotfile.com';
    this.changelogURL = 'http://zotfile.com/index.html#changelog';
    this.temp = '';
    this.messages_warning = [];
    this.messages_report = [];
    this.messages_error = [];
    this.messages_fatalError = [];
    this.excludeAutorenameKeys = [];
    this.notifierID = null;
    this.xhtml = 'http://www.w3.org/1999/xhtml';

    var _initialized = false;

    /**
     * Zotfile version changed, open webpage, make adjustments
     * @param  {string} version Current zotfile version
     * @return {void}
     */
    this.versionChanges = function(version) {
        // open webpage
        var show_changelog = ['4.3', '4.1.1', '4.1', '4.0', '3.3', '3.2', '3.1', '2.0', '2.3'];
        if(this.getPref('version') === '' || show_changelog.includes(version)) {
            if(!Zotero.isStandalone) this.futureRun(() => gBrowser.selectedTab = gBrowser.addTab(Zotero.ZotFile.changelogURL));
            if( Zotero.isStandalone) this.futureRun(() => ZoteroPane_Local.loadURI(Zotero.ZotFile.changelogURL));
        }
        if (version == '4.2' && this.getPref('pdfExtraction.openPdfMac_skim'))
            this.setPref('pdfExtraction.openPdfMac', 'Skim');
        // set current version
        this.setPref('version', version);
    };

    /**
     * Initiate zotfile
     * @return {void}
     */
    this.init = async function () {
        await Zotero.Schema.schemaUpdatePromise;

        // only do this stuff for the first run
        if (!_initialized) {
            // defined zotfile variables
            this.ffPrefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService).getBranch("browser.download.");
            this.Tablet.tag = this.getPref("tablet.tag");
            this.Tablet.tagMod = this.getPref("tablet.tagModified");
            // set source dir to custom folder if zotero standalone
            if(Zotero.isStandalone && this.getPref('source_dir_ff')) this.setPref('source_dir_ff', false);
            // version handeling
            var previous_version = this.getPref('version');
            Components.utils.import('resource://gre/modules/AddonManager.jsm');
            AddonManager.getAddonByID('zotfile@columbia.edu', function(addon) {
                var version = addon.version;
                if(version != previous_version) Zotero.ZotFile.versionChanges(version);
            });
            // run in future to not burden start-up
            this.futureRun(function() {
                // determine folder seperator depending on OS
                this.folderSep = Zotero.isWin ? '\\' : '/';
                // check whether extraction of annotations is supported
                this.pdfAnnotations.popplerExtractorSupported = this.pdfAnnotations.popplerSupportedPlatforms.includes(Zotero.platform);
                // set path and check whether installed
                if (this.pdfAnnotations.popplerExtractorSupported) {
                    // set Extractor Path
                    this.pdfAnnotations.popplerExtractorSetPath();
                    // check whether tool is installed
                    OS.File.exists(this.pdfAnnotations.popplerExtractorPath)
                        .then(poppler => {
                            this.pdfAnnotations.popplerExtractorTool = poppler;
                            // set to pdf.js if poppler is not installed
                            if(!poppler) this.setPref('pdfExtraction.UsePDFJS', true);
                        })
                }
                // set to pdf.js if poppler is not supported
                if(!this.pdfAnnotations.popplerExtractorSupported) this.setPref('pdfExtraction.UsePDFJS', true);
                
            }.bind(this));
        }
        // Register callbacks in Zotero as item observers
        if(this.notifierID === null)
            this.notifierID = Zotero.Notifier.registerObserver(this.notifierCallback, ['item']);
        // Unregister callback when the window closes (important to avoid a memory leak)
        window.addEventListener('unload', function(e) {
            Zotero.Notifier.unregisterObserver(Zotero.ZotFile.notifierID);
            Zotero.ZotFile.notifierID = null;
        }, false);        
        // Load zotero.js first
        Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
            .getService(Components.interfaces.mozIJSSubScriptLoader)
            .loadSubScript("chrome://zotfile/content/ProgressWindow.js", Zotero.ZotFile);
        // add event listener for selecting items in zotero tree
        if(this.getPref('tablet')) {
            var pane = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane,
                tree = pane.document.getElementById('zotero-items-tree');
            tree.removeEventListener('select', Zotero.ZotFile.UI.attboxUpdateTabletStatus);
            tree.addEventListener('select', Zotero.ZotFile.UI.attboxUpdateTabletStatus);
        }

        _initialized = true;
    };

	// Localization (borrowed from Zotero sourcecode)
	this.ZFgetString = function (name, params){
        var l10n = '';
		this.stringsBundle = Components.classes['@mozilla.org/intl/stringbundle;1']
			.getService(Components.interfaces.nsIStringBundleService)
			.createBundle('chrome://zotfile/locale/zotfile.properties');
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
	};

    /**
     * Get preference value in 'extensions.zotfile' branch
     * @param  {string} pref     Name of preference in 'extensions.zotfile' branch
     * @return {string|int|bool} Value of preference.
     */
    this.getPref = function(pref) {
        return Zotero.Prefs.get('extensions.zotfile.' + pref, true);
    };

    /**
     * Set preference value in 'extensions.zotfile' branch
     * @param {string}          pref  Name of preference in 'extensions.zotfile' branch
     * @param {string|int|bool} value Value of preference
     */
    this.setPref = function(pref, value) {        
        Zotero.Prefs.set('extensions.zotfile.' + pref, value, true);
    };

    /**
     * Get parent item
     * @param  {Zotero.Item} item Zotero item
     * @return {Zotero.Item}      Returns parent item
     */
    this.getParent = function(item) {
        return Zotero.Items.get(item.parentItemID);
    };

    /**
     * Get array of select attachment IDs including all attachments for selected regular items
     * @param  {bool} all Get all attachments or only valid attachments (default is false)
     * @return {array}    Array with attachment ids
     */
    this.getSelectedAttachments = function (all) {
        all = typeof all !== 'undefined' ? all : false;
        // get selected items
        var win = Services.wm.getMostRecentWindow("navigator:browser");
        var attachments = win.ZoteroPane.getSelectedItems()
            .map(item => item.isRegularItem() ? item.getAttachments() : item)
            .reduce((a, b) => a.concat(b), [])
            .map(item => typeof item == 'number' ? Zotero.Items.get(item) : item)
            .filter(item => item.isAttachment())
            .filter(att => att.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL)
            .map(att => att.id);
        // remove duplicate elements
        if(attachments.length > 0) attachments = Zotero.Utilities.arrayUnique(attachments);
        // return array with attachment ids
        return attachments;
    };

    /**
     * Run code in the future to reduce current work load
     * @param  {function} aFunc Function to run
     * @return {void}
     */
    this.futureRun = function(fn) {
        var tm = Components.classes["@mozilla.org/thread-manager;1"].getService(Components.interfaces.nsIThreadManager);
        tm.mainThread.dispatch({run: function(){fn();}},Components.interfaces.nsIThread.DISPATCH_NORMAL);
    };

    /**
     * Open zotfile preference window
     */
    this.openPreferenceWindow = function(paneID, action) {
        var io = {pane: paneID, action: action};
        window.openDialog('chrome://zotfile/content/options.xul',
            'zotfile-options',
            'chrome,titlebar,toolbar,centerscreen' + Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal', io
        );
    };

    /**
     * Open subfolder window
     */
    this.openSubfolderWindow = function(paneID, action) {
        var io = {pane: paneID, action: action};
        var prefWindow = window.openDialog('chrome://zotfile/content/options-projects.xul',
            'zotfile-tablet-subfolders',
            'chrome,titlebar,toolbar,centerscreen' + Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal', io
        );
    };

    /**
     * Choose directory from file picker
     * @return {string} Path to file
     */
    this.chooseDirectory = async function () {
        if (Zotero.platformMajorVersion >= 60) {
            var FilePicker = require('zotero/filePicker').default;
        }
        else {
            var nsIFilePicker = Components.interfaces.nsIFilePicker;
        }
        var wm = Services.wm;
        var win = wm.getMostRecentWindow('navigator:browser');
        var ps = Services.prompt;
        if (Zotero.platformMajorVersion >= 60) {
            var fp = new FilePicker();
            fp.init(win, Zotero.getString('dataDir.selectDir'), fp.modeGetFolder);
            fp.appendFilters(fp.filterAll);
            if (await fp.show() != fp.returnOK) return '';
            return fp.file;
        }
        else {
            var fp = Components.classes["@mozilla.org/filepicker;1"]
                .createInstance(nsIFilePicker);
            fp.init(win, Zotero.getString('dataDir.selectDir'), nsIFilePicker.modeGetFolder);
            fp.appendFilters(nsIFilePicker.filterAll);
            if (fp.show() != nsIFilePicker.returnOK) return '';
            var file = fp.file;
            return file.path;
        }
    };

    // show report messages
    this.showReportMessages = function(title){
        if(this.messages_report.length > 0) this.infoWindow(title, {lines: this.messages_report});
        this.messages_report = [];
    };

    // show warnings messages
    this.showWarningMessages = function(title,txt){
        // default argument
        txt = typeof txt !== 'undefined' ? txt : '';
        // show warning messages
        if(this.messages_warning.length > 0) this.infoWindow(title, {lines: this.messages_warning, txt:txt});
        this.messages_warning = [];
    };

    this.format_error = function(e) {
        var name = e.name ? e.name : 'Error',
            message = e.message ? e.message : 'undefined message',
            fileName = e.fileName ? e.fileName : (e.filename ? e.filename : 'undefined file'),
            lineNumber = e.lineNumber ? e.lineNumber : 'undefined line number';
        return name + ': ' + message + ' \n(' + fileName + ', ' + lineNumber + ')';
    };

    this.handleErrors = function(error_message) {
        if (error_message !== undefined) this.messages_error.push(error_message);
        var errors = {lines: this.messages_error};
            on_click = null,
            duration = this.getPref('info_window_duration');
        // fatal errors
        if(this.messages_fatalError.length > 0) {
            duration = this.getPref('info_window_duration_clickable');
            errors.lines.push(this.ZFgetString('error.unknown'));
            errors.txt = this.ZFgetString('error.clickToCopy');
            // prepare error message for clipboard
            
            var errors_str = this.messages_fatalError.map(function(e) {
                if (typeof e == 'object') Zotero.logError(e);
                return typeof e == 'object' ? this.format_error(e) : e;
            });
            errors_str = Zotero.Utilities.arrayUnique(errors_str).join('\n\n');
            on_click = function() {
                Zotero.ZotFile.Utils.copy2Clipboard(errors_str);
            };
        }
        // error messages
        if(errors.lines.length > 0) {
            // remove duplicates
            errors.lines = Zotero.Utilities.arrayUnique(errors.lines);
            // show errors
            this.infoWindow(this.ZFgetString('general.error'),errors,duration,on_click);
        }
        // empty error arrays
        this.messages_error = [];
        this.messages_fatalError = [];
    };

    this.infoWindow = function(main, message, time, callback){
        // default arguments
        main = typeof main !== 'undefined' ? main : 'title';
        message = typeof message !== 'undefined' ? message : 'message';
        callback = typeof callback !== 'undefined' ? callback : null;
        time = typeof time !== 'undefined' ? time : this.getPref('info_window_duration');
        // show window
        var pw = this.progressWindow(main);
        if (main=='error') pw.changeHeadline(Zotero.getString('general.errorHasOccurred'));
        if (typeof(message) == 'object' && message.lines) {
            for (i =0;i<message.lines.length;i++) {
                // pw.addLines(message.lines[i]);
                var icon = message.icons ? message.icons[i] : null;
                var line = new  pw.ItemProgress(icon, message.lines[i]);
                line.setProgress(100);
            }
            if (message.txt!==undefined) pw.addDescription(message.txt);
        }
        else if(typeof(message) == 'object') {
            pw.addDescription(JSON.stringify(message));
        }
        else
            pw.addDescription(message);

        pw.startCloseTimer(time);
        // add callback
        if (callback!==null)
            pw.addCallback(callback);
        // return window
        return(pw);
    };

    this.progressWindow = function(title) {
        var progressWin = new Zotero.ZotFile.ProgressWindow();
        progressWin.changeHeadline(title);
        progressWin.show();
        return progressWin;
    };

    this.promptUser = function(message,but_0,but_1_cancel,but_2) {
        var prompts = Components.classes['@mozilla.org/embedcomp/prompt-service;1']
                    .getService(Components.interfaces.nsIPromptService);

        var check = {value: false};                  // default the checkbox to false

        var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING +
                prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_IS_STRING  +
                prompts.BUTTON_POS_2 * prompts.BUTTON_TITLE_IS_STRING;

        var button = prompts.confirmEx(null, 'ZotFile Dialog', message,
                    flags,  but_0,but_1_cancel,but_2, null, check);

        return(button);

    };    

    this.addUserInput = function(filename, original_filename){
        var default_str = this.getPref('userInput_Default');
        if (default_str=='[original filename]') default_str=original_filename;
        var filesuffix = prompt(this.ZFgetString('renaming.addUserInput.prompt', [original_filename, filename]), default_str);
        if (filesuffix != '' && filesuffix != null) {
            // add file type to the file name
            filename = filename + ' (' + filesuffix + ')';
        }
        return(filename);
    };

    this.checkFileType = function (att) {
        if(!Zotero.ZotFile.getPref('useFileTypes')) return true;
        var pos = att.attachmentFilename.lastIndexOf('.'),
            filetype = pos == -1 ? '' : att.attachmentFilename.substr(pos + 1).toLowerCase(),
            regex = Zotero.ZotFile.getPref('filetypes').toLowerCase().replace(/,/gi, '|');
        // return value
        return filetype.search(new RegExp(regex)) >= 0 ? true : false;
    }.bind(Zotero.ZotFile);

    /**
     * Get filename based on metadata from zotero item
     * @param  {Zotero.Item}  item   Zotero item for metadata
     * @param  {string}       name   Current filename as fallback and for extension
     * @param  {string}       format Formatting rules based on wildcards
     * @return {string}              Formatted filename with extension
     */
    this.getFilename = function(item, name, format) {
        // check function arguments
        if (!item.isRegularItem()) throw('getFilename: Not regular zotero item.');
        // check whether renaming is disabled
        if(this.getPref('disable_renaming')) return(name);
        // rename format
        var filename = '',
            item_type =  item.itemTypeID,
            format_default = item_type == Zotero.ItemTypes.getID('patent')
            	? this.getPref("renameFormat_patent")
            	: this.getPref("renameFormat");
        format = typeof format !== 'undefined' ? format : format_default;
        // create the new filename from the selected item
        if (!this.getPref('useZoteroToRename')) {
            filename = this.Wildcards.replaceWildcard(item, format);
            // Strip invalid characters (adopted from Zotero, modified to accept periods)
            filename = filename.replace(/[\/\\\?\*:|"<>]/g, '');
            // replace multiple blanks in filename with single blank & remove whitespace
            filename = Zotero.Utilities.trimInternal(filename);
            // remove periods, replace blanks with '_', convert to lower case
            if (this.getPref('removePeriods')) filename = filename.replace(/\./g, '');
            if (this.getPref('replace_blanks'))  filename = filename.replace(/ /g, '_');
            if (this.getPref('lower_case')) filename = filename.toLowerCase();
            // remove all the accents and other strange characters from filename
            if (Zotero.version[0] >= 3 && this.getPref('removeDiacritics'))
                filename = Zotero.Utilities.removeDiacritics(filename);
        }
        // Use Zotero to get filename
        if (this.getPref('useZoteroToRename'))
            filename = Zotero.Attachments.getFileBaseNameFromItem(item);
        // Add user input to filename
        if(this.getPref('userInput')) filename = this.addUserInput(filename, name);
        // add filetype to filename
        var filetype = this.Utils.getFiletype(name);
        if(filetype != '') filename = filename + '.' + filetype;
        // valid zotero name
        filename = Zotero.File.getValidFileName(filename);
        // return
        return(filename);
    };

    /**
     * Format subfolder based on rule
     * @param  {Zotero.Item} item   Zotero item for metadata
     * @param  {string}      format Rule to construct subfolder with wildcards (e.g. '%j/%y')
     * @return {string}             Formatted subfolder such as 'Author/2010'
     */
    this.formatSubfolder = function(item, format) {
        if (format == '') return '';
        if (format.slice(-1) == this.folderSep) format = format.slice(0, -1);
        if (format[0] == this.folderSep) format = format.slice(1);
        var subfolder = this.Wildcards.replaceWildcard(item, format);
        // replace invalid characters
        subfolder = OS.Path.split(subfolder).components
            .map(s => s == '' ? 'undefined' : s)
            .filter(s => s != this.Wildcards.emptyCollectionPlaceholder)
            .map(s => Zotero.File.getValidFileName(s))
            .join(this.folderSep);
        return OS.Path.normalize(subfolder);
    };

    /**
     * Function to get location of file based on zotero item metadata
     * @param  {string}      basefolder Basefolder
     * @param  {Zotero.Item} item       Zotero item  for metadata
     * @param  {string}      format     Rule to construct subfolder with wildcards (e.g. '%j/%y')
     * @return {string}                 Folder path
     */
    this.getLocation = function(basefolder, item, format) {
        // check function arguments
        if (!item.isRegularItem()) throw('getLocation: Not regular zotero item.');
        if (typeof basefolder != 'string') throw("getLocation: 'basefolder' not string.");
        if (typeof format != 'string') throw("getLocation: 'format' not string.");
        // combine folder and subfolder
        var subfolder = this.formatSubfolder(item, format);
        return OS.Path.join(OS.Path.normalize(basefolder), subfolder);
    };

    /**
     * Move a linked attachment to a new location
     * (mostly adopted from `Zotero.Item.prototype.renameAttachmentFile` )
     * @param  {Zotero.Item} att       Zotero attachment to move
     * @param  {string}      location  Folder
     * @param  {string}      filename  Filename
     * @param  {bool}        overwrite Overwrite existing files in new location
     * @return {bool}                  Indicates whether successful
     */
    this.moveLinkedAttachmentFile = Zotero.Promise.coroutine(function* (att, location, filename, overwrite) {
        if (!att.isAttachment() || att.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_FILE)
            return false;
        var origPath = yield att.getFilePathAsync();
        if (!origPath) {
            Zotero.debug("Attachment file not found in moveLinkedAttachmentFile()", 2);
            return false;
        }
        
        try {
            var origName = OS.Path.basename(origPath);
            var origModDate = (yield OS.File.stat(origPath)).lastModificationDate;
            
            filename = Zotero.File.getValidFileName(filename);
            
            var destPath = OS.Path.join(location, filename);
            var destName = OS.Path.basename(destPath);

            // Ignore if no change
            if (origPath === destPath) {
                Zotero.debug("Filename has not changed");
                return true;
            }
            
            destPath = yield this.moveFile(origPath, destPath);
            yield att.relinkAttachmentFile(destPath);
            return true;
        }
        catch (e) {
            Zotero.logError(e);
            return false;
        }
    });

    /**
     * Move file to new location
     * @param  {String} path     File to move.
     * @param  {String} target   Target directory or full path.
     * @param  {String} filename Name of file.
     * @return {String}          Path to new location of file.
     */
    this.moveFile = Zotero.Promise.coroutine(function* (sourcePath, target, filename) {
        // check arguments
        if (!(yield OS.File.exists(sourcePath))) throw("Zotero.ZotFile.moveFile(): 'file' does not exists.")
        // if target is '/' or '\', use file's parent directory
        if(target.trim() == this.folderSep)
            target = sourceDir;
        sourcePath = OS.Path.normalize(sourcePath);
        var sourceDir = OS.Path.dirname(sourcePath),
            destPath = filename === undefined ? target : this.Utils.joinPath(target, filename),
            destDir = OS.Path.dirname(destPath);
        // return if already at target
        if(sourcePath == destPath) return sourcePath;
        // add suffix if target path exists
        var k = 2;
        while(yield OS.File.exists(destPath)) {
            destPath = this.Utils.addNumericalSuffix(destPath, k);
            if (sourcePath == destPath) return sourcePath;
            k++;
            if(k > 999) throw("'Zotero.ZotFile.moveFile()': '" + filename + "' already exists.");
        }
        // create subfolder
        if (!(yield OS.File.exists(destDir))) {
            let create = [destDir],
                parent = OS.Path.dirname(destDir);
            while(!(yield OS.File.exists(parent))) {
                create.push(parent);
                parent = OS.Path.dirname(parent);
            }
            yield Zotero.Promise.all(create.reverse().map(f => OS.File.makeDir(f)))
        }
        // move file to new location
        yield OS.File.move(sourcePath, destPath)
            .catch(OS.File.Error, function (e) {
                // this.messages_error.push("Error when moving the file '" + OS.Path.basename(sourcePath) + "'. Possibly, the file is locked.");
                // if (e.becauseExists)
                throw e;
            });
        // delete empty folders after moving file
        yield this.removeEmptyFolders(sourceDir);
        // return path to new location
        return destPath;
    });

    /**
     * Copy file to new location
     * @param  {String} sourcePath  File to move.
     * @param  {String} target      Target directory  or full path.
     * @param  {String} filename    Name of file.
     * @return {String}             Path to location of copied file.
     */
    this.copyFile = Zotero.Promise.coroutine(function* (sourcePath, target, filename) {
        // check arguments
        if (!(yield OS.File.exists(sourcePath))) throw("Zotero.ZotFile.copyFile(): 'file' does not exists.")
        // source and destination path
        sourcePath = OS.Path.normalize(sourcePath);
        var destPath = filename === undefined ? target : this.Utils.joinPath(target, filename),
            destDir = OS.Path.dirname(destPath);
        if(sourcePath == destPath) return sourcePath;
        // add suffix if target path exists
        var k = 2;
        while(yield OS.File.exists(destPath)) {
            destPath = this.Utils.addNumericalSuffix(destPath, k);
            if (sourcePath == destPath) return sourcePath;
            k++;
            if(k > 999) throw("'Zotero.ZotFile.copyFile()': '" + filename + "' already exists.");
        }
        // create subfolder
        if (!(yield OS.File.exists(destDir))) {
            let create = [destDir],
                parent = OS.Path.dirname(destDir);
            while(!(yield OS.File.exists(parent))) {
                create.push(parent);
                parent = OS.Path.dirname(parent);
            }
            yield Zotero.Promise.all(create.reverse().map(f => OS.File.makeDir(f)))
        }
        // copy file
        yield OS.File.copy(sourcePath, destPath);
        // return file
        return destPath;
    });

    /**
     * Delete file or folder
     * @param  {nsIFile|String} file File or folder to be removed as nsIFile object
     * @return {void}
     */
    this.removeFile = function(file) {
        file = Zotero.File.pathToFile(file);
        if (!file.exists()) return;
        try {
            // remove file
            if(!file.isDirectory()) {
                file.remove(false);
            }
            // ... for directories, remove them if no non-hidden files are inside
            else {
                var files = file.directoryEntries;
                while (files.hasMoreElements()) {
                    var f = files.getNext().QueryInterface(Components.interfaces.nsIFile);
                    if (!f.isHidden()) return;
                }
                file.remove(true);
            }
        }
        catch(err) {
            if(file.isDirectory()) this.infoWindow(this.ZFgetString('general.report'), this.ZFgetString('file.removeFolderFailed'));
        }
    };

    /**
     * Remove empty folders recursively within zotfile directories
     * @param  {String|nsIFile} folder Folder as nsIFile.
     * @return {void}
     */
    this.removeEmptyFolders = Zotero.Promise.coroutine(function* (folder) {
        // Keep track of zotero's internal directory, current source and destination directory
        folder = Zotero.File.pathToFile(folder);
        var folders_zotfile = [Zotero.getStorageDirectory().path];
        var source_dir = yield this.getSourceDir(false),
            dest_dir = this.getPref('dest_dir');
        if (source_dir) folders_zotfile.push(source_dir);
        if (dest_dir != '') folders_zotfile.push(dest_dir);
        folders_zotfile = folders_zotfile.map(path => OS.Path.normalize(path));
        // Only delete folders if the file is located in any of the base folders
        if (!folders_zotfile.map(dir => folder.path.startsWith(dir)).some(x => x === true)) return;
        // remove the original dir recursively until a non empty folder is found
        while(true) {
            // break if folder is not a directory or if it is the same directory as the source/zotero folder
            if (!folder.isDirectory() || folders_zotfile.indexOf(folder.path) !== -1)
                break;
            // remove file
            this.removeFile(folder);
            // Stop if the directory was not removed
            if (folder.exists()) break;
            // Try the parent of the current folder too
            folder = Zotero.File.pathToFile(OS.Path.dirname(folder.path));
        }
    });

    this.showFolder = function(folderFile) {
        folderFile = Zotero.File.pathToFile(folderFile);
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
    };

    /**
     * Get all valid files in folder
     * @param  {string} path Path to directory
     * @return {array}       Array with string paths for each valid file in folder
     */
    this.getFilesInFolder = function(path) {
        var dir = Zotero.File.pathToFile(path);
        if (!dir.isDirectory()) throw("Zotero.ZotFile.getSortedFilesInDirectory(): '" + path + "' is not directory.")
        var pref_filetypes = this.getPref('useFileTypes'),
            filetypes = this.getPref('filetypes').split(',').map(s => s.trim().toLowerCase()),
            files = dir.directoryEntries,
            entries = [];
        while (files.hasMoreElements()) {
            // get next file
            var file = files.getNext().QueryInterface(Components.interfaces.nsIFile),
                filetype = this.Utils.getFiletype(file.leafName).toLowerCase();
            // continue if directory, hidden file or certain file types
            if (file.isDirectory() || file.isHidden() || (pref_filetypes && !filetypes.includes(filetype))) continue;
            // add file to array
            entries.push(file);
        }
        // return sorted directory entries
        return entries.map(f => f.path);
    };

    /**
     * Get the last modified file from directory
     * @param  {string} path Path to directory
     * @return {string}      Path to last modified file in folder or undefined.
     */
    this.getLastFileInFolder = function(path) {
        var dir = Zotero.File.pathToFile(path);
        if (!dir.isDirectory()) throw("Zotero.ZotFile.getSortedFilesInDirectory(): '" + path + "' is not directory.")
        var pref_filetypes = this.getPref('useFileTypes'),
            filetypes = this.getPref('filetypes').split(',').map(s => s.trim().toLowerCase()),
            files = dir.directoryEntries,
            lastmod = {lastModifiedTime: 0};
        while (files.hasMoreElements()) {
            // get next file
            var file = files.getNext().QueryInterface(Components.interfaces.nsIFile),
                filetype = this.Utils.getFiletype(file.leafName).toLowerCase();
            // skip if directory, hidden file or certain file types
            if (file.isDirectory() || file.isHidden() || (pref_filetypes && !filetypes.includes(filetype))) continue;
            // check modification time
            if (file.isFile() && file.lastModifiedTime > lastmod.lastModifiedTime) lastmod = file;
        }
        // return sorted directory entries
        return lastmod.lastModifiedTime == 0 ? undefined : lastmod.path;
    };

    /**
     * Get Firefox download folder
     * @return {string} Path to download folder
     */
    this.getFFDownloadFolder = function () {
        var path = '';
        try {
            if(this.ffPrefs.getBoolPref('useDownloadDir')) {
                var download_manager = Components.classes['@mozilla.org/download-manager;1']
                                    .getService(Components.interfaces.nsIDownloadManager);
                path = download_manager.userDownloadsDirectory.path;
            }
            if(!this.ffPrefs.getBoolPref('useDownloadDir') && this.ffPrefs.prefHasUserValue('lastDir')) {
                path = this.ffPrefs.getCharPref('lastDir');
            }
        }
        catch (err) {
            path = '';
        }
        return path;
    };

    /**
     * Get zotfile's source directory
     * @param  {bool} message Show error message if invalid source directory
     * @return {string}       Path for directory of 'undefined' if invalid directory
     */
    this.getSourceDir = Zotero.Promise.coroutine(function* (message) {
        var source_dir = this.getPref('source_dir_ff') ? this.getFFDownloadFolder() : this.getPref('source_dir');
        // valid source directory?
        if (source_dir == "" || !(yield OS.File.exists(source_dir))) {
            if(message) this.infoWindow(this.ZFgetString('general.error'), this.ZFgetString('file.invalidSourceFolder'));
            return undefined;
        }
        return source_dir;
    });

    /**
     * Attach file to zotero items
     * @param  {Zotero.Item} item  Regular zotero item.
     * @param  {string}      path  Filepath.
     * @return {int}               Zotero attachment id
     */
    this.attachFile = Zotero.Promise.coroutine(function* (item, path) {
        if (!item.isRegularItem()) throw("Zotero.ZotFile.attachFile(): 'item' is not a regular zotero attachment item.");
        let options = {file: path, libraryID: item.libraryID, parentItemID: item.id, collections: undefined};
        // create imported attachment
        if (this.getPref('import') || item.library.libraryType != 'user') {
            this.excludeAutorenameKeys.push(item.key);
            var att = yield Zotero.Attachments.importFromFile(options);
            // rename attachment
            att = yield this.renameAttachment(att);
            // remove file from source folder
            if (path != att.getFilePath())
                OS.File.remove(path);
        }
        // create linked attachment
        else {
            // get filename and location
            let filename = this.getFilename(item, OS.Path.basename(path)),
                subfolder = !this.getPref('import') & this.getPref('subfolder') ? this.getPref('subfolderFormat') : '',
                location = this.getLocation(this.getPref('dest_dir'), item, subfolder);
            // move and rename file
            options.file = yield this.moveFile(path, location, filename);
            // create zotero link to file
            var att = yield Zotero.Attachments.linkFromFile(options);
        }
        // return attachment item
        return att;
    });

    /**
     * Attach last file (or all files) from source directory
     * @return {void}
     */
    this.attachFileFromSourceDirectory = Zotero.Promise.coroutine(function* () {
        // get selected items
        var win = Services.wm.getMostRecentWindow("navigator:browser"),
            item = win.ZoteroPane.getSelectedItems()[0];
        // if not top-level item, get parent
        item = !item.isTopLevelItem() ? Zotero.Items.get(item.parentItemID) : item;
        // check whether regular item
        if (!item.isRegularItem()) {
            this.handleErrors(this.ZFgetString('renaming.renameAttach.wrongItem'));
            return;
        }
        // get source dir
        var source_dir = yield this.getSourceDir(false);
        // invalid source folder
        if (this.getPref('source_dir_ff') && !source_dir) {
            this.setPref('source_dir_ff', false);
            this.setPref('source_dir', prompt(this.ZFgetString('general.downloadFolder.prompt')));
            return;
        }
        if (!source_dir) return;
        // get files from source directory
        var paths = !this.getPref("allFiles") ? [this.getLastFileInFolder(source_dir)] : this.getFilesInFolder(source_dir);
        if (!paths[0]) {
            this.handleErrors(this.ZFgetString('renaming.renameAttach.noFileFound'));
            return;
        }
        // confirmation
        if (this.getPref("confirmation"))
            if(!confirm(this.ZFgetString('renaming.renameAttach.confirm', [OS.Path.basename(paths[0])])))
                return;
        // attach files
        var progress_win = this.progressWindow(this.ZFgetString('general.newAttachmentsAdded'));
        for (var i = 0; i < paths.length; i++) {
            let att = yield this.attachFile(item, paths[i]);
            progress = new progress_win.ItemProgress(att.getImageSrc(), att.getField('title'));
            progress.setProgress(100);
        }
        progress_win.startCloseTimer(this.getPref("info_window_duration"));
    });

    /**
     * Rename attachment file based on parent item metadata.
     * @param  {Zotero.Item} att       Zotero attachment item.
     * @param  {bool}        imported  Create imported Zotero attachment.
     * @param  {bool}        rename    Rename attachment file.
     * @param  {string}      folder    Custom location if not imported attachment.
     * @param  {string}      subfolder Subfolder location if not important attachment
     * @param  {book}        verbose   Notification about renaming.
     * @return {Zotero.Item}           Zotero item for renamed attachment.
     */
    this.renameAttachment = Zotero.Promise.coroutine(function* (att, imported, rename, folder, subfolder, verbose) {
        // default arguments
        imported = typeof imported !== 'undefined' ? imported : this.getPref('import');
        var subfolder_default = !imported & this.getPref('subfolder') ? this.getPref('subfolderFormat') : '';
        rename = typeof rename !== 'undefined' ? rename : true;
        folder = typeof folder !== 'undefined' ? folder : this.getPref('dest_dir');
        subfolder = typeof subfolder !== 'undefined' ? subfolder : subfolder_default;
        verbose = typeof verbose !== 'undefined' ? verbose : true;
        // check function arguments
        if (!att.isAttachment()) throw('Zotero.ZotFile.renameAttachment(): No attachment item.');
        if (att.isTopLevelItem()) throw('Zotero.ZotFile.renameAttachment(): Attachment is top-level item.');
        // set variables
        var win = Services.wm.getMostRecentWindow("navigator:browser"),
            selection = win.ZoteroPane.itemsView.saveSelection(),
            att_id = att.id,
            linkmode = att.attachmentLinkMode,
            item = Zotero.Items.get(att.parentItemID),
            path = yield att.getFilePathAsync(),
            att_note = att.getNote(),
            att_tags = att.getTags(),
            att_relations = att.getRelations();
        if (!path) throw('Zotero.ZotFile.renameAttachment(): Attachment file does not exists.'); 
        // only proceed if linked or imported attachment
        if(!att.isImportedAttachment() && !linkmode == Zotero.Attachments.LINK_MODE_LINKED_FILE)
            return att;
        // get filename and location
        var filename = rename ? this.getFilename(item, att.attachmentFilename) : att.attachmentFilename,
            location = this.getLocation(folder, item, subfolder);
        // (a) linked to imported attachment
        if (imported && linkmode == Zotero.Attachments.LINK_MODE_LINKED_FILE) {
            // attach file to selected Zotero item and return new attachment object
            var options = {file: path, libraryID: item.libraryID, parentItemID: item.id, collections: undefined, saveOptions: {skipSelect: true}};
            var attNew = yield Zotero.Attachments.importFromFile(options);
            // rename file associated with attachment
            yield attNew.renameAttachmentFile(filename);
            // change title of attachment item
            attNew.setField('title', filename);
            // restore attachment data
            attNew.setRelations(att_relations);
            if(att_note != '') attNew.setNote(att_note);
            if (att_tags.length) attNew.setTags(att_tags);
            yield attNew.saveTx();
            // select new attachment
            if (selection.includes(att.id)) {
                this.Utils.arrayReplace(selection, att.id, attNew.id);
                win.ZoteroPane.itemsView.selectItems(selection);
            }
            // update links to attachment file in notes
            Zotero.Items.get(item.getNotes()).forEach(note => {
                var content = note.getNote();
                content = content.replace(new RegExp('open-pdf/([\\w\\W\\d]{1,10})_' + att.key, 'g'), 'open-pdf/$1_' + attNew.key);
                note.setNote(content);
                note.saveTx();
            });
            // erase old attachment, remove file and folder
            yield att.eraseTx();
            yield OS.File.remove(path);
            yield this.removeEmptyFolders(OS.Path.dirname(path));
            // notification
            if (verbose) this.messages_report.push(this.ZFgetString('renaming.imported', [filename]));
            return attNew;
        }
        // (b) imported to imported attachment (or cloud library)
        if ((imported && att.isImportedAttachment()) || item.library.libraryType != 'user') {
            // rename file associated with attachment
            yield att.renameAttachmentFile(filename);
            // change title of attachment item
            att.setField('title', filename);
            yield att.saveTx();
            // notification
            if (verbose) this.messages_report.push(this.ZFgetString('renaming.imported', [filename]));
            return att;
        }
        // (c) imported to linked attachment (only if library is local)
        if (att.isImportedAttachment() && !imported && item.library.libraryType == 'user') {
            // move pdf file
            path = yield this.moveFile(path, location, filename);
            if (!path) return att;
            // create linked attachment
            var options = {file: path, libraryID: item.libraryID, parentItemID: item.id, collections: undefined, saveOptions: {skipSelect: true}};
            attNew = yield Zotero.Attachments.linkFromFile(options);
            // change title of attachment item
            attNew.setField('title', filename);
            // restore attachment data
            attNew.setRelations(att_relations);
            if(att_note != '') attNew.setNote(att_note);
            if (att_tags.length) attNew.setTags(att_tags);
            yield attNew.saveTx();
            // select new attachment
            if (selection.includes(att.id)) {
                this.Utils.arrayReplace(selection, att.id, attNew.id);
                win.ZoteroPane.itemsView.selectItems(selection);
            }
            // update links to attachment file in notes
            Zotero.Items.get(item.getNotes()).forEach(note => {
                var content = note.getNote();
                content = content.replace(new RegExp('open-pdf/([\\w\\W\\d]{1,10})_' + att.key, 'g'), 'open-pdf/$1_' + attNew.key);
                note.setNote(content);
                note.saveTx();
            });
            // erase old attachment, remove file and folder
            yield att.eraseTx();
            // notification and return
            if(verbose) this.messages_report.push(this.ZFgetString('renaming.linked', [filename]));
            return attNew;
        }
        // (d) linked to linked attachment (only if library is local)
        if (!att.isImportedAttachment() && !imported && item.library.libraryType == 'user') {
            // relink attachment
            yield this.moveLinkedAttachmentFile(att, location, filename, false);
            att.setField('title', filename);
            yield att.saveTx();
            // notification
            if(verbose) this.messages_report.push(this.ZFgetString('renaming.linked', [filename]));
            return att;
        }
        // return id of attachment
        return att;
    });

    /**
     * Rename select attachments
     * @return {void}
     */
    this.renameSelectedAttachments = Zotero.Promise.coroutine(function* () {
        // get selected attachments
        var atts = Zotero.Items.get(this.getSelectedAttachments())
            .filter(this.checkFileType);
        // confirm renaming
        if (this.getPref('confirmation_batch_ask') && atts.length >= this.getPref('confirmation_batch')) 
            if(!confirm(this.ZFgetString('renaming.moveRename', [atts.length])))
                return;
        // show infoWindow        
        var progressWin = this.progressWindow(this.ZFgetString('renaming.renamed')),
            description = atts.length == 0;
        // rename attachments
        for (let i = 0; i < atts.length; i++) {
            // get attachment and add line to infoWindow
            var att = atts[i],
                progress = new progressWin.ItemProgress(att.getImageSrc(), att.getField('title'));
            // check attachment
            if(!(yield att.fileExists()) || att.isTopLevelItem() || this.Tablet.getTabletStatus(att)) {
                description = true;
                progress.setError();
                continue;
            }
            // Rename and move attachment
            att = yield this.renameAttachment(att);
            if(!att) {
                progress.setError();
                continue;
            }
            // update progress window
            progress.complete(att.attachmentFilename, att.getImageSrc());
        }
        // show messages and handle errors
        if(description) progressWin.addDescription(this.ZFgetString('general.warning.skippedAtt.msg'));
        progressWin.startCloseTimer(this.getPref("info_window_duration"));
    });
};
