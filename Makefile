all: Makefile.in

-include Makefile.in

RELEASE:=$(shell grep em:version install.rdf | head -n 1 | sed -r 's/^.*>(.*)<.*$$/\1/')

zotfile.xpi: FORCE
	rm -rf $@
	zip -r $@ chrome chrome.manifest defaults install.rdf

zotfile-%-fx.xpi: zotfile.xpi
	mv $< $@

Makefile.in: install.rdf
	echo "all: zotfile-${RELEASE}-fx.xpi" > Makefile.in

FORCE:
