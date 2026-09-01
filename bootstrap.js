/* global Components, Services, Zotero */
if (typeof Services === 'undefined') {
  try { var Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services; } catch(e) { try { Services = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services; } catch(e2) {} }
}

var chromeHandle;
var gRootURI = null;

function install(data, reason) {}

function uninstall(data, reason) {}

function toURI(val) {
  if (!val) return null;
  if (typeof val === 'string') { try { return Services.io.newURI(val); } catch(e) { return null; } }
  if (val.spec) return val;
  try { return Services.io.newURI(val); } catch(e) { return null; }
}
function startup(data, reason) {
  // Zotero 10 WebExtension bootstrap passes {extension} or extension itself; legacy passes {resourceURI, rootURI}
  // In Zotero 10 data.rootURI is a STRING like "jar:file://...!/" (seen in logs)
  let extension = (data && data.extension) || data || {};
  let id = (data && data.id) || extension.id;
  let version = (data && data.version) || extension.version;
  let _res = (data && data.resourceURI) || extension.resourceURI || extension.rootURI || (data && data.rootURI) || null;
  let _root = (data && data.rootURI) || extension.rootURI || _res || null;
  let resourceURI = toURI(_res);
  let rootURI = toURI(_root);
  let baseForChrome = rootURI || resourceURI || toURI(extension && extension.rootURI) || null;
  gRootURI = baseForChrome;
  // Debug startup URIs
  try {
    let dbg = "zotfile bootstrap startup id=" + id + " resourceURI=" + (resourceURI && resourceURI.spec) + " rootURI=" + (rootURI && rootURI.spec) + " extension.rootURI=" + (extension && extension.rootURI && extension.rootURI.spec) + " data.keys=" + (data && Object.keys(data)) + " gRootURI=" + (gRootURI && gRootURI.spec);
    try { dbg += " data.rootURI type=" + typeof (data && data.rootURI) + " val=" + (data && data.rootURI); } catch(e) {}
    try { dbg += " data.resourceURI=" + (data && data.resourceURI); } catch(e) {}
    try { dbg += " extension keys=" + (extension && Object.keys(extension)); } catch(e) {}
    try { if (extension && extension.rootURI) dbg += " ext.rootURI spec=" + extension.rootURI.spec; } catch(e) { dbg += " ext.rootURI err=" + e; }
    Services.console.logStringMessage(dbg);
    try { Zotero.debug(dbg); } catch(e) {}
    try { console.log(dbg); } catch(e) {}
  } catch(e) {}
  // Register chrome.manifest resources for bootstrapped context (Zotero 7+)
  var aomStartup = null;
  try { aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"].getService(Components.interfaces.amIAddonManagerStartup); } catch(e) {}
  if (!aomStartup) try { aomStartup = ChromeUtils.import("resource://gre/modules/AddonManager.jsm").AddonManager; } catch(e) {}
  if (!aomStartup) try { let m = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs"); aomStartup = m.AddonManager; } catch(e) {}
  try { Services.console.logStringMessage("zotfile aomStartup=" + !!aomStartup + " has registerChrome=" + !!(aomStartup && aomStartup.registerChrome)); } catch(e) {}
  // Always try legacy bootstrapped manifest location (handles chrome.manifest)
  try {
    if (resourceURI) Components.manager.addBootstrappedManifestLocation(resourceURI);
    else if (extension && extension.rootURI) Components.manager.addBootstrappedManifestLocation(extension.rootURI);
  } catch (e) {}
  var manifestURI = null;
  let _baseURI = toURI(rootURI) || toURI(resourceURI) || gRootURI || toURI(extension && extension.rootURI);
  // Try 2-arg form first (correct for jar:file://...!/ base), then string concat
  try {
    manifestURI = Services.io.newURI("chrome.manifest", _baseURI);
  } catch (e) {
    try {
      let base = _baseURI.spec;
      if (!base.endsWith("/")) base += "/";
      manifestURI = Services.io.newURI(base + "chrome.manifest");
    } catch(e2) {
      try { manifestURI = Services.io.newURI("chrome.manifest", "UTF-8", _baseURI); } catch(e3) { manifestURI = null; }
    }
  }
  try { Services.console.logStringMessage("zotfile manifestURI=" + (manifestURI && manifestURI.spec) + " base=" + (_baseURI && _baseURI.spec)); } catch(e) {}
  // Register resource://zotfile/ for fallback (always works, no chrome registry needed)
  try {
    let resProto = Services.io.getProtocolHandler("resource").QueryInterface(Components.interfaces.nsIResProtocolHandler);
    let baseForRes = _baseURI || gRootURI;
    if (baseForRes) {
      resProto.setSubstitution("zotfile", baseForRes);
      Services.console.logStringMessage("zotfile resource://zotfile/ registered base=" + baseForRes.spec);
    }
  } catch(e) { Services.console.logStringMessage("zotfile resource substitution failed: " + e); }
  if (aomStartup && manifestURI && aomStartup.registerChrome) {
    // Try registering all entries first (content, locale) so options.xhtml works correctly (skin not supported via registerChrome)
    try {
      chromeHandle = aomStartup.registerChrome(manifestURI, [
        ["content", "zotfile", "chrome/content/zotfile/"],
        ["locale", "zotfile", "en-US", "chrome/locale/en-US/"],
        ["locale", "zotfile", "de-DE", "chrome/locale/de-DE/"],
        ["locale", "zotfile", "fr-FR", "chrome/locale/fr-FR/"],
        ["locale", "zotfile", "it-IT", "chrome/locale/it-IT/"],
      ]);
      Services.console.logStringMessage("zotfile registerChrome success (all entries) handle=" + !!chromeHandle);
    } catch (e) {
      Services.console.logStringMessage("zotfile registerChrome with entries failed: " + e + " trying content-only");
      try {
        chromeHandle = aomStartup.registerChrome(manifestURI, [["content", "zotfile", "chrome/content/zotfile/"]]);
        Services.console.logStringMessage("zotfile registerChrome success (content only) handle=" + !!chromeHandle);
      } catch (e2) {
        Services.console.logStringMessage("zotfile registerChrome content-only failed: " + e2 + " trying empty array");
        try {
          chromeHandle = aomStartup.registerChrome(manifestURI, []);
          Services.console.logStringMessage("zotfile registerChrome success (empty array) handle=" + !!chromeHandle);
        } catch (e3) {
          Services.console.logStringMessage("zotfile registerChrome failed: " + e3 + " stack=" + e3.stack);
        }
      }
    }
  } else {
    try { Services.console.logStringMessage("zotfile registerChrome skipped aomStartup=" + !!aomStartup + " manifestURI=" + (manifestURI && manifestURI.spec)); } catch(e) {}
  }

  // Wait for Zotero to be ready
  var waitForZotero = function () {
    if (typeof Zotero === "undefined") {
      setTimeout(waitForZotero, 200);
      return;
    }
    Zotero.initializationPromise.then(async () => {
      // Debug baseURI inside promise
      try {
        let dbg2 = "zotfile bootstrap inside promise gRootURI=" + (gRootURI && gRootURI.spec) + " resourceURI=" + (typeof resourceURI !== 'undefined' && resourceURI && resourceURI.spec) + " rootURI=" + (typeof rootURI !== 'undefined' && rootURI && rootURI.spec) + " extension.rootURI=" + (typeof extension !== 'undefined' && extension && extension.rootURI && extension.rootURI.spec);
        Services.console.logStringMessage(dbg2);
        try { Zotero.debug(dbg2); } catch(e) {}
        // Try ProfD fallback if still missing
        if (!gRootURI && !resourceURI && !rootURI) {
          try {
            let profD = Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
            let extFile = profD.clone(); extFile.append("extensions"); extFile.append("zotfile@columbia.edu.xpi");
            let dbg3 = "zotfile bootstrap ProfD=" + profD.path + " extFile exists=" + extFile.exists() + " path=" + extFile.path;
            Services.console.logStringMessage(dbg3);
            if (extFile.exists()) {
              let uriStr = "jar:file://" + extFile.path + "!/";
              // On Linux need encode
              try { _fallbackBase = Services.io.newURI(uriStr); gRootURI = _fallbackBase; Services.console.logStringMessage("zotfile bootstrap ProfD fallback base=" + _fallbackBase.spec); } catch(e) { Services.console.logStringMessage("zotfile bootstrap ProfD newURI failed: " + e + " uriStr=" + uriStr); }
            }
          } catch(e) { Services.console.logStringMessage("zotfile bootstrap ProfD fallback failed: " + e); }
        }
      } catch(e) {}
      // Fallback via AddonManager if baseURI still missing
      let _fallbackBase = toURI(gRootURI) || toURI(typeof resourceURI !== 'undefined' ? resourceURI : null) || toURI(typeof rootURI !== 'undefined' ? rootURI : null) || toURI(typeof extension !== 'undefined' && extension && extension.rootURI) || null;
      if (!_fallbackBase) {
        try {
          let am = null;
          try { am = ChromeUtils.import("resource://gre/modules/AddonManager.jsm").AddonManager; } catch(e) { try { am = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs").AddonManager; } catch(e2) { try { am = Services.wm.getMostRecentWindow("navigator:browser").AddonManager; } catch(e3) {} } }
          if (am) {
            let addon = await am.getAddonByID("zotfile@columbia.edu");
            if (addon) {
              Services.console.logStringMessage("zotfile bootstrap AddonManager addon found id=" + addon.id + " keys=" + Object.keys(addon) + " rootURI=" + (addon.rootURI && addon.rootURI.spec) + " resourceURI=" + (addon.resourceURI && addon.resourceURI.spec));
              let uri = addon.rootURI || addon.resourceURI || addon.sourceURI || null;
              if (uri && typeof uri === 'string') { try { uri = Services.io.newURI(uri); } catch(e) {} }
              if (uri && uri.spec) { _fallbackBase = uri; gRootURI = uri; Services.console.logStringMessage("zotfile bootstrap AddonManager fallback base=" + uri.spec); }
            } else Services.console.logStringMessage("zotfile bootstrap AddonManager addon not found");
          } else Services.console.logStringMessage("zotfile bootstrap AddonManager not available");
        } catch(e) { try { Services.console.logStringMessage("zotfile bootstrap AddonManager fallback failed: " + e + " stack=" + e.stack); } catch(e2) {} }
      }
      // Global shim for Gecko 115+ hidden <browser> (must run before any createHiddenBrowser)
      try {
        for (let win of Services.wm.getEnumerator("navigator:browser")) {
          if (win.gBrowser && typeof win.gBrowser.getTabForBrowser !== 'function') win.gBrowser.getTabForBrowser = () => null;
        }
        // Patch custom element prototype if available
        try {
          let win = Services.wm.getMostRecentWindow("navigator:browser");
          if (win && win.customElements) {
            let cls = win.customElements.get("browser");
            if (cls && cls.prototype && cls.prototype.getTabBrowser) {
              let orig = cls.prototype.getTabBrowser;
              cls.prototype.getTabBrowser = function() {
                try { return orig.call(this); } catch(e) { return null; }
              };
            }
          }
        } catch(e) {}
      } catch(e) {}
      // Polyfill for Zotero 10 where Zotero.Promise.coroutine etc. were removed
      try {
        if (!Zotero.Promise) Zotero.Promise = {};
        if (!Zotero.Promise.coroutine) {
          Zotero.Promise.coroutine = function(genFn) {
            // Convert generator+ yield to async/await
            return async function(...args) {
              let gen = genFn.apply(this, args);
              // If not a generator (native async), just call
              if (!gen || typeof gen.next !== 'function') return gen;
              let value, done;
              let result = gen.next();
              while (!result.done) {
                try { value = await result.value; result = gen.next(value); }
                catch(e) { result = gen.throw(e); }
              }
              return result.value;
            };
          };
        }
        if (!Zotero.Promise.filter) {
          Zotero.Promise.filter = async (arr, fn) => { let out=[]; for(let x of arr){ if(await fn(x)) out.push(x);} return out; };
        }
        if (!Zotero.Promise.all) Zotero.Promise.all = Promise.all.bind(Promise);
        if (!Zotero.Schema) Zotero.Schema = {};
        if (!Zotero.Schema.schemaUpdatePromise) Zotero.Schema.schemaUpdatePromise = Promise.resolve();
        // Zotero 10 removed Zotero.isStandalone etc. shim
        if (typeof Zotero.isStandalone === 'undefined') Zotero.isStandalone = true;
      } catch(e) {}
      // Try chrome:// first (registered via aomStartup), fallback to jar: file URI
      let loaded = false;
      let lastErr = null;
      let OS = null;
      try {
        let osModule = ChromeUtils.importESModule("chrome://zotero/content/osfile.mjs");
        OS = osModule.OS;
      } catch(e) {
        try {
          OS = ChromeUtils.import("resource://gre/modules/osfile.jsm").OS;
        } catch(e2) {
          try {
            OS = Components.utils.import("resource://gre/modules/osfile.jsm", {}).OS;
          } catch(e3) {}
        }
      }
      if (OS && !OS.Path) {
        OS.Path = {
          join(...args) {
            let parts = args.map(arg => (arg && typeof arg === 'object' && arg.path) ? arg.path : String(arg));
            let sep = Zotero.isWin ? '\\' : '/';
            return parts.join(sep).replace(/[\\\/]+/g, sep);
          },
          basename(path) {
            if (!path) return '';
            let sep = path.includes('\\') ? '\\' : '/';
            let idx = path.lastIndexOf(sep);
            return idx === -1 ? path : path.substring(idx + 1);
          },
          dirname(path) {
            if (!path) return '';
            let sep = path.includes('\\') ? '\\' : '/';
            let idx = path.lastIndexOf(sep);
            return idx === -1 ? '' : path.substring(0, idx);
          },
          normalize(path) {
            if (!path) return '';
            let sep = Zotero.isWin ? '\\' : '/';
            return path.replace(/[\\\/]+/g, sep);
          },
          split(path) {
            if (!path) return { components: [] };
            let sep = path.includes('\\') ? '\\' : '/';
            return { components: path.split(sep).filter(Boolean) };
          }
        };
      }
      // Helper to try file URI via baseURI.spec (jar:file://...!/)
      const baseURI = toURI(_fallbackBase) || toURI(gRootURI) || toURI(typeof resourceURI !== 'undefined' ? resourceURI : null) || toURI(typeof rootURI !== 'undefined' ? rootURI : null) || toURI(typeof extension !== 'undefined' && extension && extension.rootURI) || null;
      
      function setDefaultPrefs(rootURIStr) {
        let defaultBranch = Services.prefs.getDefaultBranch("");
        let prefsLoader = {
          pref: function (key, val) {
            switch (typeof val) {
              case "boolean":
                defaultBranch.setBoolPref(key, val);
                break;
              case "number":
                defaultBranch.setIntPref(key, val);
                break;
              case "string":
                defaultBranch.setCharPref(key, val);
                break;
            }
          }
        };
        try {
          Services.scriptloader.loadSubScript(rootURIStr + "prefs.js", prefsLoader);
          Services.console.logStringMessage("zotfile default preferences loaded successfully from " + rootURIStr + "prefs.js");
        } catch (e) {
          Services.console.logStringMessage("zotfile default preferences load failed: " + e);
        }
      }
      
      try {
        let baseStr = baseURI.spec;
        if (!baseStr.endsWith("/")) baseStr += "/";
        setDefaultPrefs(baseStr);
      } catch(e) { Services.console.logStringMessage("zotfile setDefaultPrefs invocation failed: " + e); }

      const tryFileURI = (rel) => {
        try {
          let base = baseURI.spec;
          if (!base.endsWith("/")) base += "/";
          let uri = base + rel;
          Services.scriptloader.loadSubScript(uri, { Zotero, OS, Services, ChromeUtils, Components });
          return true;
        } catch(e) { lastErr = e + " (base=" + (baseURI && baseURI.spec) + ")"; return false; }
      };
      // 1. Try jar: file URI first (avoids "No chrome package" warning), then chrome:// fallback
      loaded = tryFileURI("chrome/content/zotfile/zotfile.js");
      if (!loaded) try { Services.scriptloader.loadSubScript("chrome://zotfile/content/zotfile.js", { Zotero, OS, Services, ChromeUtils, Components }); loaded = true; } catch(e) { lastErr = e; }
      if (!loaded) Components.utils.reportError("zotfile bootstrap: failed to load zotfile.js: " + lastErr + " (baseURI=" + (baseURI && baseURI.spec) + ")");
      if (Zotero.ZotFile) Zotero.ZotFile.OS = OS;
      // include.js
      loaded = false;
      // Expose gRootURI to Zotero for include.js fallback
      try { Zotero.ZotFileBootstrapRootURI = baseURI || gRootURI; } catch(e) {}
      loaded = tryFileURI("chrome/content/zotfile/include.js");
      if (!loaded) try { Services.scriptloader.loadSubScript("chrome://zotfile/content/include.js", { Zotero, OS, Services, ChromeUtils, Components }); loaded = true; } catch(e) {}
      // Ensure all modules loaded (include.js chrome:// fallback often fails)
      try {
        let need = [];
        if (!Zotero.ZotFile.Tablet) need.push("tablet");
        if (!Zotero.ZotFile.pdfAnnotations) need.push("pdfAnnotations");
        if (!Zotero.ZotFile.pdfOutline) need.push("pdfOutline");
        if (!Zotero.ZotFile.Wildcards) need.push("wildcards");
        if (!Zotero.ZotFile.Utils) need.push("utils");
        if (!Zotero.ZotFile.notifierCallback) need.push("notifier");
        if (!Zotero.ZotFile.UI) need.push("ui");
        if (need.length) {
          Services.console.logStringMessage("zotfile bootstrap: modules missing " + need.join(",") + ", trying direct load");
          for (let s of need) tryFileURI("chrome/content/zotfile/" + s + ".js");
          // Also ensure ProgressWindow for preferences
          tryFileURI("chrome/content/zotfile/ProgressWindow.js");
        }
      } catch(e) {}
      // Patch openPreferenceWindow to log chrome registration status
      try {
        let origOpenPref = Zotero.ZotFile.openPreferenceWindow;
        Zotero.ZotFile.openPreferenceWindow = function(paneID, action) {
          try { return origOpenPref.call(this, paneID, action); }
          catch(e) {
            Services.console.logStringMessage("zotfile openPreferenceWindow chrome:// failed: " + e + ", trying to re-register chrome");
            // Do not open jar: URI via openDialog (triggers file picker) - just rethrow
            throw e;
          }
        };
      } catch(e) {}
      // Observe windows to inject overlay UI
      WindowListener.register();
      // Patch already-open windows (document already loaded, so call onWindowLoad directly)
      for (let win of Services.wm.getEnumerator("navigator:browser")) {
        if (win.ZoteroPane) {
          if (win.document && win.document.readyState === 'complete') {
            WindowListener.onWindowLoad(win);
          } else {
            WindowListener.onOpenWindow(win);
            // Fallback: also try direct after a short delay in case load already fired
            win.setTimeout(() => { try { WindowListener.onWindowLoad(win); } catch(e) {} }, 500);
          }
        }
      }
    });
  };
  waitForZotero();
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;

  WindowListener.unregister();

  // Remove UI from open windows
  for (let win of Services.wm.getEnumerator("navigator:browser")) {
    try {
      if (win.Zotero && win.Zotero.ZotFile) {
        if (win.Zotero.ZotFile.notifierID) {
          win.Zotero.Notifier.unregisterObserver(win.Zotero.ZotFile.notifierID);
          win.Zotero.ZotFile.notifierID = null;
        }
      }
      // Remove menu elements injected by overlay
      let doc = win.document;
      let ids = [
        "id-zotfile-separator",
        "id-zotfile-attach-file",
        "id-zotfile-manage-attachments",
        "id-zotfile-collection-separator",
        "id-zotfile-collection-showall",
        "id-zotfile-collection-restrict",
        "zotfile-options",
        "zotfile-options-inject",
        "zotfile-zotero7transition",
      ];
      ids.forEach((id) => {
        let el = doc.getElementById(id);
        if (el) el.remove();
      });
    } catch (e) {}
  }

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  } else {
    try {
      Components.manager.removeBootstrappedManifestLocation(resourceURI);
    } catch (e) {}
  }

  // Flush string bundles etc.
  Services.obs.notifyObservers(null, "startupcache-invalidate", null);
}

var WindowListener = {
  _windows: new Set(),

  register() {
    Services.wm.addListener(this);
  },

  unregister() {
    Services.wm.removeListener(this);
  },

  onOpenWindow(aWindow) {
    let window = null;
    try {
      if (aWindow && aWindow.document) {
        window = aWindow;
      } else if (aWindow && aWindow.QueryInterface) {
        window = aWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIDOMWindow);
      } else {
        // Gecko 115+ passes DOM window directly without XUL wrapper
        window = aWindow;
      }
    } catch(e) { window = aWindow; }
    if (!window || !window.addEventListener) return;
    window.addEventListener(
      "load",
      () => {
        this.onWindowLoad(window);
      },
      { once: true }
    );
  },

  onCloseWindow() {},
  onWindowTitleChange() {},

  async onWindowLoad(window) {
    // Shim for Gecko 115+ where gBrowser.getTabForBrowser was removed/changed (fixes browser-custom-element.mjs:932)
    try {
      if (window.gBrowser && typeof window.gBrowser.getTabForBrowser !== 'function') {
        window.gBrowser.getTabForBrowser = function() { return null; };
      }
      // Also shim ownerGlobal for hidden browsers
      if (window.document && !window.document.documentElement.hasAttribute('gBrowser-shimmed')) {
        window.document.documentElement.setAttribute('gBrowser-shimmed', 'true');
      }
    } catch(e) {}
    if (window.document.documentElement.getAttribute("windowtype") !== "navigator:browser")
      return;
    // Wait for ZoteroPane
    let timeout = 0;
    while (!window.ZoteroPane && timeout < 100) {
      await new Promise((r) => window.setTimeout(r, 100));
      timeout++;
    }
    if (!window.ZoteroPane) return;
    try {
      Services.scriptloader.loadSubScript("chrome://zotfile/content/include.js", window);
    } catch (e) {
      try {
        let base = gRootURI.spec;
        if (!base.endsWith("/")) base += "/";
        Services.scriptloader.loadSubScript(base + "chrome/content/zotfile/include.js", window);
      } catch(e2) { Zotero.logError(e2); }
    }
    // Fallback: ensure init called
    try {
      if (window.Zotero && window.Zotero.ZotFile && window.Zotero.ZotFile.init) {
        window.Zotero.ZotFile.init();
      }
    } catch (e) {}
    // Inject ZotFile Preferences into Tools menu (must be XUL with render)
    try {
      let toolsPopup = window.document.getElementById('menu_ToolsPopup');
      Services.console.logStringMessage('zotfile inject toolsPopup=' + !!toolsPopup + ' found inject=' + !!window.document.getElementById('zotfile-options-inject'));
      if (toolsPopup && !window.document.getElementById('zotfile-options-inject')) {
        let mi = null;
        try { mi = window.document.createXULElement('menuitem'); } catch(e) { Services.console.logStringMessage('zotfile createXULElement failed: ' + e); }
        if (!mi || typeof mi.render !== 'function') try { mi = window.document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem'); } catch(e) {}
        if (!mi || typeof mi.render !== 'function') try { mi = window.document.createElement('menuitem'); } catch(e) {}
        if (!mi) return;
        mi.id = 'zotfile-options-inject';
        mi.setAttribute('label', 'ZotFile Preferences');
        // Use command event that works in both XUL and HTML
        mi.addEventListener('command', () => { try { window.Zotero.ZotFile.openPreferenceWindow(); } catch(e) { Services.console.logStringMessage('zotfile menu command failed: ' + e); } });
        let prefItem = window.document.getElementById('menu_preferences');
        if (prefItem && prefItem.parentNode === toolsPopup) toolsPopup.insertBefore(mi, prefItem.nextSibling);
        else toolsPopup.appendChild(mi);
        Services.console.logStringMessage('zotfile inject created ' + mi.id + ' tag=' + mi.tagName);
      }
    } catch(e) { Services.console.logStringMessage('zotfile inject failed: ' + e + ' stack=' + e.stack); }
    // Also expose quick run: Tools -> Developer -> Run JavaScript can call Zotero.ZotFile.openPreferenceWindow()
  },
};
