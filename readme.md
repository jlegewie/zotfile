# ZotFile: Advanced PDF management for Zotero
### Joscha Legewie

Zotfile is a Zotero plugin to manage your attachments: automatically rename, move, and attach PDFs (or other files) to Zotero items, sync PDFs from your Zotero library to your (mobile) PDF reader (e.g. an iPad, Android tablet, etc.) and extract annotations from PDF files.

Detailed information are available from the [zotfile website](http://www.zotfile.com).

## Installation
The currently released version (3.x) is available [here](https://addons.mozilla.org/en-US/firefox/addon/zotfile/).

To install the development version on github:

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

#### Changes in 4.2.4

- fix regression with from 4.2.3

#### Changes in 4.2.3

- Support for non ascii characters in source, destination and tablet directory
- Fix: regression from 4.2.2
- Fix: Error reporting for better debugging
- Fix: Correct parsing of page number from Zotero item for extracted annotations

#### Changes in 4.2.2

- Fix: %c wildcard on Windows
- Fix: Problem with deleting empty folders

#### Changes in 4.2.1

- Fix: Renaming attachments without author failed

#### Changes in 4.2

- Add wildcard %g for author's full name (thanks to [QingQYang](https://github.com/QingQYang))
- Support for PDF Expert and other PDF readers on mac to open links in Zotero notes (the hidden option `pdfExtraction.openPdfMac_skim` changed to `pdfExtraction.openPdfMac`. `openPdfMac` is a string with the exact name of the application such as "Preview", "Skim" or "PDF Expert").
- Wild-cards for (senior) last author (`q`, `Q`, `u`, and `U`) (thanks to [bwiernik](https://github.com/bwiernik))
- Fix: Small fixes for extraction of annotations
- Fix: Delete folder(s) if last file is moved out (thanks to [Renato Alves](https://github.com/Unode))
- Fix: Renaming same file a second time truncates and indexes filename (thanks to [Renato Alves](https://github.com/Unode))
- Fix: Better handle spacial character in TOC

#### Changes in 4.1.6

- Fixed problem with downloading of poppler-based extraction tool

#### Changes in 4.1.5

- Fix problem when renaming files in place
- Fix problem with "Restrict saved search"

#### Changes in 4.1.4

- Rename file at current location if "Custom Location" is not specified (thanks to [Soham Sinha](https://github.com/sohamm17))
- Fix bug with files that are renamed when sent to the tablet

#### Changes in 4.1.3

- fix problem with location of tablet files

#### Changes in 4.1.2

- fix for problem with poppler-based extraction and annotation color

#### Changes in 4.x (4.0, 4.1 and 4.1.1)

- **Goto annotation in pdf**

    This is not really a new feature but with two recent changes in Zotero (see [this](https://github.com/zotero/zotero/pull/450) and [this](https://github.com/zotero/zotero/pull/452) pull request), it became much more useful! Simply click on the link that is part of your extracted annotations, and zotfile will open the pdf on the page with the annotation. The feature now works on Windows as well (thanks to aurimasv) and I have added support for Skim on Mac. Check out the [documentation](http://zotfile.com/index.html#extract-pdf-annotations) for some more details.

- **Improved extraction of annotation**

    This version includes four improvements for the extraction of annotations. First, the new version greatly improves the detection of correct spaces between words. Second, the extraction is now based on the most recent pdf.js version ([here](https://github.com/jlegewie/pdf.js/tree/extract-v3) is my fork with the modified version of [pdf.js](https://github.com/mozilla/pdf.js) used in zotfile). With this update, zotfile should work with more pdfs. Second, the extraction is now about 40-60% faster (depending on the pdf) thanks to some improvements in the extraction code. Third, the extraction now runs in the background so that Zotero is not blocked while annotations are extracted. 

- **Get Table of Contents from PDF**

    Similar to [Mendeley](http://blog.mendeley.com/progress-update/desktop-contents-tables-and-figures/), ZotFile can now get the table of contents from PDF and save it with links to the correct page in attachment notes. Simply click on the the desired section and zotfile opens the pdf on the correct page. Zotfile automatically extracts the table of content for all newly added pdf attachments (disable with `zotfile.pdfOutline.getToc` setting) or you can manually extract the toc using 'Manage Attachments->Get Table of Contents' (remove menu item with `zotfile.pdfOutline.menuItem` setting). This feature only works for pdfs that have an embedded table of content. Unfortunately, many don't. 

- **Support for sub-folders based on collection path** (via wildcard %c) (thanks to [simpzan](https://github.com/simpzan))

- **Tablet status is now shown in right-pane with other attachment information**

    The right pane now includes a row with the current tablet status such as `No` for files that are not on the tablet or `[Basefolder]` for files that are in the tablet base-folder. Click on this information to change the tablet status and open or reveal the file on the tablet (very convenient because double-clicking on the attachment opens the imported zotero attachment and not the file on the tablet).

- **Extract Annotation Color** (thanks to [RAG2ko](https://github.com/RAG2ko))

    Zotfile now extracts the color of annotations. The color can be used in two ways: (a) To format extracted annotations: Just add some css styling to the hidden options for formatting. For example, change `formatAnnotationHighlight` to `<p style="background-color:%(color);">"%(content)" (%(cite))</p>`. The wildcard `%(color)` is replaced by the annotation color (you can also use %(color_category) for the color category---reddish is red etc). This styling has the same effect but looks a little better: `<p><span style="background-color:%(color);">"%(content)"</span> (%(cite))</p>` (b) To create separate notes for color categories: The hidden option `pdfExtraction.colorNotes` allows you to create a separate note for each color category (yellow, red, green etc annotations).

- **Improved formatting of extracted annotations with hidden options** (`formatNoteTitle`, `formatAnnotationNote`, `formatAnnotationHighlight`, `formatAnnotationUnderline`)

    The available wildcards are `%(content)` for the highlights text, `%(cite)` for the in-text citation of the zotero item, `%(page)` for the page of the annotation, `%(uri)` for the uri that open the pdf on the correct page, `%(label)` for the text label displayed in the title bar of the annotation pop-up commonly used for the user who added the annotation, and `%(color)`/`%(color_category)` for the annotation color as described above. The default for `formatAnnotationHighlight` is `<p>"%(content)" (%(cite))</p>`. WARNING: I removed the old settings. You will have to change the new settings if you want to customize the format of the note with extracted annotations.

- Improved default PDF reader detection on Windows (thanks to aurimasv)
- Hidden option `pdfExtraction.replacements` for custom, regular expression-based replacements in extracted annotations. This can be useful because some pdfs contain 'broken' characters. For example, `[{"regex":" ?\u00f0", "replacement": " ("}]` replaces the unicode character `ð` with `(` to fix a problem in pdfs from a certain publisher. In this case, `ð` is a problem with the pdf and not with zotfile's extraction. The hidden option can be used to fix it.
- Information for attachments on the tablet is now hidden in the attachment note
- Improved information windows
- Improved renaming function (avoids re-indexing of linked attachments)
- New wildcards for editors (`%d`, `%D`, `%L`, `%l`)
- Fix bug with unnecessary suffix after multiple renames of same file
- further improvements for the extraction of annotations in 4.1
- truncate title after '!'
- Add .docx files to the default file types

#### Changes in 3.1

- New zotfile webpage at [www.zotfile.com](http://www.zotfile.com/) (please update links)
- User-defined wildcards
- watch folder now adds an attachment and retrieves metadata if no file is selected
  (change message, change version)
- fix pdf.js issue with some pdf annotation (see [this](https://forums.zotero.org/discussion/31903/extract-pdf-annotations-message-hangs-on-linuxubuntu/#Comment_177201) discussion)
- New hidden preferences for duration of info windows (`info_window_duration` and `info_window_duration_clickable`)
- The `%w` wildcard now maps to the correct field for most item types
- The `%u` wildcard as redundant (use `%y` instead)
- Choose the number of authors to display when truncating authors during renaming (thanks to bwiernik)
- fix problem that small info window does not disappear

#### Changes in 3.0.3

- fix for issue with showing website on every restart
- fix for issue when adding new attachment

Other small fixes mainly for Italian translation, restriction of saved searches and renaming based on collections.

#### Changes in 3.0

- **Improved extraction of annotation**

    The extraction of pdf annotations using pdf.js works much better now! Zotfile uses a modified version of the updated [pdf.js](https://github.com/mozilla/pdf.js) library ([here](https://github.com/jlegewie/pdf.js) is the fork). The new version supports more pdf standards, detects spaces more precisely, sorts annotations in the correct order, and future updates to new versions of pdf.js are relatively easy. There are still  pdfs that won't work though! Some pdf standards are not yet supported and if you can not copy & paste text from the pdf file using your pdf viewer (e.g. Preview), it's unlikely that zotfile can help.

- **Goto annotation in pdf**

    The extracted annotations now include a link that opens the pdf file on the corresponding page. For the extracted annotation `"This is my text" (zotfile 2013: 4)`, `zotfile 2013: 4` is a link that opens the pdf on the page with the annotation. Currently, this feature only works from reports (right-click on item and select `generate report`) but future version of Zotero might be able to open the links directly from the note (see discussion [here](https://forums.zotero.org/discussion/15186/clickable-links-in-notes/) and [here](https://forums.zotero.org/discussion/25832/note-hyperlinks-in-standalone/))

- **Tablet feature: Restrict saved search for tablet files to sub-folders**

    You can now right-click on the two saved searches for tablet files and restrict them to one of your custom sub-folders. This is very helpful to quickly see the files that are in a specific sub-folder.

- **Tablet feature: Support of colored tags in Zotero 4**

    Zotfile now tags the parent item when an attachment is send to the tablet so that you can easily see which items are on the tablet. Simply assign colors to the two tablet tags (`_tablet` and `_tablet_modified`). But DO NOT manually add the tag to items or attachments (also not using the keys for colored tags).
    <!-- The new version includes two major changes that allow you to work with colored tags. First, zotfile now also tags the parent item when an attachment is send to the tablet. As a result, you can easily see which items are on the tablet and also which items have been modified. Second, using the keys associated with colored tags, you can now send attachments to the tablet and get them back with a simple keystroke. Note that the two tablet tags (`_tablet` and `_tablet_modified`) behave like one tag for key presses: pressing the key for either of the two tags *always* sends attachments to the tablet or gets them back. An attachment, for example, might only have the `_tablet_modified` tag because it was modified but pressing the key for the tablet tag `_tablet` still removes the attachment from the tablet and therefore *does not* assign the `_tablet` tag. To use these features, simply assign colors to the two tablet tags (`_tablet` and `_tablet_modified`). -->

- Italian localization (thanks to Roberto Caviglia)
- Remove empty sub-folders when getting files from tablet
- Fix alert window (headline was missing in Zotero 4)
- Fix automatic renaming option "Only ask if..."
- Fix for zotfile item menu on Zotero as a tab
- Fix problem with sending/getting files from tablet when using both unix/mac and windows

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

For full description, see [updated zotfile website](http://www.zotfile.com/index.html#renaming-rules).

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
