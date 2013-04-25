/**
 * This code adds a protocol handler to open attachment files on specific pages
 * using the format `zotfile://open/[key]/[page]`
 * These uri's are used by zotfile to link extracted text directly to the 
 * correct page in a pdf.
 *
 * Based on this example code:
 * http://mike.kaply.com/2011/01/18/writing-a-firefox-protocol-handler/
 */

// Zotero support of links in notes:
// https://forums.zotero.org/discussion/15186/clickable-links-in-notes/
// https://forums.zotero.org/discussion/25832/note-hyperlinks-in-standalone/

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const nsIProtocolHandler = Ci.nsIProtocolHandler;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function zotfileProtocol() {
}

zotfileProtocol.prototype = {
  scheme: "zotfile",
  protocolFlags: nsIProtocolHandler.URI_NORELATIVE |
                 nsIProtocolHandler.URI_NOAUTH |
                 nsIProtocolHandler.URI_LOADABLE_BY_ANYONE,

  newURI: function(aSpec, aOriginCharset, aBaseURI) {
    var uri = Cc["@mozilla.org/network/simple-uri;1"].createInstance(Ci.nsIURI);
    uri.spec = aSpec;
    return uri;
  },

  newChannel: function(uri) {
    // get components
    var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var Zotero = Components.classes["@zotero.org/Zotero;1"]
      .getService(Components.interfaces.nsISupports)
      .wrappedJSObject;
    var zz = Zotero.ZotFile;
    // exit function
    var exit = function() {
      // return channel
      var channel = ios.newChannelFromURI('about:blank', null);    
      return channel;
    }
    // get arguments from uri
    // e.g. zotfile://open/0_EFWJW9U7
    var [empty, cmd, key, page] = uri.path.substr(1).split('/');
    // exit if no key
    if(!key) exit();
    // open file command
    if (cmd=='open') {
      // get zotero item from key
      var lkh = Zotero.Items.parseLibraryKeyHash(key);
      if (!lkh) exit();
      var item = Zotero.Items.getByLibraryAndKey(lkh.libraryID, lkh.key);
      // if attachment, open file and go to page
      if(!item.isAttachment()) exit();
      // get file and path
      var file = item.getFile();
      var path = file.path;
      // check whether pdf file
      if(path.indexOf('.pdf')==-1) exit();
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
              zz.infoWindow('Zotfile', 'Zotfile is unable to open the pdf file. Please set the option manually ("pdfExtraction.openPdfLinux" in about:config to something like "/usr/bin/okular -p %(page) %(path)")')
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
          if(ex==-1) zz.infoWindow('Zotfile', 'Zotfile is unable to open the pdf file. Please set the option manually ("pdfExtraction.openPdfLinux" in about:config to something like "/usr/bin/okular -p %(page) %(path)")')
        }
      }
    }
    // exit function
    exit();
  },
  classDescription: "Zotfile Protocol Handler",
  contractID: "@mozilla.org/network/protocol;1?name=" + "zotfile",
  classID: Components.ID('{1c32a2c0-ac5e-11e2-9e96-0800200c9a66}'),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIProtocolHandler])
}

if (XPCOMUtils.generateNSGetFactory)
  var NSGetFactory = XPCOMUtils.generateNSGetFactory([zotfileProtocol]);
else
  var NSGetModule = XPCOMUtils.generateNSGetModule([zotfileProtocol]);

