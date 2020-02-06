# ZotFile: Advanced PDF management for Zotero
### Joscha Legewie

Zotfile is a Zotero plugin to manage your attachments: automatically rename, move, and attach PDFs (or other files) to Zotero items, sync PDFs from your Zotero library to your (mobile) PDF reader (e.g. an iPad, Android tablet, etc.) and extract annotations from PDF files.

Detailed information are available from the [zotfile website](http://www.zotfile.com).

## Installation

For *Zotero 5*, first download the extension file (follow the download link above, click on the .xpi file for the most recent release). Now start Zotero 5 and go to "Tool -> Add-ons -> Tools for all Add-ons (the small, drop-down wheel in the top right corner) -> Install Add-on From File" and select the downloaded .xpi file. For *Zotero 4.x*, the process is different for Zotero for Firefox and Zotero Standalone. For Zotero 4.x Firefox, go to the [Mozilla Add-Ons page](https://addons.mozilla.org/en-us/firefox/addon/zotfile/) and follow the instructions. For Zotero 4.x Standalone, use the same steps as for Zotero 5 but download the .xpi file from [here](https://addons.mozilla.org/firefox/downloads/file/585224/zotfile-4.2.8-fx.xpi?src=dp-btn-primary)

To install the **development version** on github:

1. download `.zip` file from github
2. extract `.zip` file
3. recreate `.zip` file containing all the files at the top level, i.e.,
  install.rdf and the chrome directory need to be at the root of the .zip file
  and not under zotfile/
4. rename the file to `.xpi`
5. Install
  - For zotero firefox: drag & drop on firefox
  - For zotero standalone: In Zotero Standalone go to 'Tools->Add-ons->Tools for all Add-ons (the small, drop-down wheel menu next to the 'Search all Add-ons' box)->Install Add-on From File' and pick the .xpi file.

For Linux, Mac OS X or Cygwin users, there is a `Makefile` which takes care of creating the `.xpi` file.
Simply run `make` instead of steps 3 and 4 above.

## Extraction of PDF Annotations

Zotfile can extracted annotations and highlighted text from many PDF files. But it will never be able to handle all files. If you can not copy & paste meaningful text from the file in your pdf viewer (open your pdf viewer (not the browser plugin), select text, copy and paste it somewhere), zotfile won't be able to extract the highlighted text either. If you can, there is a chance that future versions of zotfile will solve the problem. In general, these files depend on the pdf standards supported by pdf.js, which is the pdf library used by zotfile to extract annotations.

## License
The source code is released under GNU General Public License, version 3.0

Contributions preferably through pull requests are welcome!

## Changelog

The full changelog is available [here](http://zotfile.com/#changelog).
