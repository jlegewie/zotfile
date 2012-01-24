/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var PatternType = {
  AXIAL: 2,
  RADIAL: 3
};

var Pattern = (function PatternClosure() {
  // Constructor should define this.getPattern
  function Pattern() {
    error('should not call Pattern constructor');
  }

  Pattern.prototype = {
    // Input: current Canvas context
    // Output: the appropriate fillStyle or strokeStyle
    getPattern: function pattern_getStyle(ctx) {
      error('Should not call Pattern.getStyle: ' + ctx);
    }
  };

  Pattern.shadingFromIR = function pattern_shadingFromIR(ctx, raw) {
    return Shadings[raw[0]].fromIR(ctx, raw);
  };

  Pattern.parseShading = function pattern_shading(shading, matrix, xref,
                                                      res, ctx) {

    var dict = isStream(shading) ? shading.dict : shading;
    var type = dict.get('ShadingType');

    switch (type) {
      case PatternType.AXIAL:
      case PatternType.RADIAL:
        // Both radial and axial shadings are handled by RadialAxial shading.
        return new Shadings.RadialAxial(dict, matrix, xref, res, ctx);
      default:
        return new Shadings.Dummy();
    }
  };
  return Pattern;
})();

var Shadings = {};

// Radial and axial shading have very similar implementations
// If needed, the implementations can be broken into two classes
Shadings.RadialAxial = (function RadialAxialClosure() {
  function RadialAxial(dict, matrix, xref, res, ctx) {
    this.matrix = matrix;
    this.coordsArr = dict.get('Coords');
    this.shadingType = dict.get('ShadingType');
    this.type = 'Pattern';

    this.ctx = ctx;
    var cs = dict.get('ColorSpace', 'CS');
    cs = ColorSpace.parse(cs, xref, res);
    this.cs = cs;

    var t0 = 0.0, t1 = 1.0;
    if (dict.has('Domain')) {
      var domainArr = dict.get('Domain');
      t0 = domainArr[0];
      t1 = domainArr[1];
    }

    var extendStart = false, extendEnd = false;
    if (dict.has('Extend')) {
      var extendArr = dict.get('Extend');
      extendStart = extendArr[0];
      extendEnd = extendArr[1];
      TODO('Support extend');
    }

    this.extendStart = extendStart;
    this.extendEnd = extendEnd;

    var fnObj = dict.get('Function');
    fnObj = xref.fetchIfRef(fnObj);
    if (isArray(fnObj))
      error('No support for array of functions');
    else if (!isPDFFunction(fnObj))
      error('Invalid function');
    var fn = PDFFunction.parse(xref, fnObj);

    // 10 samples seems good enough for now, but probably won't work
    // if there are sharp color changes. Ideally, we would implement
    // the spec faithfully and add lossless optimizations.
    var step = (t1 - t0) / 10;
    var diff = t1 - t0;

    var colorStops = [];
    for (var i = t0; i <= t1; i += step) {
      var rgbColor = cs.getRgb(fn([i]));
      var cssColor = Util.makeCssRgb(rgbColor[0], rgbColor[1], rgbColor[2]);
      colorStops.push([(i - t0) / diff, cssColor]);
    }

    this.colorStops = colorStops;
  }

  RadialAxial.fromIR = function radialAxialShadingGetIR(ctx, raw) {
    var type = raw[1];
    var colorStops = raw[2];
    var p0 = raw[3];
    var p1 = raw[4];
    var r0 = raw[5];
    var r1 = raw[6];

    var curMatrix = ctx.mozCurrentTransform;
    if (curMatrix) {
      var userMatrix = ctx.mozCurrentTransformInverse;

      p0 = Util.applyTransform(p0, curMatrix);
      p0 = Util.applyTransform(p0, userMatrix);

      p1 = Util.applyTransform(p1, curMatrix);
      p1 = Util.applyTransform(p1, userMatrix);
    }

    var grad;
    if (type == PatternType.AXIAL)
      grad = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
    else if (type == PatternType.RADIAL)
      grad = ctx.createRadialGradient(p0[0], p0[1], r0, p1[0], p1[1], r1);

    for (var i = 0, ii = colorStops.length; i < ii; ++i) {
      var c = colorStops[i];
      grad.addColorStop(c[0], c[1]);
    }
    return grad;
  };

  RadialAxial.prototype = {
    getIR: function radialAxialShadingGetIR() {
      var coordsArr = this.coordsArr;
      var type = this.shadingType;
      if (type == PatternType.AXIAL) {
        var p0 = [coordsArr[0], coordsArr[1]];
        var p1 = [coordsArr[2], coordsArr[3]];
        var r0 = null;
        var r1 = null;
      } else if (type == PatternType.RADIAL) {
        var p0 = [coordsArr[0], coordsArr[1]];
        var p1 = [coordsArr[3], coordsArr[4]];
        var r0 = coordsArr[2];
        var r1 = coordsArr[5];
      } else {
        error('getPattern type unknown: ' + type);
      }

      var matrix = this.matrix;
      if (matrix) {
        p0 = Util.applyTransform(p0, matrix);
        p1 = Util.applyTransform(p1, matrix);
      }

      return ['RadialAxial', type, this.colorStops, p0, p1, r0, r1];
    }
  };

  return RadialAxial;
})();

Shadings.Dummy = (function DummyClosure() {
  function Dummy() {
    this.type = 'Pattern';
  }

  Dummy.fromIR = function dummyShadingFromIR() {
    return 'hotpink';
  };

  Dummy.prototype = {
    getIR: function dummyShadingGetIR() {
      return ['Dummy'];
    }
  };
  return Dummy;
})();

var TilingPattern = (function TilingPatternClosure() {
  var PaintType = {
    COLORED: 1,
    UNCOLORED: 2
  };
  var MAX_PATTERN_SIZE = 512;

  function TilingPattern(IR, color, ctx, objs) {
    var IRQueue = IR[2];
    this.matrix = IR[3];
    var bbox = IR[4];
    var xstep = IR[5];
    var ystep = IR[6];
    var paintType = IR[7];

    TODO('TilingType');

    this.curMatrix = ctx.mozCurrentTransform;
    this.invMatrix = ctx.mozCurrentTransformInverse;
    this.ctx = ctx;
    this.type = 'Pattern';

    var x0 = bbox[0], y0 = bbox[1], x1 = bbox[2], y1 = bbox[3];

    var topLeft = [x0, y0];
    // we want the canvas to be as large as the step size
    var botRight = [x0 + xstep, y0 + ystep];

    var width = botRight[0] - topLeft[0];
    var height = botRight[1] - topLeft[1];

    // TODO: hack to avoid OOM, we would ideally compute the tiling
    // pattern to be only as large as the acual size in device space
    // This could be computed with .mozCurrentTransform, but still
    // needs to be implemented
    while (Math.abs(width) > MAX_PATTERN_SIZE ||
           Math.abs(height) > MAX_PATTERN_SIZE) {
      width = height = MAX_PATTERN_SIZE;
    }

    var tmpCanvas = new ScratchCanvas(width, height);

    // set the new canvas element context as the graphics context
    var tmpCtx = tmpCanvas.getContext('2d');
    var graphics = new CanvasGraphics(tmpCtx, objs);

    switch (paintType) {
      case PaintType.COLORED:
        tmpCtx.fillStyle = ctx.fillStyle;
        tmpCtx.strokeStyle = ctx.strokeStyle;
        break;
      case PaintType.UNCOLORED:
        var cssColor = Util.makeCssRgb(this, color[0], color[1], color[2]);
        tmpCtx.fillStyle = cssColor;
        tmpCtx.strokeStyle = cssColor;
        break;
      default:
        error('Unsupported paint type: ' + paintType);
    }

    var scale = [width / xstep, height / ystep];
    this.scale = scale;

    // transform coordinates to pattern space
    var tmpTranslate = [1, 0, 0, 1, -topLeft[0], -topLeft[1]];
    var tmpScale = [scale[0], 0, 0, scale[1], 0, 0];
    graphics.transform.apply(graphics, tmpScale);
    graphics.transform.apply(graphics, tmpTranslate);

    if (bbox && isArray(bbox) && 4 == bbox.length) {
      var bboxWidth = x1 - x0;
      var bboxHeight = y1 - y0;
      graphics.rectangle(x0, y0, bboxWidth, bboxHeight);
      graphics.clip();
      graphics.endPath();
    }

    graphics.executeIRQueue(IRQueue);

    this.canvas = tmpCanvas;
  }

  TilingPattern.getIR = function tiling_getIR(codeIR, dict, args) {
    var matrix = dict.get('Matrix');
    var bbox = dict.get('BBox');
    var xstep = dict.get('XStep');
    var ystep = dict.get('YStep');
    var paintType = dict.get('PaintType');

    return [
      'TilingPattern', args, codeIR, matrix, bbox, xstep, ystep, paintType
    ];
  };

  TilingPattern.prototype = {
    getPattern: function tiling_getPattern() {
      var matrix = this.matrix;
      var curMatrix = this.curMatrix;
      var ctx = this.ctx;

      if (curMatrix)
        ctx.setTransform.apply(ctx, curMatrix);

      if (matrix)
        ctx.transform.apply(ctx, matrix);

      var scale = this.scale;
      ctx.scale(1 / scale[0], 1 / scale[1]);

      return ctx.createPattern(this.canvas, 'repeat');
    }
  };

  return TilingPattern;
})();

