(function () {
  "use strict";

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var inputEl = $("input");
  var outputEl = $("output");
  var treeEl = $("tree");
  var typeEl = $("type");
  var indentEl = $("indent");
  var indentRow = $("indentRow");
  var statusEl = $("status");
  var mode = "format";
  var view = "tree";

  // ---------- 工具函数 ----------
  function indentUnit() {
    var v = indentEl.value;
    return v === "tab" ? "\t" : new Array(parseInt(v, 10) + 1).join(" ");
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function detectType(text) {
    var t = text.trim();
    if (!t) return "json";
    try {
      JSON.parse(t);
      return "json";
    } catch (e) { /* 继续判断 */ }
    if (/^\s*<([a-zA-Z!?/])/.test(t) || (t.indexOf("<") > -1 && t.indexOf(">") > -1)) {
      if (/^\s*<\?xml/i.test(t)) return "xml";
      if (/^\s*<!DOCTYPE/i.test(t) || /<(html|head|body|div|span|p|a|ul|li|table|tr|td|img|br|script|style)\b/i.test(t)) {
        return "html";
      }
      return "xml";
    }
    return "json";
  }

  // ---------- JSON ----------
  function formatJSON(text, minify) {
    var obj = JSON.parse(text);
    return minify ? JSON.stringify(obj) : JSON.stringify(obj, null, indentUnit());
  }

  // ---------- 通用 DOM 序列化（HTML / XML）----------
  var VOID_HTML = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"
  ]);

  function escapeText(t, isXml) {
    if (isXml) {
      return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    return t;
  }

  function serializeAttrs(node) {
    var s = "";
    for (var i = 0; i < node.attributes.length; i++) {
      var a = node.attributes[i];
      s += " " + a.name + '="' + String(a.value).replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"';
    }
    return s;
  }

  function serializeNode(node, depth, unit, isXml) {
    var pad = unit.repeat(depth);
    switch (node.nodeType) {
      case Node.ELEMENT_NODE: {
        var tag = node.tagName.toLowerCase();
        var attrs = serializeAttrs(node);
        var children = [];
        for (var i = 0; i < node.childNodes.length; i++) {
          var c = node.childNodes[i];
          if (c.nodeType === 3 && !c.textContent.replace(/\s+/g, "").length) continue;
          children.push(c);
        }
        if (children.length === 0) {
          if (!isXml && VOID_HTML.has(tag)) return pad + "<" + tag + attrs + ">\n";
          if (isXml) return pad + "<" + tag + attrs + "/>\n";
          return pad + "<" + tag + attrs + "></" + tag + ">\n";
        }
        if (children.length === 1 && children[0].nodeType === 3) {
          return pad + "<" + tag + attrs + ">" + escapeText(children[0].textContent.trim(), isXml) + "</" + tag + ">\n";
        }
        var open = pad + "<" + tag + attrs + ">";
        var close = "</" + tag + ">";
        var body = "";
        for (var j = 0; j < children.length; j++) {
          body += serializeNode(children[j], depth + 1, unit, isXml);
        }
        return open + "\n" + body + pad + close + "\n";
      }
      case Node.TEXT_NODE: {
        var txt = node.textContent.replace(/\s+/g, " ").trim();
        if (!txt) return "";
        return pad + escapeText(txt, isXml) + "\n";
      }
      case Node.COMMENT_NODE:
        return pad + "<!--" + node.nodeValue + "-->\n";
      case Node.CDATA_SECTION_NODE:
        return pad + "<![CDATA[" + node.nodeValue + "]]>\n";
      case Node.PROCESSING_INSTRUCTION_NODE:
        return pad + "<?" + node.nodeName + " " + node.nodeValue + "?>\n";
      default:
        return "";
    }
  }

  function formatHtml(text, minify) {
    var doc = new DOMParser().parseFromString(text, "text/html");
    var isFullDoc = /<html[\s>]/i.test(text.trim()) || /^<!DOCTYPE/i.test(text.trim());
    var container = isFullDoc ? doc.documentElement : doc.body;
    if (minify) return minifyMarkup(text);
    var out = "";
    if (doc.doctype && isFullDoc) out += "<!DOCTYPE " + doc.doctype.name + ">\n";
    for (var i = 0; i < container.childNodes.length; i++) {
      out += serializeNode(container.childNodes[i], 0, indentUnit(), false);
    }
    return out.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function formatXml(text, minify) {
    var doc = new DOMParser().parseFromString(text, "application/xml");
    var err = doc.getElementsByTagName("parsererror");
    if (err && err.length) throw new Error("XML 解析失败：" + err[0].textContent.split("\n")[0]);
    if (minify) return minifyMarkup(text);
    var out = "";
    if (doc.doctype) out += "<!DOCTYPE " + doc.doctype.name + ">\n";
    for (var i = 0; i < doc.childNodes.length; i++) {
      var n = doc.childNodes[i];
      if (n.nodeType === Node.DOCUMENT_TYPE_NODE) continue;
      out += serializeNode(n, 0, indentUnit(), true);
    }
    return out.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function minifyMarkup(text) {
    return text
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/>\s+</g, "><")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // ---------- 树模型构建 ----------
  function jsonToTree(value, name) {
    if (value === null) return { kind: "primitive", name: name, text: "null", type: "null" };
    var t = typeof value;
    if (t === "object") {
      if (Array.isArray(value)) {
        var arr = [];
        for (var i = 0; i < value.length; i++) arr.push(jsonToTree(value[i], i));
        return { kind: "array", name: name, children: arr };
      }
      var keys = Object.keys(value);
      var obj = [];
      for (var k = 0; k < keys.length; k++) obj.push(jsonToTree(value[keys[k]], keys[k]));
      return { kind: "object", name: name, children: obj };
    }
    var txt = (t === "string") ? '"' + value + '"' : String(value);
    return { kind: "primitive", name: name, text: txt, type: t };
  }

  function domToTree(node) {
    if (node.nodeType === 3) {
      var txt = node.textContent.replace(/\s+/g, " ").trim();
      if (!txt) return null;
      return { kind: "text", text: txt };
    }
    if (node.nodeType === 8) return { kind: "comment", text: node.nodeValue };
    if (node.nodeType === 4) return { kind: "cdata", text: node.nodeValue };
    if (node.nodeType === 7) return { kind: "pi", text: "<?" + node.nodeName + " " + node.nodeValue + "?>" };
    if (node.nodeType === 1) {
      var tag = node.tagName.toLowerCase();
      var attrs = [];
      for (var i = 0; i < node.attributes.length; i++) {
        attrs.push(node.attributes[i].name + '="' + node.attributes[i].value + '"');
      }
      var children = [];
      for (var j = 0; j < node.childNodes.length; j++) {
        var c = domToTree(node.childNodes[j]);
        if (c) children.push(c);
      }
      return { kind: "element", tag: tag, attrs: attrs, children: children };
    }
    return null;
  }

  function buildModel(type, src) {
    if (type === "json") {
      return jsonToTree(JSON.parse(src), null);
    }
    if (type === "html") {
      var doc = new DOMParser().parseFromString(src, "text/html");
      var isFullDoc = /<html[\s>]/i.test(src.trim()) || /^<!DOCTYPE/i.test(src.trim());
      var container = isFullDoc ? doc.documentElement : doc.body;
      var model = [];
      for (var i = 0; i < container.childNodes.length; i++) {
        var n = domToTree(container.childNodes[i]);
        if (n) model.push(n);
      }
      return model;
    }
    // xml
    var xdoc = new DOMParser().parseFromString(src, "application/xml");
    var xerr = xdoc.getElementsByTagName("parsererror");
    if (xerr && xerr.length) throw new Error("XML 解析失败：" + xerr[0].textContent.split("\n")[0]);
    var xmodel = [];
    for (var j = 0; j < xdoc.childNodes.length; j++) {
      if (xdoc.childNodes[j].nodeType === 10) continue;
      var x = domToTree(xdoc.childNodes[j]);
      if (x) xmodel.push(x);
    }
    return xmodel;
  }

  // ---------- 树渲染（可折叠）----------
  function renderNode(node) {
    var wrap = document.createElement("div");
    wrap.className = "tree-node";

    var row = document.createElement("div");
    row.className = "tree-row";

    var toggle = document.createElement("span");
    toggle.className = "tree-toggle";

    var label = document.createElement("span");
    label.className = "tree-label";

    var hasChildren = !!(node.children && node.children.length);

    if (node.kind === "element") {
      var attrStr = node.attrs.length ? " " + node.attrs.join(" ") : "";
      label.innerHTML =
        '<span class="tree-punc">&lt;</span><span class="tree-tag">' + esc(node.tag) + "</span>" +
        (attrStr ? ' <span class="tree-attr">' + esc(attrStr.trim()) + "</span>" : "") +
        '<span class="tree-punc">&gt;</span>';
    } else if (node.kind === "text") {
      label.innerHTML = '<span class="tree-text">' + esc(node.text) + "</span>";
    } else if (node.kind === "comment") {
      label.innerHTML = '<span class="tree-comment">&lt;!--' + esc(node.text) + "--&gt;</span>";
    } else if (node.kind === "cdata") {
      label.innerHTML = '<span class="tree-comment">&lt;![CDATA[' + esc(node.text) + "]]&gt;</span>";
    } else if (node.kind === "pi") {
      label.innerHTML = '<span class="tree-comment">' + esc(node.text) + "</span>";
    } else if (node.kind === "object" || node.kind === "array") {
      var open = node.kind === "object" ? "{" : "[";
      var close = node.kind === "object" ? "}" : "]";
      var nameHtml = (node.name !== undefined && node.name !== null)
        ? '<span class="tree-key">' + esc(String(node.name)) + "</span>: " : "";
      label.innerHTML = nameHtml +
        '<span class="tree-bracket">' + open + "</span> " +
        '<span class="tree-count">' + node.children.length + (node.kind === "object" ? " 个键" : " 项") + "</span> " +
        '<span class="tree-bracket">' + close + "</span>";
    } else if (node.kind === "primitive") {
      var vclass = "tree-value " + (node.type === "string" ? "string" : node.type === "number" ? "number" : node.type === "boolean" ? "boolean" : "null");
      var nm = (node.name !== undefined && node.name !== null)
        ? '<span class="tree-key">' + esc(String(node.name)) + "</span>: " : "";
      label.innerHTML = nm + '<span class="' + vclass + '">' + esc(node.text) + "</span>";
    }

    row.appendChild(toggle);
    row.appendChild(label);
    wrap.appendChild(row);

    if (hasChildren) {
      toggle.textContent = "▾";
      var kids = document.createElement("div");
      kids.className = "tree-children";
      for (var i = 0; i < node.children.length; i++) {
        var childEl = renderNode(node.children[i]);
        if (childEl) kids.appendChild(childEl);
      }
      wrap.appendChild(kids);
      var toggleFn = function (e) {
        if (e) e.stopPropagation();
        var collapsed = kids.style.display === "none";
        kids.style.display = collapsed ? "" : "none";
        toggle.textContent = collapsed ? "▾" : "▸";
      };
      toggle.addEventListener("click", toggleFn);
      row.addEventListener("click", toggleFn);
    }

    return wrap;
  }

  function renderTree(type, src) {
    treeEl.innerHTML = "";
    try {
      var model = buildModel(type, src);
      if (!model || (Array.isArray(model) && !model.length)) {
        treeEl.innerHTML = '<div class="tree-empty">无内容</div>';
        return;
      }
      if (!Array.isArray(model)) model = [model];
      for (var i = 0; i < model.length; i++) {
        treeEl.appendChild(renderNode(model[i]));
      }
    } catch (e) {
      treeEl.innerHTML = '<div class="tree-empty">无法生成树视图：' + esc(e.message) + "</div>";
    }
  }

  function applyView() {
    var showTree = view === "tree";
    treeEl.style.display = showTree ? "" : "none";
    outputEl.style.display = showTree ? "none" : "";
  }

  // ---------- 主流程 ----------
  function runFormat() {
    var src = inputEl.value;
    if (!src.trim()) { setStatus("请输入要格式化的内容。", ""); return; }

    var type = typeEl.value === "auto" ? detectType(src) : typeEl.value;
    var minify = mode === "minify";

    try {
      var result = "";
      if (type === "json") result = formatJSON(src, minify);
      else if (type === "html") result = formatHtml(src, minify);
      else if (type === "xml") result = formatXml(src, minify);
      outputEl.value = result;
      renderTree(type, src);
      var label = (minify ? "压缩" : "格式化") + "成功 · " + type.toUpperCase();
      setStatus(label + " · " + result.length + " 字符", "ok");
    } catch (e) {
      outputEl.value = "";
      treeEl.innerHTML = "";
      setStatus("错误：" + e.message, "err");
    }
  }

  // ---------- 事件绑定 ----------
  typeEl.addEventListener("change", function () {
    indentRow.style.display = "";
  });
  indentEl.addEventListener("change", function () { if (outputEl.value) runFormat(); });

  var segBtns = document.querySelectorAll("#modeSeg .seg-btn");
  Array.prototype.forEach.call(segBtns, function (btn) {
    btn.addEventListener("click", function () {
      Array.prototype.forEach.call(segBtns, function (b) { b.classList.remove("on"); });
      btn.classList.add("on");
      mode = btn.getAttribute("data-mode");
      if (outputEl.value) runFormat();
    });
  });

  var viewBtns = document.querySelectorAll("#viewSeg .seg-btn");
  Array.prototype.forEach.call(viewBtns, function (btn) {
    btn.addEventListener("click", function () {
      Array.prototype.forEach.call(viewBtns, function (b) { b.classList.remove("on"); });
      btn.classList.add("on");
      view = btn.getAttribute("data-view");
      applyView();
    });
  });

  $("format").addEventListener("click", runFormat);
  $("clear").addEventListener("click", function () {
    inputEl.value = ""; outputEl.value = ""; treeEl.innerHTML = ""; setStatus("", "");
  });
  $("copy").addEventListener("click", function () {
    if (!outputEl.value) return;
    outputEl.style.display = "";
    outputEl.select();
    var done = function () { setStatus("已复制到剪贴板", "ok"); applyView(); };
    navigator.clipboard.writeText(outputEl.value).then(done).catch(function () {
      document.execCommand("copy");
      done();
    });
  });
  $("download").addEventListener("click", function () {
    if (!outputEl.value) { setStatus("没有可导出的内容。", "err"); return; }
    var type = typeEl.value === "auto" ? detectType(inputEl.value) : typeEl.value;
    var ext = type === "json" ? "json" : type === "html" ? "html" : "xml";
    var blob = new Blob([outputEl.value], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "formatted." + ext;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  });
  // ---------- 示例（可切换多个实例）----------
  var SAMPLES = [
    {
      label: "JSON 示例",
      code: '{"name":"静态工具箱","tools":[{"id":1,"title":"ICO生成器"},{"id":2,"title":"格式化工具"}],"ok":true,"count":2}'
    },
    {
      label: "HTML 示例",
      code: '<!DOCTYPE html><html><head><title>示例</title></head><body><div class="card"><h2>标题</h2><p>这是一段<strong>加粗</strong>文字。</p><ul><li>项目一</li><li>项目二</li></ul></div></body></html>'
    },
    {
      label: "XML 示例",
      code: '<?xml version="1.0" encoding="UTF-8"?><note id="1"><to>张三</to><from>李四</from><body>会议改到下午三点</body><items><item>笔记本</item><item>水杯</item></items></note>'
    }
  ];

  var sampleMenu = $("sampleMenu");
  SAMPLES.forEach(function (s, i) {
    var item = document.createElement("button");
    item.type = "button";
    item.className = "dropdown-item";
    item.textContent = s.label;
    item.addEventListener("click", function (ev) {
      ev.stopPropagation();
      inputEl.value = s.code;
      typeEl.value = "auto";
      sampleMenu.classList.remove("open");
      runFormat();
    });
    sampleMenu.appendChild(item);
  });

  var sampleBtn = $("sample");
  sampleBtn.addEventListener("click", function (ev) {
    ev.stopPropagation();
    sampleMenu.classList.toggle("open");
  });
  document.addEventListener("click", function () {
    sampleMenu.classList.remove("open");
  });

  // 初始默认树视图
  applyView();
})();
