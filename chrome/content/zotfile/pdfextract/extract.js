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
          //if (evt.lengthComputable) alert('progress: ' + (evt.loaded / evt.total));
        },
        error: function getPdfError(e) {
          Components.utils.reportError('error opening PDF: ' + args.url + ' ' + e.target + ' ' + e.target.status);
          args.callback.call(args.callbackObj, [], args.item);
        }
      },
      function getPdfLoad(data) {
        var pdf = null;
        var pageOne = null;
        try {
          pdf = new PDFJS.PDFDoc(data);
          pageOne = pdf.getPage(1);
        } catch (err) {
          Components.utils.reportError('error loading pdf '+args.url + ': '+err);
          args.callback.call(args.callbackObj, [], args.item);
          return;
        }
        
        // Prepare canvas using PDF page dimensions
        var canvas = document.createElement('canvas');
        var context = canvas.getContext('2d');

        /** @see Zotero.ZotFile.pdfAnnotations.extractionComplete()
         * (zotfile.js) for documentation on annotations array. */
        var annotations = [];
        var pageNum = 1;
        var currentPage = pageOne;

        function pageRequiresRendering(_page) {
          var annots = null;
          try {
            annots = _page.getAnnotations();
          } catch (err) {
            Components.utils.reportError('error while reading annotations of page '+pageNum+' of '+args.url+' '+err);
            return false;
          }
          for each (var annot in annots) {
            if (annot.type && 
                (annot.type == "Highlight" || annot.type == "Underline")) {
              return true;
            }
          }
          return false;
        }

        var renderingDone = function(err) {
          Zotero.ZotFile.pdfAnnotations.pageExtractionComplete(pageNum, pdf.numPages);

          if (err || !currentPage.extractedAnnotations) {
            Components.utils.reportError('An error occurred while rendering page '+pageNum+' of '+args.url+' '+err);
          }

          const SUPPORTED_ANNOTS = ["Text", "Highlight", "Underline"];
          for each (var annot in currentPage.extractedAnnotations) {
            var at = annot.type;
            if (at && SUPPORTED_ANNOTS.indexOf(at) >= 0) {
              var a = {};
              a.filename = args.url; // TODO: basename instead?
              a.page = pageNum;
              a.type = annot.type;
              a.content = annot.content;
              a.markup = annot.markup ? annot.markup.join(' ') : null;
              annotations.push(a);
            }
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

            if (pageRequiresRendering(currentPage)) {
              currentPage.startRendering(context, renderingDone);
            } else {
              try {
                currentPage.extractedAnnotations = currentPage.getAnnotations();
              } catch (err) {
                Components.utils.reportError('error while reading annotations of page '+pageNum+' of '+args.url+' '+err);
              } finally {
                renderingDone(false);
              }
            }
          }
        };

        // NB: highlight annotation extraction currently requires scale == 1.0
        var scale = 1.0;
        canvas.height = pageOne.height * scale;
        canvas.width = pageOne.width * scale;

        try {
          if (pageRequiresRendering(currentPage)) {
            currentPage.startRendering(context, renderingDone);
          } else {
            try {
              currentPage.extractedAnnotations = currentPage.getAnnotations();
            } catch (err) {
              Components.utils.reportError('error while reading annotations of page '+pageNum+' of '+args.url+' '+err);
            } finally {
              renderingDone(false);
            }
          }
        } catch (err) {
          Components.utils.reportError('An error occurred while starting rendering of page '+pageNum+' of '+args.url+' '+err);
          args.callback.call(args.callbackObj, [], args.item);
          return;
        }

      });
  } // extractAnnotations()

}; // Zotero.ZotFile.PdfExtractor

// starts extraction for the first PDF
Zotero.ZotFile.pdfAnnotations.extractAnnotationsFromFiles();