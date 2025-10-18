/* global Zotero, Services, ChromeUtils */

// Bootstrap functions for Zotero 7 compatibility
var chromeHandle;

function startup({ id, version, rootURI }, reason) {
    // Register chrome resources
    var aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup);
    var manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
        ["content", "zotfile", "chrome/content/"],
        ["locale", "zotfile", "en-US", "chrome/locale/en-US/"],
        ["locale", "zotfile", "de-DE", "chrome/locale/de-DE/"],
        ["locale", "zotfile", "fr-FR", "chrome/locale/fr-FR/"],
        ["locale", "zotfile", "it-IT", "chrome/locale/it-IT/"]
    ]);

    // Wait for Zotero to be ready
    if (typeof Zotero === 'undefined') {
        setTimeout(() => startup({ id, version, rootURI }, reason), 1000);
        return;
    }

    // Load ZotFile scripts
    loadZotFileScripts(rootURI);
}

function shutdown({ id, version, rootURI }, reason) {
    // Clean upUI elements
    var windows = Zotero.getMainWindows();
    for (let win of windows) {
        removeZotFileUI(win);
    }

    // Deregister chrome resources
    if (chromeHandle) {
        chromeHandle.destruct();
        chromeHandle = null;
    }
}

function install({ id, version, rootURI }, reason) {
    // Installation logic if needed
}

function uninstall({ id, version, rootURI }, reason) {
    // Uninstallation logic if needed
}

function onMainWindowLoad({ window }) {
    // Inject ZotFile UI into main window
    injectZotFileUI(window);
}

function onMainWindowUnload({ window }) {
    // Clean up window-specific elements
    removeZotFileUI(window);
}

function loadZotFileScripts(rootURI) {
    // Load the ZotFile scripts similar to the original include.js
    // Make legacy Components classes available for older scripts
    if (typeof Components === 'undefined') {
        window.Components = {
            classes: Cc,
            interfaces: Ci
        };
    }
    
    var scriptLoader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
    var scripts = ['zotfile', 'pdfAnnotations', 'pdfOutline', 'wildcards', 'tablet', 'utils', 'notifier', 'ui'];
    
    scripts.forEach(s => {
        try {
            scriptLoader.loadSubScript(rootURI + 'chrome/content/zotfile/' + s + '.js');
        } catch (e) {
            Zotero.debug("ZotFile: Failed to load script " + s + ": " + e);
        }
    });

    // Initialize ZotFile after all scripts are loaded
    if (Zotero.ZotFile && Zotero.ZotFile.init) {
        Zotero.ZotFile.init();
        setupEventListeners();
    }
}

function setupEventListeners() {
    // Setup event listeners similar to the original include.js
    if (typeof ZoteroPane !== 'undefined' && ZoteroPane.document) {
        var doc = ZoteroPane.document;
        
        // Add event listener for zotfile menu items
        var itemMenu = doc.getElementById('zotero-itemmenu');
        if (itemMenu) {
            itemMenu.addEventListener('popupshowing', Zotero.ZotFile.UI.showMenu, false);
        }
        
        // Add event listener for zotfile collection menu
        var collectionMenu = doc.getElementById('zotero-collectionmenu');
        if (collectionMenu) {
            collectionMenu.addEventListener('popupshowing', Zotero.ZotFile.UI.showCollectionMenu, false);
        }
        
        // Add event listener to update saved search for modified tablet attachments
        var collectionsTree = doc.getElementById('zotero-collections-tree');
        if (collectionsTree) {
            collectionsTree.addEventListener('click', Zotero.ZotFile.Tablet.updateModifiedAttachmentsSearch, false);
        }
    }
}

function injectZotFileUI(window) {
    try {
        var doc = window.document;
        
        // Inject ZotFile menu items into zotero-itemmenu popup
        injectMenuItemPopup(doc);
        
        // Inject ZotFile collection menu items
        injectCollectionMenuPopup(doc);
        
        // Inject toolbar actions
        injectToolbarActions(doc);
        
        // Inject tools menu items
        injectToolsMenu(doc);
        
        // Load stylesheet
        loadStylesheet(doc);
        
    } catch (e) {
        Zotero.debug("ZotFile: Error injecting UI: " + e);
    }
}

function injectMenuItemPopup(doc) {
    var itemMenu = doc.getElementById('zotero-itemmenu');
    if (!itemMenu) return;
    
    // Create fragment with all ZotFile menu items
    var fragment = doc.createDocumentFragment();
    
    // Separator
    var separator = doc.createElement('menuseparator');
    separator.setAttribute('id', 'id-zotfile-separator');
    fragment.appendChild(separator);
    
    // Attach file menu item
    var attachFile = doc.createElement('menuitem');
    attachFile.setAttribute('id', 'id-zotfile-attach-file');
    attachFile.setAttribute('label', Zotero.getString('zotfile-attach-file.label') || 'Attach File from Source Directory');
    attachFile.setAttribute('tooltiptext', Zotero.getString('zotfile-attach-file.tooltiptext') || '');
    attachFile.setAttribute('oncommand', 'Zotero.ZotFile.attachFileFromSourceDirectory();');
    fragment.appendChild(attachFile);
    
    // Manage attachments menu
    var manageMenu = doc.createElement('menu');
    manageMenu.setAttribute('id', 'id-zotfile-manage-attachments');
    manageMenu.setAttribute('label', Zotero.getString('zotfile-manage-attachments.label') || 'Manage Attachments');
    
    var manageMenuPopup = doc.createElement('menupopup');
    manageMenuPopup.setAttribute('id', 'id-zotfile-menu');
    manageMenuPopup.setAttribute('onpopupshowing', 'Zotero.ZotFile.UI.buildZotFileMenu();');
    
    // Add all the submenu items from the original overlay
    var menuItems = [
        { label: 'warning', disabled: true, style: 'font-size: 100%; background: none; -moz-appearance: none;' },
        { label: 'renameSelectedAttachments', tooltiptext: 'renameSelectedAttachments.tooltiptext', command: 'Zotero.ZotFile.renameSelectedAttachments();' },
        { label: 'extract-annotations', tooltiptext: 'extract-annotations.tooltiptext', command: 'Zotero.ZotFile.pdfAnnotations.getAnnotations();' },
        { label: 'pdf-outline', tooltiptext: 'pdf-outline.tooltiptext', command: 'Zotero.ZotFile.pdfOutline.getOutline();' },
        null, // separator
        { label: 'warning', disabled: true, style: 'font-size: 100%; background: none; -moz-appearance: none;' },
        { id: 'id-push2reader-00', label: 'send-to-tablet', tooltiptext: 'send-attachment-file-to-tablet', command: 'Zotero.ZotFile.Tablet.sendSelectedAttachmentsToTablet();' },
        { label: 'update-file-modification-time', tooltiptext: 'sync-attachment-file', command: 'Zotero.ZotFile.Tablet.updateSelectedTabletAttachments();' },
        { label: 'get-from-tablet', tooltiptext: 'get-attachment-file-from-tablet', command: 'Zotero.ZotFile.Tablet.getSelectedAttachmentsFromTablet();' },
        null, // separator
        { label: 'send-to-subfolder-on-tablet', disabled: true, style: 'font-size: 80%; background: none; -moz-appearance: none;' },
        { label: 'warning', disabled: true, style: 'font-size: 100%; background: none; -moz-appearance: none;' }
    ];
    
    // Add tablet subfolder menu items (01-15)
    for (let i = 1; i <= 15; i++) {
        menuItems.push({
            id: `id-push2reader-${String(i).padStart(2, '0')}`,
            label: `menu${i}`,
            hidden: true,
            tooltiptext: 'send-attachment-file-to-tablet',
            command: `Zotero.ZotFile.Tablet.sendSelectedAttachmentsToTablet(${i-1});`
        });
    }
    
    menuItems.push(null); // separator
    menuItems.push({
        id: 'id-push2reader-configure',
        label: 'change-subfolders',
        tooltiptext: 'add-and-delete-subfolders',
        command: 'Zotero.ZotFile.openSubfolderWindow();'
    });
    
    menuItems.forEach(item => {
        if (item === null) {
            var sep = doc.createElement('menuseparator');
            manageMenuPopup.appendChild(sep);
        } else {
            var menuItem = doc.createElement('menuitem');
            if (item.id) menuItem.setAttribute('id', item.id);
            if (item.hidden) menuItem.setAttribute('hidden', item.hidden);
            if (item.disabled) menuItem.setAttribute('disabled', item.disabled);
            if (item.style) menuItem.setAttribute('style', item.style);
            if (item.label) menuItem.setAttribute('label', Zotero.getString(`zotfile-${item.label}.label`) || item.label);
            if (item.tooltiptext) menuItem.setAttribute('tooltiptext', Zotero.getString(`zotfile-${item.tooltiptext}.label`) || item.tooltiptext);
            if (item.command) menuItem.setAttribute('oncommand', item.command);
            manageMenuPopup.appendChild(menuItem);
        }
    });
    
    manageMenu.appendChild(manageMenuPopup);
    fragment.appendChild(manageMenu);
    
    itemMenu.appendChild(fragment);
}

function injectCollectionMenuPopup(doc) {
    var collectionMenu = doc.getElementById('zotero-collectionmenu');
    if (!collectionMenu) return;
    
    var fragment = doc.createDocumentFragment();
    
    // Separator
    var separator = doc.createElement('menuseparator');
    separator.setAttribute('id', 'id-zotfile-collection-separator');
    fragment.appendChild(separator);
    
    // Show all menu item
    var showAll = doc.createElement('menuitem');
    showAll.setAttribute('id', 'id-zotfile-collection-showall');
    showAll.setAttribute('label', Zotero.getString('saved-search-all') || 'Show All Tablet Attachments');
    showAll.setAttribute('oncommand', 'Zotero.ZotFile.Tablet.restrictTabletSearch(-1);');
    fragment.appendChild(showAll);
    
    // Restrict menu
    var restrictMenu = doc.createElement('menu');
    restrictMenu.setAttribute('id', 'id-zotfile-collection-restrict');
    restrictMenu.setAttribute('label', Zotero.getString('saved-search-restrict') || 'Restrict to Subfolder');
    
    var restrictMenuPopup = doc.createElement('menupopup');
    restrictMenuPopup.setAttribute('id', 'id-zotfile-collection-menu');
    restrictMenuPopup.setAttribute('onpopupshowing', 'Zotero.ZotFile.UI.buildZotFileCollectionMenu();');
    
    // Base folder menu item
    var baseFolder = doc.createElement('menuitem');
    baseFolder.setAttribute('id', 'id-zotfile-collection-subfolder-00');
    baseFolder.setAttribute('label', Zotero.getString('restrict-basefolder') || 'Base Folder');
    baseFolder.setAttribute('hidden', true);
    baseFolder.setAttribute('oncommand', 'Zotero.ZotFile.Tablet.restrictTabletSearch(0);');
    restrictMenuPopup.appendChild(baseFolder);
    
    restrictMenuPopup.appendChild(doc.createElement('menuseparator'));
    
    // UI note
    var note = doc.createElement('menuitem');
    note.setAttribute('id', 'id-zotfile-collection-ui-note');
    note.setAttribute('label', Zotero.getString('restrict-subfolder') || 'Restrict to Subfolder');
    note.setAttribute('disabled', true);
    note.setAttribute('style', 'font-size: 80%; background: none; -moz-appearance: none;');
    restrictMenuPopup.appendChild(note);
    
    // Add subfolder menu items (01-15)
    for (let i = 1; i <= 15; i++) {
        var subfolderItem = doc.createElement('menuitem');
        subfolderItem.setAttribute('id', `id-zotfile-collection-subfolder-${String(i).padStart(2, '0')}`);
        subfolderItem.setAttribute('label', `menu${i}`);
        subfolderItem.setAttribute('hidden', true);
        subfolderItem.setAttribute('oncommand', `Zotero.ZotFile.Tablet.restrictTabletSearch(${i});`);
        restrictMenuPopup.appendChild(subfolderItem);
    }
    
    restrictMenu.appendChild(restrictMenuPopup);
    fragment.appendChild(restrictMenu);
    
    collectionMenu.appendChild(fragment);
}

function injectToolbarActions(doc) {
    var tbActionsPopup = doc.getElementById('zotero-tb-actions-popup');
    if (!tbActionsPopup) return;
    
    var optionsItem = doc.createElement('menuitem');
    optionsItem.setAttribute('id', 'zotfile-options');
    optionsItem.setAttribute('insertafter', 'zotero-tb-actions-prefs');
    optionsItem.setAttribute('label', Zotero.getString('zotfile-options.label') || 'ZotFile Preferences');
    optionsItem.setAttribute('oncommand', 'Zotero.ZotFile.openPreferenceWindow();');
    
    tbActionsPopup.appendChild(optionsItem);
}

function injectToolsMenu(doc) {
    var toolsPopup = doc.getElementById('menu_ToolsPopup');
    if (!toolsPopup) return;
    
    // ZotFile Transition menu item
    var transitionItem = doc.createElement('menuitem');
    transitionItem.setAttribute('id', 'zotfile-zotero7transition');
    transitionItem.setAttribute('insertafter', 'menu_preferences');
    transitionItem.setAttribute('label', 'ZotFile Transition to Zotero 7');
    transitionItem.setAttribute('oncommand', 'Zotero.ZotFile.zotero7transition();');
    
    // ZotFile Options menu item
    var optionsItem = doc.createElement('menuitem');
    optionsItem.setAttribute('id', 'zotfile-options-tools');
    optionsItem.setAttribute('insertafter', 'zotfile-zotero7transition');
    optionsItem.setAttribute('label', Zotero.getString('zotfile-options.label') || 'ZotFile Preferences');
    optionsItem.setAttribute('oncommand', 'Zotero.ZotFile.openPreferenceWindow();');
    
    toolsPopup.appendChild(transitionItem);
    toolsPopup.appendChild(optionsItem);
}

function loadStylesheet(doc) {
    // Load ZotFile stylesheet
    var style = doc.createElement('link');
    style.setAttribute('rel', 'stylesheet');
    style.setAttribute('href', 'chrome://zotfile/skin/overlay.css');
    style.setAttribute('type', 'text/css');
    doc.getElementsByTagName('head')[0].appendChild(style);
}

function removeZotFileUI(window) {
    try {
        var doc = window.document;
        
        // Remove ZotFile menu items
        var elementsToRemove = [
            'id-zotfile-separator',
            'id-zotfile-attach-file',
            'id-zotfile-manage-attachments',
            'id-zotfile-collection-separator',
            'id-zotfile-collection-showall',
            'id-zotfile-collection-restrict',
            'zotfile-options',
            'zotfile-zotero7transition',
            'zotfile-options-tools'
        ];
        
        // Also clean up subfolder menu items
        for (let i = 1; i <= 15; i++) {
            elementsToRemove.push(`id-push2reader-${String(i).padStart(2, '0')}`);
            elementsToRemove.push(`id-zotfile-collection-subfolder-${String(i).padStart(2, '0')}`);
        }
        
        elementsToRemove.forEach(id => {
            var element = doc.getElementById(id);
            if (element) {
                element.remove();
            }
        });
        
        // Remove event listeners
        var itemMenu = doc.getElementById('zotero-itemmenu');
        if (itemMenu && Zotero.ZotFile && Zotero.ZotFile.UI) {
            itemMenu.removeEventListener('popupshowing', Zotero.ZotFile.UI.showMenu, false);
        }
        
        var collectionMenu = doc.getElementById('zotero-collectionmenu');
        if (collectionMenu && Zotero.ZotFile && Zotero.ZotFile.UI) {
            collectionMenu.removeEventListener('popupshowing', Zotero.ZotFile.UI.showCollectionMenu, false);
        }
        
        var collectionsTree = doc.getElementById('zotero-collections-tree');
        if (collectionsTree && Zotero.ZotFile && Zotero.ZotFile.Tablet) {
            collectionsTree.removeEventListener('click', Zotero.ZotFile.Tablet.updateModifiedAttachmentsSearch, false);
        }
        
        // Remove ZotFile stylesheet
        var stylesheets = doc.getElementsByTagName('head')[0].getElementsByTagName('link');
        for (let i = stylesheets.length - 1; i >= 0; i--) {
            if (stylesheets[i].getAttribute('href') === 'chrome://zotfile/skin/overlay.css') {
                stylesheets[i].remove();
                break;
            }
        }
        
    } catch (e) {
        Zotero.debug("ZotFile: Error removing UI: " + e);
    }
}
