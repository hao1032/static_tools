'use strict';
/* ═══════════════════════════════════════════════════════════════
   NEON BASTION // OVERDRIVE PROTOCOL — 模拟引擎
   纯逻辑，不访问 DOM。渲染层每帧读取 state 并消费 state.events。
   随机数可注入，便于无头测试与回放。
   ═══════════════════════════════════════════════════════════════ */
(function (root) {
  const D = root.DATA;
  const { CELL, COLS, ROWS, TAU, MAX_WAVE } = D;
  const HALF = CELL / 2;
  const ROAD_HALF = 17;          // 路面半宽
  const TOWER_RADIUS = 16;       // 炮塔占地半径

  /* ───────────── 随机数 ───────────── */
  function createRng(seed = (Math.random() * 2 ** 32) >>> 0) {
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rnd.range = (a, b) => a + rnd() * (b - a);
    rnd.pick = arr => arr[Math.floor(rnd() * arr.length)];
    rnd.seed = seed;
    return rnd;
  }

  /* ───────────── 路径工具 ───────────── */
  function buildPath(points) {
    const pts = points.map(([x, y]) => ({ x: x * CELL + HALF, y: y * CELL + HALF }));
    const segments = [];
    let length = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.001) continue;
      segments.push({ a, b, len, start: length, dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } });
      length += len;
    }
    return { points: pts, segments, length };
  }

  function pointAt(path, d) {
    const segs = path.segments;
    let lo = 0, hi = segs.length - 1;
    if (d <= 0) { const s = segs[0]; return { x: s.a.x, y: s.a.y, dir: s.dir, seg: s }; }
    if (d >= path.length) { const s = segs[segs.length - 1]; return { x: s.b.x, y: s.b.y, dir: s.dir, seg: s }; }
    while (lo < hi) { const mid = (lo + hi) >> 1; if (d <= segs[mid].start + segs[mid].len) hi = mid; else lo = mid + 1; }
    const s = segs[lo];
    const t = (d - s.start) / s.len;
    return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t, dir: s.dir, seg: s };
  }

  function distToSegment(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
  }

  /* ───────────── 地图 ───────────── */
  function prepareMap(index) {
    const def = D.MAPS[index];
    const routes = def.routes.map(buildPath);
    const core = { x: def.core[0] * CELL + HALF, y: def.core[1] * CELL + HALF };
    for (const r of routes) {
      const end = pointAt(r, r.length);
      end.x = core.x; end.y = core.y;
    }
    return { def, routes, core, color: def.color, mod: def.mod || {} };
  }

  function roadDistance(map, px, py) {
    let min = Infinity;
    for (const route of map.routes)
      for (const s of route.segments) min = Math.min(min, distToSegment(px, py, s.a, s.b));
    return min;
  }

  /* ───────────── 数值曲线 ───────────── */
  const hpScale = (wave, diff, map) =>
    (1 + (wave - 1) * 0.145 + Math.pow(wave - 1, 2) * 0.0092) * diff.hp * (map.mod.hp || 1);
  const speedScale = (wave, diff, map, pathLen) =>
    (1 + Math.min(wave, 40) * 0.008) * diff.speed * (map.mod.speed || 1) *
    Math.pow(Math.max(700, pathLen) / 1500, 0.55);

  /* ═════════════════════════ 游戏 ═════════════════════════ */
  class Game {
    constructor({ map = 0, difficulty = 'standard', auto = false, seed } = {}) {
      this.mapIndex = map;
      this.difficulty = difficulty;
      this.auto = auto;
      this.rng = createRng(seed ?? (Math.random() * 2 ** 32) >>> 0);
      this.map = prepareMap(map);
      const diff = D.DIFFICULTIES[difficulty];
      this.livesMax = Math.max(5, diff.lives + (this.map.mod.lives || 0));
      this.reset();
    }

    reset() {
      const diff = D.DIFFICULTIES[this.difficulty];
      this.credits = Math.max(120, diff.credits + (this.map.mod.credits || 0));
      this.lives = this.livesMax;
      this.wave = 0;
      this.kills = 0;
      this.leaked = 0;
      this.earned = 0;
      this.towers = [];
      this.enemies = [];
      this.projectiles = [];
      this.effects = [];          // 纯视觉，渲染层消费后清理
      this.events = [];           // 音效 / 震屏等一次性事件
      this.spawnQueue = [];
      this.phase = 'idle';        // idle | combat | cleared | over | victory
      this.paused = false;
      this.finished = false;
      this.won = false;
      this.speed = 1;
      this.nextWaveIn = null;
      this.abilityCd = {}; for (const a of D.ABILITIES) this.abilityCd[a.id] = 0;
      this.time = 0;
      this.shake = 0;
      this.slowmo = 0;
      this.totalSpawned = 0;
      this.endless = false;
      this.stats = { damage: 0, built: 0, bestWave: 0 };
      this.pendingTarget = null;
      return this;
    }

    /* —— 基础查询 —— */
    cellCenter(gx, gy) { return { x: gx * CELL + HALF, y: gy * CELL + HALF }; }
    cellOf(px, py) { return { gx: Math.floor(px / CELL), gy: Math.floor(py / CELL) }; }

    towerAt(gx, gy) { return this.towers.find(t => t.gx === gx && t.gy === gy); }

    canBuild(gx, gy) {
      if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return false;
      if (this.towerAt(gx, gy)) return false;
      const p = this.cellCenter(gx, gy);
      if (p.x < TOWER_RADIUS + 6 || p.y < TOWER_RADIUS + 6 ||
          p.x > D.W - TOWER_RADIUS - 6 || p.y > D.H - TOWER_RADIUS - 6) return false;
      return roadDistance(this.map, p.x, p.y) > ROAD_HALF + TOWER_RADIUS - 4;
    }

    /* —— 炮塔 —— */
    build(typeIndex, gx, gy) {
      const def = D.TOWERS[typeIndex];
      if (!def || !this.canBuild(gx, gy)) return { ok: false, reason: '此处无法部署' };
      if (this.credits < def.cost) return { ok: false, reason: '晶体不足' };
      this.credits -= def.cost;
      const p = this.cellCenter(gx, gy);
      const tower = {
        id: this.towers.length + 1, type: typeIndex, def, gx, gy, x: p.x, y: p.y,
        level: 1, spent: def.cost, cool: this.rng.range(0, 0.35), angle: -Math.PI / 2,
        flash: 0, stun: 0, kills: 0, damage: 0, pulse: 0, drones: []
      };
      if (def.id === 'drone') {
        for (let i = 0; i < 2; i++) tower.drones.push({ a: i * Math.PI, cool: this.rng.range(0, 0.5) });
      }
      this.towers.push(tower);
      this.stats.built++;
      this.addEffect({ kind: 'ring', x: p.x, y: p.y, color: def.color, r0: 8, r1: 54, life: 0.45, max: 0.45 });
      this.addEffect({ kind: 'burst', x: p.x, y: p.y, color: def.color, n: 14, spread: 80 });
      this.events.push({ type: 'build', color: def.color });
      return { ok: true, tower };
    }

    upgradeCost(tower) {
      if (!tower || tower.level >= 3) return 0;
      return Math.round(tower.def.cost * D.UPGRADE_MUL[tower.level - 1]);
    }

    upgrade(tower) {
      if (!tower || tower.level >= 3) return false;
      const cost = this.upgradeCost(tower);
      if (this.credits < cost) return false;
      this.credits -= cost; tower.spent += cost; tower.level++; tower.pulse = 1;
      this.addEffect({ kind: 'ring', x: tower.x, y: tower.y, color: tower.def.color, r0: 10, r1: 62, life: 0.5, max: 0.5 });
      this.addEffect({ kind: 'burst', x: tower.x, y: tower.y, color: tower.def.color, n: 20, spread: 110 });
      this.events.push({ type: 'upgrade', color: tower.def.color });
      return true;
    }

    sell(tower) {
      if (!tower) return 0;
      const refund = Math.floor(tower.spent * D.SELL_RATE);
      this.credits += refund;
      this.towers = this.towers.filter(t => t !== tower);
      this.addEffect({ kind: 'burst', x: tower.x, y: tower.y, color: '#9fb3bd', n: 12, spread: 70 });
      this.events.push({ type: 'sell' });
      return refund;
    }

    /* —— 增益计算 —— */
    _buffs() {
      const jams = this.enemies.filter(e => e.def.jam && e.hp > 0);
      return this.towers.map(tower => {
        let dmgMul = 1, rangeMul = 1;
        for (const p of this.towers) {
          if (p.def.id !== 'prism' || p === tower) continue;
          const r = p.def.range * (1 + (p.level - 1) * 0.08);
          if (Math.hypot(p.x - tower.x, p.y - tower.y) <= r) {
            dmgMul = Math.max(dmgMul, 1 + 0.2 * p.level);
            rangeMul = Math.max(rangeMul, 1 + 0.07 * p.level);
          }
        }
        let jam = 1;
        for (const e of jams) if (Math.hypot(e.x - tower.x, e.y - tower.y) <= e.def.jam.radius) jam = Math.min(jam, e.def.jam.factor);
        return { dmgMul, rangeMul, jam };
      });
    }

    towerStats(tower, buff) {
      const def = tower.def, m = tower.level - 1;
      const b = buff || { dmgMul: 1, rangeMul: 1, jam: 1 };
      const stunned = tower.stun > 0;
      return {
        damage: def.damage * (1 + m * 0.9) * b.dmgMul,
        range: def.range * (1 + m * 0.08) * b.rangeMul,
        rate: def.rate > 0 ? def.rate / ((1 + m * 0.28) * b.jam) : 0,
        disabled: stunned || tower.level === 0,
        jam: b.jam
      };
    }

    /* —— 铁柱中继：BFS 接力 —— */
    arcRoutes(source) {
      const poles = this.towers.filter(t => t.def.id === 'relay');
      const maxHops = source.level + 2;
      const routes = [{ node: source, path: [source], hops: 0 }];
      const seen = new Set([source]);
      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        if (route.hops >= maxHops) continue;
        const reach = route.node.def.range * (1 + (route.node.level - 1) * 0.08);
        for (const pole of poles) {
          if (seen.has(pole)) continue;
          if (Math.hypot(route.node.x - pole.x, route.node.y - pole.y) > reach) continue;
          seen.add(pole);
          routes.push({ node: pole, path: route.path.concat([pole]), hops: route.hops + 1 });
        }
      }
      return routes;
    }

    poweredRelays() {
      const powered = new Set();
      for (const t of this.towers) {
        if (t.def.id !== 'arc') continue;
        for (const r of this.arcRoutes(t)) if (r.hops) powered.add(r.node);
      }
      return powered;
    }

    arcTarget(tower) {
      const routes = this.arcRoutes(tower);
      let best = null;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        for (const route of routes) {
          const r = route.node.def.range * (1 + (route.node.level - 1) * 0.08);
          if (Math.hypot(e.x - route.node.x, e.y - route.node.y) > r) continue;
          if (!best || e.d > best.target.d) best = { target: e, route };
        }
      }
      return best;
    }

    /* —— 敌人生成 —— */
    _waveSquads(wave) {
      if (wave <= MAX_WAVE) return D.WAVES[wave - 1].squads;
      // 无尽模式：从第 30 波的阵容里持续加码
      const pool = [['wraith', 6], ['juggernaut', 3], ['harbinger', 2], ['obelisk', 2], ['bomber', 6], ['phantom', 5], ['flyer', 8]];
      const extra = Math.min(2.2, 1 + (wave - MAX_WAVE) * 0.12);
      const squads = pool.map(([k, n]) => [k, Math.round(n * extra), 0.6]);
      if (wave % 5 === 0) squads.push([wave % 15 === 0 ? 'sovereign' : wave % 10 === 0 ? 'warden' : 'colossus', 1, 1]);
      return squads;
    }

    waveNote(wave) {
      if (wave <= MAX_WAVE) return D.WAVES[wave - 1].note || '';
      return wave % 5 === 0 ? '无尽模式 · 首领降临' : '无尽模式 · 敌人强度持续攀升';
    }

    startWave() {
      if (this.phase === 'combat' || this.finished) return false;
      this.wave++;
      this.phase = 'combat';
      this.paused = false;
      this.nextWaveIn = null;
      const diff = D.DIFFICULTIES[this.difficulty];
      const wave = this.wave;
      const longest = Math.max(...this.map.routes.map(r => r.length));
      const countMul = diff.count * (this.map.mod.count || 1) *
        (wave > MAX_WAVE ? Math.min(1.9, 1 + (wave - MAX_WAVE) * 0.05) : 1);
      const baseGap = diff.gap;
      const eliteChance = 0.045 + wave * 0.0035 + (this.map.mod.elite || 0);

      const queue = [];
      this._waveSquads(wave).forEach(([kind, count, gap], si) => {
        const n = kind === 'sovereign' || kind === 'warden' || kind === 'colossus' ? count : Math.max(1, Math.round(count * countMul));
        for (let i = 0; i < n; i++) {
          const elite = !D.ENEMIES[kind].boss && this.rng() < eliteChance;
          queue.push({ t: si * 1.15 + i * gap * baseGap, kind, elite });
        }
      });
      queue.sort((a, b) => a.t - b.t);
      this.spawnQueue = queue;
      this.waveEarned = this.earned;
      this.spawnClock = 0;
      this.totalSpawned = 0;
      this._longest = longest;
      this.events.push({ type: 'wave', boss: wave % 10 === 0 });
      this.phase = 'combat';
      return true;
    }

    _spawnUnit(kind, elite) {
      const def = D.ENEMIES[kind];
      const diff = D.DIFFICULTIES[this.difficulty];
      const wave = this.wave;
      const routeIndex = Math.floor(this.rng() * this.map.routes.length);
      const route = this.map.routes[routeIndex];
      const scale = hpScale(wave, diff, this.map);
      const hpBase = def.hp * (def.boss ? Math.pow(scale, 0.58) : scale) *
        (wave > MAX_WAVE ? 1 + (wave - MAX_WAVE) * 0.28 : 1);
      const hp = Math.round(hpBase * (elite ? D.ELITE.hp : 1));
      const start = pointAt(route, 0);
      const groundLen = route.length;
      const airLen = Math.hypot(this.map.core.x - start.x, this.map.core.y - start.y);
      const len = def.flying ? airLen : groundLen;
      const speed = def.speed * speedScale(wave, diff, this.map, groundLen) * (def.flying ? Math.pow(airLen / groundLen, 0.35) : 1) * (elite ? D.ELITE.speed : 1);
      const e = {
        uid: ++Game._uid, kind, def, elite,
        route, routeIndex, flying: !!def.flying,
        x: start.x, y: start.y, d: 0, len,
        hp, maxHp: hp, shield: def.shield ? Math.round(def.shield * hpScale(wave, diff, this.map)) : 0,
        maxShield: def.shield ? Math.round(def.shield * hpScale(wave, diff, this.map)) : 0,
        shieldDelay: 0, speed: def.flying ? speed * (airLen / len) : speed,
        baseSpeed: def.flying ? speed * (airLen / len) : speed,
        size: def.size * (elite ? D.ELITE.size : 1),
        side: routeIndex, slow: 0, slowT: 0, stunT: 0, burn: 0, burnT: 0, poison: 0, poisonT: 0, poisonStacks: 0,
        hit: 0, phaseT: this.rng.range(1.5, def.phase || 0), summonT: def.summon ? def.summon.every : 0,
        reward: Math.round(def.reward * 1.15 * diff.income * (this.map.mod.income || 1) * (elite ? D.ELITE.reward : 1)),
        rot: this.rng.range(0, TAU), pulse: this.rng.range(0, TAU)
      };
      this.enemies.push(e);
      this.totalSpawned++;
      return e;
    }

    /* —— 伤害 —— */
    damage(enemy, amount, source) {
      if (!enemy || enemy.hp <= 0) return 0;
      const dmgType = source ? source.def.dmgType : 'kinetic';
      const def = enemy.def;
      let mult = (def.resist && def.resist[dmgType]) || 1;
      if (enemy.phaseT > 0 && enemy.phaseT % 3.4 < 1) mult *= 0.5;
      let dmg = amount * mult;

      // 护盾优先吸收，量子与毒素穿透
      if (enemy.shield > 0 && dmgType !== 'quantum' && dmgType !== 'toxic') {
        const absorbed = Math.min(enemy.shield, dmg);
        enemy.shield -= absorbed; dmg -= absorbed;
        enemy.shieldDelay = 3;
        if (absorbed > 0) this.addEffect({ kind: 'spark', x: enemy.x, y: enemy.y, color: '#6fdcff', n: 3 });
      }
      if (dmg > 0) { enemy.hp -= dmg; enemy.hit = 0.14; }
      const applied = amount * mult;
      this.stats.damage += applied;
      if (source) { source.damage += applied; }
      if (enemy.hp <= 0) this._kill(enemy, source);
      return applied;
    }

    _kill(enemy, source) {
      if (enemy.dead) return;
      enemy.dead = true;
      this.kills++;
      this.credits += enemy.reward;
      this.earned += enemy.reward;
      if (source) source.kills++;
      const big = enemy.def.boss || enemy.elite;
      this.addEffect({ kind: 'burst', x: enemy.x, y: enemy.y, color: big ? '#ffe9a8' : enemy.def.color, n: big ? 46 : 16, spread: big ? 240 : 120 });
      this.addEffect({ kind: 'float', x: enemy.x, y: enemy.y, text: `+${enemy.reward}`, color: '#7dffc4', life: 0.9, max: 0.9 });
      if (big) {
        this.addEffect({ kind: 'ring', x: enemy.x, y: enemy.y, color: enemy.def.color, r0: 10, r1: 150, life: 0.8, max: 0.8 });
        this.shake = Math.max(this.shake, enemy.def.boss ? 10 : 4);
        if (enemy.def.boss) this.slowmo = 0.55;
        this.events.push({ type: 'bigkill' });
      } else this.events.push({ type: 'kill' });

      if (enemy.def.split) {
        for (let i = 0; i < enemy.def.split.count; i++) {
          const child = this._spawnUnit(enemy.def.split.kind, false);
          child.d = Math.max(0, enemy.d - 12 + i * 24);
          child.hp = child.maxHp = Math.round(enemy.maxHp * 0.22);
          const p = pointAt(child.route, child.d); child.x = p.x; child.y = p.y;
        }
      }
    }

    /* —— 泄漏 —— */
    _leak(enemy) {
      if (enemy.dead) return;
      enemy.dead = true;
      this.leaked++;
      const cost = enemy.def.boss ? 5 : 1;
      this.lives = Math.max(0, this.lives - cost);
      this.shake = Math.max(this.shake, enemy.def.boss ? 12 : 6);
      this.addEffect({ kind: 'burst', x: this.map.core.x, y: this.map.core.y, color: '#ff5c7a', n: 24, spread: 160 });
      this.addEffect({ kind: 'ring', x: this.map.core.x, y: this.map.core.y, color: '#ff5c7a', r0: 10, r1: 110, life: 0.6, max: 0.6 });
      this.events.push({ type: 'leak' });
      if (enemy.def.explode) this._towerStun(enemy.x, enemy.y, enemy.def.explode.radius, enemy.def.explode.stun);
      if (this.lives <= 0) this._end(false);
    }

    _towerStun(x, y, radius, seconds) {
      let hit = false;
      for (const t of this.towers) {
        if (Math.hypot(t.x - x, t.y - y) <= radius) { t.stun = Math.max(t.stun, seconds); hit = true; }
      }
      if (hit) {
        this.addEffect({ kind: 'ring', x, y, color: '#ff6be0', r0: 10, r1: radius, life: 0.5, max: 0.5 });
        this.events.push({ type: 'jam' });
      }
    }

    /* —— 技能 —— */
    useAbility(id, x, y) {
      const ab = D.ABILITIES.find(a => a.id === id);
      if (!ab || this.finished || this.paused) return false;
      if (this.abilityCd[id] > 0) return false;
      if (ab.target && (x === undefined || y === undefined)) return false;
      this.abilityCd[id] = ab.cd;
      this.events.push({ type: 'ability', id });
      switch (id) {
        case 'overload': {
          this.shake = Math.max(this.shake, 9);
          for (const e of this.enemies) {
            if (e.hp <= 0) continue;
            this.damage(e, 120 + this.wave * 14, null);
            e.slow = Math.max(e.slow, 0.45); e.slowT = Math.max(e.slowT, 3.5);
          }
          this.addEffect({ kind: 'shock', x: this.map.core.x, y: this.map.core.y, color: '#7dffc4', r1: 760, life: 1.1, max: 1.1 });
          this.slowmo = 0.25;
          break;
        }
        case 'orbital': {
          const radius = 120;
          this.shake = Math.max(this.shake, 12); this.slowmo = 0.35;
          for (const e of this.enemies) {
            if (e.hp > 0 && Math.hypot(e.x - x, e.y - y) <= radius) this.damage(e, 340 + this.wave * 42, null);
          }
          this.addEffect({ kind: 'shock', x, y, color: '#ffc36b', r1: radius * 1.6, life: 0.9, max: 0.9 });
          this.addEffect({ kind: 'beamStrike', x, y, color: '#ffe9a8', life: 0.5, max: 0.5 });
          break;
        }
        case 'stasis': {
          for (const e of this.enemies) {
            const res = e.def.slowResist || 0;
            e.slow = Math.max(e.slow, 0.72 * (1 - res)); e.slowT = Math.max(e.slowT, 4);
          }
          this.addEffect({ kind: 'shock', x: D.W / 2, y: D.H / 2, color: '#6fdcff', r1: 780, life: 1, max: 1 });
          break;
        }
        case 'repair': {
          this.lives = Math.min(this.livesMax, this.lives + 2);
          this.addEffect({ kind: 'ring', x: this.map.core.x, y: this.map.core.y, color: '#ff7fb0', r0: 12, r1: 120, life: 0.8, max: 0.8 });
          break;
        }
      }
      return true;
    }

    /* —— 视觉辅助 —— */
    addEffect(e) {
      if (this.effects.length > 220) this.effects.shift();
      this.effects.push(e);
    }

    /* ═════════════ 每步更新 ═════════════ */
    update(dt) {
      if (this.paused || this.finished) return;
      dt = Math.min(dt, 0.05);
      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 26);
      this.slowmo = Math.max(0, this.slowmo - dt);
      for (const k in this.abilityCd) this.abilityCd[k] = Math.max(0, this.abilityCd[k] - dt);

      const buffs = this._buffs();

      /* 波次出兵 */
      if (this.phase === 'combat') {
        this.spawnClock += dt;
        while (this.spawnQueue.length && this.spawnQueue[0].t <= this.spawnClock) {
          const s = this.spawnQueue.shift();
          this._spawnUnit(s.kind, s.elite);
        }
      }

      /* 敌人 */
      for (const e of this.enemies) {
        if (e.hp <= 0 || e.dead) continue;
        e.hit = Math.max(0, e.hit - dt);
        e.shieldDelay = Math.max(0, e.shieldDelay - dt);
        if (e.shieldDelay === 0 && e.shield < e.maxShield) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.1 * dt);
        e.stunT = Math.max(0, e.stunT - dt);
        e.slowT = Math.max(0, e.slowT - dt);
        if (e.slowT === 0) e.slow = 0;
        e.burnT = Math.max(0, e.burnT - dt);
        if (e.burn > 0) {
          this.damage(e, e.burn * dt, null);
          if (e.hp <= 0) continue;
        }
        e.poisonT = Math.max(0, e.poisonT - dt);
        if (e.poisonT === 0) { e.poison = 0; e.poisonStacks = 0; }
        if (e.poison > 0) {
          this.damage(e, e.poison * dt, null);
          if (e.hp <= 0) continue;
        }
        if (e.def.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.def.regen * dt);
        if (e.def.phase) {
          e.phaseT += dt;
          if (e.phaseT > e.def.phase) e.phaseT = 0;
        }

        // 光环与召唤
        if (e.def.aura) {
          for (const o of this.enemies) {
            if (o === e || o.hp <= 0) continue;
            const dist = Math.hypot(o.x - e.x, o.y - e.y);
            if (dist > e.def.aura.radius) continue;
            if (e.def.aura.heal) o.hp = Math.min(o.maxHp, o.hp + e.def.aura.heal * dt);
            if (e.def.aura.haste) { o.haste = e.def.aura.haste; o.hasteT = 0.25; }
          }
        }
        if (e.def.summon) {
          e.summonT -= dt;
          if (e.summonT <= 0) {
            e.summonT = e.def.summon.every;
            for (let i = 0; i < e.def.summon.count; i++) {
              const c = this._spawnUnit(e.def.summon.kind, false);
              c.d = e.d; c.route = e.route; c.hp = Math.round(c.maxHp * 0.8);
            }
          }
        }

        const haste = e.hasteT > 0 ? 1 + (e.haste || 0) : 1;
        e.hasteT = Math.max(0, (e.hasteT || 0) - dt);
        let slowMul = e.stunT > 0 ? 0 : (1 - e.slow * (1 - (e.def.slowResist || 0)));
        if (e.def.slowImmune) slowMul = Math.max(slowMul, 0.55);
        const move = e.speed * haste * slowMul * dt;
        if (move > 0) {
          e.d += move;
          if (e.flying) {
            const start = this.map.routes[e.routeIndex] ? pointAt(e.route, 0) : null;
            const t = Math.min(1, e.d / e.len);
            e.x = start.x + (this.map.core.x - start.x) * t;
            e.y = start.y + (this.map.core.y - start.y) * t;
          } else {
            const p = pointAt(e.route, e.d);
            e.x = p.x; e.y = p.y; e.dir = p.dir;
          }
          if (e.d >= e.len) { this._leak(e); continue; }
        }
        (e.pulse += dt);
      }

      /* 炮塔 */
      for (let i = 0; i < this.towers.length; i++) {
        const t = this.towers[i];
        const s = this.towerStats(t, buffs[i]);
        t.flash = Math.max(0, t.flash - dt);
        t.stun = Math.max(0, t.stun - dt);
        t.pulse = Math.max(0, t.pulse - dt * 2);
        if (t.def.id === 'prism' || t.def.id === 'relay') continue;

        if (t.def.id === 'drone') {
          for (const drone of t.drones) {
            drone.a += dt * 1.6;
            drone.cool -= dt;
            if (drone.cool > 0) continue;
            const dx = t.x + Math.cos(drone.a) * 26, dy = t.y + Math.sin(drone.a) * 26;
            const target = this._nearest(dx, dy, s.range, t.def.air);
            if (target) {
              drone.cool = s.rate / 2;
              this._fire(t, target, s, { x: dx, y: dy });
            } else drone.cool = 0.06;
          }
          continue;
        }
        if (s.disabled) { t.cool = 0.1; continue; }

        t.cool -= dt;
        if (t.cool > 0) continue;
        if (t.def.id === 'arc') {
          const at = this.arcTarget(t);
          if (at) { this._fire(t, at.target, s, null, at.route); t.cool = s.rate; } else t.cool = 0.08;
          continue;
        }
        if (t.def.id === 'frost' || t.def.id === 'tesla' || t.def.id === 'gravity') {
          const inRange = this.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - t.x, e.y - t.y) <= s.range);
          if (inRange.length) { this._area(t, inRange, s); t.cool = s.rate; } else t.cool = 0.08;
          continue;
        }
        if (t.def.id === 'flame') {
          const inRange = this.enemies.filter(e => e.hp > 0 && !e.flying && Math.hypot(e.x - t.x, e.y - t.y) <= s.range);
          if (inRange.length) {
            const target = inRange.reduce((a, b) => (a.d > b.d ? a : b));
            this._cone(t, inRange, s, target); t.cool = s.rate;
          } else t.cool = 0.08;
          continue;
        }
        if (t.def.id === 'rail') {
          const target = this._priority(t.x, t.y, s.range, t.def.air, 'line');
          if (target) { this._rail(t, target, s); t.cool = s.rate; } else t.cool = 0.08;
          continue;
        }
        if (t.def.id === 'sniper') {
          const target = this._priority(t.x, t.y, s.range, t.def.air, 'strong');
          if (target) { this._snipe(t, target, s); t.cool = s.rate; } else t.cool = 0.08;
          continue;
        }
        const target = this._priority(t.x, t.y, s.range, t.def.air, 'lead');
        if (target) { this._fire(t, target, s, null); t.cool = s.rate; } else t.cool = 0.08;
      }

      /* 子弹 */
      for (const p of this.projectiles) {
        if (p.done) continue;
        if (p.target && p.target.hp > 0) { p.tx = p.target.x; p.ty = p.target.y; }
        const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy) || 1;
        const step = p.speed * dt;
        if (dist <= step + 4) {
          p.done = true;
          this._impact(p);
        } else {
          p.x += dx / dist * step; p.y += dy / dist * step;
          p.angle = Math.atan2(dy, dx);
          p.trailT = (p.trailT || 0) + dt;
          if (p.trailT > 0.03) { p.trailT = 0; this.effects.push({ kind: 'trail', x: p.x, y: p.y, color: p.color, life: 0.22, max: 0.22, size: p.size * 0.8 }); }
        }
      }
      this.projectiles = this.projectiles.filter(p => !p.done);

      /* 清理与结算 */
      this.enemies = this.enemies.filter(e => e.hp > 0 && !e.dead);
      for (const ef of this.effects) ef.life -= dt;
      this.effects = this.effects.filter(e => e.life > 0);

      if (this.phase === 'combat' && this.spawnQueue.length === 0 && this.enemies.length === 0) this._clearWave();
    }

    _clearWave() {
      const diff = D.DIFFICULTIES[this.difficulty];
      const reward = Math.round((50 + this.wave * 9) * diff.income * (this.map.mod.income || 1));
      this.credits += reward; this.earned += reward;
      this.addEffect({ kind: 'float', x: this.map.core.x, y: this.map.core.y - 30, text: `波次奖励 +${reward}`, color: '#ffe9a8', life: 1.4, max: 1.4 });
      this.stats.bestWave = Math.max(this.stats.bestWave, this.wave);
      this.events.push({ type: 'clear' });
      if (this.wave === MAX_WAVE && !this.endless) { this._end(true); return; }
      this.phase = 'idle';
      if (this.auto) this.nextWaveIn = 5;
    }

    continueEndless() {
      if (!this.won) return false;
      this.endless = true; this.finished = false; this.won = false; this.phase = 'idle';
      if (this.auto) this.nextWaveIn = 5;
      return true;
    }

    _end(won) {
      this.finished = true;
      this.won = won;
      this.phase = won ? 'victory' : 'over';
      this.nextWaveIn = null;
      this.events.push({ type: 'end', won });
    }

    /* —— 开火 —— */
    _nearest(x, y, range, air) {
      let best = null, bd = Infinity;
      for (const e of this.enemies) {
        if (e.hp <= 0 || (e.flying && !air)) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d <= range && d < bd) { bd = d; best = e; }
      }
      return best;
    }

    _priority(x, y, range, air, mode) {
      let best = null, bs = -Infinity;
      for (const e of this.enemies) {
        if (e.hp <= 0 || (e.flying && !air)) continue;
        if (Math.hypot(e.x - x, e.y - y) > range) continue;
        const score = mode === 'strong' ? e.hp : mode === 'line' ? e.d : e.d * 0.9 - Math.hypot(e.x - x, e.y - y) * 0.001;
        if (score > bs) { bs = score; best = e; }
      }
      return best;
    }

    _aim(tower, target) { tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x); }

    _fire(tower, target, s, origin, route) {
      this._aim(tower, target);
      tower.flash = 0.16;
      const ox = origin ? origin.x : tower.x, oy = origin ? origin.y : tower.y;
      const isArc = tower.def.id === 'arc';
      const isBlob = tower.def.id === 'venom';
      const speed = tower.def.id === 'nova' ? 330 : isBlob ? 400 : tower.def.id === 'drone' ? 620 : 700;
      if (isArc) {
        const path = route ? route.path : [tower];
        const retention = Math.pow(0.85, route ? route.hops : 0);
        let current = target; const visited = new Set();
        const chain = path.map(p => ({ x: p.x, y: p.y }));
        for (const p of path) p.flash = 0.25;
        let mult = retention;
        for (let i = 0; current && i < 3 + tower.level; i++) {
          chain.push({ x: current.x, y: current.y });
          visited.add(current);
          this._applyDamage(current, s.damage * mult, tower);
          const prev = current;
          current = this.enemies
            .filter(e => e.hp > 0 && !visited.has(e) && Math.hypot(e.x - prev.x, e.y - prev.y) < 110)
            .sort((a, b) => Math.hypot(a.x - prev.x, a.y - prev.y) - Math.hypot(b.x - prev.x, b.y - prev.y))[0];
          mult *= 0.8;
        }
        this.addEffect({ kind: 'arc', points: chain, color: tower.def.color, life: 0.22, max: 0.22, seed: this.rng() * 100 });
        this.events.push({ type: 'zap' });
        return;
      }
      if (isBlob) {
        this.addEffect({ kind: 'arc', points: [{ x: ox, y: oy }, { x: target.x, y: target.y }], color: tower.def.color, life: 0.12, max: 0.12, seed: this.rng() * 100, thin: true });
        this._applyDamage(target, s.damage, tower);
        this._poison(target, s.damage * 0.35, tower);
        return;
      }
      this.projectiles.push({
        x: ox, y: oy, tx: target.x, ty: target.y, target, speed,
        damage: s.damage, source: tower, color: tower.def.color,
        size: tower.def.id === 'nova' ? 5 : tower.def.id === 'drone' ? 2.2 : 2.6,
        splash: tower.def.id === 'nova' ? 68 + tower.level * 10 : 0,
        kind: tower.def.projectile, angle: tower.angle, done: false
      });
      if (!isBlob && tower.def.id === 'nova') this.events.push({ type: 'boom' });
      else this.events.push({ type: 'shot' });
    }

    _impact(p) {
      // 磁轨 / 狙击不使用子弹，这里只处理飞弹
      if (p.splash) {
        this.addEffect({ kind: 'ring', x: p.tx, y: p.ty, color: p.color, r0: 8, r1: p.splash, life: 0.4, max: 0.4 });
        this.addEffect({ kind: 'burst', x: p.tx, y: p.ty, color: p.color, n: 18, spread: 150 });
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          const d = Math.hypot(e.x - p.tx, e.y - p.ty);
          if (d <= p.splash) this._applyDamage(e, p.damage * (d < p.splash * 0.4 ? 1 : 0.72), p.source);
        }
        this.shake = Math.max(this.shake, 2.2);
      } else if (p.target && p.target.hp > 0) {
        this._applyDamage(p.target, p.damage, p.source);
        this.addEffect({ kind: 'spark', x: p.x, y: p.y, color: p.color, n: 4 });
      }
    }

    _area(tower, targets, s) {
      this._aim(tower, targets.reduce((a, b) => (a.d > b.d ? a : b)));
      tower.flash = 0.18;
      const id = tower.def.id;
      if (id === 'frost') {
        for (const e of targets) {
          this._applyDamage(e, s.damage, tower);
          const res = e.def.slowResist || 0;
          e.slow = Math.max(e.slow, (0.5 + tower.level * 0.06) * (1 - res));
          e.slowT = Math.max(e.slowT, 2.2 + tower.level * 0.25);
        }
        this.addEffect({ kind: 'ring', x: tower.x, y: tower.y, color: tower.def.color, r0: 14, r1: s.range, life: 0.55, max: 0.55 });
        this.events.push({ type: 'frost' });
      } else if (id === 'tesla') {
        for (const e of targets) {
          this._applyDamage(e, s.damage, tower);
          if (e.def.boss) continue;
          e.stunT = Math.max(e.stunT, 0.25 + tower.level * 0.09);
        }
        this.addEffect({ kind: 'ring', x: tower.x, y: tower.y, color: tower.def.color, r0: 10, r1: s.range, life: 0.35, max: 0.35 });
        this.addEffect({ kind: 'spark', x: tower.x, y: tower.y, color: tower.def.color, n: 10 });
        this.events.push({ type: 'tesla' });
      } else if (id === 'gravity') {
        for (const e of targets) {
          this._applyDamage(e, s.damage, tower);
          if (e.def.boss) continue;
          e.d = Math.max(0, e.d - (14 + tower.level * 8));
        }
        this.addEffect({ kind: 'implode', x: tower.x, y: tower.y, color: tower.def.color, r: s.range, life: 0.55, max: 0.55 });
        this.events.push({ type: 'gravity' });
      }
    }

    _cone(tower, targets, s, target) {
      this._aim(tower, target);
      tower.flash = 0.12;
      for (const e of targets) {
        this._applyDamage(e, s.damage, tower);
        e.burn = Math.max(e.burn, (2.5 + tower.level * 1.6));
        e.burnT = Math.max(e.burnT, 2.4);
      }
      this.addEffect({ kind: 'flame', x: tower.x, y: tower.y, angle: tower.angle, range: s.range, color: tower.def.color, life: 0.3, max: 0.3 });
      this.events.push({ type: 'flame' });
    }

    _rail(tower, target, s) {
      this._aim(tower, target);
      tower.flash = 0.22;
      const angle = tower.angle;
      const endX = tower.x + Math.cos(angle) * s.range, endY = tower.y + Math.sin(angle) * s.range;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (distToSegment(e.x, e.y, tower, { x: endX, y: endY }) <= e.size + 7) {
          this._applyDamage(e, s.damage, tower);
        }
      }
      this.addEffect({ kind: 'beam', x1: tower.x, y1: tower.y, x2: endX, y2: endY, color: tower.def.color, life: 0.3, max: 0.3, width: 5 });
      this.addEffect({ kind: 'spark', x: endX, y: endY, color: tower.def.color, n: 8 });
      this.shake = Math.max(this.shake, 1.6);
      this.events.push({ type: 'rail' });
    }

    _snipe(tower, target, s) {
      this._aim(tower, target);
      tower.flash = 0.24;
      const crit = this.rng() < 0.22;
      this._applyDamage(target, s.damage * (crit ? 2.4 : 1), tower);
      this.addEffect({ kind: 'beam', x1: tower.x, y1: tower.y, x2: target.x, y2: target.y, color: crit ? '#ffffff' : tower.def.color, life: 0.22, max: 0.22, width: crit ? 3 : 2 });
      this.addEffect({ kind: 'float', x: target.x, y: target.y, text: crit ? '暴击!' : '', color: '#ffd76a', life: 0.7, max: 0.7 });
      this.events.push({ type: 'snipe' });
      this.shake = Math.max(this.shake, crit ? 3 : 1.2);
    }

    _applyDamage(enemy, amount, tower) {
      return this.damage(enemy, amount, tower);
    }

    _poison(enemy, amount, tower) {
      if (enemy.def.boss) return;
      if (amount > 0) {
        enemy.poisonStacks = Math.min(10, (enemy.poisonStacks || 0) + 1);
        enemy.poison = Math.max(enemy.poison, amount * enemy.poisonStacks * 0.5);
      }
      enemy.poisonT = Math.max(enemy.poisonT, 2.5);
    }
  }
  Game._uid = 0;

  root.ENGINE = { Game, createRng, buildPath, pointAt, distToSegment, roadDistance, prepareMap };
})(typeof globalThis !== 'undefined' ? globalThis : this);
