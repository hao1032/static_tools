/* 认识时钟 · 时间练习
 * 纯原生 JS，无依赖。指针用 SVG + rAF 补间动画驱动。
 */
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const CX = 200, CY = 200;
  const $ = (id) => document.getElementById(id);

  /* ---------------- 几何工具 ---------------- */
  function mk(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  /** 极坐标 → 直角坐标（0° 指向 12 点，顺时针增大） */
  function polar(r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
  }
  /** 从 12 点方向顺时针扫到 deg 的扇形（用于表现「分针走过的分钟数」） */
  function sectorPath(deg, r) {
    if (deg <= 0.5) return '';
    const p = polar(r, deg);
    const large = deg > 180 ? 1 : 0;
    return `M ${CX} ${CY} L ${CX} ${CY - r} A ${r} ${r} 0 ${large} 1 ${p.x} ${p.y} Z`;
  }
  /** 沿半径为 r 的圆周从 from 到 to 的圆弧 */
  function arcPath(r, from, to) {
    const p1 = polar(r, from), p2 = polar(r, to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    const flag = to >= from ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} ${flag} ${p2.x} ${p2.y}`;
  }

  /* ---------------- 表盘 ---------------- */
  const gTicks = $('gTicks'), gHourNums = $('gHourNums'), gMinNums = $('gMinNums');

  (function buildFace() {
    for (let i = 0; i < 60; i++) {
      const deg = i * 6, major = i % 5 === 0;
      const a = polar(major ? 160 : 168, deg);
      const b = polar(180, deg);
      gTicks.appendChild(mk('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        class: major ? 'tick tick-major' : 'tick tick-minor'
      }));
    }
    for (let h = 1; h <= 12; h++) {
      const p = polar(112, h * 30);
      const t = mk('text', {
        x: p.x, y: p.y, class: 'hour-num', id: 'hn' + h,
        'text-anchor': 'middle', 'dominant-baseline': 'central'
      });
      t.textContent = h;
      gHourNums.appendChild(t);
    }
    // 分钟数字：5 10 … 55，最上面（12 点位置）写 0，不写 60
    for (let m = 5; m <= 60; m += 5) {
      const p = polar(146, m * 6);
      const t = mk('text', {
        x: p.x, y: p.y, class: 'min-num',
        'text-anchor': 'middle', 'dominant-baseline': 'central'
      });
      t.textContent = m === 60 ? 0 : m;
      gMinNums.appendChild(t);
    }
  })();

  const clock = $('clock');
  const hourHand = $('hourHand'), minuteHand = $('minuteHand');
  const sweep = $('sweep'), rimDot = $('rimDot'), hourGuide = $('hourGuide');

  function setHand(node, deg) {
    node.setAttribute('transform', `rotate(${deg.toFixed(3)} ${CX} ${CY})`);
  }
  function hourAngle(h, m) { return (h % 12) * 30 + m * 0.5; }
  function drawSweep(deg) {
    if (deg <= 0.5) {
      sweep.setAttribute('d', '');
      rimDot.setAttribute('opacity', '0');
      return;
    }
    sweep.setAttribute('d', sectorPath(deg, 152));
    const p = polar(171, deg);
    rimDot.setAttribute('cx', p.x);
    rimDot.setAttribute('cy', p.y);
    rimDot.setAttribute('opacity', '1');
  }

  /* ---------------- 状态 ---------------- */
  const state = {
    h: 3, m: 0,          // 当前题目
    ansH: 12, ansM: 0,   // 用户选出来的答案
    answered: false,
    ok: 0, total: 0,
    step: 0,             // 讲解进行到第几步（0 = 还没开始）
    playing: false,      // 正在播放某一步的动画
    runId: 0             // 动画令牌，用于打断
  };
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (h, m) => `${h}:${pad(m)}`;
  const hNextOf = (h) => (h === 12 ? 1 : h + 1);

  /* ---------------- 选项持久化 ---------------- */
  const LS_KEY = 'clock-learning:options';
  const DEFAULTS = { numbers: true, minuteNumbers: true, ticks: true, difficulty: 'hard', tolerance: '2' };
  const DIFFS = ['easy', 'normal', 'hard'];
  const TOLS = ['0', '1', '2', '3', '5'];

  function saveOptions() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        numbers: $('optNumbers').checked,
        minuteNumbers: $('optMinuteNumbers').checked,
        ticks: $('optTicks').checked,
        difficulty: $('difficulty').value,
        tolerance: $('tolerance').value
      }));
    } catch (_) { /* 隐私模式下忽略 */ }
  }
  function loadOptions() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (_) { saved = {}; }
    const o = Object.assign({}, DEFAULTS, saved);
    $('optNumbers').checked = o.numbers !== false;
    $('optMinuteNumbers').checked = o.minuteNumbers !== false;
    $('optTicks').checked = o.ticks !== false;
    $('difficulty').value = DIFFS.indexOf(o.difficulty) >= 0 ? o.difficulty : DEFAULTS.difficulty;
    $('tolerance').value = TOLS.indexOf(String(o.tolerance)) >= 0 ? String(o.tolerance) : DEFAULTS.tolerance;
  }

  /* ---------------- 界面小工具 ---------------- */
  function sleep(ms, run) {
    return new Promise((res) => setTimeout(() => res(run === undefined || run === state.runId), ms));
  }
  function tween(duration, fn, run) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      function frame(t) {
        if (run !== undefined && run !== state.runId) return resolve(false);
        const p = Math.min(1, (t - t0) / duration);
        fn(p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2, p);
        if (p < 1) requestAnimationFrame(frame); else resolve(true);
      }
      requestAnimationFrame(frame);
    });
  }
  function setBadge(main, sub) {
    $('badgeMain').textContent = main || '';
    $('badgeSub').textContent = sub || '';
    $('badge').classList.toggle('empty', !main);
  }
  function setText(html) {
    const el = $('expText');
    el.innerHTML = html;
    el.classList.remove('fade');
    void el.offsetWidth;         // 重排一次，让动画能重放
    el.classList.add('fade');
  }
  function setStep(n) {
    $('steps').querySelectorAll('.step').forEach((s) => {
      const k = Number(s.dataset.step);
      s.classList.toggle('done', n !== 0 && k < n);
      s.classList.toggle('on', k === n);
      if (n === 0) s.classList.remove('done');
    });
  }
  function clearGuide() {
    hourGuide.setAttribute('opacity', '0');
    hourGuide.setAttribute('d', '');
    for (let h = 1; h <= 12; h++) $('hn' + h).classList.remove('live');
  }
  function resetOverlay() {
    drawSweep(0);
    clearGuide();
    clock.classList.remove('focus-minute', 'focus-hour');
    hourHand.classList.remove('active');
    minuteHand.classList.remove('active');
  }
  function updateScore() {
    $('score').textContent = state.total === 0
      ? '还没有答题'
      : `已答 ${state.total} 题 · 答对 ${state.ok} 题`;
  }

  /* ---------------- 出题 ---------------- */
  function randomMinute() {
    const d = $('difficulty').value;
    if (d === 'easy') return Math.random() < 0.5 ? 0 : 30;
    if (d === 'normal') return Math.floor(Math.random() * 12) * 5;
    return Math.floor(Math.random() * 60);
  }

  /* ---------------- 数字选择面板（点数字弹出，不弹键盘） ---------------- */
  const PICKER = { h: 'pickerH', m: 'pickerM' };
  const DIGIT = { h: 'hourDigit', m: 'minDigit' };
  let openUnit = null;

  /** unit：h = 小时 1–12；t = 分钟的十位 0–5；u = 分钟的个位 0–9 */
  function pickerBtn(v, unit) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = String(v);
    b.dataset.unit = unit;
    b.textContent = String(v);           // 十位 / 个位都是单个数字，不补零
    return b;
  }
  function buildPickers() {
    const gh = $('gridH'), gt = $('gridTens'), gu = $('gridUnits');
    for (let h = 1; h <= 12; h++) gh.appendChild(pickerBtn(h, 'h'));
    for (let d = 0; d <= 5; d++) gt.appendChild(pickerBtn(d, 't'));   // 分钟最大 59 → 十位只到 5
    for (let d = 0; d <= 9; d++) gu.appendChild(pickerBtn(d, 'u'));

    gh.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b || state.answered) return;
      state.ansH = Number(b.dataset.v);
      renderAnswer();
      closePickers();
    });

    // 分钟两栏：点十位保持打开（还要接着点个位），点个位就算选完，自动收起
    [gt, gu].forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b || state.answered) return;
      const v = Number(b.dataset.v);
      if (b.dataset.unit === 't') {
        state.ansM = v * 10 + (state.ansM % 10);
        renderAnswer();
      } else {
        state.ansM = Math.floor(state.ansM / 10) * 10 + v;
        renderAnswer();
        closePickers();
      }
    }));
  }
  function closePickers() {
    for (const u in PICKER) {
      $(PICKER[u]).hidden = true;
      $(DIGIT[u]).setAttribute('aria-expanded', 'false');
    }
    openUnit = null;
  }
  function togglePicker(unit) {
    if (state.answered) return;
    if (openUnit === unit) { closePickers(); return; }
    closePickers();
    const p = $(PICKER[unit]);
    p.hidden = false;
    p.classList.remove('up');
    // 下方放不下就向上翻（窄屏 / 矮窗口时避免被屏幕切掉）
    const r = p.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 10 && r.height + 16 < r.top) p.classList.add('up');
    $(DIGIT[unit]).setAttribute('aria-expanded', 'true');
    openUnit = unit;
    // 只在面板内部需要滚动时对齐高亮项，避免整个页面被滚动
    const sels = p.querySelectorAll('button.sel');
    if (sels.length && p.scrollHeight > p.clientHeight + 1) {
      const s = sels[sels.length - 1];
      p.scrollTop = s.offsetTop - (p.clientHeight - s.offsetHeight) / 2;
    }
  }
  function markSel(gridId, v) {
    $(gridId).querySelectorAll('button').forEach((b) => {
      b.classList.toggle('sel', Number(b.dataset.v) === v);
    });
  }
  function renderAnswer() {
    $('hourVal').textContent = String(state.ansH);
    $('minVal').textContent = pad(state.ansM);
    markSel('gridH', state.ansH);
    markSel('gridTens', Math.floor(state.ansM / 10));   // 分钟十位
    markSel('gridUnits', state.ansM % 10);              // 分钟个位
  }
  function lockAnswer(locked) {
    $('hourDigit').disabled = locked;
    $('minDigit').disabled = locked;
    $('submit').disabled = locked;
    if (locked) closePickers();
  }

  /* ---------------- 讲解入口按钮 ---------------- */
  function updateExplainBtn() {
    const b = $('explainBtn'), label = $('explainLabel'), ico = $('explainIco');
    if (state.playing) {
      b.disabled = true;
      ico.textContent = '⏳';
      label.textContent = '播放中…';
      return;
    }
    b.disabled = false;
    if (state.step === 0) { ico.textContent = '▶'; label.textContent = '看动画讲解'; }
    else if (state.step === 1) { ico.textContent = '▶'; label.textContent = '第 2 步 · 读时针'; }
    else if (state.step === 2) { ico.textContent = '▶'; label.textContent = '第 3 步 · 合起来'; }
    else { ico.textContent = '↻'; label.textContent = '再看一遍'; }
  }

  /* ---------------- 出下一题 ---------------- */
  function newQuestion() {
    state.runId++;              // 取消正在播放的动画
    resetOverlay();

    let h = state.h, m = state.m;
    for (let i = 0; i < 30 && h === state.h && m === state.m; i++) {
      h = 1 + Math.floor(Math.random() * 12);
      m = randomMinute();
    }
    state.h = h; state.m = m;
    state.answered = false;
    state.ansH = 12; state.ansM = 0;   // 每次从 12:00 开始选
    state.step = 0;
    state.playing = false;

    setHand(hourHand, hourAngle(h, m));
    setHand(minuteHand, m * 6);
    renderAnswer();

    lockAnswer(false);
    $('feedback').className = 'feedback';
    $('feedback').innerHTML = '';
    $('newQuestion').textContent = '随机出一道题';
    $('explainLaunch').hidden = true;   // 讲解入口先收起来，答完题才出现
    $('explain').hidden = true;
    $('expText').innerHTML = '';
    updateExplainBtn();
    setStep(0);
    setBadge('', '');
  }

  /* ---------------- 判题 ---------------- */
  function judge() {
    if (state.answered) return;
    closePickers();
    const ah = state.ansH;
    const am = state.ansM;
    const fb = $('feedback');
    const tol = parseInt($('tolerance').value, 10);
    const { h, m } = state;

    // 分钟按圆盘算距离：分针接近 12 时，答案跨到下一个整点也算对
    const raw = Math.abs(am - m);
    const circ = Math.min(raw, 60 - raw);
    const mOk = circ <= tol;
    const wrapped = am < m && (m - am) > 30;
    const hOk = ah === (wrapped ? hNextOf(h) : h);
    const ok = hOk && mOk;

    state.answered = true;
    state.total++;
    if (ok) state.ok++;
    lockAnswer(true);
    $('newQuestion').textContent = '下一题 →';
    updateScore();

    if (ok) {
      fb.className = 'feedback ok';
      fb.innerHTML = `<strong>🎉 答对了！</strong> 现在是 <b>${h} 时 ${m} 分</b>（${fmt(h, m)}）。`;
      minuteHand.classList.add('active');
      hourHand.classList.add('active');
      setStep(0);
    } else {
      fb.className = 'feedback bad';
      fb.innerHTML = `<strong>再看一看 👀</strong> 你答的是 ${ah} 时 ${am} 分，正确答案是 <b>${h} 时 ${m} 分</b>（${fmt(h, m)}）。`
        + `<br>点时钟下面的按钮，一步一步找出答案。`;
    }

    // 答完就在时钟下方露出讲解按钮（答对也能复习一遍）
    $('explainLaunch').hidden = false;
    updateExplainBtn();
  }

  /* ---------------- 动画讲解：点一次走一步 ---------------- */
  async function playStep(n) {
    if (state.playing) return;
    state.playing = true;
    updateExplainBtn();
    $('explain').hidden = false;

    const run = ++state.runId;
    if (n === 1) await step1(run);
    else if (n === 2) await step2(run);
    else await step3(run);

    if (run !== state.runId) {          // 被下一题打断
      state.playing = false;
      updateExplainBtn();
      return;
    }
    state.step = n;
    state.playing = false;
    updateExplainBtn();
  }

  const alive = (run) => run === state.runId;

  /* 第 1 步：数分针走过多少个大格 */
  async function step1(run) {
    const { h, m } = state;
    resetOverlay();
    setHand(hourHand, hourAngle(h, m));   // 时针先摆到正确位置，等第 2 步再从头走
    setHand(minuteHand, 0);

    setStep(1);
    clock.classList.add('focus-minute');
    setBadge('第 1 步 · 读分针', '分针从 12 出发，1 个大格 = 5 分钟');
    setText(m === 0
      ? '第 1 步先看<em>分针</em>——看看它指向哪里。'
      : '第 1 步先看<em>分针</em>：从 12 出发，顺着指针走的方向一格一格地数，看它走了多少个大格。');

    const bigSteps = Math.floor(m / 5);
    const rest = m % 5;
    for (let k = 1; k <= bigSteps; k++) {
      const from = (k - 1) * 30, to = k * 30;
      await tween(160, (e) => {
        const a = from + (to - from) * e;
        setHand(minuteHand, a);
        drawSweep(a);
      }, run);
      if (!alive(run)) return;
      setBadge(`${k * 5} 分`, `走过 ${k} 个大格 · ${k} × 5 = ${k * 5} 分钟`);
      await sleep(95, run);
      if (!alive(run)) return;
    }
    if (rest > 0) {
      const from = bigSteps * 30, to = m * 6;
      await tween(420, (e) => {
        const a = from + (to - from) * e;
        setHand(minuteHand, a);
        drawSweep(a);
      }, run);
      if (!alive(run)) return;
    }
    setHand(minuteHand, m * 6);
    drawSweep(m * 6);

    if (m === 0) {
      setBadge('0 分', '分针正好指向 12 → 整点，0 分钟');
      setText(`分针正好指向 <em>12</em>，说明是整点，分钟数 = <em>0</em>。`);
    } else if (rest === 0) {
      setBadge(`${m} 分`, `分针指向 ${m} 的刻度 → ${m} 分钟`);
      setText(
        `分针指向 <em>${m}</em>，也就是从 12 顺时针走过 <strong>${bigSteps}</strong> 个大格。<br>` +
        `1 个大格 = 5 分钟，所以 ${bigSteps} × 5 = <em>${m}</em> 分钟。`);
    } else {
      setBadge(`${m} 分`, `${bigSteps} 个大格 + ${rest} 个小格 = ${m} 分钟`);
      setText(
        `分针走过 <strong>${bigSteps}</strong> 个大格，再多走 <strong>${rest}</strong> 个小格。<br>` +
        `${bigSteps} × 5 + ${rest} = <em>${m}</em> 分钟。`);
    }
    await sleep(400, run);
  }

  /* 第 2 步：数时针走过几个小时 */
  async function step2(run) {
    const { h, m } = state;
    const hn = hNextOf(h);

    setStep(2);
    clock.classList.remove('focus-minute');
    clock.classList.add('focus-hour');
    minuteHand.classList.remove('active');
    hourHand.classList.add('active');
    setBadge('第 2 步 · 读时针', '时针从 12 开始，每小时走 1 个大格');
    setText('第 2 步再看<em>时针</em>：数一数它从 12 出发走过了几个小时。');

    // 12 点时时针要走满一整圈回到 12，动画才顺
    const target = hourAngle(h, m);
    const sweepTarget = h === 12 ? 360 + m * 0.5 : target;
    await tween(1500, (e) => {
      const a = sweepTarget * e;
      setHand(hourHand, a);
      setBadge(`${Math.floor(a / 30)} 时`, '时针每小时走 1 个大格');
    }, run);
    if (!alive(run)) return;
    setHand(hourHand, target);

    // 高亮时针所在的「两格之间」
    const from = (h % 12) * 30;
    if (m !== 0) {
      hourGuide.setAttribute('d', arcPath(112, from, from + 30));
      hourGuide.setAttribute('opacity', '1');
      $('hn' + h).classList.add('live');
      $('hn' + hn).classList.add('live');
      setBadge(`${h} 时`, `时针在 ${h} 和 ${hn} 之间 → 还没到 ${hn} 时`);
      setText(
        `时针停在 <em>${h}</em> 和 <em>${hn}</em> 之间，说明 <strong>${hn} 时还没到</strong>。<br>` +
        `所以时数要读小的那个：<em>${h}</em> 时。`);
    } else {
      $('hn' + h).classList.add('live');
      setBadge(`${h} 时`, `时针正好指向 ${h}`);
      setText(`时针正好指向 <em>${h}</em>，分针指向 12，所以是 <em>${h}</em> 时整。`);
    }
    await sleep(400, run);
  }

  /* 第 3 步：把两步合起来 */
  async function step3(run) {
    const { h, m } = state;

    setStep(3);
    clock.classList.remove('focus-hour');
    clearGuide();
    hourHand.classList.add('active');
    minuteHand.classList.add('active');
    setHand(hourHand, hourAngle(h, m));
    setHand(minuteHand, m * 6);
    drawSweep(m * 6);
    setBadge(`${h} 时 ${m} 分`, `写作 ${fmt(h, m)}`);

    const tip = m === 0
      ? `整点的时候，分针一定指向 12。`
      : (m >= 55 ? `注意：分针快到 12 了，但还没到，所以仍然是 <em>${h}</em> 时。` : '');
    setText(
      `第 1 步得到 <strong>${m} 分钟</strong>，第 2 步得到 <strong>${h} 时</strong>，合起来就是：<br>` +
      `<em>${h} 时 ${m} 分</em>（写作 ${fmt(h, m)}）。` + (tip ? `<br>${tip}` : ''));
    await sleep(300, run);
    if (!alive(run)) return;

    // 三步全部标成「已完成」
    $('steps').querySelectorAll('.step').forEach((s) => s.classList.add('done'));
  }

  /* ---------------- 事件绑定 ---------------- */
  function applyOptions() {
    gHourNums.style.display = $('optNumbers').checked ? '' : 'none';
    gMinNums.style.display = $('optMinuteNumbers').checked ? '' : 'none';
    gTicks.style.display = $('optTicks').checked ? '' : 'none';
  }
  ['optNumbers', 'optMinuteNumbers', 'optTicks'].forEach((id) => {
    $(id).addEventListener('change', () => { applyOptions(); saveOptions(); });
  });
  ['difficulty', 'tolerance'].forEach((id) => {
    $(id).addEventListener('change', saveOptions);
  });

  $('newQuestion').addEventListener('click', newQuestion);
  $('submit').addEventListener('click', judge);

  $('hourDigit').addEventListener('click', () => togglePicker('h'));
  $('minDigit').addEventListener('click', () => togglePicker('m'));
  document.querySelectorAll('.picker-x').forEach((b) => b.addEventListener('click', closePickers));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ctrl-row')) closePickers();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePickers();
  });

  $('explainBtn').addEventListener('click', () => {
    if (state.playing) return;
    if (state.step >= 3) state.step = 0;   // 看完一遍再点 = 从第 1 步重播
    playStep(state.step + 1);
  });

  /* ---------------- 启动 ---------------- */
  loadOptions();
  applyOptions();
  buildPickers();
  renderAnswer();
  updateScore();
  newQuestion();
})();
