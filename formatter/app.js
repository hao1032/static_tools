(function () {
  "use strict";

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var inputEl = $("input");
  var outputEl = $("output");
  var typeEl = $("type");
  var indentEl = $("indent");
  var indentRow = $("indentRow");
  var statusEl = $("status");
  var mode = "format";

  // ---------- 工具函数 ----------
  function indentUnit() {
    var v = indentEl.value;
    return v === "tab" ? "\t" : new Array(parseInt(v, 10) + 1).join(" ");
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function detectType(text) {
    var t = text.trim();
    if (!t) return "json";
    // 先尝试 JSON
    try {
      JSON.parse(t);
      return "json";
    } catch (e) { /* 继续判断 */ }
    if (/^\s*<([a-zA-Z!?/])/.test(t) || t.indexOf("<") > -1 && t.indexOf(">") > -1) {
      // 含 xml 声明或单一根元素更像 xml
      if (/^\s*<\?xml/i.test(t)) return "xml";
      // 区分 html / xml：html 常见 doctype、<html|head|body|div|p|span|a 等
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
          if (c.nodeType === 3 && !c.textContent.replace(/\s+/g, "").length) continue; // 跳过纯空白
          children.push(c);
        }
        if (children.length === 0) {
          if (!isXml && VOID_HTML.has(tag)) return pad + "<" + tag + attrs + ">\n";
          if (isXml) return pad + "<" + tag + attrs + "/>\n";
          return pad + "<" + tag + attrs + "></" + tag + ">\n";
        }
        // 仅含单个文本节点 -> 行内
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

  // ---------- 压缩（基于原始文本，保留结构）----------
  function minifyMarkup(text) {
    return text
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/>\s+</g, "><")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // ---------- 主流程 ----------
  function runFormat() {
    var src = inputEl.value;
    if (!src.trim()) { setStatus("请输入要格式化的内容。", ""); return; }

    var type = typeEl.value === "auto" ? detectType(src) : typeEl.value;
    var minify = mode === "minify";

    try {
      var result = "";
      if (type === "json") {
        result = formatJSON(src, minify);
      } else if (type === "html") {
        result = formatHtml(src, minify);
      } else if (type === "xml") {
        result = formatXml(src, minify);
      }
      outputEl.value = result;
      var label = (minify ? "压缩" : "格式化") + "成功 · " + type.toUpperCase();
      setStatus(label + " · " + result.length + " 字符", "ok");
    } catch (e) {
      outputEl.value = "";
      setStatus("错误：" + e.message, "err");
    }
  }

  // ---------- 事件绑定 ----------
  typeEl.addEventListener("change", function () {
    indentRow.style.display = typeEl.value === "json" || typeEl.value === "auto" ? "" : "";
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

  $("format").addEventListener("click", runFormat);
  $("clear").addEventListener("click", function () {
    inputEl.value = ""; outputEl.value = ""; setStatus("", "");
  });
  $("copy").addEventListener("click", function () {
    if (!outputEl.value) return;
    outputEl.select();
    navigator.clipboard.writeText(outputEl.value).then(function () {
      setStatus("已复制到剪贴板", "ok");
    }).catch(function () {
      document.execCommand("copy");
      setStatus("已复制到剪贴板", "ok");
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
  $("sample").addEventListener("click", function () {
    inputEl.value = '{"name":"静态工具箱","tools":[{"id":1,"title":"ICO生成器"},{"id":2,"title":"格式化工具"}],"ok":true,"count":2}';
    typeEl.value = "auto";
    runFormat();
  });
})();
