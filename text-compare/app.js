(function () {
  "use strict";

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var taA = $("taA"), taB = $("taB");
  var hlA = $("hlA"), hlB = $("hlB");
  var wrapA = $("wrapA"), wrapB = $("wrapB");
  var langEl = $("lang");
  var igwsEl = $("igws");
  var granSeg = $("granSeg");
  var statsEl = $("stats");

  var currentOps = [];
  var ignoreWs = false;

  // ============================================================
  // 语法高亮（零依赖，基于分词器）
  // ============================================================
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function R(cls, src) { return { cls: cls, re: new RegExp(src, "y") }; }

  var LANGS = {
    javascript: [
      R("comment", /\/\/.*|\/\*[\s\S]*?\*\//y),
      R("string", /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y),
      R("number", /\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y),
      R("keyword", /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|await|async|yield|try|catch|finally|throw|delete|void|null|undefined|true|false|import|export|from|default|static|get|set|public|private|protected|interface|type|enum|implements|as|namespace|declare)\b/y),
      R("builtin", /\b(?:console|window|document|Math|JSON|Object|Array|String|Number|Boolean|Promise|Map|Set|Symbol|RegExp|Date|parseInt|parseFloat|setTimeout|setInterval|require|module|process)\b/y),
      R("function", /[A-Za-z_$][\w$]*(?=\s*\()/y),
      R("ident", /[A-Za-z_$][\w$]*/y),
      R("punct", /[{}()\[\];,.]/y),
      R("operator", /[+\-*/%=<>!&|^~?:]+/y),
      R("space", /\s+/y)
    ],
    json: [
      R("punct", /[{}\[\],:]/y),
      R("string", /"(?:\\.|[^"\\])*"/y),
      R("number", /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y),
      R("keyword", /\b(?:true|false|null)\b/y),
      R("space", /\s+/y)
    ],
    html: [
      R("comment", /<!--[\s\S]*?-->/y),
      R("tag", /<\/?[A-Za-z][\w-]*/y),
      R("string", /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y),
      R("attr", /[A-Za-z_:][\w:.-]*(?=\s*=)/y),
      R("punct", /[<>\/=]/y),
      R("space", /\s+/y)
    ],
    css: [
      R("comment", /\/\*[\s\S]*?\*\//y),
      R("string", /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y),
      R("keyword", /@[\w-]+/y),
      R("attr", /[A-Za-z-]+(?=\s*:)/y),
      R("number", /-?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|pt)?\b/y),
      R("function", /[A-Za-z-]+(?=\()/y),
      R("punct", /[{}();:,]/y),
      R("operator", /[+\-*/]/y),
      R("space", /\s+/y),
      R("plain", /[#.&>*~+\[\]=^$|]/y)
    ],
    python: [
      R("comment", /#[^\n]*/y),
      R("string", /(?:[rRbBfF]{0,2})("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/y),
      R("keyword", /\b(?:def|class|return|if|elif|else|for|while|try|except|finally|with|as|import|from|pass|break|continue|raise|yield|lambda|global|nonlocal|assert|del|in|is|not|and|or|async|await|None|True|False|self)\b/y),
      R("builtin", /\b(?:print|len|range|open|int|str|float|list|dict|set|tuple|enumerate|zip|map|filter|super|type|isinstance)\b/y),
      R("number", /\b\d+(?:\.\d+)?\b/y),
      R("function", /[A-Za-z_]\w*(?=\s*\()/y),
      R("ident", /[A-Za-z_]\w*/y),
      R("operator", /[+\-*/%=<>!&|^~]+/y),
      R("punct", /[{}()\[\]:;,.]/y),
      R("space", /\s+/y)
    ],
    sql: [
      R("comment", /--[^\n]*|\/\*[\s\S]*?\*\//y),
      R("string", /'(?:''|[^'])*'|"(?:[^"])*"/y),
      R("keyword", /\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|ADD|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|ON|AND|OR|NOT|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|REPLACE|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|PRIMARY|FOREIGN|KEY|DEFAULT|INDEX|VIEW|FUNCTION|PROCEDURE|TRIGGER|BEGIN|COMMIT|ROLLBACK|COUNT|SUM|AVG|MIN|MAX)\b/iy),
      R("number", /\b\d+(?:\.\d+)?\b/y),
      R("function", /[A-Za-z_]\w*(?=\s*\()/y),
      R("ident", /[A-Za-z_]\w*/y),
      R("operator", /[+\-*/%=<>!|]+/y),
      R("punct", /[(),;.]/y),
      R("space", /\s+/y)
    ],
    xml: [
      R("comment", /<!--[\s\S]*?-->|<\?[\s\S]*?\?>/y),
      R("tag", /<[!\/]?[A-Za-z][\w:.-]*/y),
      R("string", /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y),
      R("attr", /[A-Za-z_:][\w:.-]*(?=\s*=)/y),
      R("punct", /[<>\/=]/y),
      R("space", /\s+/y)
    ],
    bash: [
      R("comment", /#[^\n]*/y),
      R("string", /"(?:\\.|[^"\\])*"|'[^']*'/y),
      R("keyword", /\b(?:if|then|else|elif|fi|for|in|do|done|while|case|esac|function|return|export|local|echo|cd|exit|source|set|unset|sudo|apt|npm|git|curl|wget)\b/y),
      R("variable", /\$\{?[A-Za-z_]\w*\}?/y),
      R("number", /\b\d+\b/y),
      R("function", /[A-Za-z_]\w*(?=\s*\()/y),
      R("ident", /[A-Za-z_][\w-]*/y),
      R("operator", /\|\||&&|>>|<<|[|&;<>]=?|\$\(/y),
      R("space", /\s+/y)
    ],
    markdown: [
      R("comment", /<!--[\s\S]*?-->/y),
      R("heading", /#{1,6}\s+[^\n]*/y),
      R("attr", /\[[^\]]*\]\([^)]*\)/y),
      R("string", /`[^`]*`/y),
      R("operator", /\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_/y),
      R("keyword", /^\s*>\s?[^\n]*/y),
      R("space", /\s+/y)
    ],
    plaintext: [
      R("space", /\s+/y)
    ]
  };

  function tokenize(text, rules) {
    var out = [];
    var pos = 0, n = text.length;
    while (pos < n) {
      var matched = false;
      for (var r = 0; r < rules.length; r++) {
        rules[r].re.lastIndex = pos;
        var m = rules[r].re.exec(text);
        if (m && m[0].length > 0) {
          out.push({ t: m[0], c: rules[r].cls });
          pos += m[0].length;
          matched = true;
          break;
        }
      }
      if (!matched) { out.push({ t: text[pos], c: null }); pos++; }
    }
    return out;
  }

  function highlightHTML(text, lang) {
    var rules = LANGS[lang] || LANGS.plaintext;
    var toks = tokenize(text, rules);
    var html = "";
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (tk.c && tk.c !== "space" && tk.c !== "plain") {
        html += '<span class="tk-' + tk.c + '">' + esc(tk.t) + "</span>";
      } else {
        html += esc(tk.t);
      }
    }
    return html || "​";
  }

  function detectLang(text) {
    var t = (text || "").trim();
    if (!t) return "plaintext";
    try { JSON.parse(t); return "json"; } catch (e) { /* 继续 */ }
    if (/^\s*([<\[]\/?[A-Za-z]|<\?xml|<!DOCTYPE)/.test(t)) {
      if (/^\s*<\?xml/i.test(t) || /^\s*<!DOCTYPE/i.test(t)) return "xml";
      return "html";
    }
    if (/\b(def|class|import|elif|self|print)\b/.test(t) && /:\s*$/m.test(t)) return "python";
    if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE)\b/i.test(t) && /\bFROM\b/i.test(t)) return "sql";
    if (/\b(function|const|let|var|=>|console\.|document\.)\b/.test(t)) return "javascript";
    if (/^\s*#!|\b(apt|npm|git|cd|export|sudo|curl|wget)\b/.test(t)) return "bash";
    if (/^#{1,6}\s|^\s*>\s|\[.+\]\(.+\)/.test(t)) return "markdown";
    if (/[{};]\s*$/m.test(t) && /\b(width|height|color|margin|padding|display)\s*:/.test(t)) return "css";
    return "plaintext";
  }

  // ============================================================
  // 差异算法（LCS）
  // ============================================================
  function normLine(s) { return ignoreWs ? s.replace(/\s+/g, " ").trim() : s; }

  function diffLines(a, b) {
    var n = a.length, m = b.length;
    if (n * m > 2500000) {
      var ops0 = [];
      for (var i = 0; i < n; i++) ops0.push({ t: "del", a: a[i] });
      for (var j = 0; j < m; j++) ops0.push({ t: "ins", b: b[j] });
      return { ops: ops0, big: true };
    }
    var dp = [];
    for (var x = 0; x <= n; x++) dp.push(new Int32Array(m + 1));
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        if (normLine(a[i]) === normLine(b[j])) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var ops = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (normLine(a[i]) === normLine(b[j])) { ops.push({ t: "eq", a: a[i], b: b[j] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "del", a: a[i] }); i++; }
      else { ops.push({ t: "ins", b: b[j] }); j++; }
    }
    while (i < n) ops.push({ t: "del", a: a[i++] });
    while (j < m) ops.push({ t: "ins", b: b[j++] });
    return { ops: ops, big: false };
  }

  // 分词：空白 / 字母数字串 / 单个其它字符。
  // 把 _ - . / , 等符号与中日韩文字都切成单字符，T_CUTTER_D46 与 TCUTTER_TOOL
  // 才能细化到 "_" 一级，而不是整块变红。
  function tokenizeWords(line) {
    var toks = [], m, re = /(\s+)|([A-Za-z0-9]+)|([\s\S])/g;
    while ((m = re.exec(line)) !== null) toks.push(m[0]);
    return toks;
  }

  function tokenSame(x, y) {
    if (ignoreWs && !x.trim() && !y.trim()) return true;
    return x === y;
  }

  // 通用 LCS，返回两侧的“是否命中公共子序列”标记
  function lcsMark(a, b) {
    var n = a.length, m = b.length, i, j;
    var ca = new Array(n), cb = new Array(m);
    if (n * m > 400000) { // 超长行直接整段标记，避免卡顿
      for (i = 0; i < n; i++) ca[i] = true;
      for (j = 0; j < m; j++) cb[j] = true;
      return { ca: ca, cb: cb };
    }
    var dp = [];
    for (i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        dp[i][j] = tokenSame(a[i], b[j]) ? dp[i + 1][j + 1] + 1
                                         : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    for (i = 0; i < n; i++) ca[i] = false;
    for (j = 0; j < m; j++) cb[j] = false;
    i = 0; j = 0;
    while (i < n && j < m) {
      if (tokenSame(a[i], b[j])) { ca[i] = true; cb[j] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return { ca: ca, cb: cb };
  }

  // 行内差异。selfText = 本侧这一行，partnerText = 对侧对应行，返回值 a 对应本侧、b 对应对侧。
  // - 词级：直接整行分词后做 LCS。因为 token 天然对齐，不需要裁前后缀；
  //   若先按字符裁前缀，会把 0.0000 / 0.000000 这类数字切成碎片，反而更难读。
  // - 字符级：先裁掉公共前后缀（把差异锚定在真正变化处，避免 LCS 散乱匹配），再逐字符 LCS。
  // 输出的 token 序列拼接后必须与原始行完全一致，否则高亮层会与输入框错位。
  function inlineDiff(selfText, partnerText, mode) {
    var p = 0, s = 0, n = selfText.length, m = partnerText.length;
    if (mode === "char") {
      while (p < n && p < m && selfText.charAt(p) === partnerText.charAt(p)) p++;
      while (s < n - p && s < m - p &&
             selfText.charAt(n - 1 - s) === partnerText.charAt(m - 1 - s)) s++;
    }
    var aMid = selfText.slice(p, n - s), bMid = partnerText.slice(p, m - s);
    var at = mode === "char" ? aMid.split("") : tokenizeWords(aMid);
    var bt = mode === "char" ? bMid.split("") : tokenizeWords(bMid);
    var mk = lcsMark(at, bt);

    var aOut = [], bOut = [], k;
    if (p > 0) {
      aOut.push({ t: selfText.slice(0, p), chg: false });
      bOut.push({ t: partnerText.slice(0, p), chg: false });
    }
    for (k = 0; k < at.length; k++) aOut.push({ t: at[k], chg: !mk.ca[k] });
    for (k = 0; k < bt.length; k++) bOut.push({ t: bt[k], chg: !mk.cb[k] });
    if (s > 0) {
      aOut.push({ t: selfText.slice(n - s), chg: false });
      bOut.push({ t: partnerText.slice(m - s), chg: false });
    }
    return { a: aOut, b: bOut };
  }

  function inlineHTML(tokens, cls) {
    var h = "";
    for (var k = 0; k < tokens.length; k++) {
      var tk = tokens[k], e = esc(tk.t);
      h += (tk.chg && tk.t.length) ? '<span class="' + cls + '">' + e + "</span>" : e;
    }
    return h || "​";
  }

  // 将 ops 拆分为两侧对齐的逐行列表：缺失侧补 blank 行，保证两侧行数相同、同一行横向对齐。
  // 注意：LCS 回溯会把一个变化块输出成「先若干删、再若干增」，若逐条就近配对会
  // 把 A 的第 3 行配到 B 的第 1 行。正确做法是按“变化块”切分，块内按出现顺序一一对应。
  function classify(ops) {
    var A = [], B = [], an = 0, bn = 0, i = 0;
    while (i < ops.length) {
      if (ops[i].t === "eq") {
        A.push({ text: ops[i].a, type: "eq", partner: null, num: ++an });
        B.push({ text: ops[i].b, type: "eq", partner: null, num: ++bn });
        i++;
        continue;
      }
      // 收集一个连续变化块
      var dels = [], inss = [];
      while (i < ops.length && ops[i].t !== "eq") {
        if (ops[i].t === "del") dels.push(ops[i].a);
        else inss.push(ops[i].b);
        i++;
      }
      var n = Math.max(dels.length, inss.length);
      for (var k = 0; k < n; k++) {
        var hasD = k < dels.length, hasI = k < inss.length;
        if (hasD && hasI) { // 块内第 k 行 → 替换
          A.push({ text: dels[k], type: "del", partner: inss[k], num: ++an });
          B.push({ text: inss[k], type: "ins", partner: dels[k], num: ++bn });
        } else if (hasD) {  // 多出来的删除行
          A.push({ text: dels[k], type: "del", partner: null, num: ++an });
          B.push({ text: "", type: "blank", partner: dels[k], num: null });
        } else {            // 多出来的新增行
          A.push({ text: "", type: "blank", partner: inss[k], num: null });
          B.push({ text: inss[k], type: "ins", partner: null, num: ++bn });
        }
      }
    }
    return { A: A, B: B };
  }

  // 渲染单侧的叠层 HTML（与另一侧对齐，blank 行为空占位行）
  // mode: "line" | "word" | "char"；非 line 时对“替换行”再做行内高亮
  function renderOverlay(lines, lang, mode) {
    var html = "";
    for (var i = 0; i < lines.length; i++) {
      var e = lines[i];
      var gut = '<span class="gut">' + (e.num == null ? "" : e.num) + "</span>";
      if (e.type === "blank") {
        // 镜像对侧文本（隐藏），使 blank 占位行获得与对侧内容相同的折行高度，保证后续行对齐
        var mirror = e.partner ? '<span class="blank-mirror">' + esc(e.partner) + '</span>' : '';
        html += '<div class="ln blank">' + gut + mirror + '</div>';
        continue;
      }
      var cls = e.type + (e.partner ? " rep" : "");
      var code;
      if (e.partner && mode !== "line") {
        // e.text 是本侧这一行，inlineDiff 的 .a 就是本侧，两侧都用 .a
        var d = inlineDiff(e.text, e.partner, mode);
        code = inlineHTML(d.a, e.type === "del" ? "wd-rem" : "wd-add");
      } else {
        code = highlightHTML(e.text, lang);
      }
      html += '<div class="ln ' + cls + '">' + gut + code + "</div>";
    }
    return html || '<div class="ln"></div>';
  }

  // ============================================================
  // 主流程（实时）
  // ============================================================
  function render() {
    var A = taA.value, B = taB.value;
    ignoreWs = igwsEl.checked;
    var lang = langEl.value === "auto" ? detectLang(A || B) : langEl.value;
    var mode = granSeg.querySelector(".seg-btn.on").getAttribute("data-gran");

    if (A === "" && B === "") {
      hlA.innerHTML = ""; hlB.innerHTML = "";
      statsEl.textContent = "";
      currentOps = [];
      fitHeights();
      return;
    }

    var aLines = A.split("\n"), bLines = B.split("\n");
    var res = diffLines(aLines, bLines);
    currentOps = res.ops;

    var sides = classify(res.ops);
    hlA.innerHTML = renderOverlay(sides.A, lang, mode);
    hlB.innerHTML = renderOverlay(sides.B, lang, mode);
    fitHeights();

    var added = 0, removed = 0, changed = 0;
    for (var k = 0; k < sides.A.length; k++) {
      var e = sides.A[k];
      if (e.type === "del") { if (e.partner) changed++; else removed++; }
      else if (e.type === "blank") added++; // A 侧占位行 = B 侧纯新增
    }
    statsEl.innerHTML =
      "A <b>" + aLines.length + "</b> 行 → B <b>" + bLines.length + "</b> 行 · " +
      "修改 <span class=\"st-chg\">" + changed + "</span> · " +
      "新增 <span class=\"st-add\">" + added + "</span> · " +
      "删除 <span class=\"st-del\">" + removed + "</span>" +
      (res.big ? ' · <span class="st-warn">文本过大，已简化对比</span>' : "");
  }

  // 文本框高度自适应：两侧等高，由内容（含对齐后的 blank 占位行）共同撑开，不使用内部滚动条
  function fitHeights() {
    // 先让外框按内容自然高度，以便准确测量 scrollHeight
    wrapA.style.height = "auto";
    wrapB.style.height = "auto";
    // box-sizing:border-box 下，height 是边框盒高度；scrollHeight 不含边框，需要补上
    var border = wrapA.offsetHeight - wrapA.clientHeight;
    var ha = taA.scrollHeight, hb = taB.scrollHeight;
    var hla = hlA.scrollHeight, hlb = hlB.scrollHeight;
    var h = Math.max(ha, hb, hla, hlb, 160);
    wrapA.style.height = (h + border) + "px";
    wrapB.style.height = (h + border) + "px";
  }

  function toDiffText() {
    var out = [];
    for (var i = 0; i < currentOps.length; i++) {
      var op = currentOps[i];
      if (op.t === "eq") out.push("  " + op.a);
      else if (op.t === "del") out.push("- " + op.a);
      else out.push("+ " + op.b);
    }
    return out.join("\n");
  }

  // ---------- 事件 ----------
  function bindSeg(seg) {
    seg.addEventListener("click", function (e) {
      var btn = e.target.closest(".seg-btn");
      if (!btn) return;
      var cur = seg.querySelector(".seg-btn.on");
      if (cur) cur.classList.remove("on");
      btn.classList.add("on");
      render();
    });
  }
  bindSeg(granSeg);

  langEl.addEventListener("change", render);
  igwsEl.addEventListener("change", render);

  var debounceTimer = null;
  function onInput() {
    fitHeights();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 200);
  }
  taA.addEventListener("input", onInput);
  taB.addEventListener("input", onInput);

  window.addEventListener("resize", fitHeights);

  // 复制 / 下载
  $("copyD").addEventListener("click", function () {
    var text = toDiffText();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {}, fallback);
    } else fallback();
  });
  $("downloadD").addEventListener("click", function () {
    var blob = new Blob([toDiffText()], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "diff.txt";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  });

  // 清空
  $("clearA").addEventListener("click", function () { taA.value = ""; render(); taA.focus(); });
  $("clearB").addEventListener("click", function () { taB.value = ""; render(); taB.focus(); });

  // 文件上传
  function bindFile(btnId, fileId, ta) {
    $(btnId).addEventListener("click", function () { $(fileId).click(); });
    $(fileId).addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { ta.value = reader.result; render(); };
      reader.readAsText(f);
      e.target.value = "";
    });
  }
  bindFile("loadA", "fileA", taA);
  bindFile("loadB", "fileB", taB);

  // 示例
  var SAMPLES = [
    {
      name: "JavaScript 函数",
      a: "function fetchUser(id) {\n  var xhr = new XMLHttpRequest();\n  xhr.open('GET', '/api/users/' + id);\n  xhr.onreadystatechange = function () {\n    if (xhr.readyState === 4) {\n      return xhr.responseText;\n    }\n  };\n  xhr.send();\n}",
      b: "async function fetchUser(id) {\n  const res = await fetch('/api/users/' + id);\n  if (!res.ok) {\n    throw new Error('请求失败: ' + res.status);\n  }\n  return res.json();\n}"
    },
    {
      name: "JSON 配置",
      a: "{\n  \"name\": \"worker\",\n  \"replicas\": 3,\n  \"features\": [\"cache\", \"retry\"],\n  \"timeout\": 30\n}",
      b: "{\n  \"name\": \"worker\",\n  \"replicas\": 5,\n  \"features\": [\"cache\", \"retry\", \"metrics\"],\n  \"timeout\": 45,\n  \"region\": \"ap-shanghai\"\n}"
    },
    {
      name: "NC 代码（刀具路径 / 仅局部不同）",
      a: "TOOL PATH/004-平面铣,TOOL,T_CUTTER_D46\nTLDATA/TCUTTER,46.0000,0.0000,0.0000,60.0000,20.0000,12.0000\nMSYS/-437.5000,0.0000,-61.0000,-1.0000000,0.0000000,0.0000000,0.0000000,1.0000000,0.0000000\n$$ centerline data",
      b: "TOOL PATH/PLANAR_MILL,TOOL,TCUTTER_TOOL\nTLDATA/TCUTTER_TOOL,46.0000,0.0000,0.0000,60.0000,20.0000,12.0000\nMSYS/-437.500000,0.000000,-61.000000,-1.000000,0.000000,0.000000,0.000000,1.000000,0.000000\n$$ centerline data"
    }
  ];
  var sampleMenu = $("sampleMenu");
  SAMPLES.forEach(function (s) {
    var item = document.createElement("button");
    item.type = "button";
    item.className = "dropdown-item";
    item.textContent = s.name;
    item.addEventListener("click", function () {
      taA.value = s.a; taB.value = s.b;
      sampleMenu.classList.remove("open");
      render();
    });
    sampleMenu.appendChild(item);
  });
  $("sampleBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    sampleMenu.classList.toggle("open");
  });
  document.addEventListener("click", function () { sampleMenu.classList.remove("open"); });

  // 初始渲染
  render();
})();
