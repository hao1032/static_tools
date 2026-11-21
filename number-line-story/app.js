(() => {
  'use strict';
  const chapters = window.NUMBER_LINE_LESSONS;
  const { getState, targets } = window.NumberLineModel;
  const $ = id => document.getElementById(id);
  const fmt = value => {
    const rounded = Math.round(value * 1000) / 1000;
    return String(Object.is(rounded, -0) ? 0 : rounded).replace('-', '−');
  };
  const liveFmt = value => {
    const rounded = Math.round(value * 10) / 10;
    return (Object.is(rounded, -0) ? 0 : rounded).toFixed(1).replace('-', '−');
  };
  const setText = (id, value) => {
    const node = $(id);
    if (node.textContent !== value) node.textContent = value;
  };
  const pq = '#e16b37', mn = '#397ac9', ol = '#24886a';
  let chapterIndex = 0, stepIndex = 0, currentTime = 0;
  let frame = null, playing = false, playback = null, lastFrame = null, speaking = false;
  let lastNumberFrame = -Infinity;
  let numberState = null;
  let speechToken = 0, checkAnswer = null;
  const chapter = () => chapters[chapterIndex];
  const step = () => chapter().steps[stepIndex];
  const isSlow = () => Boolean(chapter().slowed);

  function svgText(x, y, text, color = '#718089', size = 17, weight = 400, anchor = 'middle') {
    return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${text}</text>`;
  }

  function drawStage(state, refreshNumbers) {
    const x = v => 56 + (v + 26) * 16.96;
    let svg = '<defs><marker id="axis-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9" fill="none" stroke="#8b989c" stroke-width="1.5"/></marker></defs>';
    for (let v = -24; v <= 24; v += 4) {
      svg += `<line x1="${x(v)}" y1="67" x2="${x(v)}" y2="232" stroke="#f0f3f1"/>`;
    }
    const anchors = [{ v: -20, name: 'A', fill: '#87978d' }, { v: -8, name: 'B', fill: '#87978d' }, { v: 16, name: 'C', fill: '#658a73' }];
    anchors.forEach(a => {
      svg += `<line x1="${x(a.v)}" y1="58" x2="${x(a.v)}" y2="236" stroke="#cbd8ce" stroke-dasharray="5 6"/>`;
      svg += svgText(x(a.v), 281, a.name, a.fill, 19, 700);
      svg += svgText(x(a.v), 306, fmt(a.v), '#788a7d', 17, 500);
    });
    svg += `<line x1="35" y1="232" x2="930" y2="232" stroke="#8b989c" stroke-width="1.7" marker-end="url(#axis-arrow)"/>`;
    for (let v = -24; v <= 24; v += 2) {
      svg += `<line x1="${x(v)}" y1="232" x2="${x(v)}" y2="${v % 4 === 0 ? 241 : 237}" stroke="#9da9ab"/>`;
      if (v % 8 === 0 && v !== -8 && v !== 16) svg += svgText(x(v), 261, fmt(v), '#99a3a5', 14);
    }
    if (state.overlap > 0.00001 && isSlow()) {
      svg += `<rect x="${x(state.left)}" y="101" width="${state.overlap * 16.96}" height="131" fill="${ol}" opacity=".12"/>`;
      svg += `<line x1="${x(state.left)}" y1="226" x2="${x(state.right)}" y2="226" stroke="${ol}" stroke-width="7" stroke-linecap="round"/>`;
    }
    if (step().distances) {
      const dimension = (a, b, y, label, value, color, ya, yb) => {
        const left = Math.min(x(a), x(b)), right = Math.max(x(a), x(b));
        const middle = (left + right) / 2;
        let result = `<path d="M${x(a)} ${ya}V${y}M${x(b)} ${yb}V${y}" fill="none" stroke="${color}" stroke-width="1.2" stroke-dasharray="3 4" opacity=".5"/>`;
        result += `<path d="M${left} ${y - 5}v10m0 -5H${right}m0 -5v10" fill="none" stroke="${color}" stroke-width="2"/>`;
        result += `<rect x="${middle - 75}" y="${y - 24}" width="150" height="21" fill="white" opacity=".94" rx="4"/>`;
        return result + svgText(middle - 15, y - 8, label, color, 15, 600, 'end') + svgText(middle - 7, y - 8, (playing ? liveFmt : fmt)(value), color, 15, 600, 'start');
      };
      svg += dimension(state.q, 16, 25, 'CQ', numberState.cq, '#8e79bc', 105, 232);
      svg += dimension(state.p, state.m, 132, 'PM', numberState.pm, '#b38b4a', 105, 168);
    }
    const lane = (left, right, y, color, a, b, velocity) => {
      let s = `<line x1="${x(left)}" y1="${y}" x2="${x(right)}" y2="${y}" stroke="${color}" stroke-width="13" stroke-linecap="round"/>`;
      s += `<circle cx="${x(left)}" cy="${y}" r="5.5" fill="white" stroke="${color}" stroke-width="2.5"/><circle cx="${x(right)}" cy="${y}" r="5.5" fill="white" stroke="${color}" stroke-width="2.5"/>`;
      s += svgText(x(left), y - 20, a, color, 20, 700) + svgText(x(right), y - 20, b, color, 20, 700);
      const center = (x(left) + x(right)) / 2;
      if (velocity !== 0) {
        const dir = velocity > 0 ? 1 : -1;
        const ay = y === 105 ? 49 : 201;
        s += `<path d="M${center - dir * 21} ${ay}h${dir * 42}m${-dir * 8} -5l${dir * 8} 5l${-dir * 8} 5" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      } else s += svgText(center, y === 105 ? 49 : 208, '停止', color, 14, 500);
      return s;
    };
    svg += lane(state.p, state.q, 105, pq, 'P', 'Q', state.vq);
    svg += lane(state.m, state.n, 168, mn, 'M', 'N', state.vm);
    $('stage').innerHTML = svg;
    if (refreshNumbers) $('stage').setAttribute('aria-label', `第${fmt(state.t)}秒：P在${fmt(state.p)}，Q在${fmt(state.q)}，M在${fmt(state.m)}，N在${fmt(state.n)}`);
  }

  function drawZoom(state) {
    // Keep equal, fixed scale throughout each encounter. Distant rulers are
    // clipped to the window; a caption says when one is outside the close-up.
    const returning = state.t >= 15;
    const center = state.m + (returning ? 2 : 1);
    const x = value => 410 + (value - center) * 68;
    const outside = state.q < center - 6 || state.p > center + 6;
    let svg = '<defs><clipPath id="zoom-clip"><rect x="18" y="9" width="784" height="186"/></clipPath></defs>';
    for (let v = -5; v <= 5; v++) {
      svg += `<line x1="${410 + v * 68}" y1="24" x2="${410 + v * 68}" y2="171" stroke="#f1f4f1"/>`;
    }
    svg += '<g clip-path="url(#zoom-clip)">';
    if (state.overlap > 0.00001) {
      svg += `<rect x="${x(state.left)}" y="48" width="${state.overlap * 68}" height="69" fill="${ol}" opacity=".12"/>`;
    }
    const line = (a, b, y, color, labelA, labelB) => `<line x1="${x(a)}" y1="${y}" x2="${x(b)}" y2="${y}" stroke="${color}" stroke-width="14" stroke-linecap="round"/><circle cx="${x(a)}" cy="${y}" r="5" fill="#fff" stroke="${color}" stroke-width="2"/><circle cx="${x(b)}" cy="${y}" r="5" fill="#fff" stroke="${color}" stroke-width="2"/>${svgText(x(a), y - 20, labelA, color, 19, 650)}${svgText(x(b), y - 20, labelB, color, 19, 650)}`;
    svg += line(state.p, state.q, 53, pq, 'P', 'Q');
    svg += line(state.m, state.n, 110, mn, 'M', 'N');
    if (state.overlap > 0.00001) {
      svg += `<line x1="${x(state.left)}" y1="155" x2="${x(state.right)}" y2="155" stroke="${ol}" stroke-width="7" stroke-linecap="round"/><path d="M${x(state.left)} 145v20M${x(state.right)} 145v20" stroke="${ol}" stroke-width="2"/>`;
      const middle = (x(state.left) + x(state.right)) / 2;
      svg += svgText(middle - 12, 190, '重合', ol, 18, 650, 'end') + svgText(middle - 4, 190, (playing ? liveFmt : fmt)(numberState.overlap), ol, 18, 650, 'start');
    } else {
      svg += svgText(410, 170, '重合长度 0', '#8b9b91', 16, 500);
    }
    svg += '</g>';
    // A two-unit scale makes the visual lengths independently checkable.
    svg += '<path d="M630 185v-5h136v5" fill="none" stroke="#a8b8ad" stroke-width="1.5"/>' + svgText(698, 202, '这一段是 2 格', '#8c9d92', 11);
    $('zoom').innerHTML = svg;
    let text;
    if (state.overlap >= 2 - 1e-8) text = '整把短尺都在长尺里面，重合长度保持 2。';
    else if (state.overlap > 1e-8) text = '绿色部分：两把尺子共同盖住的那一段。';
    else if (outside) text = '两把尺子还没有重合；橙色短尺在放大窗口外，请看上方全景。';
    else if (Math.abs(state.q - state.m) < 1e-8 || Math.abs(state.p - state.n) < 1e-8) text = '只碰到一个端点时，重合长度还是 0。';
    else text = '两把尺子分开着，重合长度是 0。';
    if (state.t > 20.5 + 1e-8) text = '两把尺子已经分开，越走越远，不再重合。';
    setText('zoom-note', text);
  }

  function updateScene(time, refreshNumbers = true) {
    const state = getState(time, isSlow());
    if (refreshNumbers || !numberState) numberState = state;
    currentTime = state.t;
    $('time-slider').value = state.t;
    drawStage(state, refreshNumbers);
    if (refreshNumbers) {
      const display = playing ? liveFmt : fmt;
      setText('time-value', display(state.t));
      for (const point of ['p', 'q', 'm', 'n']) setText(`${point}-value`, display(state[point]));
      if (step().zoom) {
        setText('overlap-number', display(state.overlap));
        $('zoom').setAttribute('aria-label', `重合部分长${fmt(state.overlap)}，短尺长2，长尺长4`);
      }
      if (step().distances) {
        setText('cq-value', display(state.cq));
        setText('pm-value', display(state.pm));
        const equal = Math.abs(state.cq - state.pm) < 0.0001;
        setText('distance-note', equal ? '一样长了！这就是 CQ＝PM。' : state.cq > state.pm ? '现在 CQ 比 PM 长。' : '现在 PM 比 CQ 长。');
      }
    }
    const direction = state.vq > 0 ? '向右' : state.vq < 0 ? '向左' : '停止';
    setText('pq-speed', `${direction} · 每秒 ${fmt(Math.abs(state.vq))} 格`);
    setText('mn-speed', `${state.vm === 0 ? '停止' : '向右'} · 每秒 ${fmt(state.vm)} 格`);
    const speedMode = state.vm === 0 ? '运动结束' : state.vm === 0.5 ? '重合中 · 速度减半' : '原速运动';
    setText('pq-mode', speedMode);
    setText('mn-mode', speedMode);
    if (step().zoom) drawZoom(state);
    if (step().distances) {
      $('cq-bar').style.width = `${state.cq / 36 * 100}%`;
      $('pm-bar').style.width = `${state.pm / 36 * 100}%`;
    }
    document.querySelectorAll('.moment').forEach((b, i) => b.classList.toggle('selected', Math.abs(state.t - targets[i]) < 0.001));
  }

  function stopPlayback() {
    const wasPlaying = playing;
    playing = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastFrame = null;
    $('play').textContent = '▶ 播放这一小步';
    if (wasPlaying) updateScene(Math.round(currentTime * 100) / 100);
  }

  function tick(stamp) {
    if (!playing) return;
    if (lastFrame === null) lastFrame = stamp;
    const dt = Math.min(100, stamp - lastFrame);
    lastFrame = stamp;
    playback.elapsed += dt * Number($('speed').value);
    const ratio = Math.min(1, playback.elapsed / playback.duration);
    // Geometry stays smooth; readable numeric snapshots update at most ~3 Hz.
    const refreshNumbers = stamp - lastNumberFrame >= 300 || ratio === 1;
    if (refreshNumbers) lastNumberFrame = stamp;
    updateScene(playback.from + (playback.to - playback.from) * ratio, refreshNumbers);
    if (ratio === 1) {
      stopPlayback();
      $('scrub-hint').textContent = '这一小步看完了。可以重看，也可以点“下一步”。';
    } else frame = requestAnimationFrame(tick);
  }

  function playStep(restart = false) {
    if (playing) { stopPlayback(); return; }
    const s = step();
    if (s.from === s.to) {
      updateScene(s.to);
      $('scrub-hint').textContent = '这一步看静止的位置。你也可以拖动时间，观察完整过程。';
      return;
    }
    const lo = Math.min(s.from, s.to), hi = Math.max(s.from, s.to);
    const inside = currentTime >= lo && currentTime <= hi;
    const atEnd = Math.abs(currentTime - s.to) < 0.001;
    const from = restart || !inside || atEnd ? s.from : currentTime;
    const base = Math.max(4000, Math.min(10000, Math.abs(s.to - s.from) * 650));
    playback = { from, to: s.to, elapsed: 0, duration: base * Math.abs(s.to - from) / Math.abs(s.to - s.from) };
    if (playback.duration < 1) return;
    playing = true;
    lastNumberFrame = -Infinity;
    updateScene(from);
    $('play').textContent = 'Ⅱ 暂停';
    $('scrub-hint').textContent = s.reverse ? '正在倒回去观察，屏幕上的时间会减少。' : '动画放慢了播放；上面的数字才是题目中的实际运动时间。';
    lastFrame = null;
    frame = requestAnimationFrame(tick);
  }

  function stopSpeech() {
    speechToken++;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speaking = false;
    $('speak').textContent = '♬ 朗读本步';
    $('speak').setAttribute('aria-pressed', 'false');
  }

  function renderCheck() {
    const check = step().check;
    $('mini-check').hidden = !check;
    if (!check) return;
    $('mini-check').innerHTML = `<p>停一下，想一想：${check.question}</p><div class="check-options">${check.options.map((option, i) => `<button data-option="${i}">${option}</button>`).join('')}</div><p class="check-feedback" role="status"></p>`;
    $('mini-check').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      checkAnswer = Number(button.dataset.option);
      $('mini-check').querySelectorAll('button').forEach(b => b.classList.toggle('correct', Number(b.dataset.option) === check.correct && checkAnswer === check.correct));
      $('mini-check').querySelector('.check-feedback').textContent = checkAnswer === check.correct ? check.yes : check.no;
    }));
  }

  function loadStep(c, s, animate = true) {
    stopPlayback();
    stopSpeech();
    chapterIndex = c;
    stepIndex = s;
    checkAnswer = null;
    const current = step();
    const count = chapter().steps.length;
    $('chapters').querySelectorAll('button').forEach((button, i) => {
      button.classList.toggle('active', i === c);
      button.setAttribute('aria-current', i === c ? 'step' : 'false');
    });
    $('scene-tag').textContent = current.reverse ? '倒回去看 · 用离开时刻倒推' : chapter().tag;
    $('step-count').textContent = `本章第 ${s + 1} / ${count} 小步`;
    $('lesson-copy').innerHTML = `<h2>${current.title}</h2>${current.body}`;
    $('zoom-panel').hidden = !current.zoom;
    $('legend-overlap').hidden = !isSlow();
    $('distance-panel').hidden = !current.distances;
    $('milestones').hidden = !isSlow();
    $('time-slider').max = isSlow() ? 28.5 : 24;
    $('time-range').textContent = isSlow() ? '0—28.5 秒 · 已计入减速' : '0—24 秒';
    $('prev').disabled = c === 0 && s === 0;
    $('next').textContent = c === chapters.length - 1 && s === count - 1 ? '从头再看 ↺' : s === count - 1 ? '进入下一问 →' : '看懂了，下一步 →';
    if (c === 0 && s === count - 1) $('next').textContent = '开始第（1）问 →';
    $('step-dots').innerHTML = chapter().steps.map((item, i) => `<button class="${i === s ? 'active' : ''}" aria-label="第${i + 1}步：${item.title}" ${i === s ? 'aria-current="step"' : ''} data-step="${i}"></button>`).join('');
    $('step-dots').querySelectorAll('button').forEach(b => b.addEventListener('click', () => loadStep(c, Number(b.dataset.step))));
    const ticks = isSlow() ? [{t:0,l:'出发'},{t:4,l:'4'},{t:10,l:'10'},{t:15,l:'15 掉头'},{t:20.5,l:'20.5'},{t:28.5,l:'28.5 停'}] : [{t:0,l:'出发'},{t:5,l:'5'},{t:12,l:'12 掉头'},{t:20,l:'20'},{t:24,l:'24 停'}];
    $('timeline-labels').innerHTML = ticks.map(item => `<button style="left:${item.t / (isSlow() ? 28.5 : 24) * 100}%" data-time="${item.t}" aria-label="查看第${item.t}秒">${item.l}</button>`).join('');
    $('timeline-labels').querySelectorAll('button').forEach(b => b.addEventListener('click', () => seek(Number(b.dataset.time))));
    renderCheck();
    updateScene(current.from);
    $('scrub-hint').textContent = '每一小步播完都会停下来，等你看懂。';
    history.replaceState(null, '', `#${c + 1}-${s + 1}`);
    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) playStep(true);
  }

  function seek(time) {
    stopPlayback();
    updateScene(time);
    $('scrub-hint').textContent = '自由观察中。右边讲解仍是本步内容；点“重看”可回到本步演示。';
  }

  $('chapters').innerHTML = chapters.map((c, i) => `<button class="chapter" data-chapter="${i}"><span class="num">${i === 0 ? '○' : i}</span><span><strong>${c.title}</strong><small>${c.subtitle}</small></span></button>`).join('');
  $('chapters').querySelectorAll('button').forEach(b => b.addEventListener('click', () => loadStep(Number(b.dataset.chapter), 0)));
  $('play').addEventListener('click', () => playStep());
  $('replay').addEventListener('click', () => { stopPlayback(); updateScene(step().from); playStep(true); });
  $('time-slider').addEventListener('input', event => seek(Number(event.target.value)));
  $('next').addEventListener('click', () => {
    if (stepIndex + 1 < chapter().steps.length) loadStep(chapterIndex, stepIndex + 1);
    else if (chapterIndex + 1 < chapters.length) loadStep(chapterIndex + 1, 0);
    else loadStep(0, 0, false);
    if (window.innerWidth <= 760) $('stage').scrollIntoView({ block: 'start', behavior: 'auto' });
  });
  $('prev').addEventListener('click', () => {
    if (stepIndex > 0) loadStep(chapterIndex, stepIndex - 1);
    else if (chapterIndex > 0) loadStep(chapterIndex - 1, chapters[chapterIndex - 1].steps.length - 1);
  });
  $('problem-open').addEventListener('click', () => {
    $('problem').hidden = !$('problem').hidden;
    $('problem-open').setAttribute('aria-expanded', String(!$('problem').hidden));
    $('problem-open').textContent = $('problem').hidden ? '查看完整题目 ↗' : '收起题目 ↑';
  });

  if (!('speechSynthesis' in window)) $('speak').hidden = true;
  $('speak').addEventListener('click', () => {
    if (speaking) { stopSpeech(); return; }
    stopSpeech();
    const token = speechToken;
    const source = document.createElement('div');
    source.innerHTML = `<h2>${step().title}。</h2>${step().body}`;
    source.querySelectorAll('br').forEach(node => node.replaceWith('。'));
    source.querySelectorAll('p, div, h2, small').forEach(node => node.append('。'));
    const names = { CQ: 'C Q', PM: 'P M', PQ: 'P Q', MN: 'M N', CM: 'C M' };
    const text = source.textContent.replace(/CQ|PM|PQ|MN|CM/g, value => names[value]).replace(/(?<![\dA-Za-z)）])−(?=\d)/g, '负').replace(/−/g, '减').replace(/→/g, '变为').replace(/＝/g, '等于').replace(/÷/g, '除以').replace(/×/g, '乘').replace(/＋/g, '加').replace(/≥/g, '大于或等于').replace(/～/g, '到');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.85;
    utterance.onend = () => { if (token === speechToken) stopSpeech(); };
    utterance.onerror = event => {
      if (token !== speechToken) return;
      stopSpeech();
      if (event.error !== 'canceled' && event.error !== 'interrupted') $('speak').textContent = '当前浏览器无法朗读';
    };
    speaking = true;
    $('speak').textContent = '■ 停止朗读';
    $('speak').setAttribute('aria-pressed', 'true');
    window.speechSynthesis.speak(utterance);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopPlayback(); stopSpeech(); } });
  window.addEventListener('pagehide', () => { stopPlayback(); stopSpeech(); });
  window.addEventListener('hashchange', () => {
    const match = location.hash.match(/^#(\d+)-(\d+)$/);
    if (match && chapters[Number(match[1]) - 1]?.steps[Number(match[2]) - 1]) loadStep(Number(match[1]) - 1, Number(match[2]) - 1, false);
  });

  const descriptions = ['去程 · 重合变长', '去程 · 重合变短', '返程 · 重合变长', '返程 · 重合变短'];
  const targetSteps = [3, 5, 9, 10];
  const fractions = ['11/2', '17/2', '73/4', '79/4'];
  $('milestone-buttons').innerHTML = targets.map((t, i) => `<button class="moment" data-target="${i}"><small>${descriptions[i]}</small><strong>${t} 秒</strong><small>t ＝ ${fractions[i]}　·　重合 1.5</small></button>`).join('');
  $('milestone-buttons').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    const i = Number(button.dataset.target);
    loadStep(3, targetSteps[i], false);
    updateScene(targets[i]);
    $('scrub-hint').textContent = '已停在答案时刻。看放大图中的绿色部分，长度正好是 1.5。';
    if (window.innerWidth <= 760) $('zoom-panel').scrollIntoView({ block: 'center', behavior: 'auto' });
  }));
  $('recap-content').innerHTML = `
    <h3>（1）20 秒的位置</h3><p>去程需 36÷3＝12 秒。t＝20 时已返回 8 秒。<br>M＝−12＋20＝<strong>8</strong>；Q＝16−3×8＝<strong>−8</strong>。</p>
    <h3>（2）CQ＝PM</h3><p>去程，P 第 5 秒追上 M，此时 CQ＝21、PM＝0。之后 CQ 每秒减 3，PM 每秒增 2。再过 21÷5＝4.2 秒相等，t＝9.2，<strong>M＝−2.8＝−14/5</strong>。</p><p>返程，第 12 秒 CQ＝0、PM＝14。之后 CQ 每秒增 3，PM 每秒减 4。再过 14÷7＝2 秒相等，t＝14，<strong>M＝2</strong>。</p><p>检查其余阶段：0～5 秒 CQ≥21、PM≤10。第 15.5 秒 P 与 M 相遇，此时 CQ＝10.5、PM＝0。之后 PM 每秒比 CQ 多增加 1 格，追平需 10.5 秒；实际只剩 8.5 秒，所以不会再次相等。</p>
    <h3>（3）重合减速后的时间，要重新累计</h3><table><thead><tr><th>事件</th><th>实际时刻</th><th>怎么得到</th></tr></thead><tbody>
    <tr><td>第一次接触 Q＝M</td><td>4 秒</td><td>8÷(3−1)</td></tr><tr><td>第一次重合结束 P＝N</td><td>10 秒</td><td>4＋(2＋4)÷(1.5−0.5)</td></tr><tr><td>Q 到 C 掉头</td><td>15 秒</td><td>10＋(16−1)÷3</td></tr><tr><td>第二次接触 P＝N</td><td>17.5 秒</td><td>15＋(14−4)÷(3＋1)</td></tr><tr><td>第二次重合结束 Q＝M</td><td>20.5 秒</td><td>17.5＋(2＋4)÷(1.5＋0.5)</td></tr><tr><td>Q 回 A，全部停止</td><td>28.5 秒</td><td>20.5＋(4＋20)÷3</td></tr></tbody></table>
    <p>去程重合变化速度为 1 格/秒：4＋1.5＝<strong>5.5</strong>，10−1.5＝<strong>8.5</strong>。<br>返程重合变化速度为 2 格/秒：17.5＋0.75＝<strong>18.25</strong>，20.5−0.75＝<strong>19.75</strong>。</p><p>答案：<strong>t＝11/2、17/2、73/4、79/4 秒</strong>。重合最长为 2，中间有保持 2 的阶段；两次穿过各有两个答案。</p>`;

  const initial = location.hash.match(/^#(\d+)-(\d+)$/);
  if (initial && chapters[Number(initial[1]) - 1]?.steps[Number(initial[2]) - 1]) loadStep(Number(initial[1]) - 1, Number(initial[2]) - 1, false);
  else loadStep(0, 0, false);
})();
