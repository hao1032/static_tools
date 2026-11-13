// Run with: node --test icons-generator/tests/history.test.cjs
// Set BROWSER_PATH if Chrome/Edge is installed outside the usual locations.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const browserPath = [process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(p => p && fs.existsSync(p));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('editor undo/redo in a real browser', { skip: !browserPath, timeout: 60000 }, async t => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
    const file = files[new URL(req.url, 'http://localhost').pathname];
    if (!file) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file[1] + '; charset=utf-8');
    res.end(fs.readFileSync(path.join(root, file[0])));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-history-'));
  const browser = spawn(browserPath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore', windowsHide: true });
  t.after(async () => {
    browser.kill();
    // The browser may briefly retain profile files while its children exit.
    for (let i = 0; i < 20; i++) {
      try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await delay(100); }
    }
  });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await delay(100);
  assert.ok(fs.existsSync(portFile), 'browser started');
  t.diagnostic('Browser started');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await fetch('http://127.0.0.1:' + port + '/json/list').then(r => r.json());
  const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  t.diagnostic('Browser debugging connected');
  t.after(() => socket.close());
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); message.error ? callback.reject(message.error) : callback.resolve(message.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser command timed out: ' + method)), 10000);
    pending.set(++id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable');
  const reset = async () => {
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/?t=' + Date.now() });
    for (let i = 0; i < 100; i++) {
      if (await evaluate('!!document.querySelector("#layers .layer-card")')) break;
      await delay(20);
    }
    await evaluate(`window.$ = s => document.querySelector(s);
      window.edit = (s, value, finish = true) => {
        const el = $(s);
        if (el.type === 'checkbox') el.checked = value; else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        if (finish) el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      window.click = s => $(s).click();
      window.key = (key, extra = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...extra }));
      window.pixel = () => $('#preview').toDataURL();`);
  };

  await t.test('continuous text input, shortcuts, no-ops and redo invalidation', async () => {
    await reset();
    assert.deepEqual(await evaluate('[ $("#undo").disabled, $("#redo").disabled ]'), [true, true]);
    await evaluate(`edit('[data-f="text"]', 'A', false); edit('[data-f="text"]', 'AB', false); edit('[data-f="text"]', 'ABC'); key('z');`);
    assert.equal(await evaluate(`$('[data-f="text"]').value`), '字');
    assert.equal(await evaluate('$("#undo").disabled'), true);
    await evaluate(`key('Z', { shiftKey: true, ctrlKey: false, metaKey: true });`);
    assert.equal(await evaluate(`$('[data-f="text"]').value`), 'ABC');
    await evaluate(`key('z'); edit('[data-f="text"]', '字');`);
    assert.equal(await evaluate('$("#redo").disabled'), false);
    await evaluate(`key('y'); key('z'); edit('[data-f="text"]', 'new');`);
    assert.equal(await evaluate('$("#redo").disabled'), true);
  });

  await t.test('global controls, property sliders and export settings restore together', async () => {
    await reset();
    const baseline = await evaluate('pixel()');
    await evaluate(`edit('#backgroundOpacity', 25); edit('#borderWidth', 28); edit('#borderColor', '#ff0000'); edit('#cornerRadius', 35);
      edit('[data-f="scale"]', 110, false); edit('[data-f="scale"]', 140); edit('[data-f="opacity"]', 0.5); edit('[data-f="rotation"]', 40);
      edit('#fileName', 'custom'); edit('#sizeList input', false);`);
    assert.equal(await evaluate(`$('[data-f="scale"]').parentNode.querySelector('.val').textContent`), '140%');
    const edited = await evaluate('pixel()');
    await evaluate(`for (let i = 0; i < 9; i++) click('#undo');`);
    assert.equal(await evaluate('pixel()'), baseline);
    assert.deepEqual(await evaluate(`[ $('#backgroundOpacity').value, $('#backgroundOpacityVal').textContent, $('#borderWidth').min, $('#radiusVal').textContent, $('#borderWidthVal').textContent, $('#fileName').value, $('#sizeList input').checked, $('#undo').disabled ]`), ['100', '100%', '0', '0', '0', 'icon', true, true]);
    await evaluate(`for (let i = 0; i < 9; i++) click('#redo');`);
    assert.equal(await evaluate('pixel()'), edited);
    assert.equal(await evaluate('$("#backgroundOpacityVal").textContent'), '25%');
  });

  await t.test('background alpha and zero-width border render independently', async () => {
    await reset();
    assert.equal(await evaluate(`!!$('#transparent') || !!$('#border')`), false);
    await evaluate(`edit('#backgroundOpacity', 50);`);
    assert.equal(await evaluate(`$('#preview').getContext('2d').getImageData(8, 256, 1, 1).data[3]`), 128);
    await evaluate(`edit('#backgroundOpacity', 0);`);
    assert.equal(await evaluate(`$('#preview').getContext('2d').getImageData(8, 256, 1, 1).data[3]`), 0);
    await evaluate(`edit('#borderWidth', 8);`);
    assert.equal(await evaluate(`$('#preview').getContext('2d').getImageData(8, 256, 1, 1).data[3]`), 255);
    await evaluate(`edit('#borderWidth', 0);`);
    assert.equal(await evaluate(`$('#preview').getContext('2d').getImageData(8, 256, 1, 1).data[3]`), 0);
  });

  await t.test('rounded borders share the background outline at every preview size', async () => {
    await reset();
    const violations = await evaluate(`(() => {
      edit('[data-f="text"]', ''); edit('#bgColor', '#00aaff'); edit('#borderColor', '#111827');
      const failures = [];
      // Signed distance to the expected rounded rectangle, in base canvas coordinates.
      const distance = (x, y, inset, radius) => {
        const half = 128 - inset, r = Math.min(radius, half);
        const dx = Math.abs(x - 128) - (half - r), dy = Math.abs(y - 128) - (half - r);
        return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
      };
      for (const [radius, width] of [[88, 36], [8, 36], [0, 64], [128, 64], [128, 1]]) {
        edit('#cornerRadius', radius); edit('#borderWidth', width);
        for (const opacity of [0, 50, 100]) {
          edit('#backgroundOpacity', opacity);
          for (const canvas of [$('#preview'), ...document.querySelectorAll('#tiles canvas')]) {
            const size = canvas.width, scale = size / 256, margin = 2 / scale;
            const pixels = canvas.getContext('2d').getImageData(0, 0, size, size).data;
            let mismatch = null;
            for (let y = 0; y < size && !mismatch; y++) for (let x = 0; x < size; x++) {
              const vx = (x + 0.5) / scale, vy = (y + 0.5) / scale;
              const outer = distance(vx, vy, 0, radius);
              const inner = distance(vx, vy, width, Math.max(0, radius - width));
              if (Math.abs(outer) <= margin || Math.abs(inner) <= margin) continue;
              const expected = outer > 0 ? [0, 0, 0, 0] : inner > 0 ? [17, 24, 39, 255]
                : opacity === 0 ? [0, 0, 0, 0] : [0, 170, 255, Math.round(opacity * 2.55)];
              const actual = Array.from(pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 4));
              if (actual.some((value, i) => Math.abs(value - expected[i]) > 2)) {
                mismatch = { radius, width, opacity, size, x, y, expected, actual }; break;
              }
            }
            if (mismatch) failures.push(mismatch);
          }
        }
      }
      return failures;
    })()`);
    assert.deepEqual(violations, [], 'border ring must follow both rounded rectangle outlines');
    if (process.env.ICONS_SCREENSHOT_DIR) {
      await evaluate(`edit('[data-f="text"]', '容'); edit('#cornerRadius', 88); edit('#borderWidth', 36); edit('#backgroundOpacity', 100);`);
      const screenshot = await send('Page.captureScreenshot', { captureBeyondViewport: true, format: 'png' });
      fs.writeFileSync(path.join(process.env.ICONS_SCREENSHOT_DIR, 'icons-border.png'), Buffer.from(screenshot.data, 'base64'));
    }
  });

  await t.test('add, reorder, delete all layers and selection restoration', async () => {
    await reset();
    await evaluate(`click('#addLayer'); edit('#layers .layer-card:last-child [data-f="text"]', 'second');
      const cards = document.querySelectorAll('.layer-card'); const transfer = new DataTransfer();
      cards[1].querySelector('[data-handle]').dispatchEvent(new DragEvent('dragstart', { dataTransfer: transfer, bubbles: true }));
      cards[0].dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));`);
    assert.equal(await evaluate(`$('#layers [data-f="text"]').value`), 'second');
    await evaluate(`click('#undo');`);
    assert.equal(await evaluate(`$('.layer-card.selected [data-f="text"]').value`), 'second');
    await evaluate(`click('#redo'); click('[data-act="del"]'); click('[data-act="del"]');`);
    assert.equal(await evaluate(`document.querySelectorAll('.layer-card').length`), 0);
    await evaluate(`click('#undo'); click('#undo');`);
    assert.equal(await evaluate(`document.querySelectorAll('.layer-card').length`), 2);
    assert.equal(await evaluate(`$('.layer-card.selected [data-f="text"]').value`), 'second');
  });

  await t.test('one canvas drag is one undo step', async () => {
    await reset();
    await evaluate(`const p = $('#preview'), rect = p.getBoundingClientRect();
      const pointer = (type, dx, dy) => p.dispatchEvent(new PointerEvent(type, { clientX: rect.left + rect.width / 2 + dx, clientY: rect.top + rect.height / 2 + dy, pointerId: 1, bubbles: true }));
      pointer('pointerdown', 0, 0); pointer('pointermove', 12, 8); pointer('pointermove', 45, 30); pointer('pointerup', 45, 30);`);
    const moved = await evaluate(`[$('[data-f="x"]').value, $('[data-f="y"]').value]`);
    assert.notDeepEqual(moved, ['128', '128']);
    await evaluate(`click('#undo');`);
    assert.deepEqual(await evaluate(`[$('[data-f="x"]').value, $('[data-f="y"]').value, $('#undo').disabled]`), ['128', '128', true]);
    await evaluate(`click('#redo');`);
    assert.deepEqual(await evaluate(`[$('[data-f="x"]').value, $('[data-f="y"]').value]`), moved);
  });

  await t.test('image import, replacement, removal, and mode undo preserve pixels', async () => {
    await reset();
    await evaluate(`(async () => { click('[data-mode="image"]'); window.importImage = async color => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="' + color + '"/></svg>';
      const transfer = new DataTransfer(); transfer.items.add(new File([svg], color + '.svg', { type: 'image/svg+xml' }));
      const input = $('[data-file]'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      for (let i = 0; i < 100; i++) { if ($('img.layer-thumb')?.src.includes('data:') && $('.layer-name').textContent.includes(color)) return; await new Promise(r => setTimeout(r, 10)); }
      throw new Error('image import timed out');
    }; await importImage('red'); window.redSrc = $('img.layer-thumb').src; })()`);
    const red = await evaluate('pixel()');
    await evaluate(`importImage('green')`);
    const green = await evaluate('pixel()');
    assert.notEqual(red, green);
    await evaluate(`click('#undo');`);
    assert.equal(await evaluate('pixel()'), red);
    await evaluate(`click('#redo'); click('[data-act="clearimg"]'); click('#undo');`);
    assert.equal(await evaluate('pixel()'), green);
    await evaluate(`click('[data-mode="text"]'); click('#undo');`);
    assert.equal(await evaluate('pixel()'), green);
    await evaluate(`(async () => {
      window.FileReader = class { readAsDataURL() { window.pendingReader = this; } };
      const transfer = new DataTransfer(); transfer.items.add(new File(['pending'], 'pending.svg', { type: 'image/svg+xml' }));
      $('[data-file]').files = transfer.files; $('[data-file]').dispatchEvent(new Event('change', { bubbles: true }));
      edit('#fileName', 'changed'); click('#undo');
      pendingReader.result = redSrc; pendingReader.onload(); await new Promise(r => setTimeout(r, 30));
    })()`);
    assert.equal(await evaluate('pixel()'), green, 'pending import must not override undo');
    assert.equal(await evaluate('$("#redo").disabled'), false);
  });

  await t.test('history is bounded to 100 edits', async () => {
    await reset();
    await evaluate(`for (let i = 1; i <= 105; i++) edit('#fileName', 'icon' + i); for (let i = 0; i < 110; i++) click('#undo');`);
    assert.equal(await evaluate('$("#fileName").value'), 'icon5');
    assert.equal(await evaluate('$("#undo").disabled'), true);
  });

  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await delay(20);
    }
    assert.fail('Timed out waiting for ' + expression);
  };

  await t.test('named snapshots preserve images and settings after reload; loading is undoable', async () => {
    await reset();
    await evaluate(`(async () => {
      click('[data-mode="image"]');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="24"><rect width="40" height="24" fill="orange"/></svg>';
      const transfer = new DataTransfer(); transfer.items.add(new File([svg], 'snapshot.svg', { type: 'image/svg+xml' }));
      $('[data-file]').files = transfer.files; $('[data-file]').dispatchEvent(new Event('change', { bubbles: true }));
      while (!$('img.layer-thumb')) await new Promise(r => setTimeout(r, 10));
      edit('#backgroundOpacity', 35); edit('#borderWidth', 12); edit('#borderColor', '#ff0000'); edit('#cornerRadius', 24);
      edit('[data-f="x"]', 100); edit('[data-f="opacity"]', 0.6); edit('#fileName', 'snapshot-icon'); edit('#sizeList input', false);
      click('#addLayer'); edit('.layer-card:last-child [data-f="text"]', '保存'); edit('[data-f="rotation"]', 25);
      $('#snapshotName').value = '<测试快照>'; click('#saveSnapshot');
    })()`);
    await waitFor(`!$('#saveSnapshot').disabled && !!$('[data-snapshot-load]')`);
    const saved = await evaluate('pixel()');
    assert.equal(await evaluate(`$('.snapshot-info strong').textContent`), '<测试快照>');
    assert.equal(await evaluate(`$('.snapshot-info strong').children.length`), 0, 'snapshot names render as text');
    await reset();
    await waitFor(`!!$('[data-snapshot-load]')`);
    await evaluate(`edit('[data-f="text"]', 'before-load'); click('[data-snapshot-load]');`);
    await waitFor(`$('#snapshotStatus').textContent.includes('已载入')`);
    assert.equal(await evaluate('pixel()'), saved);
    assert.deepEqual(await evaluate(`[$('#backgroundOpacity').value, $('#borderWidth').value, $('#fileName').value, $('#sizeList input').checked, $('.layer-card.selected [data-f="text"]').value, $('img.layer-thumb').getAttribute('src').startsWith('data:image/')]`), ['35', '12', 'snapshot-icon', false, '保存', true]);
    await evaluate(`click('#undo');`);
    assert.equal(await evaluate(`$('[data-f="text"]').value`), 'before-load');
    await evaluate(`click('#redo');`);
    assert.equal(await evaluate('pixel()'), saved);
    await evaluate(`edit('.layer-card:last-child [data-f="text"]', '继续修改'); $('#snapshotName').value = '修改版'; click('#saveSnapshot');`);
    await waitFor(`!$('#saveSnapshot').disabled && document.querySelectorAll('.snapshot-item').length === 2`);
  });

  await t.test('snapshot storage errors keep saved data; deletion persists', async () => {
    await reset();
    await waitFor(`document.querySelectorAll('.snapshot-item').length === 2`);
    await evaluate(`window.originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (name, mode, ...rest) { if (mode === 'readwrite') throw new DOMException('full', 'QuotaExceededError'); return originalTransaction.call(this, name, mode, ...rest); };
      click('#saveSnapshot');`);
    await waitFor(`!$('#saveSnapshot').disabled && $('#snapshotStatus').classList.contains('error')`);
    assert.equal(await evaluate(`document.querySelectorAll('.snapshot-item').length`), 2);
    assert.match(await evaluate(`$('#snapshotStatus').textContent`), /存储空间不足/);
    await reset();
    await waitFor(`document.querySelectorAll('.snapshot-item').length === 2`);
    await evaluate(`window.confirm = () => false; click('[data-snapshot-delete]');`);
    assert.equal(await evaluate(`document.querySelectorAll('.snapshot-item').length`), 2);
    await evaluate(`window.confirm = () => true; click('[data-snapshot-delete]');`);
    await waitFor(`document.querySelectorAll('.snapshot-item').length === 1`);
    await reset();
    await waitFor(`document.querySelectorAll('.snapshot-item').length === 1`);
    assert.equal(await evaluate(`$('.snapshot-info strong').textContent`), '<测试快照>');
  });
  await t.test('editing during image decoding cancels an outdated snapshot load', async () => {
    await reset();
    await waitFor(`!!$('[data-snapshot-load]')`);
    await evaluate(`window.delayedImages = []; window.NativeImage = Image;
      window.Image = function () {
        const image = new NativeImage();
        Object.defineProperty(image, 'src', { configurable: true, set(value) {
          delayedImages.push(() => { delete image.src; image.src = value; });
        } });
        return image;
      };
      click('[data-snapshot-load]');`);
    await waitFor('delayedImages.length > 0');
    await evaluate(`edit('[data-f="text"]', 'keep my edits'); delayedImages.forEach(start => start());`);
    await waitFor(`$('#snapshotStatus').textContent.includes('编辑内容已变化')`);
    assert.equal(await evaluate(`$('[data-f="text"]').value`), 'keep my edits');
    assert.equal(await evaluate(`document.querySelectorAll('.layer-card').length`), 1);
  });

  if (process.env.ICONS_SCREENSHOT_DIR) {
    await reset();
    await waitFor(`!!$('[data-snapshot-load]')`);
    for (const [name, width, height] of [['desktop', 1180, 900], ['mobile', 390, 844]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const screenshot = await send('Page.captureScreenshot', { captureBeyondViewport: true, format: 'png' });
      fs.writeFileSync(path.join(process.env.ICONS_SCREENSHOT_DIR, 'icons-' + name + '.png'), Buffer.from(screenshot.data, 'base64'));
    }
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
});
