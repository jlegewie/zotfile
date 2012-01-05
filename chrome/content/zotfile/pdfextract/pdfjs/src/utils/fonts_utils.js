/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/*
 * The Type2 reader code below is only used for debugging purpose since Type2
 * is only a CharString format and is never used directly as a Font file.
 *
 * So the code here is useful for dumping the data content of a .cff file in
 * order to investigate the similarity between a Type1 CharString and a Type2
 * CharString or to understand the structure of the CFF format.
 */

/*
 * Build a charset by assigning the glyph name and the human readable form
 * of the glyph data.
 */
function readCharset(aStream, aCharstrings) {
  var charset = {};

  var format = aStream.getByte();
  var count = aCharstrings.length - 1;
  if (format == 0) {
    charset['.notdef'] = readCharstringEncoding(aCharstrings[0]);

    for (var i = 1; i < count + 1; i++) {
      var sid = aStream.getByte() << 8 | aStream.getByte();
      charset[CFFStrings[sid]] = readCharstringEncoding(aCharstrings[i]);
      //log(CFFStrings[sid] + "::" + charset[CFFStrings[sid]]);
    }
  } else if (format == 1) {
    for (var i = 1; i < count + 1; i++) {
      var first = aStream.getByte();
      first = (first << 8) | aStream.getByte();
      var numLeft = aStream.getByte();
      for (var j = 0; j <= numLeft; j++) {
        var sid = first++;
        if (CFFStrings[sid] == 'three')
          log(aCharstrings[j]);
        charset[CFFStrings[sid]] = readCharstringEncoding(aCharstrings[j]);
      }
    }
  } else {
    error('Invalid charset format');
  }

  return charset;
}

/*
 * Take a Type2 binary charstring as input and transform it to a human
 * readable representation as specified by the 'The Type 2 Charstring Format',
 * chapter 3.1.
 */
function readCharstringEncoding(aString) {
  if (!aString)
    return '';

  var charstringTokens = [];

  var count = aString.length;
  for (var i = 0; i < count; ) {
    var value = aString[i++];
    var token = null;

    if (value < 0) {
      continue;
    } else if (value <= 11) {
      token = CFFEncodingMap[value];
    } else if (value == 12) {
      token = CFFEncodingMap[value][aString[i++]];
    } else if (value <= 18) {
      token = CFFEncodingMap[value];
    } else if (value <= 20) {
      var mask = aString[i++];
      token = CFFEncodingMap[value];
    } else if (value <= 27) {
      token = CFFEncodingMap[value];
    } else if (value == 28) {
      token = aString[i++] << 8 | aString[i++];
    } else if (value <= 31) {
      token = CFFEncodingMap[value];
    } else if (value < 247) {
      token = parseInt(value, 10) - 139;
    } else if (value < 251) {
      token = (value - 247) * 256 + aString[i++] + 108;
    } else if (value < 255) {
      token = -(value - 251) * 256 - aString[i++] - 108;
    } else {// value == 255
      token = aString[i++] << 24 | aString[i++] << 16 |
              aString[i++] << 8 | aString[i];
    }

    charstringTokens.push(token);
  }

  return charstringTokens;
}


/*
 * Take a binary DICT Data as input and transform it into a human readable
 * form as specified by 'The Compact Font Format Specification', chapter 5.
 */
function readFontDictData(aString, aMap) {
  var fontDictDataTokens = [];

  var count = aString.length;
  for (var i = 0; i < count; i) {
    var value = aString[i++];
    var token = null;

    if (value == 12) {
      token = aMap[value][aString[i++]];
    } else if (value == 28) {
      token = aString[i++] << 8 | aString[i++];
    } else if (value == 29) {
      token = aString[i++] << 24 |
              aString[i++] << 16 |
              aString[i++] << 8 |
              aString[i++];
    } else if (value == 30) {
      token = '';
      var parsed = false;
      while (!parsed) {
        var byte = aString[i++];

        var nibbles = [parseInt(byte / 16, 10), parseInt(byte % 16, 10)];
        for (var j = 0; j < nibbles.length; j++) {
          var nibble = nibbles[j];
          switch (nibble) {
            case 0xA:
              token += '.';
              break;
            case 0xB:
              token += 'E';
              break;
            case 0xC:
              token += 'E-';
              break;
            case 0xD:
              break;
            case 0xE:
              token += '-';
              break;
            case 0xF:
              parsed = true;
              break;
            default:
              token += nibble;
              break;
          }
        }
      }
      token = parseFloat(token);
    } else if (value <= 31) {
      token = aMap[value];
    } else if (value <= 246) {
      token = parseInt(value, 10) - 139;
    } else if (value <= 250) {
      token = (value - 247) * 256 + aString[i++] + 108;
    } else if (value <= 254) {
      token = -(value - 251) * 256 - aString[i++] - 108;
    } else if (value == 255) {
      error('255 is not a valid DICT command');
    }

    fontDictDataTokens.push(token);
  }

  return fontDictDataTokens;
}

/*
 * Take a stream as input and return an array of objects.
 * In CFF an INDEX is a structure with the following format:
 *  {
 *    count: 2 bytes (Number of objects stored in INDEX),
 *    offsize: 1 byte (Offset array element size),
 *    offset: [count + 1] bytes (Offsets array),
 *    data: - (Objects data)
 *  }
 *
 *  More explanation are given in the 'CFF Font Format Specification',
 *  chapter 5.
 */
function readFontIndexData(aStream, aIsByte) {
  var count = aStream.getByte() << 8 | aStream.getByte();
  var offsize = aStream.getByte();

  function getNextOffset() {
    switch (offsize) {
      case 0:
        return 0;
      case 1:
        return aStream.getByte();
      case 2:
        return aStream.getByte() << 8 | aStream.getByte();
      case 3:
        return aStream.getByte() << 16 | aStream.getByte() << 8 |
               aStream.getByte();
      case 4:
      return aStream.getByte() << 24 | aStream.getByte() << 16 |
             aStream.getByte() << 8 | aStream.getByte();
    }
    error(offsize + ' is not a valid offset size');
    return null;
  }

  var offsets = [];
  for (var i = 0; i < count + 1; i++)
    offsets.push(getNextOffset());

  dump('Found ' + count + ' objects at offsets :' +
      offsets + ' (offsize: ' + offsize + ')');

  // Now extract the objects
  var relativeOffset = aStream.pos;
  var objects = [];
  for (var i = 0; i < count; i++) {
    var offset = offsets[i];
    aStream.pos = relativeOffset + offset - 1;

    var data = [];
    var length = offsets[i + 1] - 1;
    for (var j = offset - 1; j < length; j++)
      data.push(aIsByte ? aStream.getByte() : aStream.getChar());
    objects.push(data);
  }

  return objects;
}

var Type2Parser = function type2Parser(aFilePath) {
  var font = new Dict();

  var xhr = new XMLHttpRequest();
  xhr.open('GET', aFilePath, false);
  xhr.mozResponseType = xhr.responseType = 'arraybuffer';
  xhr.expected = (document.URL.indexOf('file:') == 0) ? 0 : 200;
  xhr.send(null);
  this.data = new Stream(xhr.mozResponseArrayBuffer || xhr.mozResponse ||
                         xhr.responseArrayBuffer || xhr.response);

  // Turn on this flag for additional debugging logs
  var debug = false;

  function dump(aStr) {
    if (debug)
      log(aStr);
  }

  function parseAsToken(aString, aMap) {
    var decoded = readFontDictData(aString, aMap);

    var stack = [];
    var count = decoded.length;
    for (var i = 0; i < count; i++) {
      var token = decoded[i];
      if (isNum(token)) {
        stack.push(token);
      } else {
        switch (token.operand) {
          case 'SID':
            font.set(token.name, CFFStrings[stack.pop()]);
            break;
          case 'number number':
            font.set(token.name, {
              offset: stack.pop(),
              size: stack.pop()
            });
            break;
          case 'boolean':
            font.set(token.name, stack.pop());
            break;
          case 'delta':
            font.set(token.name, stack.pop());
            break;
          default:
            if (token.operand && token.operand.length) {
              var array = [];
              for (var j = 0; j < token.operand.length; j++)
                array.push(stack.pop());
              font.set(token.name, array);
            } else {
              font.set(token.name, stack.pop());
            }
            break;
        }
      }
    }
  }

  this.parse = function type2ParserParse(aStream) {
    font.set('major', aStream.getByte());
    font.set('minor', aStream.getByte());
    font.set('hdrSize', aStream.getByte());
    font.set('offsize', aStream.getByte());

    // Read the NAME Index
    dump('Reading Index: Names');
    font.set('Names', readFontIndexData(aStream));
    dump('Names: ' + font.get('Names'));

    // Read the Top Dict Index
    dump('Reading Index: TopDict');
    var topDict = readFontIndexData(aStream, true);
    dump('TopDict: ' + topDict);

    // Read the String Index
    dump('Reading Index: Strings');
    var strings = readFontIndexData(aStream);
    dump('strings: ' + strings);

    // Fill up the Strings dictionary with the new unique strings
    for (var i = 0; i < strings.length; i++)
      CFFStrings.push(strings[i].join(''));

    // Parse the TopDict operator
    var objects = [];
    var count = topDict.length;
    for (var i = 0; i < count; i++)
      parseAsToken(topDict[i], CFFDictDataMap);

    // Read the Global Subr Index that comes just after the Strings Index
    // (cf. "The Compact Font Format Specification" Chapter 16)
    dump('Reading Global Subr Index');
    var subrs = readFontIndexData(aStream, true);
    dump(subrs);

    // Reading Private Dict
    var priv = font.get('Private');
    dump('Reading Private Dict (offset: ' + priv.offset +
        ' size: ' + priv.size + ')');
    aStream.pos = priv.offset;

    var privateDict = [];
    for (var i = 0; i < priv.size; i++)
      privateDict.push(aStream.getByte());
    dump('private:' + privateDict);
    parseAsToken(privateDict, CFFDictPrivateDataMap);

    for (var p in font.map)
      dump(p + '::' + font.get(p));

    // Read CharStrings Index
    var charStringsOffset = font.get('CharStrings');
    dump('Read CharStrings Index (offset: ' + charStringsOffset + ')');
    aStream.pos = charStringsOffset;
    var charStrings = readFontIndexData(aStream, true);

    // Read Charset
    dump('Read Charset for ' + charStrings.length + ' glyphs');
    var charsetEntry = font.get('charset');
    if (charsetEntry == 0) {
      error('Need to support CFFISOAdobeCharset');
    } else if (charsetEntry == 1) {
      error('Need to support CFFExpert');
    } else if (charsetEntry == 2) {
      error('Need to support CFFExpertSubsetCharset');
    } else {
      aStream.pos = charsetEntry;
      var charset = readCharset(aStream, charStrings);
    }
  };
};

/*
 * To try the Type2 decoder on a local file in the current directory:
 *
 *  var cff = new Type2Parser("file.cff");
 *  cff.parse(this.data);
 *
 * To try the Type2 decoder on a custom built CFF array:
 *
 *  var file = new Uint8Array(cffFileArray, 0, cffFileSize);
 *  var parser = new Type2Parser();
 *  parser.parse(new Stream(file));
 *
 */

/*
 * Write to a file to the disk (works only on Firefox in privilege mode)
 * but this is useful for dumping a font file to the disk and check with
 * fontforge or the ots program what's wrong with the file.
 *
 * writeToFile(fontData, "/tmp/pdf.js." + fontCount + ".cff");
 */
function writeToFile(aBytes, aFilePath) {
  if (!('netscape' in window))
    return;

  netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
  var Cc = Components.classes,
      Ci = Components.interfaces;
  var file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsILocalFile);
  file.initWithPath(aFilePath);

  var stream = Cc['@mozilla.org/network/file-output-stream;1']
                 .createInstance(Ci.nsIFileOutputStream);
  stream.init(file, 0x04 | 0x08 | 0x20, 0x180, 0);

  var bos = Cc['@mozilla.org/binaryoutputstream;1']
              .createInstance(Ci.nsIBinaryOutputStream);
  bos.setOutputStream(stream);
  bos.writeByteArray(aBytes, aBytes.length);
  stream.close();
}

