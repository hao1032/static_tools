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
var COLOR_TO_MOVE_TYPE = {
  186: "rapid",     // 快进
  211: "approach",  // 逼近 / 移刀 / 离开
  42:  "engage",    // 进刀
  33:  "firstcut",  // 第一刀切削
  36:  "stepover",  // 步进
  31:  "cut",       // 切削 / 第一刀切削 / 最后一刀切削
  37:  "retract",   // 退刀
};

function classify(geom) {
  if (geom.type === "line" && geom.rapid) return "rapid";
  if (geom.color != null) return COLOR_TO_MOVE_TYPE[geom.color] || "cut";
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
var MOVE_COLORS = {
  rapid:    0xff0000, // 快进 — 红
  approach: 0x0000ff, // 逼近 / 移刀 / 离开 — 蓝
  engage:   0xff8000, // 进刀 — 橙
  firstcut: 0xffff00, // 第一刀切削 — 黄
  stepover: 0x00ff00, // 步进 — 绿
  cut:      0x00ffff, // 切削 — 青
  retract:  0xff80c0, // 退刀 — 粉红
};

var scene, camera, renderer, controls;
var autoRotateEnabled = false;   // 自动旋转（手动实现，TrackballControls 无该属性）
var userInteracting = false;     // 用户正在拖动/缩放/平移
var gridHelper, axesHelper;
var axisLabels = [];     // 坐标轴文字标签 [X, Y, Z]
var pathGroups = [];     // [{ group, path, moveGroups: {rapid,approach,engage,firstcut,stepover,cut,retract}, visible }]
var allSampledPoints = []; // [{ pos, color, pathIdx }] 用于动画
var toolGroup = null;     // 刀具示意组（刀尖球 + 刀体 + 夹头），沿刀轴方向绘制
var toolTip = null;       // 刀尖/接触点指示球（位于 GOTO）
var toolCutter = null;    // 刀体（铣刀圆柱）
var toolHolder = null;    // 夹头（顶部略宽短圆柱）
var trailLine = null;
var trailPoints = [];
var trailMaxLen = 200;
var modelMaxDim = 100;    // 当前模型包围盒最大尺寸（用于刀具尺寸归一化）
var UP = new THREE.Vector3(0, 1, 0);

var animState = {
  playing: false,
  currentIdx: 0,
  speed: 10,
  rafId: null,
};

var bounds = null;  // { min: [x,y,z], max: [x,y,z] }

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

  // 坐标轴 (X=红, Y=绿, Z=蓝)
  axesHelper = new THREE.AxesHelper(80);
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
//  渲染刀轨
// ================================================================
function clearScene() {
  pathGroups.forEach(function (pg) {
    scene.remove(pg.group);
    pg.group.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  });
  pathGroups = [];
  allSampledPoints = [];
  // 清理坐标轴标签
  axisLabels.forEach(function (sp) {
    scene.remove(sp);
    if (sp.material.map) sp.material.map.dispose();
    sp.material.dispose();
  });
  axisLabels = [];
  toolGroup.visible = false;
  trailLine.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
  trailPoints = [];
  bounds = null;
}

function renderPaths(paths) {
  clearScene();
  var sampler = new MoveSampler({ arcSteps: 48, helixStepsPerTurn: 60 });
  var moveCounts = {
    rapid: 0, approach: 0, engage: 0, firstcut: 0,
    stepover: 0, cut: 0, retract: 0,
  };

  for (var pi = 0; pi < paths.length; pi++) {
    var path = paths[pi];
    var group = new THREE.Group();
    var moveGroups = {
      rapid: new THREE.Group(),
      approach: new THREE.Group(),
      engage: new THREE.Group(),
      firstcut: new THREE.Group(),
      stepover: new THREE.Group(),
      cut: new THREE.Group(),
      retract: new THREE.Group(),
    };
    Object.values(moveGroups).forEach(function (g) { group.add(g); });

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

        // 更新包围盒
        updateBounds(pts[k]);

        // 收集采样点用于动画（携带刀轴与刀具尺寸）
        if (k > 0 || allSampledPoints.length === 0) {
          allSampledPoints.push({
            pos: pts[k].slice(),
            pathIdx: pi,
            moveType: mt,
            axis: move.geometry.axis || [0, 0, 1],
            tool: path.tool || null,
          });
        }
      }

      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      var mat = new THREE.LineBasicMaterial({
        color: MOVE_COLORS[mt],
        transparent: true,
        opacity: 1.0,
      });
      var line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      moveGroups[mt].add(line);
    }

    scene.add(group);
    pathGroups.push({
      group: group,
      path: path,
      moveGroups: moveGroups,
      visible: true,
    });
  }

  // 隐藏提示
  document.getElementById("viewerHint").style.display = "none";
  document.getElementById("coordDisplay").style.display = "block";

  fitCamera();
  updateStats(paths, moveCounts);
  updatePathList(paths);
  updateMoveTypeVisibility();

  // 启用动画
  document.getElementById("playBtn").disabled = allSampledPoints.length === 0;
  document.getElementById("resetBtn").disabled = allSampledPoints.length === 0;
  document.getElementById("progress").disabled = allSampledPoints.length === 0;
  document.getElementById("progress").max = Math.max(1, allSampledPoints.length - 1);
}

function updateBounds(pos) {  if (!bounds) {
    bounds = { min: pos.slice(), max: pos.slice() };
  } else {
    for (var i = 0; i < 3; i++) {
      if (pos[i] < bounds.min[i]) bounds.min[i] = pos[i];
      if (pos[i] > bounds.max[i]) bounds.max[i] = pos[i];
    }
  }
}

// 应用网格平面透明度（默认透明，避免遮挡刀路）
function applyGridStyle() {
  if (!gridHelper) return;
  var transparent = document.getElementById("transparentPlane").checked;
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
    gridHelper.visible = document.getElementById("showGrid").checked;
    scene.add(gridHelper);
    applyGridStyle();
  }

  // 更新坐标轴大小
  if (axesHelper) {
    scene.remove(axesHelper);
    axesHelper = new THREE.AxesHelper(Math.max(30, maxDim * 0.15));
    axesHelper.visible = document.getElementById("showAxes").checked;
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
    { text: "X", color: 0xff3b30, pos: [length * 1.12, 0, 0] },
    { text: "Y", color: 0x34c759, pos: [0, length * 1.12, 0] },
    { text: "Z", color: 0x0a84ff, pos: [0, 0, length * 1.12] },
  ];
  var show = document.getElementById("showAxes").checked;
  var labelScale = Math.max(6, length * 0.1);
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
function updatePathList(paths) {
  var listEl = document.getElementById("pathList");
  var countEl = document.getElementById("pathCount");
  countEl.textContent = paths.length;
  listEl.innerHTML = "";

  paths.forEach(function (path, i) {
    var item = document.createElement("div");
    item.className = "path-item";
    item.dataset.idx = i;

    var name = path.name.replace("TOOL PATH/", "").trim();
    var toolName = path.tool ? path.tool.name : "—";
    var moveCount = path.moves.length;

    item.innerHTML =
      '<input type="checkbox" checked />' +
      '<span class="path-name" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</span>' +
      '<span class="path-meta">' + moveCount + ' 段</span>';

    var cb = item.querySelector("input");
    cb.addEventListener("change", function () {
      if (i < pathGroups.length) {
        pathGroups[i].group.visible = cb.checked;
        pathGroups[i].visible = cb.checked;
      }
    });

    listEl.appendChild(item);
  });
}

function updateStats(paths, moveCounts) {
  document.getElementById("statPaths").textContent = paths.length;
  var totalMoves = paths.reduce(function (s, p) { return s + p.moves.length; }, 0);
  document.getElementById("statMoves").textContent = totalMoves;
  document.getElementById("statPoints").textContent = allSampledPoints.length;
  document.getElementById("statBreakdown").textContent =
    [moveCounts.rapid, moveCounts.approach, moveCounts.engage,
     moveCounts.firstcut, moveCounts.stepover, moveCounts.cut, moveCounts.retract]
    .map(function (n) { return n || 0; }).join(" / ");

  // 刀具
  var tools = {};
  paths.forEach(function (p) {
    if (p.tool) {
      var key = p.tool.name + " (D" + p.tool.diameter.toFixed(1) + ")";
      tools[key] = (tools[key] || 0) + 1;
    }
  });
  var toolStr = Object.keys(tools).length > 0
    ? Object.keys(tools).map(function (k) { return k; }).join(", ")
    : "—";
  document.getElementById("statTools").textContent = toolStr;

  // 包围盒
  if (bounds) {
    var sx = (bounds.max[0]-bounds.min[0]).toFixed(1);
    var sy = (bounds.max[1]-bounds.min[1]).toFixed(1);
    var sz = (bounds.max[2]-bounds.min[2]).toFixed(1);
    document.getElementById("statBounds").textContent = sx + " \u00d7 " + sy + " \u00d7 " + sz;
  } else {
    document.getElementById("statBounds").textContent = "—";
  }
}

function updateMoveTypeVisibility() {
  var show = {
    rapid:    document.getElementById("showRapid").checked,
    approach: document.getElementById("showApproach").checked,
    engage:   document.getElementById("showEngage").checked,
    stepover: document.getElementById("showStepover").checked,
    cut:      document.getElementById("showCut").checked,
    retract:  document.getElementById("showRetract").checked,
    firstcut: true,
  };
  var lw = parseFloat(document.getElementById("lineWidth").value);
  var allTypes = ["rapid", "approach", "engage", "firstcut", "stepover", "cut", "retract"];

  pathGroups.forEach(function (pg) {
    allTypes.forEach(function (mt) {
      pg.moveGroups[mt].visible = show[mt];
      pg.moveGroups[mt].children.forEach(function (line) {
        if (line.material) {
          line.material.linewidth = lw;
        }
      });
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ================================================================
//  文件处理
// ================================================================
function loadCLSFContent(content, fileName) {
  try {
    var parser = new CLSFParser();
    var paths = parser.parseContent(content);

    if (paths.length === 0) {
      showStatus("未解析到任何刀轨路径，请检查文件格式", true);
      return;
    }

    renderPaths(paths);
    resetAnimation();

    var totalMoves = paths.reduce(function (s, p) { return s + p.moves.length; }, 0);
    showStatus("已加载: " + (fileName || "粘贴文本") + " — " + paths.length + " 条路径, " + totalMoves + " 段运动", false);
  } catch (e) {
    showStatus("解析失败: " + e.message, true);
    console.error(e);
  }
}

function showStatus(msg, isError) {
  var el = document.getElementById("fileStatus");
  el.textContent = msg;
  el.style.color = isError ? "#dc2626" : "var(--muted)";
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
  // 文件选择
  var fileInput = document.getElementById("fileInput");
  var fileBtn = document.getElementById("fileBtn");
  var dropZone = document.getElementById("dropZone");

  fileBtn.addEventListener("click", function () { fileInput.click(); });
  dropZone.addEventListener("click", function () { fileInput.click(); });

  fileInput.addEventListener("change", function (e) {
    if (e.target.files.length > 0) {
      readFile(e.target.files[0]);
    }
  });

  // 拖拽
  dropZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", function () {
    dropZone.classList.remove("drag-over");
  });
  dropZone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (e.dataTransfer.files.length > 0) {
      readFile(e.dataTransfer.files[0]);
    }
  });

  // 粘贴
  var pasteBtn = document.getElementById("pasteBtn");
  var pasteArea = document.getElementById("pasteArea");
  pasteBtn.addEventListener("click", function () {
    pasteArea.style.display = pasteArea.style.display === "none" ? "block" : "none";
  });
  document.getElementById("parsePasteBtn").addEventListener("click", function () {
    var text = document.getElementById("pasteText").value;
    if (text.trim()) loadCLSFContent(text, "粘贴文本");
  });

  // 示例
  document.getElementById("sampleBtn").addEventListener("click", function () {
    loadCLSFContent(SAMPLE_CLSF, "示例文件");
    document.getElementById("pasteText").value = SAMPLE_CLSF;
  });

  // 清空
  document.getElementById("clearBtn").addEventListener("click", function () {
    clearScene();
    document.getElementById("viewerHint").style.display = "flex";
    document.getElementById("coordDisplay").style.display = "none";
    document.getElementById("pathList").innerHTML = '<p class="hint">尚未加载文件</p>';
    document.getElementById("pathCount").textContent = "0";
    document.getElementById("fileInput").value = "";
    document.getElementById("pasteText").value = "";
    showStatus("", false);
    resetAnimation();
    document.getElementById("playBtn").disabled = true;
    document.getElementById("resetBtn").disabled = true;
    document.getElementById("progress").disabled = true;
    updateStats([], { rapid: 0, approach: 0, engage: 0, firstcut: 0, stepover: 0, cut: 0, retract: 0 });
  });

  // 显示选项
  ["showRapid", "showApproach", "showEngage", "showStepover", "showCut", "showRetract"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", updateMoveTypeVisibility);
  });
  document.getElementById("showGrid").addEventListener("change", function (e) {
    gridHelper.visible = e.target.checked;
  });
  document.getElementById("transparentPlane").addEventListener("change", applyGridStyle);
  document.getElementById("showAxes").addEventListener("change", function (e) {
    axesHelper.visible = e.target.checked;
    axisLabels.forEach(function (sp) { sp.visible = e.target.checked; });
  });
  document.getElementById("autoRotate").addEventListener("change", function (e) {
    autoRotateEnabled = e.target.checked;
  });
  document.getElementById("lineWidth").addEventListener("input", function (e) {
    document.getElementById("lineWidthVal").textContent = e.target.value;
    updateMoveTypeVisibility();
  });
  document.getElementById("fitBtn").addEventListener("click", fitCamera);

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

function readFile(file) {
  var reader = new FileReader();
  reader.onload = function (e) {
    loadCLSFContent(e.target.result, file.name);
  };
  reader.onerror = function () {
    showStatus("文件读取失败", true);
  };
  reader.readAsText(file);
}

// ================================================================
//  初始化
// ================================================================
initScene();
bindEvents();

// 确保画布尺寸正确
setTimeout(resize, 100);

// 标记初始化成功（供加载兜底脚本检测）
window.__clsfReady = true;
