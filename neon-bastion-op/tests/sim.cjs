'use strict';
/* 无头验证：地图几何 + 自动玩家平衡模拟。运行：node tests/sim.cjs [--maps] [--rounds 3] */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const sandbox = { console, Math };
vm.createContext(sandbox);
for (const f of ['data.js', 'engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
}
const { DATA, ENGINE } = sandbox;
const { Game } = ENGINE;

/* ───────── 地图几何校验 ───────── */
function validateMaps() {
  const problems = [];
  const rows = [];
  DATA.MAPS.forEach((map, mi) => {
    for (const route of map.routes) {
      for (let i = 1; i < route.length; i++) {
        const [ax, ay] = route[i - 1], [bx, by] = route[i];
        if (ax !== bx && ay !== by) problems.push(`${map.id}: 斜线段 ${ax},${ay}->${bx},${by}`);
        if (ax < 0 || bx < 0 || ay < 0 || by < 0 || ax >= DATA.COLS || bx >= DATA.COLS || ay >= DATA.ROWS || by >= DATA.ROWS)
          problems.push(`${map.id}: 越界 ${ax},${ay}->${bx},${by}`);
      }
      // 自身不应折返重叠
      for (let i = 1; i < route.length; i++)
        for (let j = i + 1; j < route.length - 1; j++)
          if (route[i][0] === route[j][0] && route[i][1] === route[j][1]) problems.push(`${map.id}: 重复锚点 ${route[i]}`);
    }
    const game = new Game({ map: mi, difficulty: 'standard', seed: 7 });
    let buildable = 0;
    for (let gy = 0; gy < DATA.ROWS; gy++) for (let gx = 0; gx < DATA.COLS; gx++) if (game.canBuild(gx, gy)) buildable++;
    const lens = game.map.routes.map(r => Math.round(r.length));
    const longest = Math.max(...lens);
    if (longest < 900) problems.push(`${map.id}: 路径过短 ${lens}`);
    if (map.routes.length * Math.min(...lens) < 1400 && longest < 1400) problems.push(`${map.id}: 严重短途 ${lens}`);
    if (buildable < 60) problems.push(`${map.id}: 可建造格过少 ${buildable}`);
    const core = game.map.core;
    if (Math.hypot(core.x - DATA.W / 2, core.y - DATA.H / 2) > 520) problems.push(`${map.id}: 核心位置异常`);
    rows.push({ map: map.id, routes: map.routes.length, lens, buildable });
  });
  return { problems, rows };
}

/* ───────── 自动玩家 ───────── */
const PRIORITY = ['pulse', 'frost', 'nova', 'arc', 'tesla', 'venom', 'rail', 'prism', 'sniper', 'flame', 'gravity', 'drone', 'relay'];

function autoPlay(game, { waves = DATA.MAX_WAVE, verbose = false } = {}) {
  const log = [];
  let guard = 0;
  let time = 0;
  game.auto = false;

  // 每种塔先来一座（按收益排序），铺满 9 座后转入升级
  const order = ['pulse', 'frost', 'nova', 'arc', 'tesla', 'rail', 'venom', 'sniper', 'flame'];
  const extras = ['gravity', 'drone', 'prism'];
  const typeCount = id => game.towers.filter(t => t.def.id === id).length;

  const place = def => {
    const idx = DATA.TOWERS.indexOf(def);
    let best = null, bestScore = -Infinity;
    for (let gy = 0; gy < DATA.ROWS; gy++) for (let gx = 0; gx < DATA.COLS; gx++) {
      if (!game.canBuild(gx, gy)) continue;
      const p = game.cellCenter(gx, gy);
      let cover = 0;
      for (const route of game.map.routes)
        for (const seg of route.segments)
          for (let d = 0; d <= seg.len; d += 24) {
            const qx = seg.a.x + seg.dir.x * d, qy = seg.a.y + seg.dir.y * d;
            const dd = Math.hypot(qx - p.x, qy - p.y);
            if (dd < def.range) cover += 1 - dd / def.range;
          }
      // 避免塔挤在一起，鼓励覆盖不同路段
      for (const other of game.towers) cover -= Math.max(0, 1 - Math.hypot(other.x - p.x, other.y - p.y) / 90) * 0.6;
      const score = cover + game.rng() * 1.5;
      if (score > bestScore) { bestScore = score; best = [gx, gy]; }
    }
    return best && game.build(idx, best[0], best[1]).ok;
  };

  const buy = () => {
    // 1. 功能塔补齐
    for (const id of order) if (typeCount(id) === 0) {
      const def = DATA.TOWERS.find(t => t.id === id);
      if (game.credits >= def.cost) return place(def);
    }
    // 2. 中后期追加输出塔 / 支援塔
    if (game.towers.length >= 7) {
      const def = DATA.TOWERS.find(t => t.id === extras[game.towers.length % extras.length]);
      if (def && game.credits >= def.cost + 100) return place(def);
    }
    // 3. 有钱先升级
    let did = false;
    const sorted = [...game.towers].sort((a, b) => b.def.cost - a.def.cost);
    for (const t of sorted) {
      if (t.level >= 3) continue;
      const cost = game.upgradeCost(t);
      if (game.credits >= cost) { game.upgrade(t); did = true; }
    }
    if (did) return true;
    // 4. 还有余钱就多铺一座便宜塔
    const cheap = DATA.TOWERS.filter(t => t.cost <= game.credits && t.id !== 'relay')
      .sort((a, b) => b.damage / b.rate - a.damage / a.rate)[0];
    return cheap ? place(cheap) : false;
  };

  while (guard++ < 600000) {
    if (game.finished) break;
    if (game.phase === 'idle') {
      let actions = 0;
      while (actions++ < 20 && buy()) { }
      game.startWave();
      continue;
    }
    game.update(1 / 40);
    time += 1 / 40;
    if (verbose && game.phase === 'idle') log.push({ wave: game.wave, lives: game.lives, credits: Math.round(game.credits), towers: game.towers.length, levels: game.towers.reduce((a, t) => a + t.level, 0) });
  }
  return {
    ok: game.won, wave: game.stats.bestWave, lives: game.lives, leaked: game.leaked,
    towers: game.towers.length, levels: game.towers.reduce((a, t) => a + t.level, 0),
    credits: Math.round(game.credits), kills: game.kills,
    earned: game.earned, dps: Math.round(game.stats.damage / Math.max(time, 1)), time: Math.round(time), log
  };
}

/* ───────── 入口 ───────── */
if (require.main === module) {
  const args = process.argv.slice(2);
  const { problems, rows } = validateMaps();
  console.log('── 地图校验 ──');
  for (const r of rows) console.log(`${r.map.padEnd(11)} 路线 ${r.routes} · 长度 ${r.lens.join('/')} · 空位 ${r.buildable}`);
  console.log(problems.length ? `✗ ${problems.length} 个问题\n` + problems.join('\n') : '✓ 全部地图通过');

  const rounds = Number(args[args.indexOf('--rounds') + 1]) || 2;
  console.log('\n── 自动玩家（标准难度，逐图）──');
  for (const diff of ['casual', 'standard', 'hard', 'nightmare']) {
    let wins = 0, best = 0;
    const detail = [];
    for (let m = 0; m < DATA.MAPS.length; m++) {
      for (let r = 0; r < rounds; r++) {
        const g = new Game({ map: m, difficulty: diff, seed: 1000 + m * 13 + r });
        const res = autoPlay(g);
        if (res.ok) wins++; else detail.push(`${DATA.MAPS[m].id}#${r}=${res.wave}波(${res.lives}命)`);
        best = Math.max(best, res.wave);
      }
    }
    const total = DATA.MAPS.length * rounds;
    console.log(`${diff.padEnd(10)} 通关 ${String(wins).padStart(2)}/${total} · 最高 ${best} 波${detail.length ? ' · 失败：' + detail.join(' ') : ''}`);
  }
}
module.exports = { Game, autoPlay, validateMaps };
