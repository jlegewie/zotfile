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
