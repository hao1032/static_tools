(function () {
  'use strict';

  /* ============ 预设数据 ============ */
  const PAPERS = [
    { id: 'p4', name: '4 寸 · 102×76', w: 102, h: 76 },
    { id: '3r', name: '5 寸 (3R) · 127×89', w: 127, h: 89 },
    { id: '4r', name: '6 寸 (4R) · 152×102', w: 152, h: 102 },
    { id: '5r', name: '7 寸 (5R) · 178×127', w: 178, h: 127 },
    { id: 'a4', name: 'A4 · 297×210', w: 297, h: 210 },
    { id: 'a5', name: 'A5 · 210×148', w: 210, h: 148 },
    { id: 'custom', name: '自定义…', w: 152, h: 102 }
  ];

  const CELLS = [
    { id: '1c', name: '一寸 25×35', w: 25, h: 35 },
    { id: 'x1c', name: '小一寸 22×32', w: 22, h: 32 },
    { id: 'd1c', name: '大一寸 33×48', w: 33, h: 48 },
    { id: '2c', name: '二寸 35×49', w: 35, h: 49 },
    { id: 'x2c', name: '小二寸 35×45', w: 35, h: 45 },
    { id: 'visa', name: '签证 30×40', w: 30, h: 40 },
    { id: 'p4c', name: '四寸 76×102', w: 76, h: 102 },
    { id: 'custom', name: '自定义…', w: 25, h: 35 }
  ];

  const PRESETS = [
    { name: '一寸 ×10', hint: '6 寸纸', p: { paper: '4r', orient: 'land', mode: 'size', cell: '1c', margin: 3, gap: 2, fit: 'cover', repeat: true, radius: 0, border: 0 } },
    { name: '一寸 ×8', hint: '5 寸纸', p: { paper: '3r', orient: 'land', mode: 'size', cell: '1c', margin: 3, gap: 2, fit: 'cover', repeat: true, radius: 0, border: 0 } },
    { name: '二寸 ×4', hint: '6 寸纸', p: { paper: '4r', orient: 'land', mode: 'size', cell: '2c', margin: 3, gap: 2, fit: 'cover', repeat: true, radius: 0, border: 0 } },
    { name: '护照 ×8', hint: '6 寸纸', p: { paper: '4r', orient: 'land', mode: 'size', cell: 'd1c', margin: 2, gap: 1, fit: 'cover', repeat: true, radius: 0, border: 0 } },
    { name: 'A4 九宫格', hint: '3 × 3', p: { paper: 'a4', orient: 'port', mode: 'grid', cols: 3, rows: 3, margin: 10, gap: 4, fit: 'cover', repeat: true, radius: 0, border: 0 } },
    { name: '6 寸满版', hint: '2 张并排', p: { paper: '4r', orient: 'land', mode: 'grid', cols: 2, rows: 1, margin: 0, gap: 0, fit: 'cover', repeat: true, radius: 0, border: 0 } }
  ];

  const DEFAULTS = {
    paper: '4r', orient: 'land', pw: 152, ph: 102, bg: '#ffffff',
    mode: 'size', cell: '1c', cw: 25, ch: 35, cols: 3, rows: 3,
    margin: 3, gap: 2, fit: 'cover', border: 0, borderColor: '#ffffff',
    radius: 0, repeat: true, cut: false, dpi: 300, fmt: 'png'
  };

  const STORE_KEY = 'photo-layout:v2';

  /* ============ 工具函数 ============ */
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round = (v, n) => Math.round(v * Math.pow(10, n)) / Math.pow(10, n);

  function rr(ctx, x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    if (rad <= 0.001) {
      ctx.rect(x, y, w, h);
      return;
    }
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.arcTo(x + w, y, x + w, y + rad, rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
    ctx.lineTo(x + rad, y + h);
    ctx.arcTo(x, y + h, x, y + h - rad, rad);
    ctx.lineTo(x, y + rad);
    ctx.arcTo(x, y, x + rad, y, rad);
    ctx.closePath();
  }

  /* ============ 状态 ============ */
  const state = Object.assign({}, DEFAULTS);
  let photos = [];          // { id, name, url, img, w, h, rot, zoom, ox, oy }
  let selected = null;      // 选中的照片 id
  let view = { K: 1, pxmm: 1, L: null };

  /* ============ 排版计算 ============ */
  function paperDims() {
    const base = PAPERS.find((p) => p.id === state.paper) || PAPERS[0];
    let w = state.paper === 'custom' ? Number(state.pw) || 100 : base.w;
    let h = state.paper === 'custom' ? Number(state.ph) || 100 : base.h;
    if (state.orient === 'port') { const t = w; w = h; h = t; }
    return { w, h };
  }

  function computeLayout() {
    const P = paperDims();
    const m = Number(state.margin) || 0;
    const g = Number(state.gap) || 0;
    let cols, rows, cw, ch;

    if (state.mode === 'size') {
      const c = CELLS.find((x) => x.id === state.cell) || CELLS[0];
      cw = state.cell === 'custom' ? Number(state.cw) || 25 : c.w;
      ch = state.cell === 'custom' ? Number(state.ch) || 35 : c.h;
      cols = Math.max(1, Math.floor((P.w - 2 * m + g) / (cw + g)));
      rows = Math.max(1, Math.floor((P.h - 2 * m + g) / (ch + g)));
    } else {
      cols = clamp(Math.round(Number(state.cols) || 1), 1, 12);
      rows = clamp(Math.round(Number(state.rows) || 1), 1, 12);
      cw = (P.w - 2 * m - (cols - 1) * g) / cols;
      ch = (P.h - 2 * m - (rows - 1) * g) / rows;
    }
    if (cw <= 0 || ch <= 0) { cols = rows = 1; cw = Math.max(1, P.w - 2 * m); ch = Math.max(1, P.h - 2 * m); }

    const contentW = cols * cw + (cols - 1) * g;
    const contentH = rows * ch + (rows - 1) * g;
    const x0 = (P.w - contentW) / 2;
    const y0 = (P.h - contentH) / 2;

    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({ x: x0 + c * (cw + g), y: y0 + r * (ch + g), w: cw, h: ch });
      }
    }
    return { P, cols, rows, cw, ch, contentW, contentH, cells };
  }

  const pageCount = () => {
    const per = view.L ? view.L.cells.length : 1;
    if (!photos.length) return 1;
    return Math.max(1, Math.ceil(photos.length / per));
  };

  const byId = (id) => photos.find((p) => p.id === id) || null;

  function photoIdAt(cellIndex, page) {
    const n = photos.length;
    if (!n) return null;
    const per = view.L.cells.length;
    const gi = page * per + cellIndex;
    if (gi < n) return photos[gi].id;
    if (state.repeat) return photos[gi % n].id;
    return null;
  }

  /* 某一格当前显示的照片，在 photos 顺序里的下标（空格子返回 -1） */
  function photoIndexAt(cellIndex, page) {
    const pid = photoIdAt(cellIndex, page);
    return pid ? photos.findIndex((p) => p.id === pid) : -1;
  }

  /* 交换两个格子里的照片。
     注意交换的是「照片在顺序中的位置」而不是「格子内容」——这样循环铺满时也成立：
     只有 2 张照片铺满一页时，把 A 格拖到 B 格就是让这两张照片换位，重复的格子跟着一起换，
     不会出现「交换后有些格子还是旧照片」的矛盾状态。 */
  function swapPhotosAt(i, j, page) {
    const a = photoIndexAt(i, page);
    const b = photoIndexAt(j, page);
    if (a < 0 || b < 0 || a === b) return false;
    const t = photos[a];
    photos[a] = photos[b];
    photos[b] = t;
    return true;
  }

  /* 单元格内照片的摆放几何（单位 mm） */
  function cellGeom(photo, w, h) {
    const iw = photo.img ? photo.img.naturalWidth : 1;
    const ih = photo.img ? photo.img.naturalHeight : 1;
    const swap = photo.rot % 180 !== 0;
    const ew = swap ? ih : iw;
    const eh = swap ? iw : ih;
    const base = state.fit === 'cover' ? Math.max(w / ew, h / eh) : Math.min(w / ew, h / eh);
    const s = base * photo.zoom;
    const dw = iw * s;
    const dh = ih * s;
    const rw = swap ? dh : dw;
    const rh = swap ? dw : dh;
    // 有符号余量：>0 = 图比格子大，这是可以平移的溢出量；
    // <0 = 图比格子小（完整显示），这是可以挪动的空余量。
    // 两种情况都用 ox∈[-1,1] 映射到 ±|余量|，所以「完整显示」下照片也能靠上/靠左摆。
    return { dw, dh, ox: (rw - w) / 2, oy: (rh - h) / 2 };
  }

  /* ============ 绘制 ============ */
  function drawSheet(ctx, K, preview, page) {
    const L = view.L;
    const P = L.P;
    const pg = page == null ? state.page : page;

    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.clearRect(0, 0, P.w, P.h);
    ctx.fillStyle = state.bg;
    ctx.fillRect(0, 0, P.w, P.h);

    const radius = Number(state.radius) || 0;
    const bw = Number(state.border) || 0;

    L.cells.forEach((cell, i) => {
      const pid = photoIdAt(i, pg);
      const photo = pid ? byId(pid) : null;

      ctx.save();
      rr(ctx, cell.x, cell.y, cell.w, cell.h, radius);
      ctx.clip();
      ctx.fillStyle = state.bg;
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h);

      if (photo && photo.img) {
        const g = cellGeom(photo, cell.w, cell.h);
        const cx = cell.x + cell.w / 2 + photo.ox * g.ox;
        const cy = cell.y + cell.h / 2 + photo.oy * g.oy;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((photo.rot * Math.PI) / 180);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(photo.img, -g.dw / 2, -g.dh / 2, g.dw, g.dh);
        ctx.restore();
      } else if (preview) {
        ctx.save();
        ctx.strokeStyle = 'rgba(100,116,139,.35)';
        ctx.lineWidth = 0.25;
        ctx.setLineDash([1.2, 1.2]);
        const inset = 0.4;
        rr(ctx, cell.x + inset, cell.y + inset, Math.max(0.5, cell.w - inset * 2), Math.max(0.5, cell.h - inset * 2), Math.max(0, radius - inset));
        ctx.stroke();
        ctx.restore();
      }

      if (bw > 0) {
        ctx.lineWidth = bw * 2;
        ctx.strokeStyle = state.borderColor;
        rr(ctx, cell.x, cell.y, cell.w, cell.h, radius);
        ctx.stroke();
      }
      ctx.restore();
    });

    if (state.cut && !preview) drawCutMarks(ctx, L);
    if (state.cut && preview) drawCutMarks(ctx, L);
  }

  function drawCutMarks(ctx, L) {
    const len = 2.2;
    const off = 0.7;
    ctx.save();
    ctx.strokeStyle = 'rgba(15,23,42,.45)';
    ctx.lineWidth = 0.16;
    ctx.setLineDash([]);
    ctx.beginPath();
    L.cells.forEach((c) => {
      const x1 = c.x - off, x2 = c.x + c.w + off;
      const y1 = c.y - off, y2 = c.y + c.h + off;
      // 左上
      ctx.moveTo(x1 - len, y1); ctx.lineTo(x1, y1);
      ctx.moveTo(x1, y1 - len); ctx.lineTo(x1, y1);
      // 右上
      ctx.moveTo(x2, y1); ctx.lineTo(x2 + len, y1);
      ctx.moveTo(x2, y1 - len); ctx.lineTo(x2, y1);
      // 左下
      ctx.moveTo(x1 - len, y2); ctx.lineTo(x1, y2);
      ctx.moveTo(x1, y2); ctx.lineTo(x1, y2 + len);
      // 右下
      ctx.moveTo(x2, y2); ctx.lineTo(x2 + len, y2);
      ctx.moveTo(x2, y2); ctx.lineTo(x2, y2 + len);
    });
    ctx.stroke();
    ctx.restore();
  }

  let raf = null;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      const cv = $('canvas');
      drawSheet(cv.getContext('2d'), view.K, true, state.page);
    });
  };

  /* ============ 预览尺寸 ============ */
  function fitPreview() {
    const stage = $('stage');
    const cs = getComputedStyle(stage);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = Math.max(40, stage.clientWidth - padX);
    const availH = Math.max(40, stage.clientHeight - padY);

    const L = computeLayout();
    view.L = L;
    const P = L.P;
    const pxmm = Math.min(availW / P.w, availH / P.h);
    const dpr = window.devicePixelRatio || 1;

    const sheet = $('sheet');
    sheet.style.width = P.w * pxmm + 'px';
    sheet.style.height = P.h * pxmm + 'px';

    const cv = $('canvas');
    const K = pxmm * dpr;
    cv.width = Math.max(1, Math.round(P.w * K));
    cv.height = Math.max(1, Math.round(P.h * K));

    view.K = K;
    view.pxmm = pxmm;
    state.page = clamp(state.page, 0, pageCount() - 1);

    drawSheet(cv.getContext('2d'), K, true, state.page);
    buildOverlay();
    syncUI();
  }

  /* ============ 预览交互层 ============ */
  function buildOverlay() {
    const cellsEl = $('cells');
    const L = view.L;
    const P = L.P;
    cellsEl.innerHTML = '';
    L.cells.forEach((c, i) => {
      const pid = photoIdAt(i, state.page);
      const d = document.createElement('div');
      d.className = 'cell' + (pid ? ' has-photo' : '') + (pid && pid === selected ? ' sel' : '');
      d.style.left = (c.x / P.w) * 100 + '%';
      d.style.top = (c.y / P.h) * 100 + '%';
      d.style.width = (c.w / P.w) * 100 + '%';
      d.style.height = (c.h / P.h) * 100 + '%';
      d.dataset.i = i;
      if (pid) {
        const s = document.createElement('span');
        s.className = 'cell-idx';
        s.textContent = photoIndexAt(i, state.page) + 1;
        s.title = '按住拖动，可与另一格交换照片';
        d.appendChild(s);
      }
      cellsEl.appendChild(d);
    });
  }

  function syncSelection() {
    const cellsEl = $('cells');
    Array.prototype.forEach.call(cellsEl.children, (el) => {
      const pid = photoIdAt(+el.dataset.i, state.page);
      el.classList.toggle('sel', !!pid && pid === selected);
    });
    Array.prototype.forEach.call($('strip').children, (el) => {
      el.classList.toggle('sel', el.dataset.id === selected);
    });
  }

  /* 预览里有两种拖动，靠「抓哪里」区分：
     · 按住照片本体拖 = 调取景（原有行为，不动）
     · 抓格子左上角的序号、或长按格子再拖 = 与另一个格子交换照片
     长按阈值给得短一点，触摸屏上不用等太久。 */
  const LONG_PRESS_MS = 320;
  const MOVE_TOL = 6;

  let drag = null;    // 调取景
  let press = null;   // 已按下、还没判定是哪种拖动
  let swap = null;    // 换位置
  let ghost = null;   // 跟着指针走的浮层

  function clearPress() {
    if (press && press.timer) clearTimeout(press.timer);
    press = null;
  }

  function cellIndexAt(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    const cell = el && el.closest ? el.closest('.cell') : null;
    return cell ? +cell.dataset.i : -1;
  }

  /* 浮层直接用预览画布里那一格的像素，看起来就是「把这张照片拎起来」 */
  function makeGhost(srcEl) {
    const r = srcEl.getBoundingClientRect();
    const cv = $('canvas');
    const cr = cv.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'swap-ghost';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    const mini = document.createElement('canvas');
    const dpr = cr.width ? Math.max(1, cv.width / cr.width) : 1;
    mini.width = Math.max(1, Math.round(r.width * dpr));
    mini.height = Math.max(1, Math.round(r.height * dpr));
    try {
      mini.getContext('2d').drawImage(
        cv,
        (r.left - cr.left) * dpr, (r.top - cr.top) * dpr, r.width * dpr, r.height * dpr,
        0, 0, mini.width, mini.height
      );
    } catch (e) { /* 取不到像素就退化成半透明方块，不影响功能 */ }
    box.appendChild(mini);
    document.body.appendChild(box);
    return box;
  }

  function beginSwap(from, clientX, clientY, srcEl) {
    clearPress();
    if (swap) return;
    const r = srcEl.getBoundingClientRect();
    ghost = makeGhost(srcEl);
    swap = { from: from, to: -1, dx: clientX - r.left, dy: clientY - r.top, el: srcEl };
    srcEl.classList.add('swapping');
    document.body.classList.add('swapping');
    moveGhost(clientX, clientY);
  }

  function moveGhost(clientX, clientY) {
    ghost.style.transform = 'translate(' + (clientX - swap.dx) + 'px,' + (clientY - swap.dy) + 'px)';
    const i = cellIndexAt(clientX, clientY);
    if (i === swap.to) return;
    const box = $('cells');
    const prev = box.querySelector('.cell.drop-target');
    if (prev) prev.classList.remove('drop-target', 'ok', 'invalid');
    swap.to = i;
    if (i >= 0 && i !== swap.from) {
      const el = box.querySelector('.cell[data-i="' + i + '"]');
      if (el) {
        el.classList.add('drop-target');
        el.classList.add(canDropOn(i) ? 'ok' : 'invalid');
      }
    }
  }

  /* 这一格能不能接收：本身要有照片，且与被拖的那格不是同一张（同一张交换等于没变） */
  function canDropOn(i) {
    if (!swap || i < 0 || i === swap.from) return false;
    const a = photoIdAt(swap.from, state.page);
    const b = photoIdAt(i, state.page);
    return !!a && !!b && a !== b;
  }

  function endSwap(commit) {
    if (!swap) return;
    const s = swap;
    swap = null;
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
    document.body.classList.remove('swapping');
    const box = $('cells');
    const t = box.querySelector('.cell.drop-target');
    if (t) t.classList.remove('drop-target', 'ok', 'invalid');
    if (s.el) s.el.classList.remove('swapping');
    if (!commit || s.to < 0 || s.to === s.from) return;
    if (!swapPhotosAt(s.from, s.to, state.page)) return;
    refresh();
    renderStrip();
    syncSelection();
  }

  function endDrag() {
    if (!drag) return;
    drag = null;
    const el = $('cells').querySelector('.cell.dragging');
    if (el) el.classList.remove('dragging');
  }

  function initStageEvents() {
    const cellsEl = $('cells');

    cellsEl.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.cell');
      if (!el) return;
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      const i = +el.dataset.i;
      const pid = photoIdAt(i, state.page);
      selected = pid || null;
      syncSelection();
      if (!pid) return;
      const photo = byId(pid);
      if (!photo || !photo.img) return;

      // 抓序号角标 = 立刻进入换位（桌面端最精准）
      if (e.target.classList && e.target.classList.contains('cell-idx')) {
        beginSwap(i, e.clientX, e.clientY, el);
        return;
      }
      // 其余位置：先按住，按住不动才切到换位；一动就是调取景（触摸屏走这条）
      press = { i: i, pid: pid, x: e.clientX, y: e.clientY, el: el, timer: 0 };
      press.timer = setTimeout(() => {
        if (!press) return;
        const p = press;
        press = null;
        beginSwap(p.i, p.x, p.y, p.el);
      }, LONG_PRESS_MS);
    });

    window.addEventListener('pointermove', (e) => {
      if (swap) { moveGhost(e.clientX, e.clientY); return; }

      if (press) {
        if (Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) <= MOVE_TOL) return;
        const p = press;
        clearPress();
        const photo = byId(p.pid);
        const cell = view.L.cells[p.i];
        if (!photo || !cell) return;
        const g = cellGeom(photo, cell.w, cell.h);
        if (Math.abs(g.ox) <= 0.001 && Math.abs(g.oy) <= 0.001) return;
        drag = { pid: p.pid, ox: photo.ox, oy: photo.oy, g: g, x: p.x, y: p.y };
        p.el.classList.add('dragging');
        // 故意不 return：这一次的位移立刻生效，手感与之前完全一致
      }

      if (!drag) return;
      const p = byId(drag.pid);
      if (!p) return;
      const dx = (e.clientX - drag.x) / view.pxmm;
      const dy = (e.clientY - drag.y) / view.pxmm;
      if (Math.abs(drag.g.ox) > 0.001) p.ox = clamp(drag.ox + dx / drag.g.ox, -1, 1);
      if (Math.abs(drag.g.oy) > 0.001) p.oy = clamp(drag.oy + dy / drag.g.oy, -1, 1);
      schedule();
    });

    window.addEventListener('pointerup', () => {
      if (swap) { endSwap(true); return; }
      clearPress();
      endDrag();
    });

    window.addEventListener('pointercancel', () => {
      if (swap) { endSwap(false); return; }
      clearPress();
      endDrag();
    });

    cellsEl.addEventListener(
      'wheel',
      (e) => {
        const el = e.target.closest('.cell');
        if (!el) return;
        const pid = photoIdAt(+el.dataset.i, state.page);
        if (!pid) return;
        const photo = byId(pid);
        if (!photo) return;
        e.preventDefault();
        const base = state.fit === 'cover' ? 1 : 0.2;
        photo.zoom = clamp(photo.zoom * Math.exp(-e.deltaY * 0.0015), base, 5);
        schedule();
      },
      { passive: false }
    );

    window.addEventListener('resize', () => fitPreview());
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => fitPreview());
      ro.observe($('stage'));
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { selected = null; syncSelection(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
        e.preventDefault();
        removePhoto(selected);
      }
    });
  }

  /* ============ 照片管理 ============ */
  let uid = 0;
  let fileSeq = 0;   // 文件选择序号的发号器（与 uid 分开，只用来定顺序）

  function addFiles(files) {
    const list = Array.prototype.filter.call(files, (f) => f && f.type.indexOf('image/') === 0);
    if (!list.length) return;
    let pending = list.length;
    list.forEach((f) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      const photo = {
        id: 'p' + ++uid,
        name: f.name || '粘贴的图片',
        url: url,
        img: img,
        order: ++fileSeq,   // 同步发号：这个号就是用户点选的先后
        rot: 0,
        zoom: 1,
        ox: 0,
        oy: 0
      };
      img.onload = () => {
        // 必须按序号插进去，不能 push：图片解码完成的先后是不确定的，
        // 直接 push 会让 photos 的顺序变成「谁先解码完」，而列表顺序即排版顺序，
        // 多选上传时排出来的顺序就是随机的。
        let at = photos.length;
        for (let i = 0; i < photos.length; i++) {
          if (photos[i].order > photo.order) { at = i; break; }
        }
        photos.splice(at, 0, photo);
        if (!selected) selected = photos[0].id;
        pending--;
        renderStrip();
        fitPreview();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        pending--;
      };
      img.src = url;
    });
  }

  function removePhoto(id) {
    const i = photos.findIndex((p) => p.id === id);
    if (i < 0) return;
    URL.revokeObjectURL(photos[i].url);
    photos.splice(i, 1);
    if (selected === id) selected = photos.length ? photos[Math.min(i, photos.length - 1)].id : null;
    renderStrip();
    fitPreview();
  }

  function clearAll() {
    if (!photos.length) return;
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    selected = null;
    renderStrip();
    fitPreview();
  }

  function renderStrip() {
    const strip = $('strip');
    strip.innerHTML = '';
    photos.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'ph' + (p.id === selected ? ' sel' : '');
      el.dataset.id = p.id;
      el.draggable = true;

      const th = document.createElement('div');
      th.className = 'ph-thumb';
      const im = document.createElement('img');
      im.src = p.url;
      im.alt = '';
      im.draggable = false;
      th.appendChild(im);

      const main = document.createElement('div');
      main.className = 'ph-main';
      const nm = document.createElement('div');
      nm.className = 'ph-name';
      nm.textContent = p.name;
      nm.title = p.name;
      const dim = document.createElement('div');
      dim.className = 'ph-dim';
      dim.textContent = (p.img.naturalWidth || '?') + ' × ' + (p.img.naturalHeight || '?');
      main.appendChild(nm);
      main.appendChild(dim);

      const acts = document.createElement('div');
      acts.className = 'ph-acts';
      [['rot', '⟳', '旋转 90°'], ['reset', '⤾', '重置取景'], ['del', '×', '移除']].forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ic' + (a[0] === 'del' ? ' danger' : '');
        b.dataset.act = a[0];
        b.title = a[2];
        b.textContent = a[1];
        acts.appendChild(b);
      });

      const ord = document.createElement('span');
      ord.className = 'ph-order';
      ord.textContent = i + 1;

      el.appendChild(th);
      el.appendChild(main);
      el.appendChild(acts);
      el.appendChild(ord);
      strip.appendChild(el);
    });
    $('stripEmpty').hidden = photos.length > 0;
  }

  function initStripEvents() {
    const strip = $('strip');

    strip.addEventListener('click', (e) => {
      const item = e.target.closest('.ph');
      if (!item) return;
      const id = item.dataset.id;
      const act = e.target.dataset ? e.target.dataset.act : null;
      const photo = byId(id);
      if (!photo) return;
      if (act === 'del') return removePhoto(id);
      if (act === 'rot') {
        photo.rot = (photo.rot + 90) % 360;
        photo.ox = 0;
        photo.oy = 0;
        renderStrip();
        return fitPreview();
      }
      if (act === 'reset') {
        photo.rot = 0;
        photo.zoom = 1;
        photo.ox = 0;
        photo.oy = 0;
        renderStrip();
        return fitPreview();
      }
      selected = selected === id ? null : id;
      syncSelection();
    });

    let dragId = null;
    strip.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.ph');
      if (!item) return;
      dragId = item.dataset.id;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* noop */ }
    });
    strip.addEventListener('dragend', (e) => {
      const item = e.target.closest('.ph');
      if (item) item.classList.remove('dragging');
      Array.prototype.forEach.call(strip.children, (el) => el.classList.remove('over'));
      dragId = null;
    });
    strip.addEventListener('dragover', (e) => {
      if (!dragId) return;
      const item = e.target.closest('.ph');
      if (!item) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      Array.prototype.forEach.call(strip.children, (el) => el.classList.toggle('over', el === item));
    });
    strip.addEventListener('drop', (e) => {
      const item = e.target.closest('.ph');
      Array.prototype.forEach.call(strip.children, (el) => el.classList.remove('over'));
      if (!item || !dragId) return;
      e.preventDefault();
      const from = photos.findIndex((p) => p.id === dragId);
      const to = photos.findIndex((p) => p.id === item.dataset.id);
      if (from < 0 || to < 0 || from === to) return;
      const moved = photos.splice(from, 1)[0];
      photos.splice(to, 0, moved);
      renderStrip();
      fitPreview();
    });
  }

  /* ============ 拖拽 / 粘贴添加 ============ */
  function initDropZone() {
    const stage = $('stage');
    let depth = 0;

    window.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
      depth++;
      stage.classList.add('dropping');
    });
    window.addEventListener('dragover', (e) => {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) stage.classList.remove('dropping');
    });
    window.addEventListener('drop', (e) => {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
      e.preventDefault();
      depth = 0;
      stage.classList.remove('dropping');
      if (e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    window.addEventListener('paste', (e) => {
      if (!e.clipboardData) return;
      const files = [];
      Array.prototype.forEach.call(e.clipboardData.items || [], (it) => {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      });
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    });
  }

  /* ============ 输出 ============ */
  function renderPage(page, dpi) {
    const K = dpi / 25.4;
    const P = view.L.P;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(P.w * K));
    c.height = Math.max(1, Math.round(P.h * K));
    drawSheet(c.getContext('2d'), K, false, page);
    return c;
  }

  function paperLabel() {
    const P = paperDims();
    return round(P.w, 0) + 'x' + round(P.h, 0) + 'mm';
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 2000);
  }

  function exportPage(page, dpi, fmt, total, cb) {
    const c = renderPage(page, dpi);
    const type = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = fmt === 'jpeg' ? 'jpg' : 'png';
    const name = '拼版-' + paperLabel() + (total > 1 ? '-' + (page + 1) : '') + '.' + ext;
    c.toBlob(
      (blob) => {
        if (blob) download(blob, name);
        if (cb) cb();
      },
      type,
      0.94
    );
  }

  function exportAll() {
    const total = pageCount();
    const dpi = Number(state.dpi);
    const fmt = state.fmt;
    let i = 0;
    const step = () => {
      if (i >= total) return;
      exportPage(i, dpi, fmt, total, () => {
        i++;
        setTimeout(step, 400);
      });
    };
    step();
  }

  function initOutput() {
    $('exportBtn').addEventListener('click', exportAll);

    $('printBtn').addEventListener('click', () => {
      const P = view.L.P;
      $('pageSizeRule').textContent = '@page{size:' + round(P.w, 2) + 'mm ' + round(P.h, 2) + 'mm;margin:0}';
      const url = renderPage(state.page, 300).toDataURL('image/png');
      $('printRoot').innerHTML = '<img src="' + url + '" alt="">';
      setTimeout(() => window.print(), 60);
    });
  }

  /* ============ 表单绑定 ============ */
  function fillSelect(el, list) {
    el.innerHTML = '';
    list.forEach((it) => {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = it.name;
      el.appendChild(o);
    });
  }

  function syncUI() {
    const L = view.L;
    const P = L.P;

    // 纸张自定义行
    $('paperCustom').hidden = state.paper !== 'custom';
    $('pw').value = state.pw;
    $('ph').value = state.ph;

    // 排版方式切换
    $('sizeBlock').hidden = state.mode !== 'size';
    $('gridBlock').hidden = state.mode !== 'grid';
    $('cellCustom').hidden = state.cell !== 'custom';
    $('cw').value = state.cw;
    $('ch').value = state.ch;

    // 数值回显
    $('marginVal').textContent = round(state.margin, 1) + 'mm';
    $('gapVal').textContent = round(state.gap, 1) + 'mm';
    $('borderVal').textContent = round(state.border, 1) + 'mm';
    $('radiusVal').textContent = round(state.radius, 1) + 'mm';

    // 统计
    const per = L.cells.length;
    const pages = pageCount();
    const overflow = L.contentW > P.w + 0.01 || L.contentH > P.h + 0.01;
    const st = $('layoutStat');
    if (overflow) {
      st.className = 'stat warn';
      st.textContent = '⚠︎ 内容超出纸张，请换更大的纸张或更小的照片尺寸';
    } else {
      st.className = 'stat';
      st.textContent =
        '单元格 ' + round(L.cw, 1) + ' × ' + round(L.ch, 1) + 'mm · ' +
        L.cols + ' 列 × ' + L.rows + ' 行 · 占用 ' + round(L.contentW, 1) + ' × ' + round(L.contentH, 1) + 'mm（居中）';
    }

    const dpi = Number(state.dpi);
    $('outputStat').textContent =
      '输出 ' + Math.round((P.w / 25.4) * dpi) + ' × ' + Math.round((P.h / 25.4) * dpi) + ' px · ' + dpi + ' DPI';

    $('stageMeta').textContent = photos.length
      ? '共 ' + photos.length + ' 张 · 每页 ' + per + ' 格 · ' + pages + ' 页'
      : '还没有照片';
    $('emptyTip').hidden = photos.length > 0;

    $('pager').hidden = pages <= 1;
    $('pageLabel').textContent = state.page + 1 + ' / ' + pages;
    $('exportBtn').textContent = pages > 1 ? '导出全部 ' + pages + ' 页' : '导出';
    $('printBtn').textContent = pages > 1
      ? '打印这一页（第 ' + (state.page + 1) + ' / ' + pages + ' 页 · 按实际尺寸）'
      : '打印（按实际尺寸）';

    // 同步控件值（避免用户拖动时被打断）
    const set = (id, v) => { const el = $(id); if (el.value !== String(v)) el.value = v; };
    set('paper', state.paper);
    set('orient', state.orient);
    set('mode', state.mode);
    set('cell', state.cell);
    set('fit', state.fit);
    set('dpi', state.dpi);
    set('fmt', state.fmt);
    set('cols', state.cols);
    set('rows', state.rows);
    $('bg').value = state.bg;
    $('borderColor').value = state.borderColor;
    $('repeat').checked = !!state.repeat;
    $('cut').checked = !!state.cut;
    'margin gap border radius'.split(' ').forEach((k) => set(k, state[k]));
  }

  function save() {
    try {
      const s = {};
      Object.keys(DEFAULTS).forEach((k) => (s[k] = state[k]));
      s.borderColor = state.borderColor;
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (e) { /* noop */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      Object.keys(DEFAULTS).forEach((k) => {
        if (s[k] !== undefined) state[k] = s[k];
      });
    } catch (e) { /* noop */ }
  }

  function refresh() {
    fitPreview();
    save();
  }

  function initControls() {
    fillSelect($('paper'), PAPERS);
    fillSelect($('cell'), CELLS);

    // 快速模板
    const row = $('presets');
    PRESETS.forEach((ps) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.innerHTML = '<b>' + ps.name + '</b><em>' + ps.hint + '</em>';
      b.addEventListener('click', () => {
        Object.keys(ps.p).forEach((k) => (state[k] = ps.p[k]));
        state.page = 0;
        refresh();
      });
      row.appendChild(b);
    });

    const bindSelect = (id, key, num) =>
      $(id).addEventListener('change', (e) => {
        state[key] = num ? Number(e.target.value) : e.target.value;
        state.page = 0;
        refresh();
      });
    bindSelect('paper', 'paper');
    bindSelect('orient', 'orient');
    bindSelect('mode', 'mode');
    bindSelect('cell', 'cell');
    bindSelect('fit', 'fit');
    bindSelect('dpi', 'dpi', true);
    bindSelect('fmt', 'fmt');

    const bindNumber = (id, key, min, max) =>
      $(id).addEventListener('input', (e) => {
        let v = Number(e.target.value);
        if (!isFinite(v)) return;
        if (min != null) v = clamp(v, min, max);
        state[key] = v;
        refresh();
      });
    bindNumber('pw', 'pw', 20, 1200);
    bindNumber('ph', 'ph', 20, 1200);
    bindNumber('cw', 'cw', 5, 500);
    bindNumber('ch', 'ch', 5, 500);
    bindNumber('cols', 'cols', 1, 12);
    bindNumber('rows', 'rows', 1, 12);
    bindNumber('margin', 'margin', 0, 20);
    bindNumber('gap', 'gap', 0, 20);
    bindNumber('border', 'border', 0, 6);
    bindNumber('radius', 'radius', 0, 10);

    $('bg').addEventListener('input', (e) => { state.bg = e.target.value; refresh(); });
    $('borderColor').addEventListener('input', (e) => { state.borderColor = e.target.value; refresh(); });
    $('repeat').addEventListener('change', (e) => { state.repeat = e.target.checked; refresh(); });
    $('cut').addEventListener('change', (e) => { state.cut = e.target.checked; refresh(); });

    // 切换填充方式时收敛缩放范围
    $('fit').addEventListener('change', () => {
      const base = state.fit === 'cover' ? 1 : 0.2;
      photos.forEach((p) => { p.zoom = clamp(p.zoom, base, 5); });
    });

    $('addBtn').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', (e) => {
      addFiles(e.target.files);
      e.target.value = '';
    });
    $('clearBtn').addEventListener('click', clearAll);

    $('prevPage').addEventListener('click', () => {
      state.page = (state.page - 1 + pageCount()) % pageCount();
      fitPreview();
    });
    $('nextPage').addEventListener('click', () => {
      state.page = (state.page + 1) % pageCount();
      fitPreview();
    });
  }

  /* ============ 启动 ============ */
  load();
  state.page = 0;
  view.L = computeLayout();
  initControls();
  renderStrip();
  initStageEvents();
  initStripEvents();
  initDropZone();
  initOutput();
  fitPreview();
})();
