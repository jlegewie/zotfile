all: Makefile.in

-include Makefile.in

RELEASE:=$(shell xsltproc version.xsl install.xml)

zotfile-fx.xpi: FORCE
	rm -rf $@
	xsltproc removeupdateurl.xsl install.xml > install.rdf
	zip -r $@ chrome chrome.manifest defaults install.rdf

zotfile-github.xpi: FORCE
	rm -rf $@
	cp install.xml install.rdf
	xsltproc -stringparam release ${RELEASE} update.xsl install.xml > update.rdf
	zip -r $@ chrome chrome.manifest defaults install.rdf

zotfile-%-fx.xpi: zotfile-fx.xpi
	mv $< $@

zotfile-%-github.xpi: zotfile-github.xpi
	mv $< $@

Makefile.in: install.xml
	echo "all: zotfile-${RELEASE}-fx.xpi zotfile-${RELEASE}-github.xpi" > Makefile.in

FORCE:
