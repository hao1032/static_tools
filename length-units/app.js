"use strict";

/* ====================== 数据 ====================== */
const UNITS = [
  { key: "mm", name: "毫米", sym: "mm",   uc: "var(--u-mm)", sub: "毫米是这里面最小的单位，10 个它才凑成 1 厘米。", emoji: "🪙",
    rel: "10 毫米 = 1 厘米", example: "1 元硬币的厚度（约 1.9 毫米）" },
  { key: "cm", name: "厘米", sym: "cm",   uc: "var(--u-cm)", sub: "厘米常用在量身高、书本、橡皮。", emoji: "💅",
    rel: "10 厘米 = 1 分米", example: "小朋友指甲的宽度（约 1 厘米）" },
  { key: "dm", name: "分米", sym: "dm",   uc: "var(--u-dm)", sub: "分米比厘米大，比米小。", emoji: "✋",
    rel: "10 分米 = 1 米", example: "手掌张开后的宽度（约 1 分米）" },
  { key: "m",  name: "米",   sym: "m",    uc: "var(--u-m)",  sub: "米是最常用的「中等长度」单位。", emoji: "🚪",
    rel: "1000 米 = 1 千米", example: "教室门的高度（约 2 米）" },
  { key: "km", name: "千米", sym: "km",   uc: "var(--u-km)", sub: "千米也叫「公里」，用来量很远的路。", emoji: "🏙️",
    rel: "1 千米 = 1000 米（1 公里）", example: "从学校走到家（约 1 千米）" },
];

// 三维缩放剧场：从 1 毫米 到 1 千米（含中间档）
// len = 物体在 3D 场景里的显示长度(px)；cam = 镜头缩放（小物体拉近、大物体拉远）；bar = 颜色
const SCENES = [
  { key: "mm",  label: "1 毫米",  meters: 0.001,   name: "蚂蚁的长度",   sub: "= 0.001 米",        len: 14,  cam: 3.0,  bar: "#f97316" },
  { key: "cm",  label: "1 厘米",  meters: 0.01,    name: "指甲的宽度",   sub: "= 0.01 米",         len: 30,  cam: 2.1,  bar: "#f59e0b" },
  { key: "dm",  label: "1 分米",  meters: 0.1,     name: "手掌的宽度",   sub: "= 0.1 米",          len: 72,  cam: 1.5,  bar: "#10b981" },
  { key: "m",   label: "1 米",    meters: 1,       name: "教室门的高度", sub: "= 1 米",            len: 180, cam: 1.05, bar: "#3b82f6" },
  { key: "10m", label: "10 米",   meters: 10,      name: "一棵大树",     sub: "= 10 米",           len: 320, cam: 0.92, bar: "#60a5fa" },
  { key: "100m",label: "100 米",  meters: 100,     name: "操场直道",     sub: "= 100 米",          len: 520, cam: 0.82, bar: "#6366f1" },
  { key: "km",  label: "1 千米",  meters: 1000,    name: "从学校走到家", sub: "= 1000 米（1 公里）", len: 820, cam: 0.72, bar: "#8b5cf6" },
];
const HUMAN_M = 1.7; // 参照小人：约 1.7 米
// 对数尺定位：log10(meters) 从 -3 到 3，映射到 0~100%
function axisPos(meters) {
  return ((Math.log10(meters) + 3) / 6) * 100;
}

/* ====================== 工具 ====================== */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
function fmt(v) {
  if (v === 0) return "0";
  if (!isFinite(v)) return "—";
  if (v >= 1) {
    const r = Math.round(v * 100) / 100;
    return r.toLocaleString("en-US");
  }
  return parseFloat(v.toPrecision(4)).toString();
}

/* ====================== ① 单位家族 ====================== */
function buildFamily() {
  const wrap = $("#family");
  UNITS.forEach((u, i) => {
    const item = el("div", "fam-item");
    item.style.setProperty("--uc", u.uc);

    const head = el("div", "fam-head");
    head.innerHTML = `
      <div class="fam-emoji">${u.emoji}</div>
      <div>
        <span class="fam-name">${u.name}</span><span class="fam-sym">${u.sym}</span>
      </div>
      <div class="fam-tag"><span class="fam-caret">▶</span></div>`;

    const body = el("div", "fam-body");
    const inner = el("div", "fam-body-inner");
    const detail = el("div", "fam-detail");
    detail.innerHTML = `
      <div>${u.sub}</div>
      <div class="rel">关系：${u.rel}</div>
      <div><span class="ex">${u.emoji} 例子：${u.example}</span></div>`;
    inner.appendChild(detail);
    body.appendChild(inner);

    head.addEventListener("click", () => {
      const open = item.classList.toggle("open");
      head.querySelector(".fam-caret").textContent = open ? "▼" : "▶";
    });

    item.appendChild(head);
    item.appendChild(body);
    wrap.appendChild(item);
  });
}

/* ====================== ② 长度阶梯对比图 ====================== */
function buildLadder() {
  const wrap = $("#ladder");
  UNITS.forEach((u) => {
    // 用 toMM 的对数：mm=1→0%, km=1e6→100%，给最小档一个最小可见宽度
    const pct = Math.max(6, (Math.log10(u.toMM) / 6) * 100);
    const row = el("div", "lad-row");
    row.style.setProperty("--uc", u.uc);
    row.innerHTML = `
      <div class="lad-label"><span class="lad-emoji">${u.emoji}</span>${u.name}</div>
      <div class="lad-track"><div class="lad-fill"><span class="lad-cap">${u.sym}</span></div></div>
      <div class="lad-note">${u.example}</div>`;
    row.addEventListener("click", () => {
      const idx = SCENES.findIndex((s) => s.key === u.key);
      if (idx >= 0) goToScene(idx);
      document.getElementById("stage").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    wrap.appendChild(row);
    // 入场动画
    requestAnimationFrame(() => { row.querySelector(".lad-fill").style.width = pct + "%"; });
  });
}

/* ====================== ③ 三维缩放剧场 ====================== */
let curScene = 0;
let playTimer = null;
// 物体相对「你」(1.7m) 的倍数说明
function relText(meters) {
  const n = meters / HUMAN_M;
  const base = n >= 1 ? "≈ " + Math.round(n).toLocaleString("en-US") + " 个你"
                      : "≈ " + parseFloat(n.toPrecision(2)).toString() + " 个你";
  return n < 0.1 ? base + "（极小）" : base;
}
function updateSceneContent(i) {
  const s = SCENES[i];
  const bar = $("#bar3d");
  const cam = $("#worldCam");
  bar.style.setProperty("--len", s.len + "px");
  bar.style.setProperty("--bar", s.bar);
  cam.style.setProperty("--cam", s.cam);
  $("#barCap").textContent = s.name;
  $("#bigNum").textContent = s.label;
  $("#subNum").textContent = s.sub;
  $("#rels").textContent = relText(s.meters);
  $("#axisDot").style.left = axisPos(s.meters) + "%";
  $("#stagePos").textContent = (i + 1) + " / " + SCENES.length;
  document.querySelectorAll(".axis-ticks span").forEach((sp) => {
    sp.classList.toggle("cur", Number(sp.dataset.i) === i);
  });
}
function goToScene(i) {
  i = Math.max(0, Math.min(SCENES.length - 1, i));
  if (i === curScene && playTimer == null) return;
  curScene = i;
  updateSceneContent(i);
}
function buildAxisTicks() {
  const wrap = $("#axisTicks");
  SCENES.forEach((s, i) => {
    const sp = el("span", null, s.label);
    sp.style.left = axisPos(s.meters) + "%";
    sp.dataset.i = i;
    wrap.appendChild(sp);
  });
}
function startPlay() {
  if (playTimer) { stopPlay(); return; }
  $("#playBtn").textContent = "⏸ 暂停";
  if (curScene >= SCENES.length - 1) { curScene = 0; updateSceneContent(0); }
  playTimer = setInterval(() => {
    if (curScene >= SCENES.length - 1) { stopPlay(); return; }
    goToScene(curScene + 1);
  }, 1800);
}
function stopPlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  $("#playBtn").textContent = "▶ 播放";
}

/* ====================== ④ 1 米尺拆一拆 ====================== */
let zoom = { level: "m", di: 0, ci: 0 };
function renderRuler() {
  const ruler = $("#ruler");
  const panel = $("#zoomPanel");
  ruler.innerHTML = "";
  panel.innerHTML = "";

  if (zoom.level === "m") {
    // 顶层：只引导去点上面的尺子
    const line = el("div", "zoom-line");
    line.innerHTML = "上面这一条就是 <b>1 米</b>，它被分成了 10 个 <b>1 分米</b>。点任意一块，看看里面有什么 👇";
    panel.appendChild(line);
  } else if (zoom.level === "dm") {
    const line = el("div", "zoom-line");
    line.innerHTML = `第 <b>${zoom.di}</b> 分米 = 10 个 <b>1 厘米</b>（它本来只是 1 米里的 1/10 哦），点任意一块 👇`;
    panel.appendChild(line);
    const grid = el("div", "zoom-grid");
    for (let n = 1; n <= 10; n++) {
      const b = el("div", "r-block");
      b.innerHTML = `第${n}个<span class="sub">1 厘米</span>`;
      b.addEventListener("click", () => { zoom = { level: "cm", di: zoom.di, ci: n }; renderRuler(); });
      grid.appendChild(b);
    }
    panel.appendChild(grid);
    panel.appendChild(breadcrumb());
  } else {
    const line = el("div", "zoom-line");
    line.innerHTML = `第 <b>${zoom.di}</b> 分米 第 <b>${zoom.ci}</b> 厘米 = <b>10 毫米</b>（最小单位啦！）`;
    panel.appendChild(line);
    const grid = el("div", "zoom-grid");
    for (let n = 1; n <= 10; n++) {
      const c = el("div", "zoom-cell mm", n + " 毫米");
      grid.appendChild(c);
    }
    panel.appendChild(grid);
    const hint = el("div", "zoom-hint", "👉 所以 1 米 = 10 分米 = 100 厘米 = 1000 毫米！");
    panel.appendChild(hint);
    panel.appendChild(breadcrumb());
  }

  // 顶部尺子随层级高亮
  if (zoom.level === "m") {
    for (let n = 1; n <= 10; n++) {
      const b = el("div", "r-block");
      b.innerHTML = `第${n}块<span class="sub">1 分米</span>`;
      b.addEventListener("click", () => { zoom = { level: "dm", di: n, ci: 0 }; renderRuler(); });
      ruler.appendChild(b);
    }
  } else if (zoom.level === "dm") {
    for (let n = 1; n <= 10; n++) {
      const b = el("div", "r-block" + (n === zoom.di ? " pick" : ""));
      b.style.outline = n === zoom.di ? "2px solid var(--accent)" : "";
      b.innerHTML = `第${n}块<span class="sub">1 分米</span>`;
      b.addEventListener("click", () => { zoom = { level: "dm", di: n, ci: 0 }; renderRuler(); });
      ruler.appendChild(b);
    }
  } else {
    for (let n = 1; n <= 10; n++) {
      const b = el("div", "r-block" + (n === zoom.di ? " pick" : ""));
      b.style.outline = n === zoom.di ? "2px solid var(--accent)" : "";
      b.innerHTML = `第${n}块<span class="sub">1 分米</span>`;
      b.addEventListener("click", () => { zoom = { level: "dm", di: n, ci: 0 }; renderRuler(); });
      ruler.appendChild(b);
    }
  }
}
function breadcrumb() {
  const bc = el("div", "zoom-hint");
  bc.style.marginTop = "12px";
  bc.innerHTML = "位置：1 米";
  if (zoom.level === "dm" || zoom.level === "cm") {
    const a = el("a", null, " › 第" + zoom.di + "分米");
    a.href = "javascript:void(0)";
    a.style.color = "var(--accent)";
    a.addEventListener("click", () => { zoom = { level: "dm", di: zoom.di, ci: 0 }; renderRuler(); });
    bc.appendChild(a);
  }
  if (zoom.level === "cm") {
    const a = el("a", null, " › 第" + zoom.ci + "厘米");
    a.href = "javascript:void(0)";
    a.style.color = "var(--accent)";
    a.addEventListener("click", () => { zoom = { level: "cm", di: zoom.di, ci: zoom.ci }; renderRuler(); });
    bc.appendChild(a);
  }
  return bc;
}

/* ====================== ⑤ 单位换算练习 ====================== */
function buildConvertSelect() {
  const sel = $("#convUnit");
  UNITS.forEach((u) => {
    const o = el("option", null, u.name + "（" + u.sym + "）");
    o.value = u.key;
    sel.appendChild(o);
  });
}
function runConvert() {
  const val = parseFloat($("#convVal").value);
  const unitKey = $("#convUnit").value;
  const out = $("#convertOut");
  out.innerHTML = "";
  if (!isFinite(val) || val < 0) {
    out.innerHTML = '<div class="hint">请输入一个不小于 0 的数字～</div>';
    return;
  }
  const baseUnit = UNITS.find((u) => u.key === unitKey);
  const mm = val * baseUnit.toMM;
  let maxLog = -Infinity;
  UNITS.forEach((u) => {
    const v = mm / u.toMM;
    if (v > 0) maxLog = Math.max(maxLog, Math.log10(v));
  });
  UNITS.forEach((u) => {
    const v = mm / u.toMM;
    const card = el("div", "conv-card");
    card.style.setProperty("--uc", u.uc);
    const w = v > 0 ? Math.max(4, (Math.log10(v) / 6) * 100) : 0;
    card.innerHTML = `
      <div class="cv-unit">${u.name}（${u.sym}）</div>
      <div class="cv-val">${fmt(v)}</div>
      <div class="cv-bar"><i></i></div>`;
    out.appendChild(card);
    const valEl = card.querySelector(".cv-val");
    const bar = card.querySelector(".cv-bar > i");
    requestAnimationFrame(() => {
      bar.style.width = w + "%";
      valEl.classList.add("bump");
      setTimeout(() => valEl.classList.remove("bump"), 400);
    });
  });
}
function randomConvert() {
  const i = Math.floor(Math.random() * UNITS.length);
  const v = 1 + Math.floor(Math.random() * 12);
  $("#convVal").value = v;
  $("#convUnit").value = UNITS[i].key;
  runConvert();
}

/* ====================== ⑥ 小测验 ====================== */
const QUIZ = [
  { q: "1 米等于多少厘米？", opts: ["10", "100", "1000"], ans: 1,
    ok: "答对啦！1 米 = 100 厘米。", bad: "应该是 100 厘米哦，1 米 = 100 厘米。" },
  { q: "1 千米等于多少米？", opts: ["100", "1000", "10000"], ans: 1,
    ok: "正确！1 千米就是 1 公里 = 1000 米。", bad: "记住：1 千米 = 1000 米（就是 1 公里）。" },
  { q: "10 毫米等于多少厘米？", opts: ["1", "10", "100"], ans: 0,
    ok: "对！10 毫米 = 1 厘米。", bad: "其实是 1 厘米，10 毫米才凑成 1 厘米。" },
  { q: "1 分米等于多少厘米？", opts: ["1", "10", "100"], ans: 1,
    ok: "正确！1 分米 = 10 厘米。", bad: "是 10 厘米，1 分米 = 10 厘米。" },
  { q: "下面哪个最长？", opts: ["1 毫米", "1 厘米", "1 米"], ans: 2,
    ok: "太棒了！米比厘米、毫米都大。", bad: "最长的是 1 米，米 > 厘米 > 毫米。" },
  { q: "一支铅笔的长大约是 18（ ）。", opts: ["毫米", "厘米", "米"], ans: 1,
    ok: "对！铅笔大约 18 厘米长。", bad: "填「厘米」最合适，18 毫米太短、18 米太长。" },
  { q: "两座城市相距很远，约 120（ ）。", opts: ["厘米", "分米", "千米"], ans: 2,
    ok: "正确！很远的路用千米（公里）。", bad: "很远的路要用「千米」，120 厘米才 1 米多。" },
];
let quizState = [];
function buildQuiz() {
  const wrap = $("#quiz");
  wrap.innerHTML = "";
  quizState = QUIZ.map(() => ({ done: false, correct: false }));
  QUIZ.forEach((item, qi) => {
    const box = el("div", "q-item");
    box.innerHTML = `<div class="q-text"><span class="q-num">${qi + 1}.</span>${item.q}</div>`;
    const opts = el("div", "q-opts");
    item.opts.forEach((txt, oi) => {
      const b = el("button", "q-opt", txt);
      b.type = "button";
      b.addEventListener("click", () => answer(qi, oi, box, b));
      opts.appendChild(b);
    });
    const feed = el("div", "q-feed");
    feed.id = "feed-" + qi;
    box.appendChild(opts);
    box.appendChild(feed);
    wrap.appendChild(box);
  });
  updateQuizScore();
}
function answer(qi, oi, box, btn) {
  if (quizState[qi].done) return;
  const item = QUIZ[qi];
  const correct = oi === item.ans;
  quizState[qi] = { done: true, correct };
  const opts = box.querySelectorAll(".q-opt");
  opts.forEach((b, i) => {
    b.disabled = true;
    if (i === item.ans) b.classList.add("correct");
    else if (i === oi) b.classList.add("wrong");
  });
  box.classList.add(correct ? "done-ok" : "done-bad");
  const feed = $("#feed-" + qi);
  feed.className = "q-feed " + (correct ? "ok" : "bad");
  feed.textContent = (correct ? "✅ " : "❌ ") + (correct ? item.ok : item.bad);
  updateQuizScore();
}
function updateQuizScore() {
  const done = quizState.filter((s) => s.done).length;
  const right = quizState.filter((s) => s.done && s.correct).length;
  const total = QUIZ.length;
  const scoreEl = $("#quizScore");
  if (done === 0) { scoreEl.textContent = "还没开始做"; return; }
  const stars = "⭐".repeat(right) + "☆".repeat(total - right);
  scoreEl.innerHTML = `已做 ${done}/${total} 题，答对 <b style="color:var(--ok)">${right}</b> 题　${stars}`;
}

/* ====================== 初始化 ====================== */
function init() {
  buildFamily();
  buildLadder();
  buildAxisTicks();
  updateSceneContent(0);

  $("#prevBtn").addEventListener("click", () => { stopPlay(); goToScene(curScene - 1); });
  $("#nextBtn").addEventListener("click", () => { stopPlay(); goToScene(curScene + 1); });
  $("#playBtn").addEventListener("click", startPlay);

  renderRuler();

  buildConvertSelect();
  $("#convGo").addEventListener("click", runConvert);
  $("#convRand").addEventListener("click", randomConvert);
  runConvert();

  buildQuiz();
  $("#quizReset").addEventListener("click", buildQuiz);
}

document.addEventListener("DOMContentLoaded", init);
