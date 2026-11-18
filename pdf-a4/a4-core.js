/*
 * a4-core.js — PDF 分页 / 缩放核心（浏览器 + Node 共用，UMD 风格）
 *
 * 纯逻辑，不直接依赖 pdf-lib：调用方把 PDFLib 作为第三个参数传进来。
 * 浏览器：A4Core.convert(bytes, opts, window.PDFLib)
 * Node  ：require('./a4-core.js').convert(bytes, opts, require('./pdf-lib.min.js'))
 *
 * 所有处理都在内存里完成，不上传文件。源页以 Form XObject 嵌入，
 * 文字/矢量图保持可选中、可无损缩放，不会变成位图。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.A4Core = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MM = 72 / 25.4;

  var PAPERS = {
    'A4':            [595.28, 841.89],
    'A4-landscape':  [841.89, 595.28],
    'A5':            [419.53, 595.28],
    'B5':            [498.90, 708.66],
    'Letter':        [612.00, 792.00],
    'Letter-landscape': [792.00, 612.00]
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // 解析百分比切线（字符串或数组），总是补 0 / 100 并排序
  function parsePercents(value) {
    var arr = null;
    if (value != null) {
      if (typeof value === 'string') {
        arr = value.split(/[,，\s]+/).map(Number).filter(function (n) { return isFinite(n); });
      } else if (Array.isArray(value)) {
        arr = value.map(Number).filter(function (n) { return isFinite(n); });
      }
    }
    if (!arr || arr.length < 2) return null;
    arr = arr.map(function (n) { return clamp(n, 0, 100); }).sort(function (a, b) { return a - b; });
    if (arr[0] > 0) arr.unshift(0);
    if (arr[arr.length - 1] < 100) arr.push(100);
    return arr;
  }

  function normalizeOptions(opts) {
    opts = opts || {};
    var paper = PAPERS[opts.paper || 'A4'] || opts.paper;
    if (!Array.isArray(paper) || paper.length !== 2) paper = PAPERS.A4.slice();
    var mode = opts.mode || 'columns';
    if (['columns', 'grid', 'fit', 'split'].indexOf(mode) < 0) mode = 'columns';
    var cuts = parsePercents(opts.cuts);
    var rowCuts = parsePercents(opts.rowCuts);   // 从上边缘算起的百分比
    var cols = clamp(parseInt(opts.cols, 10) || (cuts ? cuts.length - 1 : 2), 1, 12);
    var rows = clamp(parseInt(opts.rows, 10) || (rowCuts ? rowCuts.length - 1 : 1), 1, 12);
    if (cuts) cols = cuts.length - 1;
    if (rowCuts) rows = rowCuts.length - 1;
    if (mode === 'fit') { cols = 1; rows = 1; cuts = null; rowCuts = null; }
    return {
      paper: paper,
      paperName: opts.paper || 'A4',
      mode: mode,
      cols: cols,
      rows: rows,
      cuts: cuts,
      rowCuts: rowCuts,
      margin: clamp(Number(opts.margin) || 0, 0, 60),   // pt
      overlap: clamp(Number(opts.overlap) || 0, 0, 40), // pt
      scale: opts.scale || 'fit',
      pages: opts.pages || null                          // 源页索引数组，null = 全部
    };
  }

  // 源页 /Rotate 会让「显示尺寸」与 MediaBox 宽高互换。
  function displayBox(em, rotation) {
    var rot = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
    var w0 = em.width, h0 = em.height;
    var swap = (rot === 90 || rot === 270);
    return { w: swap ? h0 : w0, h: swap ? w0 : h0, w0: w0, h0: h0, rot: rot };
  }

  function fractions(o) {
    if (o.cuts) return o.cuts.map(function (n) { return n / 100; });
    var out = [];
    for (var i = 0; i <= o.cols; i++) out.push(i / o.cols);
    return out;
  }

  // 行边界（左下原点比例）：自定义 rowCuts 是从上往下算的，转成从下往上并升序
  function rowFractions(o) {
    if (o.rowCuts) {
      return o.rowCuts.map(function (n) { return 1 - n / 100; }).reverse();
    }
    var out = [];
    for (var i = 0; i <= o.rows; i++) out.push(i / o.rows);
    return out;
  }

  // 返回「显示坐标系」（左下原点）下的一串矩形，顺序：从上到下、从左到右
  function makeTiles(box, o) {
    var xs = fractions(o), ys = rowFractions(o);
    var tiles = [];
    for (var r = 0; r < ys.length - 1; r++) {
      var cy = ys[r] * box.h, rowH = (ys[r + 1] - ys[r]) * box.h;
      for (var c = 0; c < xs.length - 1; c++) {
        var cx = xs[c] * box.w;
        var cw = (xs[c + 1] - xs[c]) * box.w;
        var pad = o.overlap;
        var x0 = clamp(cx - pad, 0, box.w), x1 = clamp(cx + cw + pad, 0, box.w);
        var y0 = clamp(cy - pad, 0, box.h), y1 = clamp(cy + rowH + pad, 0, box.h);
        tiles.push({ cx: x0, cy: y0, cw: x1 - x0, ch: y1 - y0, row: r, col: c });
      }
    }
    return tiles;
  }

  function scaleFor(tile, W, H, o) {
    var availW = Math.max(1, W - 2 * o.margin);
    var availH = Math.max(1, H - 2 * o.margin);
    if (typeof o.scale === 'number' && isFinite(o.scale) && o.scale > 0) return o.scale;
    if (o.scale === 'fill') return Math.max(availW / tile.cw, availH / tile.ch);
    if (o.scale === 'none' || o.scale === '1:1') return 1;
    return Math.min(availW / tile.cw, availH / tile.ch); // fit
  }

  /*
   * 把「源页坐标 (x,y)」映射到「目标纸坐标」的 PDF cm 矩阵。
   * 先按 /Rotate 做显示变换，再缩放 s、平移 (tx,ty)：
   *   rot   0 : (X,Y) = (x, y)
   *   rot  90 : (X,Y) = (y, w0-x)
   *   rot 180 : (X,Y) = (w0-x, h0-y)
   *   rot 270 : (X,Y) = (h0-y, x)
   */
  function transform(box, s, tx, ty) {
    var w0 = box.w0, h0 = box.h0;
    switch (box.rot) {
      case 90:  return [0, -s, s, 0, tx, ty + s * w0];
      case 180: return [-s, 0, 0, -s, tx + s * w0, ty + s * h0];
      case 270: return [0, s, -s, 0, tx + s * h0, ty];
      default:  return [s, 0, 0, s, tx, ty];
    }
  }

  function parsePageRange(str, total) {
    if (!str) return null;
    var out = [];
    String(str).split(',').forEach(function (part) {
      var m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return;
      var a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
      for (var i = Math.min(a, b); i <= Math.max(a, b); i++) {
        if (i >= 1 && i <= total && out.indexOf(i - 1) < 0) out.push(i - 1);
      }
    });
    return out.length ? out : null;
  }

  async function convert(inputBytes, opts, PDFLib) {
    if (!PDFLib) throw new Error('缺少 PDFLib');
    var o = normalizeOptions(opts);
    var src = await PDFLib.PDFDocument.load(inputBytes, { ignoreEncryption: true });
    var total = src.getPageCount();
    if (!total) throw new Error('PDF 没有页面');

    var picked = Array.isArray(o.pages) ? o.pages : parsePageRange(o.pages, total);
    var indices = (picked && picked.length ? picked : null)
      || Array.from({ length: total }, function (_, i) { return i; });
    indices = indices.filter(function (i) { return i >= 0 && i < total; });
    if (!indices.length) throw new Error('没有选中任何页面');

    var out = await PDFLib.PDFDocument.create();
    var embedded = await out.embedPdf(inputBytes, indices);
    var list = Array.isArray(embedded) ? embedded : [embedded];
    var W = o.paper[0], H = o.paper[1];
    var sourcePages = [], outputPages = [];

    for (var k = 0; k < list.length; k++) {
      var em = list[k];
      var srcPage = src.getPage(indices[k]);
      var rawSize = srcPage.getSize();
      var box = displayBox(em, srcPage.getRotation().angle);
      var tiles = makeTiles(box, o);
      sourcePages.push({
        index: indices[k],
        width: box.w, height: box.h,
        rawWidth: rawSize.width, rawHeight: rawSize.height,
        rotation: box.rot,
        tiles: tiles.length
      });

      for (var t = 0; t < tiles.length; t++) {
        var tile = tiles[t];
        var s = scaleFor(tile, W, H, o);
        var tx = (W - tile.cw * s) / 2 - tile.cx * s;
        var ty = (H - tile.ch * s) / 2 - tile.cy * s;
        var m = transform(box, s, tx, ty);

        var page = out.addPage([W, H]);
        // 先在「目标纸坐标」里把可见区域 clip 到这一块的矩形，
        // 再叠旋转 + 缩放 + 平移矩阵把整张源页画进去。
        // 源页超出块的部分（相邻栏、页面外）被裁掉，内容仍是矢量。
        var px = (W - tile.cw * s) / 2, py = (H - tile.ch * s) / 2;
        page.pushOperators(PDFLib.pushGraphicsState());
        page.pushOperators(
          PDFLib.rectangle(px, py, tile.cw * s, tile.ch * s),
          PDFLib.clip(),
          PDFLib.endPath()   // W 之后必须结束路径，部分渲染器（含 macOS PDFKit）才会应用裁剪
        );
        page.pushOperators(PDFLib.concatTransformationMatrix(m[0], m[1], m[2], m[3], m[4], m[5]));
        page.drawPage(em, { x: 0, y: 0, width: box.w0, height: box.h0 });
        page.pushOperators(PDFLib.popGraphicsState());

        outputPages.push({
          source: indices[k], tile: t, row: tile.row, col: tile.col,
          crop: [tile.cx, tile.cy, tile.cw, tile.ch], scale: s
        });
      }
    }

    out.setTitle('A4 分页结果');
    out.setProducer('static_tools / pdf-a4');
    out.setCreator('static_tools / pdf-a4');
    var bytes = await out.save();
    return {
      bytes: bytes,
      info: {
        paper: o.paperName, paperSize: [W, H],
        mode: o.mode, cols: o.cols, rows: o.rows,
        cuts: o.cuts, rowCuts: o.rowCuts, margin: o.margin, overlap: o.overlap, scale: o.scale,
        sourcePages: sourcePages, outputPages: outputPages,
        sourceCount: sourcePages.length, outputCount: outputPages.length
      }
    };
  }

  // 根据页面比例给一个默认建议（仅用于 UI 提示，不强制）
  function suggest(pageSize) {
    if (!pageSize) return { mode: 'fit', cols: 1, cuts: null, note: '' };
    var ratio = pageSize[0] / pageSize[1];
    if (ratio > 1.25) {
      return {
        mode: 'columns', cols: 3, cuts: [0, 34, 65, 100],
        note: '检测到横向大页，默认按三栏切开（切线可微调，避开文字）'
      };
    }
    return { mode: 'fit', cols: 1, cuts: null,
      note: '竖版页面，默认整页等比缩放' };
  }

  return {
    PAPERS: PAPERS, MM: MM,
    convert: convert, suggest: suggest,
    normalizeOptions: normalizeOptions, makeTiles: makeTiles,
    displayBox: displayBox, transform: transform, parsePageRange: parsePageRange,
    parsePercents: parsePercents
  };
});
