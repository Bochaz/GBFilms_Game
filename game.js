// Lógica del juego Pochoclos Catcher
// Requiere api.js (jsonbinRead/jsonbinWrite)

(function() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const DPI = Math.min(window.devicePixelRatio || 1, 2);

  const scoreEl = document.getElementById('score');
  const screenStart = document.getElementById('screen-start');
  const screenBoard = document.getElementById('screen-board');
  const screenOver  = document.getElementById('screen-over');
  const finalScoreEl = document.getElementById('finalScore');
  const saveStatusEl = document.getElementById('saveStatus');
  const toastEl = document.getElementById('toast');
  const hintEl  = document.getElementById('hint');

  const playerNameInput = document.getElementById('playerName');
  const skinSelect = document.getElementById('skinSelect');
  const btnPlay = document.getElementById('btnPlay');
  const btnBoard = document.getElementById('btnBoard');
  const btnBack = document.getElementById('btnBack');
  const btnReplay = document.getElementById('btnReplay');
  const btnHome = document.getElementById('btnHome');
  const btnBoard2 = document.getElementById('btnBoard2');

  const boardTableBody = document.querySelector('#boardTable tbody');

  // ====== Estado de pantallas (failsafe) ======
  function show(el){ el.hidden=false; el.style.display='grid'; }
  function hide(el){ el.hidden=true;  el.style.display='none'; }
  show(screenStart); hide(screenBoard); hide(screenOver);

  // ====== Skins del balde ======
  const SKINS = ['GBFilms.png', 'BANIVFX.png', 'Elcondenado.png','Rendering.png', 'Eldientenegro.png', 'Cucaracha.png'];

  // ====== Juego / dificultad continua ======
  let running = false;
  let score = 0;
  let startTime = 0;

  // Spawning continuo (cada vez más seguido)
  let spawnDelay0 = 1400;             // delay base inicial (ms)
  const minSpawnDelayHardFloor = 120; // piso durísimo
  const SPAWN_ACCEL = 0.035;          // ↑ para acelerar más rápido

  // Gravedad creciente sin tope
  const G_BASE = 0.32;
  const G_GROW_RATE = 0.006;          // ↑ para caer más rápido con el tiempo

  // Múltiples pochoclos simultáneos
  let popcorns = [];
  let nextSpawnAt = 0;

  // ====== Preferencias usuario ======
  let playerName = (localStorage.getItem('gb_player_name') || '').trim();
  let skinName   = localStorage.getItem('gb_skin') || ''; // sin skin por defecto

  // ====== Canvas scaling ======
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = Math.round(rect.width * DPI);
    canvas.height = Math.round(rect.height * DPI);
  }
  fitCanvas();
  addEventListener('resize', fitCanvas);

  // ====== Utils ======
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>\"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[m]));
  }
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
    ctx.beginPath();
    ctx.moveTo(x + r.tl, y);
    ctx.lineTo(x + w - r.tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
    ctx.lineTo(x + w, y + h - r.br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
    ctx.lineTo(x + r.bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
    ctx.lineTo(x, y + r.tl);
    ctx.quadraticCurveTo(x, y, x + r.tl, y);
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }
  function showToast(msg, ms = 2000) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    setTimeout(() => toastEl.hidden = true, ms);
  }

  // ====== Entidades ======
  const bucket = {
    x: 0, y: 0, w: 110, h: 70, img: null,
    draw() {
      const { x, y, w, h } = this;
      if (this.img && this.img.complete) {
        ctx.drawImage(this.img, x, y, w, h);
      } else {
        ctx.fillStyle = '#202020';
        roundRect(ctx, x, y, w, h, 14, true, false);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2 * DPI;
        roundRect(ctx, x + 3 * DPI, y - 2 * DPI, w - 6 * DPI, h - 4 * DPI, 12, false, true);
      }
    }
  };
  function loadBucketSkin(name) {
    const img = new Image();
    img.src = `skins/${name}`;
    img.onload = () => bucket.img = img;
    img.onerror = () => bucket.img = null;
  }
  if (skinName) loadBucketSkin(skinName);

  // Imagen del pochoclo
  if (!window.popcornImg) {
    window.popcornImg = new Image();
    window.popcornImg.src = "skins/Pochoclo.png";
  }

  // ====== Input ======
  let pointerX = null, holding = false;
  function setPointerFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0])
      pointerX = (e.touches[0].clientX - rect.left) / rect.width * canvas.width;
    else if (e.changedTouches && e.changedTouches[0])
      pointerX = (e.changedTouches[0].clientX - rect.left) / rect.width * canvas.width;
    else if (e.clientX != null)
      pointerX = (e.clientX - rect.left) / rect.width * canvas.width;
  }
  canvas.addEventListener('pointerdown', e => { holding = true; setPointerFromEvent(e); });
  canvas.addEventListener('pointermove', e => { if (holding) setPointerFromEvent(e); });
  addEventListener('pointerup', () => { holding = false; });
  canvas.addEventListener('touchstart', e => { holding = true; setPointerFromEvent(e); });
  canvas.addEventListener('touchmove', e => { if (holding) setPointerFromEvent(e); });
  addEventListener('touchend', () => { holding = false; });

  // ====== Juego core ======
  function placeBucket() {
    bucket.w = 120 * DPI; bucket.h = 80 * DPI;
    bucket.x = (canvas.width - bucket.w) / 2;
    bucket.y = canvas.height - bucket.h - 20 * DPI;
  }

  function newPopcorn(ts) {
    const tSec = Math.max(0, (ts - startTime) / 1000);
    const p = {
      x: (Math.random()*0.7 + 0.15) * canvas.width,
      y: 20 * DPI,
      r: 14 * DPI,
      vx: 0,
      vy: 0,
      caught: false,
      dead: false
    };
    const vxBase = 1.3 + Math.random()*0.8;
    const vxBoost = 1 + Math.min(0.35, 0.08 * Math.log1p(tSec)); // hasta +35%
    p.vx = (Math.random()<0.5?-1:1) * (vxBase * vxBoost) * DPI;
    p.vy = 0.35 * DPI;
    return p;
  }

  function scheduleNextSpawn(nowTs) {
    const tSec = Math.max(0, (nowTs - startTime) / 1000);
    const delay = Math.max(minSpawnDelayHardFloor, spawnDelay0 * Math.exp(-SPAWN_ACCEL * tSec));
    nextSpawnAt = nowTs + delay;
  }

  function resetGame() {
    score = 0; scoreEl.textContent = score;
    startTime = performance.now();
    placeBucket();
    popcorns = [];
    scheduleNextSpawn(startTime + 300); // primer spawn suave
  }

  function intersectsBucket(ball, buck) {
    const mouthY = buck.y + 8 * DPI;
    const withinX = ball.x >= buck.x && ball.x <= buck.x + buck.w;
    const touchingY = ball.y + ball.r >= mouthY && ball.y + ball.r <= mouthY + 18 * DPI;
    return withinX && touchingY && ball.vy > 0;
  }

  function showCatchBurst(x, y) {
    const p = { x, y, r: 2 * DPI, t: 0 };
    const id = setInterval(() => {
      const fade = Math.max(0, 1 - p.t / 12);
      ctx.save(); ctx.globalAlpha = fade;
      ctx.fillStyle = '#ffd782';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + p.t, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      p.t++; if (fade <= 0) clearInterval(id);
    }, 16);
  }

  let lastTs = performance.now();

  function update(now) {
    if(!running) return;
    requestAnimationFrame(update);
    const ts = now || performance.now();
    const dt = Math.min(40, ts - lastTs);
    lastTs = ts;

    // Dificultad continua
    const tSec = Math.max(0, (ts - startTime) / 1000);
    const G = (G_BASE + G_GROW_RATE * tSec) * DPI;

    // Spawning continuo (puede haber muchos simultáneos)
    if (ts >= nextSpawnAt) {
      popcorns.push(newPopcorn(ts));
      scheduleNextSpawn(ts);
      // Si querés rigor ante frames largos, podés repetir spawn en un while con límite
      // for (let i=0;i<3 && ts>=nextSpawnAt;i++){ popcorns.push(newPopcorn(ts)); scheduleNextSpawn(ts); }
    }

    // Render base
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 2*DPI; ctx.strokeRect(2*DPI,2*DPI, canvas.width-4*DPI, canvas.height-4*DPI);

    // Mover bucket
    if(pointerX!=null){
      const target = clamp(pointerX - bucket.w/2, 4*DPI, canvas.width - bucket.w - 4*DPI);
      bucket.x += (target - bucket.x) * 0.25;
    }

    const f = (dt/16.67);
    const minX = 6*DPI;
    const maxX = canvas.width - 6*DPI;
    const floorY = canvas.height - 8*DPI;

    // Actualizar y dibujar cada pochoclo
    for (let p of popcorns) {
      if (p.dead) continue;

      p.vy += G * f;
      p.x  += p.vx * f;
      p.y  += p.vy * f;

      // paredes
      const leftBound  = minX + p.r;
      const rightBound = maxX - p.r;
      if(p.x < leftBound){ p.x = leftBound; p.vx *= -0.98; }
      if(p.x > rightBound){ p.x = rightBound; p.vx *= -0.98; }

      // piso => game over
      if(p.y + p.r >= floorY){
        gameOver();
        return;
      }

      // catch
      if(!p.caught && intersectsBucket(p, bucket)){
        p.caught = true;
        p.dead = true;
        score += 1; scoreEl.textContent = score;
        showCatchBurst(p.x, bucket.y);
      }

      // dibujar (imagen si carga, si no círculo)
      if (window.popcornImg.complete && window.popcornImg.naturalWidth > 0) {
        const size = p.r * 2;
        ctx.drawImage(window.popcornImg, p.x - p.r, p.y - p.r, size, size);
      } else {
        ctx.fillStyle = '#ffe9b3';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#e6c77a'; ctx.lineWidth = 3 * DPI; ctx.stroke();
      }
    }

    // limpiar pochoclos “muertos”
    if (popcorns.length && (popcorns.length > 50 || (tSec>10 && popcorns.length>0))) {
      popcorns = popcorns.filter(p => !p.dead);
    }

    // bucket on top
    bucket.draw();
  }

  // ====== Leaderboard ======
  async function loadLeaderboard() {
    boardTableBody.innerHTML = '<tr><td colspan="4">Cargando…</td></tr>';
    try {
      const data = await jsonbinRead();
      const list = (data && data.scores) ? data.scores.slice() : [];
      list.sort((a, b) => b.score - a.score || (a.ts || 0) - (b.ts || 0));
      const top = list.slice(0, 50);
      boardTableBody.innerHTML = '';
      if (top.length === 0) {
        boardTableBody.innerHTML = '<tr><td colspan="4">Sin registros aún</td></tr>';
        return;
      }
      top.forEach((row, i) => {
        const tr = document.createElement('tr');
        const date = row.ts ? new Date(row.ts) : new Date();
        tr.innerHTML = `<td>${i + 1}</td><td>${escapeHtml(row.name || 'Jugador')}</td><td>${row.score | 0}</td><td class="small">${date.toLocaleString()}</td>`;
        boardTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      boardTableBody.innerHTML = '<tr><td colspan="4">Error al cargar tabla</td></tr>';
    }
  }

  async function saveScore(name, score) {
    const data = await jsonbinRead();
    const scores = (data && data.scores) ? data.scores : [];
    scores.push({ name, score, ts: Date.now() });
    while (scores.length > 200) scores.shift();
    await jsonbinWrite({ scores });
  }

  // ====== Validación nombre + skin ======
  function isFormValid() {
    const nameOk = (playerNameInput.value.trim().length >= 1);
    const skinOk  = (skinSelect.value && skinSelect.value.length > 0);
    return nameOk && skinOk;
  }
  function updatePlayEnabled() {
    btnPlay.disabled = !isFormValid();
  }

  // ====== UI ======
  function populateSkins() {
    skinSelect.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Elegí un skin…';
    ph.disabled = true;
    ph.selected = !skinName;
    skinSelect.appendChild(ph);

    SKINS.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n.replace(/\.png$/i, '');
      if (n === skinName) opt.selected = true;
      skinSelect.appendChild(opt);
    });
  }
  populateSkins();

  playerNameInput.value = playerName;

  playerNameInput.addEventListener('input', () => {
    playerName = playerNameInput.value.trim();
    updatePlayEnabled();
  });
  skinSelect.addEventListener('change', () => {
    skinName = skinSelect.value;
    localStorage.setItem('gb_skin', skinName);
    if (skinName) loadBucketSkin(skinName);
    updatePlayEnabled();
  });

  btnPlay.addEventListener('click', () => {
    if (!isFormValid()) {
      showToast('Completá tu nombre y elegí una skin.');
      updatePlayEnabled();
      return;
    }
    playerName = playerNameInput.value.trim();
    localStorage.setItem('gb_player_name', playerName);
    showGame();
  });
  btnBoard.addEventListener('click', showBoard);
  btnBack.addEventListener('click', showStart);
  btnReplay.addEventListener('click', showGame);
  btnHome.addEventListener('click', showStart);
  btnBoard2.addEventListener('click', showBoard);

  // ====== Flow de pantallas ======
  function showStart() {
    running = false;
    hide(screenOver);
    hide(screenBoard);
    show(screenStart);
    hintEl.style.opacity = 0.7;
    updatePlayEnabled();
  }
  function showBoard() {
    running = false;
    hide(screenStart);
    hide(screenOver);
    show(screenBoard);
    loadLeaderboard();
  }
  function showGame(){
    hide(screenStart);
    hide(screenBoard);
    hide(screenOver);
    resetGame();
    running = true;
    lastTs = performance.now();
    requestAnimationFrame(update);
    setTimeout(()=> hintEl.style.opacity = 0, 2000);
  }
  function showOver() { 
    running = false; 
    hide(screenStart);
    hide(screenBoard);
    show(screenOver);
  }

  // ====== Game over ======
  async function gameOver() {
    finalScoreEl.textContent = score;
    showOver();
    try {
      await saveScore(playerName, score);
      saveStatusEl.textContent = 'Puntaje guardado correctamente.';
      saveStatusEl.style.color = '#b6f0c0';
    } catch (err) {
      console.error(err);
      saveStatusEl.textContent = 'No se pudo guardar el puntaje (revisa JSONBin).';
      saveStatusEl.style.color = '#ff9b9b';
    }
  }

  // ====== Init ======
  showStart();
  placeBucket();
  updatePlayEnabled();
})();
