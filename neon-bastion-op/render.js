'use strict';
/* ═══════════════════════════════════════════════════════════════
   NEON BASTION // OVERDRIVE PROTOCOL — 渲染层
   性能要点：
   1. 所有辉光使用离屏预渲染的径向渐变精灵（lighter 混合），
      避免逐实体 shadowBlur（后者是最贵的 canvas 操作）。
   2. 地图底图（星野 / 网格 / 路面）一次性烘焙到离屏 canvas。
   3. 粒子使用对象池 + 单次 fillRect 批量绘制。
   ═══════════════════════════════════════════════════════════════ */
(function (root) {
  const D = root.DATA;
  const { CELL, W, H, TAU } = D;
  const HALF = CELL / 2;

  /* ───────── 辉光精灵缓存 ───────── */
  const glowCache = new Map();
  function glowSprite(color, size) {
    const key = color + '|' + size;
    let c = glowCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size, size, 0, size, size, size);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.18, hexA(color, 0.85));
    grad.addColorStop(0.55, hexA(color, 0.22));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size * 2, size * 2);
    glowCache.set(key, c);
    return c;
  }
  const hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = 1;
      this.time = 0;
      this.stars = [];
      this.particles = [];
      this.trails = [];
      this.bg = null;
      this.bgKey = '';
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.shakeX = 0; this.shakeY = 0;
      this.resize();
      new ResizeObserver(() => this.resize()).observe(canvas);
      this._seedStars();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = this.canvas.getBoundingClientRect();
      const scale = (r.width / W) * dpr;
      // 限制内部像素总量，避免 4K 屏上过度绘制
      const maxPixels = 1920 * 1200;
      const ratio = Math.min(1, Math.sqrt(maxPixels / (W * H * scale * scale)));
      this.dpr = scale * ratio;
      this.canvas.width = Math.round(W * this.dpr);
      this.canvas.height = Math.round(H * this.dpr);
      this.bgKey = '';
    }

    _seedStars() {
      const rng = root.ENGINE.createRng(1337);
      this.stars = Array.from({ length: 90 }, () => ({
        x: rng.range(0, W), y: rng.range(0, H),
        r: rng.range(0.5, 1.6), p: rng.range(0, TAU), s: rng.range(0.3, 1.4)
      }));
    }

    /* ───────── 底图烘焙 ───────── */
    _bakeBackground(game) {
      const key = game.mapIndex + '|' + game.map.color;
      if (this.bgKey === key && this.bg) return;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const accent = game.map.color;

      // 深空底色
      const sky = g.createLinearGradient(0, 0, W, H);
      sky.addColorStop(0, '#05080f');
      sky.addColorStop(0.5, '#070d18');
      sky.addColorStop(1, '#04060c');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);

      // 星云
      const rng = root.ENGINE.createRng(90 + game.mapIndex * 7);
      for (let i = 0; i < 7; i++) {
        const x = rng.range(0, W), y = rng.range(0, H), r = rng.range(140, 380);
        const neb = g.createRadialGradient(x, y, 0, x, y, r);
        const col = i % 2 ? accent : '#5e6bff';
        neb.addColorStop(0, hexA(col, 0.055));
        neb.addColorStop(1, hexA(col, 0));
        g.fillStyle = neb; g.fillRect(x - r, y - r, r * 2, r * 2);
      }

      // 网格
      g.strokeStyle = hexA(accent, 0.055);
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= W; x += CELL) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
      for (let y = 0; y <= H; y += CELL) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
      g.stroke();
      // 粗网格
      g.strokeStyle = hexA(accent, 0.11);
      g.beginPath();
      for (let x = 0; x <= W; x += CELL * 4) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
      for (let y = 0; y <= H; y += CELL * 4) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
      g.stroke();

      // 路面：外晕 → 路基 → 内芯
      for (const route of game.map.routes) {
        const pts = route.points;
        const stroke = (width, style) => {
          g.beginPath();
          pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
          g.lineWidth = width; g.strokeStyle = style; g.lineJoin = 'round'; g.lineCap = 'round';
          g.stroke();
        };
        stroke(58, hexA(accent, 0.05));
        stroke(48, hexA(accent, 0.13));
        stroke(40, '#0b1220');
        stroke(32, hexA(accent, 0.05));
      }

      // 角落装饰
      g.strokeStyle = hexA(accent, 0.35); g.lineWidth = 2;
      const corner = (x, y, dx, dy) => {
        g.beginPath(); g.moveTo(x + 22 * dx, y); g.lineTo(x, y); g.lineTo(x, y + 22 * dy); g.stroke();
      };
      corner(14, 14, 1, 1); corner(W - 14, 14, -1, 1); corner(14, H - 14, 1, -1); corner(W - 14, H - 14, -1, -1);

      this.bg = c; this.bgKey = key;
    }

    /* ───────── 主绘制 ───────── */
    draw(game, ui, rawDt) {
      const ctx = this.ctx, accent = game.map.color;
      this.time += rawDt;
      this._bakeBackground(game);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // 震屏
      const shake = this.reduced ? 0 : game.shake;
      this.shakeX = (Math.random() - 0.5) * shake;
      this.shakeY = (Math.random() - 0.5) * shake;
      ctx.save();
      ctx.translate(this.shakeX, this.shakeY);

      ctx.drawImage(this.bg, 0, 0);

      // 星野闪烁
      ctx.globalCompositeOperation = 'lighter';
      for (const s of this.stars) {
        const a = 0.18 + (Math.sin(this.time * s.s + s.p) + 1) * 0.16;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#9fc9ff';
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      this._drawPathFlow(game, accent);
      this._drawCore(game, accent);
      this._drawSpawnGates(game, accent);
      this._drawRelayLinks(game);
      this._drawPlacement(game, ui);

      for (const t of game.towers) this._drawTower(game, t, ui);
      for (const p of game.projectiles) this._drawProjectile(p);
      for (const e of game.enemies) this._drawEnemy(game, e);
      this._drawEffects(game);
      this._drawParticles(rawDt);

      ctx.restore();
    }

    /* ───────── 路径能量流 ───────── */
    _drawPathFlow(game, accent) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const route of game.map.routes) {
        const pts = route.points;
        ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.lineWidth = 2;
        ctx.strokeStyle = hexA(accent, 0.22);
        ctx.setLineDash([4, 14]);
        ctx.lineDashOffset = this.reduced ? 0 : -this.time * 46;
        ctx.stroke();
        ctx.setLineDash([]);

        // 能量脉冲块
        if (!this.reduced) {
          const gap = 150;
          for (let d = (this.time * 90) % gap; d < route.length; d += gap) {
            const p = root.ENGINE.pointAt(route, d);
            const size = 13;
            const sp = glowSprite(accent, 32);
            ctx.globalAlpha = 0.55;
            ctx.drawImage(sp, p.x - size, p.y - size, size * 2, size * 2);
            ctx.globalAlpha = 1;
          }
        }
      }
      ctx.restore();
    }

    /* ───────── 核心 ───────── */
    _drawCore(game, accent) {
      const ctx = this.ctx, { x, y } = game.map.core;
      const hpRatio = game.lives / Math.max(1, game.livesMax);
      const col = hpRatio > 0.6 ? accent : hpRatio > 0.3 ? '#ffc36b' : '#ff5c7a';
      const pulse = 1 + Math.sin(this.time * 2.4) * 0.06;
      ctx.save();
      ctx.translate(x, y);
      ctx.globalCompositeOperation = 'lighter';
      const sp = glowSprite(col, 90);
      ctx.globalAlpha = 0.55 + Math.sin(this.time * 2.4) * 0.08;
      ctx.drawImage(sp, -90, -90, 180, 180);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      ctx.rotate(this.reduced ? 0 : this.time * 0.35);
      ctx.strokeStyle = hexA(col, 0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 40 * pulse, 0, TAU); ctx.stroke();
      ctx.strokeStyle = hexA(col, 0.8); ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6;
        ctx.beginPath(); ctx.arc(0, 0, 30 * pulse, a, a + 0.5); ctx.stroke();
      }
      ctx.rotate(this.reduced ? 0 : -this.time * 0.9);
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      this._polygon(ctx, 0, 0, 20 * pulse, 6, Math.PI / 6);
      ctx.stroke();
      ctx.fillStyle = hexA(col, 0.16);
      this._polygon(ctx, 0, 0, 15 * pulse, 6, Math.PI / 6);
      ctx.fill();
      ctx.fillStyle = hexA('#ffffff', 0.9);
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
      ctx.restore();

      // 核心血条
      ctx.save();
      ctx.translate(x, y + 54);
      ctx.fillStyle = 'rgba(4,8,14,0.8)';
      ctx.fillRect(-44, 0, 88, 5);
      ctx.fillStyle = col;
      ctx.fillRect(-44, 0, 88 * Math.max(0, hpRatio), 5);
      ctx.font = '7px ui-monospace, monospace';
      ctx.fillStyle = hexA(col, 0.85);
      ctx.textAlign = 'center';
      ctx.fillText(`CORE ${game.lives}/${game.livesMax}`, 0, -5);
      ctx.restore();
    }

    _drawSpawnGates(game, accent) {
      const ctx = this.ctx;
      ctx.save();
      for (const route of game.map.routes) {
        const p = route.points[0];
        const a = 0.55 + Math.sin(this.time * 3 + p.x * 0.01) * 0.2;
        ctx.globalCompositeOperation = 'lighter';
        const sp = glowSprite('#ff5c7a', 42);
        ctx.globalAlpha = a * 0.55;
        ctx.drawImage(sp, p.x - 42, p.y - 42, 84, 84);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(this.reduced ? 0 : this.time * 0.8);
        ctx.strokeStyle = '#ff5c7a'; ctx.lineWidth = 2;
        this._polygon(ctx, 0, 0, 20, 4, Math.PI / 4); ctx.stroke();
        this._polygon(ctx, 0, 0, 11, 4, Math.PI / 4); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    _drawRelayLinks(game) {
      const ctx = this.ctx;
      const powered = game.poweredRelays();
      const seen = new Set();
      ctx.save();
      ctx.setLineDash([4, 7]);
      ctx.lineWidth = 1.2;
      for (const src of game.towers) {
        if (src.def.id !== 'arc') continue;
        for (const route of game.arcRoutes(src)) {
          if (!route.hops) continue;
          const a = route.path[route.path.length - 2], b = route.path[route.path.length - 1];
          const key = a.id + '>' + b.id;
          if (seen.has(key)) continue;
          seen.add(key);
          const active = powered.has(b);
          ctx.strokeStyle = hexA('#b18cff', active ? 0.55 + Math.sin(this.time * 4) * 0.2 : 0.15);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      ctx.restore();
    }

    /* ───────── 放置预览 ───────── */
    _drawPlacement(game, ui) {
      if (!ui.hover || ui.build === null || ui.build === undefined) return;
      const ctx = this.ctx;
      const def = D.TOWERS[ui.build];
      const { gx, gy } = ui.hover;
      const x = gx * CELL + HALF, y = gy * CELL + HALF;
      const ok = game.canBuild(gx, gy) && game.credits >= def.cost;
      const col = ok ? def.color : '#ff5c7a';

      ctx.save();
      ctx.fillStyle = hexA(col, 0.08);
      ctx.fillRect(gx * CELL + 2, gy * CELL + 2, CELL - 4, CELL - 4);
      ctx.strokeStyle = hexA(col, 0.85);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(gx * CELL + 2.5, gy * CELL + 2.5, CELL - 5, CELL - 5);
      if (def.range > 0) {
        ctx.beginPath(); ctx.arc(x, y, def.range, 0, TAU);
        ctx.setLineDash([5, 8]);
        ctx.strokeStyle = hexA(col, 0.45);
        ctx.lineWidth = 1;
        ctx.fillStyle = hexA(col, 0.04);
        ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 0.55;
      this._towerShape(ctx, { def, level: 1, angle: -Math.PI / 2, flash: 0, x, y }, true);
      ctx.restore();
    }

    _drawTower(game, t, ui) {
      const ctx = this.ctx;
      const powered = t.def.id === 'relay' ? game.poweredRelays().has(t) : true;
      const selected = ui.selected === t;
      const y = t.stun > 0 ? t.y + Math.sin(this.time * 30) * 1.2 : t.y;

      ctx.save();
      ctx.translate(t.x, y);

      if (selected) {
        ctx.strokeStyle = hexA(t.def.color, 0.75);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalCompositeOperation = 'lighter';
        const sp = glowSprite(t.def.color, 40);
        ctx.globalAlpha = 0.22;
        ctx.drawImage(sp, -40, -40, 80, 80);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if (t.def.range > 0) {
          const s = game.towerStats(t);
          ctx.beginPath(); ctx.arc(0, 0, s.range, 0, TAU);
          ctx.fillStyle = hexA(t.def.color, 0.045);
          ctx.fill();
          ctx.setLineDash([5, 8]); ctx.strokeStyle = hexA(t.def.color, 0.5); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // 底座
      ctx.fillStyle = '#0c1524';
      ctx.strokeStyle = hexA(powered ? t.def.color : '#54606b', powered ? 0.55 : 0.7);
      ctx.lineWidth = 1.2;
      this._polygon(ctx, 0, 0, 21, 6, Math.PI / 6);
      ctx.fill(); ctx.stroke();

      // 旋转外环
      if (!this.reduced) {
        ctx.strokeStyle = hexA(t.def.color, powered ? 0.28 : 0.1);
        ctx.lineWidth = 1;
        const spin = this.time * (t.def.id === 'sniper' ? 0.15 : 0.4) + t.id;
        ctx.beginPath(); ctx.arc(0, 0, 25, spin, spin + 1.5); ctx.stroke();
      }

      this._towerShape(ctx, t, false, powered);

      // 闪光
      if (t.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const sp = glowSprite(t.def.color, 16 + t.flash * 90);
        const sz = 16 + t.flash * 90;
        ctx.globalAlpha = Math.min(1, t.flash * 5) * 0.8;
        ctx.drawImage(sp, -sz, -sz, sz * 2, sz * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      // 等级指示
      if (t.level > 1) {
        ctx.fillStyle = t.def.color;
        for (let i = 0; i < t.level; i++) ctx.fillRect(-(t.level - 1) * 3 + i * 6 - 1, 25, 3, 3);
      }
      if (t.def.id === 'relay' && !powered) {
        ctx.fillStyle = '#ff5c7a';
        ctx.font = '8px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('×', 0, -20);
      }
      if (t.stun > 0) {
        ctx.fillStyle = hexA('#ff6be0', 0.8);
        ctx.font = '8px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⌁', 0, -25);
      }
      ctx.restore();
    }

    _towerShape(ctx, t, ghost, powered = true) {
      const def = t.def;
      const col = powered ? def.color : '#6b7884';
      ctx.save();
      ctx.rotate(t.angle + Math.PI / 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = ghost ? 1.2 : 1.9;
      ctx.fillStyle = hexA(col, 0.14);
      const id = def.id;
      const spin = this.reduced ? 0 : this.time * 0.6 + (t.id || 0);

      if (id === 'pulse') {
        ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(12, 9); ctx.lineTo(-12, 9); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -21); ctx.stroke();
      } else if (id === 'arc') {
        ctx.rotate(spin * 0.5);
        this._polygon(ctx, 0, 0, 13, 4, 0); ctx.fill(); ctx.stroke();
        this._polygon(ctx, 0, 0, 6, 4, spin); ctx.stroke();
        ctx.strokeStyle = hexA(col, 0.45);
        ctx.beginPath(); ctx.arc(0, 0, 19, spin, spin + 1.1); ctx.stroke();
      } else if (id === 'frost') {
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6 + spin;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
          ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17); ctx.stroke();
        }
        ctx.fillStyle = hexA(col, 0.3);
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      } else if (id === 'nova') {
        this._polygon(ctx, 0, 0, 14, 6, spin * 0.2); ctx.fill(); ctx.stroke();
        this._polygon(ctx, 0, 0, 8, 3, 0); ctx.stroke();
        ctx.fillStyle = hexA(col, 0.55);
        ctx.beginPath(); ctx.arc(0, -4, 3.5, 0, TAU); ctx.fill();
      } else if (id === 'rail') {
        ctx.fillStyle = hexA(col, 0.18);
        ctx.fillRect(-4, -22, 8, 30);
        ctx.strokeRect(-4, -22, 8, 30);
        ctx.fillStyle = col;
        ctx.fillRect(-1.5, -26, 3, 10);
        ctx.beginPath(); ctx.arc(0, 6, 2, 0, TAU); ctx.fill();
      } else if (id === 'venom') {
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = i * TAU / 3 + spin;
          ctx.beginPath(); ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, 4.5, 0, TAU); ctx.fill(); ctx.stroke();
        }
      } else if (id === 'tesla') {
        ctx.strokeStyle = col; ctx.lineWidth = 1.4;
        this._polygon(ctx, 0, 0, 15, 8, spin * 0.3); ctx.stroke();
        this._polygon(ctx, 0, 0, 9, 8, -spin * 0.5); ctx.stroke();
        if (!ghost && !this.reduced) {
          ctx.strokeStyle = hexA('#ffffff', 0.6);
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = spin * 2 + i * 1.3, r = 4 + (i % 2) * 5;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.stroke();
        }
      } else if (id === 'gravity') {
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.stroke();
        ctx.strokeStyle = hexA(col, 0.6);
        for (let i = 0; i < 3; i++) {
          const r = ((spin * 12 + i * 9) % 20) + 2;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, 5 + Math.sin(spin * 3) * 1.5, 0, TAU); ctx.fill();
      } else if (id === 'drone') {
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.stroke();
        for (const d of t.drones || []) {
          ctx.save();
          ctx.rotate(0);
          ctx.translate(Math.cos(d.a) * 26, Math.sin(d.a) * 26);
          ctx.rotate(d.a + Math.PI / 2);
          ctx.fillStyle = hexA(col, 0.9);
          ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      } else if (id === 'flame') {
        ctx.fillStyle = hexA(col, 0.2);
        ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(13, 8); ctx.lineTo(-13, 8); ctx.closePath();
        ctx.fill(); ctx.stroke();
        if (!ghost) {
          ctx.fillStyle = hexA('#ffd76a', 0.5 + Math.sin(this.time * 12) * 0.2);
          ctx.beginPath();
          ctx.moveTo(0, -20 - Math.sin(this.time * 9) * 3);
          ctx.lineTo(6, -2); ctx.lineTo(-6, -2); ctx.closePath(); ctx.fill();
        }
      } else if (id === 'sniper') {
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, -22); ctx.lineTo(0, 18); ctx.moveTo(-16, 2); ctx.lineTo(16, 2);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.stroke();
        ctx.rotate(-t.angle - Math.PI / 2);
        ctx.strokeStyle = hexA(col, 0.35);
        ctx.beginPath(); ctx.arc(0, 0, 24, -0.4, 0.4); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 24, Math.PI - 0.4, Math.PI + 0.4); ctx.stroke();
      } else if (id === 'prism') {
        ctx.rotate(spin * 0.3);
        this._polygon(ctx, 0, 0, 15, 6, 0); ctx.stroke();
        this._polygon(ctx, 0, 0, 8, 6, Math.PI / 6); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = hexA(col, 0.4);
        for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8 + spin * 0.6;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 17, Math.sin(a) * 17);
          ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22); ctx.stroke();
        }
      } else if (id === 'relay') {
        ctx.fillStyle = '#2a3a44';
        ctx.fillRect(-4, -18, 8, 34);
        ctx.strokeRect(-4, -18, 8, 34);
        ctx.strokeStyle = col;
        for (const yy of [-9, 9]) { ctx.beginPath(); ctx.moveTo(-11, yy); ctx.lineTo(11, yy); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(0, -21, 4, 0, TAU); ctx.stroke();
        ctx.fillStyle = powered ? col : '#4a555e';
        ctx.beginPath(); ctx.arc(0, -21, 2, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    /* ───────── 子弹 ───────── */
    _drawProjectile(p) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sz = p.size * 4;
      const sp = glowSprite(p.color, 20);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(sp, p.x - sz, p.y - sz, sz * 2, sz * 2);
      if (p.splash) {
        ctx.strokeStyle = hexA(p.color, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7 + Math.sin(this.time * 20) * 1.5, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle || 0);
      ctx.fillStyle = p.color;
      if (p.kind === 'shell') {
        this._polygon(ctx, 0, 0, 6, 6, 0); ctx.fill();
      } else if (p.kind === 'blob') {
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      } else {
        ctx.fillRect(-6, -1.2, 12, 2.4);
      }
      ctx.restore();
      ctx.restore();
    }

    /* ───────── 敌人 ───────── */
    _drawEnemy(game, e) {
      const ctx = this.ctx;
      const def = e.def;
      const col = e.slowT > 0 ? '#6fdcff' : def.color;
      const phaseGhost = def.phase && e.phaseT % def.phase < 0.9;
      ctx.save();
      ctx.translate(e.x, e.y);

      // 地面阴影（飞行单位抬高）
      if (!e.flying) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(0, e.size * 0.75, e.size * 0.85, e.size * 0.3, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (e.flying) {
        ctx.translate(0, -8);
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = hexA(col, 0.5);
        ctx.beginPath(); ctx.moveTo(0, e.size + 6); ctx.lineTo(0, e.size + 16); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const isBoss = !!def.boss;
      if (isBoss || e.elite) {
        ctx.globalCompositeOperation = 'lighter';
        const sz = e.size * (isBoss ? 3.2 : 2.2);
        const sp = glowSprite(col, 64);
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 3 + e.pulse) * 0.12;
        ctx.drawImage(sp, -sz, -sz, sz * 2, sz * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      if (phaseGhost) ctx.globalAlpha = 0.35;
      const rot = this.reduced ? e.rot : e.rot + this.time * (def.boss ? 0.6 : 1.4);
      const hitFlash = e.hit > 0;

      // 外形：按种类使用不同边数 / 结构
      ctx.rotate(rot);
      ctx.fillStyle = hitFlash ? '#ffffff' : hexA(col, 0.18);
      ctx.strokeStyle = hitFlash ? '#ffffff' : col;
      ctx.lineWidth = isBoss ? 2.6 : e.elite ? 2 : 1.7;
      const sides = Math.max(3, Math.min(12, def.sides || 4));
      this._polygon(ctx, 0, 0, e.size, sides, 0);
      ctx.fill(); ctx.stroke();

      // 内部结构
      ctx.strokeStyle = hexA(col, 0.55);
      ctx.lineWidth = 1;
      if (e.kind === 'brute' || e.kind === 'juggernaut') {
        this._polygon(ctx, 0, 0, e.size * 0.62, sides, Math.PI / sides); ctx.stroke();
      } else if (e.kind === 'aegis') {
        ctx.beginPath(); ctx.arc(0, 0, e.size * 0.55, 0, TAU); ctx.stroke();
      } else if (e.kind === 'splitter' || e.kind === 'shard') {
        ctx.beginPath(); ctx.moveTo(-e.size * 0.5, 0); ctx.lineTo(e.size * 0.5, 0); ctx.stroke();
      } else if (e.kind === 'weaver' || e.kind === 'obelisk') {
        this._polygon(ctx, 0, 0, e.size * 0.45, 4, Math.PI / 4); ctx.stroke();
      } else if (isBoss) {
        ctx.rotate(-rot * 2);
        this._polygon(ctx, 0, 0, e.size * 0.66, 6, Math.PI / 6); ctx.stroke();
      }
      ctx.fillStyle = hitFlash ? '#fff' : hexA(col, 0.9);
      ctx.beginPath(); ctx.arc(0, 0, Math.max(1.8, e.size * 0.16), 0, TAU); ctx.fill();
      ctx.restore();

      // 护盾
      if (e.shield > 0) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = hexA('#6fdcff', 0.35 + (e.shield / Math.max(1, e.maxShield)) * 0.45);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, e.size + 6, 0, TAU); ctx.stroke();
        ctx.restore();
      }

      // 眩晕 / 冻结
      if (e.stunT > 0 || e.slowT > 0) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.strokeStyle = hexA(e.stunT > 0 ? '#ffe66b' : '#6fdcff', 0.65);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.lineDashOffset = -this.time * 20;
        ctx.beginPath(); ctx.arc(0, 0, e.size + 4, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // 血条
      const hpW = Math.max(18, e.size * 2.2);
      const y = e.y - e.size - 9;
      ctx.fillStyle = 'rgba(4,8,14,0.75)';
      ctx.fillRect(e.x - hpW / 2, y, hpW, 3);
      ctx.fillStyle = e.elite ? '#ffd76a' : e.shield > 0 ? '#6fdcff' : '#ff5c7a';
      ctx.fillRect(e.x - hpW / 2, y, hpW * Math.max(0, e.hp / e.maxHp), 3);
      if (e.elite || def.boss) {
        ctx.fillStyle = '#ffd76a';
        ctx.font = '6px ui-monospace, monospace';
        ctx.textAlign = 'center';
        if (def.boss) ctx.fillText(def.name.split(' ')[0], e.x, y - 4);
        else ctx.fillText('ELITE', e.x, y - 4);
      }
    }

    /* ───────── 效果 ───────── */
    _drawEffects(game) {
      const ctx = this.ctx;
      for (const ef of game.effects) {
        const p = 1 - ef.life / ef.max;
        switch (ef.kind) {
          case 'ring':
          case 'shock': {
            const r = (ef.r0 || 0) + ((ef.r1 || 100) - (ef.r0 || 0)) * Math.sqrt(p);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (1 - p) * 0.9;
            ctx.strokeStyle = ef.color;
            ctx.lineWidth = ef.kind === 'shock' ? 4 * (1 - p) + 1 : 2.5 * (1 - p) + 0.6;
            ctx.beginPath(); ctx.arc(ef.x, ef.y, r, 0, TAU); ctx.stroke();
            if (ef.kind === 'shock') {
              ctx.globalAlpha = (1 - p) * 0.35;
              ctx.lineWidth = 1;
              ctx.beginPath(); ctx.arc(ef.x, ef.y, r * 0.82, 0, TAU); ctx.stroke();
            }
            ctx.restore();
            break;
          }
          case 'implode': {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (1 - p) * 0.7;
            ctx.strokeStyle = ef.color;
            for (let i = 0; i < 3; i++) {
              const r = ef.r * (1 - p) * (0.4 + i * 0.3);
              ctx.lineWidth = 2 - i * 0.5;
              ctx.beginPath(); ctx.arc(ef.x, ef.y, r, 0, TAU); ctx.stroke();
            }
            ctx.restore();
            break;
          }
          case 'burst': {
            const n = this.reduced ? 4 : ef.n;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < n; i++) {
              const a = (i / n) * TAU + p * 2;
              const d = ef.spread * 0.5 * Math.sqrt(p) + i * 2;
              ctx.globalAlpha = (1 - p) * 0.9;
              ctx.fillStyle = ef.color;
              ctx.fillRect(ef.x + Math.cos(a) * d, ef.y + Math.sin(a) * d, 2.4, 2.4);
            }
            ctx.restore();
            break;
          }
          case 'spark': {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = ef.color;
            const n = this.reduced ? 2 : ef.n;
            ctx.globalAlpha = (1 - p) * 0.9;
            for (let i = 0; i < n; i++) {
              const a = (i * 7.3) % TAU;
              ctx.fillRect(ef.x + Math.cos(a) * (6 + p * 14), ef.y + Math.sin(a) * (6 + p * 14), 2, 2);
            }
            ctx.restore();
            break;
          }
          case 'arc':
          case 'beam': {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (1 - p) * 0.95;
            ctx.strokeStyle = ef.color;
            ctx.lineWidth = (ef.width || 2) * (1 - p * 0.5);
            ctx.beginPath();
            if (ef.kind === 'beam') {
              ctx.moveTo(ef.x1, ef.y1); ctx.lineTo(ef.x2, ef.y2);
            } else {
              const pts = ef.points;
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i];
                for (let j = 1; j <= 4; j++) {
                  const f = j / 4;
                  const jitter = j === 4 ? 0 : Math.sin(ef.seed + i * 13 + j * 7 + this.time * 40) * (ef.thin ? 3 : 8);
                  ctx.lineTo(a.x + (b.x - a.x) * f + jitter, a.y + (b.y - a.y) * f - jitter);
                }
              }
            }
            ctx.stroke();
            ctx.restore();
            break;
          }
          case 'flame': {
            ctx.save();
            ctx.translate(ef.x, ef.y);
            ctx.rotate(ef.angle);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (1 - p) * 0.55;
            const grad = ctx.createLinearGradient(0, 0, ef.range, 0);
            grad.addColorStop(0, hexA('#ffd76a', 0.85));
            grad.addColorStop(0.4, hexA(ef.color, 0.6));
            grad.addColorStop(1, hexA(ef.color, 0));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, ef.range * (0.65 + p * 0.35), -0.35, 0.35);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            break;
          }
          case 'beamStrike': {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 1 - p;
            const grad = ctx.createLinearGradient(ef.x, 0, ef.x, ef.y);
            grad.addColorStop(0, hexA(ef.color, 0));
            grad.addColorStop(1, hexA(ef.color, 0.9));
            ctx.fillStyle = grad;
            const w = 46 * (1 - p * 0.6);
            ctx.fillRect(ef.x - w / 2, 0, w, ef.y);
            ctx.restore();
            break;
          }
          case 'trail': {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (1 - p) * 0.5;
            ctx.fillStyle = ef.color;
            ctx.beginPath(); ctx.arc(ef.x, ef.y, ef.size * (1 - p), 0, TAU); ctx.fill();
            ctx.restore();
            break;
          }
          case 'float': {
            ctx.save();
            ctx.globalAlpha = Math.min(1, p * 3) * (1 - p * 0.3);
            ctx.fillStyle = ef.color;
            ctx.font = '10px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(ef.text, ef.x, ef.y - 26 - p * 22);
            ctx.restore();
            break;
          }
        }
      }
    }

    _drawParticles() { /* 效果系统已包含粒子，保留接口 */ }

    /* ───────── 工具 ───────── */
    _polygon(ctx, x, y, r, sides, rot) {
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + i * TAU / sides;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
    }

    /* 屏幕坐标 → 网格 */
    cellAt(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const x = (clientX - r.left) / r.width * W;
      const y = (clientY - r.top) / r.height * H;
      return { gx: Math.floor(x / CELL), gy: Math.floor(y / CELL) };
    }
    toWorld(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      return { x: (clientX - r.left) / r.width * W, y: (clientY - r.top) / r.height * H };
    }
  }

  root.RENDER = { Renderer, glowSprite, hexA };
})(typeof globalThis !== 'undefined' ? globalThis : this);
