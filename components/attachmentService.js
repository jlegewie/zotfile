/**
 * This code adds a protocol handler to open attachment files on specific pages
 * using the format `zotfile://open/[key]/[page]`
 * These uri's are used by zotfile to link extracted text directly to the 
 * correct page in a pdf.
 *
 * Based on this example code:
 * http://mike.kaply.com/2011/01/18/writing-a-firefox-protocol-handler/
 */

// check whether item exists
// check whether it's a pdf

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

    // zotfile://open/0_EFWJW9U7
    // get arguments from uri
    var [empty, cmd, key, page] = uri.path.substr(1).split('/');
    if(key) {
      // open file command
      if (cmd=='open') {
        // get zotero item from key
        var lkh = Zotero.Items.parseLibraryKeyHash(key);
        if (!lkh) return;
        var item = Zotero.Items.getByLibraryAndKey(lkh.libraryID, lkh.key);
        // if attachment, open file and go to page
        if(item.isAttachment()) {
          var file = item.getFile();
          var path = file.path;        
          // open pdf file
          zz.runProcess('/usr/bin/open', ['-a', 'Preview', path]);
          // goto page in pdf file
          if (page) {
            if(Zotero.isMac) {
              var args = [
                '-e', 'tell app "Preview" to activate', 
                '-e', 'tell app "System Events" to keystroke "g" using {option down, command down}', 
                '-e', 'tell app "System Events" to keystroke "' + page + '"',
                '-e', 'tell app "System Events" to keystroke return']
              zz.runProcess('/usr/bin/osascript', args, false)
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
              // http://stackoverflow.com/questions/2057595/how-do-you-open-a-pdf-at-a-specific-page-from-the-command-line-osx-or-linux
              zz.infoWindow('Linux not yet supported','');
              // which
              // default for KDE: okular -p 5 file2open.pdf
              // default for ubonto: evince -p 5 foo.pdf
            }
          }
        }
      }
    }
    // return channel
    var channel = ios.newChannelFromURI('about:blank', null);    
    return channel;
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

