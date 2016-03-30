
/**
 * Zotero.ZotFile.Tablet
 * Functions related to tablet features
 */
Zotero.ZotFile.Utils = new function() {

    this.removeDuplicates = removeDuplicates;
    this.arrayReplace = arrayReplace;
    this.addSuffix = addSuffix;
    this.getFiletype = getFiletype;
    this.str_format = str_format;
    this.normalize_path = normalize_path;
    this.copy2Clipboard = copy2Clipboard;
    this.getPDFReader = getPDFReader;
    this.removeItemTag = removeItemTag;
    this.parseHTML = parseHTML;

    // detect duplicates in array
    function removeDuplicates(x) {
        x = x.sort();
        var y = [];

        y.push(x[0]);
        for (var i=1; i < (x.length); i++) {
            if (x[i-1] != x[i]) y.push(x[i]);
        }
        return(y);
    }

    /**
     * Search and replace string elements in array
     * @param  {array}  x
     * @param  {string} search  Search terms
     * @param  {string} replace Replace with
     * @return {array}          Updated array
     */
    function arrayReplace(x, search, replace) {
        for(var i = 0; i < x.length; i++) {
            if(x[i] == search) x.splice(i, 1, replace);
        }
        return(x);
    }

    /**
     * Add suffix to filename
     * @param {string}  filename The filename
     * @param {integer} k        The suffix
     */
    function addSuffix(filename, k) {
        return filename.replace(/(\d{1,3})?(\.[\w\d]*)$/i, k + "$2");
    }

    /**
     * Get the file type from a filename
     * @param  {string} filename Filename with file extension.
     * @return {string}          File type.
     */
    function getFiletype(filename) {
        if (typeof filename != 'string')
            throw("Zotero.ZotFile.Utils.getFiletype(): 'path' is not a string.")
        var pos = filename.lastIndexOf('.');
        return pos == -1 ? '' : filename.substr(pos + 1);
    }

    // format array using named placeholders such as '%(test)'
    function str_format() {
        var args = arguments;
        return args['0'].replace(/%\((\w+)\)/g, function(match, name) {
          return args['1'][name];
       });
    }


     /**
     * Normalize a path by removing any unneeded characters
     * Adopted from OS.Path module
     * https://dxr.mozilla.org/mozilla-central/source/toolkit/components/osfile/modules/ospath_unix.jsm
     * https://dxr.mozilla.org/mozilla-central/source/toolkit/components/osfile/modules/ospath_win.jsm
     */
    function normalize_path(path) {
        var normalize_path_win = function(path) {
            var winGetDrive = function(path) {
                if (path == null) {
                    throw new TypeError("path is invalid");
                }

                if (path.startsWith("\\\\")) {
                // UNC path
                if (path.length == 2) {
                    return null;
                }
                let index = path.indexOf("\\", 2);
                if (index == -1) {
                    return path;
                }
                return path.slice(0, index);
                }
                // Non-UNC path
                let index = path.indexOf(":");
                if (index <= 0) return null;
                return path.slice(0, index + 1);
            };

            var winIsAbsolute = function(path) {
                let index = path.indexOf(":");
                return path.length > index + 1 && path[index + 1] == "\\";
            };
        
            let stack = [];

            if (!path.startsWith("\\\\")) {
                // Normalize "/" to "\\"
                path = path.replace(/\//g, "\\");
            }

            // Remove the drive (we will put it back at the end)
            let root = winGetDrive(path);
            if (root) {
                path = path.slice(root.length);
            }

            // Remember whether we need to restore a leading "\\" or drive name.
            let absolute = winIsAbsolute(path);

            // And now, fill |stack| from the components,
            // popping whenever there is a ".."
            path.split("\\").forEach(function loop(v) {
                switch (v) {
                    case "":  case ".": // Ignore
                        break;
                    case "..":
                        if (stack.length == 0) {
                        if (absolute) {
                          throw new Error("Path is ill-formed: attempting to go past root");
                        } else {
                         stack.push("..");
                        }
                        } else {
                        if (stack[stack.length - 1] == "..") {
                          stack.push("..");
                        } else {
                          stack.pop();
                        }
                        }
                        break;
                    default:
                        stack.push(v);
                }
            });

            // Put everything back together
            let result = stack.join("\\");
            if (absolute || root) {
                result = "\\" + result;
            }
            if (root) {
                result = root + result;
            }
            return result;
        };

        var normalize_path_unix = function(path) {
            let stack = [];
            let absolute;
            if (path.length >= 0 && path[0] == "/") {
                absolute = true;
            } else {
                absolute = false;
            }
            path.split("/").forEach(function(v) {
                switch (v) {
                    case "":  case ".":// fallthrough
                        break;
                    case "..":
                    if (stack.length == 0) {
                        if (absolute) {
                            throw new Error("Path is ill-formed: attempting to go past root");
                        } else {
                            stack.push("..");
                        }
                        } else {
                        if (stack[stack.length - 1] == "..") {
                            stack.push("..");
                        } else {
                            stack.pop();
                        }
                    }
                    break;
                    default:
                      stack.push(v);
                }
            });
            let string = stack.join("/");
            return absolute ? "/" + string : string;
        };

        if (Zotero.isWin) path = normalize_path_win(path);
        if (!Zotero.isWin) path = normalize_path_unix(path);
        return(path)
    }


    function copy2Clipboard(txt) {
        const gClipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
            .getService(Components.interfaces.nsIClipboardHelper);
        gClipboardHelper.copyString(txt);
    }

    function getPDFReader() {
        var wrk = Components.classes["@mozilla.org/windows-registry-key;1"]
                            .createInstance(Components.interfaces.nsIWindowsRegKey);

        //get handler for PDFs
        var tryKeys = [
            {
                root: wrk.ROOT_KEY_CURRENT_USER,
                path: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.pdf\\UserChoice',
                value: 'Progid'
            },
            {
                root: wrk.ROOT_KEY_CLASSES_ROOT,
                path: '.pdf',
                value: ''
            }
        ];
        var progId;
        for(var i=0; !progId && i<tryKeys.length; i++) {
            try {
                wrk.open(tryKeys[i].root,
                     tryKeys[i].path,
                     wrk.ACCESS_READ);
                progId = wrk.readStringValue(tryKeys[i].value);
            } catch(e) {}
        }

        if(!progId) {
            wrk.close();
            return;
        }
        
        //get version specific handler, if it exists
        try {
            wrk.open(wrk.ROOT_KEY_CLASSES_ROOT,
                progId + '\\CurVer',
                wrk.ACCESS_READ);
            progId = wrk.readStringValue('') || progId;
        } catch(e) {}

        //get command
        var success = false;
        tryKeys = [
            progId + '\\shell\\Read\\command',
            progId + '\\shell\\Open\\command'
        ];
        for(var i=0; !success && i<tryKeys.length; i++) {
            try {
                wrk.open(wrk.ROOT_KEY_CLASSES_ROOT,
                     tryKeys[i],
                     wrk.ACCESS_READ);
                success = true;
            } catch(e) {}
        }

        if(!success) {
            wrk.close();
            return;
        }

        var command = wrk.readStringValue('').match(/^(?:".+?"|[^"]\S+)/);
        
        wrk.close();
        
        if(!command) return;
        return command[0].replace(/"/g, '');
    }

    // removes item tag only if no child item has that tag
    function removeItemTag(item, tag) {
        if(item.isRegularItem() && item.hasTag(tag)) {
            if(!Zotero.Items.get(item.getAttachments())
                .some(function(att) {return att.hasTag(tag);}))
                    item.removeTag(tag);
        }
    }

   // https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/DOM_Building_and_HTML_Insertion#Safely_Using_Remote_HTML
    /**
     * Safely parse an HTML fragment, removing any executable
     * JavaScript, and return a document fragment.
     *
     * @param {Document} doc The document in which to create the
     *     returned DOM tree.
     * @param {string} html The HTML fragment to parse.
     * @param {boolean} allowStyle If true, allow <style> nodes and
     *     style attributes in the parsed fragment. Gecko 14+ only.
     * @param {nsIURI} baseURI The base URI relative to which resource
     *     URLs should be processed. Note that this will not work for
     *     XML fragments.
     * @param {boolean} isXML If true, parse the fragment as XML.
     */
    function parseHTML(html) {
        var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                        .getService(Components.interfaces.nsIIOService);
        var allowStyle = true,
            baseURI = ioService.newURI(Zotero.ZotFile.xhtml, null, null),
            isXML = false,
            PARSER_UTILS = "@mozilla.org/parserutils;1";

        // User the newer nsIParserUtils on versions that support it.
        if (PARSER_UTILS in Components.classes) {
            var parser = Components.classes[PARSER_UTILS]
                                   .getService(Components.interfaces.nsIParserUtils);
            if ("parseFragment" in parser)
                return parser.parseFragment(html, allowStyle ? parser.SanitizerAllowStyle : 0,
                                            !!isXML, baseURI, document.documentElement);
        }

        return Components.classes["@mozilla.org/feed-unescapehtml;1"]
                         .getService(Components.interfaces.nsIScriptableUnescapeHTML)
                         .parseFragment(html, !!isXML, baseURI, document.documentElement);
    }
}