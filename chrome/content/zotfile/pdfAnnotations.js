
/**
 * pdfAnnotations class to extract pdf annotations
 * Runs the annotation extraction code in extract.html/extract.js
 */
Zotero.ZotFile.pdfAnnotations = new function() {

    this.progressWin = null;
    this.popplerExtractorFileName = 'ExtractPDFAnnotations';
    this.popplerExtractorPath = null;
    this.popplerExtractorVersion = 1.0;
    this.popplerSupportedPlatforms = ['MacIntel'];
    this.pdfExtraction = false;
    this.popplerExtractorTool = false;
    this.popplerExtractorSupported = false;
    // this.popplerExtractorBaseURL = 'https://github.com/jlegewie/zotfile/raw/gh-pages/PDFTools/';
    this.popplerExtractorBaseURL = 'http://www.zotfile.com/PDFTools/';
    /* The list of PDFs we should extract annotations from.  Each
    element is an object with the following fields:
    attachment: the Zotero object representing the attachment
    path: an absolute path to the attachment file
    item: the Zotero item containing the attachment
    */
    this.pdfAttachmentsForExtraction = [];
    this.errorExtractingAnnotations = false;
    // The hidden browser where PDFs get rendered by pdf.js
    this.pdfHiddenBrowser = null;
    this.PDF_EXTRACT_URL = 'chrome://zotfile/content/pdfextract/extract.html';

    this.popplerExtractorSetPath = function() {
        // extractor filename
        /* "pdftotext-{platform}", where {platform} is "Win32", "MacIntel", "MacPPC", "Linux-i686", etc.
           (To determine your current platform, type javascript:alert(navigator.platform) in the Firefox URL bar and hit Enter.)*/
        this.popplerExtractorFileName += '-' + Zotero.platform;
        if (Zotero.isWin) this.popplerExtractorFileName += '.exe';
        // extractor path
        this.popplerExtractorPath = OS.Path.join(Zotero.DataDirectory.dir, 'ExtractPDFAnnotations', this.popplerExtractorFileName);
    };

    this.getAnnotations = Zotero.Promise.coroutine(function* (attIDs) {
        // get selected attachments if no att ids are passed
        if(attIDs == null) attIDs = Zotero.ZotFile.getSelectedAttachments();
        // filter attachments
        var atts = Zotero.Items.get(attIDs)
            .filter(att => att.isAttachment() && !att.isTopLevelItem())
            .filter(att => att.attachmentContentType == 'application/pdf');
        atts = yield Zotero.Promise.filter(atts, att => att.fileExists());
        // progress window
        this.progressWin = Zotero.ZotFile.progressWindow('Zotfile: Extracting Annotations...');
        if (atts.length == 0) {
            this.progressWin.addDescription(Zotero.ZotFile.ZFgetString('general.warning.skippedAtt.msg'));
            this.progressWin.startCloseTimer(Zotero.ZotFile.getPref('info_window_duration'));
            return;
        }
        // extraction settings
        var settings_pdfjs = Zotero.ZotFile.getPref('pdfExtraction.UsePDFJS'),
            settings_both = Zotero.ZotFile.getPref('pdfExtraction.UsePDFJSandPoppler'),
            icon_pdf = 'chrome://zotero/skin/treeitem-attachment-pdf.png';
        // iterate through attachment items
        this.pdfAttachmentsForExtraction = [];
        for (let i = 0; i < atts.length; i++) {
            // get attachment item, parent and file
            let att  = atts[i],
                item = Zotero.Items.get(att.parentItemID),
                tabletStatus = Zotero.ZotFile.Tablet.getTabletStatus(att),
                path = tabletStatus ? (yield Zotero.ZotFile.Tablet.getLastModifiedTabletFile(att)) : (yield att.getFilePathAsync());
            // extract annotations from pdf and create note with annotations
            this.pdfAttachmentsForExtraction.push({
                attachment: att,
                path: path,
                filename: OS.Path.basename(path),
                item: item,
                itemProgress: new this.progressWin.ItemProgress(icon_pdf, OS.Path.basename(path))
            });
        }
        if (attIDs.length > atts.length)
            this.progressWin.addDescription(Zotero.ZotFile.ZFgetString('general.warning.skippedAtt.msg'));
        // extract annotations (poppler)
        if (this.popplerExtractorTool && (!settings_pdfjs || settings_both))
            this.popplerExtractor(!(settings_pdfjs || settings_both));
        // extract annotations (pdf.js)
        if (settings_pdfjs || settings_both) {
            // setup extraction process
            this.errorExtractingAnnotations = false;
            // start extraction in hidden browser
            this.pdfHiddenBrowser = Zotero.Browser.createHiddenBrowser();
            this.pdfHiddenBrowser.loadURI(this.PDF_EXTRACT_URL);
        }
    });

    this.popplerExtractor = Zotero.Promise.coroutine(function* (setProgress) {
        // iterate through pdfs
        for (let i = 0; i < this.pdfAttachmentsForExtraction.length; i++) {
            let item = this.pdfAttachmentsForExtraction[i].item,
                att = this.pdfAttachmentsForExtraction[i].attachment,
                path = this.pdfAttachmentsForExtraction[i].path,
                progress = this.pdfAttachmentsForExtraction[i].itemProgress,
                outputFile = path.replace('.pdf', '.txt');            
            // extract annotations with poppler
            yield Zotero.Utilities.Internal.exec(this.popplerExtractorPath, [path, outputFile]);
            // get annotations from file and create note
            let annotations = yield this.popplerExtractorGetAnnotationsFromFile(outputFile);
            annotations = annotations.map(anno => {anno.color = [0, 0, 0]; return anno;});
            // create note
            if(annotations.length != 0) this.createNote(annotations, item, att, 'poppler');
            // delete output text file
            if(Zotero.ZotFile.getPref('pdfExtraction.popplerDeleteTxtFile'))
                OS.File.remove(outputFile);
            // update progress window
            let icon = annotations.length > 0 ? 'chrome://zotero/skin/tick.png' : 'chrome://zotero/skin/cross.png';
            if (setProgress) {
                progress.setProgress(100);
                progress.setIcon(icon);
            }
        }
        if (setProgress)
            this.progressWin.startCloseTimer(Zotero.ZotFile.getPref('info_window_duration'));        
    });

    this.popplerExtractorGetAnnotationsFromFile = Zotero.Promise.coroutine(function* (path) {
        var annotations = [];
        // check whether file exists
        if (!(yield OS.File.exists(path))) {
            Zotero.ZotFile.messages_error.push(Zotero.ZotFile.ZFgetString('extraction.failedNoFile'));
            return [];
        }
        // read file
        var decoder = new TextDecoder(),
            text = yield OS.File.read(path).then(array => decoder.decode(array)),
            lines = text.split('\n').map(line => line.split(' ; '));
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i],
                strMarkUp  = (line[5]) ? this.trim(line[5].replace(/\\n/g,'<br>')) : '',
                strText    = (line[4]) ? this.trim(line[4].replace(/\\n/g,'<br>')) : '';
            if(strMarkUp == '' && strText == '') continue;
            // add annotation object to array
            annotations.push({
                filename: line[0],
                page: parseInt(line[1], 10),
                ID: parseInt(line[2], 10),
                type: line[3],
                // date: line[7],
                // creator: line[11],
                content: strText,
                markup: strMarkUp
            });
        }
        // return annotations
        return annotations;
    });

    this.createNote = Zotero.Promise.coroutine(function* (annotations, item, att, method) {
        // get note content
        var note_content = this.getNoteContent(annotations, item, att, method);
        // save single note
        if(typeof note_content == 'string') {
            let note = new Zotero.Item('note');
            note.libraryID = item.libraryID;
            note.setNote(note_content);
            note.parentKey = item.key;
            yield note.saveTx();
        }
        // save multiple notes
        else {
            yield Zotero.DB.executeTransaction(function* () {
                for(let type in note_content) {
                    let note = new Zotero.Item('note');
                    note.libraryID = item.libraryID;
                    note.setNote(note_content[type]);
                    note.parentKey = item.key;
                    yield note.save();
                }
            });
        }
    });

    this.getColorCategory = function (r,g,b) {
        // convert RGB to HSL   
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;
        if(max == min) {
            h = s = 0; // achromatic
        }
        else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max){
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h*=60;
            if (h < 0) {
                h +=360;
            }
        }
        // define color category based on HSL    
        if (l < 0.12) return "Black";
        if (l > 0.98) return "White";
        if (s < 0.2) return "Gray";
        if (h < 15) return "Red";
        if (h < 45) return "Orange";
        if (h < 65) return "Yellow";
        if (h < 170) return "Green";
        if (h < 190) return "Cyan";
        if (h < 270) return "Blue";
        if (h < 335) return "Magenta";
        return "Red";
    };

    this.getNoteContent = function(annotations, item, att, method) {
        var lib = att.library.libraryType == 'user' ? 0 : att.libraryID,
            groupID = lib != 0 ? Zotero.Groups.getGroupIDFromLibraryID(att.libraryID) : undefined,
            format_uri = 'zotero://open-pdf/library/items/%(key)?page=%(page)',
            format_uri_group = 'zotero://open-pdf/groups/%(groupID)/items/%(key)?page=%(page)',
            str_title = this.ZFgetString('extraction.noteTitle'),
            format_title = this.getPref("pdfExtraction.formatNoteTitle"),
            format_title_color = this.getPref("pdfExtraction.formatNoteTitleColor"),
            format_note = this.getPref("pdfExtraction.formatAnnotationNote"),
            format_highlight = this.getPref("pdfExtraction.formatAnnotationHighlight"),
            format_underline = this.getPref("pdfExtraction.formatAnnotationUnderline"),
            settings_colors = JSON.parse(this.getPref("pdfExtraction.colorCategories")),
            setting_color_notes = this.getPref("pdfExtraction.colorNotes"),
	    setting_aggregate_color_highlights = this.getPref("pdfExtraction.colorAnnotations"),
            cite = this.getPref("pdfExtraction.NoteFullCite") ? this.Wildcards.replaceWildcard(item, "%a %y:").replace(/_(?!.*_)/," and ").replace(/_/g,", ") : "p. ",
            repl = JSON.parse(this.getPref("pdfExtraction.replacements")),
            reg = repl.map(function(obj) {
                var flags = ('flags' in obj) ? obj.flags : "g";
                return new RegExp(obj.regex, flags);
            });
        // add note title
        var date_str = this.getPref("pdfExtraction.localeDateInNote") ? new Date().toLocaleString() : new Date().toUTCString(),
            title = this.Utils.str_format(format_title, {'title': str_title, 'date': date_str}),
            note = title;
        if (this.getPref("pdfExtraction.UsePDFJSandPoppler"))
            note += ' ' + method;
        if(setting_color_notes) note = {};
        // iterature through annotations
        for (var i=0; i < annotations.length; i++) {
        // annotations.map(function(anno) {
            var anno = annotations[i],
                page = anno.page,
                uri = lib == 0 ? format_uri : format_uri_group;
            uri = this.Utils.str_format(uri, {'groupID': groupID, 'key': att.key, 'page': anno.page});
            // get page
            if(this.getPref("pdfExtraction.NoteTruePage")) {
                try {
                    var itemPages = item.getField('pages');
                    if(itemPages) {
                        var page_parsed = typeof itemPages == "string" ? parseInt(itemPages.split('-')[0], 10) : itemPages;                            
                        page = isNaN(page_parsed) ? page : page_parsed + page - 1;
                    }
                }
                catch(err) {}
            }
            // link
            var link = '<a href="' + uri + '">' + cite + page + '</a>',
                color = ('color' in anno) ? ('rgb(' + anno.color.join(',') + ')') : 'rgb(255,255,255)',
                color_category = this.pdfAnnotations.getColorCategory(anno.color[0], anno.color[1], anno.color[2]),
                color_category_hex = settings_colors[color_category];
	    // produce hex version of the colour
	    var color_hex = "#";
	    if ('color' in anno) {
		anno.color.forEach(function(number) {
		    var hex = number.toString(16);
		    if (hex.length % 2) {
			hex = '0' + hex;
		    }
		    color_hex += hex.toUpperCase();
		});
	    } else {
		color_hex += "FFFFFF";
	    };
            // add markup to note (process colour/underline markups in PDF)
            if(anno.markup && anno.markup != "") {       
                var format_markup = anno.subtype == "Highlight" ? format_highlight : format_underline;
                for (var k = 0; k < repl.length; k++)
                    anno.markup = anno.markup.replace(reg[k], repl[k].replacement);
	    	if (!setting_color_notes && setting_aggregate_color_highlights)
		    anno.markup = "<span style='background-color:rgba(" + anno.color.join(',') + ",.25)'><strong>(" + color_category + ")</strong> - " + anno.markup + "</span>";
                var markup_formated = this.Utils.str_format(format_markup, 
							    {'content': anno.markup, 'cite': link, 'page': page, 'uri': uri, 'label': anno.title, 
							     'color': color, 'color_category': color_category_hex, 'color_hex': color_hex, 'color_category_name': color_category,
							     'group': groupID, 'key': att.key});
                if(!setting_color_notes)
                    note += markup_formated;
                else {
                    if(!(color_category in note))
                        note[color_category] = this.Utils.str_format(format_title_color, {'title': str_title, 'date': date_str, 'color': color_category});
                    note[color_category] += markup_formated;
                }
            }
            // add to note text (process notes added to PDF)
            if(anno.content && anno.content != "" &&
              (!anno.markup || this.Utils.strDistance(anno.content,anno.markup)>0.15 )) {                    
                var content = anno.content.replace(/(\r\n|\n|\r)/gm,"<br>");
                // '<p><i>%(content) (<a href="%(uri)">note on p.%(page)</a>)</i></p><br>'
                var content_formated = this.Utils.str_format(format_note, 
							     {'content': content, 'cite': link, 'page': page, 'uri': uri, 'label': anno.title,
							      'color': color, 'color_category': color_category_hex, 'color_hex': color_hex, 'color_category_name': color_category,
							      'group': groupID, 'key': att.key});
                if(!setting_color_notes)
                    note += content_formated;
                else {
                    if(!(color_category in note))
                        note[color_category] = this.Utils.str_format(format_title_color, {'title': str_title, 'date': date_str, 'label': anno.title, 'color': color_category});
                    note[color_category] += content_formated;
                }
            }
        }
        return note;
    }.bind(Zotero.ZotFile);

    this.trim = function(str) {
        //return str.replace (/^\s+/, '').replace (/\s+$/, '');
        return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
    };

    /* Runs the annotation extraction code in extract.html/extract.js,
     * to extract annotations from a single PDF. */
    this.extractAnnotationsFromFiles = function() {
        var attachment = this.pdfAttachmentsForExtraction.shift();
        var args = {};
        args.url = attachment.path;
        args.item = attachment.item;
        args.att = attachment.attachment;
        args.itemProgress = attachment.itemProgress;
        args.callbackObj = this;
        args.callback = this.extractionComplete;
        Zotero.ZotFile.PdfExtractor.extractAnnotations(args);
    };            

    /** Keypress listener that cancels the extraction if the user presses escape. */
    this.cancellationListener = function(keyEvent) {
        if (keyEvent.keyCode == KeyboardEvent.DOM_VK_ESCAPE) {
            var zzpa = Zotero.ZotFile.pdfAnnotations;
            zzpa.pdfAttachmentsForExtraction = [];
            zzpa.extractionComplete([], null);
            keyEvent.currentTarget.removeEventListener('keypress', zzpa.cancellationListener);
        }
    };

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
    this.extractionComplete = function(annotations, item, att) {
        // put annotations into a Zotero note
        if (annotations.length > 0) this.createNote(annotations, item, att, "pdf.js");
        // move on to the next pdf, if there is one
        if (this.pdfAttachmentsForExtraction.length > 0) {
            this.extractAnnotationsFromFiles();
        } else { // we're done
            if (this.errorExtractingAnnotations) {
                Zotero.ZotFile.infoWindow(Zotero.ZotFile.ZFgetString('general.report'),Zotero.ZotFile.ZFgetString('extraction.pdfjsFailed'));
            }
            this.errorExtractingAnnotations = false;
            Zotero.Browser.deleteHiddenBrowser(this.pdfHiddenBrowser);
            this.pdfHiddenBrowser = null;
            this.progressWin.startCloseTimer(Zotero.ZotFile.getPref('info_window_duration'));
        }
    };
}
