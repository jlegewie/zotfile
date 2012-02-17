ZotFile: Zotero plugin to manage your attachments
by Joscha Legewie

Zotfile is a Zotero plugin to manage your attachments: automatically rename, move, and attach PDFs (or other files) to Zotero items, sync PDFs from your Zotero library to your (mobile) PDF reader (e.g. an iPad, Android tablet, etc.) and extract annotations from PDF files.


Installation
The currently released version (2.x) is available at (after review process)
https://addons.mozilla.org/en-US/firefox/addon/zotfile/

To install the development version on github:
- download .zip file from github
- extract .zip file
- recreate .zip file containing all the files 
(Note: I am not sure why it is necessary to recreate the zip file)
- rename file to .xpi
- For zotero firefox: drag & drop on firefox (for zotero standalone, see below)
- For zotero standalone: In Zotero Standalone go to 'Tools->Add-ons->Tools for all Add-ons (the small,drop-down wheel menu next to the 'Search all Add-ons' box)->Install Add-on From File' and pick the .xpi file.

License
The source code is released under GNU General Public License, version 3.0
Contributions preferably through pull requests are welcome!


Changelog

Changes in 2.1
- Important: the tag for tablet files was changed from '_READ' to '_tablet'
- New saved search for modified files on tablet
  (updates automatically, replaces 'Scan Tablet Files' function, which has been removed)
- Bug fix: allow the extraction of annotations in group libraries
- Other bug fixes

Changes in 2.0
- Sync Zotero Attachments with your iPad or Android tablet
- Extract Annotations from PDF Files (thanks to Joe Devietti)
- redesigned preference pane
- many more features and bug fixes