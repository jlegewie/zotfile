/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

//
// See README for overview
//

'use strict';


var params = document.location.search.substring(1).split('&');
for (var i = 0; i < params.length; i++) {
  var p = params[i].split('=');
  params[unescape(p[0])] = unescape(p[1]);
}

var url = ('url' in params) ? params.url : '';
//url = 'http://localhost:8000/examples/helloworld/simple-annot-2.pdf';
//var url = 'file:///Users/devietti/Library/Application Support/Firefox/Profiles/26l0l6oq.zotdev/zotero/storage/MPMJ2TTZ/semicolon-haskell-scripting.pdf';

PDFJS.getPdf(
             {
               url: url,
                 progress: function getPdfProgress(evt) {
                 //if (evt.lengthComputable)
                 //alert("progress: " + (evt.loaded / evt.total));
                 //  self.progress(evt.loaded / evt.total);
               },
                 error: function getPdfError(e) {
                 alert(e.target + " " + e.target.status);
                 //var loadingIndicator = document.getElementById('loading');
                 //loadingIndicator.innerHTML = 'Error';
                 //var moreInfo = {
                 //  message: 'Unexpected server response of ' + e.target.status + '.'
                 //};
                 //self.error('An error occurred while loading the PDF.', moreInfo);
               }
             },
             function getPdfLoad(data) {
               var pdf = new PDFJS.PDFDoc(data);
               var page = pdf.getPage(1);
               var metadata = pdf.pdf.xref.fetch( {num:1, gen:0}, false );
               if (metadata.map) {
                   var Author = metadata.map.Author ? pdf.pdf.xref.fetch( metadata.map.Author, false ) : "";
                   var Title = metadata.map.Title ? pdf.pdf.xref.fetch( metadata.map.Title, false ) : "";
                   var Keywords = metadata.map.Keywords ? pdf.pdf.xref.fetch( metadata.map.Keywords, false ) : "";
               }

               // Prepare canvas using PDF page dimensions
                 var canvas = document.createElement('canvas');
                 var context = canvas.getContext('2d');
                 var scale = 1.0;
                 canvas.height = page.height * scale;
                 canvas.width = page.width * scale;
                 // Render PDF page into canvas context
                 page.startRendering(context, 
                                     function renderingDone(err) {
                                         if (err || !page.extractedAnnotations) {
                                             alert('An error occurred while rendering the page.', err);
                                             return;
                                         }
                                         for each (var annot in page.extractedAnnotations) {
                                             if (annot.type && annot.type == "Highlight") {
                                                 if (annot.content) alert(annot.content);
                                             }
                                         }
                                     });
             });
