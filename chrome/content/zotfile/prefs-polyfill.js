// Polyfill to emulate legacy Firefox <preferences> and <preference> elements
// which were completely removed in Gecko 115 / Gecko 140 (Zotero 7 / 10).
(function() {
    function initPolyfill() {
        let Zotero = window.Zotero;
        if (!Zotero && typeof Services !== 'undefined' && Services.wm) {
            try { Zotero = Services.wm.getMostRecentWindow('navigator:browser').Zotero; } catch(e) {}
        }
        if (!Zotero && typeof Components !== 'undefined') {
            try {
                Zotero = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser").Zotero;
            } catch(e) {}
        }
        if (!Zotero) {
            console.error("Zotero not found for preferences polyfill!");
            return;
        }

        // Bypasses Zotero's wrappers to read exact preference keys directly from the backend branch
        function getPrefVal(prefName, prefType) {
            try {
                let type = Services.prefs.getPrefType(prefName);
                if (type === Services.prefs.PREF_BOOL) return Services.prefs.getBoolPref(prefName);
                if (type === Services.prefs.PREF_INT) return Services.prefs.getIntPref(prefName);
                if (type === Services.prefs.PREF_STRING) return Services.prefs.getCharPref(prefName);
            } catch(e) {}
            try { return Zotero.Prefs.get(prefName, false); } catch(e) {}
            if (prefType === 'bool') return false;
            if (prefType === 'int') return 0;
            return "";
        }
        
        function setPrefVal(prefName, prefType, val) {
            try {
                if (prefType === 'bool') {
                    Services.prefs.setBoolPref(prefName, !!val);
                } else if (prefType === 'int') {
                    Services.prefs.setIntPref(prefName, parseInt(val) || 0);
                } else {
                    Services.prefs.setCharPref(prefName, String(val));
                }
            } catch(e) {
                try { Zotero.Prefs.set(prefName, val, false); } catch(e2) {}
            }
        }

        let prefMap = {};
        let prefElements = document.getElementsByTagName('preference');
        
        // Define getter/setter for .value on <preference> elements
        for (let prefEl of prefElements) {
            let id = prefEl.getAttribute('id');
            let name = prefEl.getAttribute('name');
            let type = prefEl.getAttribute('type');
            
            prefMap[id] = { name, type };
            
            Object.defineProperty(prefEl, 'value', {
                get() {
                    return getPrefVal(name, type);
                },
                set(newVal) {
                    setPrefVal(name, type, newVal);
                    updateBoundElements(id, newVal);
                },
                configurable: true
            });
        }
        
        function updateBoundElements(prefId, value) {
            let elements = document.querySelectorAll(`[preference="${prefId}"]`);
            for (let el of elements) {
                let tagName = el.localName.toLowerCase();
                if (tagName === 'checkbox') {
                    el.checked = !!value;
                } else if (tagName === 'textbox' || tagName === 'input') {
                    el.value = value;
                } else if (tagName === 'radiogroup' || tagName === 'menulist') {
                    el.value = value;
                }
            }
        }
        
        // Initialize bound input elements with current preference values
        for (let prefEl of prefElements) {
            updateBoundElements(prefEl.id, prefEl.value);
        }
        
        // Reactive observer to catch programmatic Preference changes (e.g. from setPref in options.js)
        let prefObserver = {
            observe(subject, topic, data) {
                if (topic !== "nsPref:changed") return;
                let prefPrefix = "extensions.zotfile.";
                if (data.startsWith(prefPrefix)) {
                    // Find the preference element that has this name
                    for (let prefEl of document.querySelectorAll(`preference[name="${data}"]`)) {
                        let id = prefEl.id;
                        let type = prefEl.getAttribute('type');
                        let val = getPrefVal(data, type);
                        updateBoundElements(id, val);
                    }
                }
            }
        };
        try {
            Services.prefs.addObserver("extensions.zotfile.", prefObserver);
            window.addEventListener('unload', () => {
                try { Services.prefs.removeObserver("extensions.zotfile.", prefObserver); } catch(e) {}
            });
        } catch(e) { console.error("zotfile prefObserver registry failed: " + e); }
        
        // Bidirectional binding from elements to <preference> elements
        function handleElementChange(event) {
            let el = event.target;
            let prefId = el.getAttribute('preference');
            if (!prefId) return;
            let prefEl = document.getElementById(prefId);
            if (!prefEl) return;
            
            let newVal;
            let tagName = el.localName.toLowerCase();
            if (tagName === 'checkbox') {
                newVal = el.checked;
            } else if (tagName === 'textbox' || tagName === 'input') {
                newVal = el.value;
            } else if (tagName === 'radiogroup' || tagName === 'menulist') {
                newVal = el.value;
            } else {
                newVal = el.value;
            }
            
            prefEl.value = newVal;
        }
        
        document.addEventListener('change', handleElementChange);
        document.addEventListener('command', handleElementChange);
        document.addEventListener('input', handleElementChange);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPolyfill);
    } else {
        initPolyfill();
    }
})();
