# ZotFile: Zotero plugin to manage your attachments
### Joscha Legewie

Zotfile is a Zotero plugin to manage your attachments: automatically rename, move, and attach PDFs (or other files) to Zotero items, sync PDFs from your Zotero library to your (mobile) PDF reader (e.g. an iPad, Android tablet, etc.) and extract annotations from PDF files.

Detailed information are available from the [zotfile website](http://www.jlegewie.com/zotfile.html).

## Installation
The currently released version (2.x) is available [here](https://addons.mozilla.org/en-US/firefox/addon/zotfile/).

To install the development version on github:

- download .zip file from github
- extract .zip file
- recreate .zip file containing all the files at the top level, i.e.,
  install.rdf and the chrome directory need to be at the root of the zip file
  and not under zotfile/
- rename the file to .xpi
- For zotero firefox: drag & drop on firefox
- For zotero standalone: In Zotero Standalone go to 'Tools->Add-ons->Tools for all Add-ons (the small, drop-down wheel menu next to the 'Search all Add-ons' box)->Install Add-on From File' and pick the .xpi file.

## License
The source code is released under GNU General Public License, version 3.0

Contributions preferably through pull requests are welcome!

## Changelog

#### Changes in 2.2.5

- Zotfile translation to German (thanks to wuffi)
- Allow periods as delimiter in filenames (thanks to jjatria)
- "lower case" option for filenames (thanks to jjatria)

#### Changes in 2.2.3

- bug fix: check whether selected attachments are valid (no top-level item, no web attachments and attachment exists)
- bug fix: editing custom folder created error if user had maximum number of custom folders

#### Changes in 2.2.2

- Add option to change delimiter between multiple authors (thanks to [gracile-fr](https://github.com/gracile-fr))

#### Changes in 2.2

- New feature: automatic renaming of attachment files (thanks to [Robin Wilson](www.rtwilson.com/academic))
- Bug fix: zotfile produced error when trying to move open files on Windows (thanks to Dominik)

#### Changes in 2.1

- Important: the tag for tablet files was changed from '_READ' to '_tablet'
- New saved search for modified files on tablet
  (updates automatically, replaces 'Scan Tablet Files' function, which has been removed)
- Zotfile menu items only appear for bibliographic items and attachments (not for notes)
- Bug fix: allow the extraction of annotations in group libraries
- Other bug fixes

#### Changes in 2.0

- Sync Zotero Attachments with your iPad or Android tablet
- Extract Annotations from PDF Files (thanks to Joe Devietti)
- redesigned preference pane
- many more features and bug fixes
