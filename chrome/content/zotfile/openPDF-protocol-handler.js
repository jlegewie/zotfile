var OpenPDFExtension = new function(){
    this.newChannel = newChannel;
    // this.__defineGetter__('loadAsChrome', function () { return false; });

    function newChannel(uri) {
      // get components
      var ios = Components.classes["@mozilla.org/network/io-service;1"];
      var Zotero = Components.classes["@zotero.org/Zotero;1"]
        .getService(Components.interfaces.nsISupports)
        .wrappedJSObject;
      var zz = Zotero.ZotFile;
      generateContent:try {
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
        // check whether pdf file
        if(path.indexOf('.pdf')==-1) return;
        // open pdf and go to page (system specific)
        if(Zotero.isMac) {
          // open pdf file
          zz.runProcess('/usr/bin/open', ['-a', 'Preview', path]);
          // go to page using applescript
          var args = [
            '-e', 'tell app "Preview" to activate', 
            '-e', 'tell app "System Events" to keystroke "g" using {option down, command down}', 
            '-e', 'tell app "System Events" to keystroke "' + page + '"',
            '-e', 'tell app "System Events" to keystroke return']
          if (page) zz.runProcess('/usr/bin/osascript', args, false)
        }
        if(Zotero.isWin) {
          // path to Adobe Reader
          // 'C:\Program Files (x86)\Adobe\Reader 10.0\Reader\AcroRd32.exe'
          // http://stackoverflow.com/questions/11934159/how-extension-can-read-the-registry
          var wrk = Components.classes["@mozilla.org/windows-registry-key;1"]
              .createInstance(Components.interfaces.nsIWindowsRegKey);
          wrk.open(wrk.ROOT_KEY_LOCAL_MACHINE,
              "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths",
              wrk.ACCESS_READ);
          var acrobat = wrk.readStringValue("AcroRd32.exe");
          wrk.close();
          // open pdf file on page
          zz.runProcess(acrobat, ['/A','"path=' + page + '"', path])
        }
        if(Zotero.isLinux) {
          var cmd = zz.prefs.getCharPref('pdfExtraction.openPdfLinux');
          // try okular and evince when nothing is set
          if (cmd=="") {
            // try okular
            if (zz.fileExists('/usr/bin/okular')) {
              zz.runProcess('/usr/bin/okular', ['-p', page, path]);
            }
            // try evince
            else {
              if (zz.fileExists('/usr/bin/evince')) {
                zz.runProcess('/usr/bin/evince', ['-p', page, path]);
              }
              else {
                zz.infoWindow('Zotfile', zz.ZFgetString('general.open.pdf'));
              }
            }
          }
          // user defined command
          else {
            // process option to correct format
            // e.g. cmd = '/usr/bin/okular -p %(page) %(path)';
            cmd = cmd.split(' ')
                .map(function(str) { 
                    return str_format(str, {'page': page, 'path': path});
                });
            // run process
            var ex = zz.runProcess(cmd[0], cmd.slice(1));
            if(ex==-1) zz.infoWindow('Zotfile', zz.ZFgetString('general.open.pdf'));
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
var OpenPDFSpec = "zotero://open-pdf"
zotero_ext.wrappedJSObject._extensions[OpenPDFSpec] = OpenPDFExtension;

