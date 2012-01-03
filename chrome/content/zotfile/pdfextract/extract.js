/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

Zotero.ZotFile.PdfExtractor = {

  /** Extract annotations from a single PDF.
   * @see Zotero.ZotFile.pdfAnnotations.pdfAttachmentsForExtraction (zotfile.js)
   * for documentation on args object.
   */
  extractAnnotations: function(args) {
    PDFJS.getPdf(
      {
        url: args.url,
        progress: function getPdfProgress(evt) {
          //if (evt.lengthComputable) alert("progress: " + (evt.loaded / evt.total));
        },
        error: function getPdfError(e) {
          Components.utils.reportError("pdf error: " + args.url + " " + e.target + " " + e.target.status);
          args.callback.call(args.callbackObj, [], args.item);
        }
      },
      function getPdfLoad(data) {
        var pdf = new PDFJS.PDFDoc(data);
        var pageOne = pdf.getPage(1);
        
        // Prepare canvas using PDF page dimensions
        var canvas = document.createElement('canvas');
        var context = canvas.getContext('2d');

        /** @see Zotero.ZotFile.pdfAnnotations.extractionComplete()
         * (zotfile.js) for documentation on annotations array. */
        var annotations = [];
        var pageNum = 1;
        var currentPage = pageOne;

        var renderingDone = function(err) {
          //alert("renderingDone() page " + pageNum + " of " + pdf.numPages); // jld
          
          if (err || !currentPage.extractedAnnotations) {
            Components.utils.reportError('An error occurred while rendering page ' + pageNum + " of " + args.url + " " + err);
          }

          for each (var annot in currentPage.extractedAnnotations) {
            var a = {};
            a.filename = args.url; // TODO: basename instead?
            a.page = pageNum;
            a.type = annot.type;
            a.content = annot.content;
            annotations.push(a);
            // if (annot.type && annot.type == "Highlight") { // jld
            //   if ('content' in annot) alert("highlight: " + annot.content);
            // }
          }
          
          pageNum++;
          if (pageNum > pdf.numPages) {
            args.callback.call(args.callbackObj, annotations, args.item);
          } else {
            currentPage = pdf.getPage(pageNum);
            // NB: highlight annotation extraction currently requires scale == 1.0
            var scale = 1.0;
            canvas.height = currentPage.height * scale;
            canvas.width = currentPage.width * scale;

            currentPage.startRendering(context, renderingDone);
          }
        };

        // NB: highlight annotation extraction currently requires scale == 1.0
        var scale = 1.0;
        canvas.height = pageOne.height * scale;
        canvas.width = pageOne.width * scale;

        currentPage.startRendering(context, renderingDone);

      });
  } // extractAnnotations()

}; // Zotero.ZotFile.PdfExtractor

Zotero.ZotFile.pdfAnnotations.extractAnnotationsFromFiles.call(Zotero.ZotFile.pdfAnnotations);