/*!
 * version-check.js — 静态站点「有新版本」提示
 *
 * 解决什么问题
 *   用户把页面一直开着（手机、微信内置浏览器尤其明显），push 上线后他们不会主动刷新，
 *   表现出来就是「改了但没生效」。页脚写死版本号也没用，因为没人会去看。
 *
 * 怎么做的
 *   本站没有构建步骤、文件名也不带 hash，没法在 HTML 里注入构建号，
 *   所以直接拿「当前 URL 的响应头指纹」（ETag / Last-Modified / Content-Length）
 *   当版本号用。页面加载时记一份基线，之后在这几个时机各比对一次：
 *     · 页面从后台切回前台（visibilitychange）
 *     · 窗口重新获得焦点（focus）
 *     · 前台每 5 分钟轮询一次
 *   一旦线上指纹变了，就在右下角浮出「站点已更新 · 刷新看看」。
 *
 *   零依赖、零配置、零维护。取不到指纹（离线、file:// 打开）时静默失效，不打扰用户。
 *
 * 用法
 *   在每个页面的 </head> 前加一行：
 *     <script src="/version-check.js" defer></script>
 */
(function () {
  'use strict';

  // 本地双击打开时没有响应头可读，直接跳过
  if (location.protocol === 'file:') return;

  var POLL_MS = 5 * 60 * 1000; // 前台定期复查间隔
  var STYLE_ID = 'vc-style';

  var baseline = null; // 本次加载时的线上版本指纹
  var notified = null; // 已经提示过的指纹，避免同一版本反复弹
  var host = null;     // 提示条节点

  /* ---------------- 版本指纹 ---------------- */
  function fingerprint() {
    return fetch(location.href, {
      method: 'HEAD',
      cache: 'no-store', // 绕开 HTTP 缓存，确保读到线上真实响应
      credentials: 'same-origin'
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var h = res.headers;
      var fp = [h.get('etag'), h.get('last-modified'), h.get('content-length')]
        .filter(Boolean)
        .join(' | ');
      if (!fp) throw new Error('响应里没有可用的版本指纹');
      return fp;
    });
  }

  function check() {
    if (document.hidden || !baseline) return;
    fingerprint()
      .then(function (fp) {
        if (fp !== baseline && fp !== notified) {
          notified = fp;
          show();
        }
      })
      .catch(function () {
        /* 离线或取不到指纹：静默跳过 */
      });
  }

  /* ---------------- 提示条 ---------------- */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.vc-toast{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;',
      'align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:10px 12px 10px 14px;',
      'background:#fff;border:1px solid #dbe5fb;border-radius:12px;',
      'box-shadow:0 10px 28px rgba(16,24,40,.16);color:#1f2937;',
      'font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",',
      '"Hiragino Sans GB","Microsoft YaHei",sans-serif;animation:vc-in .2s ease-out}',
      '.vc-toast .vc-txt{white-space:nowrap}',
      '.vc-toast .vc-go{flex-shrink:0;padding:6px 12px;border:0;border-radius:8px;',
      'background:#2563eb;color:#fff;font:inherit;font-size:13px;cursor:pointer}',
      '.vc-toast .vc-go:hover{background:#1d4ed8}',
      '.vc-toast .vc-x{flex-shrink:0;width:24px;height:24px;padding:0;border:0;',
      'background:transparent;color:#9aa3b2;font-size:16px;line-height:1;cursor:pointer}',
      '.vc-toast .vc-x:hover{color:#6b7280}',
      '@keyframes vc-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion:reduce){.vc-toast{animation:none}}'
    ].join('');
    document.head.appendChild(s);
  }

  function show() {
    if (host) return;
    injectStyle();

    host = document.createElement('div');
    host.className = 'vc-toast';
    host.setAttribute('role', 'status');

    var txt = document.createElement('span');
    txt.className = 'vc-txt';
    txt.textContent = '站点已更新';

    var go = document.createElement('button');
    go.type = 'button';
    go.className = 'vc-go';
    go.textContent = '刷新看看';
    go.addEventListener('click', reload);

    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'vc-x';
    x.setAttribute('aria-label', '关闭');
    x.textContent = '×';
    x.addEventListener('click', function () {
      host.remove();
      host = null; // 同一版本不再重复打扰；之后再有新版本还会提示
    });

    host.appendChild(txt);
    host.appendChild(go);
    host.appendChild(x);
    document.body.appendChild(host);
  }

  /* 带一次性参数的地址重新进入，避开整页内存缓存里那份旧文档 */
  function reload() {
    var u = new URL(location.href);
    u.searchParams.set('_v', Date.now().toString(36));
    location.replace(u.toString());
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    fingerprint()
      .then(function (fp) { baseline = fp; })
      .catch(function () {});

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) check();
    });
    window.addEventListener('focus', check);
    window.setInterval(check, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
