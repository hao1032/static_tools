'use strict';
/* ═══════════════════════════════════════════════════════════════
   NEON BASTION // OVERDRIVE PROTOCOL
   数据层：地图 · 炮塔 · 敌人 · 难度 · 波次 · 技能
   坐标系为网格坐标（列 x，行 y），格子边长 CELL 像素。
   ═══════════════════════════════════════════════════════════════ */
(function (root) {
  const CELL = 40, COLS = 24, ROWS = 15;
  const W = COLS * CELL, H = ROWS * CELL;

  /* ───────────────────────── 炮塔 ─────────────────────────
     rate    = 两次攻击之间的秒数
     air     = 能否攻击飞行单位
     dmgType = 伤害类型（敌人按类型有抗性）
     等级成长在 engine.stats() 中统一处理：
       伤害 ×(1+0.7L) · 射程 +12L · 间隔 ÷(1+0.2L)
  ────────────────────────────────────────────────────────── */
  const TOWERS = [
    { id: 'pulse', name: '脉冲尖塔', en: 'PULSE', symbol: '△', color: '#7dffc4', sides: 3,
      cost: 85, damage: 15, range: 150, rate: 0.38, dmgType: 'kinetic', air: true,
      tag: '速射', desc: '高速单体 · 精准截击', projectile: 'bolt' },

    { id: 'arc', name: '雷链矩阵', en: 'ARC', symbol: '◇', color: '#b18cff', sides: 4,
      cost: 150, damage: 26, range: 155, rate: 1.05, dmgType: 'energy', air: false,
      tag: '连锁', desc: '连锁闪电 · 铁柱可接力延伸', projectile: 'none' },

    { id: 'frost', name: '霜环发生器', en: 'FROST', symbol: '◎', color: '#6fdcff', sides: 6,
      cost: 120, damage: 8, range: 125, rate: 1.15, dmgType: 'cryo', air: true,
      tag: '控制', desc: '范围冰爆 · 大幅减速', projectile: 'none' },

    { id: 'nova', name: '星陨重炮', en: 'NOVA', symbol: '⬡', color: '#ffc36b', sides: 6,
      cost: 185, damage: 70, range: 190, rate: 1.9, dmgType: 'explosive', air: false,
      tag: '爆破', desc: '曲射炮弹 · 范围破甲', projectile: 'shell' },

    { id: 'rail', name: '磁轨长枪', en: 'RAIL', symbol: '═', color: '#9fe8ff', sides: 4,
      cost: 240, damage: 130, range: 230, rate: 2.6, dmgType: 'energy', air: true,
      tag: '穿透', desc: '穿透光束 · 一线全中', projectile: 'none' },

    { id: 'venom', name: '酸蚀喷枪', en: 'VENOM', symbol: '❋', color: '#b6ff5c', sides: 5,
      cost: 130, damage: 9, range: 135, rate: 0.75, dmgType: 'toxic', air: false,
      tag: '持续', desc: '叠加毒素 · 无视装甲', projectile: 'blob' },

    { id: 'tesla', name: '特斯拉线圈', en: 'TESLA', symbol: '⌾', color: '#ffe66b', sides: 8,
      cost: 165, damage: 22, range: 108, rate: 1.5, dmgType: 'energy', air: true,
      tag: '眩晕', desc: '环形放电 · 短暂麻痹', projectile: 'none' },

    { id: 'gravity', name: '重力坍缩井', en: 'GRAVITY', symbol: '◉', color: '#ff7fb0', sides: 6,
      cost: 200, damage: 18, range: 132, rate: 2.2, dmgType: 'quantum', air: true,
      tag: '拖拽', desc: '引力内爆 · 把敌人拉回起点', projectile: 'none' },

    { id: 'drone', name: '无人机巢', en: 'DRONE', symbol: '✧', color: '#5ea8ff', sides: 4,
      cost: 210, damage: 11, range: 175, rate: 0.5, dmgType: 'kinetic', air: true,
      tag: '环绕', desc: '环绕无人机 · 独立开火', projectile: 'bolt' },

    { id: 'flame', name: '焚化熔炉', en: 'FLAME', symbol: '▲', color: '#ff826f', sides: 3,
      cost: 140, damage: 7, range: 118, rate: 0.16, dmgType: 'thermal', air: false,
      tag: '灼烧', desc: '锥形烈焰 · 点燃敌人', projectile: 'none' },

    { id: 'sniper', name: '量子狙击台', en: 'SNIPER', symbol: '✜', color: '#ffd76a', sides: 4,
      cost: 260, damage: 180, range: 320, rate: 3.2, dmgType: 'quantum', air: true,
      tag: '狙杀', desc: '锁定最强 · 暴击处决', projectile: 'none' },

    { id: 'prism', name: '棱镜增幅器', en: 'PRISM', symbol: '✦', color: '#ff6be0', sides: 6,
      cost: 175, damage: 0, range: 128, rate: 0, dmgType: 'none', air: false,
      tag: '支援', desc: '光环增幅 · 邻近炮塔 +伤害', projectile: 'none' },

    { id: 'relay', name: '铁柱中继', en: 'RELAY', symbol: '⌁', color: '#a4bec9', sides: 4,
      cost: 35, damage: 0, range: 145, rate: 0, dmgType: 'none', air: false,
      tag: '中继', desc: '不通电即无效 · 接力雷链射程', projectile: 'none' }
  ];

  /* ───────────────────────── 敌人 ─────────────────────────
     hp/speed 为 1 波基准值，实际值随波次与难度缩放。
     resist = 各伤害类型承受倍率（缺省 1，越小越抗）。
     shield = 护盾值，脱战 3 秒后回充。
  ────────────────────────────────────────────────────────── */
  const ENEMIES = {
    grunt:       { name: '游荡者', en: 'GRUNT', hp: 70, speed: 50, size: 11, sides: 4, color: '#ff796f', reward: 6 },
    runner:      { name: '疾行者', en: 'RUNNER', hp: 44, speed: 96, size: 9, sides: 3, color: '#ffb291', reward: 5 },
    swarm:       { name: '蜂群', en: 'SWARM', hp: 26, speed: 78, size: 6, sides: 3, color: '#ff9fbe', reward: 3 },
    brute:       { name: '装甲兽', en: 'BRUTE', hp: 240, speed: 34, size: 16, sides: 6, color: '#b18cff', reward: 12,
                   resist: { kinetic: 0.62, explosive: 1.25 } },
    aegis:       { name: '棱盾兵', en: 'AEGIS', hp: 130, speed: 46, size: 13, sides: 4, color: '#6fdcff', reward: 11,
                   shield: 130, resist: { energy: 0.65 } },
    weaver:      { name: '织光者', en: 'WEAVER', hp: 180, speed: 42, size: 14, sides: 5, color: '#7dffc4', reward: 14,
                   aura: { heal: 14, radius: 105 } },
    splitter:    { name: '裂变体', en: 'SPLITTER', hp: 210, speed: 44, size: 15, sides: 6, color: '#ffe66b', reward: 15,
                   split: { kind: 'shard', count: 2 } },
    shard:       { name: '裂片', en: 'SHARD', hp: 55, speed: 66, size: 8, sides: 3, color: '#fff1a8', reward: 2, noWave: true },
    regenerator: { name: '再生体', en: 'REGEN', hp: 240, speed: 40, size: 14, sides: 5, color: '#8cff9e', reward: 14,
                   regen: 0.035 },
    phantom:     { name: '相位体', en: 'PHANTOM', hp: 160, speed: 58, size: 12, sides: 4, color: '#c9a8ff', reward: 15,
                   phase: 3.4 },
    jammer:      { name: '干扰者', en: 'JAMMER', hp: 200, speed: 40, size: 14, sides: 8, color: '#ff6be0', reward: 16,
                   jam: { radius: 120, factor: 0.25 } },
    bomber:      { name: '自爆虫', en: 'BOMBER', hp: 120, speed: 62, size: 11, sides: 3, color: '#ff5c7a', reward: 10,
                   explode: { radius: 105, stun: 2.2 } },
    flyer:       { name: '飞行器', en: 'FLYER', hp: 110, speed: 72, size: 11, sides: 4, color: '#9fe8ff', reward: 12,
                   flying: true },
    wraith:      { name: '幽魂', en: 'WRAITH', hp: 300, speed: 50, size: 15, sides: 5, color: '#b18cff', reward: 18,
                   slowImmune: true },
    juggernaut:  { name: '破城者', en: 'JUGGERNAUT', hp: 620, speed: 26, size: 20, sides: 8, color: '#ff7f5c', reward: 30,
                   resist: { kinetic: 0.5, explosive: 0.75, energy: 0.85 } },
    obelisk:     { name: '方尖碑', en: 'OBELISK', hp: 450, speed: 34, size: 17, sides: 4, color: '#ffd76a', reward: 26,
                   aura: { haste: 0.22, radius: 130 } },
    harbinger:   { name: '先驱者', en: 'HARBINGER', hp: 900, speed: 30, size: 19, sides: 6, color: '#ff6be0', reward: 40,
                   summon: { kind: 'swarm', count: 4, every: 7 } },
    colossus:    { name: '巨像 PRIME', en: 'COLOSSUS', hp: 5200, speed: 26, size: 27, sides: 8, color: '#ffc36b', reward: 120,
                   boss: true, resist: { kinetic: 0.7, energy: 0.8 }, shock: 18 },
    warden:      { name: '守望者 WARDEN', en: 'WARDEN', hp: 15000, speed: 24, size: 30, sides: 8, color: '#6fdcff', reward: 260,
                   boss: true, shield: 4000, slowResist: 0.45, resist: { energy: 0.6 } },
    sovereign:   { name: '终焉之核 SOVEREIGN', en: 'SOVEREIGN', hp: 42000, speed: 22, size: 34, sides: 12, color: '#ff6be0', reward: 600,
                   boss: true, slowResist: 0.6, summon: { kind: 'wraith', count: 2, every: 6 },
                   resist: { kinetic: 0.75, energy: 0.75, thermal: 0.8 } }
  };

  /* ───────────────────────── 地图 ─────────────────────────
     routes 中每条折线均为正交线段，且共用同一个终点 core。
     多入口地图的敌人随机选择一条路线。
  ────────────────────────────────────────────────────────── */
  const MAPS = [
    { id: 'orbit', name: '星环边界', en: 'ORBITAL FRONTIER', color: '#7dffc4',
      tip: '均衡战区 · 折角处交叉覆盖火力', core: [20, 7],
      routes: [[[0, 7], [6, 7], [6, 3], [13, 3], [13, 11], [20, 11], [20, 7]]], mod: {} },

    { id: 'canyon', name: '折跃峡谷', en: 'WARP CANYON', color: '#b18cff',
      tip: '纵深战区 · 长直线适合狙击与磁轨', core: [20, 7],
      routes: [[[0, 2], [8, 2], [8, 12], [16, 12], [16, 5], [20, 5], [20, 7]]],
      mod: { credits: 60 } },

    { id: 'echo', name: '回声回廊', en: 'ECHO CORRIDOR', color: '#6fdcff',
      tip: '超长回廊 · 敌人移速略快', core: [12, 7],
      routes: [[[0, 12], [18, 12], [18, 3], [4, 3], [4, 8], [10, 8], [10, 7], [12, 7]]],
      mod: { speed: 1.04 } },

    { id: 'rift', name: '断层捷径', en: 'RIFT SHORTCUT', color: '#ffc36b',
      tip: '短途战区 · 初始晶体更多，但核心更脆', core: [20, 7],
      routes: [[[0, 7], [6, 7], [6, 4], [13, 4], [13, 10], [18, 10], [18, 7], [20, 7]]],
      mod: { credits: 120, lives: -2 } },

    { id: 'helix', name: '螺旋回廊', en: 'HELIX RUN', color: '#ff7fb0',
      tip: '层层内旋 · 内圈炮塔可覆盖多段路径', core: [18, 7],
      routes: [[[0, 2], [4, 2], [4, 12], [10, 12], [10, 4], [16, 4], [16, 10], [21, 10], [21, 7], [18, 7]]],
      mod: { income: 1.1 } },

    { id: 'prism', name: '棱镜分界', en: 'PRISM DIVIDE', color: '#8fe7ff',
      tip: '纵横交错 · 精英出没概率提升', core: [12, 7],
      routes: [[[0, 10], [3, 10], [3, 4], [8, 4], [8, 9], [14, 9], [14, 3], [21, 3], [21, 7], [12, 7]]],
      mod: { elite: 0.05 } },

    { id: 'gauntlet', name: '熔断回路', en: 'FUSED GAUNTLET', color: '#ffbd7a',
      tip: '连续折返 · 路径极长，敌人生命略低', core: [20, 7],
      routes: [[[0, 5], [6, 5], [6, 12], [12, 12], [12, 3], [18, 3], [18, 8], [22, 8], [22, 7], [20, 7]]],
      mod: { hp: 0.94 } },

    { id: 'zenith', name: '天顶航线', en: 'ZENITH LINE', color: '#c6a6ff',
      tip: '逆向入口 · 核心位于左侧，初始晶体更多', core: [4, 7],
      routes: [[[23, 12], [15, 12], [15, 8], [7, 8], [7, 2], [2, 2], [2, 13], [6, 13], [6, 7], [4, 7]]],
      mod: { credits: 90, lives: -2 } },

    { id: 'twin', name: '双生回廊', en: 'TWIN CONDUIT', color: '#5ea8ff',
      tip: '双入口 · 两条路径同时推进，敌人数量略少', core: [20, 7],
      routes: [
        [[0, 3], [6, 3], [6, 8], [12, 8], [12, 5], [20, 5], [20, 7]],
        [[0, 11], [4, 11], [4, 6], [14, 6], [14, 9], [20, 9], [20, 7]]
      ],
      mod: { count: 0.92 } },

    { id: 'trident', name: '三叉枢纽', en: 'TRIDENT JUNCTION', color: '#ffd76a',
      tip: '三入口 · 压力分散，但敌人数量减少', core: [12, 7],
      routes: [
        [[0, 1], [9, 1], [9, 7], [12, 7]],
        [[0, 13], [9, 13], [9, 9], [12, 9], [12, 7]],
        [[23, 7], [20, 7], [20, 1], [12, 1], [12, 7]]
      ],
      mod: { count: 0.8, income: 1.08 } },

    { id: 'labyrinth', name: '迷宫核心', en: 'LABYRINTH CORE', color: '#7dffc4',
      tip: '迷宫折线 · 移速略快，考验减速链', core: [17, 7],
      routes: [[[0, 7], [3, 7], [3, 2], [8, 2], [8, 5], [13, 5], [13, 10], [18, 10], [18, 7], [17, 7]]],
      mod: { speed: 1.02 } },

    { id: 'horizon', name: '事件视界', en: 'EVENT HORIZON', color: '#ff6be0',
      tip: '环抱核心 · 超长环线，敌人更硬但赏金更高', core: [12, 7],
      routes: [[[0, 7], [2, 7], [2, 2], [9, 2], [9, 12], [15, 12], [15, 2], [21, 2], [21, 11], [18, 11], [18, 7], [12, 7]]],
      mod: { hp: 0.96, income: 1.22, speed: 0.94 } }
  ];

  const DIFFICULTIES = {
    casual:    { name: '休闲', en: 'CASUAL', credits: 520, lives: 26, hp: 0.72, speed: 0.92, income: 1.18, count: 0.88, gap: 1.1,
                 desc: '生命 ×0.74 · 移速 ×0.92 · 收入 ×1.15' },
    standard:  { name: '标准', en: 'STANDARD', credits: 410, lives: 22, hp: 1, speed: 1, income: 1, count: 1, gap: 1,
                 desc: '推荐挑战 · 需要持续建设与升级' },
    hard:      { name: '困难', en: 'HARD', credits: 360, lives: 16, hp: 1.22, speed: 1.06, income: 0.95, count: 1.08, gap: 0.94,
                 desc: '生命 ×1.32 · 移速 ×1.06 · 收入 ×0.93' },
    nightmare: { name: '噩梦', en: 'NIGHTMARE', credits: 330, lives: 12, hp: 1.48, speed: 1.1, income: 0.88, count: 1.15, gap: 0.88,
                 desc: '生命 ×1.72 · 移速 ×1.12 · 收入 ×0.86 · 仅限老手' }
  };

  /* ───────────────────────── 主动技能 ───────────────────────── */
  const ABILITIES = [
    { id: 'overload', name: '核心过载', en: 'OVERLOAD', key: 'Q', icon: '✳', color: '#7dffc4',
      cd: 38, desc: '全屏伤害 + 减速', target: false },
    { id: 'orbital', name: '轨道轰炸', en: 'ORBITAL', key: 'E', icon: '☄', color: '#ffc36b',
      cd: 44, desc: '指定区域毁灭打击', target: true },
    { id: 'stasis', name: '时间凝滞', en: 'STASIS', key: 'R', icon: '◷', color: '#6fdcff',
      cd: 48, desc: '全场减速 4 秒', target: false },
    { id: 'repair', name: '核心修复', en: 'REPAIR', key: 'F', icon: '✚', color: '#ff7fb0',
      cd: 55, desc: '恢复 2 点核心完整度', target: false }
  ];

  /* ───────────────────────── 波次 ─────────────────────────
     squads: [敌人种类, 数量, 出兵间隔(秒)]
     第 10 / 20 / 30 波为 Boss 波。
  ────────────────────────────────────────────────────────── */
  const WAVE_OVERRIDES = {
    3:  { note: '疾行者与蜂群同时压上' },
    5:  { note: '棱盾兵出现 · 能量抗性' },
    8:  { note: '空中单位出现 · 需要防空火力' },
    10: { note: 'BOSS 巨像接近' },
    13: { note: '干扰者会压制炮塔射速' },
    15: { note: '自爆虫会短暂瘫痪炮塔' },
    17: { note: '方尖碑为周围敌人加速' },
    20: { note: 'BOSS 守望者 · 高额护盾' },
    24: { note: '混合突袭' },
    27: { note: '先驱者开始召唤蜂群' },
    30: { note: '终焉之核 · 最终决战' }
  };

  const WAVES = [
    [['grunt', 8, 0.55]],
    [['grunt', 10, 0.5], ['runner', 3, 0.7]],
    [['runner', 10, 0.42], ['swarm', 10, 0.2]],
    [['grunt', 12, 0.45], ['brute', 2, 1.1]],
    [['aegis', 5, 0.8], ['runner', 8, 0.4]],
    [['swarm', 20, 0.16], ['runner', 8, 0.4]],
    [['splitter', 5, 0.9], ['grunt', 10, 0.4]],
    [['brute', 5, 0.9], ['runner', 10, 0.35], ['flyer', 3, 0.9]],
    [['weaver', 2, 1.2], ['aegis', 6, 0.7], ['grunt', 10, 0.4]],
    [['colossus', 1, 1], ['grunt', 10, 0.35]],
    [['phantom', 5, 0.8], ['runner', 10, 0.35]],
    [['flyer', 8, 0.5], ['swarm', 16, 0.16]],
    [['jammer', 2, 1.4], ['brute', 6, 0.8], ['grunt', 10, 0.4]],
    [['regenerator', 5, 0.8], ['flyer', 6, 0.55], ['aegis', 6, 0.6]],
    [['bomber', 6, 0.7], ['splitter', 6, 0.7], ['runner', 10, 0.3]],
    [['wraith', 4, 1], ['brute', 8, 0.7], ['grunt', 12, 0.35]],
    [['obelisk', 3, 1.2], ['flyer', 8, 0.45], ['aegis', 8, 0.55]],
    [['harbinger', 2, 1.5], ['swarm', 24, 0.14], ['runner', 12, 0.3]],
    [['phantom', 6, 0.7], ['jammer', 3, 1.1], ['bomber', 6, 0.6]],
    [['warden', 1, 1], ['aegis', 8, 0.55], ['grunt', 12, 0.3]],
    [['juggernaut', 3, 1.3], ['flyer', 10, 0.4], ['runner', 12, 0.3]],
    [['wraith', 6, 0.8], ['regenerator', 6, 0.7], ['obelisk', 2, 1.4]],
    [['harbinger', 3, 1.2], ['splitter', 8, 0.6], ['swarm', 24, 0.13]],
    [['bomber', 8, 0.45], ['phantom', 5, 0.7], ['jammer', 3, 1]],
    [['juggernaut', 3, 1.1], ['aegis', 7, 0.5], ['flyer', 9, 0.35]],
    [['obelisk', 3, 1], ['wraith', 5, 0.6], ['brute', 7, 0.5]],
    [['harbinger', 3, 1], ['regenerator', 6, 0.6], ['swarm', 24, 0.11]],
    [['juggernaut', 4, 1], ['bomber', 8, 0.45], ['phantom', 6, 0.6]],
    [['harbinger', 3, 1], ['obelisk', 3, 1], ['wraith', 6, 0.55], ['juggernaut', 3, 0.9], ['jammer', 3, 1]],
    [['sovereign', 1, 1], ['harbinger', 2, 1.4], ['wraith', 5, 0.6], ['flyer', 9, 0.35]]
  ].map((squads, i) => ({ squads, ...(WAVE_OVERRIDES[i + 1] || {}) }));

  const TAU = Math.PI * 2;
  const MAX_WAVE = WAVES.length;

  root.DATA = {
    CELL, COLS, ROWS, W, H, TAU, MAX_WAVE,
    TOWERS, ENEMIES, MAPS, DIFFICULTIES, ABILITIES, WAVES,
    UPGRADE_MUL: [0.9, 1.5],          // 1→2 级、2→3 级的费用倍率
    SELL_RATE: 0.7,
    ELITE: { hp: 2.4, reward: 1.8, size: 1.18, speed: 0.94 }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
