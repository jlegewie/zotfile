/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';
const SUPPORTED_ANNOTS = ["Text", "Highlight", "Underline"]

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
        // open pdf file
        PDFJS.getDocument(int8View).then(function(pdf) {              
          /** @see Zotero.ZotFile.pdfAnnotations.extractionComplete()
           * (zotfile.js) for documentation on annotations array. */
          var extracted_annotations = [],
              scale = 1.0;

          // function to handle page (render and extract annotations)
          var extract = function(page) {
              var viewport = page.getViewport(scale);

              // Prepare canvas using PDF page dimensions
              var canvas = document.createElement('canvas');
              var context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              // Render PDF page into canvas context
              var renderContext = {
                canvasContext: context,
                viewport: viewport
              };          

              // get annotations
              var annots;
              page.getAnnotations().then(function extractAnno(annos) {
                // filter for supported annotations
                annots = annos.filter(function(anno) {return SUPPORTED_ANNOTS.indexOf(anno.type) >= 0;});
                // skip page if there is nothing interesting
                if (annots.length==0) {
                  // update progress bar
                  Zotero.ZotFile.pdfAnnotations.pageExtractionComplete(page.pageNumber, pdf.numPages);
                  // render next page or finish
                  if(pdf.numPages>page.pageNumber) pdf.getPage(page.pageNumber+1).then(extract);
                  // finished...
                  else {
                    args.callback.call(args.callbackObj, extracted_annotations, args.item);
                  }
                  return;
                }
                // render page
                page.render(renderContext).then(function() {
                  // handle annotations
                  for (var i=0;i<annots.length;i++) {
                    var annot = annots[i];
                    var at = annot.type;
                    if (at && SUPPORTED_ANNOTS.indexOf(at) >= 0) {
                      var a = {};
                      a.filename = args.url; // TODO: basename instead?
                      a.page = page.pageNumber;
                      a.type = annot.type;
                      a.content = annot.content;

                      a.markup = annot.markup ? annot.markup.join(' ') : null;                  
                      // push annotation to array
                      extracted_annotations.push(a);                  
                    }
                  }
                  // update progress bar
                  Zotero.ZotFile.pdfAnnotations.pageExtractionComplete(page.pageNumber, pdf.numPages);
                  // render next page or finish
                  if(pdf.numPages>page.pageNumber) pdf.getPage(page.pageNumber+1).then(extract);
                  // finished...
                  else {
                    args.callback.call(args.callbackObj, extracted_annotations, args.item);
                  }
                },
                // error handler for page
                function(e) {
                  // log error message
                  logError('error rendering page: ' + e);
                  // update progress bar
                  Zotero.ZotFile.pdfAnnotations.pageExtractionComplete(page.pageNumber, pdf.numPages);
                  // render next page or finish
                  if(pdf.numPages>page.pageNumber) pdf.getPage(page.pageNumber+1).then(extract);
                  // finished...
                  else {
                    args.callback.call(args.callbackObj, extracted_annotations, args.item);
                  }
                });
              },
              // error handler for annotations
              function(e) {
                // log error message
                logError('error getting annotations from page: ' + e);
                // update progress bar
                Zotero.ZotFile.pdfAnnotations.pageExtractionComplete(page.pageNumber, pdf.numPages);
                // render next page or finish
                if(pdf.numPages>page.pageNumber) pdf.getPage(page.pageNumber+1).then(extract);
                // finished...
                else {
                  args.callback.call(args.callbackObj, extracted_annotations, args.item);
                }
              });
          };

          // Using promise to fetch the page
          pdf.getPage(1).then(extract);

        },function getPdfError(e) {
              // logError('error opening PDF: ' + args.url + ' ' + e.target + ' ' + e.target.status);
              logError('error opening PDF: ' + args.url + ' ' + e);
              args.callback.call(args.callbackObj, [], args.item);
        });  // PDFJS.getDocument

    // error handler for file promise
    }, function onFileError(msg) {
      logError('error opening PDF: ' + args.url + ' ' + e);
      args.callback.call(args.callbackObj, [], args.item);
    });  // file promise

  } // extractAnnotations()

}; // Zotero.ZotFile.PdfExtractor

// starts extraction for the first PDF
Zotero.ZotFile.pdfAnnotations.extractAnnotationsFromFiles();