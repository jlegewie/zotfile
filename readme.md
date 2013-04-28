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

#### Changes in 3.0

- **Improved annotation extraction**

    The extraction of pdf annotations using pdf.js works much better now! Zotfile uses a modified version of the updated [pdf.js](https://github.com/mozilla/pdf.js) library ([here](https://github.com/jlegewie/pdf.js) is the fork). It now supports more pdf standards, the detection of spaces works much better, and future updates to new versions of pdf.js are relatively easy. There are still  pdfs that won't work though! Some pdf standards are not yet supported and if you can not copy & paste text from the pdf file using your pdf viewer (e.g. Preview), it's unlikely that zotfile can help.

- **Jump to annotation: Open pdf on page with annotation**

    The extracted annotations now include a link that opens the pdf file on the corresponding page. For the extracted annotation `"This is my highlighted text" (zotfile 2013: 4)`, `zotfile 2013: 4` is a link that opens the corresponding pdf on the page with the annotation. Currently, this feature only works from reports (right-click on item and select `generate report`) but future version of Zotero might be able to open the links directly from the note (see discussion [here](https://forums.zotero.org/discussion/15186/clickable-links-in-notes/) and [here](https://forums.zotero.org/discussion/25832/note-hyperlinks-in-standalone/))

- **Tablet feature: Restrict saved search for tablet files to sub-folders**

    You can now right-click on the two saved searches for tablet files and restrict them to one of your custom sub-folders. This is very helpful to quickly see which files are in which folder.

- **Tablet feature: Support of colored tags in Zotero 4**

    The new version includes two major changes that allow you to work with colored tags. First, zotfile now also tags the parent item when an attachment is send to the tablet. As a result, you can easily see which items are on the tablet and also which items have been modified. Second, using the keys associated with colored tags, you can now send attachments to the tablet and get them back with a simple keystroke. Note that the two tablet tags (`_tablet` and `_tablet_modified`) behave like one tag for key presses: pressing the key for either of the two tags *always* sends attachments to the tablet or gets them back. An attachment, for example, might only have the `_tablet_modified` tag because it was modified but pressing the key for the tablet tag `_tablet` still removes the attachment from the tablet and therefore *does not* assign the `_tablet` tag. To use these features, simply assign colors to the two tablet tags (`_tablet` and `_tablet_modified`).

- Remove empty sub-folders when getting files from tablet
- Fix alert window (headline was missing in Zotero 4)
- Fix automatic renaming option "Only ask if..."
- Fix for zotfile item menu on Zotero as a tab

#### Changes in 2.3.4
- compatible with Zotero 4.0
- Annotation extraction compatible with FF 20

#### Changes in 2.3.1

- adding attachments from watched folder now works when child item is selected
- language improvements for French and German
- bug fix for subfolders based on wildcards

#### Changes in 2.3

- **enhanced renaming rules** (thanks to [Midnighter](https://github.com/Midnighter))

    1) Optional wild-cards: `{-%y}` only includes `-` if  `%y` is defined.

    2) Exclusive wild-cards: `%s|%j` journal abbr. or if not defined full journal name.

    (for examples see below)

- additional wild-cards for author formating (author initials `%I` and lastnameF `%F`), pages (`%f`) and short title (`%h`)
- **watch source folder for new files**

    Whenever the focus changes to the item list in Zotero, Zotfile checks for new files in the source folder. If a new file was added to the folder, zotfile uses a clickable, non-disruptive window to ask the user whether s/he wants to attach that file to the currently selected Zotero item.

- **revised auto rename with additional options**

    Four options: Never, Always ask, Only ask if item has other atts, Always rename. The 'asking' uses a clickable, non-disruptive window that appears in the bottom right corner - same as previous info window but clickable.

- **revised notifications and error handling**
- **Zotfile translation to German** (thanks to [wuffi](https://github.com/wuffi)) **and French** (thanks to [gracile-fr](https://github.com/gracile-fr))
- Allow periods as delimiter in filenames (thanks to [jjatria](https://github.com/jjatria))
- new option: "lower case" filenames (thanks to [jjatria](https://github.com/jjatria))
- new option: disable renaming so that attachments are only moved (hidden: `.disable_renaming`)
- new option: set opening and closing quotation mark for extracted annotations (hidden: `.openingQuotationMarks`, `.closingQuotationMarks`)
- new option: remove periods from filenames (hidden: `removePeriods`)
- bug fix: download of poppler tool was broken
- bug fix: preview of renaming rules for Unix and Windows
- bug fix: sending to and getting from tablet deleted note content

**Examples for enhanced renaming rules**
`%j` - journal; `%s` - journal abbreviation

`{%a}{-%y}{-%j (%s)}` - `author-2001-Proceedings of the National Academy of Sciences (PNAS)`
(if either `%j` or `%s` is empty, `author-2001`)

`{%a-}{%y-}{%s|%j}` - `author-2001-PNAS` or `author-2001-Proceedings...` if `%s` is empty

For full description, see [updated zotfile website](http://www.columbia.edu/~jpl2136/zotfile.html#renaming).

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
