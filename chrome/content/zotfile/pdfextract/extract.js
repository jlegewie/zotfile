/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

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
    Components.utils.import("resource://gre/modules/osfile.jsm")
    OS.File.read(args.url).then(
      function onSuccess(array) {
        // create Uint8Array from file data
        var int8View = new Uint8Array(array);

        var removeHyphens = Zotero.ZotFile.prefs.getBoolPref("pdfExtraction.NoteRemoveHyphens");
        var progress = function(x, y) {};

        PDFJS.getPDFAnnotations(int8View, removeHyphens, progress).then(function(obj) {
            args.callback.call(args.callbackObj, obj.annotations, args.item, args.att);
        }, function(error) {
            logError('error opening PDF: ' + args.url + ' ' + error);
            args.callback.call(args.callbackObj, [], args.item, args.att);
        });

    // error handler for file promise
    }, function onFileError(msg) {
      logError('error opening PDF: ' + args.url + ' ' + e);
      args.callback.call(args.callbackObj, [], args.item, args.att);
    });  // file promise

  } // extractAnnotations()

}; // Zotero.ZotFile.PdfExtractor

// starts extraction for the first PDF
Zotero.ZotFile.pdfAnnotations.extractAnnotationsFromFiles();