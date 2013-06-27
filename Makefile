all: Makefile.in

-include Makefile.in

RELEASE:=$(shell grep em:version install.rdf | head -n 1 | sed -r 's/^.*>(.*)<.*$$/\1/')

zotero.xpi: FORCE
	rm -rf $@
	zip -r $@ chrome chrome.manifest defaults install.rdf

zotero-%-fx.xpi: zotero.xpi
	mv $< $@

Makefile.in: install.rdf
	echo "all: zotero-${RELEASE}-fx.xpi" > Makefile.in

FORCE:
