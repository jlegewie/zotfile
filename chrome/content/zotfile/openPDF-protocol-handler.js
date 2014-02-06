var OpenPDFExtension = new function(){
    this.newChannel = newChannel;
    // this.__defineGetter__('loadAsChrome', function () { return false; });

    function newChannel(uri) {
        // get components
        var ios = Components.classes["@mozilla.org/network/io-service;1"],
            Zotero = Components.classes["@zotero.org/Zotero;1"]
                .getService(Components.interfaces.nsISupports)
                .wrappedJSObject,
            zz = Zotero.ZotFile,
            args;
        generateContent: try {
            // get arguments from uri
            // e.g. zotero://open-pdf/0_EFWJW9U7
            var [key, page] = uri.path.substr(1).split('/');
            // exit if no key
            if(!key) return;
            // get zotero item from key
            var lkh = Zotero.Items.parseLibraryKeyHash(key);
            if (!lkh) return;
            var item = Zotero.Items.getByLibraryAndKey(lkh.libraryID, lkh.key);
            if(item==false) return;
            // if attachment, open file and go to page
            if(!item.isAttachment()) return;
            // get file and path
            var file = item.getFile();
            var path = file.path;
            var filename = path.replace(/^.*[\\\/]/, '');
            // check whether pdf file
            if(filename.toLowerCase().indexOf('.pdf')==-1) return;
            // open pdf and go to page (system specific)
            if(Zotero.isMac) {
                if(zz.prefs.getBoolPref('pdfExtraction.openPdfMac_skim')) {
                    args = [
                        '-e', 'tell app "Skim" to activate', 
                        '-e', 'tell app "Skim" to open "' + path + '"'];
                    if (page)
                        args.push('-e', 'tell document "' + filename + '" of application "Skim" to go to page ' + page);
                    zz.runProcess('/usr/bin/osascript', args, false);
                }
                else {
                    // open pdf file
                    zz.runProcess('/usr/bin/open', ['-a', 'Preview', path]);
                    // go to page using applescript
                    args = [
                      '-e', 'tell app "Preview" to activate', 
                      '-e', 'tell app "System Events" to keystroke "g" using {option down, command down}', 
                      '-e', 'tell app "System Events" to keystroke "' + page + '"',
                      '-e', 'tell app "System Events" to keystroke return'];
                    if (page) zz.runProcess('/usr/bin/osascript', args, false);
                }
            }
            if(Zotero.isWin) {
                // get path to Adobe Reader
                var acrobat = zz.prefs.getCharPref('pdfExtraction.openPdfWin');
                // get path from registry if not set
                // http://stackoverflow.com/questions/11934159/how-extension-can-read-the-registry
                // 'C:\Program Files (x86)\Adobe\Reader 11.0\Reader\AcroRd32.exe'
                if (acrobat==='') {
                    var wrk = Components.classes["@mozilla.org/windows-registry-key;1"]
                                    .createInstance(Components.interfaces.nsIWindowsRegKey);
                    wrk.open(wrk.ROOT_KEY_LOCAL_MACHINE,
                             "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths", 
                             wrk.ACCESS_READ);
                    if(wrk.hasChild('AcroRd32.exe')) {
                        subkey = wrk.openChild('AcroRd32.exe', wrk.ACCESS_READ);
                        acrobat = subkey.readStringValue('Path') + 'AcroRd32.exe';
                    }
                    wrk.close();
                }
                // return if invalid path
                if (!zz.fileExists(acrobat)) {
                    zz.infoWindow(zz.ZFgetString('general.error'), 'Unable to find path for Adobe Reader. Please install or set path in hidden preferences (see zotfile documentation).');
                    return;
                }
                // open pdf on page
                // http://partners.adobe.com/public/developer/en/acrobat/PDFOpenParameters.pdf
                if (page)
                    args = ['/A', '"page=' + page + '"', '"' + path + '"'];
                else
                    args = ['/A', '"' + path + '"'];
                // run process
                zz.runProcess(acrobat, args, false);
            }
            if(Zotero.isLinux) {
                var cmd = zz.prefs.getCharPref('pdfExtraction.openPdfLinux');
                // try okular and evince when nothing is set
                if (cmd==='') {
                    if (page)
                        args = ['-p', page, path];
                    else
                        args = [path];
                    // try okular
                    if (zz.fileExists('/usr/bin/okular')) {
                        zz.runProcess('/usr/bin/okular', args, false);
                    }
                    // try evince
                    else {
                        if (zz.fileExists('/usr/bin/evince')) {
                            zz.runProcess('/usr/bin/evince', args, false);
                        }
                        else {
                            zz.infoWindow('Zotfile', zz.ZFgetString('general.open.pdf'));
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
                    zz.runProcess(cmd.join('-'), args, false);                    
                }
            }        
        }
        catch (e) {
            Zotero.debug(e);
                throw (e);
        }
    }
};

var zotero_ext = Components.classes["@mozilla.org/network/protocol;1?name=zotero"].getService();
var OpenPDFSpec = "zotero://open-pdf";
zotero_ext.wrappedJSObject._extensions[OpenPDFSpec] = OpenPDFExtension;

