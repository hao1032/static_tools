import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";

"use strict";

// ================================================================
//  向量工具函数
// ================================================================
function add(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function scale(v, s) { return [v[0]*s, v[1]*s, v[2]*s]; }
function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ];
}
function norm(v) { return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]); }
function normalize(v) {
  var l = norm(v);
  if (l < 1e-12) return [0, 0, 1];
  return [v[0]/l, v[1]/l, v[2]/l];
}

// ================================================================
//  CLSF 解析器 — 移植自 htcamtest/libs/clsf.py
// ================================================================

// CLSF PAINT/COLOR 颜色 → 运动类型（与 NX 刀轨显示颜色对齐）
// 186/211 均为 RAPID 移刀：186=逼近、211=移刀/逼近，按用户习惯统一为「逼近移刀」(蓝、虚线)
var COLOR_TO_MOVE_TYPE = {
  186: "approach",  // 逼近 — 蓝（虚线）
  211: "approach",  // 移刀 / 逼近 — 蓝（虚线）
  42:  "engage",    // 进刀 — 橙（虚线，非切削）
  33:  "firstcut",  // 第一刀切削 — 黄（实线，切削）
  36:  "stepover",  // 步进 — 绿（实线，切削）
  31:  "cut",       // 切削 — 青（实线，切削）
  37:  "retract",   // 退刀 — 粉红（虚线，非切削）
};

function classify(geom) {
  // NX 语义：PAINT/COLOR 决定显示类型（颜色优先），RAPID 仅是运动指令。
  // 退刀(37)/进刀(42)/切削(31) 等即使带 RAPID 标志，仍按各自颜色归类；
  // 只有无颜色时才以 RAPID 兜底为快进。
  if (geom.color != null) {
    return COLOR_TO_MOVE_TYPE[geom.color] || (geom.rapid ? "rapid" : "cut");
  }
  if (geom.rapid) return "rapid";
  return "cut";
}

function CLSFParser() {
  this.lastPos = null;
  this.rapidNext = false;
  this.feed = null;
  this.color = null;
  this.currentTool = null;
  this.currentMcs = null;
  this.currentPath = null;
  this.pendingCircle = null;
  this.paths = [];
  this.activeCycle = null;
  this.currentAxis = [0, 0, 1];
}

CLSFParser.prototype.parseContent = function (content) {
  var lines = content.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    this._parseLine(lines[i].trim());
  }
  return this.paths;
};

CLSFParser.prototype._parseLine = function (line) {
  if (!line || line.indexOf("$$") === 0) return;

  // TOOL PATH
  if (line.indexOf("TOOL PATH/") === 0) {
    this.currentPath = { name: line, tool: null, mcs: null, moves: [] };
    this.lastPos = null;
    return;
  }

  // END-OF-PATH
  if (line === "END-OF-PATH") {
    if (this.currentPath) this.paths.push(this.currentPath);
    this.currentPath = null;
    return;
  }

  // TLDATA
  if (line.indexOf("TLDATA/") === 0) {
    var parts = line.substring(7).split(",");
    var numericIdx = -1;
    for (var i = 1; i < parts.length; i++) {
      if (!isNaN(parseFloat(parts[i]))) { numericIdx = i; break; }
    }
    if (numericIdx !== -1 && parts.length >= numericIdx + 3) {
      this.currentTool = {
        name: parts[0].trim(),
        diameter: parseFloat(parts[numericIdx]),
        cornerRadius: parseFloat(parts[numericIdx + 1]),
        length: parseFloat(parts[numericIdx + 2]),
      };
    }
    return;
  }

  // MSYS
  if (line.indexOf("MSYS/") === 0) {
    var nums = line.substring(5).split(",").map(function (x) { return parseFloat(x); });
    if (nums.length >= 9) {
      var origin = nums.slice(0, 3);
      var xAxis = nums.slice(3, 6);
      var yAxis = nums.slice(6, 9);
      var zAxis = cross(xAxis, yAxis);
      this.currentMcs = { origin: origin, xAxis: xAxis, yAxis: yAxis, zAxis: zAxis };
    }
    return;
  }

  // RAPID
  if (line === "RAPID") {
    this.rapidNext = true;
    return;
  }

  // FEDRAT
  if (line.indexOf("FEDRAT") === 0) {
    var commaIdx = line.lastIndexOf(",");
    if (commaIdx !== -1) this.feed = parseFloat(line.substring(commaIdx + 1));
    this.rapidNext = false;
    return;
  }

  // PAINT/COLOR
  if (line.indexOf("PAINT/COLOR") === 0) {
    this.color = parseInt(line.split(",")[1], 10);
    return;
  }

  // CYCLE
  if (line.indexOf("CYCLE/") === 0) {
    this._parseCycle(line);
    return;
  }

  // GOTO
  if (line.indexOf("GOTO/") === 0) {
    var gotoNums = line.substring(5).split(",").map(function (x) { return parseFloat(x); });
    var pos = gotoNums.slice(0, 3);
    if (gotoNums.length >= 6) {
      this.currentAxis = gotoNums.slice(3, 6);
    }

    var geom = null;
    if (this.activeCycle) {
      geom = this._emitCycle(pos);
    } else if (this.pendingCircle) {
      geom = this._emitArcOrHelix(pos);
    } else {
      geom = this._emitLine(pos);
    }

    if (geom) this._pushMove(geom);
    this.lastPos = pos;
    return;
  }

  // CIRCLE
  if (line.indexOf("CIRCLE/") === 0) {
    this._parseCircle(line);
    return;
  }
};

CLSFParser.prototype._parseCircle = function (line) {
  var tokens = line.substring(7).split(",");
  var values = [];
  var i = 0;
  while (i < tokens.length && tokens[i].trim() !== "TIMES") {
    values.push(parseFloat(tokens[i]));
    i++;
  }
  var turns = 1;
  if (i < tokens.length && tokens[i].trim() === "TIMES") {
    turns = parseInt(tokens[i + 1], 10);
  }
  if (values.length >= 7) {
    this.pendingCircle = {
      center: values.slice(0, 3),
      normal: values.slice(3, 6),
      radius: values[6],
      turns: turns,
      color: this.color,
    };
  }
};

CLSFParser.prototype._parseCycle = function (line) {
  var tokens = line.substring(6).split(",").map(function (t) { return t.trim(); });
  var command = tokens[0];

  if (command === "OFF") {
    this.activeCycle = null;
    return;
  }

  var knownKeys = ["STEP", "DWELL", "CLEAR", "FEDTO", "RTRCTO", "MMPM", "MMPR", "RAPTO"];
  var subType = "";
  var startIdx = 1;
  if (tokens.length > 1 && knownKeys.indexOf(tokens[1]) === -1) {
    subType = tokens[1];
    startIdx = 2;
  }

  if (!this.activeCycle) {
    this.activeCycle = { cycleType: command + "/" + subType };
  } else {
    this.activeCycle.cycleType = command + "/" + subType;
    this.activeCycle.feedTo = null;
    this.activeCycle.dwell = null;
  }

  var i = startIdx;
  while (i < tokens.length) {
    var key = tokens[i];
    if (key === "STEP") { this.activeCycle.step = parseFloat(tokens[i+1]); i += 2; }
    else if (key === "CLEAR") { this.activeCycle.clearance = parseFloat(tokens[i+1]); i += 2; }
    else if (key === "FEDTO") { this.activeCycle.feedTo = parseFloat(tokens[i+1]); i += 2; }
    else if (key === "RTRCTO") { this.activeCycle.retractTo = tokens[i+1]; i += 2; }
    else if (key === "MMPM") { this.activeCycle.feedUnit = "MMPM"; this.activeCycle.feedRate = parseFloat(tokens[i+1]); i += 2; }
    else if (key === "MMPR") { this.activeCycle.feedUnit = "MMPR"; this.activeCycle.feedRate = parseFloat(tokens[i+1]); i += 2; }
    else if (key === "RAPTO") { this.activeCycle.rapto = parseFloat(tokens[i+1]); i += 2; }
    else if (key === "DWELL") {
      if (i+1 < tokens.length && tokens[i+1].toUpperCase() === "REV") {
        this.activeCycle.dwellRev = true;
        if (i+2 < tokens.length && !isNaN(parseFloat(tokens[i+2]))) { this.activeCycle.dwell = parseFloat(tokens[i+2]); i += 3; }
        else { this.activeCycle.dwell = 0; i += 2; }
      } else if (i+1 < tokens.length && !isNaN(parseFloat(tokens[i+1]))) {
        this.activeCycle.dwellRev = false;
        this.activeCycle.dwell = parseFloat(tokens[i+1]); i += 2;
      } else {
        this.activeCycle.dwellRev = false;
        this.activeCycle.dwell = 0; i += 1;
      }
    } else {
      i += 1;
    }
  }
};

CLSFParser.prototype._emitCycle = function (pos) {
  var axis = normalize(this.currentAxis);
  var effDepth = -10;
  if (this.activeCycle.feedTo != null) {
    effDepth = this.activeCycle.feedTo - pos[2];
  }
  return {
    type: "cycle",
    start: pos.slice(),
    axis: axis,
    depthZ: this.activeCycle.feedTo,
    effectiveDepth: effDepth,
    params: Object.assign({}, this.activeCycle),
    color: this.color,
  };
};

CLSFParser.prototype._emitLine = function (end) {
  if (!this.lastPos) return null;
  var move = {
    type: "line",
    start: this.lastPos.slice(),
    end: end.slice(),
    rapid: this.rapidNext,
    feed: this.rapidNext ? null : this.feed,
    color: this.color,
    axis: normalize(this.currentAxis),   // 刀轴矢量 (i,j,k)
  };
  this.rapidNext = false;
  return move;
};

CLSFParser.prototype._emitArcOrHelix = function (end) {
  var c = this.pendingCircle;
  this.pendingCircle = null;
  // 刀轴：优先取 GOTO 给出的 (i,j,k)；无效时退回圆弧法线
  var ax = normalize(this.currentAxis);
  if (norm(ax) < 0.5) ax = normalize(c.normal);
  if (c.turns > 1) {
    return {
      type: "helix",
      start: this.lastPos.slice(),
      end: end.slice(),
      center: c.center,
      normal: c.normal,
      radius: c.radius,
      turns: c.turns,
      color: c.color,
      axis: ax,
    };
  }
  return {
    type: "arc",
    start: this.lastPos.slice(),
    end: end.slice(),
    center: c.center,
    normal: c.normal,
    radius: c.radius,
    color: c.color,
    axis: ax,
  };
};

CLSFParser.prototype._pushMove = function (geom) {
  if (!this.currentPath) return;
  this.currentPath.tool = this.currentTool;
  this.currentPath.mcs = this.currentMcs;
  var mt = classify(geom);
  this.currentPath.moves.push({
    geometry: geom,
    moveType: mt,
    tool: this.currentTool,
    mcs: this.currentMcs,
    pathName: this.currentPath.name,
    isCut: mt === "cut",
  });
};

// ================================================================
//  运动采样器 — 移植自 htcamtest/libs/clsf.py MoveSampler
// ================================================================
function MoveSampler(opts) {
  opts = opts || {};
  this.lineSteps = opts.lineSteps || 2;
  this.arcSteps = opts.arcSteps || 48;
  this.helixStepsPerTurn = opts.helixStepsPerTurn || 60;
}

MoveSampler.prototype.sample = function (geom) {
  if (geom.type === "line") return this._sampleLine(geom);
  if (geom.type === "arc") return this._sampleArc(geom);
  if (geom.type === "helix") return this._sampleHelix(geom);
  if (geom.type === "cycle") return this._sampleCycle(geom);
  return [];
};

MoveSampler.prototype._sampleLine = function (line) {
  var s = line.start, e = line.end;
  var pts = [];
  for (var i = 0; i < this.lineSteps; i++) {
    var t = i / (this.lineSteps - 1);
    pts.push([
      s[0] + (e[0]-s[0])*t,
      s[1] + (e[1]-s[1])*t,
      s[2] + (e[2]-s[2])*t,
    ]);
  }
  return pts;
};

MoveSampler.prototype._sampleArc = function (arc) {
  var c = arc.center;
  var n = normalize(arc.normal);

  // 起点向量（投影到垂直于法线的平面）
  var startVec = sub(arc.start, c);
  var radial = sub(startVec, scale(n, dot(startVec, n)));
  var r = arc.radius;
  var u = normalize(radial);
  var w = normalize(cross(n, u));

  // 终点向量投影
  var endVec = sub(arc.end, c);
  var endRadial = sub(endVec, scale(n, dot(endVec, n)));
  var v1 = normalize(endRadial);

  // 有符号角度
  var sinT = dot(cross(u, v1), n);
  var cosT = dot(u, v1);
  var theta = Math.atan2(sinT, cosT);

  // 强制顺时针
  if (theta > 0) theta -= 2 * Math.PI;

  // 全圆情况
  if (Math.abs(theta) < 1e-6 && norm(sub(arc.start, arc.end)) < 0.01) {
    theta = -2 * Math.PI;
  }

  var height = dot(startVec, n);
  var pts = [];
  for (var i = 0; i <= this.arcSteps; i++) {
    var t = theta * i / this.arcSteps;
    pts.push(add(c, add(
      add(scale(u, r * Math.cos(t)), scale(w, r * Math.sin(t))),
      scale(n, height)
    )));
  }
  return pts;
};

MoveSampler.prototype._sampleHelix = function (h) {
  var steps = this.helixStepsPerTurn * h.turns;
  var c = h.center;
  var n = normalize(h.normal);

  var startVec = sub(h.start, c);
  var radial = sub(startVec, scale(n, dot(startVec, n)));
  var r = h.radius;
  var u = normalize(radial);
  var w = normalize(cross(n, u));

  var hStart = dot(startVec, n);
  var hEnd = dot(sub(h.end, c), n);

  var pts = [];
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    var angle = 2 * Math.PI * h.turns * t;
    var height = hStart + (hEnd - hStart) * t;
    pts.push(add(c, add(
      add(scale(u, r * Math.cos(angle)), scale(w, r * Math.sin(angle))),
      scale(n, height)
    )));
  }
  return pts;
};

MoveSampler.prototype._sampleCycle = function (cyc) {
  var start = cyc.start;
  var axis = cyc.axis;
  var bottom = add(start, scale(axis, cyc.effectiveDepth));
  var pts = [];

  if (cyc.params.step && Math.abs(cyc.params.step) > 0.1) {
    pts.push(start.slice());
    var totalLen = Math.abs(cyc.effectiveDepth);
    var stepLen = Math.abs(cyc.params.step);
    var curLen = stepLen;
    while (curLen < totalLen) {
      var sign = cyc.effectiveDepth < 0 ? -1 : 1;
      pts.push(add(start, scale(axis, sign * curLen)));
      curLen += stepLen;
    }
    pts.push(bottom.slice());
    pts.push(start.slice()); // 退刀
  } else {
    pts.push(start.slice(), bottom.slice(), start.slice());
  }
  return pts;
};

// ================================================================
//  Three.js 场景
// ================================================================
var MOVE_TYPES = ["rapid", "approach", "engage", "firstcut", "stepover", "cut", "retract"];
// 简短标签（颜色选择器内使用），完整说明见 title 提示
var MOVE_TYPE_LABELS = {
  rapid: "快进", approach: "逼近", engage: "进刀",
  firstcut: "第一刀", stepover: "步进", cut: "切削", retract: "退刀",
};
var MOVE_TYPE_TIPS = {
  rapid: "快进（红，虚线）", approach: "逼近/移刀/离开（蓝，虚线）", engage: "进刀（橙，虚线）",
  firstcut: "第一刀切削（黄，实线）", stepover: "步进（绿，实线）", cut: "切削（青，实线）", retract: "退刀（粉红，虚线）",
};
// 非切削（虚线）类型
var DASHED_TYPES = { rapid: true, approach: true, engage: true, retract: true };
// 默认配色（与 NX 刀轨显示颜色对齐），每个 CLSF 可独立覆盖
var DEFAULT_COLORS = {
  rapid: "#ff0000",
  approach: "#0000ff",
  engage: "#ff8000",
  firstcut: "#ffff00",
  stepover: "#00ff00",
  cut: "#00ffff",
  retract: "#ff80c0",
};
function zeroMoveCounts() {
  return { rapid: 0, approach: 0, engage: 0, firstcut: 0, stepover: 0, cut: 0, retract: 0 };
}

var scene, camera, renderer, controls;
var autoRotateEnabled = false;   // 自动旋转（手动实现，TrackballControls 无该属性）
var userInteracting = false;     // 用户正在拖动/缩放/平移
var gridHelper, axesHelper;
var axisLabels = [];             // 坐标轴文字标签 [X, Y, Z]
var clsfEntries = [];            // 多刀轨条目 [{ id, name, text, visible, colors, paths, rootGroup, pathGroups, moveCounts, sampled, el }]
var entrySeq = 0;                // 条目自增 id
var allSampledPoints = [];       // [{ pos, axis, tool, moveType }] 用于动画（仅可见条目）
var toolGroup = null;            // 刀具示意组（刀尖球 + 刀体 + 夹头），沿刀轴方向绘制
var toolTip = null;              // 刀尖/接触点指示球（位于 GOTO）
var toolCutter = null;           // 刀体（铣刀圆柱）
var toolHolder = null;           // 夹头（顶部略宽短圆柱）
var trailLine = null;
var trailPoints = [];
var trailMaxLen = 200;
var modelMaxDim = 100;           // 当前模型包围盒最大尺寸（用于刀具尺寸归一化）
var UP = new THREE.Vector3(0, 1, 0);

var animState = {
  playing: false,
  currentIdx: 0,
  speed: 10,
  rafId: null,
};

var bounds = null;  // { min: [x,y,z], max: [x,y,z] }（仅统计可见条目）

// 纯色坐标轴（红X / 绿Y / 蓝Z，无渐变）
function createSolidAxes(length) {
  var group = new THREE.Group();
  var axes = [
    { color: 0xff0000, dir: [1, 0, 0] },
    { color: 0x00ff00, dir: [0, 1, 0] },
    { color: 0x0000ff, dir: [0, 0, 1] },
  ];
  axes.forEach(function (a) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(
      new Float32Array([0, 0, 0, a.dir[0] * length, a.dir[1] * length, a.dir[2] * length]), 3
    ));
    var mat = new THREE.LineBasicMaterial({ color: a.color });
    var line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    group.add(line);
  });
  return group;
}

function initScene() {
  var canvas = document.getElementById("canvas3d");
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1d24);

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
  camera.position.set(100, -200, 200);

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  controls = new TrackballControls(camera, canvas);
  // 自由轨道（轨迹球）：无极点限制，可任意翻滚，接近 UG 自由旋转手感
  controls.rotateSpeed = 3.0;
  controls.panSpeed = 0.8;
  controls.zoomSpeed = 1.2;
  controls.staticMoving = false;          // 拖动后带惯性，松手平滑减速
  controls.dynamicDampingFactor = 0.18;   // 阻尼系数（越大越跟手、越小越顺滑）
  controls.handleResize();

  // 用户交互时暂停自动旋转，避免叠加抖动
  controls.addEventListener("start", function () { userInteracting = true; });
  controls.addEventListener("end", function () { userInteracting = false; });

  // 网格
  gridHelper = new THREE.GridHelper(500, 50, 0x3a404c, 0x2d323c);
  gridHelper.rotation.x = Math.PI / 2; // XY 平面
  scene.add(gridHelper);
  applyGridStyle();

  // 坐标轴 (X=红, Y=绿, Z=蓝，纯色无渐变)
  axesHelper = createSolidAxes(80);
  scene.add(axesHelper);
  updateAxisLabels(80);

  // 灯光（让刀具有立体感）
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  var dirLight = new THREE.DirectionalLight(0xffffff, 0.65);
  dirLight.position.set(1, 1.5, 1);
  scene.add(dirLight);

  // 刀具示意：刀尖接触点（亮绿球，位于 GOTO）+ 沿刀轴 +Y 向上的刀体 + 顶部夹头
  toolGroup = new THREE.Group();
  // 刀尖接触点（小球，半径 1，运行时缩放；位于 y=0 = GOTO 处）
  var tipGeo = new THREE.SphereGeometry(1, 16, 16);
  var tipMat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x006644, emissiveIntensity: 0.6, roughness: 0.4 });
  toolTip = new THREE.Mesh(tipGeo, tipMat);
  toolGroup.add(toolTip);
  // 刀体（铣刀）：单位圆柱，底面在 y=0（刀尖），沿 +Y 向上，运行时缩放为 (半径, 长度, 半径)
  var cutterGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, false);
  cutterGeo.translate(0, 0.5, 0);
  var cutterMat = new THREE.MeshStandardMaterial({ color: 0xc2c8d2, metalness: 0.75, roughness: 0.3 });
  toolCutter = new THREE.Mesh(cutterGeo, cutterMat);
  toolGroup.add(toolCutter);
  // 夹头（顶部略宽的短圆柱，示意主轴刀柄），运行时缩放并定位到刀体顶端
  var holderGeo = new THREE.CylinderGeometry(1.35, 1.2, 1, 28, 1, false);
  holderGeo.translate(0, 0.5, 0);
  var holderMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.6, roughness: 0.45 });
  toolHolder = new THREE.Mesh(holderGeo, holderMat);
  toolGroup.add(toolHolder);
  toolGroup.visible = false;
  scene.add(toolGroup);

  // 尾迹
  var trailGeo = new THREE.BufferGeometry();
  var trailMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2 });
  trailLine = new THREE.Line(trailGeo, trailMat);
  trailLine.frustumCulled = false;
  scene.add(trailLine);

  resize();
  window.addEventListener("resize", resize);
  animate3D();
}

function resize() {
  var stage = document.querySelector(".viewer-stage");
  if (!stage || !renderer) return;
  var w = stage.clientWidth;
  var h = stage.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (controls && controls.handleResize) controls.handleResize();
}

function animate3D() {
  requestAnimationFrame(animate3D);

  // 自动旋转：手动围绕 target 转一点（TrackballControls 无 autoRotate）
  if (autoRotateEnabled && controls && !userInteracting) {
    var offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.006);
    camera.position.copy(controls.target).add(offset);
  }

  controls.update();
  renderer.render(scene, camera);
}

// ================================================================
//  多刀轨条目管理
// ================================================================
function addEntry(name, text) {
  entrySeq++;
  var entry = {
    id: entrySeq,
    name: name || ("CLSF " + entrySeq),
    text: text || "",
    visible: true,
    transparent: false,
    colors: Object.assign({}, DEFAULT_COLORS),
    paths: null,        // 解析出的路径数组
    rootGroup: null,    // 该条目所有路径的 3D 根组
    pathGroups: [],     // [{ group, path, moveGroups }]
    moveCounts: zeroMoveCounts(),
    sampled: [],        // 该条目采样点 [{ pos, axis, tool, moveType }]
    el: null,
  };
  entry.el = createEntryElement(entry);
  document.getElementById("clsfList").appendChild(entry.el);
  wireEntryEvents(entry);
  clsfEntries.push(entry);
  updateClsfCount();
  return entry;
}

function createEntryElement(entry) {
  var div = document.createElement("div");
  div.className = "clsf-item";
  div.dataset.id = entry.id;

  // 头部：显示勾选 + 透明勾选 + 删除
  var head = document.createElement("div");
  head.className = "clsf-head";

  var visLabel = document.createElement("label");
  visLabel.className = "check";
  visLabel.title = "是否在 3D 视图中显示此 CLSF";
  var visCb = document.createElement("input");
  visCb.type = "checkbox";
  visCb.checked = true;
  visCb.className = "clsf-visible";
  visLabel.appendChild(visCb);
  visLabel.appendChild(document.createTextNode(" 显示"));
  head.appendChild(visLabel);

  var hlLabel = document.createElement("label");
  hlLabel.className = "check";
  hlLabel.title = "将此 CLSF 的刀路设为半透明";
  var hlCb = document.createElement("input");
  hlCb.type = "checkbox";
  hlCb.checked = false;
  hlCb.className = "clsf-transparent";
  hlLabel.appendChild(hlCb);
  hlLabel.appendChild(document.createTextNode(" 透明"));
  head.appendChild(hlLabel);

  var rm = document.createElement("button");
  rm.type = "button";
  rm.className = "btn btn-icon clsf-remove";
  rm.title = "删除此 CLSF";
  rm.innerHTML = "&times;";
  head.appendChild(rm);

  div.appendChild(head);

  // 输入区
  var ta = document.createElement("textarea");
  ta.className = "clsf-text";
  ta.rows = 4;
  ta.placeholder = "在此粘贴 CLSF 内容，点击「解析」显示刀轨";
  ta.value = entry.text || "";
  div.appendChild(ta);

  // 操作按钮
  var btns = document.createElement("div");
  btns.className = "row clsf-btns";
  var parseBtn = document.createElement("button");
  parseBtn.type = "button";
  parseBtn.className = "btn btn-primary clsf-parse";
  parseBtn.textContent = "解析";
  btns.appendChild(parseBtn);
  var sampleBtn = document.createElement("button");
  sampleBtn.type = "button";
  sampleBtn.className = "btn clsf-sample";
  sampleBtn.textContent = "示例";
  btns.appendChild(sampleBtn);
  div.appendChild(btns);

  // 刀轨类型颜色（每个 CLSF 独立）
  var colorsEl = document.createElement("div");
  colorsEl.className = "clsf-colors";
  MOVE_TYPES.forEach(function (mt) {
    var label = document.createElement("label");
    label.className = "color-item";
    label.title = MOVE_TYPE_TIPS[mt];
    var span = document.createElement("span");
    span.className = "color-name";
    span.textContent = MOVE_TYPE_LABELS[mt];
    var input = document.createElement("input");
    input.type = "color";
    input.value = entry.colors[mt];
    input.dataset.type = mt;
    input.className = "clsf-color";
    label.appendChild(span);
    label.appendChild(input);
    colorsEl.appendChild(label);
  });
  div.appendChild(colorsEl);

  return div;
}

function wireEntryEvents(entry) {
  var el = entry.el;
  var ta = el.querySelector(".clsf-text");

  el.querySelector(".clsf-parse").addEventListener("click", function () {
    entry.text = ta.value;
    parseEntry(entry);
  });

  el.querySelector(".clsf-sample").addEventListener("click", function () {
    ta.value = SAMPLE_CLSF;
    entry.text = SAMPLE_CLSF;
    parseEntry(entry);
  });

  el.querySelector(".clsf-visible").addEventListener("change", function (e) {
    setEntryVisible(entry, e.target.checked);
  });

  el.querySelector(".clsf-remove").addEventListener("click", function () {
    removeEntry(entry);
  });

  // 透明 checkbox：只控制当前 CLSF，不影响其他条目
  el.querySelector(".clsf-transparent").addEventListener("change", function (e) {
    setEntryTransparent(entry, e.target.checked);
  });

  ta.addEventListener("input", function () { entry.text = ta.value; });

  el.querySelectorAll(".clsf-color").forEach(function (input) {
    function apply() { setEntryColor(entry, input.dataset.type, input.value); }
    input.addEventListener("input", apply);   // 取色过程实时预览
    input.addEventListener("change", apply);  // 最终确认
  });
}

function setEntryStatus(entry, msg, isError) {
  // 卡片上不再显示状态文字，错误用弹窗提示
  if (isError) alert(msg);
}

function parseEntry(entry) {
  var text = (entry.text || "").trim();
  if (!text) {
    setEntryStatus(entry, "请输入 CLSF 内容", true);
    return;
  }
  try {
    var parser = new CLSFParser();
    var paths = parser.parseContent(text);
    if (paths.length === 0) {
      setEntryStatus(entry, "未解析到刀轨路径", true);
      return;
    }
    entry.paths = paths;
    renderEntry(entry);
    setEntryStatus(entry, "已解析 " + paths.length + " 条路径", false);
  } catch (e) {
    setEntryStatus(entry, "解析失败: " + e.message, true);
    console.error(e);
  }
}

function removeEntry(entry) {
  removeEntryFromScene(entry);
  clsfEntries = clsfEntries.filter(function (e) { return e.id !== entry.id; });
  if (entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
  applyAllEntryTransparency();
  updateClsfCount();
  ensureDefaultEntry();
  recomputeBounds();
  rebuildAnimationData();
  fitCamera();
}

function clearAllEntries() {
  clsfEntries.slice().forEach(function (e) { removeEntryFromScene(e); });
  clsfEntries = [];
  document.getElementById("clsfList").innerHTML = "";
  updateClsfCount();
  bounds = null;
  rebuildAnimationData();
  resetAnimation();
  ensureDefaultEntry();
  updateViewerPlaceholder();
}

function ensureDefaultEntry() {
  // 保持「默认至少一个输入框」的约定
  if (clsfEntries.length === 0) addEntry("CLSF 1", "");
}

function updateClsfCount() {
  document.getElementById("clsfCount").textContent = clsfEntries.length;
}

// ================================================================
//  渲染刀轨
// ================================================================
function renderEntry(entry) {
  removeEntryFromScene(entry);

  var sampler = new MoveSampler({ arcSteps: 48, helixStepsPerTurn: 60 });
  var moveCounts = zeroMoveCounts();
  var rootGroup = new THREE.Group();
  var pathGroups = [];
  var entryPoints = [];

  for (var pi = 0; pi < entry.paths.length; pi++) {
    var path = entry.paths[pi];
    var group = new THREE.Group();
    var moveGroups = {};
    MOVE_TYPES.forEach(function (mt) {
      moveGroups[mt] = new THREE.Group();
      group.add(moveGroups[mt]);
    });

    for (var mi = 0; mi < path.moves.length; mi++) {
      var move = path.moves[mi];
      var pts = sampler.sample(move.geometry);
      if (pts.length < 2) continue;

      var mt = move.moveType;
      moveCounts[mt]++;

      // 创建线段
      var positions = new Float32Array(pts.length * 3);
      for (var k = 0; k < pts.length; k++) {
        positions[k*3] = pts[k][0];
        positions[k*3+1] = pts[k][1];
        positions[k*3+2] = pts[k][2];

        // 收集采样点用于动画（携带刀轴与刀具尺寸）
        if (k > 0 || entryPoints.length === 0) {
          entryPoints.push({
            pos: pts[k].slice(),
            moveType: mt,
            axis: move.geometry.axis || [0, 0, 1],
            tool: path.tool || null,
          });
        }
      }

      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      // 切削(实线) / 非切削(虚线)，颜色取该 CLSF 独立配色
      var isCutMove = (mt === "cut" || mt === "firstcut" || mt === "stepover");
      var line;
      if (isCutMove) {
        line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: entry.colors[mt],
          transparent: true,
          opacity: 1.0,
          // 刀路在选中高亮时会降低透明度；透明对象不能写深度，
          // 否则重叠的刀路可能仍以不透明的颜色覆盖在最上面。
          depthWrite: false,
        }));
      } else {
        var dmat = new THREE.LineDashedMaterial({
          color: entry.colors[mt],
          transparent: true,
          opacity: 1.0,
          depthWrite: false,
        });
        line = new THREE.Line(geo, dmat);
        line.computeLineDistances();
        // 按各段实际长度取虚线密度，保证无论长短都呈虚线观感
        var ldAttr = geo.getAttribute("lineDistance");
        var totalLen = ldAttr ? ldAttr.array[ldAttr.count - 1] : 0;
        var dash = Math.max(totalLen / 14, 0.05);
        dmat.dashSize = dash;
        dmat.gapSize = dash * 0.5;
      }
      line.frustumCulled = false;
      moveGroups[mt].add(line);
    }

    rootGroup.add(group);
    pathGroups.push({
      group: group,
      path: path,
      moveGroups: moveGroups,
    });
  }

  entry.rootGroup = rootGroup;
  entry.pathGroups = pathGroups;
  entry.moveCounts = moveCounts;
  entry.sampled = entryPoints;
  scene.add(rootGroup);
  rootGroup.visible = entry.visible;

  recomputeBounds();
  rebuildAnimationData();
  fitCamera();
  applyAllEntryTransparency();
  updateViewerPlaceholder();
}

function removeEntryFromScene(entry) {
  if (entry.rootGroup) {
    scene.remove(entry.rootGroup);
    entry.rootGroup.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
  entry.rootGroup = null;
  entry.pathGroups = [];
  entry.moveCounts = zeroMoveCounts();
  entry.sampled = [];
}

function applyEntryColors(entry) {
  entry.pathGroups.forEach(function (pg) {
    MOVE_TYPES.forEach(function (mt) {
      pg.moveGroups[mt].children.forEach(function (line) {
        if (line.material) line.material.color.set(entry.colors[mt]);
      });
    });
  });
}

function setEntryVisible(entry, v) {
  entry.visible = v;
  if (entry.rootGroup) entry.rootGroup.visible = v;
  recomputeBounds();
  rebuildAnimationData();
}

function setEntryColor(entry, mt, hex) {
  entry.colors[mt] = hex;
  applyEntryColors(entry);
  applyAllEntryTransparency();
}

// ---- 单条目透明度 ----
function setEntryTransparent(entry, on) {
  entry.transparent = on;
  applyEntryTransparency(entry);
}

function applyEntryTransparency(entry) {
  if (!entry.rootGroup) return;
  var opacity = entry.transparent ? 0.20 : 1.0;
  entry.pathGroups.forEach(function (pg) {
      MOVE_TYPES.forEach(function (mt) {
        pg.moveGroups[mt].children.forEach(function (line) {
          if (!line.material) return;
          line.material.color.set(entry.colors[mt]);
          line.material.opacity = opacity;
          line.material.transparent = true;
          line.material.depthWrite = false;
          line.material.needsUpdate = true;
        });
      });
    });
}

function applyAllEntryTransparency() {
  clsfEntries.forEach(applyEntryTransparency);
}

function updateBounds(pos) {
  if (!bounds) {
    bounds = { min: pos.slice(), max: pos.slice() };
  } else {
    for (var i = 0; i < 3; i++) {
      if (pos[i] < bounds.min[i]) bounds.min[i] = pos[i];
      if (pos[i] > bounds.max[i]) bounds.max[i] = pos[i];
    }
  }
}

// 重新统计包围盒（仅可见条目）
function recomputeBounds() {
  bounds = null;
  clsfEntries.forEach(function (e) {
    if (!e.visible || !e.sampled) return;
    e.sampled.forEach(function (p) { updateBounds(p.pos); });
  });
}

// 重新聚合动画采样点（仅可见条目）
function rebuildAnimationData() {
  allSampledPoints = [];
  clsfEntries.forEach(function (e) {
    if (e.visible && e.sampled) allSampledPoints = allSampledPoints.concat(e.sampled);
  });

  var has = allSampledPoints.length > 0;
  document.getElementById("playBtn").disabled = !has;
  document.getElementById("resetBtn").disabled = !has;
  document.getElementById("progress").disabled = !has;
  document.getElementById("progress").max = Math.max(1, allSampledPoints.length - 1);
  if (animState.currentIdx >= allSampledPoints.length) resetAnimation();
}

// 应用网格平面透明度（默认透明，避免遮挡刀路）
function applyGridStyle() {
  if (!gridHelper) return;
  var transparent = true;  // 默认透明（UI 已移除切换）
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = transparent ? 0.22 : 0.9;
  gridHelper.material.depthWrite = !transparent;
}

function fitCamera() {
  if (!bounds) return;
  var center = [
    (bounds.min[0]+bounds.max[0])/2,
    (bounds.min[1]+bounds.max[1])/2,
    (bounds.min[2]+bounds.max[2])/2,
  ];
  var size = [
    bounds.max[0]-bounds.min[0],
    bounds.max[1]-bounds.min[1],
    bounds.max[2]-bounds.min[2],
  ];
  var maxDim = Math.max(size[0], size[1], size[2]);
  if (maxDim < 1) maxDim = 100;
  modelMaxDim = maxDim;
  var dist = maxDim * 1.8;

  camera.position.set(center[0] + dist*0.5, center[1] - dist*0.8, center[2] + dist*0.6);
  camera.far = Math.max(100000, dist * 100);
  camera.updateProjectionMatrix();
  controls.target.set(center[0], center[1], center[2]);
  controls.update();

  // 更新网格大小
  if (gridHelper) {
    scene.remove(gridHelper);
    var gridSize = Math.max(500, maxDim * 2);
    var divisions = Math.max(20, Math.round(gridSize / 10));
    gridHelper = new THREE.GridHelper(gridSize, divisions, 0x3a404c, 0x2d323c);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.visible = true;
    scene.add(gridHelper);
    applyGridStyle();
  }

  // 更新坐标轴大小
  if (axesHelper) {
    scene.remove(axesHelper);
    axesHelper.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    axesHelper = createSolidAxes(Math.max(30, maxDim * 0.15));
    axesHelper.visible = true;
    scene.add(axesHelper);
  }

  updateAxisLabels(Math.max(30, maxDim * 0.15));
}

// 生成坐标轴 X / Y / Z 文字标签
function makeTextSprite(text, colorHex) {
  var size = 128;
  var canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#" + colorHex.toString(16).padStart(6, "0");
  ctx.font = "bold 84px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, size / 2, size / 2);

  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  var mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  var sprite = new THREE.Sprite(mat);
  return sprite;
}

function updateAxisLabels(length) {
  // 清理旧标签
  axisLabels.forEach(function (sp) {
    scene.remove(sp);
    if (sp.material.map) sp.material.map.dispose();
    sp.material.dispose();
  });
  axisLabels = [];

  var labels = [
    { text: "X", color: 0xff0000, pos: [length * 1.12, 0, 0] },
    { text: "Y", color: 0x00ff00, pos: [0, length * 1.12, 0] },
    { text: "Z", color: 0x0000ff, pos: [0, 0, length * 1.12] },
  ];
  var show = true;
  var labelScale = 4;  // 固定小字号，不随模型缩放
  labels.forEach(function (lb) {
    var sp = makeTextSprite(lb.text, lb.color);
    sp.scale.set(labelScale, labelScale, labelScale);
    sp.position.set(lb.pos[0], lb.pos[1], lb.pos[2]);
    sp.visible = show;
    sp.renderOrder = 999;
    scene.add(sp);
    axisLabels.push(sp);
  });
}

// ================================================================
//  动画
// ================================================================
function playAnimation() {
  if (allSampledPoints.length === 0) return;
  animState.playing = !animState.playing;
  var btn = document.getElementById("playBtn");
  btn.innerHTML = animState.playing ? "&#10074;&#10074; 暂停" : "&#9654; 播放";
  if (animState.playing) {
    animState.rafId = requestAnimationFrame(stepAnimation);
  }
}

function pauseAnimation() {
  animState.playing = false;
  document.getElementById("playBtn").innerHTML = "&#9654; 播放";
  if (animState.rafId) cancelAnimationFrame(animState.rafId);
}

function stepAnimation() {
  if (!animState.playing) return;
  animState.currentIdx += animState.speed;
  if (animState.currentIdx >= allSampledPoints.length) {
    animState.currentIdx = allSampledPoints.length - 1;
    updateAnimationMarker();
    pauseAnimation();
    return;
  }
  updateAnimationMarker();
  animState.rafId = requestAnimationFrame(stepAnimation);
}

function updateAnimationMarker() {
  var idx = Math.min(animState.currentIdx, allSampledPoints.length - 1);
  if (idx < 0) return;
  var pt = allSampledPoints[idx];

  // —— 刀具：按 CLSF 刀轴 (i,j,k) 方向与刀具尺寸绘制 ——
  var ax = new THREE.Vector3(pt.axis[0], pt.axis[1], pt.axis[2]);
  if (ax.lengthSq() < 1e-6) ax.set(0, 0, 1);
  ax.normalize();

  var tool = pt.tool;
  var dia = (tool && tool.diameter > 0) ? tool.diameter : null;
  var len = (tool && tool.length > 0) ? tool.length : null;
  var radius = dia ? dia / 2 : modelMaxDim * 0.02;
  var length = len ? len : modelMaxDim * 0.3;
  // 归一化裁剪，避免过大/过小
  radius = Math.min(Math.max(radius, 0.5), modelMaxDim * 0.1);
  length = Math.min(Math.max(length, modelMaxDim * 0.1), modelMaxDim * 0.9);

  toolGroup.visible = true;
  toolGroup.position.set(pt.pos[0], pt.pos[1], pt.pos[2]);
  toolGroup.quaternion.setFromUnitVectors(UP, ax);   // 局部 +Y 对齐刀轴（刀轴矢量 i,j,k，尖端在 GOTO 处）

  // 刀体：圆柱底面在刀尖(GOTO)，沿刀轴向上延伸 length
  toolCutter.scale.set(radius, length, radius);
  // 刀尖接触点小球
  toolTip.scale.setScalar(Math.max(radius * 0.6, 0.5));
  // 夹头：略宽短圆柱，定位在刀体顶端
  var holderH = Math.min(Math.max(length * 0.16, radius * 1.5), length * 0.4);
  toolHolder.scale.set(radius * 1.2, holderH, radius * 1.2);
  toolHolder.position.set(0, length - holderH * 0.5, 0);

  // 尾迹
  trailPoints.push(pt.pos.slice());
  if (trailPoints.length > trailMaxLen) trailPoints.shift();
  var positions = new Float32Array(trailPoints.length * 3);
  for (var i = 0; i < trailPoints.length; i++) {
    positions[i*3] = trailPoints[i][0];
    positions[i*3+1] = trailPoints[i][1];
    positions[i*3+2] = trailPoints[i][2];
  }
  trailLine.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  trailLine.geometry.computeBoundingSphere();

  // 进度条
  var progressEl = document.getElementById("progress");
  progressEl.value = idx;

  // 坐标 + 刀轴显示
  var cd = document.getElementById("coordDisplay");
  cd.innerHTML = "X: " + pt.pos[0].toFixed(3) + "  Y: " + pt.pos[1].toFixed(3) + "  Z: " + pt.pos[2].toFixed(3) +
    "<br/>刀轴 I/J/K: " + ax.x.toFixed(3) + " / " + ax.y.toFixed(3) + " / " + ax.z.toFixed(3) +
    (tool && tool.name ? "  |  " + tool.name : "");
}

function resetAnimation() {
  pauseAnimation();
  animState.currentIdx = 0;
  trailPoints = [];
  trailLine.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
  toolGroup.visible = false;
  document.getElementById("progress").value = 0;
  document.getElementById("coordDisplay").textContent = "";
}

// ================================================================
//  UI 更新
// ================================================================
function updateViewerPlaceholder() {
  var hasContent = allSampledPoints.length > 0;
  document.getElementById("viewerHint").style.display = hasContent ? "none" : "flex";
  document.getElementById("coordDisplay").style.display = hasContent ? "block" : "none";
}

// ================================================================
//  示例数据
// ================================================================
var SAMPLE_CLSF = [
  "TOOL PATH/PLANAR_MILL,TOOL,FLAT_TOOL",
  "TLDATA/MILL,10.0000,0.0000,50.0000,0.0000,0.0000",
  "MSYS/0.0000,0.0000,0.0000,1.0000000,0.0000000,0.0000000,0.0000000,1.0000000,0.0000000",
  "$$ centerline data",
  "PAINT/PATH",
  "PAINT/SPEED,10",
  "PAINT/COLOR,186",
  "RAPID",
  "GOTO/0.0000,0.0000,50.0000",
  "PAINT/COLOR,211",
  "RAPID",
  "GOTO/0.0000,0.0000,10.0000",
  "PAINT/COLOR,42",
  "FEDRAT/MMPM,500.0000",
  "GOTO/0.0000,0.0000,0.0000",
  "PAINT/COLOR,31",
  "GOTO/80.0000,0.0000,0.0000",
  "PAINT/COLOR,36",
  "GOTO/80.0000,60.0000,0.0000",
  "PAINT/COLOR,31",
  "GOTO/0.0000,60.0000,0.0000",
  "PAINT/COLOR,36",
  "GOTO/0.0000,0.0000,0.0000",
  "PAINT/COLOR,37",
  "GOTO/0.0000,0.0000,20.0000",
  "PAINT/COLOR,186",
  "RAPID",
  "GOTO/40.0000,30.0000,20.0000",
  "PAINT/COLOR,42",
  "FEDRAT/MMPM,300.0000",
  "GOTO/40.0000,30.0000,-5.0000",
  "PAINT/COLOR,31",
  "CIRCLE/40.0000,30.0000,-5.0000,0.0000000,0.0000000,1.0000000,20.0000,0.0600,0.5000,10.0000,0.0000",
  "GOTO/60.0000,30.0000,-5.0000",
  "PAINT/COLOR,37",
  "GOTO/60.0000,30.0000,20.0000",
  "PAINT/COLOR,186",
  "RAPID",
  "GOTO/0.0000,0.0000,50.0000",
  "PAINT/TOOL,NOMORE",
  "END-OF-PATH",
  "TOOL PATH/DRILL_HOLES,TOOL,STD_D8",
  "TLDATA/DRILL,MILL,8.0000,0.0000,80.0000,118.0000,35.0000",
  "MSYS/0.0000,0.0000,0.0000,1.0000000,0.0000000,0.0000000,0.0000000,1.0000000,0.0000000",
  "$$ centerline data",
  "PAINT/PATH",
  "PAINT/SPEED,10",
  "PAINT/COLOR,186",
  "RAPID",
  "GOTO/20.0000,100.0000,50.0000,0.0000000,0.0000000,1.0000000",
  "CYCLE/DRILL,CLEAR,3.0000,FEDTO,-10.0000,RTRCTO,AUTO,MMPM,250.0000",
  "PAINT/COLOR,31",
  "GOTO/20.0000,100.0000,10.0000",
  "CYCLE/OFF",
  "PAINT/COLOR,186",
  "RAPID",
  "GOTO/80.0000,100.0000,50.0000",
  "CYCLE/DRILL,CLEAR,3.0000,FEDTO,-15.0000,RTRCTO,AUTO,MMPM,250.0000",
  "PAINT/COLOR,31",
  "GOTO/80.0000,100.0000,10.0000",
  "CYCLE/OFF",
  "PAINT/COLOR,186",
  "RAPID",
  "GOTO/20.0000,100.0000,50.0000",
  "PAINT/TOOL,NOMORE",
  "END-OF-PATH",
].join("\n");

// ================================================================
//  事件绑定
// ================================================================
function bindEvents() {
  // 多 CLSF：添加 / 清空
  document.getElementById("addClsfBtn").addEventListener("click", function () {
    addEntry("CLSF " + (entrySeq + 1), "");
  });
  document.getElementById("clearAllBtn").addEventListener("click", clearAllEntries);

  // 动画
  document.getElementById("playBtn").addEventListener("click", playAnimation);
  document.getElementById("resetBtn").addEventListener("click", resetAnimation);
  document.getElementById("speed").addEventListener("input", function (e) {
    animState.speed = parseInt(e.target.value, 10);
    document.getElementById("speedVal").textContent = e.target.value + "x";
  });
  document.getElementById("progress").addEventListener("input", function (e) {
    pauseAnimation();
    animState.currentIdx = parseInt(e.target.value, 10);
    updateAnimationMarker();
  });
}

// ================================================================
//  初始化
// ================================================================
initScene();
bindEvents();
// 默认一个 CLSF 输入框
addEntry("CLSF 1", "");

// 确保画布尺寸正确
setTimeout(resize, 100);

// 标记初始化成功（供加载兜底脚本检测）
window.__clsfReady = true;

// 调试钩子（测试用）
window.__clsfDebug = {
  opacities: function () {
    return clsfEntries.map(function (e) {
      if (!e.rootGroup) return { id: e.id, parsed: false };
      var ops = [];
      e.rootGroup.traverse(function (obj) {
        if (obj.material) ops.push(obj.material.opacity);
      });
      return {
        id: e.id,
        visible: e.visible,
        groupVisible: e.rootGroup.visible,
        count: ops.length,
        min: ops.length ? Math.min.apply(null, ops) : null,
      };
    });
  },
};
