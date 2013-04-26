/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* globals ColorSpace, DeviceCmykCS, DeviceGrayCS, DeviceRgbCS, error,
           FONT_IDENTITY_MATRIX, IDENTITY_MATRIX, ImageData, isArray, isNum,
           isString, Pattern, TilingPattern, TODO, Util, warn, assert */

'use strict';

// <canvas> contexts store most of the state we need natively.
// However, PDF needs a bit more state, which we store here.

var TextRenderingMode = {
  FILL: 0,
  STROKE: 1,
  FILL_STROKE: 2,
  INVISIBLE: 3,
  FILL_ADD_TO_PATH: 4,
  STROKE_ADD_TO_PATH: 5,
  FILL_STROKE_ADD_TO_PATH: 6,
  ADD_TO_PATH: 7,
  ADD_TO_PATH_FLAG: 4
};

// Minimal font size that would be used during canvas fillText operations.
var MIN_FONT_SIZE = 1;

function createScratchCanvas(width, height) {
  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function addContextCurrentTransform(ctx) {
  // If the context doesn't expose a `mozCurrentTransform`, add a JS based on.
  if (!ctx.mozCurrentTransform) {
    // Store the original context
    ctx._scaleX = ctx._scaleX || 1.0;
    ctx._scaleY = ctx._scaleY || 1.0;
    ctx._originalSave = ctx.save;
    ctx._originalRestore = ctx.restore;
    ctx._originalRotate = ctx.rotate;
    ctx._originalScale = ctx.scale;
    ctx._originalTranslate = ctx.translate;
    ctx._originalTransform = ctx.transform;

    ctx._transformMatrix = [ctx._scaleX, 0, 0, ctx._scaleY, 0, 0];
    ctx._transformStack = [];

    Object.defineProperty(ctx, 'mozCurrentTransform', {
      get: function getCurrentTransform() {
        return this._transformMatrix;
      }
    });

    Object.defineProperty(ctx, 'mozCurrentTransformInverse', {
      get: function getCurrentTransformInverse() {
        // Calculation done using WolframAlpha:
        // http://www.wolframalpha.com/input/?
        //   i=Inverse+{{a%2C+c%2C+e}%2C+{b%2C+d%2C+f}%2C+{0%2C+0%2C+1}}

        var m = this._transformMatrix;
        var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5];

        var ad_bc = a * d - b * c;
        var bc_ad = b * c - a * d;

        return [
          d / ad_bc,
          b / bc_ad,
          c / bc_ad,
          a / ad_bc,
          (d * e - c * f) / bc_ad,
          (b * e - a * f) / ad_bc
        ];
      }
    });

    ctx.save = function ctxSave() {
      var old = this._transformMatrix;
      this._transformStack.push(old);
      this._transformMatrix = old.slice(0, 6);

      this._originalSave();
    };

    ctx.restore = function ctxRestore() {
      var prev = this._transformStack.pop();
      if (prev) {
        this._transformMatrix = prev;
        this._originalRestore();
      }
    };

    ctx.translate = function ctxTranslate(x, y) {
      var m = this._transformMatrix;
      m[4] = m[0] * x + m[2] * y + m[4];
      m[5] = m[1] * x + m[3] * y + m[5];

      this._originalTranslate(x, y);
    };

    ctx.scale = function ctxScale(x, y) {
      var m = this._transformMatrix;
      m[0] = m[0] * x;
      m[1] = m[1] * x;
      m[2] = m[2] * y;
      m[3] = m[3] * y;

      this._originalScale(x, y);
    };

    ctx.transform = function ctxTransform(a, b, c, d, e, f) {
      var m = this._transformMatrix;
      this._transformMatrix = [
        m[0] * a + m[2] * b,
        m[1] * a + m[3] * b,
        m[0] * c + m[2] * d,
        m[1] * c + m[3] * d,
        m[0] * e + m[2] * f + m[4],
        m[1] * e + m[3] * f + m[5]
      ];

      ctx._originalTransform(a, b, c, d, e, f);
    };

    ctx.rotate = function ctxRotate(angle) {
      var cosValue = Math.cos(angle);
      var sinValue = Math.sin(angle);

      var m = this._transformMatrix;
      this._transformMatrix = [
        m[0] * cosValue + m[2] * sinValue,
        m[1] * cosValue + m[3] * sinValue,
        m[0] * (-sinValue) + m[2] * cosValue,
        m[1] * (-sinValue) + m[3] * cosValue,
        m[4],
        m[5]
      ];

      this._originalRotate(angle);
    };
  }
}

var CanvasExtraState = (function CanvasExtraStateClosure() {
  function CanvasExtraState(old) {
    // Are soft masks and alpha values shapes or opacities?
    this.alphaIsShape = false;
    this.fontSize = 0;
    this.fontSizeScale = 1;
    this.textMatrix = IDENTITY_MATRIX;
    this.fontMatrix = FONT_IDENTITY_MATRIX;
    this.leading = 0;
    // Current point (in user coordinates)
    this.x = 0;
    this.y = 0;
    // Start of text line (in text coordinates)
    this.lineX = 0;
    this.lineY = 0;
    // Character and word spacing
    this.charSpacing = 0;
    this.wordSpacing = 0;
    this.textHScale = 1;
    this.textRenderingMode = TextRenderingMode.FILL;
    this.textRise = 0;
    // Color spaces
    this.fillColorSpace = new DeviceGrayCS();
    this.fillColorSpaceObj = null;
    this.strokeColorSpace = new DeviceGrayCS();
    this.strokeColorSpaceObj = null;
    this.fillColorObj = null;
    this.strokeColorObj = null;
    // Default fore and background colors
    this.fillColor = '#000000';
    this.strokeColor = '#000000';
    // Note: fill alpha applies to all non-stroking operations
    this.fillAlpha = 1;
    this.strokeAlpha = 1;
    this.lineWidth = 1;
    this.paintFormXObjectDepth = 0;

    this.old = old;
  }

  CanvasExtraState.prototype = {
    clone: function CanvasExtraState_clone() {
      return Object.create(this);
    },
    setCurrentPoint: function CanvasExtraState_setCurrentPoint(x, y) {
      this.x = x;
      this.y = y;
    }
  };
  return CanvasExtraState;
})();

var CanvasGraphics = (function CanvasGraphicsClosure() {
  // Defines the time the executeOperatorList is going to be executing
  // before it stops and shedules a continue of execution.
  var EXECUTION_TIME = 15;

  function CanvasGraphics(canvasCtx, commonObjs, objs, textLayer, imageLayer, annotations) {
    this.ctx = canvasCtx;
    this.current = new CanvasExtraState();
    this.stateStack = [];
    this.pendingClip = null;
    this.res = null;
    this.xobjs = null;
    this.commonObjs = commonObjs;
    this.objs = objs;
    this.textLayer = textLayer;
    this.annotations = annotations;
    this.imageLayer = imageLayer;
    this.groupStack = [];
    if (canvasCtx) {
      addContextCurrentTransform(canvasCtx);
    }
  }

  function applyStencilMask(imgArray, width, height, inverseDecode, buffer) {
    var imgArrayPos = 0;
    var i, j, mask, buf;
    // removing making non-masked pixels transparent
    var bufferPos = 3; // alpha component offset
    for (i = 0; i < height; i++) {
      mask = 0;
      for (j = 0; j < width; j++) {
        if (!mask) {
          buf = imgArray[imgArrayPos++];
          mask = 128;
        }
        if (!(buf & mask) === inverseDecode) {
          buffer[bufferPos] = 0;
        }
        bufferPos += 4;
        mask >>= 1;
      }
    }
  }

  function putBinaryImageData(ctx, data, w, h) {
    var tmpImgData = 'createImageData' in ctx ? ctx.createImageData(w, h) :
      ctx.getImageData(0, 0, w, h);

    var tmpImgDataPixels = tmpImgData.data;
    if ('set' in tmpImgDataPixels)
      tmpImgDataPixels.set(data);
    else {
      // Copy over the imageData pixel by pixel.
      for (var i = 0, ii = tmpImgDataPixels.length; i < ii; i++)
        tmpImgDataPixels[i] = data[i];
    }

    ctx.putImageData(tmpImgData, 0, 0);
  }

  function prescaleImage(pixels, width, height, widthScale, heightScale) {
    pixels = new Uint8Array(pixels); // creating a copy
    while (widthScale > 2 || heightScale > 2) {
      if (heightScale > 2) {
        // scaling image twice vertically
        var rowSize = width * 4;
        var k = 0, l = 0;
        for (var i = 0; i < height - 1; i += 2) {
          for (var j = 0; j < width; j++) {
            var alpha1 = pixels[k + 3], alpha2 = pixels[k + 3 + rowSize];
            if (alpha1 === alpha2) {
              pixels[l] = (pixels[k] + pixels[k + rowSize]) >> 1;
              pixels[l + 1] = (pixels[k + 1] + pixels[k + 1 + rowSize]) >> 1;
              pixels[l + 2] = (pixels[k + 2] + pixels[k + 2 + rowSize]) >> 1;
              pixels[l + 3] = alpha1;
            } else if (alpha1 < alpha2) {
              var d = 256 - alpha2 + alpha1;
              pixels[l] = (pixels[k] * d + (pixels[k + rowSize] << 8)) >> 9;
              pixels[l + 1] = (pixels[k + 1] * d +
                              (pixels[k + 1 + rowSize] << 8)) >> 9;
              pixels[l + 2] = (pixels[k + 2] * d +
                              (pixels[k + 2 + rowSize] << 8)) >> 9;
              pixels[l + 3] = alpha2;
            } else {
              var d = 256 - alpha1 + alpha2;
              pixels[l] = ((pixels[k] << 8) + pixels[k + rowSize] * d) >> 9;
              pixels[l + 1] = ((pixels[k + 1] << 8) +
                              pixels[k + 1 + rowSize] * d) >> 9;
              pixels[l + 2] = ((pixels[k + 2] << 8) +
                              pixels[k + 2 + rowSize] * d) >> 9;
              pixels[l + 3] = alpha1;
            }
            k += 4; l += 4;
          }
          k += rowSize;
        }
        if (height & 1) {
          for (var i = 0; i < rowSize; i++) {
            pixels[l++] = pixels[k++];
          }
        }
        height = (height + 1) >> 1;
        heightScale /= 2;
      }
      if (widthScale > 2) {
        // scaling image twice horizontally
        var k = 0, l = 0;
        for (var i = 0; i < height; i++) {
          for (var j = 0; j < width - 1; j += 2) {
            var alpha1 = pixels[k + 3], alpha2 = pixels[k + 7];
            if (alpha1 === alpha2) {
              pixels[l] = (pixels[k] + pixels[k + 4]) >> 1;
              pixels[l + 1] = (pixels[k + 1] + pixels[k + 5]) >> 1;
              pixels[l + 2] = (pixels[k + 2] + pixels[k + 6]) >> 1;
              pixels[l + 3] = alpha1;
            } else if (alpha1 < alpha2) {
              var d = 256 - alpha2 + alpha1;
              pixels[l] = (pixels[k] * d + (pixels[k + 4] << 8)) >> 9;
              pixels[l + 1] = (pixels[k + 1] * d + (pixels[k + 5] << 8)) >> 9;
              pixels[l + 2] = (pixels[k + 2] * d + (pixels[k + 6] << 8)) >> 9;
              pixels[l + 3] = alpha2;
            } else {
              var d = 256 - alpha1 + alpha2;
              pixels[l] = ((pixels[k] << 8) + pixels[k + 4] * d) >> 9;
              pixels[l + 1] = ((pixels[k + 1] << 8) + pixels[k + 5] * d) >> 9;
              pixels[l + 2] = ((pixels[k + 2] << 8) + pixels[k + 6] * d) >> 9;
              pixels[l + 3] = alpha1;
            }
            k += 8; l += 4;
          }
          if (width & 1) {
            pixels[l++] = pixels[k++];
            pixels[l++] = pixels[k++];
            pixels[l++] = pixels[k++];
            pixels[l++] = pixels[k++];
          }
        }
        width = (width + 1) >> 1;
        widthScale /= 2;
      }
    }

    var tmpCanvas = createScratchCanvas(width, height);
    var tmpCtx = tmpCanvas.getContext('2d');
    putBinaryImageData(tmpCtx, pixels.subarray(0, width * height * 4),
                               width, height);

    return tmpCanvas;
  }

  function copyCtxState(sourceCtx, destCtx) {
    var properties = ['strokeStyle', 'fillStyle', 'fillRule', 'globalAlpha',
                      'lineWidth', 'lineCap', 'lineJoin', 'miterLimit',
                      'globalCompositeOperation', 'font'];
    for (var i = 0, ii = properties.length; i < ii; i++) {
      var property = properties[i];
      if (property in sourceCtx) {
        destCtx[property] = sourceCtx[property];
      }
    }
    if ('setLineDash' in sourceCtx) {
      destCtx.setLineDash(sourceCtx.getLineDash());
      destCtx.lineDashOffset =  sourceCtx.lineDashOffset;
    } else if ('mozDash' in sourceCtx) {
      destCtx.mozDash = sourceCtx.mozDash;
      destCtx.mozDashOffset = sourceCtx.mozDashOffset;
    }
  }

  var LINE_CAP_STYLES = ['butt', 'round', 'square'];
  var LINE_JOIN_STYLES = ['miter', 'round', 'bevel'];
  var NORMAL_CLIP = {};
  var EO_CLIP = {};

  CanvasGraphics.prototype = {
    slowCommands: {
      'stroke': true,
      'closeStroke': true,
      'fill': true,
      'eoFill': true,
      'fillStroke': true,
      'eoFillStroke': true,
      'closeFillStroke': true,
      'closeEOFillStroke': true,
      'showText': true,
      'showSpacedText': true,
      'setStrokeColorSpace': true,
      'setFillColorSpace': true,
      'setStrokeColor': true,
      'setStrokeColorN': true,
      'setFillColor': true,
      'setFillColorN': true,
      'setStrokeGray': true,
      'setFillGray': true,
      'setStrokeRGBColor': true,
      'setFillRGBColor': true,
      'setStrokeCMYKColor': true,
      'setFillCMYKColor': true,
      'paintJpegXObject': true,
      'paintImageXObject': true,
      'paintInlineImageXObject': true,
      'paintInlineImageXObjectGroup': true,
      'paintImageMaskXObject': true,
      'paintImageMaskXObjectGroup': true,
      'shadingFill': true
    },

    beginDrawing: function CanvasGraphics_beginDrawing(viewport, transparency) {
      // For pdfs that use blend modes we have to clear the canvas else certain
      // blend modes can look wrong since we'd be blending with a white
      // backdrop. The problem with a transparent backdrop though is we then
      // don't get sub pixel anti aliasing on text, so we fill with white if
      // we can.
      var width = this.ctx.canvas.width;
      var height = this.ctx.canvas.height;
      if (transparency) {
        this.ctx.clearRect(0, 0, width, height);
      } else {
        this.ctx.mozOpaque = true;
        this.ctx.save();
        this.ctx.fillStyle = 'rgb(255, 255, 255)';
        this.ctx.fillRect(0, 0, width, height);
        this.ctx.restore();
      }

      var transform = viewport.transform;
      this.ctx.save();
      this.ctx.transform.apply(this.ctx, transform);

      // Record the user => device transformation so we can transform annotation
      // bounding boxes appropriately
      if (this.ctx.mozCurrentTransform) {
        this.ctx.user2dev = this.ctx.mozCurrentTransform.slice(0, 6);
      } else {
        this.ctx.user2dev = IDENTITY_MATRIX;        
      }

      if (this.textLayer) {
        this.textLayer.beginLayout();
      }
      if (this.imageLayer) {
        this.imageLayer.beginLayout();
      }
    },

    executeOperatorList: function CanvasGraphics_executeOperatorList(
                                    operatorList,
                                    executionStartIdx, continueCallback,
                                    stepper) {
      var argsArray = operatorList.argsArray;
      var fnArray = operatorList.fnArray;
      var i = executionStartIdx || 0;
      var argsArrayLen = argsArray.length;

      // Sometimes the OperatorList to execute is empty.
      if (argsArrayLen == i) {
        return i;
      }

      var executionEndIdx;
      var endTime = Date.now() + EXECUTION_TIME;

      var commonObjs = this.commonObjs;
      var objs = this.objs;
      var fnName;
      var slowCommands = this.slowCommands;

      while (true) {
        if (stepper && i === stepper.nextBreakPoint) {
          stepper.breakIt(i, continueCallback);
          return i;
        }

        fnName = fnArray[i];

        if (fnName !== 'dependency') {
          this[fnName].apply(this, argsArray[i]);
        } else {
          var deps = argsArray[i];
          for (var n = 0, nn = deps.length; n < nn; n++) {
            var depObjId = deps[n];
            var common = depObjId.substring(0, 2) == 'g_';

            // If the promise isn't resolved yet, add the continueCallback
            // to the promise and bail out.
            if (!common && !objs.isResolved(depObjId)) {
              objs.get(depObjId, continueCallback);
              return i;
            }
            if (common && !commonObjs.isResolved(depObjId)) {
              commonObjs.get(depObjId, continueCallback);
              return i;
            }
          }
        }

        i++;

        // If the entire operatorList was executed, stop as were done.
        if (i == argsArrayLen) {
          return i;
        }

        // If the execution took longer then a certain amount of time, shedule
        // to continue exeution after a short delay.
        // However, this is only possible if a 'continueCallback' is passed in.
        if (continueCallback && slowCommands[fnName] && Date.now() > endTime) {
          setTimeout(continueCallback, 0);
          return i;
        }

        // If the operatorList isn't executed completely yet OR the execution
        // time was short enough, do another execution round.
      }
    },

    endDrawing: function CanvasGraphics_endDrawing() {
      this.ctx.restore();

      if (this.textLayer) {
        this.textLayer.endLayout();
      }
      if (this.imageLayer) {
        this.imageLayer.endLayout();
      }
    },

    // Graphics state
    setLineWidth: function CanvasGraphics_setLineWidth(width) {
      this.current.lineWidth = width;
      this.ctx.lineWidth = width;
    },
    setLineCap: function CanvasGraphics_setLineCap(style) {
      this.ctx.lineCap = LINE_CAP_STYLES[style];
    },
    setLineJoin: function CanvasGraphics_setLineJoin(style) {
      this.ctx.lineJoin = LINE_JOIN_STYLES[style];
    },
    setMiterLimit: function CanvasGraphics_setMiterLimit(limit) {
      this.ctx.miterLimit = limit;
    },
    setDash: function CanvasGraphics_setDash(dashArray, dashPhase) {
      var ctx = this.ctx;
      if ('setLineDash' in ctx) {
        ctx.setLineDash(dashArray);
        ctx.lineDashOffset = dashPhase;
      } else {
        ctx.mozDash = dashArray;
        ctx.mozDashOffset = dashPhase;
      }
    },
    setRenderingIntent: function CanvasGraphics_setRenderingIntent(intent) {
      // Maybe if we one day fully support color spaces this will be important
      // for now we can ignore.
      // TODO set rendering intent?
    },
    setFlatness: function CanvasGraphics_setFlatness(flatness) {
      // There's no way to control this with canvas, but we can safely ignore.
      // TODO set flatness?
    },
    setGState: function CanvasGraphics_setGState(states) {
      for (var i = 0, ii = states.length; i < ii; i++) {
        var state = states[i];
        var key = state[0];
        var value = state[1];

        switch (key) {
          case 'LW':
            this.setLineWidth(value);
            break;
          case 'LC':
            this.setLineCap(value);
            break;
          case 'LJ':
            this.setLineJoin(value);
            break;
          case 'ML':
            this.setMiterLimit(value);
            break;
          case 'D':
            this.setDash(value[0], value[1]);
            break;
          case 'RI':
            this.setRenderingIntent(value);
            break;
          case 'FL':
            this.setFlatness(value);
            break;
          case 'Font':
            this.setFont(state[1], state[2]);
            break;
          case 'CA':
            this.current.strokeAlpha = state[1];
            break;
          case 'ca':
            this.current.fillAlpha = state[1];
            this.ctx.globalAlpha = state[1];
            break;
          case 'BM':
            if (value && value.name && (value.name !== 'Normal')) {
              var mode = value.name.replace(/([A-Z])/g,
                function(c) {
                  return '-' + c.toLowerCase();
                }
              ).substring(1);
              this.ctx.globalCompositeOperation = mode;
              if (this.ctx.globalCompositeOperation !== mode) {
                warn('globalCompositeOperation "' + mode +
                     '" is not supported');
              }
            } else {
              this.ctx.globalCompositeOperation = 'source-over';
            }
            break;
        }
      }
    },
    save: function CanvasGraphics_save() {
      this.ctx.save();
      var old = this.current;
      this.stateStack.push(old);
      this.current = old.clone();
    },
    restore: function CanvasGraphics_restore() {
      if ('textClipLayers' in this) {
        this.completeTextClipping();
      }

      var prev = this.stateStack.pop();
      if (prev) {
        this.current = prev;
        this.ctx.restore();
      }
    },
    transform: function CanvasGraphics_transform(a, b, c, d, e, f) {
      this.ctx.transform(a, b, c, d, e, f);
    },

    // Path
    moveTo: function CanvasGraphics_moveTo(x, y) {
      this.ctx.moveTo(x, y);
      this.current.setCurrentPoint(x, y);
    },
    lineTo: function CanvasGraphics_lineTo(x, y) {
      this.ctx.lineTo(x, y);
      this.current.setCurrentPoint(x, y);
    },
    curveTo: function CanvasGraphics_curveTo(x1, y1, x2, y2, x3, y3) {
      this.ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
      this.current.setCurrentPoint(x3, y3);
    },
    curveTo2: function CanvasGraphics_curveTo2(x2, y2, x3, y3) {
      var current = this.current;
      this.ctx.bezierCurveTo(current.x, current.y, x2, y2, x3, y3);
      current.setCurrentPoint(x3, y3);
    },
    curveTo3: function CanvasGraphics_curveTo3(x1, y1, x3, y3) {
      this.curveTo(x1, y1, x3, y3, x3, y3);
      this.current.setCurrentPoint(x3, y3);
    },
    closePath: function CanvasGraphics_closePath() {
      this.ctx.closePath();
    },
    rectangle: function CanvasGraphics_rectangle(x, y, width, height) {
      this.ctx.rect(x, y, width, height);
    },
    stroke: function CanvasGraphics_stroke(consumePath) {
      consumePath = typeof consumePath !== 'undefined' ? consumePath : true;
      var ctx = this.ctx;
      var strokeColor = this.current.strokeColor;
      if (this.current.lineWidth === 0)
        ctx.lineWidth = this.getSinglePixelWidth();
      // For stroke we want to temporarily change the global alpha to the
      // stroking alpha.
      ctx.globalAlpha = this.current.strokeAlpha;
      if (strokeColor && strokeColor.hasOwnProperty('type') &&
          strokeColor.type === 'Pattern') {
        // for patterns, we transform to pattern space, calculate
        // the pattern, call stroke, and restore to user space
        ctx.save();
        ctx.strokeStyle = strokeColor.getPattern(ctx);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.stroke();
      }
      if (consumePath)
        this.consumePath();
      // Restore the global alpha to the fill alpha
      ctx.globalAlpha = this.current.fillAlpha;
    },
    closeStroke: function CanvasGraphics_closeStroke() {
      this.closePath();
      this.stroke();
    },
    fill: function CanvasGraphics_fill(consumePath) {
      consumePath = typeof consumePath !== 'undefined' ? consumePath : true;
      var ctx = this.ctx;
      var fillColor = this.current.fillColor;

      if (fillColor && fillColor.hasOwnProperty('type') &&
          fillColor.type === 'Pattern') {
        ctx.save();
        ctx.fillStyle = fillColor.getPattern(ctx);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fill();
      }
      if (consumePath)
        this.consumePath();
    },
    eoFill: function CanvasGraphics_eoFill() {
      var savedFillRule = this.setEOFillRule();
      this.fill();
      this.restoreFillRule(savedFillRule);
    },
    fillStroke: function CanvasGraphics_fillStroke() {
      this.fill(false);
      this.stroke(false);

      this.consumePath();
    },
    eoFillStroke: function CanvasGraphics_eoFillStroke() {
      var savedFillRule = this.setEOFillRule();
      this.fillStroke();
      this.restoreFillRule(savedFillRule);
    },
    closeFillStroke: function CanvasGraphics_closeFillStroke() {
      this.closePath();
      this.fillStroke();
    },
    closeEOFillStroke: function CanvasGraphics_closeEOFillStroke() {
      var savedFillRule = this.setEOFillRule();
      this.closePath();
      this.fillStroke();
      this.restoreFillRule(savedFillRule);
    },
    endPath: function CanvasGraphics_endPath() {
      this.consumePath();
    },

    // Clipping
    clip: function CanvasGraphics_clip() {
      this.pendingClip = NORMAL_CLIP;
    },
    eoClip: function CanvasGraphics_eoClip() {
      this.pendingClip = EO_CLIP;
    },

    // Text
    beginText: function CanvasGraphics_beginText() {
      this.current.textMatrix = IDENTITY_MATRIX;
      this.current.x = this.current.lineX = 0;
      this.current.y = this.current.lineY = 0;
    },
    endText: function CanvasGraphics_endText() {
      if ('textClipLayers' in this) {
        this.swapImageForTextClipping();
      }
    },
    getCurrentTextClipping: function CanvasGraphics_getCurrentTextClipping() {
      var ctx = this.ctx;
      var transform = ctx.mozCurrentTransform;
      if ('textClipLayers' in this) {
        // we need to reset only font and transform
        var maskCtx = this.textClipLayers.maskCtx;
        maskCtx.setTransform.apply(maskCtx, transform);
        maskCtx.font = ctx.font;
        return maskCtx;
      }

      var canvasWidth = ctx.canvas.width;
      var canvasHeight = ctx.canvas.height;
      // keeping track of the text clipping of the separate canvas
      var maskCanvas = createScratchCanvas(canvasWidth, canvasHeight);
      var maskCtx = maskCanvas.getContext('2d');
      maskCtx.setTransform.apply(maskCtx, transform);
      maskCtx.font = ctx.font;
      var textClipLayers = {
        maskCanvas: maskCanvas,
        maskCtx: maskCtx
      };
      this.textClipLayers = textClipLayers;
      return maskCtx;
    },
    swapImageForTextClipping:
      function CanvasGraphics_swapImageForTextClipping() {
      var ctx = this.ctx;
      var canvasWidth = ctx.canvas.width;
      var canvasHeight = ctx.canvas.height;
      // saving current image content and clearing whole canvas
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      var data = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
      this.textClipLayers.imageData = data;
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.restore();
    },
    completeTextClipping: function CanvasGraphics_completeTextClipping() {
      var ctx = this.ctx;
      // applying mask to the image (result is saved in maskCanvas)
      var maskCtx = this.textClipLayers.maskCtx;
      maskCtx.setTransform(1, 0, 0, 1, 0, 0);
      maskCtx.globalCompositeOperation = 'source-in';
      maskCtx.drawImage(ctx.canvas, 0, 0);

      // restoring image data and applying the result of masked drawing
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.putImageData(this.textClipLayers.imageData, 0, 0);
      ctx.drawImage(this.textClipLayers.maskCanvas, 0, 0);
      ctx.restore();

      delete this.textClipLayers;
    },
    setCharSpacing: function CanvasGraphics_setCharSpacing(spacing) {
      this.current.charSpacing = spacing;
    },
    setWordSpacing: function CanvasGraphics_setWordSpacing(spacing) {
      this.current.wordSpacing = spacing;
    },
    setHScale: function CanvasGraphics_setHScale(scale) {
      this.current.textHScale = scale / 100;
    },
    setLeading: function CanvasGraphics_setLeading(leading) {
      this.current.leading = -leading;
    },
    setFont: function CanvasGraphics_setFont(fontRefName, size) {
      var fontObj = this.commonObjs.get(fontRefName);
      var current = this.current;

      if (!fontObj)
        error('Can\'t find font for ' + fontRefName);

      current.fontMatrix = fontObj.fontMatrix ? fontObj.fontMatrix :
                                                FONT_IDENTITY_MATRIX;

      // A valid matrix needs all main diagonal elements to be non-zero
      // This also ensures we bypass FF bugzilla bug #719844.
      if (current.fontMatrix[0] === 0 ||
          current.fontMatrix[3] === 0) {
        warn('Invalid font matrix for font ' + fontRefName);
      }

      // The spec for Tf (setFont) says that 'size' specifies the font 'scale',
      // and in some docs this can be negative (inverted x-y axes).
      if (size < 0) {
        size = -size;
        current.fontDirection = -1;
      } else {
        current.fontDirection = 1;
      }

      this.current.font = fontObj;
      this.current.fontSize = size;

      if (fontObj.coded)
        return; // we don't need ctx.font for Type3 fonts

      var name = fontObj.loadedName || 'sans-serif';
      var bold = fontObj.black ? (fontObj.bold ? 'bolder' : 'bold') :
                                 (fontObj.bold ? 'bold' : 'normal');

      var italic = fontObj.italic ? 'italic' : 'normal';
      var typeface = '"' + name + '", ' + fontObj.fallbackName;

      // Some font backends cannot handle fonts below certain size.
      // Keeping the font at minimal size and using the fontSizeScale to change
      // the current transformation matrix before the fillText/strokeText.
      // See https://bugzilla.mozilla.org/show_bug.cgi?id=726227
      var browserFontSize = size >= MIN_FONT_SIZE ? size : MIN_FONT_SIZE;
      this.current.fontSizeScale = browserFontSize != MIN_FONT_SIZE ? 1.0 :
                                   size / MIN_FONT_SIZE;

      var rule = italic + ' ' + bold + ' ' + browserFontSize + 'px ' + typeface;
      this.ctx.font = rule;
    },
    setTextRenderingMode: function CanvasGraphics_setTextRenderingMode(mode) {
      this.current.textRenderingMode = mode;
    },
    setTextRise: function CanvasGraphics_setTextRise(rise) {
      this.current.textRise = rise;
    },
    moveText: function CanvasGraphics_moveText(x, y) {
      this.current.x = this.current.lineX += x;
      this.current.y = this.current.lineY += y;
    },
    setLeadingMoveText: function CanvasGraphics_setLeadingMoveText(x, y) {
      this.setLeading(-y);
      this.moveText(x, y);
    },
    setTextMatrix: function CanvasGraphics_setTextMatrix(a, b, c, d, e, f) {
      this.current.textMatrix = [a, b, c, d, e, f];

      this.current.x = this.current.lineX = 0;
      this.current.y = this.current.lineY = 0;
    },
    nextLine: function CanvasGraphics_nextLine() {
      this.moveText(0, this.current.leading);
    },
    applyTextTransforms: function CanvasGraphics_applyTextTransforms() {
      var ctx = this.ctx;
      var current = this.current;
      ctx.transform.apply(ctx, current.textMatrix);
      ctx.translate(current.x, current.y + current.textRise);
      if (current.fontDirection > 0) {
        ctx.scale(current.textHScale, -1);
      } else {
        ctx.scale(-current.textHScale, 1);
      }
    },
    createTextGeometry: function CanvasGraphics_createTextGeometry() {
      var geometry = {};
      var ctx = this.ctx;
      var font = this.current.font;
      var ctxMatrix = ctx.mozCurrentTransform;
      if (ctxMatrix) {
        var bl = Util.applyTransform([0, 0], ctxMatrix);
        var tr = Util.applyTransform([1, 1], ctxMatrix);
        geometry.x = bl[0];
        geometry.y = bl[1];
        geometry.hScale = tr[0] - bl[0];
        geometry.vScale = tr[1] - bl[1];
      }
      geometry.spaceWidth = font.spaceWidth;
      geometry.fontName = font.loadedName;
      geometry.fontFamily = font.fallbackName;
      geometry.fontSize = this.current.fontSize;
      return geometry;
    },
    /** Compute the coordinates and width of the character given its width and
      * x-offset in font space, a font object, and a matrix used for transforming
      * from font space to device space. Returns an object with the character's
      * x, y, and width properties, and the width of a space in the given font,
      * all in device space.
      */
    makeCharDims: function canvasMakeCharDims(charWidth, xOffset, font, font2dev) {
      var xy = Util.applyTransform([xOffset, 0], font2dev);
      var w = Util.applyTransform([xOffset + charWidth, 0], font2dev);
      var dims = {x: xy[0], y: xy[1]};
      dims.width = Math.abs(xy[0] - w[0]);
      var spaceWidth = font.coded ? font.spaceWidth : font.spaceWidth * .001;
      var sw = Util.applyTransform([spaceWidth,0], font2dev);
      // TODO: why 2.0? I changed it to 3
      // dims.spaceWidth = (sw[0] - font2dev[4]) / 2.0;
      dims.spaceWidth = (sw[0] - font2dev[4]) / 3.0;      
      return dims;
    },
    /** Determines if character, with the given dimensions, falls within the
      * bounds of annotation annot. If so, returns the 0-based index of the quad
      * region within which the character falls. If the character is outside the
      * annotation, returns -1. */
    charInAnnot: function canvasCharInAnnot(annot, glyph, cdims, user2dev) {
      if (annot.type && (annot.type == 'Highlight' ||
                         annot.type == 'Underline')) {
        for (var i = 0; i < annot.quadPoints.length; i++) {
          var quad = annot.quadPoints[i];
          var qxy0 = Util.applyTransform([quad.x, quad.y], user2dev);
          var quadOtherCorner = [quad.x + quad.width, quad.y + quad.height];
          var qxy1 = Util.applyTransform(quadOtherCorner, user2dev);
          var minX = Math.min(qxy0[0], qxy1[0]);
          var maxX = Math.max(qxy0[0], qxy1[0]);
          var minY = Math.min(qxy0[1], qxy1[1]);
          var maxY = Math.max(qxy0[1], qxy1[1]);
          // only grab characters where 50% of the character's
          // width lies within the annotation
          var xPlusHalfWidth = cdims.x + (0.5 * cdims.width);          
          if (xPlusHalfWidth >= minX && xPlusHalfWidth <= maxX &&
              cdims.y >= minY && cdims.y <= maxY) {            
            return i;
          }
        }
      }
      return -1;
    },
    /** Update the markup array for annot, placing the given character into the
      * string associated with the given quad. */
    updateMarkup: function canvasGraphicsUpdateMarkup(annot, quad, glyph, charDims, isSpace) {      
      if (quad < 0) return;
      // check whether glyph.fontChar is valid Ascii, otherwise use glyph.unicode
      // http://stackoverflow.com/a/13522793
      function isAsciiOnly(str) {
          for (var i = 0; i < str.length; i++)
              if (str.charCodeAt(i) > 127)
                  return false;
          return true;
      }
      // var character = /^[\u0-\u7f]*$/.test(glyph.fontChar) ? glyph.fontChar : glyph.unicode;
      var character = isAsciiOnly(glyph.fontChar) ? glyph.fontChar : glyph.unicode;
      // exit if unprintable unicode characters
      // http://stackoverflow.com/a/11598864
      var re = /[\0-\x1F\x7F-\x9F\xAD\u0378\u0379\u037F-\u0383\u038B\u038D\u03A2\u0528-\u0530\u0557\u0558\u0560\u0588\u058B-\u058E\u0590\u05C8-\u05CF\u05EB-\u05EF\u05F5-\u0605\u061C\u061D\u06DD\u070E\u070F\u074B\u074C\u07B2-\u07BF\u07FB-\u07FF\u082E\u082F\u083F\u085C\u085D\u085F-\u089F\u08A1\u08AD-\u08E3\u08FF\u0978\u0980\u0984\u098D\u098E\u0991\u0992\u09A9\u09B1\u09B3-\u09B5\u09BA\u09BB\u09C5\u09C6\u09C9\u09CA\u09CF-\u09D6\u09D8-\u09DB\u09DE\u09E4\u09E5\u09FC-\u0A00\u0A04\u0A0B-\u0A0E\u0A11\u0A12\u0A29\u0A31\u0A34\u0A37\u0A3A\u0A3B\u0A3D\u0A43-\u0A46\u0A49\u0A4A\u0A4E-\u0A50\u0A52-\u0A58\u0A5D\u0A5F-\u0A65\u0A76-\u0A80\u0A84\u0A8E\u0A92\u0AA9\u0AB1\u0AB4\u0ABA\u0ABB\u0AC6\u0ACA\u0ACE\u0ACF\u0AD1-\u0ADF\u0AE4\u0AE5\u0AF2-\u0B00\u0B04\u0B0D\u0B0E\u0B11\u0B12\u0B29\u0B31\u0B34\u0B3A\u0B3B\u0B45\u0B46\u0B49\u0B4A\u0B4E-\u0B55\u0B58-\u0B5B\u0B5E\u0B64\u0B65\u0B78-\u0B81\u0B84\u0B8B-\u0B8D\u0B91\u0B96-\u0B98\u0B9B\u0B9D\u0BA0-\u0BA2\u0BA5-\u0BA7\u0BAB-\u0BAD\u0BBA-\u0BBD\u0BC3-\u0BC5\u0BC9\u0BCE\u0BCF\u0BD1-\u0BD6\u0BD8-\u0BE5\u0BFB-\u0C00\u0C04\u0C0D\u0C11\u0C29\u0C34\u0C3A-\u0C3C\u0C45\u0C49\u0C4E-\u0C54\u0C57\u0C5A-\u0C5F\u0C64\u0C65\u0C70-\u0C77\u0C80\u0C81\u0C84\u0C8D\u0C91\u0CA9\u0CB4\u0CBA\u0CBB\u0CC5\u0CC9\u0CCE-\u0CD4\u0CD7-\u0CDD\u0CDF\u0CE4\u0CE5\u0CF0\u0CF3-\u0D01\u0D04\u0D0D\u0D11\u0D3B\u0D3C\u0D45\u0D49\u0D4F-\u0D56\u0D58-\u0D5F\u0D64\u0D65\u0D76-\u0D78\u0D80\u0D81\u0D84\u0D97-\u0D99\u0DB2\u0DBC\u0DBE\u0DBF\u0DC7-\u0DC9\u0DCB-\u0DCE\u0DD5\u0DD7\u0DE0-\u0DF1\u0DF5-\u0E00\u0E3B-\u0E3E\u0E5C-\u0E80\u0E83\u0E85\u0E86\u0E89\u0E8B\u0E8C\u0E8E-\u0E93\u0E98\u0EA0\u0EA4\u0EA6\u0EA8\u0EA9\u0EAC\u0EBA\u0EBE\u0EBF\u0EC5\u0EC7\u0ECE\u0ECF\u0EDA\u0EDB\u0EE0-\u0EFF\u0F48\u0F6D-\u0F70\u0F98\u0FBD\u0FCD\u0FDB-\u0FFF\u10C6\u10C8-\u10CC\u10CE\u10CF\u1249\u124E\u124F\u1257\u1259\u125E\u125F\u1289\u128E\u128F\u12B1\u12B6\u12B7\u12BF\u12C1\u12C6\u12C7\u12D7\u1311\u1316\u1317\u135B\u135C\u137D-\u137F\u139A-\u139F\u13F5-\u13FF\u169D-\u169F\u16F1-\u16FF\u170D\u1715-\u171F\u1737-\u173F\u1754-\u175F\u176D\u1771\u1774-\u177F\u17DE\u17DF\u17EA-\u17EF\u17FA-\u17FF\u180F\u181A-\u181F\u1878-\u187F\u18AB-\u18AF\u18F6-\u18FF\u191D-\u191F\u192C-\u192F\u193C-\u193F\u1941-\u1943\u196E\u196F\u1975-\u197F\u19AC-\u19AF\u19CA-\u19CF\u19DB-\u19DD\u1A1C\u1A1D\u1A5F\u1A7D\u1A7E\u1A8A-\u1A8F\u1A9A-\u1A9F\u1AAE-\u1AFF\u1B4C-\u1B4F\u1B7D-\u1B7F\u1BF4-\u1BFB\u1C38-\u1C3A\u1C4A-\u1C4C\u1C80-\u1CBF\u1CC8-\u1CCF\u1CF7-\u1CFF\u1DE7-\u1DFB\u1F16\u1F17\u1F1E\u1F1F\u1F46\u1F47\u1F4E\u1F4F\u1F58\u1F5A\u1F5C\u1F5E\u1F7E\u1F7F\u1FB5\u1FC5\u1FD4\u1FD5\u1FDC\u1FF0\u1FF1\u1FF5\u1FFF\u200B-\u200F\u202A-\u202E\u2060-\u206F\u2072\u2073\u208F\u209D-\u209F\u20BB-\u20CF\u20F1-\u20FF\u218A-\u218F\u23F4-\u23FF\u2427-\u243F\u244B-\u245F\u2700\u2B4D-\u2B4F\u2B5A-\u2BFF\u2C2F\u2C5F\u2CF4-\u2CF8\u2D26\u2D28-\u2D2C\u2D2E\u2D2F\u2D68-\u2D6E\u2D71-\u2D7E\u2D97-\u2D9F\u2DA7\u2DAF\u2DB7\u2DBF\u2DC7\u2DCF\u2DD7\u2DDF\u2E3C-\u2E7F\u2E9A\u2EF4-\u2EFF\u2FD6-\u2FEF\u2FFC-\u2FFF\u3040\u3097\u3098\u3100-\u3104\u312E-\u3130\u318F\u31BB-\u31BF\u31E4-\u31EF\u321F\u32FF\u4DB6-\u4DBF\u9FCD-\u9FFF\uA48D-\uA48F\uA4C7-\uA4CF\uA62C-\uA63F\uA698-\uA69E\uA6F8-\uA6FF\uA78F\uA794-\uA79F\uA7AB-\uA7F7\uA82C-\uA82F\uA83A-\uA83F\uA878-\uA87F\uA8C5-\uA8CD\uA8DA-\uA8DF\uA8FC-\uA8FF\uA954-\uA95E\uA97D-\uA97F\uA9CE\uA9DA-\uA9DD\uA9E0-\uA9FF\uAA37-\uAA3F\uAA4E\uAA4F\uAA5A\uAA5B\uAA7C-\uAA7F\uAAC3-\uAADA\uAAF7-\uAB00\uAB07\uAB08\uAB0F\uAB10\uAB17-\uAB1F\uAB27\uAB2F-\uABBF\uABEE\uABEF\uABFA-\uABFF\uD7A4-\uD7AF\uD7C7-\uD7CA\uD7FC-\uF8FF\uFA6E\uFA6F\uFADA-\uFAFF\uFB07-\uFB12\uFB18-\uFB1C\uFB37\uFB3D\uFB3F\uFB42\uFB45\uFBC2-\uFBD2\uFD40-\uFD4F\uFD90\uFD91\uFDC8-\uFDEF\uFDFE\uFDFF\uFE1A-\uFE1F\uFE27-\uFE2F\uFE53\uFE67\uFE6C-\uFE6F\uFE75\uFEFD-\uFF00\uFFBF-\uFFC1\uFFC8\uFFC9\uFFD0\uFFD1\uFFD8\uFFD9\uFFDD-\uFFDF\uFFE7\uFFEF-\uFFFB\uFFFE\uFFFF]/g;
      if(re.test(character)) return;
      if(!annot.markup && character==" ") return;
      // char details for debugging
      var charInfo = {};
      charInfo.fontChar = glyph.fontChar;
      charInfo.unicode = glyph.unicode;      
      charInfo.charDims = charDims;
      charInfo.isSpace = isSpace;
      // ['x','y','width','spaceWidth'].forEach(function(x) { charInfo.charDims[x]=Math.round(charInfo.charDims[x]*10000)/10000;})      
      // console.log(JSON.stringify(charInfo));
      // add to annotation object
      if (!annot.markup) {
        annot.markup = [];
        annot.markupGeom = [];
        annot.chars = [];
        annot.relativeSpaceSize = [];
      }
      if (!annot.markup[quad]) {
        // annot.markupGeom[quad].brx ensures that only characters are added that are right of the first one in annotation
        annot.markupGeom[quad] = {brx: charDims.x + charDims.width};
        annot.markup[quad] = character;
        charInfo.character = character;
        annot.chars.push(charInfo);
      } else {
        var markupEnd = annot.markup[quad].length - 1;
        var lastCharSpace = (annot.markup[quad].charAt(markupEnd) == ' ');
        // exclude double spaces
        if (isSpace && lastCharSpace) return;
        // exclude previous space if it is further right then current character
        var lastChar = annot.chars.slice(-1)[0];
        if(!isSpace && lastCharSpace && typeof lastChar.charDims.x !== 'undefined' && lastChar.charDims.x>charDims.x) {            
          annot.markup[quad] = annot.markup[quad].substring(0, markupEnd);
          annot.chars = annot.chars.splice(0,annot.chars.length-1);          
          lastChar = annot.chars.slice(-1)[0];
          annot.markupGeom[quad].brx = lastChar.charDims.x + lastChar.charDims.width;
          // reset markupEnd and lastCharSpace
          markupEnd = annot.markup[quad].length - 1;
          lastCharSpace = (annot.markup[quad].charAt(markupEnd) == ' ');
        }
        // show current char
        /*var rd = function (x) {return Math.round(x*1000)/1000;}
        console.log(JSON.stringify([
          glyph.fontChar, rd(charDims.x), rd(charDims.y),
          isSpace, lastCharSpace,
          rd(charDims.width), rd(annot.markupGeom[quad].brx), rd(charDims.spaceWidth)]));*/
        // insert space if ...
        if (!isSpace && !lastCharSpace && charDims.spaceWidth != 0 &&
          charDims.x > annot.markupGeom[quad].brx + charDims.spaceWidth) {
          annot.markup[quad] += ' ';
          charInfo.character = ' ';
          annot.chars.push(charInfo);
        }
        // add current character
        if (!isSpace && annot.markupGeom[quad].brx < charDims.x + charDims.width) {          
          annot.markupGeom[quad].brx = charDims.x + charDims.width;
          annot.markup[quad] += character;
          charInfo.character = character;          
          annot.chars.push(charInfo);
        }
        // add space but exclude mini spaces
        if (isSpace) {
          // var lastCharA = annot.chars.slice(-1)[0];
          var lastChar = annot.chars
                            .filter(function(c) {return /^[\w]*$/.test(c.character);})
                            .slice(-1)[0];
          if (typeof lastChar === 'undefined') lastChar = annot.chars.slice(-1)[0];
          // do not add 'mini' spaces that are between to characters of one word
          var relativeSize = charDims.width/lastChar.charDims.width;
          if(relativeSize<0.2) return;
          if (annot.relativeSpaceSize.length>0) {
            var sum = annot.relativeSpaceSize.reduce(function(a, b) { return a + b });
            var avg = sum / annot.relativeSpaceSize.length;            
            if(relativeSize/avg<0.6) return;
          }
          // save relative size of valid spaces to exclude outliers
          annot.relativeSpaceSize.push(relativeSize);
          // add space
          annot.markupGeom[quad].brx = charDims.x + charDims.width;
          annot.markup[quad] += character;
          charInfo.character = character;
          annot.chars.push(charInfo);
        }
      }
    },


    showText: function CanvasGraphics_showText(str, skipTextSelection) {
      var ctx = this.ctx;
      var current = this.current;
      var font = current.font;
      var glyphs = font.charsToGlyphs(str);      
      var fontSize = current.fontSize;
      var fontSizeScale = current.fontSizeScale;
      var charSpacing = current.charSpacing;
      var wordSpacing = current.wordSpacing;
      var textHScale = current.textHScale * current.fontDirection;
      var fontMatrix = current.fontMatrix || FONT_IDENTITY_MATRIX;
      var glyphsLength = glyphs.length;
      var textLayer = this.textLayer;
      var geom;
      var textSelection = textLayer && !skipTextSelection ? true : false;
      var textRenderingMode = current.textRenderingMode;
      var canvasWidth = 0.0;
      var vertical = font.vertical;
      var defaultVMetrics = font.defaultVMetrics;
      var show = false;

      // Type3 fonts - each glyph is a "mini-PDF"      
      if (font.coded) {
        ctx.save();
        ctx.transform.apply(ctx, current.textMatrix);
        ctx.translate(current.x, current.y);

        ctx.scale(textHScale, 1);

        if (textSelection || this.annotation) {
          this.save();
          ctx.scale(1, -1);
          geom = this.createTextGeometry();
          this.restore();
        }
        for (var i = 0; i < glyphsLength; ++i) {

          var glyph = glyphs[i];
          if (glyph === null) {
            // word break
            this.ctx.translate(wordSpacing, 0);
            current.x += wordSpacing * textHScale;
            continue;
          }

          this.save();
          ctx.scale(fontSize, fontSize);
          ctx.transform.apply(ctx, fontMatrix);
          this.executeOperatorList(glyph.operatorList);
          this.restore();

          var transformed = Util.applyTransform([glyph.width, 0], fontMatrix);
          var width = (transformed[0] * fontSize + charSpacing) *
                      current.fontDirection;

          ctx.translate(width, 0);
          current.x += width * textHScale;


          if (this.annotations && ctx.user2dev) {
            // check if glyph is within an annotation
            var chDims = this.makeCharDims(transformed[0] * fontSize, width,
                                           font, ctx.mozCurrentTransform);
            for (var j = 0; j < this.annotations.length; j++) {
              var annot = this.annotations[j];              
              var quad = this.charInAnnot(annot, glyph, chDims, ctx.user2dev);
              this.updateMarkup(annot, quad, glyph, chDims, false);
            }
          }
          
          canvasWidth += width;
        }
        ctx.restore();
      } else {
        ctx.save();
        this.applyTextTransforms();

        var lineWidth = current.lineWidth;
        var a1 = current.textMatrix[0], b1 = current.textMatrix[1];
        var scale = Math.sqrt(a1 * a1 + b1 * b1);
        if (scale === 0 || lineWidth === 0)
          lineWidth = this.getSinglePixelWidth();
        else
          lineWidth /= scale;

        if (textSelection || this.annotations)
          geom = this.createTextGeometry();

        if (fontSizeScale != 1.0) {
          ctx.scale(fontSizeScale, fontSizeScale);
          lineWidth /= fontSizeScale;
        }

        ctx.lineWidth = lineWidth;

        var x = 0;        
        for (var i = 0; i < glyphsLength; ++i) {
          var glyph = glyphs[i];
          if (glyph === null) {
            // word break
            x += current.fontDirection * wordSpacing;
            continue;
          }

          var character = glyph.fontChar;
          var vmetric = glyph.vmetric || defaultVMetrics;
          if (vertical) {
            var vx = glyph.vmetric ? vmetric[1] : glyph.width * 0.5;
            vx = -vx * fontSize * current.fontMatrix[0];
            var vy = vmetric[2] * fontSize * current.fontMatrix[0];
          }
          var width = vmetric ? -vmetric[0] : glyph.width;
          var charWidth = width * fontSize * current.fontMatrix[0] +
                          charSpacing * current.fontDirection;
          var accent = glyph.accent;

          var scaledX, scaledY, scaledAccentX, scaledAccentY;
          if (!glyph.disabled) {
            if (vertical) {
              scaledX = vx / fontSizeScale;
              scaledY = (x + vy) / fontSizeScale;
            } else {
              scaledX = x / fontSizeScale;
              scaledY = 0;
            }
            if (accent) {
              scaledAccentX = scaledX + accent.offset.x / fontSizeScale;
              scaledAccentY = scaledY - accent.offset.y / fontSizeScale;
            }
            switch (textRenderingMode) {
              default: // other unsupported rendering modes
              case TextRenderingMode.FILL:
              case TextRenderingMode.FILL_ADD_TO_PATH:
                ctx.fillText(character, scaledX, scaledY);
                if (accent) {
                  ctx.fillText(accent.fontChar, scaledAccentX, scaledAccentY);
                }
                break;
              case TextRenderingMode.STROKE:
              case TextRenderingMode.STROKE_ADD_TO_PATH:
                ctx.strokeText(character, scaledX, scaledY);
                if (accent) {
                  ctx.strokeText(accent.fontChar, scaledAccentX, scaledAccentY);
                }
                break;
              case TextRenderingMode.FILL_STROKE:
              case TextRenderingMode.FILL_STROKE_ADD_TO_PATH:
                ctx.fillText(character, scaledX, scaledY);
                ctx.strokeText(character, scaledX, scaledY);
                if (accent) {
                  ctx.fillText(accent.fontChar, scaledAccentX, scaledAccentY);
                  ctx.strokeText(accent.fontChar, scaledAccentX, scaledAccentY);
                }
                break;
              case TextRenderingMode.INVISIBLE:
              case TextRenderingMode.ADD_TO_PATH:
                break;
            }
            if (textRenderingMode & TextRenderingMode.ADD_TO_PATH_FLAG) {
              var clipCtx = this.getCurrentTextClipping();
              clipCtx.fillText(character, scaledX, scaledY);
              if (accent) {
                clipCtx.fillText(accent.fontChar, scaledAccentX, scaledAccentY);
              }
            }
          }
          
          if (this.annotations && ctx.user2dev) {            
            // check if glyph is within an annotation
            // var charDims = this.makeCharDims(glyph.width * fontSize * .001, x, font, ctx.mozCurrentTransform);
            var charDims = this.makeCharDims(width * fontSize * current.fontMatrix[0], x, font, ctx.mozCurrentTransform);            
            glyph.print = false;
            for (var j = 0; j < this.annotations.length; j++) {
              var annot = this.annotations[j];
              var quad = this.charInAnnot(annot, glyph, charDims, ctx.user2dev);              
              this.updateMarkup(annot, quad, glyph, charDims, false);
            }
          }

          x += charWidth;

          canvasWidth += charWidth;
        }
        if (vertical) {
          current.y -= x * textHScale;
        } else {
          current.x += x * textHScale;
        }
        ctx.restore();
      }

      if (textSelection) {
        geom.canvasWidth = canvasWidth;
        if (vertical) {
          var vmetric = font.defaultVMetrics;
          geom.x += vmetric[1] * fontSize * current.fontMatrix[0] /
                    fontSizeScale * geom.hScale;
          geom.y += vmetric[2] * fontSize * current.fontMatrix[0] /
                    fontSizeScale * geom.vScale;
        }
        this.textLayer.appendText(geom);
      }

      return canvasWidth;
    },
    showSpacedText: function CanvasGraphics_showSpacedText(arr) {
      var ctx = this.ctx;
      var current = this.current;
      var font = current.font;
      var fontSize = current.fontSize;
      // TJ array's number is independent from fontMatrix
      var textHScale = current.textHScale * 0.001 * current.fontDirection;
      var arrLength = arr.length;
      var textLayer = this.textLayer;
      var geom;
      var canvasWidth = 0.0;
      var textSelection = textLayer ? true : false;
      var font2dev = [];
      var vertical = font.vertical;
      var spacingAccumulator = 0;

      if (textSelection || this.annotations) {
        ctx.save();
        this.applyTextTransforms();
        font2dev = ctx.mozCurrentTransform.slice(0, 6);
        geom = this.createTextGeometry();
        ctx.restore();
      }
      for (var i = 0; i < arrLength; ++i) {
        var e = arr[i];
        if (isNum(e)) {
          var spacingLength = -e * fontSize * textHScale;
          if (vertical) {
            current.y += spacingLength;
          } else {
            current.x += spacingLength;
          }

          if (textSelection || this.annotations)
            spacingAccumulator += spacingLength;          

          if (this.annotations && ctx.user2dev) {
              var charDims =
                this.makeCharDims(spacingLength,
                                  canvasWidth - spacingLength,
                                  font, font2dev);              
              for (var j = 0; j < this.annotations.length; j++) {
                var annot = this.annotations[j];
                var quad = this.charInAnnot(annot, {'fontChar':' ', 'unicode': ' '}, charDims, ctx.user2dev);                
                this.updateMarkup(annot, quad, {'fontChar':' ', 'unicode': ' '}, charDims, true); 
              }
            }

        } else if (isString(e)) {
          var shownCanvasWidth = this.showText(e, true);

          if (textSelection || this.annotations) {
            canvasWidth += spacingAccumulator + shownCanvasWidth;
            spacingAccumulator = 0;
          }
        } else {
          error('TJ array element ' + e + ' is not string or num');
        }
      }

      if (textSelection) {
        geom.canvasWidth = canvasWidth;
        if (vertical) {
          var fontSizeScale = current.fontSizeScale;
          var vmetric = font.defaultVMetrics;
          geom.x += vmetric[1] * fontSize * current.fontMatrix[0] /
                    fontSizeScale * geom.hScale;
          geom.y += vmetric[2] * fontSize * current.fontMatrix[0] /
                    fontSizeScale * geom.vScale;
        }
        this.textLayer.appendText(geom);
      }
    },
    nextLineShowText: function CanvasGraphics_nextLineShowText(text) {
      this.nextLine();
      this.showText(text);
    },
    nextLineSetSpacingShowText:
      function CanvasGraphics_nextLineSetSpacingShowText(wordSpacing,
                                                         charSpacing,
                                                         text) {
      this.setWordSpacing(wordSpacing);
      this.setCharSpacing(charSpacing);
      this.nextLineShowText(text);
    },

    // Type3 fonts
    setCharWidth: function CanvasGraphics_setCharWidth(xWidth, yWidth) {
      // We can safely ignore this since the width should be the same
      // as the width in the Widths array.
    },
    setCharWidthAndBounds: function CanvasGraphics_setCharWidthAndBounds(xWidth,
                                                                        yWidth,
                                                                        llx,
                                                                        lly,
                                                                        urx,
                                                                        ury) {
      // TODO According to the spec we're also suppose to ignore any operators
      // that set color or include images while processing this type3 font.
      this.rectangle(llx, lly, urx - llx, ury - lly);
      this.clip();
      this.endPath();
    },

    // Color
    setStrokeColorSpace: function CanvasGraphics_setStrokeColorSpace(raw) {
      this.current.strokeColorSpace = ColorSpace.fromIR(raw);
    },
    setFillColorSpace: function CanvasGraphics_setFillColorSpace(raw) {
      this.current.fillColorSpace = ColorSpace.fromIR(raw);
    },
    setStrokeColor: function CanvasGraphics_setStrokeColor(/*...*/) {
      var cs = this.current.strokeColorSpace;
      var rgbColor = cs.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    getColorN_Pattern: function CanvasGraphics_getColorN_Pattern(IR, cs) {
      if (IR[0] == 'TilingPattern') {
        var args = IR[1];
        var base = cs.base;
        var color;
        if (base) {
          var baseComps = base.numComps;

          color = base.getRgb(args, 0);
        }
        var pattern = new TilingPattern(IR, color, this.ctx, this.objs,
                                        this.commonObjs);
      } else if (IR[0] == 'RadialAxial' || IR[0] == 'Dummy') {
        var pattern = Pattern.shadingFromIR(IR);
      } else {
        error('Unkown IR type ' + IR[0]);
      }
      return pattern;
    },
    setStrokeColorN: function CanvasGraphics_setStrokeColorN(/*...*/) {
      var cs = this.current.strokeColorSpace;

      if (cs.name == 'Pattern') {
        this.current.strokeColor = this.getColorN_Pattern(arguments, cs);
      } else {
        this.setStrokeColor.apply(this, arguments);
      }
    },
    setFillColor: function CanvasGraphics_setFillColor(/*...*/) {
      var cs = this.current.fillColorSpace;
      var rgbColor = cs.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },
    setFillColorN: function CanvasGraphics_setFillColorN(/*...*/) {
      var cs = this.current.fillColorSpace;

      if (cs.name == 'Pattern') {
        this.current.fillColor = this.getColorN_Pattern(arguments, cs);
      } else {
        this.setFillColor.apply(this, arguments);
      }
    },
    setStrokeGray: function CanvasGraphics_setStrokeGray(gray) {
      if (!(this.current.strokeColorSpace instanceof DeviceGrayCS))
        this.current.strokeColorSpace = new DeviceGrayCS();

      var rgbColor = this.current.strokeColorSpace.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    setFillGray: function CanvasGraphics_setFillGray(gray) {
      if (!(this.current.fillColorSpace instanceof DeviceGrayCS))
        this.current.fillColorSpace = new DeviceGrayCS();

      var rgbColor = this.current.fillColorSpace.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },
    setStrokeRGBColor: function CanvasGraphics_setStrokeRGBColor(r, g, b) {
      if (!(this.current.strokeColorSpace instanceof DeviceRgbCS))
        this.current.strokeColorSpace = new DeviceRgbCS();

      var rgbColor = this.current.strokeColorSpace.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    setFillRGBColor: function CanvasGraphics_setFillRGBColor(r, g, b) {
      if (!(this.current.fillColorSpace instanceof DeviceRgbCS))
        this.current.fillColorSpace = new DeviceRgbCS();

      var rgbColor = this.current.fillColorSpace.getRgb(arguments, 0);
      var color = Util.makeCssRgb(rgbColor);
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },
    setStrokeCMYKColor: function CanvasGraphics_setStrokeCMYKColor(c, m, y, k) {
      if (!(this.current.strokeColorSpace instanceof DeviceCmykCS))
        this.current.strokeColorSpace = new DeviceCmykCS();

      var color = Util.makeCssCmyk(arguments);
      this.ctx.strokeStyle = color;
      this.current.strokeColor = color;
    },
    setFillCMYKColor: function CanvasGraphics_setFillCMYKColor(c, m, y, k) {
      if (!(this.current.fillColorSpace instanceof DeviceCmykCS))
        this.current.fillColorSpace = new DeviceCmykCS();

      var color = Util.makeCssCmyk(arguments);
      this.ctx.fillStyle = color;
      this.current.fillColor = color;
    },

    shadingFill: function CanvasGraphics_shadingFill(patternIR) {
      var ctx = this.ctx;

      this.save();
      var pattern = Pattern.shadingFromIR(patternIR);
      ctx.fillStyle = pattern.getPattern(ctx);

      var inv = ctx.mozCurrentTransformInverse;
      if (inv) {
        var canvas = ctx.canvas;
        var width = canvas.width;
        var height = canvas.height;

        var bl = Util.applyTransform([0, 0], inv);
        var br = Util.applyTransform([0, height], inv);
        var ul = Util.applyTransform([width, 0], inv);
        var ur = Util.applyTransform([width, height], inv);

        var x0 = Math.min(bl[0], br[0], ul[0], ur[0]);
        var y0 = Math.min(bl[1], br[1], ul[1], ur[1]);
        var x1 = Math.max(bl[0], br[0], ul[0], ur[0]);
        var y1 = Math.max(bl[1], br[1], ul[1], ur[1]);

        this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      } else {
        // HACK to draw the gradient onto an infinite rectangle.
        // PDF gradients are drawn across the entire image while
        // Canvas only allows gradients to be drawn in a rectangle
        // The following bug should allow us to remove this.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=664884

        this.ctx.fillRect(-1e10, -1e10, 2e10, 2e10);
      }

      this.restore();
    },

    // Images
    beginInlineImage: function CanvasGraphics_beginInlineImage() {
      error('Should not call beginInlineImage');
    },
    beginImageData: function CanvasGraphics_beginImageData() {
      error('Should not call beginImageData');
    },

    paintFormXObjectBegin: function CanvasGraphics_paintFormXObjectBegin(matrix,
                                                                        bbox) {
      this.save();
      this.current.paintFormXObjectDepth++;

      if (matrix && isArray(matrix) && 6 == matrix.length)
        this.transform.apply(this, matrix);

      if (bbox && isArray(bbox) && 4 == bbox.length) {
        var width = bbox[2] - bbox[0];
        var height = bbox[3] - bbox[1];
        this.rectangle(bbox[0], bbox[1], width, height);
        this.clip();
        this.endPath();
      }
    },

    paintFormXObjectEnd: function CanvasGraphics_paintFormXObjectEnd() {
      var depth = this.current.paintFormXObjectDepth;
      do {
        this.restore();
        // some pdf don't close all restores inside object
        // closing those for them
      } while (this.current.paintFormXObjectDepth >= depth);
    },

    beginGroup: function CanvasGraphics_beginGroup(group) {
      this.save();
      var currentCtx = this.ctx;
      // TODO non-isolated groups - according to Rik at adobe non-isolated
      // group results aren't usually that different and they even have tools
      // that ignore this setting. Notes from Rik on implmenting:
      // - When you encounter an transparency group, create a new canvas with
      // the dimensions of the bbox
      // - copy the content from the previous canvas to the new canvas
      // - draw as usual
      // - remove the backdrop alpha:
      // alphaNew = 1 - (1 - alpha)/(1 - alphaBackdrop) with 'alpha' the alpha
      // value of your transparency group and 'alphaBackdrop' the alpha of the
      // backdrop
      // - remove background color:
      // colorNew = color - alphaNew *colorBackdrop /(1 - alphaNew)
      if (!group.isolated) {
        TODO('Support non-isolated groups.');
      }

      // TODO knockout - supposedly possible with the clever use of compositing
      // modes.
      if (group.knockout) {
        TODO('Support knockout groups.');
      }

      var currentTransform = currentCtx.mozCurrentTransform;
      if (group.matrix) {
        currentCtx.transform.apply(currentCtx, group.matrix);
      }
      assert(group.bbox, 'Bounding box is required.');

      // Based on the current transform figure out how big the bounding box
      // will actually be.
      var bounds = Util.getAxialAlignedBoundingBox(
                    group.bbox,
                    currentCtx.mozCurrentTransform);
      // Use ceil in case we're between sizes so we don't create canvas that is
      // too small.
      var drawnWidth = Math.ceil(bounds[2] - bounds[0]);
      var drawnHeight = Math.ceil(bounds[3] - bounds[1]);
      var scratchCanvas = createScratchCanvas(drawnWidth, drawnHeight);
      var groupCtx = scratchCanvas.getContext('2d');
      addContextCurrentTransform(groupCtx);
      // Since we created a new canvas that is just the size of the bounding box
      // we have to translate the group ctx.
      var offsetX = bounds[0];
      var offsetY = bounds[1];
      groupCtx.translate(-offsetX, -offsetY);
      groupCtx.transform.apply(groupCtx, currentTransform);

      // Setup the current ctx so when the group is popped we draw it the right
      // location.
      currentCtx.setTransform(1, 0, 0, 1, 0, 0);
      currentCtx.translate(offsetX, offsetY);

      // The transparency group inherits all off the current graphics state
      // except the blend mode, soft mask, and alpha constants.
      copyCtxState(currentCtx, groupCtx);
      this.ctx = groupCtx;
      this.setGState([
        ['SMask', 'None'],
        ['BM', 'Normal'],
        ['ca', 1],
        ['CA', 1]
      ]);
      this.groupStack.push(currentCtx);
    },

    endGroup: function CanvasGraphics_endGroup(group) {
      var groupCtx = this.ctx;
      this.ctx = this.groupStack.pop();
      // Turn off image smoothing to avoid sub pixel interpolation which can
      // look kind of blurry for some pdfs.
      if ('imageSmoothingEnabled' in this.ctx) {
        this.ctx.imageSmoothingEnabled = false;
      } else {
        this.ctx.mozImageSmoothingEnabled = false;
      }
      this.ctx.drawImage(groupCtx.canvas, 0, 0);
      this.restore();
    },

    beginAnnotation: function CanvasGraphics_beginAnnotation(rect, transform,
                                                             matrix, border) {
      this.save();

      if (rect && isArray(rect) && 4 == rect.length) {
        var width = rect[2] - rect[0];
        var height = rect[3] - rect[1];

        if (border) {
          // TODO(mack): Support different border styles
          this.save();
          var rgb = border.rgb;
          this.setStrokeRGBColor(rgb[0], rgb[1], rgb[2]);
          this.setLineWidth(border.width);
          this.rectangle(rect[0], rect[1], width, height);
          this.stroke();
          this.restore();
        }

        this.rectangle(rect[0], rect[1], width, height);
        this.clip();
        this.endPath();
      }

      this.transform.apply(this, transform);
      this.transform.apply(this, matrix);
    },

    endAnnotation: function CanvasGraphics_endAnnotation() {
      this.restore();
    },

    paintJpegXObject: function CanvasGraphics_paintJpegXObject(objId, w, h) {
      var domImage = this.objs.get(objId);
      if (!domImage) {
        error('Dependent image isn\'t ready yet');
      }

      this.save();

      var ctx = this.ctx;
      // scale the image to the unit square
      ctx.scale(1 / w, -1 / h);

      ctx.drawImage(domImage, 0, 0, domImage.width, domImage.height,
                    0, -h, w, h);
      if (this.imageLayer) {
        var currentTransform = ctx.mozCurrentTransformInverse;
        var position = this.getCanvasPosition(0, 0);
        this.imageLayer.appendImage({
          objId: objId,
          left: position[0],
          top: position[1],
          width: w / currentTransform[0],
          height: h / currentTransform[3]
        });
      }
      this.restore();
    },

    paintImageMaskXObject: function CanvasGraphics_paintImageMaskXObject(
                             imgArray, inverseDecode, width, height) {
      var ctx = this.ctx;
      var tmpCanvas = createScratchCanvas(width, height);
      var tmpCtx = tmpCanvas.getContext('2d');

      var fillColor = this.current.fillColor;
      tmpCtx.fillStyle = (fillColor && fillColor.hasOwnProperty('type') &&
                          fillColor.type === 'Pattern') ?
                          fillColor.getPattern(tmpCtx) : fillColor;
      tmpCtx.fillRect(0, 0, width, height);

      var imgData = tmpCtx.getImageData(0, 0, width, height);
      var pixels = imgData.data;

      applyStencilMask(imgArray, width, height, inverseDecode, pixels);

      this.paintInlineImageXObject(imgData);
    },

    paintImageMaskXObjectGroup:
      function CanvasGraphics_paintImageMaskXObjectGroup(images) {
      var ctx = this.ctx;
      var tmpCanvasWidth = 0, tmpCanvasHeight = 0, tmpCanvas, tmpCtx;
      for (var i = 0, ii = images.length; i < ii; i++) {
        var image = images[i];
        var w = image.width, h = image.height;
        if (w > tmpCanvasWidth || h > tmpCanvasHeight) {
          tmpCanvasWidth = Math.max(w, tmpCanvasWidth);
          tmpCanvasHeight = Math.max(h, tmpCanvasHeight);
          tmpCanvas = createScratchCanvas(tmpCanvasWidth, tmpCanvasHeight);
          tmpCtx = tmpCanvas.getContext('2d');

          var fillColor = this.current.fillColor;
          tmpCtx.fillStyle = (fillColor && fillColor.hasOwnProperty('type') &&
                              fillColor.type === 'Pattern') ?
                              fillColor.getPattern(tmpCtx) : fillColor;
        }
        tmpCtx.fillRect(0, 0, w, h);

        var imgData = tmpCtx.getImageData(0, 0, w, h);
        var pixels = imgData.data;

        applyStencilMask(image.data, w, h, image.inverseDecode, pixels);

        tmpCtx.putImageData(imgData, 0, 0);

        ctx.save();
        ctx.transform.apply(ctx, image.transform);
        ctx.scale(1, -1);
        ctx.drawImage(tmpCanvas, 0, 0, w, h,
                      0, -1, 1, 1);
        ctx.restore();
      }
    },

    paintImageXObject: function CanvasGraphics_paintImageXObject(objId) {
      var imgData = this.objs.get(objId);
      if (!imgData)
        error('Dependent image isn\'t ready yet');

      this.paintInlineImageXObject(imgData);
    },

    paintInlineImageXObject:
      function CanvasGraphics_paintInlineImageXObject(imgData) {
      var width = imgData.width;
      var height = imgData.height;
      var ctx = this.ctx;
      this.save();
      // scale the image to the unit square
      ctx.scale(1 / width, -1 / height);

      var currentTransform = ctx.mozCurrentTransformInverse;
      var widthScale = Math.max(Math.abs(currentTransform[0]), 1);
      var heightScale = Math.max(Math.abs(currentTransform[3]), 1);
      var tmpCanvas = createScratchCanvas(width, height);
      var tmpCtx = tmpCanvas.getContext('2d');

      if (widthScale > 2 || heightScale > 2) {
        // canvas does not resize well large images to small -- using simple
        // algorithm to perform pre-scaling
        tmpCanvas = prescaleImage(imgData.data,
                                 width, height,
                                 widthScale, heightScale);
        ctx.drawImage(tmpCanvas, 0, 0, tmpCanvas.width, tmpCanvas.height,
                                 0, -height, width, height);
      } else {
        if (typeof ImageData !== 'undefined' && imgData instanceof ImageData) {
          tmpCtx.putImageData(imgData, 0, 0);
        } else {
          putBinaryImageData(tmpCtx, imgData.data, width, height);
        }
        ctx.drawImage(tmpCanvas, 0, -height);
      }

      if (this.imageLayer) {
        var position = this.getCanvasPosition(0, -height);
        this.imageLayer.appendImage({
          imgData: imgData,
          left: position[0],
          top: position[1],
          width: width / currentTransform[0],
          height: height / currentTransform[3]
        });
      }
      this.restore();
    },

    paintInlineImageXObjectGroup:
      function CanvasGraphics_paintInlineImageXObjectGroup(imgData, map) {
      var ctx = this.ctx;
      var w = imgData.width;
      var h = imgData.height;

      var tmpCanvas = createScratchCanvas(w, h);
      var tmpCtx = tmpCanvas.getContext('2d');
      putBinaryImageData(tmpCtx, imgData.data, w, h);

      for (var i = 0, ii = map.length; i < ii; i++) {
        var entry = map[i];
        ctx.save();
        ctx.transform.apply(ctx, entry.transform);
        ctx.scale(1, -1);
        ctx.drawImage(tmpCanvas, entry.x, entry.y, entry.w, entry.h,
                      0, -1, 1, 1);
        if (this.imageLayer) {
          var position = this.getCanvasPosition(entry.x, entry.y);
          this.imageLayer.appendImage({
            imgData: imgData,
            left: position[0],
            top: position[1],
            width: w,
            height: h
          });
        }
        ctx.restore();
      }
    },

    // Marked content

    markPoint: function CanvasGraphics_markPoint(tag) {
      // TODO Marked content.
    },
    markPointProps: function CanvasGraphics_markPointProps(tag, properties) {
      // TODO Marked content.
    },
    beginMarkedContent: function CanvasGraphics_beginMarkedContent(tag) {
      // TODO Marked content.
    },
    beginMarkedContentProps: function CanvasGraphics_beginMarkedContentProps(
                                        tag, properties) {
      // TODO Marked content.
    },
    endMarkedContent: function CanvasGraphics_endMarkedContent() {
      // TODO Marked content.
    },

    // Compatibility

    beginCompat: function CanvasGraphics_beginCompat() {
      // TODO ignore undefined operators (should we do that anyway?)
    },
    endCompat: function CanvasGraphics_endCompat() {
      // TODO stop ignoring undefined operators
    },

    // Helper functions

    consumePath: function CanvasGraphics_consumePath() {
      if (this.pendingClip) {
        var savedFillRule = null;
        if (this.pendingClip == EO_CLIP)
          savedFillRule = this.setEOFillRule();

        this.ctx.clip();

        this.pendingClip = null;
        if (savedFillRule !== null)
          this.restoreFillRule(savedFillRule);
      }
      this.ctx.beginPath();
    },
    // We generally keep the canvas context set for
    // nonzero-winding, and just set evenodd for the operations
    // that need them.
    setEOFillRule: function CanvasGraphics_setEOFillRule() {
      var savedFillRule = this.ctx.mozFillRule;
      this.ctx.mozFillRule = 'evenodd';
      return savedFillRule;
    },
    restoreFillRule: function CanvasGraphics_restoreFillRule(rule) {
      this.ctx.mozFillRule = rule;
    },
    getSinglePixelWidth: function CanvasGraphics_getSinglePixelWidth(scale) {
      var inverse = this.ctx.mozCurrentTransformInverse;
      // max of the current horizontal and vertical scale
      return Math.sqrt(Math.max(
        (inverse[0] * inverse[0] + inverse[1] * inverse[1]),
        (inverse[2] * inverse[2] + inverse[3] * inverse[3])));
    },
    getCanvasPosition: function CanvasGraphics_getCanvasPosition(x, y) {
        var transform = this.ctx.mozCurrentTransform;
        return [
          transform[0] * x + transform[2] * y + transform[4],
          transform[1] * x + transform[3] * y + transform[5]
        ];
    }
  };

  return CanvasGraphics;
})();

