/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var PDFFunction = (function PDFFunctionClosure() {
  var CONSTRUCT_SAMPLED = 0;
  var CONSTRUCT_INTERPOLATED = 2;
  var CONSTRUCT_STICHED = 3;
  var CONSTRUCT_POSTSCRIPT = 4;

  return {
    getSampleArray: function pdfFunctionGetSampleArray(size, outputSize, bps,
                                                       str) {
      var length = 1;
      for (var i = 0, ii = size.length; i < ii; i++)
        length *= size[i];
      length *= outputSize;

      var array = [];
      var codeSize = 0;
      var codeBuf = 0;
      // 32 is a valid bps so shifting won't work
      var sampleMul = 1.0 / (Math.pow(2.0, bps) - 1);

      var strBytes = str.getBytes((length * bps + 7) / 8);
      var strIdx = 0;
      for (var i = 0; i < length; i++) {
        while (codeSize < bps) {
          codeBuf <<= 8;
          codeBuf |= strBytes[strIdx++];
          codeSize += 8;
        }
        codeSize -= bps;
        array.push((codeBuf >> codeSize) * sampleMul);
        codeBuf &= (1 << codeSize) - 1;
      }
      return array;
    },

    getIR: function pdfFunctionGetIR(xref, fn) {
      var dict = fn.dict;
      if (!dict)
        dict = fn;

      var types = [this.constructSampled,
                   null,
                   this.constructInterpolated,
                   this.constructStiched,
                   this.constructPostScript];

      var typeNum = dict.get('FunctionType');
      var typeFn = types[typeNum];
      if (!typeFn)
        error('Unknown type of function');

      return typeFn.call(this, fn, dict, xref);
    },

    fromIR: function pdfFunctionFromIR(IR) {
      var type = IR[0];
      switch (type) {
        case CONSTRUCT_SAMPLED:
          return this.constructSampledFromIR(IR);
        case CONSTRUCT_INTERPOLATED:
          return this.constructInterpolatedFromIR(IR);
        case CONSTRUCT_STICHED:
          return this.constructStichedFromIR(IR);
        case CONSTRUCT_POSTSCRIPT:
        default:
          return this.constructPostScriptFromIR(IR);
      }
    },

    parse: function pdfFunctionParse(xref, fn) {
      var IR = this.getIR(xref, fn);
      return this.fromIR(IR);
    },

    constructSampled: function pdfFunctionConstructSampled(str, dict) {
      function toMultiArray(arr) {
        var inputLength = arr.length;
        var outputLength = arr.length / 2;
        var out = new Array(outputLength);
        var index = 0;
        for (var i = 0; i < inputLength; i += 2) {
          out[index] = [arr[i], arr[i + 1]];
          ++index;
        }
        return out;
      }
      var domain = dict.get('Domain');
      var range = dict.get('Range');

      if (!domain || !range)
        error('No domain or range');

      var inputSize = domain.length / 2;
      var outputSize = range.length / 2;

      domain = toMultiArray(domain);
      range = toMultiArray(range);

      var size = dict.get('Size');
      var bps = dict.get('BitsPerSample');
      var order = dict.get('Order');
      if (!order)
        order = 1;
      if (order !== 1)
        error('No support for cubic spline interpolation: ' + order);

      var encode = dict.get('Encode');
      if (!encode) {
        encode = [];
        for (var i = 0; i < inputSize; ++i) {
          encode.push(0);
          encode.push(size[i] - 1);
        }
      }
      encode = toMultiArray(encode);

      var decode = dict.get('Decode');
      if (!decode)
        decode = range;
      else
        decode = toMultiArray(decode);

      // Precalc the multipliers
      var inputMul = new Float64Array(inputSize);
      for (var i = 0; i < inputSize; ++i) {
        inputMul[i] = (encode[i][1] - encode[i][0]) /
                  (domain[i][1] - domain[i][0]);
      }

      var idxMul = new Int32Array(inputSize);
      idxMul[0] = outputSize;
      for (i = 1; i < inputSize; ++i) {
        idxMul[i] = idxMul[i - 1] * size[i - 1];
      }

      var nSamples = outputSize;
      for (i = 0; i < inputSize; ++i)
          nSamples *= size[i];

      var samples = this.getSampleArray(size, outputSize, bps, str);

      return [
        CONSTRUCT_SAMPLED, inputSize, domain, encode, decode, samples, size,
        outputSize, bps, range, inputMul, idxMul, nSamples
      ];
    },

    constructSampledFromIR: function pdfFunctionConstructSampledFromIR(IR) {
      var inputSize = IR[1];
      var domain = IR[2];
      var encode = IR[3];
      var decode = IR[4];
      var samples = IR[5];
      var size = IR[6];
      var outputSize = IR[7];
      var bps = IR[8];
      var range = IR[9];
      var inputMul = IR[10];
      var idxMul = IR[11];
      var nSamples = IR[12];

      return function constructSampledFromIRResult(args) {
        if (inputSize != args.length)
          error('Incorrect number of arguments: ' + inputSize + ' != ' +
                args.length);
        // Most of the below is a port of Poppler's implementation.
        // TODO: There's a few other ways to do multilinear interpolation such
        // as piecewise, which is much faster but an approximation.
        var out = new Float64Array(outputSize);
        var x;
        var e = new Array(inputSize);
        var efrac0 = new Float64Array(inputSize);
        var efrac1 = new Float64Array(inputSize);
        var sBuf = new Float64Array(1 << inputSize);
        var i, j, k, idx, t;

        // map input values into sample array
        for (i = 0; i < inputSize; ++i) {
          x = (args[i] - domain[i][0]) * inputMul[i] + encode[i][0];
          if (x < 0) {
            x = 0;
          } else if (x > size[i] - 1) {
            x = size[i] - 1;
          }
          e[i] = [Math.floor(x), 0];
          if ((e[i][1] = e[i][0] + 1) >= size[i]) {
            // this happens if in[i] = domain[i][1]
            e[i][1] = e[i][0];
          }
          efrac1[i] = x - e[i][0];
          efrac0[i] = 1 - efrac1[i];
        }

        // for each output, do m-linear interpolation
        for (i = 0; i < outputSize; ++i) {

          // pull 2^m values out of the sample array
          for (j = 0; j < (1 << inputSize); ++j) {
            idx = i;
            for (k = 0, t = j; k < inputSize; ++k, t >>= 1) {
              idx += idxMul[k] * (e[k][t & 1]);
            }
            if (idx >= 0 && idx < nSamples) {
              sBuf[j] = samples[idx];
            } else {
              sBuf[j] = 0; // TODO Investigate if this is what Adobe does
            }
          }

          // do m sets of interpolations
          for (j = 0, t = (1 << inputSize); j < inputSize; ++j, t >>= 1) {
            for (k = 0; k < t; k += 2) {
              sBuf[k >> 1] = efrac0[j] * sBuf[k] + efrac1[j] * sBuf[k + 1];
            }
          }

          // map output value to range
          out[i] = (sBuf[0] * (decode[i][1] - decode[i][0]) + decode[i][0]);
          if (out[i] < range[i][0]) {
            out[i] = range[i][0];
          } else if (out[i] > range[i][1]) {
            out[i] = range[i][1];
          }
        }
        return out;
      }
    },

    constructInterpolated:
    function pdfFunctionConstructInterpolated(str, dict) {
      var c0 = dict.get('C0') || [0];
      var c1 = dict.get('C1') || [1];
      var n = dict.get('N');

      if (!isArray(c0) || !isArray(c1))
        error('Illegal dictionary for interpolated function');

      var length = c0.length;
      var diff = [];
      for (var i = 0; i < length; ++i)
        diff.push(c1[i] - c0[i]);

      return [CONSTRUCT_INTERPOLATED, c0, diff, n];
    },

    constructInterpolatedFromIR:
    function pdfFunctionconstructInterpolatedFromIR(IR) {
      var c0 = IR[1];
      var diff = IR[2];
      var n = IR[3];

      var length = diff.length;

      return function constructInterpolatedFromIRResult(args) {
        var x = n == 1 ? args[0] : Math.pow(args[0], n);

        var out = [];
        for (var j = 0; j < length; ++j)
          out.push(c0[j] + (x * diff[j]));

        return out;

      }
    },

    constructStiched: function pdfFunctionConstructStiched(fn, dict, xref) {
      var domain = dict.get('Domain');

      if (!domain)
        error('No domain');

      var inputSize = domain.length / 2;
      if (inputSize != 1)
        error('Bad domain for stiched function');

      var fnRefs = xref.fetchIfRef(dict.get('Functions'));
      var fns = [];
      for (var i = 0, ii = fnRefs.length; i < ii; ++i)
        fns.push(PDFFunction.getIR(xref, xref.fetchIfRef(fnRefs[i])));

      var bounds = xref.fetchIfRef(dict.get('Bounds'));
      var encode = xref.fetchIfRef(dict.get('Encode'));

      return [CONSTRUCT_STICHED, domain, bounds, encode, fns];
    },

    constructStichedFromIR: function pdfFunctionConstructStichedFromIR(IR) {
      var domain = IR[1];
      var bounds = IR[2];
      var encode = IR[3];
      var fnsIR = IR[4];
      var fns = [];

      for (var i = 0, ii = fnsIR.length; i < ii; i++) {
        fns.push(PDFFunction.fromIR(fnsIR[i]));
      }

      return function constructStichedFromIRResult(args) {
        var clip = function constructStichedFromIRClip(v, min, max) {
          if (v > max)
            v = max;
          else if (v < min)
            v = min;
          return v;
        };

        // clip to domain
        var v = clip(args[0], domain[0], domain[1]);
        // calulate which bound the value is in
        for (var i = 0, ii = bounds.length; i < ii; ++i) {
          if (v < bounds[i])
            break;
        }

        // encode value into domain of function
        var dmin = domain[0];
        if (i > 0)
          dmin = bounds[i - 1];
        var dmax = domain[1];
        if (i < bounds.length)
          dmax = bounds[i];

        var rmin = encode[2 * i];
        var rmax = encode[2 * i + 1];

        var v2 = rmin + (v - dmin) * (rmax - rmin) / (dmax - dmin);

        // call the appropropriate function
        return fns[i]([v2]);
      };
    },

    constructPostScript: function pdfFunctionConstructPostScript(fn, dict,
                                                                  xref) {
      var domain = dict.get('Domain');
      var range = dict.get('Range');

      if (!domain)
        error('No domain.');

      if (!range)
        error('No range.');

      var lexer = new PostScriptLexer(fn);
      var parser = new PostScriptParser(lexer);
      var code = parser.parse();

      return [CONSTRUCT_POSTSCRIPT, domain, range, code];
    },

    constructPostScriptFromIR:
                          function pdfFunctionConstructPostScriptFromIR(IR) {
      var domain = IR[1];
      var range = IR[2];
      var code = IR[3];
      var numOutputs = range.length / 2;
      var evaluator = new PostScriptEvaluator(code);
      // Cache the values for a big speed up, the cache size is limited though
      // since the number of possible values can be huge from a PS function.
      var cache = new FunctionCache();
      return function constructPostScriptFromIRResult(args) {
        var initialStack = [];
        for (var i = 0, ii = (domain.length / 2); i < ii; ++i) {
          initialStack.push(args[i]);
        }

        var key = initialStack.join('_');
        if (cache.has(key))
          return cache.get(key);

        var stack = evaluator.execute(initialStack);
        var transformed = new Array(numOutputs);
        for (i = numOutputs - 1; i >= 0; --i) {
          var out = stack.pop();
          var rangeIndex = 2 * i;
          if (out < range[rangeIndex])
            out = range[rangeIndex];
          else if (out > range[rangeIndex + 1])
            out = range[rangeIndex + 1];
          transformed[i] = out;
        }
        cache.set(key, transformed);
        return transformed;
      };
    }
  };
})();

var FunctionCache = (function FunctionCacheClosure() {
  // Of 10 PDF's with type4 functions the maxium number of distinct values seen
  // was 256. This still may need some tweaking in the future though.
  var MAX_CACHE_SIZE = 1024;
  function FunctionCache() {
    this.cache = {};
    this.total = 0;
  }
  FunctionCache.prototype = {
    has: function has(key) {
      return key in this.cache;
    },
    get: function get(key) {
      return this.cache[key];
    },
    set: function set(key, value) {
      if (this.total < MAX_CACHE_SIZE) {
        this.cache[key] = value;
        this.total++;
      }
    }
  };
  return FunctionCache;
})();

var PostScriptStack = (function PostScriptStackClosure() {
  var MAX_STACK_SIZE = 100;
  function PostScriptStack(initialStack) {
    this.stack = initialStack || [];
  }

  PostScriptStack.prototype = {
    push: function push(value) {
      if (this.stack.length >= MAX_STACK_SIZE)
        error('PostScript function stack overflow.');
      this.stack.push(value);
    },
    pop: function pop() {
      if (this.stack.length <= 0)
        error('PostScript function stack underflow.');
      return this.stack.pop();
    },
    copy: function copy(n) {
      if (this.stack.length + n >= MAX_STACK_SIZE)
        error('PostScript function stack overflow.');
      var stack = this.stack;
      for (var i = stack.length - n, j = n - 1; j >= 0; j--, i++)
        stack.push(stack[i]);
    },
    index: function index(n) {
      this.push(this.stack[this.stack.length - n - 1]);
    },
    // rotate the last n stack elements p times
    roll: function roll(n, p) {
      var stack = this.stack;
      var l = stack.length - n;
      var r = stack.length - 1, c = l + (p - Math.floor(p / n) * n), i, j, t;
      for (i = l, j = r; i < j; i++, j--) {
        t = stack[i]; stack[i] = stack[j]; stack[j] = t;
      }
      for (i = l, j = c - 1; i < j; i++, j--) {
        t = stack[i]; stack[i] = stack[j]; stack[j] = t;
      }
      for (i = c, j = r; i < j; i++, j--) {
        t = stack[i]; stack[i] = stack[j]; stack[j] = t;
      }
    }
  };
  return PostScriptStack;
})();
var PostScriptEvaluator = (function PostScriptEvaluatorClosure() {
  function PostScriptEvaluator(operators, operands) {
    this.operators = operators;
    this.operands = operands;
  }
  PostScriptEvaluator.prototype = {
    execute: function execute(initialStack) {
      var stack = new PostScriptStack(initialStack);
      var counter = 0;
      var operators = this.operators;
      var length = operators.length;
      var operator, a, b;
      while (counter < length) {
        operator = operators[counter++];
        if (typeof operator == 'number') {
          // Operator is really an operand and should be pushed to the stack.
          stack.push(operator);
          continue;
        }
        switch (operator) {
          // non standard ps operators
          case 'jz': // jump if false
            b = stack.pop();
            a = stack.pop();
            if (!a)
              counter = b;
            break;
          case 'j': // jump
            a = stack.pop();
            counter = a;
            break;

          // all ps operators in alphabetical order (excluding if/ifelse)
          case 'abs':
            a = stack.pop();
            stack.push(Math.abs(a));
            break;
          case 'add':
            b = stack.pop();
            a = stack.pop();
            stack.push(a + b);
            break;
          case 'and':
            b = stack.pop();
            a = stack.pop();
            if (isBool(a) && isBool(b))
              stack.push(a && b);
            else
              stack.push(a & b);
            break;
          case 'atan':
            a = stack.pop();
            stack.push(Math.atan(a));
            break;
          case 'bitshift':
            b = stack.pop();
            a = stack.pop();
            if (a > 0)
              stack.push(a << b);
            else
              stack.push(a >> b);
            break;
          case 'ceiling':
            a = stack.pop();
            stack.push(Math.ceil(a));
            break;
          case 'copy':
            a = stack.pop();
            stack.copy(a);
            break;
          case 'cos':
            a = stack.pop();
            stack.push(Math.cos(a));
            break;
          case 'cvi':
            a = stack.pop() | 0;
            stack.push(a);
            break;
          case 'cvr':
            // noop
            break;
          case 'div':
            b = stack.pop();
            a = stack.pop();
            stack.push(a / b);
            break;
          case 'dup':
            stack.copy(1);
            break;
          case 'eq':
            b = stack.pop();
            a = stack.pop();
            stack.push(a == b);
            break;
          case 'exch':
            stack.roll(2, 1);
            break;
          case 'exp':
            b = stack.pop();
            a = stack.pop();
            stack.push(Math.pow(a, b));
            break;
          case 'false':
            stack.push(false);
            break;
          case 'floor':
            a = stack.pop();
            stack.push(Math.floor(a));
            break;
          case 'ge':
            b = stack.pop();
            a = stack.pop();
            stack.push(a >= b);
            break;
          case 'gt':
            b = stack.pop();
            a = stack.pop();
            stack.push(a > b);
            break;
          case 'idiv':
            b = stack.pop();
            a = stack.pop();
            stack.push((a / b) | 0);
            break;
          case 'index':
            a = stack.pop();
            stack.index(a);
            break;
          case 'le':
            b = stack.pop();
            a = stack.pop();
            stack.push(a <= b);
            break;
          case 'ln':
            a = stack.pop();
            stack.push(Math.log(a));
            break;
          case 'log':
            a = stack.pop();
            stack.push(Math.log(a) / Math.LN10);
            break;
          case 'lt':
            b = stack.pop();
            a = stack.pop();
            stack.push(a < b);
            break;
          case 'mod':
            b = stack.pop();
            a = stack.pop();
            stack.push(a % b);
            break;
          case 'mul':
            b = stack.pop();
            a = stack.pop();
            stack.push(a * b);
            break;
          case 'ne':
            b = stack.pop();
            a = stack.pop();
            stack.push(a != b);
            break;
          case 'neg':
            a = stack.pop();
            stack.push(-b);
            break;
          case 'not':
            a = stack.pop();
            if (isBool(a) && isBool(b))
              stack.push(a && b);
            else
              stack.push(a & b);
            break;
          case 'or':
            b = stack.pop();
            a = stack.pop();
            if (isBool(a) && isBool(b))
              stack.push(a || b);
            else
              stack.push(a | b);
            break;
          case 'pop':
            stack.pop();
            break;
          case 'roll':
            b = stack.pop();
            a = stack.pop();
            stack.roll(a, b);
            break;
          case 'round':
            a = stack.pop();
            stack.push(Math.round(a));
            break;
          case 'sin':
            a = stack.pop();
            stack.push(Math.sin(a));
            break;
          case 'sqrt':
            a = stack.pop();
            stack.push(Math.sqrt(a));
            break;
          case 'sub':
            b = stack.pop();
            a = stack.pop();
            stack.push(a - b);
            break;
          case 'true':
            stack.push(true);
            break;
          case 'truncate':
            a = stack.pop();
            a = a < 0 ? Math.ceil(a) : Math.floor(a);
            stack.push(a);
            break;
          case 'xor':
            b = stack.pop();
            a = stack.pop();
            if (isBool(a) && isBool(b))
              stack.push(a != b);
            else
              stack.push(a ^ b);
            break;
          default:
            error('Unknown operator ' + operator);
            break;
        }
      }
      return stack.stack;
    }
  };
  return PostScriptEvaluator;
})();

var PostScriptParser = (function PostScriptParserClosure() {
  function PostScriptParser(lexer) {
    this.lexer = lexer;
    this.operators = [];
    this.token;
    this.prev;
  }
  PostScriptParser.prototype = {
    nextToken: function nextToken() {
      this.prev = this.token;
      this.token = this.lexer.getToken();
    },
    accept: function accept(type) {
      if (this.token.type == type) {
        this.nextToken();
        return true;
      }
      return false;
    },
    expect: function expect(type) {
      if (this.accept(type))
        return true;
      error('Unexpected symbol: found ' + this.token.type + ' expected ' +
            type + '.');
    },
    parse: function parse() {
      this.nextToken();
      this.expect(PostScriptTokenTypes.LBRACE);
      this.parseBlock();
      this.expect(PostScriptTokenTypes.RBRACE);
      return this.operators;
    },
    parseBlock: function parseBlock() {
      while (true) {
        if (this.accept(PostScriptTokenTypes.NUMBER)) {
          this.operators.push(this.prev.value);
        } else if (this.accept(PostScriptTokenTypes.OPERATOR)) {
          this.operators.push(this.prev.value);
        } else if (this.accept(PostScriptTokenTypes.LBRACE)) {
          this.parseCondition();
        } else {
          return;
        }
      }
    },
    parseCondition: function parseCondition() {
      // Add two place holders that will be updated later
      var conditionLocation = this.operators.length;
      this.operators.push(null, null);

      this.parseBlock();
      this.expect(PostScriptTokenTypes.RBRACE);
      if (this.accept(PostScriptTokenTypes.IF)) {
        // The true block is right after the 'if' so it just falls through on
        // true else it jumps and skips the true block.
        this.operators[conditionLocation] = this.operators.length;
        this.operators[conditionLocation + 1] = 'jz';
      } else if (this.accept(PostScriptTokenTypes.LBRACE)) {
        var jumpLocation = this.operators.length;
        this.operators.push(null, null);
        var endOfTrue = this.operators.length;
        this.parseBlock();
        this.expect(PostScriptTokenTypes.RBRACE);
        this.expect(PostScriptTokenTypes.IFELSE);
        // The jump is added at the end of the true block to skip the false
        // block.
        this.operators[jumpLocation] = this.operators.length;
        this.operators[jumpLocation + 1] = 'j';

        this.operators[conditionLocation] = endOfTrue;
        this.operators[conditionLocation + 1] = 'jz';
      } else {
        error('PS Function: error parsing conditional.');
      }
    }
  };
  return PostScriptParser;
})();

var PostScriptTokenTypes = {
  LBRACE: 0,
  RBRACE: 1,
  NUMBER: 2,
  OPERATOR: 3,
  IF: 4,
  IFELSE: 5
};

var PostScriptToken = (function PostScriptTokenClosure() {
  function PostScriptToken(type, value) {
    this.type = type;
    this.value = value;
  }

  var opCache = {};

  PostScriptToken.getOperator = function getOperator(op) {
    var opValue = opCache[op];
    if (opValue)
      return opValue;

    return opCache[op] = new PostScriptToken(PostScriptTokenTypes.OPERATOR, op);
  };

  PostScriptToken.LBRACE = new PostScriptToken(PostScriptTokenTypes.LBRACE,
                                                '{');
  PostScriptToken.RBRACE = new PostScriptToken(PostScriptTokenTypes.RBRACE,
                                                '}');
  PostScriptToken.IF = new PostScriptToken(PostScriptTokenTypes.IF, 'IF');
  PostScriptToken.IFELSE = new PostScriptToken(PostScriptTokenTypes.IFELSE,
                                                'IFELSE');
  return PostScriptToken;
})();

var PostScriptLexer = (function PostScriptLexerClosure() {
  function PostScriptLexer(stream) {
    this.stream = stream;
  }
  PostScriptLexer.prototype = {
    getToken: function getToken() {
      var s = '';
      var ch;
      var comment = false;
      var stream = this.stream;

      // skip comments
      while (true) {
        if (!(ch = stream.getChar()))
          return EOF;

        if (comment) {
          if (ch == '\x0a' || ch == '\x0d')
            comment = false;
        } else if (ch == '%') {
          comment = true;
        } else if (!Lexer.isSpace(ch)) {
          break;
        }
      }
      switch (ch) {
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
        case '+': case '-': case '.':
          return new PostScriptToken(PostScriptTokenTypes.NUMBER,
                                      this.getNumber(ch));
        case '{':
          return PostScriptToken.LBRACE;
        case '}':
          return PostScriptToken.RBRACE;
      }
      // operator
      var str = ch.toLowerCase();
      while (true) {
        ch = stream.lookChar().toLowerCase();
        if (ch >= 'a' && ch <= 'z')
          str += ch;
        else
          break;
        stream.skip();
      }
      switch (str) {
        case 'if':
          return PostScriptToken.IF;
        case 'ifelse':
          return PostScriptToken.IFELSE;
        default:
          return PostScriptToken.getOperator(str);
      }
    },
    getNumber: function getNumber(ch) {
      var str = ch;
      var stream = this.stream;
      while (true) {
        ch = stream.lookChar();
        if ((ch >= '0' && ch <= '9') || ch == '-' || ch == '.')
          str += ch;
        else
          break;
        stream.skip();
      }
      var value = parseFloat(str);
      if (isNaN(value))
        error('Invalid floating point number: ' + value);
      return value;
    }
  };
  return PostScriptLexer;
})();

