
/**
 * Zotero.ZotFile.Tablet
 * Functions related to tablet features
 */
Zotero.ZotFile.Utils = new function() {

    /**
     * Remove duplicate elements from array
     * @param  {array} x Array
     * @return {array}   Modified array.
     */
    this.removeDuplicates = function(x) {
        x = x.sort();
        var y = [];

        y.push(x[0]);
        for (var i=1; i < (x.length); i++) {
            if (x[i-1] != x[i]) y.push(x[i]);
        }
        return(y);
    }.bind(Zotero.ZotFile);

    /**
     * Remove element from array
     * @param  {array} arr Array
     * @return {array}     Array with element removed
     */
    this.removeFromArray = function (arr) {
        var what, a = Array.prototype.slice.call(arguments).splice(1), L = a.length, ax;
        while (L && arr.length) {
            what = a[--L];
            while ((ax = arr.indexOf(what)) !== -1) {
                arr.splice(ax, 1);
            }
        }
        return arr;
    }.bind(Zotero.ZotFile);

    /**
     * Search and replace string elements in array
     * @param  {array}  x
     * @param  {string} search  Search terms
     * @param  {string} replace Replace with
     * @return {array}          Updated array
     */
    this.arrayReplace = function(x, search, replace) {
        for(var i = 0; i < x.length; i++) {
            if(x[i] == search) x.splice(i, 1, replace);
        }
        return(x);
    }.bind(Zotero.ZotFile);

    /**
     * Get collection path from Zotero.Item
     * @param  {Zotero.Item}
     * @return {array}          Array with paths that reflect zotero items
     */
    this.getCollectionPathsOfItem = function(item) {
        var getCollectionPath = function(collectionID) {
            var collection = Zotero.Collections.get(collectionID);
            if (collection.parent === false)  return collection.name

            return OS.Path.normalize(getCollectionPath(collection.parentID) + Zotero.ZotFile.folderSep + collection.name);
        };

        return item.getCollections().map(getCollectionPath);
    }.bind(Zotero.ZotFile);

    /**
     * Add suffix to filename
     * @param {string}  filename The filename
     * @param {integer} k        The suffix
     */
    this.addSuffix = function(filename, k) {
        return filename.replace(/(\.[\w\d]*)$/i, k + "$1");
    }.bind(Zotero.ZotFile);

    /**
     * Add numerical suffix to filename
     * @param {string}  filename The filename
     * @param {integer} k        The suffix
     */
    this.addNumericalSuffix = function(filename, k) {
        return filename.replace(/(\d{1,3})?(\.[\w\d]*)$/i, k + "$2");
    }.bind(Zotero.ZotFile);

    /**
     * Get the file type from a filename
     * @param  {string} filename Filename with file extension.
     * @return {string}          File type.
     */
    this.getFiletype = function(filename) {
        if (typeof filename != 'string')
            throw("Zotero.ZotFile.Utils.getFiletype(): 'path' is not a string.")
        var pos = filename.lastIndexOf('.');
        return pos == -1 ? '' : filename.substr(pos + 1);
    }.bind(Zotero.ZotFile);

    /**
     * Format string using named placeholders such as '%(@name [name])'
     * @return {str} [description]
     */
    this.str_format = function(str, args) {
        return str.replace(/%\((\w+)\)/g, (match, name) => args[name]);
    }.bind(Zotero.ZotFile);

    /**
     * Distance between two strings
     * @param  {str} s1 First string
     * @param  {str} s2 Second string
     * @return {num}    distance
     */
    this.strDistance = function (s1, s2) {
        s1 = Zotero.Utilities.trimInternal(s1).replace(/ /g,"");
        s2 = Zotero.Utilities.trimInternal(s2).replace(/ /g,"");
        var l = (s1.length > s2.length) ? s1.length : s2.length;
        return Zotero.Utilities.levenshtein(s1, s2)/l;
    }.bind(Zotero.ZotFile);

    /**
     * Complete file path
     * @param  {string} folder   Path to folder
     * @param  {string} filename Filename
     * @return {string}          Completed and normalized path
     */
    this.joinPath = function(folder, filename) {
        var path = folder + this.folderSep + filename;
        return OS.Path.normalize(path);
    }.bind(Zotero.ZotFile);

    /**
     * Copy text to clipboard
     * @param  {string} txt Text to copy to clipboard
     * @return {void}
     */
    this.copy2Clipboard = function(txt) {
        const gClipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
            .getService(Components.interfaces.nsIClipboardHelper);
        gClipboardHelper.copyString(txt);
    }.bind(Zotero.ZotFile);

    /**
     * Get path to default pdf reader application on windows
     * @return {string} Path to default pdf reader application
     */
    this.getPDFReader = function() {
        if (!Zotero.isWin) throw('Zotero.ZotFile.Utils.getPDFReader(): Function only works on windows platforms.')
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
    }.bind(Zotero.ZotFile);

    /**
     * Remove item tag only if no child item has that tag
     * @param  {zitem} item Zotero item
     * @param  {int} tag    Zotero tag it
     * @return {void}
     */
    this.removeItemTag = function(item, tag) {
        if(item.isRegularItem() && item.hasTag(tag)) {
            if(!Zotero.Items.get(item.getAttachments())
                .some(function(att) {return att.hasTag(tag);}))
                    item.removeTag(tag);
        }
    }.bind(Zotero.ZotFile);

    /**
     * Load URI using ZoteroPane_Local
     * @param  {uri} string URL
     * @return {void}
     */
    this.loadURI = function(uri) {
        ZoteroPane_Local.loadURI(uri);
    };

    /**
     * Safely parse an HTML fragment, removing any executable
     * JavaScript, and return a document fragment.
     * https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/DOM_Building_and_HTML_Insertion#Safely_Using_Remote_HTML
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
    this.parseHTML = function(html) {
        var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                        .getService(Components.interfaces.nsIIOService);
        var allowStyle = true,
            baseURI = ioService.newURI(this.xhtml, null, null),
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
    }.bind(Zotero.ZotFile);
}