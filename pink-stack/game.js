(() => {
  'use strict';
  const COLS = 10, ROWS = 20;
  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]]
  };
  const PALETTE = { I:'#f5b1ef', O:'#ffd0fa', T:'#ef9cE6', S:'#e88ddd', Z:'#f8a6dd', J:'#d988d6', L:'#ffb3e9' };
  const boardCanvas = document.querySelector('#board'), ctx = boardCanvas.getContext('2d');
  const nextCanvas = document.querySelector('#next'), nctx = nextCanvas.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const overlay = $('#overlay'), startButton = $('#start');
  let grid, current, nextType, score, lines, level, running = false, paused = false, ended = false;
  let lastTime = 0, dropClock = 0, locks = 0, surgeProgress = 0, soundOn = true, audio;
  let clearAnimation = null, particles = [];
  let bag = [], best = Number(localStorage.getItem('pink-stack-best') || 0);
  $('#best').textContent = best.toLocaleString('en-US');

  function refillBag() {
    bag = Object.keys(SHAPES);
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  }
  function pick() { if (!bag.length) refillBag(); return bag.pop(); }
  function freshGrid() { return Array.from({length: ROWS}, () => Array(COLS).fill(null)); }
  function makePiece(type) { const matrix = SHAPES[type].map(row => row.slice()); return {type, matrix, x: Math.floor((COLS - matrix[0].length) / 2), y: -1}; }
  function begin() {
    grid = freshGrid(); score = 0; lines = 0; level = 1; locks = 0; surgeProgress = 0; ended = false; paused = false; running = true; clearAnimation = null; particles = [];
    refillBag(); current = makePiece(pick()); nextType = pick(); dropClock = 0; lastTime = performance.now();
    overlay.classList.add('hidden'); $('#pause').disabled = false; $('#status').textContent = '进行中'; $('.live-dot').classList.add('active');
    renderStats(); render(); requestAnimationFrame(loop);
  }
  function collides(piece, dx = 0, dy = 0, matrix = piece.matrix) {
    for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix[y].length; x++) if (matrix[y][x]) {
      const bx = piece.x + x + dx, by = piece.y + y + dy;
      if (bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && grid[by][bx])) return true;
    }
    return false;
  }
  function move(dx, dy) {
    if (!running || paused) return false;
    if (collides(current, dx, dy)) { if (dy > 0) lockPiece(); return false; }
    current.x += dx; current.y += dy; if (dy > 0) dropClock = 0; render(); return true;
  }
  function rotateMatrix(matrix, dir) {
    const n = matrix.length, out = Array.from({length:n}, () => Array(n).fill(0));
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) out[dir > 0 ? x : n-1-x][dir > 0 ? n-1-y : y] = matrix[y][x];
    return out;
  }
  function rotate() {
    if (!running || paused) return;
    const matrix = rotateMatrix(current.matrix, 1);
    for (const kick of [0, -1, 1, -2, 2]) if (!collides(current, kick, 0, matrix)) { current.x += kick; current.matrix = matrix; playTone(480, .035); render(); return; }
  }
  function hardDrop() {
    if (!running || paused) return;
    let distance = 0; while (!collides(current, 0, 1)) { current.y++; distance++; }
    score += distance * 2; lockPiece(); playTone(170, .07);
  }
  function lockPiece() {
    current.matrix.forEach((row, y) => row.forEach((cell, x) => { if (cell && current.y + y >= 0) grid[current.y + y][current.x + x] = current.type; }));
    const beforeClear = grid.map(row => row.slice());
    const clearedRows = beforeClear.flatMap((row, y) => row.every(Boolean) ? [y] : []);
    const cleared = clearedRows.length;
    if (cleared) {
      lines += cleared; score += [0,100,300,500,800][cleared] * level; playTone(660 + cleared * 100, .12);
      const clearedSet = new Set(clearedRows);
      grid = beforeClear.filter((_, y) => !clearedSet.has(y));
      while (grid.length < ROWS) grid.unshift(Array(COLS).fill(null));
      startClearAnimation(clearedRows, cleared, beforeClear);
      renderStats(); render();
      return;
    }
    level = 1 + Math.floor(lines / 10); locks++;
    if (locks % 4 === 0) riseGarbage();
    spawn(); renderStats(); render();
  }
  function startClearAnimation(rows, cleared, beforeGrid) {
    const cell = boardCanvas.width / COLS;
    particles = [];
    const palette = ['#f8c8f2','#ef9ce6','#d986d3','#f6b5eb','#fff0ff'];
    rows.forEach(row => {
      for (let x = 0; x < COLS; x++) {
        const color = PALETTE[beforeGrid[row][x]] || palette[x % palette.length];
        const targetRow = row - rows.filter(clearedY => clearedY < row).length;
        let floorRow = ROWS;
        for (let y = targetRow; y < ROWS; y++) {
          if (grid[y][x]) { floorRow = y; break; }
        }
        const count = 6, center = {x:(Math.random()-.5)*cell*.12,y:(Math.random()-.5)*cell*.12};
        const ring = Array.from({length:count}, (_,i) => {
          const angle = (Math.PI * 2 * i / count) + (Math.random()-.5)*.22;
          const radius = cell * (.37 + Math.random()*.12);
          return {x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};
        });
        for (let i = 0; i < count; i++) {
          const a = ring[i], b = ring[(i+1)%count], midX = (center.x+a.x+b.x)/3, midY = (center.y+a.y+b.y)/3;
          const radial = Math.atan2(midY,midX), kick = 45 + Math.random()*105;
          particles.push({
            x:(x+.5)*cell, y:(row+.5)*cell,
            vertices:[center,a,b], vx:Math.cos(radial)*kick+(Math.random()-.5)*50,
            vy:-35-Math.random()*110, omega:(Math.random()-.5)*9,
            rotation:(Math.random()-.5)*.3, color, floor:(floorRow)*cell,
            age:0, bounced:false, ttl:1.15+Math.random()*.25
          });
        }
      }
    });
    clearAnimation = {start: performance.now(), duration: 1450, rows: new Set(rows), beforeGrid, particleTime: performance.now()};
  }
  function riseGarbage() {
    if (grid[0].some(Boolean)) { finish(); return; }
    grid.shift(); const hole = Math.floor(Math.random() * COLS);
    const row = Array.from({length:COLS}, (_, x) => x === hole ? null : 'G'); grid.push(row);
    surgeProgress = 0; playTone(100, .18);
    if (grid[0].some(Boolean)) finish();
  }
  function spawn() {
    current = makePiece(nextType); nextType = pick();
    if (collides(current)) finish();
  }
  function finish() {
    running = false; ended = true; paused = false;
    if (score > best) { best = score; localStorage.setItem('pink-stack-best', String(best)); $('#best').textContent = best.toLocaleString('en-US'); }
    $('#status').textContent = '浪潮已至'; $('.live-dot').classList.remove('active'); $('#pause').disabled = true;
    showOverlay('第五关，还差一点', `本局得分 ${score.toLocaleString('en-US')} · 清除了 ${lines} 行`, '再试一次');
  }
  function showOverlay(title, copy, label) { $('#overlay-title').textContent = title; $('#overlay-copy').textContent = copy; startButton.textContent = label; overlay.classList.remove('hidden'); }
  function togglePause() {
    if (!running) return;
    paused = !paused; $('#pause').innerHTML = paused ? '<span>▶</span> 继续' : '<span>Ⅱ</span> 暂停';
    $('#status').textContent = paused ? '已暂停' : '进行中';
    if (paused) showOverlay('暂停中', '休息一下，浪潮等你回来。', '继续游戏');
    else { overlay.classList.add('hidden'); lastTime = performance.now(); requestAnimationFrame(loop); }
  }
  function cube(target, x, y, size, base, alpha = 1) {
    const pad = Math.max(1.2, size * .075), depth = Math.max(2, size * .11), px = x * size, py = y * size;
    target.save(); target.globalAlpha = alpha;
    target.fillStyle = '#201745'; target.fillRect(px + pad + depth * .7, py + pad + depth * 1.2, size - pad * 2, size - pad * 2);
    target.fillStyle = base; target.fillRect(px + pad, py + pad, size - pad * 2, size - pad * 2);
    target.fillStyle = '#fff5ff'; target.globalAlpha = alpha * .62;
    target.beginPath(); target.moveTo(px + pad, py + pad); target.lineTo(px + size - pad, py + pad); target.lineTo(px + size - pad - depth, py + pad + depth); target.lineTo(px + pad + depth, py + pad + depth); target.closePath(); target.fill();
    target.fillStyle = '#9c55a8'; target.globalAlpha = alpha * .7;
    target.beginPath(); target.moveTo(px + size - pad, py + pad); target.lineTo(px + size - pad, py + size - pad); target.lineTo(px + size - pad - depth, py + size - pad - depth); target.lineTo(px + size - pad - depth, py + pad + depth); target.closePath(); target.fill();
    target.fillStyle = '#fbd0f4'; target.globalAlpha = alpha * .32;
    target.fillRect(px + pad + depth, py + pad + depth, size - pad * 2 - depth * 2, Math.max(1, size * .055));
    target.globalAlpha = alpha; target.strokeStyle = '#38235f'; target.lineWidth = Math.max(1, size * .045); target.strokeRect(px + pad, py + pad, size - pad * 2, size - pad * 2);
    target.restore();
  }
  function block(x, y, size, type, alpha = 1, yOffset = 0) {
    const base = type === 'G' ? '#9f67ae' : PALETTE[type];
    cube(ctx, x, y + yOffset / size, size, base, alpha);
  }
  function render() {
    const w = boardCanvas.width, h = boardCanvas.height, cell = w / COLS;
    ctx.clearRect(0,0,w,h); ctx.fillStyle = '#29205d'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#403476'; ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x*cell,0); ctx.lineTo(x*cell,h); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0,y*cell); ctx.lineTo(w,y*cell); ctx.stroke(); }
    if (clearAnimation) {
      const progress = Math.max(0, Math.min(1, (performance.now() - clearAnimation.start) / clearAnimation.duration));
      const t = progress * progress;
      clearAnimation.beforeGrid.forEach((row,y) => {
        if (clearAnimation.rows.has(y)) return;
        const fall = [...clearAnimation.rows].filter(clearedY => clearedY > y).length;
        row.forEach((type,x) => { if(type) block(x,y,cell,type,1,fall * cell * t); });
      });
    } else grid?.forEach((row,y) => row.forEach((type,x) => { if(type) block(x,y,cell,type); }));
    if (current && !clearAnimation) {
      let ghostY = current.y; while (!collides({...current,y:ghostY}, 0, 1)) ghostY++;
      current.matrix.forEach((row,y) => row.forEach((v,x) => { if(v && ghostY+y >= 0) block(current.x+x,ghostY+y,cell,current.type,.18); }));
      current.matrix.forEach((row,y) => row.forEach((v,x) => { if(v && current.y+y >= 0) block(current.x+x,current.y+y,cell,current.type); }));
    }
    drawDebris(cell);
    drawParticles(cell);
    drawNext();
  }
  function drawParticles(cell) {
    if (!clearAnimation) return;
    const now = performance.now(), dt = Math.min(.04, Math.max(0,(now-clearAnimation.particleTime)/1000));
    clearAnimation.particleTime = now;
    particles = particles.filter(p => {
      p.age += dt;
      p.vy += 920 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rotation += p.omega * dt;
      const lowest = Math.max(...p.vertices.map(v => v.y));
      if (p.y + lowest >= p.floor && p.vy > 0) {
        p.y = p.floor - lowest;
        if (!p.bounced && p.vy > 75) { p.vy *= -.19; p.vx *= .68; p.omega *= .55; p.bounced = true; }
        else { p.vy = 0; p.vx *= Math.pow(.04,dt); p.omega *= Math.pow(.025,dt); }
      }
      if (p.age >= p.ttl) return false;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rotation);
      ctx.globalAlpha = Math.min(1,Math.max(0,(p.ttl-p.age)/.22));
      ctx.beginPath(); ctx.moveTo(p.vertices[0].x,p.vertices[0].y);
      for (let i=1;i<p.vertices.length;i++) ctx.lineTo(p.vertices[i].x,p.vertices[i].y);
      ctx.closePath(); ctx.fillStyle = p.color; ctx.globalAlpha *= .78; ctx.fill();
      ctx.globalAlpha *= .8; ctx.lineWidth = 1.25; ctx.strokeStyle = '#fff0ff'; ctx.stroke();
      const [tip,left,right] = p.vertices;
      ctx.beginPath(); ctx.moveTo(tip.x,tip.y); ctx.lineTo((tip.x+left.x)/2,(tip.y+left.y)/2);
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#ffffff'; ctx.globalAlpha *= .72; ctx.stroke();
      ctx.restore(); return true;
    });
  }
  function drawDebris(cell) {
    const top = grid?.findIndex(row => row.some(Boolean)) ?? -1;
    if (top < 0) return;
    const y = top * cell;
    ctx.save(); ctx.globalAlpha = .32; ctx.fillStyle = '#d98acb'; ctx.fillRect(0, y - 9, boardCanvas.width, 18);
    for (let i = 0; i < 85; i++) {
      const px = (i * 47 + (i % 5) * 9) % boardCanvas.width;
      const py = y - 12 + ((i * 29) % 26), radius = 1 + (i % 4);
      ctx.globalAlpha = .15 + (i % 5) * .055; ctx.fillStyle = i % 3 ? '#efafe4' : '#8f5aa1';
      ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawNext() {
    nctx.clearRect(0,0,72,72); const matrix = SHAPES[nextType]; if (!matrix) return;
    const size = 13, offsetX = (72 - matrix[0].length * size) / 2, offsetY = (72 - matrix.length * size) / 2;
    matrix.forEach((row,y)=>row.forEach((v,x)=>{if(v) cube(nctx,(offsetX+x*size)/size,(offsetY+y*size)/size,size,PALETTE[nextType]);}));
  }
  function renderStats() {
    $('#level').textContent = level; $('#stage').textContent = String(level).padStart(2,'0'); $('#score').textContent = String(score).padStart(6,'0');
    $('#speed').textContent = Math.min(15, level + 2); $('#surge').textContent = `还差 ${4 - locks % 4} 块`;
    $('#surge-meter').style.width = `${(locks % 4) * 25}%`;
  }
  function loop(now) {
    if (!running || paused) return;
    if (clearAnimation) {
      render();
      if (now - clearAnimation.start >= clearAnimation.duration) {
        clearAnimation = null; particles = []; level = 1 + Math.floor(lines / 10); locks++;
        if (locks % 4 === 0) riseGarbage();
        if (running) spawn(); renderStats(); render();
      }
      requestAnimationFrame(loop); return;
    }
    const dt = Math.min(now - lastTime, 100); lastTime = now; dropClock += dt;
    if (dropClock >= Math.max(90, 850 - (level - 1) * 65)) { dropClock = 0; move(0,1); }
    requestAnimationFrame(loop);
  }
  function playTone(freq, duration) {
    if (!soundOn) return;
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); const osc = audio.createOscillator(), gain = audio.createGain(); osc.frequency.value = freq; osc.type = 'triangle'; gain.gain.setValueAtTime(.035,audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration); osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime+duration); } catch (_) {}
  }
  startButton.addEventListener('click', () => { if (paused) togglePause(); else begin(); });
  $('#pause').addEventListener('click', togglePause);
  $('#sound').addEventListener('click', (event) => { soundOn = !soundOn; event.currentTarget.classList.toggle('muted',!soundOn); event.currentTarget.textContent = soundOn ? '♫' : '♪'; event.currentTarget.setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效'); });
  const actions = {left:()=>move(-1,0),right:()=>move(1,0),down:()=>move(0,1),rotate,drop:hardDrop};
  document.querySelectorAll('[data-action]').forEach(button => {
    const action = actions[button.dataset.action]; let timer;
    button.addEventListener('pointerdown', event => { event.preventDefault(); action(); if (['left','right','down'].includes(button.dataset.action)) timer = setInterval(action, 110); });
    ['pointerup','pointerleave','pointercancel'].forEach(name => button.addEventListener(name, () => clearInterval(timer)));
  });
  document.addEventListener('keydown', event => {
    const keys = {ArrowLeft:()=>move(-1,0),ArrowRight:()=>move(1,0),ArrowDown:()=>move(0,1),ArrowUp:rotate,x:rotate,X:rotate,' ':hardDrop};
    if (keys[event.key]) { event.preventDefault(); keys[event.key](); }
    if (event.key.toLowerCase() === 'p' || event.key === 'Escape') togglePause();
  });
  grid = freshGrid(); nextType = pick(); current = makePiece(pick()); render(); renderStats();
})();
