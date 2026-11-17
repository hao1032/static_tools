/* pdf-a4 网页版交互：全部逻辑在本地浏览器，文件不上传 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var state = {
    bytes: null, fileName: '', srcDoc: null, box: null,
    mode: 'columns', userTouched: false,
    result: null, blobUrl: null, revokeTimer: null
  };

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
      opts.mode = 'columns'; opts.cuts = $('cuts').value; opts.rows = 1;
    } else if (state.mode === 'split') {
      opts.mode = 'columns'; opts.cuts = '0,50,100'; opts.rows = 1;
    } else if (state.mode === 'grid') {
      opts.mode = 'grid'; opts.cols = $('cols').value; opts.rows = $('rows').value;
    } else {
      opts.mode = 'fit';
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
      d.innerHTML = (i + 1) + '<small>' + Math.round(t.cw / A4Core.MM) + '×' +
        Math.round(t.ch / A4Core.MM) + 'mm</small>';
      map.appendChild(d);
    });
    $('mapInfo').textContent = fmtSize(box.w) + ' × ' + fmtSize(box.h) +
      (box.rot ? ' · 原件带 ' + box.rot + '° 旋转' : '');
    $('mapNote').textContent = pageCount > 1
      ? '共 ' + pageCount + ' 页原件，每页切成 ' + perPage + ' 块 → ' + (pageCount * perPage) +
        ' 张 A4；页序按原件顺序展开（图示为第 1 页，圈内数字是每页内的顺序）。'
      : '虚线框代表一页原件，蓝框是每张 A4 取到的区域；圈内数字即输出页序。';
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
    $(id).addEventListener('input', function () { state.userTouched = true; schedule(); });
    $(id).addEventListener('change', function () { state.userTouched = true; schedule(); });
  });
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
