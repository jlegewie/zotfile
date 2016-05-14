
function AsyncChannel(uri, gen) {
    this._generator = gen;
    this._isPending = true;
    
    // nsIRequest
    this.name = uri;
    this.loadFlags = 0;
    this.loadGroup = null;
    this.status = 0;
    
    // nsIChannel
    this.contentLength = -1;
    this.contentType = "text/html";
    this.contentCharset = "utf-8";
    this.URI = uri;
    this.originalURI = uri;
    this.owner = null;
    this.notificationCallbacks = null;
    this.securityInfo = null;
}

AsyncChannel.prototype = {
    asyncOpen: Zotero.Promise.coroutine(function* (streamListener, context) {
        if (this.loadGroup) this.loadGroup.addRequest(this, null);
        
        var channel = this;
        
        var resolve;
        var reject;
        var promise = new Zotero.Promise(function () {
            resolve = arguments[0];
            reject = arguments[1];
        });
        
        var listenerWrapper = {
            onStartRequest: function (request, context) {
                Zotero.debug("Starting request");
                streamListener.onStartRequest(channel, context);
            },
            onDataAvailable: function (request, context, inputStream, offset, count) {
                //Zotero.debug("onDataAvailable");
                streamListener.onDataAvailable(channel, context, inputStream, offset, count);
            },
            onStopRequest: function (request, context, status) {
                Zotero.debug("Stopping request");
                streamListener.onStopRequest(channel, context, status);
                channel._isPending = false;
                if (status == 0) {
                    resolve();
                }
                else {
                    reject(new Error("AsyncChannel request failed with status " + status));
                }
            }
        };
        
        Zotero.debug("AsyncChannel's asyncOpen called");
        var t = new Date;
        
        // Proxy requests to other zotero:// URIs
        let uri2 = this.URI.clone();
        if (uri2.path.startsWith('/proxy/')) {
            let re = new RegExp(uri2.scheme + '://' + uri2.host + '/proxy/([^/]+)(.*)');
            let matches = uri2.spec.match(re);
            uri2.spec = uri2.scheme + '://' + matches[1] + '/' + (matches[2] ? matches[2] : '');
            var data = Zotero.File.getContentsFromURL(uri2.spec);
        }
        try {
            if (!data) {
                data = yield Zotero.spawn(channel._generator, channel)
            }
            if (typeof data == 'string') {
                Zotero.debug("AsyncChannel: Got string from generator");
                
                listenerWrapper.onStartRequest(this, context);
                
                let converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
                    .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
                converter.charset = "UTF-8";
                let inputStream = converter.convertToInputStream(data);
                listenerWrapper.onDataAvailable(this, context, inputStream, 0, data.length);
                
                listenerWrapper.onStopRequest(this, context, this.status);
            }
            // If an async input stream is given, pass the data asynchronously to the stream listener
            else if (data instanceof Ci.nsIAsyncInputStream) {
                Zotero.debug("AsyncChannel: Got input stream from generator");
                
                var pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(Ci.nsIInputStreamPump);
                pump.init(data, -1, -1, 0, 0, true);
                pump.asyncRead(listenerWrapper, context);
            }
            else if (data instanceof Ci.nsIFile || data instanceof Ci.nsIURI) {
                if (data instanceof Ci.nsIFile) {
                    Zotero.debug("AsyncChannel: Got file from generator");
                    data = ioService.newFileURI(data);
                }
                else {
                    Zotero.debug("AsyncChannel: Got URI from generator");
                }

                let uri = data;
                uri.QueryInterface(Ci.nsIURL);
                this.contentType = Zotero.MIME.getMIMETypeFromExtension(uri.fileExtension);
                if (!this.contentType) {
                    let sample = yield Zotero.File.getSample(data);
                    this.contentType = Zotero.MIME.getMIMETypeFromData(sample);
                }
                
                Components.utils.import("resource://gre/modules/NetUtil.jsm");
                NetUtil.asyncFetch(data, function (inputStream, status) {
                    if (!Components.isSuccessCode(status)) {
                        reject();
                        return;
                    }
                    
                    listenerWrapper.onStartRequest(channel, context);
                    try {
                        listenerWrapper.onDataAvailable(channel, context, inputStream, 0, inputStream.available());
                    }
                    catch (e) {
                        reject(e);
                    }
                    listenerWrapper.onStopRequest(channel, context, status);
                });
            }
            else if (data === undefined) {
                this.cancel(0x804b0002); // BINDING_ABORTED
            }
            else {
                throw new Error("Invalid return type (" + typeof data + ") from generator passed to AsyncChannel");
            }
            
            if (this._isPending) {
                Zotero.debug("AsyncChannel request succeeded in " + (new Date - t) + " ms");
                channel._isPending = false;
            }
            
            return promise;
        } catch (e) {
            Zotero.debug(e, 1);
            if (channel._isPending) {
                streamListener.onStopRequest(channel, context, Components.results.NS_ERROR_FAILURE);
                channel._isPending = false;
            }
            throw e;
        } finally {
            if (channel.loadGroup) channel.loadGroup.removeRequest(channel, null, 0);
        }
    }),
    
    // nsIRequest
    isPending: function () {
        return this._isPending;
    },
    
    cancel: function (status) {
        Zotero.debug("Cancelling");
        this.status = status;
        this._isPending = false;
    },
    
    resume: function () {
        Zotero.debug("Resuming");
    },
    
    suspend: function () {
        Zotero.debug("Suspending");
    },
    
    // nsIWritablePropertyBag
    setProperty: function (prop, val) {
        this[prop] = val;
    },
    
    
    deleteProperty: function (prop) {
        delete this[prop];
    },
    
    
    QueryInterface: function (iid) {
        if (iid.equals(Components.interfaces.nsISupports)
                || iid.equals(Components.interfaces.nsIRequest)
                || iid.equals(Components.interfaces.nsIChannel)
                // pdf.js wants this
                || iid.equals(Components.interfaces.nsIWritablePropertyBag)) {
            return this;
        }
        throw Components.results.NS_ERROR_NO_INTERFACE;
    }
};

var OpenPDFExtension = {
    newChannel: function (uri) {
        return new AsyncChannel(uri, function* () {
            // get arguments from uri
            // e.g. zotero://open-pdf/0_EFWJW9U7
            var [key, page] = uri.path.substr(1).split('/');
            // exit if no key
            if(!key) return;
            // get zotero item from key
            var params = {objectType: 'item'};
            var lkh = Zotero.Items.parseLibraryKeyHash(key);
            if (lkh) {
                params.libraryID = lkh.libraryID;
                params.objectKey = lkh.key;
                if (params.libraryID == 0) params.libraryID = Zotero.Libraries.userLibraryID;
            }
            else {
                params.objectID = params.id;
            }
            Zotero.API.parseParams(params);
            var results = yield Zotero.API.getResultsFromParams(params);
            if (results.length == 0) return;
            var item = results[0];
            // if attachment, open file and go to page
            if(!item.isAttachment()) return;
            // get file and path
            var file = item.getFile(),
                path = file.path,
                filename = path.replace(/^.*[\\\/]/, '');
            // check whether pdf file
            if(filename.toLowerCase().indexOf('.pdf') == -1) return;
            // open pdf and go to page (system specific)
            if(Zotero.isMac) {
                var open_with = this.getPref('pdfExtraction.openPdfMac');
                if(open_with == 'Skim') {
                    args = [
                        '-e', 'tell app "Skim" to activate', 
                        '-e', 'tell app "Skim" to open "' + path + '"'];
                    if (page)
                        args.push('-e', 'tell document "' + filename + '" of application "Skim" to go to page ' + page);
                    this.runProcess('/usr/bin/osascript', args, false);
                    return;
                }
                // open pdf file
                this.runProcess('/usr/bin/open', ['-a', open_with, path]);
                // go to page using applescript
                args = [
                  '-e', 'tell app "' + open_with + '" to activate', 
                  '-e', 'tell app "System Events" to keystroke "g" using {option down, command down}', 
                  '-e', 'tell app "System Events" to keystroke "' + page + '"',
                  '-e', 'tell app "System Events" to keystroke return'];
                if (page) this.runProcess('/usr/bin/osascript', args, false);
            }
            if(Zotero.isWin) {
                // get path to PDF Reader
                var pdf_reader = this.getPref('pdfExtraction.openPdfWin');
                pdf_reader = pdf_reader==='' ? this.Utils.getPDFReader() : pdf_reader;
                if (!this.fileExists(pdf_reader)) {
                    this.infoWindow(this.ZFgetString('general.error'), 'Unable to find path for PDF Reader. Please set path manually in hidden preferences (see zotfile documentation).');
                    return;
                }
                // open pdf on page
                // Adobe Acrobat: http://partners.adobe.com/public/developer/en/acrobat/PDFOpenParameters.pdf
                // PDF-XChange: http://help.tracker-software.com/eu/default.aspx?pageid=PDFXView25:command_line_options
                if (page)
                    args = ['/A', 'page=' + page, path];
                else
                    args = [path];
                // run process
                this.runProcess(pdf_reader, args, false);
            }
            if(Zotero.isLinux) {
                var cmd = this.getPref('pdfExtraction.openPdfLinux');
                // try okular and evince when nothing is set
                if (cmd === '') {
                    if (page)
                        args = ['-p', page, path];
                    else
                        args = [path];
                    // try okular
                    if (this.fileExists('/usr/bin/okular')) {
                        this.runProcess('/usr/bin/okular', args, false);
                    }
                    // try evince
                    else {
                        if (this.fileExists('/usr/bin/evince')) {
                            this.runProcess('/usr/bin/evince', args, false);
                        }
                        else {
                            this.infoWindow('Zotfile', this.ZFgetString('general.open.pdf'));
                        }
                    }
                }
                else {
                    // get page argument
                    cmd = cmd.split('-');
                    var arg = cmd.pop();
                    // argument for call
                    if (page)
                        args = ['-' + arg, page, path];
                    else
                        args = [path];
                    // run process
                    this.runProcess(cmd.join('-'), args, false);
                }
            }
        }.bind(Zotero.ZotFile));
    }
};

var zotero_ext = Components.classes["@mozilla.org/network/protocol;1?name=zotero"].getService();
var OpenPDFSpec = "zotero://open-pdf";
zotero_ext.wrappedJSObject._extensions[OpenPDFSpec] = OpenPDFExtension;
