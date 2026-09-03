(function () {
  "use strict";

  // 所有坐标/字号/圆角都在 256×256 的虚拟画布上定义，导出时按比例缩放。
  var BASE = 256;

  var FONT_OPTIONS = [
    { label: "无衬线（中文友好）", value: '"PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif' },
    { label: "系统默认", value: "sans-serif" },
    { label: "衬线 Serif", value: '"Songti SC","SimSun",serif' },
    { label: "等宽 Mono", value: '"SFMono-Regular",Consolas,monospace' },
    { label: "楷体 KaiTi", value: '"KaiTi","STKaiti",serif' }
  ];

  var EXPORT_SIZES = [16, 32, 48, 64, 128, 256];

  // 每层默认使用不同颜色
  var PALETTE = [
    "#ffffff", "#f87171", "#fbbf24", "#34d399", "#60a5fa",
    "#a78bfa", "#f472b6", "#22d3ee", "#fb923c", "#4ade80"
  ];

  // ---- 状态 ----
  var state = {
    background: "#2563eb",
    transparent: false,
    cornerRadius: 0,
    border: false,
    borderWidth: 16,
    borderColor: "#111827",
    fileName: "icon",
    sizes: EXPORT_SIZES.slice(),
    layers: [
      { mode: "text", text: "字", scale: 75, color: "#ffffff", opacity: 1, x: 128, y: 128, rotation: 0, bold: true, font: FONT_OPTIONS[0].value, img: null, src: "", imgName: "" }
    ]
  };

  // 拖拽排序时的源索引
  var dragIndex = null;

  // ---- DOM ----
  var $ = function (id) { return document.getElementById(id); };
  var preview = $("preview");
  var layersEl = $("layers");
  var sizeListEl = $("sizeList");
  var tilesEl = $("tiles");

  // ---- 工具函数 ----
  function nextColor() {
    var used = state.layers.map(function (l) { return l.color.toLowerCase(); });
    for (var i = 0; i < PALETTE.length; i++) {
      if (used.indexOf(PALETTE[i].toLowerCase()) === -1) return PALETTE[i];
    }
    return PALETTE[state.layers.length % PALETTE.length];
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // 图层标题：按当前内容类型命名（文字 / 图片互斥）
  function layerName(layer) {
    if (layer.mode === "image") {
      return "层（图片 · " + (layer.imgName || (hasImage(layer) ? "已导入" : "未导入")) + "）";
    }
    var t = (layer.text || "").trim();
    return "层（" + (t ? t : "空") + "）";
  }

  // 该层是否真的有可绘制内容（文字模式需有文字，图片模式需已导入图片）
  function hasContent(layer) {
    if (layer.mode === "image") return hasImage(layer);
    return !!layer.text;
  }

  function hasImage(layer) {
    var s = imgSize(layer.img);
    return !!layer.img && s.w > 0 && s.h > 0;
  }

  // 图片实际尺寸；部分 SVG 没有内在宽高，兜底 300×300
  function imgSize(img) {
    if (!img) return { w: 0, h: 0 };
    var w = img.naturalWidth || img.width || 0;
    var h = img.naturalHeight || img.height || 0;
    if (w > 0 && h > 0) return { w: w, h: h };
    return { w: 300, h: 300 };
  }

  function thumbHtml(layer) {
    if (layer.src) return '<img class="layer-thumb" src="' + escapeAttr(layer.src) + '" alt="" />';
    return '<span class="layer-thumb layer-thumb-empty">未导入</span>';
  }

  // 读取本地图片文件到图层（dataURL，不上传、不联网）
  function loadImageFile(layer, file) {
    if (!file || !/^image\//.test(file.type || "")) {
      alert("请选择图片文件（PNG / JPG / SVG 等）。");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        layer.img = img;
        layer.src = String(reader.result);
        layer.imgName = file.name;
        if (!layer.scale) layer.scale = 100;
        renderLayers();
        drawPreview();
      };
      img.onerror = function () { alert("图片解析失败，请换一张试试。"); };
      img.src = String(reader.result);
    };
    reader.onerror = function () { alert("图片读取失败，请重试。"); };
    reader.readAsDataURL(file);
  }

  // ---- 绘图 ----
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    if (r < 0) r = 0;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 文字层：缩放百分比 → 画布像素字号（100% = 200px）
  function textPx(layer) { return (layer.scale || 100) * 2; }

  // 在任意 ctx 上以 size 为边长绘制整张图标
  // 绘制单层内容（文字与图片互斥，由 layer.mode 决定）。alpha 由调用方设置。
  function paintLayerCore(ctx, layer, s) {
    // 坐标取整，避免亚像素抗锯齿模糊
    var cx = Math.round(layer.x * s);
    var cy = Math.round(layer.y * s);
    ctx.save();
    ctx.translate(cx, cy);
    if (layer.rotation) ctx.rotate(layer.rotation * Math.PI / 180);

    if (layer.mode === "image") {
      if (!hasImage(layer)) { ctx.restore(); return; }
      // 图片：等比居中于锚点
      var dim = imgSize(layer.img);
      // 缩放 100% = 等比铺满 256 画布（按较长边计算），保持原始宽高比
      var kb = (BASE * (layer.scale || 100) / 100) / Math.max(dim.w, dim.h);
      var w = dim.w * kb * s;
      var h = dim.h * kb * s;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(layer.img, -w / 2, -h / 2, w, h);
    } else if (layer.text) {
      // 文字：居中于锚点
      ctx.fillStyle = layer.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // 字号取整，避免非整数字体大小导致模糊
      var fSize = Math.round(textPx(layer) * s);
      ctx.font = (layer.bold ? "bold " : "") + fSize + "px " + (layer.font || "sans-serif");
      ctx.fillText(layer.text, 0, 0);
    }

    ctx.restore();
  }

  function drawScene(ctx, size) {
    var scale = size / BASE;
    ctx.clearRect(0, 0, size, size);

    if (!state.transparent) {
      roundRect(ctx, 0, 0, size, size, state.cornerRadius * scale);
      ctx.fillStyle = state.background;
      ctx.fill();
    }

    // 边框：勾选后绘制，支持透明背景（仅边框环）；圆角沿用 cornerRadius
    if (state.border) {
      var bw = state.borderWidth * scale;
      var inset = bw / 2;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = state.borderColor;
      ctx.lineWidth = bw;
      roundRect(ctx, inset, inset, size - bw, size - bw, state.cornerRadius * scale);
      ctx.stroke();
      ctx.restore();
    }

    // 列表越靠上的图层，绘制在越上层（倒序遍历，layer[0] 最后绘制=最顶）
    for (var i = state.layers.length - 1; i >= 0; i--) {
      var layer = state.layers[i];
      if (!hasContent(layer)) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      paintLayerCore(ctx, layer, scale);
      ctx.restore();
    }
  }

  // 超采样倍率：小尺寸用更高倍率渲染再缩小，提升清晰度
  function superSampleFactor(size) {
    if (size <= 16) return 4;
    if (size <= 48) return 2;
    return 1;
  }

  function drawToCanvas(canvas, size) {
    var factor = superSampleFactor(size);
    var renderSize = size * factor;
    canvas.width = size;
    canvas.height = size;

    if (factor === 1) {
      // 大尺寸直接渲染
      drawScene(canvas.getContext("2d"), size);
    } else {
      // 超采样：在高分辨率画布上绘制，再高质量缩小到目标尺寸
      var offscreen = document.createElement("canvas");
      offscreen.width = renderSize;
      offscreen.height = renderSize;
      var offCtx = offscreen.getContext("2d");
      drawScene(offCtx, renderSize);

      var ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(offscreen, 0, 0, size, size);
    }
  }

  function drawPreview() {
    drawToCanvas(preview, preview.width);
    var tileDefs = [64, 32, 16];
    tilesEl.innerHTML = "";
    tileDefs.forEach(function (s) {
      var tile = document.createElement("div");
      tile.className = "tile";
      var c = document.createElement("canvas");
      c.width = s; c.height = s; c.style.width = s + "px"; c.style.height = s + "px";
      drawToCanvas(c, s);
      var label = document.createElement("span");
      label.textContent = s + "px";
      tile.appendChild(c);
      tile.appendChild(label);
      tilesEl.appendChild(tile);
    });
    $("previewLabel").textContent = "预览 " + preview.width + "×" + preview.width;
  }

  // ---- 图层 UI ----
  function buildFontOptions(selected) {
    return FONT_OPTIONS.map(function (o) {
      return '<option value="' + escapeAttr(o.value) + '"' + (o.value === selected ? " selected" : "") + ">" + o.label + "</option>";
    }).join("");
  }

  // ---- 字段块 HTML 构造（统一“标签在上、控件在下”的版式）----
  function fieldHtml(label, ctl, opts) {
    opts = opts || {};
    var cls = "field" + (opts.span2 ? " span2" : "");
    return '<div class="' + cls + '"' + (opts.hidden ? " hidden" : "") +
      (opts.slot ? ' data-slot="' + opts.slot + '"' : "") + '>' +
      '<label>' + label + '</label><div class="ctl">' + ctl + '</div></div>';
  }

  function sliderHtml(label, key, min, max, step, value, valText, slot) {
    return fieldHtml(label,
      '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" data-f="' + key + '" value="' + value + '" />' +
      '<span class="val">' + valText + '</span>',
      { slot: slot });
  }

  // 内容区（文字输入 / 图片导入），互斥
  function contentHtml(layer) {
    if (layer.mode === "image") {
      return fieldHtml("图片",
        '<span class="img-ctl">' + thumbHtml(layer) +
        '<span class="img-btns">' +
          '<button class="btn btn-mini" data-act="pick" type="button">' + (layer.src ? "更换图片" : "导入图片") + '</button>' +
          (layer.src ? '<button class="btn-mini btn-remove" data-act="clearimg" type="button">移除</button>' : "") +
        '</span>' +
        '<input type="file" accept="image/*" data-file="1" hidden />' +
        '</span>',
        { span2: true, slot: "content" });
    }
    return fieldHtml("文字",
      '<input type="text" class="text-input" data-f="text" value="' + escapeAttr(layer.text || "") + '" placeholder="输入文字，支持中文" />',
      { span2: true, slot: "content" });
  }

  // 主尺寸：文字/图片统一用「缩放」百分比
  function sizeHtml(layer) {
    return sliderHtml("缩放", "scale", 5, 300, 1, (layer.scale || 100), (layer.scale || 100) + "%", "size");
  }

  function renderLayers() {
    layersEl.innerHTML = "";
    state.layers.forEach(function (layer, i) {
      var isImg = layer.mode === "image";
      var card = document.createElement("div");
      card.className = "layer-card" + (layer === selectedLayerRef ? " selected" : "");

      card.innerHTML =
        '<div class="layer-head">' +
          '<span class="layer-title"><span class="drag-handle" draggable="true" title="按住拖动调整顺序" data-handle="1">⠿</span> <span class="layer-name">' + escapeAttr(layerName(layer)) + '</span></span>' +
          '<span class="layer-actions">' +
            '<span class="seg">' +
              '<button type="button" data-mode="text" class="' + (isImg ? "" : "on") + '">文字</button>' +
              '<button type="button" data-mode="image" class="' + (isImg ? "on" : "") + '">图片</button>' +
            '</span>' +
            '<button class="btn-del" data-act="del" type="button">删除</button>' +
          '</span>' +
        '</div>' +
        '<div class="layer-body">' +
          contentHtml(layer) +
          fieldHtml("字体", '<select data-f="font">' + buildFontOptions(layer.font) + '</select>', { span2: true, slot: "font", hidden: isImg }) +
          fieldHtml("颜色", '<input type="color" data-f="color" value="' + layer.color + '" />', { slot: "color", hidden: isImg }) +
          fieldHtml("加粗", '<label class="check"><input type="checkbox" data-f="bold"' + (layer.bold ? " checked" : "") + ' /> <span>启用</span></label>', { slot: "bold", hidden: isImg }) +
        '</div>';

      // 拖拽排序
      var handle = card.querySelector('[data-handle]');
      handle.addEventListener("dragstart", function (e) {
        dragIndex = i;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", String(i)); } catch (err) {}
      });
      handle.addEventListener("dragend", function () {
        card.classList.remove("dragging");
        layersEl.querySelectorAll(".drag-over").forEach(function (c) { c.classList.remove("drag-over"); });
      });
      card.addEventListener("dragover", function (e) {
        if (dragIndex === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        card.classList.add("drag-over");
      });
      card.addEventListener("dragleave", function () {
        card.classList.remove("drag-over");
      });
      card.addEventListener("drop", function (e) {
        e.preventDefault();
        card.classList.remove("drag-over");
        if (dragIndex === null || dragIndex === i) return;
        moveLayer(dragIndex, i);
      });

      // 点击卡片任意处即选中该层（便于预览拖拽与定位）
      card.addEventListener("pointerdown", function () { setSelectedLayer(i); });

      // 点击委托：删除 / 导入 / 切换类型
      card.addEventListener("click", function (e) {
        var modeBtn = e.target.closest("[data-mode]");
        if (modeBtn) { switchMode(card, layer, modeBtn.getAttribute("data-mode")); return; }
        var actEl = e.target.closest("[data-act]");
        if (actEl) {
          var a = actEl.getAttribute("data-act");
          if (a === "del") {
            state.layers.splice(i, 1);
            if (selectedLayerRef === layer) selectedLayerRef = state.layers[Math.min(i, state.layers.length - 1)] || null;
            renderLayers(); drawPreview(); renderProps();
          }
          else if (a === "pick") { var fi = card.querySelector("[data-file]"); if (fi) fi.click(); }
          else if (a === "clearimg") { layer.img = null; layer.src = ""; layer.imgName = ""; renderLayers(); drawPreview(); }
        }
      });

      // 字段输入委托：文字/颜色/字体/加粗（transform 类在右侧属性面板）
      card.addEventListener("input", function (e) { applyField(layer, e.target); });
      card.addEventListener("change", function (e) { applyField(layer, e.target); });

      // 图片文件选择（导入）
      card.addEventListener("change", function (e) {
        var fi = e.target.closest("[data-file]");
        if (!fi) return;
        var file = fi.files && fi.files[0];
        if (file) loadImageFile(layer, file);
        fi.value = "";   // 允许重复选择同一个文件
      });

      layersEl.appendChild(card);
    });
  }

  // 通用字段写入（卡片与属性面板共用）
  function applyField(layer, input) {
    var f = input.getAttribute("data-f");
    if (!f || !layer) return;
    if (input.type === "checkbox") {
      layer[f] = input.checked;
    } else if (input.type === "range") {
      var num = parseFloat(input.value);
      if (f === "x" || f === "y" || f === "scale") num = Math.round(num);
      layer[f] = num;
      var valSpan = input.parentNode.querySelector(".val");
      if (valSpan) {
        valSpan.textContent = (f === "opacity" || f === "scale")
          ? Math.round(num * 100) + "%"
          : (f === "rotation" ? Math.round(num) + "°" : String(Math.round(num)));
      }
    } else {
      layer[f] = input.value;
      if (f === "text") {
        var card = input.closest(".layer-card");
        var nameEl = card && card.querySelector(".layer-name");
        if (nameEl) nameEl.textContent = layerName(layer);
      }
    }
    drawPreview();
  }

  // 右侧属性面板：编辑当前激活层的 缩放/透明度/位置/旋转
  function renderProps() {
    var layer = selectedLayerRef;
    var body = $("propsBody");
    var title = $("propsTitle");
    if (!body) return;
    if (!layer) {
      if (title) title.textContent = "属性";
      body.innerHTML = '<p class="props-empty">在左侧点选一个层，即可编辑它的缩放、透明度、位置与旋转。</p>';
      return;
    }
    if (title) title.textContent = "属性 · " + layerName(layer);
    body.innerHTML =
      sizeHtml(layer) +
      sliderHtml("透明度", "opacity", 0, 1, 0.01, layer.opacity, Math.round(layer.opacity * 100) + "%", "opacity") +
      sliderHtml("位置 X", "x", 0, 256, 1, layer.x, String(layer.x), "x") +
      sliderHtml("位置 Y", "y", 0, 256, 1, layer.y, String(layer.y), "y") +
      fieldHtml("旋转", '<input type="range" min="-180" max="180" step="1" data-f="rotation" value="' + (layer.rotation || 0) + '" />' +
        '<span class="val">' + (layer.rotation || 0) + '°</span>', { span2: true, slot: "rotation" });
  }

  // 切换文字/图片：只替换内容区，文字专属项显示/隐藏；缩放等 transform 在右侧属性面板，不受影响
  function switchMode(card, layer, m) {
    if (layer.mode === m) return;
    layer.mode = m;
    card.querySelectorAll("[data-mode]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-mode") === m);
    });
    replaceSlot(card, "content", contentHtml(layer));
    ["font", "color", "bold"].forEach(function (s) {
      var el = card.querySelector('[data-slot="' + s + '"]');
      if (el) el.hidden = (m === "image");
    });
    var nameEl = card.querySelector(".layer-name");
    if (nameEl) nameEl.textContent = layerName(layer);
    drawPreview();
  }

  function replaceSlot(card, slot, html) {
    var wrap = document.createElement("div");
    wrap.innerHTML = html;
    var next = wrap.firstElementChild;
    var old = card.querySelector('[data-slot="' + slot + '"]');
    if (old && next) old.replaceWith(next);
  }

  function moveLayer(from, to) {
    if (from === to || from < 0 || to < 0) return;
    var arr = state.layers;
    var item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
    renderLayers();
    drawPreview();
  }

  // ---- 尺寸选择 + 单个下载 ----
  function renderSizeList() {
    sizeListEl.innerHTML = "";
    EXPORT_SIZES.forEach(function (s) {
      var on = state.sizes.indexOf(s) !== -1;
      var row = document.createElement("div");
      row.className = "size-row";
      row.innerHTML =
        '<label class="check"><input type="checkbox" value="' + s + '"' + (on ? " checked" : "") + ' /> <span>' + s + 'px</span></label>' +
        '<button class="dl" data-size="' + s + '" type="button">下载</button>';
      row.querySelector("input").addEventListener("change", function (e) {
        if (e.target.checked) {
          if (state.sizes.indexOf(s) === -1) state.sizes.push(s);
        } else {
          state.sizes = state.sizes.filter(function (x) { return x !== s; });
        }
      });
      row.querySelector("button").addEventListener("click", function () {
        downloadSingleIco(s);
      });
      sizeListEl.appendChild(row);
    });
  }

  // ---- ICO 封装（PNG-in-ICO）----
  function encodeIco(buffers, sizes) {
    var n = buffers.length;
    var headerSize = 6 + n * 16;
    var total = headerSize;
    for (var i = 0; i < n; i++) total += buffers[i].length;

    var out = new Uint8Array(total);
    var p = 0;

    // ICONDIR
    out[p++] = 0; out[p++] = 0;            // reserved
    out[p++] = 1; out[p++] = 0;            // type = icon
    out[p++] = n & 0xff; out[p++] = (n >> 8) & 0xff; // image count

    // 计算每个 PNG 的偏移
    var offsets = [];
    var off = headerSize;
    for (var k = 0; k < n; k++) { offsets.push(off); off += buffers[k].length; }

    // ICONDIRENTRY × n
    for (var j = 0; j < n; j++) {
      var sz = sizes[j];
      var b = buffers[j].length;
      out[p++] = sz >= 256 ? 0 : sz;   // width  (256 -> 0)
      out[p++] = sz >= 256 ? 0 : sz;   // height (256 -> 0)
      out[p++] = 0;                    // color count (0 = >256)
      out[p++] = 0;                    // reserved
      out[p++] = 1; out[p++] = 0;      // color planes
      out[p++] = 32; out[p++] = 0;     // bits per pixel
      out[p++] = b & 0xff; out[p++] = (b >> 8) & 0xff; out[p++] = (b >> 16) & 0xff; out[p++] = (b >> 24) & 0xff;
      var o = offsets[j];
      out[p++] = o & 0xff; out[p++] = (o >> 8) & 0xff; out[p++] = (o >> 16) & 0xff; out[p++] = (o >> 24) & 0xff;
    }

    // PNG 数据
    for (var m = 0; m < n; m++) {
      out.set(buffers[m], p);
      p += buffers[m].length;
    }
    return out;
  }

  function canvasToPngBuffer(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        blob.arrayBuffer().then(function (buf) {
          resolve(new Uint8Array(buf));
        });
      }, "image/png");
    });
  }

  function triggerDownload(bytes, filename) {
    var blob = new Blob([bytes], { type: "image/x-icon" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function downloadSingleIco(size) {
    var c = document.createElement("canvas");
    drawToCanvas(c, size);
    canvasToPngBuffer(c).then(function (buf) {
      var ico = encodeIco([buf], [size]);
      triggerDownload(ico, (state.fileName || "icon") + ".ico");
    });
  }

  function buildIco() {
    if (state.sizes.length === 0) {
      alert("请至少勾选一个导出尺寸。");
      return;
    }
    var sorted = state.sizes.slice().sort(function (a, b) { return a - b; });
    var buffers = [];
    var chain = Promise.resolve();
    sorted.forEach(function (sz) {
      chain = chain.then(function () {
        var c = document.createElement("canvas");
        drawToCanvas(c, sz);
        return canvasToPngBuffer(c).then(function (buf) { buffers.push(buf); });
      });
    });
    chain.then(function () {
      var ico = encodeIco(buffers, sorted);
      triggerDownload(ico, (state.fileName || "icon") + ".ico");
    });
  }

  // ---- 预览区拖拽改位置 ----
  var dragging = null;
  var selectedLayerRef = null;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // 单层离屏渲染（不透明度置 1，用于命中测试）
  function layerCanvas(layer, size) {
    var c = document.createElement("canvas");
    c.width = size; c.height = size;
    var ctx = c.getContext("2d");
    ctx.globalAlpha = 1;
    paintLayerCore(ctx, layer, size / BASE);
    return ctx;
  }

  // 以光标为中心，向外搜索最近的内容像素（容差范围内）。
  // 返回最近内容所属图层索引；范围内无内容则返回 -1。
  function nearestTextHit(px, py, size, maxRBase) {
    var maxR = Math.max(1, Math.round(maxRBase * size / BASE));
    var x0 = Math.max(0, Math.floor(px - maxR));
    var x1 = Math.min(size - 1, Math.ceil(px + maxR));
    var y0 = Math.max(0, Math.floor(py - maxR));
    var y1 = Math.min(size - 1, Math.ceil(py + maxR));
    if (x1 < x0 || y1 < y0) return -1;
    var w = x1 - x0 + 1, h = y1 - y0 + 1;
    var bestDist = Infinity, bestIdx = -1;
    for (var i = 0; i < state.layers.length; i++) {
      var layer = state.layers[i];
      if (!hasContent(layer)) continue;
      var ctx = layerCanvas(layer, size);
      var img = ctx.getImageData(x0, y0, w, h).data;
      for (var yy = 0; yy < h; yy++) {
        for (var xx = 0; xx < w; xx++) {
          if (img[(yy * w + xx) * 4 + 3] > 10) {
            var dx = (x0 + xx) - px, dy = (y0 + yy) - py;
            var d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; bestIdx = i; }
          }
        }
      }
    }
    return bestIdx;
  }

  function setSelectedLayer(idx) {
    selectedLayerRef = state.layers[idx] || null;
    Array.prototype.forEach.call(layersEl.children, function (card, ci) {
      card.classList.toggle("selected", state.layers[ci] === selectedLayerRef);
    });
    renderProps();
  }

  // 拖拽后把位置同步回右侧属性面板的 X / Y 滑块
  function syncLayerXY(idx) {
    var layer = state.layers[idx];
    if (layer !== selectedLayerRef) return;
    var body = $("propsBody");
    setSliderVal(body, "x", layer.x);
    setSliderVal(body, "y", layer.y);
  }

  function setSliderVal(scope, key, val) {
    if (!scope) return;
    var input = scope.querySelector('[data-f="' + key + '"]');
    if (!input) return;
    input.value = Math.round(val);
    var span = input.parentNode.querySelector(".val");
    if (span) span.textContent = Math.round(val);
  }

  function previewPoint(e) {
    var rect = preview.getBoundingClientRect();
    var cx = (e.clientX - rect.left) / rect.width;   // 0..1
    var cy = (e.clientY - rect.top) / rect.height;
    var size = preview.width;
    return { vx: cx * BASE, vy: cy * BASE, px: cx * size, py: cy * size, size: size };
  }

  function bindPreviewDrag() {
    preview.style.cursor = "grab";
    preview.addEventListener("pointerdown", function (e) {
      var p = previewPoint(e);
      var idx = nearestTextHit(p.px, p.py, p.size, 64);
      if (idx === -1) return;                 // 容差范围内无文字则不响应
      setSelectedLayer(idx);
      var layer = state.layers[idx];
      dragging = { index: idx, offsetX: layer.x - p.vx, offsetY: layer.y - p.vy };
      preview.style.cursor = "grabbing";
      if (preview.setPointerCapture) { try { preview.setPointerCapture(e.pointerId); } catch (err) {} }
      e.preventDefault();
    });
    preview.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var p = previewPoint(e);
      var layer = state.layers[dragging.index];
      layer.x = Math.round(clamp(p.vx + dragging.offsetX, 0, BASE));
      layer.y = Math.round(clamp(p.vy + dragging.offsetY, 0, BASE));
      syncLayerXY(dragging.index);
      drawPreview();
    });
    function endDrag() {
      if (dragging) { dragging = null; preview.style.cursor = "grab"; }
    }
    preview.addEventListener("pointerup", endDrag);
    preview.addEventListener("pointercancel", endDrag);
  }

  // ---- 全局控件绑定 ----
  function bindGlobal() {
    var bgColor = $("bgColor");
    var transparent = $("transparent");
    var cornerRadius = $("cornerRadius");
    var radiusVal = $("radiusVal");
    var border = $("border");
    var borderWidth = $("borderWidth");
    var borderWidthVal = $("borderWidthVal");
    var borderColor = $("borderColor");
    var fileName = $("fileName");

    transparent.addEventListener("change", function () {
      state.transparent = transparent.checked;
      bgColor.disabled = state.transparent;
      drawPreview();
    });
    bgColor.addEventListener("input", function () {
      state.background = bgColor.value;
      drawPreview();
    });
    cornerRadius.addEventListener("input", function () {
      state.cornerRadius = parseFloat(cornerRadius.value);
      radiusVal.textContent = cornerRadius.value;
      drawPreview();
    });
    border.addEventListener("change", function () {
      state.border = border.checked;
      drawPreview();
    });
    borderWidth.addEventListener("input", function () {
      state.borderWidth = parseFloat(borderWidth.value);
      borderWidthVal.textContent = borderWidth.value;
      drawPreview();
    });
    borderColor.addEventListener("input", function () {
      state.borderColor = borderColor.value;
      drawPreview();
    });
    fileName.addEventListener("input", function () {
      state.fileName = fileName.value.replace(/[^\w\-]+/g, "_");
    });

    function addLayer() {
      state.layers.push({
        mode: "text", text: "新", scale: 60, color: nextColor(), opacity: 1,
        x: 128, y: 128, rotation: 0, bold: false, font: FONT_OPTIONS[0].value,
        img: null, src: "", imgName: ""
      });
      renderLayers();
      drawPreview();
      setSelectedLayer(state.layers.length - 1);
    }

    $("addLayer").addEventListener("click", addLayer);

    $("download").addEventListener("click", buildIco);
  }

  // ---- 初始化 ----
  $("bgColor").disabled = state.transparent;

  // 属性面板（右侧）：编辑激活层的缩放/透明度/位置/旋转
  var propsCard = $("propsCard");
  if (propsCard) {
    propsCard.addEventListener("input", function (e) { if (selectedLayerRef) applyField(selectedLayerRef, e.target); });
    propsCard.addEventListener("change", function (e) { if (selectedLayerRef) applyField(selectedLayerRef, e.target); });
  }

  renderLayers();
  renderSizeList();
  bindGlobal();
  bindPreviewDrag();
  setSelectedLayer(0);
  drawPreview();
})();
