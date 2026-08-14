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
      { text: "字", fontSize: 150, color: "#ffffff", opacity: 1, x: 128, y: 128, rotation: 0, bold: true, font: FONT_OPTIONS[0].value }
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

  // 图层标题：用文字内容命名，而非序号
  function layerName(text) {
    var t = (text || "").trim();
    return "图层（" + (t ? t : "空") + "）";
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

  // 在任意 ctx 上以 size 为边长绘制整张图标
  // 绘制单层文字，可绕锚点 (x,y) 旋转。alpha 由调用方设置。
  function paintLayerCore(ctx, layer, scale) {
    ctx.fillStyle = layer.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // 字号取整，避免非整数字体大小导致模糊
    var fSize = Math.round(layer.fontSize * scale);
    ctx.font = (layer.bold ? "bold " : "") + fSize + "px " + (layer.font || "sans-serif");
    // 坐标取整，避免亚像素抗锯齿模糊
    var cx = Math.round(layer.x * scale);
    var cy = Math.round(layer.y * scale);
    if (layer.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate(layer.rotation * Math.PI / 180);
      ctx.fillText(layer.text, 0, 0);
    } else {
      ctx.fillText(layer.text, cx, cy);
    }
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
      if (!layer.text) continue;
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

  function renderLayers() {
    layersEl.innerHTML = "";
    state.layers.forEach(function (layer, i) {
      var card = document.createElement("div");
      card.className = "layer-card" + (i === selectedLayerIndex ? " selected" : "");
      card.innerHTML =
        '<div class="layer-head">' +
          '<span class="layer-title"><span class="drag-handle" draggable="true" title="按住拖动调整顺序" data-handle="1">⠿</span> <span class="layer-name">' + escapeAttr(layerName(layer.text)) + '</span></span>' +
          '<span class="layer-actions">' +
            '<button class="btn-del" data-act="del" type="button">删除</button>' +
          '</span>' +
        '</div>' +
        '<div class="layer-field">' +
          '<label>文字</label>' +
          '<input type="text" data-f="text" value="' + escapeAttr(layer.text) + '" />' +
        '</div>' +
        '<div class="layer-field">' +
          '<label>字号</label>' +
          '<input type="range" min="8" max="256" step="1" data-f="fontSize" value="' + layer.fontSize + '" />' +
          '<span class="val">' + layer.fontSize + '</span>' +
        '</div>' +
        '<div class="layer-grid">' +
          '<div class="layer-field">' +
            '<label>颜色</label>' +
            '<input type="color" data-f="color" value="' + layer.color + '" />' +
          '</div>' +
          '<div class="layer-field">' +
            '<label>透明度</label>' +
            '<input type="range" min="0" max="1" step="0.01" data-f="opacity" value="' + layer.opacity + '" />' +
            '<span class="val">' + Math.round(layer.opacity * 100) + '%</span>' +
          '</div>' +
          '<div class="layer-field">' +
            '<label>位置 X</label>' +
            '<input type="range" min="0" max="256" step="1" data-f="x" value="' + layer.x + '" />' +
            '<span class="val">' + layer.x + '</span>' +
          '</div>' +
          '<div class="layer-field">' +
            '<label>位置 Y</label>' +
            '<input type="range" min="0" max="256" step="1" data-f="y" value="' + layer.y + '" />' +
            '<span class="val">' + layer.y + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="layer-field">' +
          '<label>旋转</label>' +
          '<input type="range" min="-180" max="180" step="1" data-f="rotation" value="' + (layer.rotation || 0) + '" />' +
          '<span class="val">' + (layer.rotation || 0) + '°</span>' +
        '</div>' +
        '<div class="layer-field">' +
          '<label>字体</label>' +
          '<select data-f="font">' + buildFontOptions(layer.font) + '</select>' +
        '</div>' +
        '<div class="layer-field">' +
          '<label class="check"><input type="checkbox" data-f="bold"' + (layer.bold ? " checked" : "") + ' /> <span>加粗</span></label>' +
        '</div>';

      // 拖拽排序 + 删除
      var handle = card.querySelector('[data-handle]');
      var delBtn = card.querySelector('[data-act="del"]');

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

      delBtn.addEventListener("click", function () {
        state.layers.splice(i, 1);
        renderLayers();
        drawPreview();
      });

      // 字段绑定
      Array.prototype.forEach.call(card.querySelectorAll("[data-f]"), function (input) {
        var field = input.getAttribute("data-f");
        var handler = function () {
          if (input.type === "checkbox") {
            layer[field] = input.checked;
          } else if (input.type === "range") {
            var num = parseFloat(input.value);
            // 位置和字号取整，避免浮点累积
            if (field === "x" || field === "y" || field === "fontSize") num = Math.round(num);
            layer[field] = num;
            var valSpan = input.parentNode.querySelector(".val");
            if (valSpan) {
              valSpan.textContent = field === "opacity" ? Math.round(num * 100) + "%" : (field === "rotation" ? Math.round(num) + "°" : Math.round(num));
            }
          } else {
            layer[field] = input.value;
            if (field === "text") {
              var nameEl = card.querySelector(".layer-name");
              if (nameEl) nameEl.textContent = layerName(layer.text);
            }
          }
          drawPreview();
        };
        input.addEventListener("input", handler);
        input.addEventListener("change", handler);
      });

      layersEl.appendChild(card);
    });
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
        '<button class="btn-sm" data-size="' + s + '" type="button">下载 .ico</button>';
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
  var selectedLayerIndex = null;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // 单层文字离屏渲染（不透明度置 1，用于命中测试）
  function layerCanvas(layer, size) {
    var c = document.createElement("canvas");
    c.width = size; c.height = size;
    var ctx = c.getContext("2d");
    ctx.globalAlpha = 1;
    paintLayerCore(ctx, layer, size / BASE);
    return ctx;
  }

  // 以光标为中心，向外搜索最近的文字像素（容差范围内）。
  // 返回最近文字所属图层索引；范围内无文字则返回 -1。
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
      if (!layer.text) continue;
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
    selectedLayerIndex = idx;
    Array.prototype.forEach.call(layersEl.children, function (card, ci) {
      card.classList.toggle("selected", ci === idx);
    });
  }

  // 拖拽后把位置同步回该图层卡片的 X / Y 滑块
  function syncLayerXY(idx) {
    var card = layersEl.children[idx];
    if (!card) return;
    var layer = state.layers[idx];
    var xInput = card.querySelector('[data-f="x"]');
    var yInput = card.querySelector('[data-f="y"]');
    if (xInput) {
      xInput.value = Math.round(layer.x);
      var vx = xInput.parentNode.querySelector(".val");
      if (vx) vx.textContent = Math.round(layer.x);
    }
    if (yInput) {
      yInput.value = Math.round(layer.y);
      var vy = yInput.parentNode.querySelector(".val");
      if (vy) vy.textContent = Math.round(layer.y);
    }
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

    $("addLayer").addEventListener("click", function () {
      state.layers.push({
        text: "新", fontSize: 120, color: nextColor(), opacity: 1,
        x: 128, y: 128, rotation: 0, bold: false, font: FONT_OPTIONS[0].value
      });
      renderLayers();
      drawPreview();
    });

    $("download").addEventListener("click", buildIco);
  }

  // ---- 初始化 ----
  $("bgColor").disabled = state.transparent;
  renderLayers();
  renderSizeList();
  bindGlobal();
  bindPreviewDrag();
  drawPreview();
})();
