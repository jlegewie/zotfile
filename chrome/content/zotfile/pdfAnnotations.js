
/**
 * pdfAnnotations class to extract pdf annotations
 * Runs the annotation extraction code in extract.html/extract.js
 */
Zotero.ZotFile.pdfAnnotations = {
    progressWin: null,
    itemProgress: [],
    popplerExtractorFileName: 'ExtractPDFAnnotations',
    popplerExtractorPath:null,
    popplerExtractorVersion:1.0,
    popplerSupportedPlatforms:['MacIntel'],
    pdfExtraction:false,
    popplerExtractorTool:false,
    popplerExtractorSupported:false,
    // popplerExtractorBaseURL:'https://github.com/jlegewie/zotfile/raw/gh-pages/PDFTools/',
    popplerExtractorBaseURL:'http://www.zotfile.com/PDFTools/',

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
                if(Zotero.ZotFile.Tablet.getTabletStatus(att) && Zotero.ZotFile.Tablet.getInfo(att,"mode")==1) {
                    var file_zotero=att.getFile();
                    var file_reader=Zotero.ZotFile.Tablet.getTabletFile(att);

                    // get times
                    var time_reader = Zotero.ZotFile.fileExists(file_reader) ? parseInt(file_reader.lastModifiedTime+"",10) : 0;
                    var time_saved  = parseInt(Zotero.ZotFile.Tablet.getInfo(att,"lastmod"),10);
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
                if(Zotero.ZotFile.Utils.getFiletype(file.leafName)=="pdf") {
                    if (Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJS") || Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJSandPoppler")) {
                        var a = {};
                        a.attachment = att;
                        a.path = file.path;
                        a.filename = file.leafName;
                        a.item = item;
                        this.pdfAttachmentsForExtraction.push(a);
                    }
                    if (this.popplerExtractorTool && (
                        !Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJS") ||
                        Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.UsePDFJSandPoppler"))) {

                        var outputFile=file.path.replace(".pdf",".txt");
                        Zotero.ZotFile.runProcess(this.popplerExtractorPath, [file.path, outputFile]);
                        var annotations = this.popplerExtractorGetAnnotationsFromFile(outputFile);
                        annotations = annotations.map(function(anno) {
                            anno.color = [0, 0, 0];
                            return anno;
                        });
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
                    // show progress window
                    this.progressWin = new Zotero.ZotFile.ProgressWindow();
                    this.progressWin.changeHeadline('Zotfile: Extracting Annotations...');
                    var icon_pdf = 'chrome://zotero/skin/treeitem-attachment-pdf.png';
                    for (var i = 0; i < this.pdfAttachmentsForExtraction.length; i++) {
                        this.pdfAttachmentsForExtraction[i].itemProgress = new this.progressWin.ItemProgress(icon_pdf, this.pdfAttachmentsForExtraction[i].filename);
                    };
                    this.progressWin.show();
                    // start extraction in hidden browser
                    this.pdfHiddenBrowser = Zotero.Browser.createHiddenBrowser();
                    this.pdfHiddenBrowser.loadURI(this.PDF_EXTRACT_URL);
                }
                catch(e) {
                    if(this.progressWin) this.progressWin.close();
                    Zotero.ZotFile.infoWindow('Zotfile extraction', 'ERROR');
                    // close progress window here if it was opened
                    Zotero.ZotFile.messages_fatalError.push(e.name + ": " + e.message + " \n(" + e.fileName + ", " + e.lineNumber + ")");
                }
            }
            else Zotero.ZotFile.infoWindow(Zotero.ZotFile.ZFgetString('general.error'),Zotero.ZotFile.ZFgetString('extraction.outdatedFirefox'));
        }
        // show messages and handle errors
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

//              if(strText!="") var strText=strText.replace(/([a-zA-Z])- ([a-zA-Z])/g, '$1$2');

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
        var note_content = this.getNoteContent(annotations, item, att, method);
        if(typeof note_content == 'string') {
            var note = new Zotero.Item("note");
            note.libraryID = item._libraryID;
            // note.setNote(Zotero.Utilities.text2html(note_content));
            note.setNote(note_content);
            note.setSource(item.id);
            var noteID = note.save();
            /*if (method=="pdf.js" && Zotero.ZotFile.prefs.getBoolPref('pdfExtraction.debug'))
                this.debugExtraction(item, annotations);*/
        }
        else {
            for(var type in note_content) {
                var note = new Zotero.Item("note");
                note.libraryID = item._libraryID;
                note.setNote(note_content[type]);
                note.setSource(item.id);
                var noteID = note.save();
            }
        }
    },

    debugExtraction: function(item, annotations) {
        var note = new Zotero.Item("note");
        note.libraryID = item._libraryID;
        var note_content = annotations
            .map(function(anno){
                if(typeof anno.chars !== 'undefined') return "<p>"+anno.chars.map(function(char) {return JSON.stringify(char);}).join('<br>') +"</p>"
                return '';
            }).join('');
        note.setNote(note_content);
        note.setSource(item.id);
        var noteID = note.save();
    },

    getNoteContent: function(annotations, item, att, method) {
        var getColorCategory = function (r,g,b) {
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
        var zz = Zotero.ZotFile,
            lib = att.libraryID===null ? 0 : att.libraryID,
            format_uri = 'zotero://open-pdf/%(lib)_%(key)/%(page)',
            str_title = zz.ZFgetString('extraction.noteTitle'),
            format_title = zz.prefs.getCharPref("pdfExtraction.formatNoteTitle"),
            format_title_color = zz.prefs.getCharPref("pdfExtraction.formatNoteTitleColor"),
            format_note = zz.prefs.getCharPref("pdfExtraction.formatAnnotationNote"),
            format_highlight = zz.prefs.getCharPref("pdfExtraction.formatAnnotationHighlight"),
            format_underline = zz.prefs.getCharPref("pdfExtraction.formatAnnotationUnderline"),
            settings_colors = JSON.parse(zz.prefs.getCharPref("pdfExtraction.colorCategories")),
            separate_color_notes = zz.prefs.getBoolPref("pdfExtraction.colorNotes"),
            cite = zz.prefs.getBoolPref("pdfExtraction.NoteFullCite") ? zz.replaceWildcard(item, "%a %y:").replace(/_(?!.*_)/," and ").replace(/_/g,", ") : "p. ",
            repl = JSON.parse(zz.prefs.getCharPref("pdfExtraction.replacements")),
            reg = repl.map(function(obj) {
                var flags = ('flags' in obj) ? obj.flags : "g";
                return new RegExp(obj.regex, flags);
            });
        // add note title
        var date_str = zz.prefs.getBoolPref("pdfExtraction.localeDateInNote") ? new Date().toLocaleString() : new Date().toUTCString(),
            title = zz.Utils.str_format(format_title, {'title': str_title, 'date': date_str}),
            note = title;
        if (zz.prefs.getBoolPref("pdfExtraction.UsePDFJSandPoppler"))
            note += ' ' + method;
        if(separate_color_notes) note = {};
        // iterature through annotations
        for (var i=0; i < annotations.length; i++) {
        // annotations.map(function(anno) {
            var anno = annotations[i],
                page = anno.page,
                uri = zz.Utils.str_format(format_uri, {'lib': lib, 'key': att.key, 'page': anno.page});
            // get page
            if(zz.prefs.getBoolPref("pdfExtraction.NoteTruePage")) {
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
                color_category = getColorCategory(anno.color[0], anno.color[1], anno.color[2]),
                color_category_hex = settings_colors[color_category];
            // add markup to note
            if(anno.markup && anno.markup != "") {       
                var format_markup = anno.subtype == "Highlight" ? format_highlight : format_underline;
                for (var k = 0; k < repl.length; k++)
                    anno.markup = anno.markup.replace(reg[k], repl[k].replacement);
                var markup_formated = zz.Utils.str_format(format_markup, {'content': anno.markup, 'cite': link, 'page': page, 'uri': uri, 'label': anno.title, 'color': color, 'color_category': color_category_hex});
                if(!separate_color_notes)
                    note += markup_formated;
                else {
                    if(!(color_category in note))
                        note[color_category] = zz.Utils.str_format(format_title_color, {'title': str_title, 'date': date_str, 'color': color_category});
                    note[color_category] += markup_formated;
                }
            }
            // add to note text
            if(anno.content && anno.content != "" &&
              (!anno.markup || this.strDistance(anno.content,anno.markup)>0.15 )) {                    
                var content = anno.content.replace(/(\r\n|\n|\r)/gm,"<br>");
                // '<p><i>%(content) (<a href="%(uri)">note on p.%(page)</a>)</i></p><br>'
                var content_formated = zz.Utils.str_format(format_note, {'content': content, 'cite': link, 'page': page, 'uri': uri, 'label': anno.title,'color': color, 'color_category': color_category_hex});
                if(!separate_color_notes)
                    note += content_formated;
                else {
                    if(!(color_category in note))
                        note[color_category] = zz.Utils.str_format(format_title_color, {'title': str_title, 'date': date_str, 'label': anno.title, 'color': color_category});
                    note[color_category] += content_formated;
                }
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

    /* Runs the annotation extraction code in extract.html/extract.js,
     * to extract annotations from a single PDF. */
    extractAnnotationsFromFiles: function() {
        var attachment = this.pdfAttachmentsForExtraction.shift();
        var itemProgress = this.itemProgress.shift();
        var args = {};
        args.url = attachment.path;
        args.item = attachment.item;
        args.att = attachment.attachment;
        args.itemProgress = attachment.itemProgress;
        args.callbackObj = this;
        args.callback = this.extractionComplete;
        Zotero.ZotFile.PdfExtractor.extractAnnotations(args);
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
                Zotero.ZotFile.infoWindow(Zotero.ZotFile.ZFgetString('general.report'),Zotero.ZotFile.ZFgetString('extraction.pdfjsFailed'));
            }
            this.errorExtractingAnnotations = false;
            Zotero.Browser.deleteHiddenBrowser(this.pdfHiddenBrowser);
            this.pdfHiddenBrowser = null;
            this.numTotalPdfAttachments = 0;
            this.progressWin.startCloseTimer(Zotero.ZotFile.prefs.getIntPref("info_window_duration"));
        }
    }
};
