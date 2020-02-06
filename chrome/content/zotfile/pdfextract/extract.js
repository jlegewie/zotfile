/* globals Zotero, Components, OS, Uint8Array, PDFJS, logError */

'use strict';
var SUPPORTED_ANNOTS = ["Text", "Highlight", "Underline"];

Zotero.ZotFile.PdfExtractor = {

  /** Extract annotations from a single PDF.
   * @see Zotero.ZotFile.pdfAnnotations.pdfAttachmentsForExtraction (zotfile.js)
   * for documentation on args object.
   */

  extractAnnotations: function(args) {    
    function logError(msg) {
      Components.utils.reportError(msg);
      Zotero.ZotFile.pdfAnnotations.errorExtractingAnnotations = true;
    }

    // read file
    // https://developer.mozilla.org/en-US/docs/JavaScript_OS.File/OS.File_for_the_main_thread    
    Components.utils.import("resource://gre/modules/osfile.jsm");
    OS.File.read(args.url).then(
      function onSuccess(array) {
        // create Uint8Array from file data
        var int8View = new Uint8Array(array);
        // set options for extractions
        var removeHyphens = Zotero.ZotFile.getPref("pdfExtraction.NoteRemoveHyphens");
        args.itemProgress.setProgress(0);
        var progress = function(x, y) {
          args.itemProgress.setProgress(x*100/y);
        };
        // extract annotations
        PDFJS.getPDFAnnotations(int8View, removeHyphens, progress).then(function(obj) {
            args.itemProgress.setProgress(100);
            var icon = obj.annotations.length>0 ? 'chrome://zotero/skin/tick.png' : 'chrome://zotero/skin/cross.png';
            args.itemProgress.setIcon(icon);
            args.callback.call(args.callbackObj, obj.annotations, args.item, args.att);
        }, function(error) {
            args.itemProgress.setError();
            logError('error opening PDF: ' + args.url + ' ' + error);
            args.callback.call(args.callbackObj, [], args.item, args.att);
        });

    // error handler for file promise
    }, function onFileError(msg) {        
        args.itemProgress.setError();
        logError('error opening PDF: ' + args.url + ' ' + msg);
        args.callback.call(args.callbackObj, [], args.item, args.att);
    });  // file promise

  } // extractAnnotations()

}; // Zotero.ZotFile.PdfExtractor

// starts extraction for the first PDF
Zotero.ZotFile.pdfAnnotations.extractAnnotationsFromFiles();
