'use strict';
/* ═══════════════════════════════════════════════════════════════
   NEON BASTION // OVERDRIVE PROTOCOL — 界面与主循环
   ═══════════════════════════════════════════════════════════════ */
(() => {
  const D = window.DATA, E = window.ENGINE, R = window.RENDER;
  const { CELL, W, H, TAU, MAX_WAVE } = D;
  const $ = id => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ═════════ 音频 ═════════ */
  const Sfx = (() => {
    let ctx = null, master = null, noiseBuf = null, on = true;
    const ensure = () => {
      if (!on) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.55;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 6;
        master.connect(comp); comp.connect(ctx.destination);
        const len = ctx.sampleRate * 0.5;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    };
    const tone = (freq, dur, type = 'sine', vol = 0.05, slide = 0.5) => {
      const c = ensure(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      const t = c.currentTime;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    };
    const noise = (dur, vol = 0.06, freq = 1200, q = 1) => {
      const c = ensure(); if (!c) return;
      const src = c.createBufferSource(); src.buffer = noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain();
      const t = c.currentTime;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur);
    };
    const last = {};
    const throttle = (key, ms) => {
      const now = performance.now();
      if (last[key] && now - last[key] < ms) return false;
      last[key] = now; return true;
    };
    return {
      get on() { return on; },
      toggle() { on = !on; if (on) ensure(); return on; },
      build() { tone(420, 0.09, 'triangle', 0.05); noise(0.08, 0.03, 2400, 2); },
      upgrade() { tone(520, 0.08, 'triangle', 0.05); setTimeout(() => tone(760, 0.14, 'sine', 0.05), 70); },
      sell() { tone(300, 0.1, 'triangle', 0.04, 0.6); },
      shot() { if (throttle('shot', 45)) tone(780, 0.03, 'triangle', 0.015); },
      boom() { if (throttle('boom', 70)) { tone(120, 0.18, 'sine', 0.06, 0.4); noise(0.16, 0.04, 420, 0.8); } },
      zap() { if (throttle('zap', 60)) { noise(0.1, 0.035, 3200, 2); tone(240, 0.07, 'sawtooth', 0.025); } },
      frost() { if (throttle('frost', 90)) { tone(880, 0.16, 'sine', 0.03, 0.55); noise(0.1, 0.02, 5200, 3); } },
      tesla() { if (throttle('tesla', 110)) tone(520, 0.06, 'square', 0.02, 1.8); },
      rail() { if (throttle('rail', 90)) { tone(1400, 0.12, 'sawtooth', 0.03, 0.2); noise(0.1, 0.03, 2600, 1.5); } },
      snipe() { if (throttle('snipe', 110)) { tone(1600, 0.05, 'square', 0.025, 0.3); noise(0.14, 0.03, 3400, 1.2); } },
      flame() { if (throttle('flame', 130)) noise(0.2, 0.02, 700, 0.6); },
      gravity() { if (throttle('grav', 140)) tone(90, 0.3, 'sine', 0.04, 0.5); },
      kill() { if (throttle('kill', 55)) tone(320, 0.05, 'triangle', 0.02, 0.6); },
      bigkill() { tone(90, 0.4, 'sawtooth', 0.06, 0.35); noise(0.35, 0.06, 500, 0.7); },
      leak() { tone(140, 0.3, 'sawtooth', 0.07, 0.35); noise(0.2, 0.05, 300, 0.8); },
      wave() { tone(180, 0.28, 'sawtooth', 0.04, 0.7); setTimeout(() => tone(240, 0.2, 'triangle', 0.035), 120); },
      clear() { tone(600, 0.1, 'sine', 0.04); setTimeout(() => tone(900, 0.16, 'sine', 0.045), 100); },
      jam() { if (throttle('jam', 300)) tone(220, 0.2, 'square', 0.035, 0.4); },
      ability() { tone(300, 0.3, 'sawtooth', 0.05, 2.6); noise(0.3, 0.05, 900, 1); },
      deny() { tone(180, 0.08, 'square', 0.03, 0.8); },
      ui() { tone(660, 0.04, 'sine', 0.02); },
      end(win) {
        if (win) { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.05), i * 130)); }
        else { [330, 262, 196, 147].forEach((f, i) => setTimeout(() => tone(f, 0.34, 'sawtooth', 0.05, 0.7), i * 150)); }
      }
    };
  })();

  /* ═════════ 持久化 ═════════ */
  const Store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 私密模式下静默失败 */ } }
  };
  const recordKey = (map, diff) => `nbo:v1:${D.MAPS[map].id}:${diff}`;
  const metaKey = 'nbo:v1:meta';

  /* ═════════ 应用状态 ═════════ */
  const ui = {
    view: 'menu', mapIndex: 0, difficulty: 'standard', game: null, renderer: null,
    build: null, selected: null, hover: null, keyCell: { gx: 10, gy: 7 },
    aimAbility: null, toastTimer: null, lastCredits: 0, lastKills: 0, lastLives: 0,
    hudTimer: 0, raf: 0, lastStamp: 0, pausedBeforeHelp: false
  };

  const el = id => $(id);
  const canvas = el('board');

  /* ═════════ 主菜单 ═════════ */
  function buildMenu() {
    const grid = el('map-grid');
    grid.innerHTML = D.MAPS.map((m, i) => {
      const rec = Math.max(...Object.keys(D.DIFFICULTIES).map(d => Store.get(recordKey(i, d), 0)));
      const clears = Object.keys(D.DIFFICULTIES).filter(d => Store.get(recordKey(i, d), 0) >= MAX_WAVE).length;
      return `<button class="map-card" role="option" data-map="${i}" aria-selected="${i === ui.mapIndex}" style="--accent:${m.color}">
        <canvas class="map-preview" data-preview="${i}" width="320" height="170"></canvas>
        <span class="map-index">${String(i + 1).padStart(2, '0')}</span>
        <span class="map-name">${m.name}</span>
        <span class="map-en">${m.en}</span>
        <span class="map-meta"><b>${m.routes.length}</b> 入口 · 纪录 <b>${rec}</b>/${MAX_WAVE}${clears ? ` · <em>${clears} 难度通关</em>` : ''}</span>
        <span class="map-tip">${m.tip}</span>
      </button>`;
    }).join('');
    grid.querySelectorAll('.map-card').forEach(card => {
      card.addEventListener('click', () => { selectMap(Number(card.dataset.map)); Sfx.ui(); });
      card.addEventListener('pointerenter', () => Sfx.ui(), { passive: true });
    });
    D.MAPS.forEach((m, i) => drawPreview(i));
    selectMap(ui.mapIndex, true);

    el('diff-picker').innerHTML = Object.entries(D.DIFFICULTIES).map(([id, d]) =>
      `<button class="diff-card${id === ui.difficulty ? ' active' : ''}" data-diff="${id}" role="radio" aria-checked="${id === ui.difficulty}">
        <strong>${d.name}</strong><small>${d.en}</small><i>${d.desc}</i>
      </button>`).join('');
    el('diff-picker').querySelectorAll('[data-diff]').forEach(btn =>
      btn.addEventListener('click', () => {
        ui.difficulty = btn.dataset.diff;
        el('diff-picker').querySelectorAll('[data-diff]').forEach(b => {
          const active = b.dataset.diff === ui.difficulty;
          b.classList.toggle('active', active); b.setAttribute('aria-checked', String(active));
        });
        updateMenuInfo(); Sfx.ui();
      }));

    const meta = Store.get(metaKey, { best: 0, kills: 0, maps: 0 });
    el('menu-best').textContent = String(meta.best).padStart(2, '0');
    el('menu-kills').textContent = meta.kills >= 1000 ? (meta.kills / 1000).toFixed(1) + 'k' : meta.kills;
    el('menu-maps').textContent = D.MAPS.length;
    el('deploy').addEventListener('click', () => launch());
    el('reset-records').addEventListener('click', () => {
      if (!confirm('清除所有战区纪录与统计？此操作不可撤销。')) return;
      Object.keys(D.DIFFICULTIES).forEach(d => D.MAPS.forEach((_, i) => Store.set(recordKey(i, d), 0)));
      Store.set(metaKey, { best: 0, kills: 0, maps: 0 });
      buildMenu(); Sfx.ui();
    });
    el('map-grid').addEventListener('keydown', e => {
      const cards = [...el('map-grid').querySelectorAll('.map-card')];
      const idx = cards.indexOf(document.activeElement);
      if (idx < 0) return;
      const cols = getComputedStyle(el('map-grid')).gridTemplateColumns.split(' ').length || 1;
      let next = -1;
      if (e.key === 'ArrowRight') next = idx + 1;
      else if (e.key === 'ArrowLeft') next = idx - 1;
      else if (e.key === 'ArrowDown') next = idx + cols;
      else if (e.key === 'ArrowUp') next = idx - cols;
      if (next >= 0 && next < cards.length) { e.preventDefault(); cards[next].focus(); selectMap(next); }
    });
  }

  function drawPreview(index) {
    const c = el('map-grid').querySelector(`[data-preview="${index}"]`);
    if (!c) return;
    const g = c.getContext('2d');
    const m = D.MAPS[index];
    const s = c.width / W;
    g.clearRect(0, 0, c.width, c.height);
    const bg = g.createLinearGradient(0, 0, c.width, c.height);
    bg.addColorStop(0, '#070d18'); bg.addColorStop(1, '#04070d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    // 网格
    g.strokeStyle = R.hexA(m.color, 0.07); g.lineWidth = 1;
    for (let x = 0; x < c.width; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
    for (let y = 0; y < c.height; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
    // 路径
    for (const route of m.routes) {
      g.beginPath();
      route.forEach(([gx, gy], i) => {
        const x = (gx * CELL + CELL / 2) * s, y = (gy * CELL + CELL / 2) * s;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = R.hexA(m.color, 0.18); g.lineWidth = 7; g.stroke();
      g.strokeStyle = R.hexA(m.color, 0.9); g.lineWidth = 1.6; g.stroke();
      const start = route[0];
      g.fillStyle = '#ff5c7a';
      g.beginPath(); g.arc((start[0] * CELL + CELL / 2) * s, (start[1] * CELL + CELL / 2) * s, 3, 0, TAU); g.fill();
    }
    // 核心
    const core = m.core;
    const cx = (core[0] * CELL + CELL / 2) * s, cy = (core[1] * CELL + CELL / 2) * s;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 16);
    grad.addColorStop(0, R.hexA(m.color, 0.85)); grad.addColorStop(1, R.hexA(m.color, 0));
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, 16, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 2.4, 0, TAU); g.fill();
  }

  function selectMap(index, silent) {
    ui.mapIndex = index;
    el('map-grid').querySelectorAll('.map-card').forEach(card =>
      card.setAttribute('aria-selected', String(Number(card.dataset.map) === index)));
    if (!silent) updateMenuInfo();
  }

  function updateMenuInfo() {
    const m = D.MAPS[ui.mapIndex], diff = D.DIFFICULTIES[ui.difficulty];
    el('sector-name').textContent = `${String(ui.mapIndex + 1).padStart(2, '0')} / ${m.name}`;
    el('sector-en').textContent = `SECTOR: ${m.en}`;
    el('sector-tip').textContent = m.tip;
    el('sector-record').textContent = `本战区纪录 ${Store.get(recordKey(ui.mapIndex, ui.difficulty), 0)} / ${MAX_WAVE}`;
    el('deploy').querySelector('span').textContent = `${diff.name} · 部署 ↗`;
  }

  /* ═════════ 启动对局 ═════════ */
  function launch() {
    const game = new E.Game({
      map: ui.mapIndex, difficulty: ui.difficulty, auto: Store.get('nbo:v1:auto', true),
      seed: (Math.random() * 2 ** 32) >>> 0
    });
    ui.game = game;
    ui.build = null; ui.selected = null; ui.hover = null; ui.aimAbility = null;
    ui.lastCredits = game.credits; ui.lastKills = 0; ui.lastLives = game.lives;
    if (!ui.renderer) ui.renderer = new R.Renderer(canvas);
    ui.renderer.bgKey = '';
    el('screen-menu').hidden = true;
    el('screen-game').hidden = false;
    el('overlay').hidden = true;
    buildTowerList(); buildAbilities();
    updateHudSector();
    renderDetails(null);
    syncHud(true);
    showToast(`部署完成 · ${D.MAPS[ui.mapIndex].name} / ${D.DIFFICULTIES[ui.difficulty].name}`, 2600);
    ui.view = 'game';
    if (!ui.raf) { ui.lastStamp = performance.now(); ui.raf = requestAnimationFrame(frame); }
  }

  function quitToMenu() {
    if (ui.game && !ui.game.finished && ui.game.wave > 0) {
      const keep = confirm('退出将放弃本局进度，确定返回菜单？');
      if (!keep) return;
    }
    persistRun();
    ui.view = 'menu';
    cancelAnimationFrame(ui.raf); ui.raf = 0;
    el('screen-game').hidden = true;
    el('screen-menu').hidden = false;
    buildMenu();
  }

  function persistRun() {
    const g = ui.game;
    if (!g) return;
    const best = Math.max(g.stats.bestWave, g.wave);
    const prev = Store.get(recordKey(g.mapIndex, g.difficulty), 0);
    if (best > prev) Store.set(recordKey(g.mapIndex, g.difficulty), best);
    const meta = Store.get(metaKey, { best: 0, kills: 0, maps: 0 });
    meta.best = Math.max(meta.best, best);
    meta.kills = (meta.kills || 0) + g.kills;
    Store.set(metaKey, meta);
  }

  /* ═════════ 炮塔列表 ═════════ */
  function buildTowerList() {
    el('tower-list').innerHTML = D.TOWERS.map((t, i) => `
      <button class="tower-card" data-type="${i}" style="--tc:${t.color}" aria-pressed="false"
        title="${t.name} · ${t.desc} · ${t.cost} 晶体">
        <span class="shape">${t.symbol}</span>
        <span class="tc-info"><strong>${t.name}</strong><small>${t.tag} · ${t.desc}</small></span>
        <span class="tc-cost">◈ ${t.cost}</span>
        <span class="tc-key">${i < 9 ? i + 1 : ''}</span>
      </button>`).join('');
    el('tower-list').querySelectorAll('[data-type]').forEach(card =>
      card.addEventListener('click', () => chooseTower(Number(card.dataset.type))));
    el('arsenal-count').textContent = `ARSENAL / ${String(D.TOWERS.length).padStart(2, '0')}`;
  }

  function chooseTower(index) {
    if (!ui.game || ui.game.finished) return;
    ui.build = ui.build === index ? null : index;
    ui.selected = null;
    ui.aimAbility = null;
    renderDetails(null);
    syncArsenal();
    Sfx.ui();
  }

  function syncArsenal() {
    el('tower-list').querySelectorAll('[data-type]').forEach((card, i) => {
      const def = D.TOWERS[i];
      const active = ui.build === i;
      card.classList.toggle('active', active);
      card.setAttribute('aria-pressed', String(active));
      card.classList.toggle('unaffordable', ui.game ? ui.game.credits < def.cost : false);
    });
  }

  /* ═════════ 技能栏 ═════════ */
  function buildAbilities() {
    const group = el('ability-group');
    group.innerHTML = D.ABILITIES.map(a => `
      <button class="ability-btn" data-ability="${a.id}" style="--ac:${a.color}" title="${a.name}（${a.key}）· ${a.desc}">
        <span class="ab-icon">${a.icon}</span>
        <span class="ab-body"><strong>${a.name}</strong><small>${a.key}</small></span>
        <span class="ab-cd" hidden></span>
      </button>`).join('');
    group.querySelectorAll('[data-ability]').forEach(btn =>
      btn.addEventListener('click', () => triggerAbility(btn.dataset.ability)));
  }

  function triggerAbility(id) {
    const g = ui.game;
    if (!g || g.finished || g.paused) return;
    const ab = D.ABILITIES.find(a => a.id === id);
    if (!ab) return;
    if (g.abilityCd[id] > 0) { Sfx.deny(); return; }
    if (ab.target) {
      ui.aimAbility = ui.aimAbility === id ? null : id;
      ui.build = null;
      showToast(ui.aimAbility ? '轨道轰炸：点击战场指定落点' : '已取消轨道轰炸', 1800);
      syncAbilities(); syncArsenal();
      return;
    }
    if (g.useAbility(id)) { Sfx.ability(); syncAbilities(); }
    else Sfx.deny();
  }

  function syncAbilities() {
    const g = ui.game; if (!g) return;
    el('ability-group').querySelectorAll('[data-ability]').forEach(btn => {
      const id = btn.dataset.ability;
      const ab = D.ABILITIES.find(a => a.id === id);
      const cd = g.abilityCd[id] || 0;
      const cdEl = btn.querySelector('.ab-cd');
      const ready = cd <= 0 && !g.finished && !g.paused;
      btn.classList.toggle('ready', ready);
      btn.classList.toggle('aiming', ui.aimAbility === id);
      btn.disabled = !ready && ui.aimAbility !== id;
      if (cd > 0) { cdEl.hidden = false; cdEl.textContent = Math.ceil(cd) + 's'; btn.style.setProperty('--p', String(1 - cd / ab.cd)); }
      else { cdEl.hidden = true; btn.style.setProperty('--p', '1'); }
    });
  }

  /* ═════════ 情报面板 ═════════ */
  function renderDetails(tower) {
    const box = el('details');
    if (tower) {
      const def = tower.def, s = ui.game.towerStats(tower);
      const upCost = ui.game.upgradeCost(tower);
      const refund = Math.floor(tower.spent * D.SELL_RATE);
      const isRelay = def.id === 'relay';
      const powered = isRelay && ui.game.poweredRelays().has(tower);
      box.innerHTML = `
        <div class="detail-title" style="--tc:${def.color}">
          <span>${def.symbol}</span><strong>${def.name}</strong>
          <small>LV.${tower.level} / 3</small>
        </div>
        <div class="detail-metrics">
          <span>${isRelay ? '状态' : '伤害'} <b>${isRelay ? (powered ? '已通电' : '未连接') : Math.round(s.damage)}</b></span>
          <span>${isRelay ? '接力' : '射程'} <b>${isRelay ? tower.level + 2 : Math.round(s.range)}</b></span>
          <span>${s.rate ? '间隔' : '击杀'} <b>${s.rate ? s.rate.toFixed(2) + 's' : tower.kills}</b></span>
        </div>
        <div class="detail-metrics">
          <span>类型 <b>${typeName(def.dmgType)}</b></span>
          <span>${def.air ? '可防空' : '仅地面'}</span>
          <span>输出 <b>${Math.round(tower.damage)}</b></span>
        </div>
        <div class="detail-actions">
          <button id="upgrade" ${tower.level >= 3 ? 'disabled' : ''}>${tower.level >= 3 ? '已达最高等级' : `升级 ◈ ${upCost}`}</button>
          <button id="sell">回收 +${refund}</button>
        </div>
        ${isRelay && !powered ? '<small class="warn">需要连接雷链矩阵才会传电</small>' : ''}`;
      const up = box.querySelector('#upgrade');
      if (up) up.onclick = () => {
        if (ui.game.upgrade(tower)) { Sfx.upgrade(); renderDetails(tower); syncHud(true); }
        else Sfx.deny();
      };
      const sell = box.querySelector('#sell');
      if (sell) sell.onclick = () => {
        const got = ui.game.sell(tower);
        ui.selected = null; renderDetails(null); syncHud(true);
        showToast(`已回收炮塔 · +${got} 晶体`, 1600); Sfx.sell();
      };
    } else if (ui.build !== null) {
      const def = D.TOWERS[ui.build];
      box.innerHTML = `
        <div class="detail-title" style="--tc:${def.color}">
          <span>${def.symbol}</span><strong>${def.name}</strong><small>${def.en}</small>
        </div>
        <div class="detail-metrics">
          <span>伤害 <b>${def.damage || '—'}</b></span>
          <span>射程 <b>${def.range}</b></span>
          <span>间隔 <b>${def.rate ? def.rate + 's' : '—'}</b></span>
        </div>
        <div class="detail-metrics">
          <span>类型 <b>${typeName(def.dmgType)}</b></span>
          <span>${def.air ? '可防空' : '仅地面'}</span>
          <span>价格 <b>◈ ${def.cost}</b></span>
        </div>
        <small>${def.desc}。点击空地部署，虚线圆环为射程。可连续部署，Esc 退出。</small>`;
    } else {
      box.innerHTML = `<div class="intel-icon">◎</div><p>每一道棱角，都是一道防线。</p>
        <small>选择炮塔后点击路径旁的空地部署。点击已部署的炮塔可升级或回收。暂停时仍可建造。</small>`;
    }
  }

  const typeName = t => ({ kinetic: '动能', energy: '能量', cryo: '冰霜', explosive: '爆破', toxic: '毒素', quantum: '量子', thermal: '热能', none: '—' })[t] || t;

  /* ═════════ 战场交互 ═════════ */
  canvas.addEventListener('pointermove', e => {
    if (!ui.renderer) return;
    ui.hover = ui.renderer.cellAt(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerleave', () => { ui.hover = null; });
  canvas.addEventListener('pointerdown', e => {
    if (!ui.renderer || !ui.game) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    const cell = ui.renderer.cellAt(e.clientX, e.clientY);
    ui.keyCell = { ...cell };
    handleClick(cell);
  });

  function handleClick(cell) {
    const g = ui.game;
    if (!g || g.finished) return;
    if (ui.aimAbility) {
      const p = { x: cell.gx * CELL + CELL / 2, y: cell.gy * CELL + CELL / 2 };
      if (g.useAbility(ui.aimAbility, p.x, p.y)) { Sfx.ability(); ui.aimAbility = null; }
      else Sfx.deny();
      syncAbilities();
      return;
    }
    const existing = g.towerAt(cell.gx, cell.gy);
    if (existing) {
      ui.selected = existing; ui.build = null;
      renderDetails(existing); syncArsenal(); Sfx.ui();
      return;
    }
    if (ui.build === null) {
      ui.selected = null; renderDetails(null); syncArsenal();
      return;
    }
    const def = D.TOWERS[ui.build];
    const res = g.build(ui.build, cell.gx, cell.gy);
    if (res.ok) {
      ui.selected = res.tower; ui.build = null;
      renderDetails(res.tower); syncArsenal(); syncHud(true); Sfx.build();
    } else {
      showToast(res.reason === '晶体不足' ? '晶体不足 · 消灭敌人可获得更多晶体' : res.reason, 1900);
      Sfx.deny();
    }
  }

  /* ═════════ HUD ═════════ */
  function updateHudSector() {
    const g = ui.game, m = D.MAPS[g.mapIndex];
    el('hud-sector').textContent = `${String(g.mapIndex + 1).padStart(2, '0')} / ${m.name}`;
    el('hud-diff').textContent = D.DIFFICULTIES[g.difficulty].name;
    el('hud-diff').dataset.diff = g.difficulty;
  }

  function syncHud(force) {
    const g = ui.game; if (!g) return;
    el('credits').textContent = Math.round(g.credits);
    el('lives').textContent = g.lives;
    el('lives-max').textContent = '/' + g.livesMax;
    el('wave').textContent = String(Math.min(g.wave, MAX_WAVE)).padStart(2, '0');
    el('kills').textContent = g.kills;
    el('income').textContent = '+' + Math.max(0, g.earned - (g.waveEarned || 0));

    const locked = g.phase === 'combat';
    el('status').textContent = g.finished ? (g.won ? '战区肃清' : '核心离线')
      : g.paused ? '模拟暂停' : locked ? '敌袭进行中' : g.wave ? '整备阶段' : '准备部署';
    el('status').className = 'status-chip ' + (g.finished ? (g.won ? 'ok' : 'bad') : g.paused ? 'warn' : locked ? 'live' : '');

    const left = g.spawnQueue.length + g.enemies.length;
    el('spawn-left').textContent = locked ? `剩余目标 ${left}` : `GRID ${D.COLS} × ${D.ROWS}`;
    el('wave-note').textContent = g.finished ? (g.won ? '防线屹立 · 无尽模式已解锁' : '核心失守 · 调整策略再来一次')
      : g.nextWaveIn !== null ? `下一波将在 ${Math.ceil(g.nextWaveIn)} 秒后开始`
      : g.waveNote(g.wave + 1) || '防线就绪，等待你的指令';

    const startBtn = el('start');
    startBtn.disabled = locked || g.finished;
    startBtn.innerHTML = locked ? `第 ${String(g.wave).padStart(2, '0')} 波进行中 <span>•</span>`
      : g.nextWaveIn !== null ? `立即开始 · ${Math.ceil(g.nextWaveIn)}s <span>↗</span>`
      : `开始第 ${String(g.wave + 1).padStart(2, '0')} 波 <span>↗</span>`;

    el('pause').textContent = g.paused ? '▶' : 'Ⅱ';
    el('pause').setAttribute('aria-label', g.paused ? '继续' : '暂停');
    el('speed').innerHTML = `${g.speed}× <small>速度</small>`;
    el('pause').disabled = g.finished;
    el('speed').disabled = g.finished;

    if (force || Math.abs(g.credits - ui.lastCredits) >= 1) { syncArsenal(); ui.lastCredits = g.credits; }
    syncAbilities();
    if (ui.selected && !g.towers.includes(ui.selected)) { ui.selected = null; renderDetails(null); }
    else if (ui.selected) {
      const up = el('upgrade');
      if (up) up.disabled = ui.selected.level >= 3 || g.credits < g.upgradeCost(ui.selected);
    }
  }

  function showToast(text, ms = 2200) {
    const t = el('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ═════════ 结算 ═════════ */
  function showResult() {
    const g = ui.game;
    persistRun();
    el('overlay').hidden = false;
    el('result-symbol').textContent = g.won ? '✦' : '✕';
    el('result-symbol').className = 'result-symbol ' + (g.won ? 'win' : 'lose');
    el('result-eyebrow').textContent = g.won ? 'MISSION COMPLETE' : 'MISSION FAILED';
    el('result-title').textContent = g.won ? '防线屹立，星环无恙。' : '核心失守，重整旗鼓。';
    const diff = D.DIFFICULTIES[g.difficulty];
    el('result-text').innerHTML =
      `${D.MAPS[g.mapIndex].name} / ${diff.name} · 完成 ${g.won ? MAX_WAVE : Math.max(0, g.wave - 1)} 波 · 消灭 ${g.kills} 个目标 · 回收 ${g.earned} 晶体`;
    el('endless').hidden = !g.won;
    el('endless').onclick = () => {
      g.continueEndless();
      el('overlay').hidden = true;
      showToast('无尽模式启动 · 敌人强度将持续攀升', 2400);
      syncHud(true); Sfx.ui();
    };
    Sfx.end(g.won);
  }

  /* ═════════ 主循环 ═════════ */
  function frame(stamp) {
    const raw = Math.min(0.05, (stamp - ui.lastStamp) / 1000 || 0);
    ui.lastStamp = stamp;
    const g = ui.game;
    if (!g) { ui.raf = requestAnimationFrame(frame); return; }

    // 处理引擎事件 → 音效
    drainEvents(g);

    if (!g.paused && !g.finished) {
      const scale = 1 - g.slowmo * 0.6;
      const dt = raw * g.speed * scale;
      const steps = Math.max(1, Math.min(4, Math.ceil(dt / 0.025)));
      for (let i = 0; i < steps; i++) {
        g.update(dt / steps);
        if (g.finished || g.phase === 'idle') break;
      }
      if (g.nextWaveIn !== null && g.phase === 'idle') {
        g.nextWaveIn = Math.max(0, g.nextWaveIn - raw * g.speed);
        if (g.nextWaveIn === 0) g.startWave();
      }
    }

    if (ui.selected && !g.towers.includes(ui.selected)) { ui.selected = null; renderDetails(null); }
    ui.renderer.draw(g, ui, raw);

    ui.hudTimer += raw;
    if (ui.hudTimer > 0.12) { ui.hudTimer = 0; syncHud(false); }

    if (g.finished && el('overlay').hidden) showResult();
    ui.raf = requestAnimationFrame(frame);
  }

  function drainEvents(g) {
    if (!g.events.length) return;
    const counts = {};
    for (const ev of g.events) counts[ev.type] = (counts[ev.type] || 0) + 1;
    g.events.length = 0;
    for (const type in counts) {
      const n = counts[type];
      switch (type) {
        case 'shot': for (let i = 0; i < Math.min(n, 3); i++) Sfx.shot(); break;
        case 'boom': Sfx.boom(); break;
        case 'zap': Sfx.zap(); break;
        case 'frost': Sfx.frost(); break;
        case 'tesla': Sfx.tesla(); break;
        case 'rail': Sfx.rail(); break;
        case 'snipe': Sfx.snipe(); break;
        case 'flame': Sfx.flame(); break;
        case 'gravity': Sfx.gravity(); break;
        case 'kill': for (let i = 0; i < Math.min(n, 4); i++) Sfx.kill(); break;
        case 'bigkill': Sfx.bigkill(); break;
        case 'leak': Sfx.leak(); break;
        case 'wave': Sfx.wave(); break;
        case 'clear': Sfx.clear(); break;
        case 'jam': Sfx.jam(); break;
        case 'build': Sfx.build(); break;
        case 'upgrade': Sfx.upgrade(); break;
        case 'sell': Sfx.sell(); break;
        case 'ability': Sfx.ability(); break;
        case 'end': Sfx.end(!!g.won); break;
      }
    }
  }

  /* ═════════ 按钮与快捷键 ═════════ */
  el('start').addEventListener('click', () => {
    const g = ui.game;
    if (!g || g.finished || g.phase === 'combat') return;
    if (g.startWave()) { Sfx.wave(); syncHud(true); }
  });
  el('pause').addEventListener('click', () => {
    const g = ui.game; if (!g || g.finished) return;
    g.paused = !g.paused; syncHud(true); Sfx.ui();
  });
  el('speed').addEventListener('click', () => {
    const g = ui.game; if (!g || g.finished) return;
    g.speed = g.speed === 1 ? 2 : g.speed === 2 ? 3 : 1;
    syncHud(true); Sfx.ui();
  });
  el('quit').addEventListener('click', quitToMenu);
  el('again').addEventListener('click', () => { persistRun(); launch(); });
  el('to-menu').addEventListener('click', () => { el('overlay').hidden = true; quitToMenu(); });

  el('sound').addEventListener('click', () => {
    const on = Sfx.toggle();
    el('sound').innerHTML = `♪<span>音效${on ? '开' : '关'}</span>`;
    el('sound').setAttribute('aria-pressed', String(on));
    if (on) Sfx.ui();
  });

  el('help').addEventListener('click', () => {
    const g = ui.game;
    ui.pausedBeforeHelp = g ? g.paused : false;
    if (g) g.paused = true;
    el('guide').showModal();
    Sfx.ui();
  });
  el('close-help').addEventListener('click', () => el('guide').close());
  el('guide-ok').addEventListener('click', () => el('guide').close());
  el('guide').addEventListener('close', () => {
    if (ui.game && ui.view === 'game') { ui.game.paused = ui.pausedBeforeHelp; syncHud(true); }
  });

  document.addEventListener('keydown', e => {
    if (el('guide').open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, textarea, select')) return;
    const g = ui.game;

    if (ui.view === 'menu') {
      if (e.key === 'Enter' && document.activeElement === document.body) { e.preventDefault(); launch(); }
      return;
    }
    if (!g) return;

    if (e.target.closest('button') && (e.code === 'Space' || e.key === 'Enter')) return;

    if (/^[1-9]$/.test(e.key)) { e.preventDefault(); chooseTower(Number(e.key) - 1); return; }
    if (e.key === 'Escape') {
      ui.build = null; ui.selected = null; ui.aimAbility = null;
      renderDetails(null); syncArsenal(); syncAbilities(); syncHud(false);
      return;
    }
    if (e.code === 'Space') { e.preventDefault(); el('pause').click(); return; }
    if (e.key === 'f' || e.key === 'F') { el('speed').click(); return; }

    const abil = D.ABILITIES.find(a => a.key.toLowerCase() === e.key.toLowerCase());
    if (abil) { e.preventDefault(); triggerAbility(abil.id); return; }

    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      const k = ui.keyCell;
      if (e.key === 'ArrowRight') k.gx = Math.min(D.COLS - 1, k.gx + 1);
      if (e.key === 'ArrowLeft') k.gx = Math.max(0, k.gx - 1);
      if (e.key === 'ArrowDown') k.gy = Math.min(D.ROWS - 1, k.gy + 1);
      if (e.key === 'ArrowUp') k.gy = Math.max(0, k.gy - 1);
      ui.hover = { ...k };
      return;
    }
    if (e.key === 'Enter' && document.activeElement === canvas) {
      e.preventDefault();
      handleClick(ui.keyCell);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && ui.game && !ui.game.finished && ui.view === 'game') {
      ui.game.paused = true; syncHud(true);
    }
  });

  /* 调试句柄：方便自动化验证与问题排查 */
  Object.defineProperty(window, '__NB', { value: {
    get game() { return ui.game; }, get ui() { return ui; },
    launch, quitToMenu, handleClick, chooseTower, triggerAbility, Sfx
  }, configurable: true });

  /* ═════════ 引导 ═════════ */
  buildMenu();
  if (!Store.get('nbo:v1:seen', false)) {
    Store.set('nbo:v1:seen', true);
    setTimeout(() => { el('guide').showModal(); }, 600);
  }
})();
