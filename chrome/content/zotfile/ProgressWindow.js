/*
 * Handles the display of a div showing progress in scraping, indexing, etc.
 *
 * Pass the active window into the constructor
 */
Zotero.ZotFile.ProgressWindow = function(_window){
	var self = this,
		_window = null,
		_progressWindow = null,
		_windowLoaded = false,
		_windowLoading = false,
		_timeoutID = false,
		_closing = false,
		_mouseWasOver = false,
		_deferredUntilWindowLoad = [],
		_deferredUntilWindowLoadThis = [],
		_deferredUntilWindowLoadArgs = [],
		callback = null;
	
	/**
	 * Shows the progress window
	 */
	this.show = function show() {
		if(_windowLoading || _windowLoaded) {	// already loading or loaded
			return false;
		}
		
		var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
					getService(Components.interfaces.nsIWindowWatcher);
		
		if (!_window){
			_window = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				.getService(Components.interfaces.nsIWindowMediator)
				.getMostRecentWindow("navigator:browser");
		}
		
		if (_window) {
			_progressWindow = _window.openDialog("chrome://zotero/content/progressWindow.xul",
				"", "chrome,dialog=no,titlebar=no,popup=yes");
		}
		else {
			_progressWindow = ww.openWindow(null, "chrome://zotero/content/progressWindow.xul",
				"", "chrome,dialog=no,titlebar=no,popup=yes", null);
		}
		_progressWindow.addEventListener("load", _onWindowLoaded, false);
		// _progressWindow.addEventListener("mouseover", _onMouseOver, false);
		// _progressWindow.addEventListener("mouseout", _onMouseOut, false);
		_progressWindow.addEventListener("mouseup", _onMouseUp, false);
		
		_windowLoading = true;
		
		Zotero.ProgressWindowSet.add(_progressWindow, this);
		// start close timer 
		/*This is overwritten by later calls but I am calling it here just to make sure that an error doesn't prevent it from starting */
		// this.startCloseTimer(8000);
		
		return true;
	}
	
	/**
	 * Changes the "headline" shown at the top of the progress window
	 */
	this.changeHeadline = _deferUntilWindowLoad(function changeHeadline(text, icon, postText) {
		var doc = _progressWindow.document,
			headline = doc.getElementById("zotero-progress-text-headline");
		while(headline.hasChildNodes()) headline.removeChild(headline.firstChild);
		
		var preNode = doc.createElement("label");
		preNode.setAttribute("value", text);
		preNode.setAttribute("crop", "end");
		headline.appendChild(preNode);
		
		if(icon) {
			var img = doc.createElement("image");
			img.width = 16;
			img.height = 16;
			img.setAttribute("src", icon);
			headline.appendChild(img);
		}
		
		if(postText) {
			var postNode = doc.createElement("label");
			postNode.style.marginLeft = 0;
			postNode.setAttribute("value", " "+postText);
			postNode.setAttribute("crop", "end");
			postNode.setAttribute("flex", "1");
			headline.appendChild(postNode);
		}
	});
	
	/**
	 * Adds a line to the progress window with the specified icon
	 */
	this.addLines = _deferUntilWindowLoad(function addLines(labels, icons) {
		if(typeof labels === "object" && typeof icons === "object") {
			for (var i in labels) {
				new this.ItemProgress(icons[i], labels[i]);
			}
		} else {
			new this.ItemProgress(icons, labels);
		}
		
		_move();
	});
	
	/**
	 * Add a description to the progress window
	 *
	 * <a> elements are turned into XUL links
	 */
	this.addDescription = _deferUntilWindowLoad(function addDescription(text) {
		var newHB = _progressWindow.document.createElement("hbox");
		newHB.setAttribute("class", "zotero-progress-item-hbox");
		var newDescription = _progressWindow.document.createElement("description");
		
		var parts = Zotero.Utilities.parseMarkup(text);
		for (let part of parts) {
			if (part.type == 'text') {
				var elem = _progressWindow.document.createTextNode(part.text);
			}
			else if (part.type == 'link') {
				var elem = _progressWindow.document.createElement('label');
				elem.setAttribute('value', part.text);
				elem.setAttribute('class', 'zotero-text-link');
				for (var i in part.attributes) {
					elem.setAttribute(i, part.attributes[i]);
				}
			}
			
			newDescription.appendChild(elem);
		}
		
		newHB.appendChild(newDescription);
		_progressWindow.document.getElementById("zotero-progress-text-box").appendChild(newHB);
		
		_move();
	});

	/**
	 * Adds a callback to the window window that is called when users clicks on window
	 */
	this.addCallback = function(fn) {
        callback = fn;
    }
	
	/**
	 * Sets a timer to close the progress window. If a previous close timer was set,
	 * clears it.
	 * @param {Integer} ms The number of milliseconds to wait before closing the progress
	 *     window.
	 * @param {Boolean} [requireMouseOver] If true, wait until the mouse has touched the
	 *     window before closing.
	 */
	this.startCloseTimer = function startCloseTimer(ms, requireMouseOver) {
		if (_windowLoaded || _windowLoading) {
			if (requireMouseOver && !_mouseWasOver) {
				return;
			}
			
			if (_timeoutID) {
				_disableTimeout();
			}
			
			if (typeof ms != 'number') {
				ms = 2500;
			}
			
			_timeoutID = _progressWindow.setTimeout(_timeout, ms);
			_closing = true;
		}
	}
	
	/**
	 * Immediately closes the progress window if it is open.
	 */
	this.close = function close() {
		_disableTimeout();
		_windowLoaded = false;
		_windowLoading = false;
		Zotero.ProgressWindowSet.remove(_progressWindow);
		
		try {
			_progressWindow.close();
		} catch(ex) {}
	}
	
	/**
	 * Creates a new object representing a line in the progressWindow. This is the OO
	 * version of addLines() above.
	 */
	this.ItemProgress = _deferUntilWindowLoad(function(iconSrc, title, parentItemProgress) {
		this._itemText = _progressWindow.document.createElement("description");
		this._itemText.appendChild(_progressWindow.document.createTextNode(title));
		this._itemText.setAttribute("class", "zotero-progress-item-label");
		this._itemText.setAttribute("crop", "end");
		
		this._image = _progressWindow.document.createElement("hbox");
		this._image.setAttribute("class", "zotero-progress-item-icon");
		this._image.setAttribute("flex", 0);
		this._image.style.width = "16px";
		this._image.style.backgroundRepeat = "no-repeat";
		this.setIcon(iconSrc);
		
		this._hbox = _progressWindow.document.createElement("hbox");
		this._hbox.setAttribute("class", "zotero-progress-item-hbox");
		if(parentItemProgress) {
			this._hbox.style.marginLeft = "16px";
			this._hbox.zoteroIsChildItem;
		} else {
			this._hbox.setAttribute("parent", "true");
		}
		this._hbox.style.opacity = "0.5";
		
		this._hbox.appendChild(this._image);
		this._hbox.appendChild(this._itemText);
		
		var container = _progressWindow.document.getElementById("zotero-progress-text-box");
		if(parentItemProgress) {
			var nextItem = parentItemProgress._hbox.nextSibling;
			while(nextItem && nextItem.zoteroIsChildItem) {
				nextItem = nextItem.nextSibling;
			}
			container.insertBefore(this._hbox, nextItem);
		} else {
			container.appendChild(this._hbox);
		}
		
		_move();
	});
	
	/**
	 * Sets the current save progress for this item.
	 * @param {Integer} percent A percentage from 0 to 100.
	 */
	this.ItemProgress.prototype.setProgress = _deferUntilWindowLoad(function(percent) {
		if(percent != 0 && percent != 100) {
			var nArcs = 20;
			// Indication of partial progress, so we will use the circular indicator
			this._image.style.backgroundImage = "url('chrome://zotero/skin/progress_arcs.png')";
			this._image.style.backgroundPosition = "-"+(Math.round(percent/100*nArcs)*16)+"px 0";
			this._hbox.style.opacity = percent/200+.5;
			this._hbox.style.filter = "alpha(opacity = "+(percent/2+50)+")";
		} else if(percent == 100) {
			this._image.style.backgroundImage = "url('"+this._iconSrc+"')";
			this._image.style.backgroundPosition = "";
			this._hbox.style.opacity = "1";
			this._hbox.style.filter = "";
		}
	});
	
	/**
	 * Sets the icon for this item.
	 * @param {Integer} percent A percentage from 0 to 100.
	 */
	this.ItemProgress.prototype.setIcon = _deferUntilWindowLoad(function(iconSrc) {
		this._image.style.backgroundImage = "url('"+iconSrc+"')";
		this._image.style.backgroundPosition = "";
		this._iconSrc = iconSrc;
	});

	this.ItemProgress.prototype.setTitle = _deferUntilWindowLoad(function(title) {
		this._itemText.textContent = title;
	});

	this.ItemProgress.prototype.complete = _deferUntilWindowLoad(function(title, icon) {
		this.setProgress(100);
		this.setTitle(title);
		this.setIcon(icon);
	});
	
	/**
	 * Indicates that an error occurred saving this item.
	 */
	this.ItemProgress.prototype.setError = _deferUntilWindowLoad(function() {
		this._image.style.backgroundImage = "url('chrome://zotero/skin/cross.png')";
		this._image.style.backgroundPosition = "";
		this._itemText.style.color = "red";
		this._hbox.style.opacity = "1";
		this._hbox.style.filter = "";
	});
	
	function _onWindowLoaded() {
		_windowLoading = false;
		_windowLoaded = true;
		
		_move();
		
		// do things we delayed because the window was loading
		for(var i=0; i<_deferredUntilWindowLoad.length; i++) {
			_deferredUntilWindowLoad[i].apply(_deferredUntilWindowLoadThis[i],
				_deferredUntilWindowLoadArgs[i]);
		}
		_deferredUntilWindowLoad = [];
		_deferredUntilWindowLoadThis = [];
		_deferredUntilWindowLoadArgs = [];
	}
	
	function _move() {
		// sizeToContent() fails in FF3 with multiple lines
		// if we don't change the height
		_progressWindow.outerHeight = _progressWindow.outerHeight + 1;
		_progressWindow.sizeToContent();
		Zotero.ProgressWindowSet.tile(_progressWindow);
	}
	
	function _timeout() {
		self.close();	// could check to see if we're really supposed to close yet
						// (in case multiple scrapers are operating at once)
		_timeoutID = false;
	}
	
	function _disableTimeout() {
		// FIXME: to prevent errors from translator saving (Create New Item appears to still work)
		// This shouldn't be necessary, and mouseover isn't properly
		// causing the popup to remain
		try {
			_progressWindow.clearTimeout(_timeoutID);
		}
		catch (e) {}
		_timeoutID = false;
	}
	
	/*
	 * Disable the close timer when the mouse is over the window
	 */
	function _onMouseOver(e) {
		_mouseWasOver = true;
		_disableTimeout();
	}
	
	/**
	 * Start the close timer when the mouse leaves the window
	 *
	 * Note that this onmouseout doesn't work correctly on popups in Fx2,
	 * so 1) we have to calculate the window borders manually to avoid fading
	 * when the mouse is still over the box, and 2) this only does anything
	 * when the mouse is moved off of the browser window -- otherwise the close
	 * is triggered by onmousemove on appcontent in overlay.xul.
	 */
	function _onMouseOut(e) {
		// |this| refers to progressWindow's XUL window
		var top = this.screenY + (Zotero.isMac ? 22 : 0);
		if ((e.screenX >= this.screenX && e.screenX <= (this.screenX + this.outerWidth))
			&& (e.screenY >= top) && e.screenY <= (top + this.outerHeight)) {
				return;
		}
		if(_closing) self.startCloseTimer();
	}
	
	function _onMouseUp(e) {
		if(callback!==null) callback();
		self.close();
	}
	
	/**
	 * Wraps a function to ensure it isn't called until the window is loaded
	 */
	function _deferUntilWindowLoad(fn) {
		return function() {
			if(_window && _window.closed) return;
			
			if(_windowLoaded) {
				fn.apply(this, Array.prototype.slice.call(arguments));
			} else {
				_deferredUntilWindowLoad.push(fn);
				_deferredUntilWindowLoadThis.push(this);
				_deferredUntilWindowLoadArgs.push(Array.prototype.slice.call(arguments));
			}
		}
	}
}
