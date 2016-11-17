/* globals Zotero, Components, OS, Uint8Array, PDFJS, logError */

'use strict';

Zotero.ZotFile.PdfGetOutline = {

    /** Get outline from a single PDF.
    * @see Zotero.ZotFile.pdfOutline (zotfile.js)
    * for documentation on args object.
    */

    getOutline: function(args) {    
        function logError(msg) {
            Components.utils.reportError(msg);
        }

        // read file
        // https://developer.mozilla.org/en-US/docs/JavaScript_OS.File/OS.File_for_the_main_thread    
        Components.utils.import("resource://gre/modules/osfile.jsm");
        OS.File.read(args.url).then(
            function onSuccess(array) {
                // create Uint8Array from file data
                var int8View = new Uint8Array(array);
                // get pdf outline
                PDFJS.getDocument(int8View).then(function(pdf) {
                    // get table of content for pdfs
                    pdf.getOutline().then(function(outline) {
                        if(outline===null) {
                            args.callback.call(args.callbackObj, args.att, null, args.itemProgress);
                            return;
                        }
                        // build page index
                        var pageIndex = [],
                            pageMap = {};
                        var buildIndex = function(obj) {
                            if(obj.dest && obj.dest[0])
                                pageIndex.push(obj.dest);
                            obj.items.forEach(buildIndex);
                        };
                        outline.forEach(buildIndex);

                        // create page map
                        pdf.getDestinations().then(function(dest) {
                            var sequence = Promise.resolve();
                            pageIndex.reduce(function(sequence, ref) {
                                // Add these actions to the end of the sequence
                                return sequence.then(function() {
                                    // return pdf.getPageIndex(ref);
                                    return typeof ref == 'string' ?
                                      ((ref in dest && dest[ref]!==null) ? pdf.getPageIndex(dest[ref][0]) : 0) :
                                       pdf.getPageIndex(ref[0]);
                                }).then(function(page) {
                                    var key = typeof ref =='string' ? ref : JSON.stringify(ref[0]);
                                    pageMap[key] = page;
                                });
                            }, Promise.resolve()).then(function() {
                                var toc = function(obj) {
                                    var key, page;
                                    if(obj.dest) {
                                        key = typeof obj.dest =='string' ? obj.dest : JSON.stringify(obj.dest[0]);
                                        page = pageMap[key];
                                    }
                                    return {
                                        'page': page,
                                        'title': obj.title,
                                        'items': obj.items.map(toc)
                                    };
                                };
                                outline = outline.map(toc);
                                // remove highest level if it just has one item
                                if(outline.length==1)
                                    if(outline[0].items.length>0)
                                        outline = outline[0].items;
                                // returned outline
                              args.callback.call(args.callbackObj, args.att, outline, args.itemProgress);
                            });
                        }); /* getDestinations() */
                    }); /* getOutline() */
                },
                // error handler for getDocument
                function(err) {
                    args.itemProgress.setError();
                    logError('error opening PDF: ' + args.url + ' ' + err);
                    args.callback.call(args.callbackObj, args.att, null, args.itemProgress);
                });

        // error handler for file promise
        }, function onFileError(msg) {        
            args.itemProgress.setError();
            logError('error opening PDF: ' + args.url + ' ' + msg);
            args.callback.call(args.callbackObj, args.att, null, args.itemProgress);
        });  // file promise

    } // getOutline()

}; // Zotero.ZotFile.PdfOutline

// starts extraction for the first PDF
Zotero.ZotFile.pdfOutline.getOutlineFromFiles();
