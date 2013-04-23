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

    PDFJS.getDocument('http://www.columbia.edu/~jpl2136/zotfile-test.pdf').then(function(pdf) {
    // PDFJS.getDocument(args.url).then(function(pdf) {

      /** @see Zotero.ZotFile.pdfAnnotations.extractionComplete()
       * (zotfile.js) for documentation on annotations array. */
      var extracted_annotations = [],
          numPages = pdf.numPages,
          pageNum = 1,
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
            if (annots.length==0) return;
            // render page
            page.render(renderContext).then(function() {
              // handle annotations
              for (var i=0;i<annots.length;i++) {
                var annot = annots[i];
                var at = annot.type;
                if (at && SUPPORTED_ANNOTS.indexOf(at) >= 0) {
                  var a = {};
                  a.filename = args.url; // TODO: basename instead?
                  a.page = pageNum;
                  a.type = annot.type;
                  a.content = annot.content;

                  a.markup = annot.markup ? annot.markup.join(' ') : null;                  
                  // push annotation to array
                  extracted_annotations.push(a);                  
                }
              }
              // render next page
              // Zotero.ZotFile.pdfAnnotations.pageExtractionComplete(pageNum, pdf.numPages);
              // if(numPages>page.pageNumber) pdf.getPage(page.pageNumber+1).then(extract);
              args.callback.call(args.callbackObj, extracted_annotations, args.item);
            },
            // error handler for page
            function(error) {
              // continue with next page
              // if(numPages>page.pageNumber) pdf.getPage(page.pageNumber+1).then(extract);
            });

          });
      };

      // Using promise to fetch the page
      pdf.getPage(1).then(extract);

    },function getPdfError(e) {
          // logError('error opening PDF: ' + args.url + ' ' + e.target + ' ' + e.target.status);
          logError('error opening PDF: ' + args.url + ' ' + e);
          args.callback.call(args.callbackObj, [], args.item);
    });  // PDFJS.getDocument

  } // extractAnnotations()

}; // Zotero.ZotFile.PdfExtractor

// starts extraction for the first PDF
Zotero.ZotFile.pdfAnnotations.extractAnnotationsFromFiles();