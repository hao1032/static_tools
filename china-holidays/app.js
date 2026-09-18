(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var API = "https://timor.tech/api/holiday/year/";
  var WEEK = ["日", "一", "二", "三", "四", "五", "六"]; // index = getDay()
  var WEEKHEAD = (function () {
    var h = ["一", "二", "三", "四", "五", "六", "日"];
    return h.map(function (x, i) {
      return '<span' + (i >= 5 ? ' class="we"' : "") + ">" + x + "</span>";
    }).join("");
  })();

  var cache = {};                 // year -> { ok, map, empty, error }
  var today = new Date();
  var cy = today.getFullYear();
  var state = { year: cy, month: today.getMonth() + 1 };

  var cal3 = $("cal3"), summaryEl = $("summary");
  var listEl = $("list"), statusEl = null, monthsEl = $("months");

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function neighbor(y, m, delta) {
    var nm = m + delta, ny = y;
    if (nm < 1) { nm = 12; ny--; }
    if (nm > 12) { nm = 1; ny++; }
    return { y: ny, m: nm };
  }

  // ---------- 初始化 ----------
  function init() {
    buildMonths();
    statusEl = $("status");
    updateActive();
    loadAndRender();
  }

  // ---------- 导航（今天 + 年份合并为一个卡片） ----------
  function buildMonths() {
    var html = '<div class="months-group">';
    html += '<div class="mg-top"><div class="spacer"></div><span class="status" id="status"></span></div>';
    [cy, cy + 1].forEach(function (y) {
      var btns = "";
      for (var m = 1; m <= 12; m++) {
        btns += '<button type="button" class="mbtn" data-y="' + y + '" data-m="' + m + '">' + m + "月</button>";
      }
      html += '<div class="mg-row"><span class="mg-year">' + y + ' 年</span><div class="mg-btns">' + btns + "</div></div>";
    });
    html += "</div>";
    monthsEl.innerHTML = html;

    Array.prototype.forEach.call(monthsEl.querySelectorAll(".mbtn"), function (btn) {
      btn.addEventListener("click", function () {
        state.year = +btn.getAttribute("data-y");
        state.month = +btn.getAttribute("data-m");
        updateActive(); loadAndRender();
      });
    });
  }

  function updateActive() {
    Array.prototype.forEach.call(monthsEl.querySelectorAll(".mbtn"), function (btn) {
      var y = +btn.getAttribute("data-y");
      var m = +btn.getAttribute("data-m");
      var diff = (y - state.year) * 12 + (m - state.month);
      btn.classList.toggle("on", diff === 0);
      btn.classList.toggle("near", Math.abs(diff) === 1);
    });
  }

  // ---------- 数据加载（按年缓存） ----------
  // 主路径：timor.tech 实时接口；失败时用本地离线缓存兜底，保证始终可渲染。
  function loadYear(year) {
    if (cache[year]) return Promise.resolve(cache[year]);
    var entry = {};
    cache[year] = entry;
    return fetch(API + year, { headers: { "Accept": "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        if (d && d.code === 0 && d.holiday && Object.keys(d.holiday).length > 0) {
          entry.ok = true; entry.map = d.holiday; entry.empty = false; entry.live = true;
          return entry;
        }
        throw new Error("no_data"); // 接口正常但无数据，走本地兜底
      })
      .catch(function (e) {
        var fb = (window.HOLIDAY_FALLBACK && window.HOLIDAY_FALLBACK[String(year)]) || null;
        if (fb) {
          var norm = {};
          for (var k in fb) {
            var v = fb[k];
            norm[k] = { holiday: !!v.h, name: v.n, wage: v.w, target: v.t };
          }
          entry.ok = true; entry.map = norm; entry.empty = false; entry.fallback = true; entry.error = e.message;
        } else if (e.message === "no_data") {
          entry.ok = true; entry.map = {}; entry.empty = true;
        } else {
          entry.ok = false; entry.error = e.message || "网络错误";
        }
        return entry;
      });
  }

  function loadAndRender() {
    var prev = neighbor(state.year, state.month, -1);
    var next = neighbor(state.year, state.month, 1);
    if (statusEl) statusEl.textContent = "加载中…";
    Promise.all([loadYear(prev.y), loadYear(state.year), loadYear(next.y)]).then(render);
  }

  function mapOf(y) { var e = cache[y]; return (e && e.ok) ? e.map : {}; }

  // ---------- 单月渲染 ----------
  function monthHTML(y, m, map, role) {
    var first = new Date(y, m - 1, 1);
    var startOffset = (first.getDay() + 6) % 7; // 0 = 周一
    var dim = new Date(y, m, 0).getDate();

    var counts = { holiday: 0, legal: 0, makeup: 0, weekend: 0, workday: 0 };
    var blocks = [], cur = null, makeupList = [];
    var cells = "";
    for (var i = 0; i < startOffset; i++) cells += '<div class="cell empty"></div>';

    for (var d = 1; d <= dim; d++) {
      var key = pad(m) + "-" + pad(d);
      var info = map[key];
      var dow = new Date(y, m - 1, d).getDay();
      var c;
      if (info) {
        if (info.holiday === true) c = { kind: "holiday", name: info.name, wage: info.wage, legal: info.wage === 3 };
        else c = { kind: "makeup", name: info.name, target: info.target || "" };
      } else {
        c = (dow === 0 || dow === 6) ? { kind: "weekend" } : { kind: "workday" };
      }

      counts[c.kind] = (counts[c.kind] || 0) + 1;
      if (c.kind === "holiday" && c.legal) counts.legal++;

      if (c.kind === "holiday") {
        if (cur) { cur.end = d; cur.days++; }
        else { cur = { name: c.name, start: d, end: d, days: 1, legal: c.legal }; blocks.push(cur); }
      } else cur = null;
      if (c.kind === "makeup") makeupList.push({ d: d, dow: dow, name: c.name, target: c.target });

      var cls = "cell " + c.kind + (c.legal ? " legal" : "");
      var isToday = (d === today.getDate() && m === today.getMonth() + 1 && y === today.getFullYear());
      if (isToday) cls += " today";

      var inner = '<div class="d">' + d + "</div>";
      if (c.kind === "holiday") {
        inner += '<div class="name">' + esc(c.name) + "</div>";
        if (c.legal) inner += '<div class="badge legal">法定</div>';
      } else if (c.kind === "makeup") {
        inner += '<div class="name">' + esc(c.name) + "</div>";
        inner += '<div class="badge work">班</div>';
      } else if (c.kind === "weekend") {
        inner += '<div class="badge rest">休</div>';
      }
      cells += '<div class="' + cls + '">' + inner + "</div>";
    }

    var label = role === "prev" ? "上个月" : role === "next" ? "下个月" : "本月";
    return {
      html: '<div class="cal-month' + (role === "center" ? " center" : "") + '">' +
            '<div class="cm-title">' + label + " · " + y + "年" + m + "月</div>" +
            '<div class="cal-head">' + WEEKHEAD + "</div>" +
            '<div class="cal">' + cells + "</div></div>",
      counts: counts, blocks: blocks, makeupList: makeupList
    };
  }

  // ---------- 渲染三个月 ----------
  function render() {
    var prev = neighbor(state.year, state.month, -1);
    var next = neighbor(state.year, state.month, 1);
    var centerEntry = cache[state.year];

    if (!centerEntry || !centerEntry.ok) {
      statusEl.innerHTML = "加载失败：" + esc(centerEntry ? centerEntry.error : "未知错误") +
        ' · <a href="#" id="retry">重试</a>';
      var rt = $("retry");
      if (rt) rt.addEventListener("click", function (e) {
        e.preventDefault(); delete cache[state.year]; loadAndRender();
      });
    } else if (centerEntry.fallback) {
      statusEl.textContent = "（离线缓存数据，最新安排以接口为准）";
    } else if (centerEntry.empty) {
      statusEl.textContent = "该年数据尚未发布（仅按周末判断休息日）";
    } else {
      statusEl.textContent = "";
    }

    var p = monthHTML(prev.y, prev.m, mapOf(prev.y), "prev");
    var c = monthHTML(state.year, state.month, mapOf(state.year), "center");
    var n = monthHTML(next.y, next.m, mapOf(next.y), "next");
    cal3.innerHTML = p.html + c.html + n.html;

    renderSummary(c.counts, centerEntry);
    renderList(c.blocks, c.makeupList, state.month);
  }

  function renderSummary(counts, entry) {
    var hasData = entry && entry.ok && !entry.empty;
    var note = hasData ? "" : "（节假日数据未发布，仅按周末统计）";
    summaryEl.innerHTML =
      "本月共 <span class='num hl-legal'>" + counts.holiday + "</span> 天放假" +
      (counts.legal ? "（其中法定假日 <span class='num hl-legal'>" + counts.legal + "</span> 天）" : "") +
      "；调休上班 <span class='num hl-makeup'>" + counts.makeup + "</span> 天" +
      "；周末休息 <span class='num hl-rest'>" + counts.weekend + "</span> 天" +
      "；工作日 <span class='num'>" + counts.workday + "</span> 天。" + note;
  }

  function renderList(blocks, makeupList, m) {
    if (blocks.length === 0 && makeupList.length === 0) {
      listEl.innerHTML = '<h2>本月节假日与调休</h2><p class="empty-note">本月无节假日与调休安排。</p>';
      return;
    }
    var items = "";
    blocks.forEach(function (b) {
      var range = m + "月" + b.start + "日 – " + m + "月" + b.end + "日";
      var legalTag = b.legal ? '<span class="tag h">法定</span> ' : '<span class="tag h">放假</span> ';
      items += "<li>" + legalTag +
        '<span class="desc"><b>' + esc(b.name) + "</b>：" + range + "，共 " + b.days + " 天</span></li>";
    });
    makeupList.forEach(function (k) {
      items += "<li><span class='tag m'>补班</span>" +
        '<span class="date">' + m + "月" + k.d + "日（周" + WEEK[k.dow] + "）</span>" +
        '<span class="desc">' + esc(k.name) + (k.target ? "（" + esc(k.target) + "）" : "") + "</span></li>";
    });
    listEl.innerHTML = "<h2>本月节假日与调休</h2><ul>" + items + "</ul>";
  }

  init();
})();
