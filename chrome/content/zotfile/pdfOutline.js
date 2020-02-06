
/**
 * pdfOutline class to extract pdf outline
 * Runs code to get outline from pdf
 */
Zotero.ZotFile.pdfOutline = new function() {

    this.atts = [];
    this.toc_url = 'chrome://zotfile/content/pdfextract/toc.html';
    this.progressWin = null;
    this.itemProgress = [];

    this.getOutline = Zotero.Promise.coroutine(function* (attIDs, verbose) {
        var verbose = false;
        this.progressWin = null;
        this.itemProgress = [];
        // get selected attachments if no att ids are passed
        if(attIDs == null) {
            verbose = true;
            attIDs = Zotero.ZotFile.getSelectedAttachments();
            Zotero.ZotFile.showWarningMessages(Zotero.ZotFile.ZFgetString('general.warning.skippedAtt'),Zotero.ZotFile.ZFgetString('general.warning.skippedAtt.msg'));
        }
        // get attachment item, parent and file
        // filter attachments
        this.atts = Zotero.Items.get(attIDs)
            .filter(att => att.isAttachment() && !att.isTopLevelItem())
            .filter(att => att.attachmentContentType == 'application/pdf');
        this.atts = yield Zotero.Promise.filter(this.atts, att => att.fileExists());
        if (this.atts.length==0) return;
        if (Zotero.isFx36) {
            Zotero.ZotFile.infoWindow(Zotero.ZotFile.ZFgetString('general.error'),Zotero.ZotFile.ZFgetString('extraction.outdatedFirefox'));
            return;
        }        
        // progresswindow
        this.progressWin = new Zotero.ZotFile.ProgressWindow();
        this.progressWin.changeHeadline('Zotfile: Getting Table of Contents...');
        var icon_pdf = 'chrome://zotero/skin/treeitem-attachment-pdf.png';
        for (var i = 0; i < this.atts.length; i++) {
            this.itemProgress.push(new this.progressWin.ItemProgress(icon_pdf, this.atts[i].getField('title')));
        };
        this.progressWin.addDescription("Zotfile can only extract the TOC for PDFs that have a TOC.");
        if(verbose) this.progressWin.show();
        // get outline in hidden browser
        this.pdfHiddenBrowser = Zotero.Browser.createHiddenBrowser();
        this.pdfHiddenBrowser.loadURI(this.toc_url);            
    });

    this.getOutlineFromFiles = function() {
        var attachment = this.atts.shift();
        var itemProgress = this.itemProgress.shift();
        var args = {};
        args.url = attachment.getFilePath();
        args.att = attachment;
        args.itemProgress = itemProgress;
        args.callbackObj = this;
        args.callback = this.complete;
        Zotero.ZotFile.PdfGetOutline.getOutline(args);
    };

    this.createOutline = function(att, outline, itemProgress) {
        var zz = Zotero.ZotFile;
        itemProgress.setProgress(100);            
        // [JavaScript Error: "mismatched tag. Expected: </p>."]
        if (outline===null) {
            itemProgress.setError();
            return;
        }            
        // create toc from outline
        var win = Services.wm.getMostRecentWindow("navigator:browser"),
            toc = win.document.createElementNS(zz.xhtml, 'ul'),
            key = att.key,
            lib = att.library.libraryType == 'user' ? 0 : att.libraryID,
            href = 'zotero://open-pdf/%(lib)_%(key)/%(page)',
            style = 'list-style-type: none; padding-left:%(padding)px',
            lvl = 1,
            firstElement = true;
        // style toc
        toc.setAttribute('style', 'list-style-type: none; padding-left:0px');
        toc.setAttribute('id', 'toc');
        var create_toc = function(entry) {
            var li = win.document.createElementNS(zz.xhtml, 'li'),
                a  = win.document.createElementNS(zz.xhtml, 'a');
            if (!firstElement)
                li.setAttribute('style', entry.items.length>0 ? 'padding-top:8px' : 'padding-top:4px');
            firstElement = false;
            a.setAttribute('href', zz.Utils.str_format(href, {'lib': lib, 'key': key, 'page': entry.page + 1}));
            a.textContent = Zotero.Utilities.htmlSpecialChars(entry.title);
            a.textContent = a.textContent.replace(/&apos;/g, "'");
            if(entry.page!==undefined)
                li.appendChild(a);
            if(entry.page!==undefined && entry.items.length>0)
                lvl++;
            // add subitems
            if(entry.items.length>0 && lvl <= zz.getPref('pdfOutline.tocDepth')) {
                var ul = win.document.createElementNS(zz.xhtml, 'ul');
                ul.setAttribute('style', zz.Utils.str_format(style, {'padding': 12*(lvl-1)}));        
                entry.items.forEach(create_toc, ul);
                li.appendChild(ul);
            }
            if(entry.page!==undefined && entry.items.length>0)
                lvl--;
            this.appendChild(li);
        };
        outline.forEach(create_toc, toc);
        // add toc to note
        var note = win.document.createElementNS(zz.xhtml, 'div'),
            title = win.document.createElementNS(zz.xhtml, 'p'),
            content = att.getNote().replace(/zotero:\/\//g, 'http://zotfile.com/');
        note.appendChild(zz.Utils.parseHTML(content));
        // title
        title.setAttribute('id', 'title');
        var txt = win.document.createElementNS(zz.xhtml, 'strong');
        txt.textContent = 'Contents';
        title.appendChild(txt);
        // remove previous title and toc
        var pre_toc = note.querySelector('#toc');
        if (pre_toc!==null) note.removeChild(pre_toc);
        var pre_title = note.querySelector('#title');
        if (pre_title!==null) note.removeChild(pre_title);
        // add toc at beginning of note
        note.insertBefore(toc, note.firstChild);
        note.insertBefore(title, note.firstChild);
        // save toc in note
        att.setNote(note.innerHTML.replace(/http:\/\/zotfile.com\//g, 'zotero://'));
        att.saveTx();
        // done with this att...            
        itemProgress.setIcon('chrome://zotero/skin/tick.png');
    };

    this.complete = function(att, outline, itemProgress) {
        // create outline
        this.createOutline(att, outline, itemProgress);
        // move on to the next pdf, if there is one
        if (this.atts.length > 0) {
            this.getOutlineFromFiles();
        } else { // we're done
            Zotero.Browser.deleteHiddenBrowser(this.pdfHiddenBrowser);
            this.pdfHiddenBrowser = null;
            this.progressWin.startCloseTimer(Zotero.ZotFile.getPref("info_window_duration"));
        }
    };
};
