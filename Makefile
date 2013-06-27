all: zotero.xpi

zotero.xpi: FORCE
	rm -rf $@
	zip -r $@ chrome chrome.manifest defaults install.rdf

FORCE:
