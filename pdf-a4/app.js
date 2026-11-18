/* pdf-a4 网页版交互：全部逻辑在本地浏览器，文件不上传 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var state = {
    bytes: null, fileName: '', srcDoc: null, box: null,
    mode: 'columns', userTouched: false, rowCuts: null,
    result: null, blobUrl: null, revokeTimer: null
  };
  var mapBounds = { x: null, y: null };   // 示意图上当前切线（百分比数组）
  var drag = null;                        // 正在拖动的分割线

  function setStatus(text, kind) {
    var el = $('status');
    el.textContent = text;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  function fmtSize(pt) { return (pt / A4Core.MM).toFixed(0) + 'mm'; }
  function fmtPct(v) {
    var n = v * 100;
    return (Math.abs(n - Math.round(n)) < 0.05 ? Math.round(n) : n.toFixed(1)) + '%';
  }

  function readOptions() {
    var opts = {
      paper: $('paper').value,
      margin: (parseFloat($('marginMm').value) || 0) * A4Core.MM,
      overlap: (parseFloat($('overlapMm').value) || 0) * A4Core.MM,
      scale: $('scale').value,
      pages: $('pages').value.trim() || null
    };
    if (state.mode === 'columns') {
      opts.mode = 'columns'; opts.cuts = $('cuts').value; opts.rows = 1; opts.rowCuts = null;
    } else if (state.mode === 'split') {
      opts.mode = 'columns'; opts.cuts = '0,50,100'; opts.rows = 1; opts.rowCuts = null;
    } else if (state.mode === 'grid') {
      opts.mode = 'grid'; opts.cols = $('cols').value; opts.rows = $('rows').value;
      opts.rowCuts = state.rowCuts;
    } else {
      opts.mode = 'fit'; opts.rowCuts = null;
    }
    return opts;
  }

  function syncModeUI() {
    Array.prototype.forEach.call(document.querySelectorAll('#modeSeg button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === state.mode);
    });
    $('cutsField').style.display = state.mode === 'columns' ? '' : 'none';
    $('gridField').style.display = state.mode === 'grid' ? '' : 'none';
  }

  function evenCuts(n) {
    var a = [];
    for (var i = 0; i <= n; i++) a.push(100 * i / n);
    return a;
  }

  // 拖动时不重建示意图（会丢 pointer capture），只改现有蓝框的位置和尺寸
  function applyTilesLive() {
    if (!state.box) return;
    var tiles = A4Core.makeTiles(state.box, A4Core.normalizeOptions(readOptions()));
    var nodes = $('map').querySelectorAll('.tile');
    tiles.forEach(function (t, i) {
      var n = nodes[i]; if (!n) return;
      n.style.left = (t.cx / state.box.w * 100) + '%';
      n.style.width = (t.cw / state.box.w * 100) + '%';
      n.style.bottom = (t.cy / state.box.h * 100) + '%';
      n.style.height = (t.ch / state.box.h * 100) + '%';
      var pxW = (t.cw / state.box.w) * $('map').clientWidth;
      n.innerHTML = (i + 1) + (pxW >= 62 ? '<small>' + Math.round(t.cw / A4Core.MM) + '×' +
        Math.round(t.ch / A4Core.MM) + 'mm</small>' : '');
    });
  }

  function applyCut(axis, arr, line) {
    if (axis === 'x') { mapBounds.x = arr; $('cuts').value = arr.join(','); }
    else { mapBounds.y = arr; state.rowCuts = arr.slice(); }
    if (line) {
      var i = parseInt(line.dataset.index, 10);
      line.style[axis === 'x' ? 'left' : 'top'] = arr[i] + '%';
      var grip = line.querySelector('.grip');
      if (grip) grip.textContent = arr[i].toFixed(1) + '%';
    }
    state.userTouched = true;
    applyTilesLive();
  }

  function clampCut(arr, i, raw) {
    var lo = arr[i - 1] + 1, hi = arr[i + 1] - 1;   // 相邻块至少留 1%
    if (hi < lo) lo = hi = (lo + hi) / 2;
    return Math.round(Math.max(lo, Math.min(hi, raw)) * 10) / 10;
  }

  function onCutDown(e) {
    var line = e.currentTarget;
    var axis = line.dataset.axis, i = parseInt(line.dataset.index, 10);
    var arr = axis === 'x' ? mapBounds.x : mapBounds.y;
    if (!arr) return;
    drag = { line: line, axis: axis, i: i, arr: arr.slice(), pointerId: e.pointerId };
    line.classList.add('dragging');
    try { line.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  }

  function onCutMove(e) {
    if (!drag) return;
    var rect = $('map').getBoundingClientRect();
    var raw = drag.axis === 'x'
      ? (e.clientX - rect.left) / rect.width * 100
      : (e.clientY - rect.top) / rect.height * 100;
    drag.arr[drag.i] = clampCut(drag.arr, drag.i, raw);
    applyCut(drag.axis, drag.arr, drag.line);
  }

  function onCutUp(e) {
    if (!drag) return;
    drag.line.classList.remove('dragging');
    try { drag.line.releasePointerCapture(drag.pointerId); } catch (_) {}
    drag = null;
    schedule();   // 松手后才重新生成 PDF，拖动过程中只动示意图
  }

  function onCutKey(e) {
    var delta = 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') delta = -0.5;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') delta = 0.5;
    else return;
    e.preventDefault();
    var line = e.currentTarget;
    var axis = line.dataset.axis, i = parseInt(line.dataset.index, 10);
    var arr = (axis === 'x' ? mapBounds.x : mapBounds.y).slice();
    arr[i] = clampCut(arr, i, arr[i] + delta);
    applyCut(axis, arr, line);
    schedule();
  }

  function addCutLines(axis, values, map) {
    if (!values) return;
    for (var i = 1; i < values.length - 1; i++) {
      var line = document.createElement('div');
      line.className = 'cut-line ' + (axis === 'x' ? 'v' : 'h');
      line.style[axis === 'x' ? 'left' : 'top'] = values[i] + '%';
      line.dataset.axis = axis;
      line.dataset.index = String(i);
      line.tabIndex = 0;
      line.title = '拖动调整切线；方向键以 0.5% 步进微调';
      line.innerHTML = '<div class="bar"></div><div class="grip">' + values[i].toFixed(1) + '%</div>';
      line.addEventListener('pointerdown', onCutDown);
      line.addEventListener('keydown', onCutKey);
      map.appendChild(line);
    }
  }

  function renderMap(opts, info) {
    var map = $('map'), box = state.box;
    map.innerHTML = '';
    if (!box) { map.style.width = '0'; map.style.height = '0'; return; }
    var maxW = 420, maxH = 190;
    var k = Math.min(maxW / box.w, maxH / box.h);
    map.style.width = (box.w * k) + 'px';
    map.style.height = (box.h * k) + 'px';

    var o = A4Core.normalizeOptions(opts);
    var tiles = A4Core.makeTiles(box, o);
    var perPage = tiles.length;
    var pageCount = info ? info.sourceCount : 1;
    tiles.forEach(function (t, i) {
      var d = document.createElement('div');
      d.className = 'tile';
      d.style.left = (t.cx / box.w * 100) + '%';
      d.style.width = (t.cw / box.w * 100) + '%';
      d.style.bottom = (t.cy / box.h * 100) + '%';
      d.style.height = (t.ch / box.h * 100) + '%';
      var pxW = (t.cw / box.w) * map.clientWidth;
      d.innerHTML = (i + 1) + (pxW >= 62 ? '<small>' + Math.round(t.cw / A4Core.MM) + '×' +
        Math.round(t.ch / A4Core.MM) + 'mm</small>' : '');
      map.appendChild(d);
    });
    // 竖线调分栏，横线调网格行；拖动线时不重建 DOM，松手后才重新生成
    var xLines = null, yLines = null;
    if (state.mode === 'columns') xLines = o.cuts;
    else if (state.mode === 'grid') {
      xLines = o.cuts || evenCuts(o.cols);
      if (o.rows > 1) yLines = o.rowCuts || evenCuts(o.rows);
    }
    mapBounds = { x: xLines ? xLines.slice() : null, y: yLines ? yLines.slice() : null };
    addCutLines('x', xLines, map);
    addCutLines('y', yLines, map);

    $('mapInfo').textContent = fmtSize(box.w) + ' × ' + fmtSize(box.h) +
      (box.rot ? ' · 原件带 ' + box.rot + '° 旋转' : '');
    var note = pageCount > 1
      ? '共 ' + pageCount + ' 页原件，每页切成 ' + perPage + ' 块 → ' + (pageCount * perPage) +
        ' 张 A4；页序按原件顺序展开（图示为第 1 页，圈内数字是每页内的顺序）。'
      : '虚线框代表一页原件，蓝框是每张 A4 取到的区域；圈内数字即输出页序。';
    if (xLines || yLines) note += ' 拖动橙色分割线（或方向键）可微调切线。';
    $('mapNote').textContent = note;
  }

  function setPreview(bytes) {
    var old = state.blobUrl;
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    state.blobUrl = url;
    $('frame').src = url + '#view=FitH&toolbar=0';
    $('empty').style.display = 'none';
    $('download').disabled = false;
    $('open').disabled = false;
    if (old) {
      clearTimeout(state.revokeTimer);
      state.revokeTimer = setTimeout(function () { URL.revokeObjectURL(old); }, 1500);
    }
  }

  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(build, 180);
  }

  async function build() {
    if (!state.bytes) return;
    var opts = readOptions();
    renderMap(opts, state.result ? state.result.info : null);
    setStatus('正在生成 A4 PDF…', 'idle');
    try {
      var res = await A4Core.convert(state.bytes, opts, window.PDFLib);
      state.result = res;
      var info = res.info;
      var scales = info.outputPages.map(function (p) { return fmtPct(p.scale); });
      var uniq = scales.filter(function (v, i) { return scales.indexOf(v) === i; }).join(' / ');
      setStatus('✓ ' + info.sourceCount + ' 页原件 → ' + info.outputCount + ' 页 ' + info.paper +
        '，内容缩放 ' + uniq + '；文字为矢量，可选中复制。', '');
      $('pdfInfo').textContent = info.outputCount + ' 页 · ' + fmtSize(info.paperSize[0]) + ' × ' + fmtSize(info.paperSize[1]) +
        ' · ' + (res.bytes.length / 1048576).toFixed(2) + ' MB';
      setPreview(res.bytes);
      renderMap(opts, info);
    } catch (e) {
      setStatus('转换失败：' + (e && e.message ? e.message : e), 'err');
    }
  }

  async function loadFile(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setStatus('请选择 PDF 文件。', 'err'); return;
    }
    setStatus('正在读取 ' + file.name + ' …', 'idle');
    try {
      var buf = await file.arrayBuffer();
      var bytes = new Uint8Array(buf);
      var head = String.fromCharCode.apply(null, bytes.subarray(0, 5));
      if (head.indexOf('%PDF') !== 0) throw new Error('不是有效的 PDF 文件');
      var doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      if (!doc.getPageCount()) throw new Error('PDF 没有页面');
      var p = doc.getPage(0);
      var box = A4Core.displayBox({ width: p.getWidth(), height: p.getHeight() }, p.getRotation().angle);

      state.bytes = bytes;
      state.fileName = file.name;
      state.srcDoc = doc;
      state.box = box;
      state.result = null;
      state.rowCuts = null;

      $('fileInfo').textContent = file.name + ' · ' + doc.getPageCount() + ' 页 · ' +
        (bytes.length / 1048576).toFixed(2) + ' MB · 每页 ' + fmtSize(box.w) + ' × ' + fmtSize(box.h);

      if (!state.userTouched) {
        var s = A4Core.suggest([box.w, box.h]);
        state.mode = s.mode;
        if (s.cuts) $('cuts').value = s.cuts.join(',');
        if (s.mode === 'fit') $('paper').value = box.w > box.h ? 'A4-landscape' : 'A4';
        else $('paper').value = 'A4';
        syncModeUI();
      }
      await build();
    } catch (e) {
      setStatus('读取失败：' + (e && e.message ? e.message : e), 'err');
    }
  }

  // 事件绑定
  var drop = $('drop'), fileInput = $('file');
  drop.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () { loadFile(fileInput.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

  $('modeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.mode = b.getAttribute('data-mode');
    state.userTouched = true;
    state.rowCuts = null;   // 换模式后行切线回到等分
    syncModeUI();
    if (state.mode === 'fit' && $('paper').value === 'A4' && state.box && state.box.w > state.box.h) {
      $('paper').value = 'A4-landscape';
    } else if (state.mode !== 'fit' && $('paper').value === 'A4-landscape') {
      $('paper').value = 'A4';
    }
    schedule();
  });
  $('presets').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    $('cuts').value = b.getAttribute('data-cuts');
    state.userTouched = true;
    schedule();
  });
  ['cuts', 'cols', 'rows', 'paper', 'scale', 'marginMm', 'overlapMm', 'pages'].forEach(function (id) {
    function changed() {
      state.userTouched = true;
      if (id === 'rows') state.rowCuts = null;   // 改行数后重回等分
      schedule();
    }
    $(id).addEventListener('input', changed);
    $(id).addEventListener('change', changed);
  });
  window.addEventListener('pointermove', onCutMove);
  window.addEventListener('pointerup', onCutUp);
  window.addEventListener('pointercancel', onCutUp);
  $('download').addEventListener('click', function () {
    if (!state.blobUrl) return;
    var a = document.createElement('a');
    a.href = state.blobUrl;
    a.download = state.fileName.replace(/\.pdf$/i, '') + '_A4.pdf';
    document.body.appendChild(a); a.click(); a.remove();
  });
  $('open').addEventListener('click', function () { if (state.blobUrl) window.open(state.blobUrl, '_blank'); });
  syncModeUI();
})();
