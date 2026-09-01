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

  function tokenizeWords(line) {
    var toks = [], m, re = /(\s+)|([A-Za-z0-9_]+)|([^\sA-Za-z0-9_]+)/g;
    while ((m = re.exec(line)) !== null) toks.push(m[0]);
    return toks;
  }

  function diffWords(A, B) {
    var a = tokenizeWords(A), b = tokenizeWords(B);
    var eq = function (x, y) {
      if (ignoreWs) return x.trim() === y.trim() && /\S/.test(x);
      return x === y;
    };
    if (a.length * b.length > 2500000) {
      return {
        a: a.map(function (t) { return { t: t, rem: true }; }),
        b: b.map(function (t) { return { t: t, add: true }; })
      };
    }
    var n = a.length, m = b.length;
    var dp = [];
    for (var x = 0; x <= n; x++) dp.push(new Int32Array(m + 1));
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        if (eq(a[i], b[j])) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var ca = new Array(n).fill(false), cb = new Array(m).fill(false);
    i = 0; j = 0;
    while (i < n && j < m) {
      if (eq(a[i], b[j])) { ca[i] = true; cb[j] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return {
      a: a.map(function (t, idx) { return { t: t, rem: !ca[idx] }; }),
      b: b.map(function (t, idx) { return { t: t, add: !cb[idx] }; })
    };
  }

  function wordHTML(tokens, isIns) {
    var h = "";
    for (var k = 0; k < tokens.length; k++) {
      var tk = tokens[k];
      var e = esc(tk.t);
      if (isIns) h += tk.add ? '<span class="wd-add">' + e + "</span>" : e;
      else h += tk.rem ? '<span class="wd-rem">' + e + "</span>" : e;
    }
    return h || "​";
  }

  // 将 ops 拆分为两侧对齐的逐行列表：缺失侧补 blank 行，保证两侧行数相同、同一行横向对齐
  function classify(ops) {
    var A = [], B = [];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.t === "eq") {
        A.push({ text: op.a, type: "eq", partner: null });
        B.push({ text: op.b, type: "eq", partner: null });
      } else if (op.t === "del") {
        // 如果下一条是 ins，则把 del/ins 配成一对“替换”行
        if (i + 1 < ops.length && ops[i + 1].t === "ins") {
          var next = ops[i + 1];
          A.push({ text: op.a, type: "del", partner: next.b });
          B.push({ text: next.b, type: "ins", partner: op.a });
          i++;
        } else {
          A.push({ text: op.a, type: "del", partner: null });
          B.push({ text: "", type: "blank", partner: op.a });
        }
      } else { // ins（未与上一条 del 配对的情况）
        A.push({ text: "", type: "blank", partner: op.b });
        B.push({ text: op.b, type: "ins", partner: null });
      }
    }
    return { A: A, B: B };
  }

  // 渲染单侧的叠层 HTML（与另一侧对齐，blank 行为空占位行）
  function renderOverlay(lines, lang, wordMode) {
    var html = "";
    for (var i = 0; i < lines.length; i++) {
      var e = lines[i];
      if (e.type === "blank") {
        // 镜像对侧文本（隐藏），使 blank 占位行获得与对侧内容相同的折行高度，保证后续行对齐
        var mirror = e.partner ? '<span class="blank-mirror">' + esc(e.partner) + '</span>' : '';
        html += '<div class="ln blank">' + mirror + '</div>';
        continue;
      }
      var cls = e.type; // eq | del | ins
      var code;
      if (wordMode && e.partner) {
        var dw = diffWords(e.text, e.partner);
        code = e.type === "del" ? wordHTML(dw.a, false) : wordHTML(dw.b, true);
      } else if (wordMode) {
        code = e.type === "del" ? '<span class="wd-rem">' + esc(e.text) + "</span>"
             : e.type === "ins" ? '<span class="wd-add">' + esc(e.text) + "</span>" : esc(e.text);
      } else {
        code = highlightHTML(e.text, lang);
      }
      html += '<div class="ln ' + cls + '">' + code + "</div>";
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
    var wordMode = granSeg.querySelector(".seg-btn.on").getAttribute("data-gran") === "word";

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
    hlA.innerHTML = renderOverlay(sides.A, lang, wordMode);
    hlB.innerHTML = renderOverlay(sides.B, lang, wordMode);
    fitHeights();

    var added = 0, removed = 0;
    for (var i = 0; i < res.ops.length; i++) {
      if (res.ops[i].t === "ins") added++;
      else if (res.ops[i].t === "del") removed++;
    }
    statsEl.innerHTML =
      "A <b>" + aLines.length + "</b> 行 → B <b>" + bLines.length + "</b> 行 · " +
      "新增 <span class=\"st-add\">" + added + "</span> · 删除 <span class=\"st-del\">" + removed + "</span>" +
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
