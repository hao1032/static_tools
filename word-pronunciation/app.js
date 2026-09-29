/* 英文单词发音练习 · 逻辑
 * 音素切分 → 口型表（viseme） → 双视图渲染 → 时间轴动画 → 真人发音 + TTS 兜底
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  /* ================================ 音素库 ================================ */
  /* 国际音标符号，长 → 短排列（贪心切分时优先匹配长符号） */
  const PHONEMES = [
    'tʃ','dʒ','aɪ','aʊ','eɪ','oʊ','ɔɪ','ɪə','eə','ʊə',
    'uː','iː','ɑː','ɔː','ɜː','æ','ʌ','ə','ɚ','ɝ','ʃ','ʒ',
    'θ','ð','ŋ','r','l','w','j','p','b','t','d','k','g','f','v',
    's','z','m','n','h','ɪ','e','ʊ','ɔ','ɑ','i','u'
  ];
  /* 元音列表（切分后判断音节数，元音 ≈ 音节数，用于估算 TTS 时长） */
  const VOWELS = new Set(['aɪ','aʊ','eɪ','oʊ','ɔɪ','ɪə','eə','ʊə',
                          'uː','iː','ɑː','ɔː','ɜː','æ','ʌ','ə','ɚ','ɝ',
                          'ɪ','e','ʊ','ɔ','ɑ','i','u']);

  /**
   * 把音标字符串切成音素序列
   * @param {string} ipa  如 "/ˈpensl/" 或 "/θriː/"
   * @returns {{sym:string, stress:boolean}[]}  sym=音素, stress=该音节是否重读
   */
  function splitIPA(ipa) {
    // 归一化：词库里常写出 U+0261「ɡ」（手写体 g），与 ASCII「g」是同一个音，统一成后者
    let s = ipa.replace(/\//g, '').replace(/ɡ/g, 'g');
    const result = [];
    let i = 0, stress = false;
    while (i < s.length) {
      const c = s[i];
      if (c === 'ˈ') { stress = true; i++; continue; }    // 主重音
      if (c === 'ˌ') { stress = true; i++; continue; }    // 次重音
      if (c === ' ' || c === '.') { i++; continue; }      // 跳过空格、音节分隔点

      let matched = false;
      for (const ph of PHONEMES) {
        if (s.substring(i, i + ph.length) === ph) {
          result.push({ sym: ph, stress });
          i += ph.length;
          if (VOWELS.has(ph)) stress = false;  // 重音只标在下一个元音上
          matched = true;
          break;
        }
      }
      if (!matched) {
        console.warn('[splitIPA] 未识别符号:', s[i], 'in', ipa);
        i++;  // 跳过
      }
    }
    return result;
  }

  /* ================================ 口型表（viseme） ================================ */
  /* 每个 viseme 是一组数值参数，正脸和侧脸两个渲染函数都从这组参数算出各自的形状 */
  const VISEME = {
    MBP:    { jaw:0.00, round:0.0, spread:0.0, teeth:'closed', tip:'rest',     high:'mid',  voiced:false, label:'双唇闭拢' },
    FV:     { jaw:0.12, round:0.0, spread:0.1, teeth:'lip',    tip:'lowerLip', high:'mid',  voiced:true,  label:'上齿轻咬下唇' },
    TH:     { jaw:0.20, round:0.0, spread:0.2, teeth:'open',   tip:'between',  high:'mid',  voiced:true,  label:'舌尖伸进齿间' },
    TDN:    { jaw:0.18, round:0.0, spread:0.1, teeth:'open',   tip:'ridge',    high:'mid',  voiced:true,  label:'舌尖顶上牙床' },
    L:      { jaw:0.25, round:0.0, spread:0.1, teeth:'open',   tip:'ridge',    high:'mid',  voiced:true,  label:'舌尖抵上牙床、舌两侧下落' },
    SZ:     { jaw:0.05, round:0.0, spread:0.5, teeth:'near',   tip:'behind',   high:'high', voiced:false, label:'齿间留细缝、嘴角拉开' },
    SH:     { jaw:0.15, round:0.7, spread:0.0, teeth:'near',   tip:'behind',   high:'high', voiced:false, label:'双唇前噘、舌尖后缩' },
    KGN:    { jaw:0.28, round:0.0, spread:0.1, teeth:'open',   tip:'down',     high:'back', voiced:true,  label:'舌根抬起抵软腭' },
    R:      { jaw:0.22, round:0.5, spread:0.0, teeth:'open',   tip:'curled',   high:'high', voiced:true,  label:'舌尖卷起不碰牙' },
    W:      { jaw:0.10, round:1.0, spread:0.0, teeth:'near',   tip:'rest',     high:'high', voiced:true,  label:'双唇收圆前突' },
    Y:      { jaw:0.15, round:0.0, spread:0.8, teeth:'near',   tip:'behind',   high:'high', voiced:true,  label:'嘴角向两边拉开' },
    AH:     { jaw:1.00, round:0.0, spread:0.2, teeth:'open',   tip:'down',     high:'low',  voiced:true,  label:'嘴张大、舌放平' },
    AA:     { jaw:0.70, round:0.1, spread:0.3, teeth:'open',   tip:'down',     high:'mid',  voiced:true,  label:'嘴张开、舌稍后' },
    EE:     { jaw:0.25, round:0.0, spread:1.0, teeth:'near',   tip:'behind',   high:'high', voiced:true,  label:'嘴角拉开像微笑' },
    IH:     { jaw:0.35, round:0.0, spread:0.6, teeth:'open',   tip:'behind',   high:'high', voiced:true,  label:'嘴微张、舌位高' },
    OO:     { jaw:0.30, round:1.0, spread:0.0, teeth:'near',   tip:'behind',   high:'high', voiced:true,  label:'双唇收圆' },
    UW:     { jaw:0.20, round:1.0, spread:0.0, teeth:'near',   tip:'behind',   high:'high', voiced:true,  label:'双唇小圆突出' },
    ER:     { jaw:0.35, round:0.4, spread:0.1, teeth:'open',   tip:'curled',   high:'mid',  voiced:true,  label:'舌中部抬起、舌尖略卷' },
    SCHWA:  { jaw:0.30, round:0.1, spread:0.2, teeth:'open',   tip:'rest',     high:'mid',  voiced:true,  label:'最放松的短音，轻轻带过' },
    HH:     { jaw:0.45, round:0.1, spread:0.3, teeth:'open',   tip:'rest',     high:'mid',  voiced:false, label:'像哈气一样送出气流' },
    NEUTRAL:{ jaw:0.15, round:0.1, spread:0.2, teeth:'near',   tip:'rest',     high:'mid',  voiced:false, label:'准备' }
  };

  /* 音素 → viseme 映射 */
  const PHONEME_TO_VISEME = {
    // 辅音
    'p':'MBP','b':'MBP','m':'MBP',
    'f':'FV','v':'FV',
    'θ':'TH','ð':'TH',
    't':'TDN','d':'TDN','n':'TDN',
    'l':'L',
    's':'SZ','z':'SZ',
    'ʃ':'SH','ʒ':'SH','tʃ':'SH','dʒ':'SH',
    'k':'KGN','g':'KGN','ŋ':'KGN',
    'r':'R',
    'w':'W',
    'j':'Y',
    'h':'HH',
    // 元音
    'æ':'AH','ʌ':'AH','aɪ':'AH','aʊ':'AH',
    'ɑː':'AA','ɑ':'AA','ɔː':'AA','ɔ':'AA',
    'iː':'EE','eɪ':'EE','e':'IH','ɪ':'IH','i':'EE',
    'uː':'UW','oʊ':'OO','ʊ':'OO','u':'UW',
    'ɜː':'ER','ɚ':'ER','ɝ':'ER',
    'ə':'SCHWA',
    // 双元音的第二部分（近似）
    'ɔɪ':'OO','ɪə':'IH','eə':'EE','ʊə':'OO'
  };

  function getViseme(phoneme) {
    const key = PHONEME_TO_VISEME[phoneme];
    return key ? VISEME[key] : VISEME.NEUTRAL;
  }

  /* ================================ 双视图渲染 ================================ */
  const ffLips = $('ffLips'), ffCavity = $('ffCavity'), ffTeeth = $('ffTeeth'), ffTongue = $('ffTongue');
  const ffVoice = $('ffVoice');
  const pfTongue = $('pfTongue'), pfUpperLip = $('pfUpperLip'), pfLowerLip = $('pfLowerLip');
  const pfUpperTeeth = $('pfUpperTeeth'), pfLowerTeeth = $('pfLowerTeeth'), pfCavity = $('pfCavity');

  /* 缓动插值 */
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* 正脸：椭圆嘴 + 牙齿 + 舌尖 */
  function renderFrontFace(v, smooth = true) {
    const CX = 110, CY = 162;
    // 嘴宽 = 基础 32 + spread*20 - round*10
    const rxBase = 32 + v.spread * 20 - v.round * 10;
    // 嘴高 = 基础 9 + jaw*25 + round*6
    const ryBase = 9 + v.jaw * 25 + v.round * 6;

    ffLips.setAttribute('cx', CX);
    ffLips.setAttribute('cy', CY);
    ffLips.setAttribute('rx', rxBase);
    ffLips.setAttribute('ry', ryBase);

    // 口腔
    const cavRx = Math.max(2, rxBase - 7);
    const cavRy = Math.max(1, ryBase - 6);
    ffCavity.setAttribute('cx', CX);
    ffCavity.setAttribute('cy', CY);
    ffCavity.setAttribute('rx', cavRx);
    ffCavity.setAttribute('ry', cavRy);
    ffCavity.style.opacity = v.jaw > 0.08 ? '1' : '0';

    // 上齿
    if (v.teeth === 'closed' || v.teeth === 'near') {
      ffTeeth.setAttribute('x', CX - 24);
      ffTeeth.setAttribute('y', CY - ryBase - 1);
      ffTeeth.setAttribute('width', 48);
      ffTeeth.setAttribute('height', 4);
      ffTeeth.style.opacity = '1';
      ffTeeth.classList.remove('on-lip');
    } else if (v.teeth === 'lip') {
      // 上齿咬下唇：齿压在下唇上
      ffTeeth.setAttribute('x', CX - 22);
      ffTeeth.setAttribute('y', CY + ryBase - 5);
      ffTeeth.setAttribute('width', 44);
      ffTeeth.setAttribute('height', 5);
      ffTeeth.style.opacity = '1';
      ffTeeth.classList.add('on-lip');
    } else {
      ffTeeth.style.opacity = '0';
    }

    // 舌尖
    if (v.tip === 'between') {
      // TH：舌尖伸出来
      ffTongue.setAttribute('cx', CX);
      ffTongue.setAttribute('cy', CY);
      ffTongue.setAttribute('rx', 15);
      ffTongue.setAttribute('ry', 4);
      ffTongue.style.opacity = '1';
    } else if (v.tip === 'ridge' && v.jaw > 0.15) {
      // L/T/D/N：舌尖淡淡露一点
      ffTongue.setAttribute('cx', CX);
      ffTongue.setAttribute('cy', CY - 4);
      ffTongue.setAttribute('rx', 12);
      ffTongue.setAttribute('ry', 3);
      ffTongue.style.opacity = '0.6';
    } else {
      ffTongue.style.opacity = '0';
    }

    // 声带（浊音）
    ffVoice.classList.toggle('on', v.voiced);
  }

  /* 侧脸：舌头路径 + 上下唇 + 牙齿 */
  function renderSideFace(v) {
    const BASE_JAW_Y = 152;
    const jawY = BASE_JAW_Y + v.jaw * 26;  // 下巴下移

    // 舌头：一条由控制点定义的路径
    let tongueD = '';
    const tipX = v.tip === 'between' ? 156 :
                 v.tip === 'ridge' ? 147 :
                 v.tip === 'curled' ? 132 :
                 v.tip === 'behind' ? 138 :
                 v.tip === 'lowerLip' ? 148 :
                 v.tip === 'down' ? 135 : 138;
    const tipY = v.tip === 'between' ? 112 :
                 v.tip === 'ridge' ? 104 :
                 v.tip === 'curled' ? 114 :
                 v.tip === 'behind' ? 120 :
                 v.tip === 'lowerLip' ? jawY - 8 :
                 v.tip === 'down' ? jawY - 18 : 120;

    const backH = v.high === 'high' ? -12 :
                  v.high === 'back' ? -18 :
                  v.high === 'low' ? 8 : 0;

    tongueD = `M 96 ${jawY - 12}
               Q 105 ${jawY - 16}, 115 ${128 + backH}
               Q 125 ${118 + backH}, ${tipX} ${tipY}
               Q ${tipX - 6} ${tipY + 10}, ${tipX - 12} ${tipY + 14}
               Q 105 ${jawY - 6}, 96 ${jawY - 8}
               Z`;
    pfTongue.setAttribute('d', tongueD);

    // 上唇（固定在 y=104 附近，round 时略前突）
    const ulipX = 150 + v.round * 8 - v.spread * 3;
    const ulipY = 104;
    pfUpperLip.setAttribute('d', `M ${ulipX} ${ulipY} Q ${ulipX + 4} ${ulipY + 6}, ${ulipX} ${ulipY + 10}`);

    // 下唇 + 下巴
    const llipX = 150 + v.round * 6 - v.spread * 2;
    const llipY = jawY - 4;
    pfLowerLip.setAttribute('d', `M ${llipX} ${llipY} Q ${llipX + 3} ${llipY + 8}, ${llipX - 2} ${llipY + 12}
                                  L ${llipX - 2} ${jawY + 8}
                                  Q ${llipX - 18} ${jawY + 10}, 100 ${jawY}
                                  L 100 ${llipY - 6}
                                  Z`);

    // 上下牙齿
    if (v.teeth === 'closed' || v.teeth === 'near' || v.teeth === 'lip') {
      pfUpperTeeth.setAttribute('x', 142);
      pfUpperTeeth.setAttribute('y', 103);
      pfUpperTeeth.setAttribute('width', 12);
      pfUpperTeeth.setAttribute('height', 4);
      pfUpperTeeth.style.opacity = '1';

      pfLowerTeeth.setAttribute('x', 140);
      pfLowerTeeth.setAttribute('y', jawY - 6);
      pfLowerTeeth.setAttribute('width', 12);
      pfLowerTeeth.setAttribute('height', 4);
      pfLowerTeeth.style.opacity = v.teeth === 'closed' ? '1' : '0.7';
    } else {
      pfUpperTeeth.style.opacity = '0.6';
      pfLowerTeeth.style.opacity = '0';
    }

    // 口腔矩形（张口时可见）
    pfCavity.setAttribute('d', `M 150 104 L 150 ${jawY} L 100 ${jawY} L 100 104 Z`);
    pfCavity.style.opacity = v.jaw > 0.1 ? '1' : '0';
  }

  /* ================================ 动画时间轴 ================================ */
  let currentAnim = null;
  let runId = 0;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 缓动补间：从 from 到 to，时长 dur，每帧调 fn(v, progress) */
  function tween(dur, from, to, fn, myRun) {
    return new Promise((resolve) => {
      if (prefersReducedMotion || dur < 20) {
        // 无缓动，直接跳到终点
        fn(to, 1);
        resolve(myRun === runId);
        return;
      }
      const t0 = performance.now();
      function frame(t) {
        if (myRun !== runId) return resolve(false);
        const p = Math.min(1, (t - t0) / dur);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const v = {};
        for (const k in from) {
          v[k] = typeof from[k] === 'number' ? lerp(from[k], to[k], eased) : to[k];
        }
        fn(v, p);
        if (p < 1) requestAnimationFrame(frame); else resolve(myRun === runId);
      }
      requestAnimationFrame(frame);
    });
  }

  /* 睡眠 */
  function sleep(ms, myRun) {
    return new Promise((res) => setTimeout(() => res(myRun === undefined || myRun === runId), ms));
  }

  /**
   * 播放口型动画
   * @param {Array} phonemes  音素序列 [{sym, stress}]
   * @param {number} totalDur  总时长（秒）
   * @param {number} myRun  运行令牌
   */
  async function playVisemeTimeline(phonemes, totalDur, myRun) {
    if (!state.options.face) return;  // 口型动画已关闭
    if (phonemes.length === 0) return;

    // 计算每个音素的权重：元音 1.8，辅音 0.9
    const weights = phonemes.map(p => VOWELS.has(p.sym) ? 1.8 : 0.9);
    const sumW = weights.reduce((a, b) => a + b, 0);

    // 留 6% 前导 + 8% 尾部余量（真人音频首尾常有静音）
    const activeStart = totalDur * 0.06;
    const activeEnd = totalDur * 0.92;
    const activeDur = activeEnd - activeStart;

    await sleep(activeStart * 1000, myRun);
    if (myRun !== runId) return;

    let prev = VISEME.NEUTRAL;
    for (let i = 0; i < phonemes.length; i++) {
      const ph = phonemes[i];
      const v = getViseme(ph.sym);
      const dur = (weights[i] / sumW) * activeDur * 1000;  // 本音素时长（毫秒）

      // 更新提示条
      if (state.options.cue) {
        $('cuePh').textContent = ph.sym;
        $('cueTip').textContent = v.label;
        $('cueBar').classList.remove('idle');
      }

      // 缓动 ~90ms 过渡到新口型
      const transitionDur = Math.min(90, dur * 0.3);
      const ok = await tween(transitionDur, prev, v, (blended) => {
        renderFrontFace(blended);
        renderSideFace(blended);
      }, myRun);
      if (!ok) return;

      // 保持当前口型到本音素结束
      const holdDur = dur - transitionDur;
      if (holdDur > 0) {
        if (!(await sleep(holdDur, myRun))) return;
      }

      prev = v;
    }

    // 回到中性
    await sleep((totalDur - activeEnd) * 1000, myRun);
    if (myRun !== runId) return;
    await tween(120, prev, VISEME.NEUTRAL, (v) => {
      renderFrontFace(v);
      renderSideFace(v);
    }, myRun);

    // 提示条闲置
    if (state.options.cue) {
      $('cuePh').textContent = '—';
      $('cueTip').textContent = '点「读单词」，跟着口型读一遍';
      $('cueBar').classList.add('idle');
    }
  }

  /* ================================ 发音播放（双路 + 兜底） ================================ */
  const audioCache = new Map();
  let fallbackShown = false;

  /* 领取一个播放令牌：令牌一变，正在跑的音频/动画就自行退出。
     规则是「谁发起谁领令牌，play() 不再自增」，否则调用方传进来的值
     会被内部自增冲掉，导致条件判断把这次播放直接吞掉。 */
  function claim() { return ++runId; }

  function youdaoUrl(text, accent) {
    return 'https://dict.youdao.com/dictvoice?type=' + (accent === 'uk' ? 1 : 2) +
           '&audio=' + encodeURIComponent(text);
  }

  /**
   * 播放真人音频（有道）
   * @returns {Promise<number>} 实际播放的时长（秒），失败返回 0
   */
  function playRealAudio(text, rate, myRun) {
    return new Promise((resolve) => {
      const url = youdaoUrl(text, state.options.accent);

      // 按 URL 缓存：同一个词重复点读不重复下载，换语速也只是改 playbackRate
      let audio = audioCache.get(url);
      if (!audio) {
        audio = new Audio(url);
        audio.preload = 'auto';
        audioCache.set(url, audio);
      }

      const stop = () => { try { audio.pause(); } catch (_) {} };

      stop();  // 上一个声音立刻让位
      audio.playbackRate = rate;
      if ('preservesPitch' in audio) audio.preservesPitch = true;  // 慢速不变调

      let timer = null;
      let poll = null;
      let done = false;
      function finish(dur) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (poll) clearInterval(poll);
        audio.onplaying = null;
        audio.onended = null;
        audio.onerror = null;
        resolve(dur);
      }

      // 4 秒还没出声（离线 / 接口慢 / 被拦）→ 停掉并交回上层走兜底
      timer = setTimeout(() => { stop(); finish(0); }, 4000);

      audio.onplaying = () => {
        if (timer) clearTimeout(timer);
        timer = null;
      };
      audio.onended = () => finish(audio.duration || 0);
      audio.onerror = () => finish(0);

      // 令牌失效（用户点了别的词）→ 立刻停下这一路
      poll = setInterval(() => {
        if (myRun !== runId) { stop(); finish(0); }
      }, 100);

      try {
        audio.currentTime = 0;
      } catch (_) {}
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => finish(0));
    });
  }

  /**
   * 播放 TTS
   * @returns {Promise<number>} 估算的时长（秒）
   */
  function playTTS(text, rate, syllables, myRun) {
    const estimate = () => (syllables * 0.32 + 0.35) / rate;
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve(0);
        return;
      }

      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = rate;

      let poll = null;
      let done = false;
      function finish() {
        if (done) return;
        done = true;
        if (poll) clearInterval(poll);
        resolve(estimate());
      }

      u.onend = finish;
      u.onerror = finish;

      // 令牌失效 → 掐掉这一路
      poll = setInterval(() => {
        if (myRun !== runId) {
          speechSynthesis.cancel();
          finish();
        }
      }, 100);

      speechSynthesis.speak(u);
    });
  }

  /**
   * 统一播放入口：真人优先，失败兜底 TTS
   * @param {number} [token] 由 claim() 取得的令牌；省略则内部自己领一个
   */
  async function play(text, phonemes, rate, token) {
    if (token === undefined) token = claim();

    const syllables = phonemes.filter(p => VOWELS.has(p.sym)).length || 1;

    let dur = 0;
    if (state.options.accent === 'tts') {
      // 用户选了「浏览器合成」
      dur = await playTTS(text, rate, syllables, token);
    } else {
      // 用户选了「真人」
      dur = await playRealAudio(text, rate, token);
      if (token !== runId) return;          // 期间被别的播放顶掉了，不再兜底
      if (dur === 0) {
        // 真人失败 → TTS 兜底
        if (!fallbackShown) {
          fallbackShown = true;
          const note = $('fallbackNote');
          note.textContent = '真人发音暂时不可用（离线或接口异常），已改用浏览器合成语音。';
          note.hidden = false;
        }
        dur = await playTTS(text, rate, syllables, token);
      }
    }

    if (dur > 0 && token === runId) {
      await playVisemeTimeline(phonemes, dur, token);
    }
  }

  /* ================================ 状态 ================================ */
  const LS_KEY = 'word-pronunciation:state';
  /* 用户是否跟页面交互过（浏览器自动播放策略：首次交互前不能自动出声） */
  let userInteracted = false;
  const state = {
    topic: '',
    mode: 'card',
    practiced: {},  // { '三年级上·文具': [0, 3, 5], ... }
    options: {
      accent: 'us',
      rate: 1,
      face: true,
      cue: true,
      phonetic: true,
      sentence: true,
      emoji: true,
      autoPlay: true
    }
  };

  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY)) || {};
      state.topic = saved.topic || Object.keys(window.WORD_BANK)[0];
      state.mode = saved.mode === 'list' ? 'list' : 'card';
      state.practiced = saved.practiced || {};
      Object.assign(state.options, saved.options || {});
    } catch (_) {
      state.topic = Object.keys(window.WORD_BANK)[0];
    }
  }

  /* ================================ 卡片闯关 ================================ */
  let currentIndex = -1;

  function getCurrentWords() {
    return window.WORD_BANK[state.topic] || [];
  }

  function getPracticedIndices() {
    return state.practiced[state.topic] || [];
  }

  function setPracticedIndices(arr) {
    state.practiced[state.topic] = arr;
    saveState();
  }

  function showCard(idx) {
    const words = getCurrentWords();
    if (idx < 0 || idx >= words.length) {
      showDone();
      return;
    }

    currentIndex = idx;
    const w = words[idx];

    $('wordCard').hidden = false;
    $('doneCard').hidden = true;

    $('wcEmoji').textContent = w.emoji;
    $('wcWord').textContent = w.word;
    $('wcPhonetic').textContent = w.phonetic;
    $('wcMeaning').textContent = w.meaning;
    $('wcSentence').textContent = w.sentence;

    // 自动朗读：必须等用户先跟页面交互过。
    // 否则首次加载的自动播放会被浏览器的自动播放策略拦下，
    // 被拒的 play() 看起来和「接口坏了」一样，会误弹兜底提示。
    if (state.options.autoPlay && userInteracted) {
      setTimeout(() => {
        if (currentIndex === idx) playCurrentWord();
      }, 300);
    }

    applyOptions();
    updateProgress();
  }

  function showDone() {
    $('wordCard').hidden = true;
    $('doneCard').hidden = false;
    $('doneSub').textContent = `已练 ${getCurrentWords().length} 个单词`;
    updateProgress();
  }

  function nextWord() {
    const words = getCurrentWords();
    const practiced = getPracticedIndices();
    const unpracticed = words.map((_, i) => i).filter(i => !practiced.includes(i));

    if (unpracticed.length === 0) {
      showDone();
    } else {
      showCard(unpracticed[0]);
    }
  }

  function markPracticed() {
    if (currentIndex < 0) return;
    const practiced = getPracticedIndices();
    if (!practiced.includes(currentIndex)) {
      practiced.push(currentIndex);
      setPracticedIndices(practiced);
    }
    updateProgress();
  }

  function playCurrentWord() {
    const words = getCurrentWords();
    if (currentIndex < 0 || currentIndex >= words.length) return;
    const w = words[currentIndex];
    const ph = splitIPA(w.phonetic);
    play(w.word, ph, state.options.rate, claim());
  }

  function playCurrentSentence() {
    const words = getCurrentWords();
    if (currentIndex < 0 || currentIndex >= words.length) return;
    const w = words[currentIndex];
    // 例句不做口型（音标对不上），只朗读
    const token = claim();
    if (state.options.accent === 'tts') {
      playTTS(w.sentence, state.options.rate, 5, token);
    } else {
      playRealAudio(w.sentence, state.options.rate, token).then((dur) => {
        if (dur === 0 && token === runId) playTTS(w.sentence, state.options.rate, 5, token);
      });
    }
  }

  function playSlow() {
    // 慢速重放单词，专门用来看清口型
    const words = getCurrentWords();
    if (currentIndex < 0 || currentIndex >= words.length) return;
    const w = words[currentIndex];
    const ph = splitIPA(w.phonetic);
    play(w.word, ph, 0.6, claim());
  }

  /* ================================ 词表点读 ================================ */
  function renderWordList() {
    const words = getCurrentWords();
    const practiced = getPracticedIndices();
    const html = words.map((w, i) => {
      const done = practiced.includes(i) ? ' done' : '';
      return `<div class="wl-row${done}" data-idx="${i}">
        <span class="wl-emoji">${w.emoji}</span>
        <div class="wl-main">
          <span class="wl-word">${w.word}</span>
          <span class="wl-phon">${w.phonetic}</span>
          <span class="wl-meaning">${w.meaning}</span>
        </div>
        <span class="wl-tick">✓</span>
        <button class="wl-play" type="button" aria-label="播放">🔊</button>
      </div>`;
    }).join('');
    $('wordList').innerHTML = html;

    // 绑定点击
    $('wordList').querySelectorAll('.wl-row').forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelector('.wl-play').addEventListener('click', () => playListWord(idx, row));
    });

    applyOptions();
    updateProgress();
  }

  async function playListWord(idx, row) {
    const words = getCurrentWords();
    if (idx < 0 || idx >= words.length) return;
    const w = words[idx];
    const ph = splitIPA(w.phonetic);

    // 领令牌：点了别的词，这一路立刻退出
    const thisRun = claim();

    row.classList.add('playing');

    // 播单词（口型动画跟着走）
    await play(w.word, ph, state.options.rate, thisRun);
    if (thisRun !== runId) {
      row.classList.remove('playing');
      return;
    }

    // 间隔
    await sleep(350, thisRun);
    if (thisRun !== runId) {
      row.classList.remove('playing');
      return;
    }

    // 播例句（无口型）
    if (state.options.accent === 'tts') {
      await playTTS(w.sentence, state.options.rate, 5, thisRun);
    } else {
      const dur = await playRealAudio(w.sentence, state.options.rate, thisRun);
      if (dur === 0 && thisRun === runId) {
        await playTTS(w.sentence, state.options.rate, 5, thisRun);
      }
    }

    if (thisRun !== runId) {
      row.classList.remove('playing');
      return;
    }

    row.classList.remove('playing');

    // 标为已练
    const practiced = getPracticedIndices();
    if (!practiced.includes(idx)) {
      practiced.push(idx);
      setPracticedIndices(practiced);
      row.classList.add('done');
      updateProgress();
    }
  }

  /* ================================ 进度 ================================ */
  function updateProgress() {
    const words = getCurrentWords();
    const practiced = getPracticedIndices();
    const pct = words.length > 0 ? (practiced.length / words.length) * 100 : 0;

    $('progressFill').style.width = pct + '%';
    $('progressText').textContent = `已练 ${practiced.length} / ${words.length}`;
  }

  /* ================================ 选项应用 ================================ */
  function applyOptions() {
    // 卡片
    $('wcEmoji').style.display = state.options.emoji ? '' : 'none';
    $('wcPhonetic').style.display = state.options.phonetic ? '' : 'none';
    $('wcSentence').style.display = state.options.sentence ? '' : 'none';

    // 词表
    document.querySelectorAll('.wl-emoji').forEach(el => {
      el.style.display = state.options.emoji ? '' : 'none';
    });
    document.querySelectorAll('.wl-phon').forEach(el => {
      el.style.display = state.options.phonetic ? '' : 'none';
    });

    // 口型舞台
    $('stageWrap').style.display = state.options.face ? '' : 'none';

    // 提示条
    $('cueBar').style.display = state.options.cue ? '' : 'none';
  }

  /* ================================ 初始化 ================================ */
  function init() {
    loadState();

    // 记录首次交互，之后才允许自动朗读（浏览器自动播放策略）
    const markInteracted = () => { userInteracted = true; };
    window.addEventListener('pointerdown', markInteracted, { once: true });
    window.addEventListener('keydown', markInteracted, { once: true });

    // 填词库下拉
    const topicSel = $('topic');
    for (const key of Object.keys(window.WORD_BANK)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      topicSel.appendChild(opt);
    }
    topicSel.value = state.topic;

    // 填选项
    $('accent').value = state.options.accent;
    $('rate').value = state.options.rate;
    $('optFace').checked = state.options.face;
    $('optCue').checked = state.options.cue;
    $('optPhonetic').checked = state.options.phonetic;
    $('optSentence').checked = state.options.sentence;
    $('optEmoji').checked = state.options.emoji;
    $('optAuto').checked = state.options.autoPlay;

    // 模式
    $('tabCard').classList.toggle('on', state.mode === 'card');
    $('tabList').classList.toggle('on', state.mode === 'list');
    $('cardView').hidden = state.mode !== 'card';
    $('listView').hidden = state.mode !== 'list';

    // 渲染初始口型
    renderFrontFace(VISEME.NEUTRAL);
    renderSideFace(VISEME.NEUTRAL);
    $('cueBar').classList.add('idle');

    // 主题名
    $('topicName').textContent = state.topic;

    // 显示内容
    if (state.mode === 'card') {
      nextWord();
    } else {
      renderWordList();
    }

    // 事件
    $('tabCard').addEventListener('click', () => {
      state.mode = 'card';
      saveState();
      $('tabCard').classList.add('on');
      $('tabList').classList.remove('on');
      $('cardView').hidden = false;
      $('listView').hidden = true;
      nextWord();
    });

    $('tabList').addEventListener('click', () => {
      state.mode = 'list';
      saveState();
      $('tabCard').classList.remove('on');
      $('tabList').classList.add('on');
      $('cardView').hidden = true;
      $('listView').hidden = false;
      renderWordList();
    });

    $('playWord').addEventListener('click', playCurrentWord);
    $('playSentence').addEventListener('click', playCurrentSentence);
    $('playSlow').addEventListener('click', playSlow);
    $('nextWord').addEventListener('click', () => { markPracticed(); nextWord(); });
    $('restart').addEventListener('click', () => {
      setPracticedIndices([]);
      nextWord();
    });

    $('markAll').addEventListener('click', () => {
      const words = getCurrentWords();
      setPracticedIndices(words.map((_, i) => i));
      if (state.mode === 'list') renderWordList(); else updateProgress();
    });

    $('clearTopic').addEventListener('click', () => {
      setPracticedIndices([]);
      if (state.mode === 'list') renderWordList(); else updateProgress();
    });

    $('topic').addEventListener('change', () => {
      state.topic = $('topic').value;
      saveState();
      $('topicName').textContent = state.topic;
      if (state.mode === 'card') nextWord(); else renderWordList();
    });

    $('accent').addEventListener('change', () => {
      state.options.accent = $('accent').value;
      saveState();
      fallbackShown = false;
      $('fallbackNote').hidden = true;
    });

    $('rate').addEventListener('change', () => {
      state.options.rate = parseFloat($('rate').value);
      saveState();
    });

    $('optFace').addEventListener('change', () => {
      state.options.face = $('optFace').checked;
      saveState();
      applyOptions();
    });

    $('optCue').addEventListener('change', () => {
      state.options.cue = $('optCue').checked;
      saveState();
      applyOptions();
    });

    $('optPhonetic').addEventListener('change', () => {
      state.options.phonetic = $('optPhonetic').checked;
      saveState();
      applyOptions();
    });

    $('optSentence').addEventListener('change', () => {
      state.options.sentence = $('optSentence').checked;
      saveState();
      applyOptions();
    });

    $('optEmoji').addEventListener('change', () => {
      state.options.emoji = $('optEmoji').checked;
      saveState();
      applyOptions();
    });

    $('optAuto').addEventListener('change', () => {
      state.options.autoPlay = $('optAuto').checked;
      saveState();
    });

    applyOptions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
