/**
 * Zotero.ZotFile.UI
 * Functions to show zotfile UI
 */

Zotero.ZotFile.UI = new function() {

    /**
     * Show collection menu for saved tablet search
     * @return {void}
     */
    this.showCollectionMenu = function() {
        // ZoteroPane object
        var doc = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane.document;
        // check regular item or attachment selected & custom subfolders
        var collection_menu = this.getPref("tablet") && this.Tablet.checkSelectedSearch() && this.getPref("tablet.projectFolders") == 2;
        // show or hide zotfile menu items
        doc.getElementById("id-zotfile-collection-separator").hidden = !collection_menu;
        doc.getElementById("id-zotfile-collection-showall").hidden = !collection_menu;
        doc.getElementById("id-zotfile-collection-restrict").hidden = !collection_menu;
    }.bind(Zotero.ZotFile);

    this.buildZotFileCollectionMenu = function() {
        var win = Services.wm.getMostRecentWindow('navigator:browser'),
            nodes = win.ZoteroPane.document.getElementById('id-zotfile-collection-menu').childNodes;
        // hide all items by default
        for (i = 0; i < nodes.length; i++) nodes[i].setAttribute('hidden', true);
        // get subfolders
        var subfolders = JSON.parse(this.getPref('tablet.subfolders'));
        // show basefolder
        nodes[0].setAttribute('hidden', false);
        nodes[1].setAttribute('hidden', false);
        nodes[2].setAttribute('hidden', false);
        // show subfolders
        subfolders.forEach(function(folder, i) {
            // set attributes of menu item
            nodes[i + 3].setAttribute('label', folder.label);
            nodes[i + 3].setAttribute('tooltiptext', this.ZFgetString('menu.collection.tooltip', [folder.path]));
            // show menu item
            nodes[i + 3].setAttribute('hidden', false);
        }, this);
    }.bind(Zotero.ZotFile);

    this.showMenu = function() {
        // get selected items
        var pane = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane,
            items = pane.getSelectedItems();
        // check regular item or attachment selected
        var show_menu = items.some(item => item.isAttachment() || item.isRegularItem());
        // show or hide zotfile menu items
        pane.document.getElementById("id-zotfile-separator").hidden = !show_menu;
        pane.document.getElementById("id-zotfile-attach-file").hidden = !show_menu;
        pane.document.getElementById("id-zotfile-manage-attachments").hidden = !show_menu;
    }.bind(Zotero.ZotFile);

    this.buildZotFileMenu = Zotero.Promise.coroutine(function* () {
        // get selected items
        var win = Services.wm.getMostRecentWindow("navigator:browser"),
            items = win.ZoteroPane.getSelectedItems();
        // get menu and recreate structure of child items
        var menu = win.ZoteroPane.document.getElementById('id-zotfile-menu');
        var m = {
            warning1: 0,
            rename: 1,
            extractanno: 2,
            getoutline: 3,
            sep1: 4,
            warning2: 5,
            push2reader: 6,
            updatefile: 7,
            pullreader: 8,
            sep2: 9,
            tablet: 10,
            warning3: 11,
            subfolders: new Array(12,13,14,15,16,17,18,19,20,21,22,23,24,25,26),
            sep3: 27,
            menuConfigure: 28,
            length:29
        };
        // list of disabled and show menu-items
        var disable = [m.tablet, m.warning1, m.warning2, m.warning3], show = [];
        // check selected items
        var tags_tablet = [this.Tablet.tag, this.Tablet.tagMod];
        var atts = items
            .map(item => item.isRegularItem() ? Zotero.Items.get(item.getAttachments()) : item)
            .reduce((a, b) => a.concat(b), []);
        var group_library = items[0].libraryID != 1,
            menu_item = items.some(item => item.isRegularItem() || item.isAttachment()),
            menu_att = atts.some(att => att.isAttachment()),
            menu_tablet = atts.some(att => this.Tablet.getTabletStatus(att));
        // check whether destination folder is defined (and valid)
        var valid_destination = yield OS.File.exists(this.getPref('tablet.dest_dir'));
        // warnings
        if (!menu_item) {
            show.push(m.warning1);
            menu.childNodes[m.warning1].setAttribute('label',this.ZFgetString('menu.noItemSelected'));
        }
        // item menu
        if(menu_item) {
            // add 'new att' and 'rename'
            show = [m.rename];
            // warning
            if (!menu_att) {
                disable.push(m.rename, m.extractanno, m.getoutline);
                show.push(m.sep1,m.warning2);
                menu.childNodes[m.warning2].setAttribute('label',this.ZFgetString('menu.itemHasNoAtts'));
            }
            // add 'Extract annotations'
            if(!Zotero.ZotFile.isZotero6OrLater && this.getPref('pdfExtraction.MenuItem')) show.push(m.extractanno);
            if(this.getPref('pdfOutline.menuItem')) show.push(m.getoutline);

            // show.push(m.sep0, m.zotero7transition);
            // tablet menu part
            if(this.getPref('tablet') && menu_att) {
                // add sep
                show.push(m.sep1);
                // warnings
                if(!valid_destination) {
                    show.push(m.warning2);
                    menu.childNodes[m.warning2].setAttribute('label',this.ZFgetString('menu.invalidTabletLocation'));
                }
                if(group_library) {
                    show.push(m.warning2);
                    menu.childNodes[m.warning2].setAttribute('label',this.ZFgetString('menu.itemIsInGroupLibrary'));
                }
                if(valid_destination && !group_library) {
                    show.push(m.push2reader, m.pullreader);
                    // set tooltip for base folder
                    menu.childNodes[m.push2reader].setAttribute('tooltiptext', this.ZFgetString('menu.sendAttToBaseFolder', [this.getPref('tablet.dest_dir')]));
                    if(!menu_tablet) disable.push(m.pullreader);
                    // add update menu item
                    if(this.Tablet.checkSelectedSearch() || this.getPref('tablet.updateAlwaysShow')) {
                        show.push(m.updatefile);
                        if(!menu_tablet) disable.push(m.updatefile);
                    }
                    // Collection based project folders
                    var projects_set = false;
                    if(this.getPref('tablet.projectFolders') == 1) {
                        show.push(m.sep2,m.tablet);
                        // get first selected item
                        item=items[0];
                        if(item.isAttachment()) if(item.parentItemID) item=Zotero.Items.get(item.parentItemID);
                        // create folders from collections
                        var getCollectionPathsOfItem = function(item) {
                            var getCollectionPath = function(collectionID) {
                                var collection = Zotero.Collections.get(collectionID);
                                if (collection.parent === false)  return collection.name

                                return OS.Path.normalize(getCollectionPath(collection.parentID) + Zotero.ZotFile.folderSep + collection.name);
                            };

                            return item.getCollections().map(getCollectionPath);
                        };
                        var folders = this.Utils.getCollectionPathsOfItem(item);
                        folders = folders.map(path => path.replace(/undefined[\/\\]?/g, ''));
                        // add folders to menu
                        if(folders.length) {
                            projects_set = true;
                            folders=folders.sort();
                            for (i = 0; i < folders.length; i++) {
                                show.push(m.subfolders[i]);
                                menu.childNodes[m.subfolders[i]].setAttribute('label',folders[i]);
                                menu.childNodes[m.subfolders[i]].setAttribute('tooltiptext',this.ZFgetString('menu.sendAttToSubfolder',[folders[i]]));
                                this.projectPath[i]=folders[i];
                                if(i>9) break;
                            }
                        }
                    }
                    // User defined project folders
                    if(this.getPref('tablet.projectFolders') == 2) {
                        show.push(m.sep2,m.tablet,m.sep3,m.menuConfigure);
                        var subfolders = JSON.parse(this.getPref('tablet.subfolders'));
                        subfolders.forEach(function(folder, i) {
                            show.push(m.subfolders[i]);
                            menu.childNodes[m.subfolders[i]].setAttribute('label', folder.label);
                            menu.childNodes[m.subfolders[i]].setAttribute('tooltiptext', this.ZFgetString('menu.sendAttToSubfolder',[folder.path]));
                        }, this);
                        if(subfolders.length>0) projects_set = true;
                    }
                    // message that no folders are defined
                    if(!projects_set && this.getPref('tablet.projectFolders')!=0) {
                        var warning;
                        show.push(m.warning3);
                        if(this.getPref('tablet.projectFolders')==1) warning=this.ZFgetString('menu.itemIsInNoCollection');
                        if(this.getPref('tablet.projectFolders')==2) warning=this.ZFgetString('menu.noSubfoldersDefined');
                        menu.childNodes[m.warning3].setAttribute('label', warning);
                    }
                }
            }
        }

        // enable all items by default
        for (i = 0; i < m.length; i++) menu.childNodes[i].setAttribute('disabled', false);
        // disable menu items
        for (i in disable) menu.childNodes[disable[i]].setAttribute('disabled', true);
        // Hide all items by default
        for (i = 0; i < m.length; i++) menu.childNodes[i].setAttribute('hidden', true);
        // Show items
        for (i in show) menu.childNodes[show[i]].setAttribute('hidden', false);

    }).bind(Zotero.ZotFile);

    this.buildTabletMenu = function() {
        // get selected items
        var pane = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane,
            att = pane.getSelectedItems()[0],
            tablet = this.Tablet.getTabletStatus(att);
        if (!att.isAttachment()) return;        
        // update popupmenu
        var menupopup = pane.document.getElementById('zotfile-tablet-popup');
        // remove all children
        while (menupopup.firstChild) {
            menupopup.removeChild(menupopup.firstChild);
        }
        // add menu items
        var menu_items = [
            {
                'label': 'View PDF',
                'tooltiptext': '',
                'command': function(e) {Zotero.ZotFile.Tablet.openTabletFile();},
                'hidden': tablet ? 'false' : 'true'
            },
            {
                'label': 'Show File',
                'tooltiptext': '',
                'command': function(e) {Zotero.ZotFile.Tablet.showTabletFile();},
                'hidden': tablet ? 'false' : 'true'
            },
            {
                'label': 'Send to Tablet',
                'tooltiptext': '',
                'command': function(e) {
                    Zotero.ZotFile.Tablet.sendSelectedAttachmentsToTablet();
                    Zotero.ZotFile.UI.buildTabletMenu();
                },
                'disabled': tablet ? 'true' : 'false'
            },
            {
                'label': 'Get from Tablet',
                'tooltiptext': '',
                'command': function(e) {
                    Zotero.ZotFile.Tablet.getSelectedAttachmentsFromTablet();
                    Zotero.ZotFile.UI.buildTabletMenu();
                },
                'disabled': tablet ? 'false' : 'true'
            }
        ];
        for(i in menu_items) {
            var item = menu_items[i],
                keys = Object.keys(item),
                menuitem = pane.document.createElement('menuitem');
            for(key in Object.keys(item))
                if (keys[key] != 'command')
                    menuitem.setAttribute(keys[key], item[keys[key]]);
                else
                    menuitem.addEventListener(keys[key], item[keys[key]]);
            menupopup.appendChild(menuitem);
            if (item.label == 'Show File' && tablet)
                menupopup.appendChild(pane.document.createElement('menuseparator'));
        }
        
        if(this.getPref('tablet.projectFolders') == 2) {
            // add seperater and heading
            menupopup.appendChild(pane.document.createElement('menuseparator'));
            var menuitem = pane.document.createElement('menuitem');
            menuitem.setAttribute('label', 'Send to Subfolder on Tablet');
            menuitem.setAttribute('disabled', 'true');
            menuitem.setAttribute('style', 'font-size: 80%; background: none; -moz-appearance: none;');    
            menupopup.appendChild(menuitem);
            // add subfolders
            var subfolders = JSON.parse(this.getPref('tablet.subfolders'));
            subfolders.forEach(function(folder, i) {
                var menuitem = pane.document.createElement('menuitem');
                menuitem.setAttribute('label', folder.label);
                menuitem.addEventListener('command', function(event) {
                    this.Tablet.sendSelectedAttachmentsToTablet(i);
                    this.UI.buildTabletMenu();
                });
                menupopup.appendChild(menuitem);
            }, this);
            if(subfolders.length > 0) projects_set = true;
            // add 'change subfolder' item
            menupopup.appendChild(pane.document.createElement('menuseparator'));
            var menuitem = pane.document.createElement('menuitem');
            menuitem.setAttribute('label', 'Change subfolders...');
            menuitem.addEventListener('command', this.openSubfolderWindow);
            menupopup.appendChild(menuitem);
        }
    }.bind(Zotero.ZotFile);

    this.attboxAddTabletRow = function() {
        // add tablet row to attachment info
        var pane = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane,
            row = pane.document.createElement("row");
        row.setAttribute('id', 'zotfile-tablet-row');
        var rows = pane.document.getElementById('indexStatusRow').parentNode,
            lab1 = pane.document.createElement("label"),
            lab2 = pane.document.createElement("label");
        lab1.setAttribute('id', 'zotfile-tabletLabel');
        lab1.setAttribute('value', 'Tablet:');
        row.appendChild(lab1);
        lab2.setAttribute('id', 'zotfile-tabletStatus');
        lab2.setAttribute('value', '');
        lab2.setAttribute('crop', 'end');
        lab2.setAttribute('class', 'zotero-clicky');
        lab2.setAttribute('popup', 'zotfile-tablet-popup');
        lab2.addEventListener('click', Zotero.ZotFile.UI.buildTabletMenu);
        row.appendChild(lab2);
        rows.appendChild(row);
        // add popup menu to DOM
        var popupset = pane.document.getElementById('relatedLabel').parentNode,
            menupopup = pane.document.createElement("menupopup");
        menupopup.setAttribute('id', 'zotfile-tablet-popup');
        popupset.appendChild(menupopup);
        return row;
    }.bind(Zotero.ZotFile);

    this.attboxUpdateTabletStatus = function() {
        var pane = Services.wm.getMostRecentWindow('navigator:browser').ZoteroPane,
            items = pane.getSelectedItems(),
            row = pane.document.getElementById('zotfile-tablet-row');
        if (items.length != 1) return;
        var att = items[0];
        if(!this.getPref('tablet') || !att.isAttachment() || att.attachmentContentType != 'application/pdf') {
            if(row) row.setAttribute('hidden', 'true');
            return;
        }
        // add row if it does not exist
        if(!row) row = this.UI.attboxAddTabletRow();
        // pdf attachment
        row.setAttribute('hidden', 'false');
        // update tablet status
        lab = pane.document.getElementById('zotfile-tabletStatus');
        if(this.Tablet.getTabletStatus(att)) {
            var subfolder = this.Tablet.getInfo(att, 'projectFolder'),
                folder = subfolder==='' ? '[Basefolder]' : '[Basefolder]' + subfolder;
            lab.setAttribute('value', folder);
        }
        else {
            lab.setAttribute('value', 'No');
        }
    }.bind(Zotero.ZotFile);

}
