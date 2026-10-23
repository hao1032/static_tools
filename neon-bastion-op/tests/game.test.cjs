'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

/* 只加载数据层与引擎（纯逻辑，无 DOM 依赖） */
function loadEngine() {
  const sandbox = { console, Math };
  vm.createContext(sandbox);
  for (const f of ['data.js', 'engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}
const S = loadEngine();
const { DATA, ENGINE } = S;
const newGame = (opts = {}) => new ENGINE.Game({ map: 0, difficulty: 'standard', seed: 1, ...opts });

/* ───────── 地图 ───────── */
test('每张地图的路线都是正交折线且落在网格内', () => {
  for (const map of DATA.MAPS) {
    for (const route of map.routes) {
      for (let i = 1; i < route.length; i++) {
        const [ax, ay] = route[i - 1], [bx, by] = route[i];
        assert.ok(ax === bx || ay === by, `${map.id} 存在斜线段`);
        for (const [x, y] of [[ax, ay], [bx, by]]) {
          assert.ok(x >= 0 && x < DATA.COLS && y >= 0 && y < DATA.ROWS, `${map.id} 越界`);
        }
      }
    }
  }
});

test('路面格子不可建造，且每张图都有足够的建造空间', () => {
  for (let m = 0; m < DATA.MAPS.length; m++) {
    const g = newGame({ map: m });
    let buildable = 0;
    for (let gy = 0; gy < DATA.ROWS; gy++) for (let gx = 0; gx < DATA.COLS; gx++) {
      if (g.canBuild(gx, gy)) buildable++;
    }
    assert.ok(buildable > 150, `${DATA.MAPS[m].id} 可建造格子太少：${buildable}`);
    for (const route of g.map.routes) {
      for (const seg of route.segments) {
        for (let d = 0; d <= seg.len; d += 40) {
          const p = X({ x: seg.a.x + seg.dir.x * d, y: seg.a.y + seg.dir.y * d });
          assert.equal(g.canBuild(p.gx, p.gy), false, `${DATA.MAPS[m].id} 路面可建造`);
        }
      }
    }
  }
  function X(p) { return { gx: Math.floor(p.x / DATA.CELL), gy: Math.floor(p.y / DATA.CELL) }; }
});

test('多入口地图会选择不同路线，飞行单位直线抵达核心', () => {
  const g = newGame({ map: DATA.MAPS.findIndex(m => m.id === 'trident') });
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(g._spawnUnit('grunt', false).routeIndex);
  assert.equal(seen.size, 3);

  const core = g.map.core;
  const flyer = g._spawnUnit('flyer', false);
  flyer.d = flyer.len / 2;
  g.update(1 / 60);
  const t = flyer.d / flyer.len;
  const start = ENGINE.pointAt(flyer.route, 0);
  assert.ok(Math.abs(flyer.x - (start.x + (core.x - start.x) * t)) < 2);
});

/* ───────── 经济 ───────── */
test('建造、升级、回收按真实费用结算', () => {
  const g = newGame();
  const start = g.credits;
  const pulse = DATA.TOWERS.findIndex(t => t.id === 'pulse');
  assert.ok(g.build(pulse, 5, 5).ok);
  assert.equal(g.credits, start - DATA.TOWERS[pulse].cost);

  const t = g.towers[0];
  const cost2 = g.upgradeCost(t);
  assert.ok(cost2 > 0, '2 级升级不能免费');
  assert.ok(g.upgrade(t));
  assert.equal(t.level, 2);
  const cost3 = g.upgradeCost(t);
  assert.ok(cost3 > cost2, '3 级应更贵');
  assert.ok(g.upgrade(t));
  assert.equal(g.upgrade(t), false, '不能超过 3 级');

  const spent = t.spent;
  const before = g.credits;
  const refund = g.sell(t);
  assert.equal(refund, Math.floor(spent * DATA.SELL_RATE));
  assert.equal(g.credits, before + refund);
  assert.equal(g.towers.length, 0);
});

test('晶体不足或位置非法时拒绝建造', () => {
  const g = newGame();
  g.credits = 10;
  assert.equal(g.build(0, 5, 5).ok, false);
  assert.equal(g.build(0, 5, 5).reason, '晶体不足');
  g.credits = 9999;
  const gx = g.map.routes[0].points[1].x !== undefined ? 6 : 6;
  assert.equal(g.build(0, 6, 7).ok, false, '路面���能���造');
});

/* ───────── 伤害模型 ───────── */
test('护盾吸收常规伤害，量子与毒素穿透', () => {
  const g = newGame();
  const aegis = g._spawnUnit('aegis', false);
  aegis.maxShield = aegis.shield = 500;
  const kinetic = { def: { dmgType: 'kinetic' }, kills: 0, damage: 0 };
  g.damage(aegis, 100, kinetic);
  assert.equal(aegis.shield, 400);
  assert.equal(aegis.hp, aegis.maxHp);

  const quantum = { def: { dmgType: 'quantum' }, kills: 0, damage: 0 };
  const hpBefore = aegis.hp;
  g.damage(aegis, 100, quantum);
  assert.equal(aegis.shield, 400, '量子不消耗护盾');
  assert.ok(aegis.hp < hpBefore, '量子直接伤血');
});

test('抗性按类型生效，Boss 缩放比普通敌人平缓', () => {
  const g = newGame();
  const brute = g._spawnUnit('brute', false);
  const hp = brute.hp;
  g.damage(brute, 100, { def: { dmgType: 'kinetic' }, kills: 0, damage: 0 });
  assert.ok(Math.abs(hp - brute.hp - 100 * brute.def.resist.kinetic) < 1e-6);

  const late = newGame({ difficulty: 'nightmare' });
  late.wave = 30;
  const grunt = late._spawnUnit('grunt', false);
  const boss = late._spawnUnit('colossus', false);
  const gruntRatio = grunt.hp / late._spawnUnit('grunt', false).def.hp;
  const bossRatio = boss.hp / boss.def.hp;
  assert.ok(bossRatio < gruntRatio, 'Boss 血量缩放不应高于普通单位');
});

/* ───────── 中继 ───────── */
test('铁柱中继需要逐跳连接，断链后失效', () => {
  const g = newGame();
  g.credits = 9999;
  const arc = DATA.TOWERS.findIndex(t => t.id === 'arc');
  const relay = DATA.TOWERS.findIndex(t => t.id === 'relay');
  const place = (type, gx, gy) => { const r = g.build(type, gx, gy); assert.ok(r.ok, `无法在 ${gx},${gy} 建造`); return g.towers[g.towers.length - 1]; };

  const source = place(arc, 4, 2);
  const poles = [place(relay, 7, 2), place(relay, 10, 2), place(relay, 13, 2)];
  const routes = g.arcRoutes(source);
  assert.ok(routes.some(r => r.hops === 3), '应能接力到第 3 根铁柱');
  assert.ok(routes.every(r => r.hops <= 3), '1 级最多 3 跳');

  g.sell(poles[1]);
  const after = g.arcRoutes(source);
  assert.ok(after.every(r => r.hops <= 1), '移除中间铁柱后断链');
});

/* ───────── 技能与状态 ───────── */
test('技能冷却生效，时间不因暂停推进', () => {
  const g = newGame();
  g.startWave();
  assert.ok(g.useAbility('overload'));
  assert.equal(g.abilityCd.overload, DATA.ABILITIES.find(a => a.id === 'overload').cd);
  assert.equal(g.useAbility('overload'), false, '冷却中不可重复释放');
  g.paused = true;
  g.update(5);
  assert.equal(g.abilityCd.overload, DATA.ABILITIES.find(a => a.id === 'overload').cd);
});

test('轨道轰炸只伤害落点范围内的敌人', () => {
  const g = newGame();
  g.startWave();
  const near = g._spawnUnit('brute', false), far = g._spawnUnit('brute', false);
  near.x = 300; near.y = 300; far.x = 800; far.y = 500;
  near.hp = far.hp = near.maxHp = far.maxHp = 100000;
  g.useAbility('orbital', 300, 300);
  assert.ok(near.hp < 100000);
  assert.equal(far.hp, 100000);
});

/* ───────── 进程 ───────── */
test('漏怪扣血、生命归零判负、通关后进入结算', () => {
  const g = newGame();
  g.startWave();
  const e = g._spawnUnit('grunt', false);
  e.d = e.len;
  g.update(1 / 60);
  assert.equal(g.lives, g.livesMax - 1);

  g.lives = 1;
  const e2 = g._spawnUnit('grunt', false);
  e2.d = e2.len;
  g.update(1 / 60);
  assert.equal(g.lives, 0);
  assert.equal(g.finished, true);
  assert.equal(g.won, false);
});

test('第 30 波清场即通关，且可继续无尽模式', () => {
  const g = newGame();
  g.wave = DATA.MAX_WAVE - 1;
  g.startWave();
  assert.equal(g.wave, DATA.MAX_WAVE);
  g.spawnQueue = [];
  g.enemies = [];
  g.update(1 / 60);
  assert.equal(g.finished, true);
  assert.equal(g.won, true);

  g.continueEndless();
  assert.equal(g.finished, false);
  assert.equal(g.endless, true);
  g.startWave();
  assert.ok(g.wave > DATA.MAX_WAVE);
  assert.ok(g.spawnQueue.length > 0);
});

test('无尽模式下敌人会持续变强', () => {
  const g = newGame();
  g.endless = true;
  g.wave = 40;
  const a = g._spawnUnit('grunt', false);
  g.wave = 60;
  const b = g._spawnUnit('grunt', false);
  assert.ok(b.hp > a.hp);
});
