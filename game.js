// Lógica del juego Pochoclos Catcher
// Requiere api.js (jsonbinRead/jsonbinWrite)

(function() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const DPI = Math.min(window.devicePixelRatio || 1, 2);

  const scoreEl = document.getElementById('score');
  const screenStart = document.getElementById('screen-start');
  const screenBoard = document.getElementById('screen-board');
  const screenOver = document.getElementById('screen-over');
  const finalScoreEl = document.getElementById('finalScore');
  const saveStatusEl = document.getElementById('saveStatus');
  const toastEl = document.getElementById('toast');
  const hintEl = document.getElementById('hint');

  const playerNameInput = document.getElementById('playerName');
  const skinSelect = document.getElementById('skinSelect');
  const btnPlay = document.getElementById('btnPlay');
  const btnBoard = document.getElementById('btnBoard');
  const btnBack = document.getElementById('btnBack');
  const btnReplay = document.getElementById('btnReplay');
  const btnHome = document.getElementById('btnHome');
  const btnBoard2 = document.getElementById('btnBoard2');

  // --- Dificultad y spawn ---
let running = false;
let score = 0;
let startTime = 0;

let spawnDelay = 1400;       // ms al inicio
const minSpawnDelay = 350;   // ms mínimo
const spawnEaseMs = 60000;   // a 60s llega a la máxima dificultad

let hasPopcornAlive = false; // hay pochoclo en pantalla
let nextSpawnAt = 0;         // timestamp para el próximo spawn programado

// física base (se escala con dificultad)
const G_BASE = 0.32;         // gravedad base
const G_MAX_ADD = 0.4;      // cuánto puede crecer (base + add)


  // Forzar estado inicial de pantallas (por si el HTML no tiene hidden bien seteado)
screenStart.hidden = false;
screenBoard.hidden = true;
screenOver.hidden  = true;

  const boardTableBody = document.querySelector('#boardTable tbody');

  const SKINS = ['GBFilms.png', 'BANIVFX.png', 'Elcondenado.png','Rendering.png', 'Eldientenegro.png', 'Cucaracha.png'];

 // let running = false;
//  let score = 0;
  let playerName = localStorage.getItem('gb_player_name') || '';
  let skinName = localStorage.getItem('gb_skin') || SKINS[0];

  // --- Canvas scaling ---
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * DPI);
    canvas.height = Math.round(rect.height * DPI);
  }
  fitCanvas();
  addEventListener('resize', fitCanvas);

  // --- Utilidades ---
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
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

  // --- Entidades ---
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
  loadBucketSkin(skinName);

  const popcorn = { x: 0, y: 0, r: 16, vx: 0, vy: 0, caught: false };

  // --- Física ---
 // const G = 0.5;
  const BOUNCE_WALL = 0.98;
  const FLOOR_Y_OFFSET = 8;

  // --- Input ---
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

  // --- Juego core ---
  function placeBucket() {
    bucket.w = 120 * DPI; bucket.h = 80 * DPI;
    bucket.x = (canvas.width - bucket.w) / 2;
    bucket.y = canvas.height - bucket.h - 20 * DPI;
  }
// Crea un pochoclo nuevo
function spawnPopcorn() {
  popcorn.x = (Math.random()*0.7 + 0.15) * canvas.width;
  popcorn.y = 20 * DPI;
  popcorn.r = 14 * DPI;
  popcorn.vx = (Math.random()<0.5?-1:1) * (1.3 + Math.random()*0.8) * DPI; // más suave al inicio
  popcorn.vy = 0.35 * DPI; // arranque tranquilo; la gravedad hará su trabajo
  popcorn.caught = false;
  hasPopcornAlive = true;
}
  // programa el próximo spawn según la dificultad actual
function scheduleNextSpawn(nowTs) {
  const t = Math.min(1, (nowTs - startTime) / spawnEaseMs); // 0..1
  const eased = t*t; // ease-in
  const delay = Math.max(minSpawnDelay, spawnDelay * (1 - 0.85*eased)); // reduce delay con el tiempo
  nextSpawnAt = nowTs + delay;
}
  
function resetGame() {
  score = 0; scoreEl.textContent = score;
  startTime = performance.now();
  placeBucket();
  hasPopcornAlive = false;
  // programar primer spawn suave
  scheduleNextSpawn(startTime + 300); // pequeño delay inicial
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
      ctx.save(); 
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#ffd782';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + p.t, 0, Math.PI * 2); 
      ctx.fill();
      ctx.restore();
      p.t++; if (fade <= 0) clearInterval(id);
    }, 16);
  }

let lastTs = performance.now();

function update(now) {
  if(!running) return;
  requestAnimationFrame(update);
  const ts = now || performance.now();
  const dt = Math.min(40, ts - lastTs); // ms cap
  lastTs = ts;

  // dificultad 0..1 en 60s
  const t = Math.min(1, (ts - startTime) / spawnEaseMs);
  const eased = t*t; // ease-in
  const G = (G_BASE + G_MAX_ADD * eased) * DPI; // gravedad crece con el tiempo

  // spawn cuando toque (y no haya pochoclo activo)
  if (!hasPopcornAlive && ts >= nextSpawnAt) {
    spawnPopcorn();
  }

  // render base
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 2*DPI; ctx.strokeRect(2*DPI,2*DPI, canvas.width-4*DPI, canvas.height-4*DPI);

  // mover bucket
  if(pointerX!=null){
    const target = clamp(pointerX - bucket.w/2, 4*DPI, canvas.width - bucket.w - 4*DPI);
    bucket.x += (target - bucket.x) * 0.25;
  }

  // física del pochoclo si está vivo
  if (hasPopcornAlive) {
    popcorn.vy += G * (dt/16.67);
    popcorn.x += popcorn.vx * (dt/16.67);
    popcorn.y += popcorn.vy * (dt/16.67);

    const minX = 6*DPI + popcorn.r, maxX = canvas.width - 6*DPI - popcorn.r;
    if(popcorn.x < minX){ popcorn.x = minX; popcorn.vx *= -0.98; }
    if(popcorn.x > maxX){ popcorn.x = maxX; popcorn.vx *= -0.98; }

    const floorY = canvas.height - 8*DPI;
    if(popcorn.y + popcorn.r >= floorY){
      // tocó piso: game over
      gameOver();
      return;
    }

    // catch
    if(!popcorn.caught && intersectsBucket(popcorn, bucket)){
      popcorn.caught = true;
      score += 1; scoreEl.textContent = score;
      showCatchBurst(popcorn.x, bucket.y);

      // ya no hay pochoclo activo; programar el próximo spawn (más seguido con el tiempo)
      hasPopcornAlive = false;
      scheduleNextSpawn(ts);
    }

      // dibujar pochoclo (usando imagen si existe)
      if (!window.popcornImg) {
        window.popcornImg = new Image();
        window.popcornImg.src = "skins/Pochoclo.png";
      }
      
      if (window.popcornImg.complete && window.popcornImg.naturalWidth > 0) {
        const size = popcorn.r * 2;
        ctx.drawImage(window.popcornImg, popcorn.x - popcorn.r, popcorn.y - popcorn.r, size, size);
      } else {
        // fallback: círculo si la imagen no cargó aún
        ctx.fillStyle = '#ffe9b3';
        ctx.beginPath();
        ctx.arc(popcorn.x, popcorn.y, popcorn.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e6c77a';
        ctx.lineWidth = 3 * DPI;
        ctx.stroke();
      }

  }

  // bucket siempre visible
  bucket.draw();
}


  // --- Pantallas ---
  function showStart() {
    running = false;
    screenOver.hidden = true;
    screenBoard.hidden = true;
    screenStart.hidden = false;
    hintEl.style.opacity = 0.7;
  }
  function showBoard() {
    running = false;
    screenStart.hidden = true;
    screenOver.hidden = true;
    screenBoard.hidden = false;
    loadLeaderboard();
  }
  
function showGame(){
  screenStart.hidden = true;
  screenBoard.hidden = true;
  screenOver.hidden  = true;
  resetGame();
  running = true;
  lastTs = performance.now();
  requestAnimationFrame(update);
  setTimeout(()=> hintEl.style.opacity = 0, 2000);
}
  
  function showOver() { running = false; screenOver.hidden = false; }

  // --- Leaderboard ---
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

  // --- UI ---
  function populateSkins() {
    skinSelect.innerHTML = '';
    SKINS.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n; opt.textContent = n.replace(/\\.png$/, '');
      if (n === skinName) opt.selected = true;
      skinSelect.appendChild(opt);
    });
  }
  populateSkins();

  playerNameInput.value = playerName;
  playerNameInput.addEventListener('change', () => {
    playerName = playerNameInput.value.trim() || 'Jugador';
    localStorage.setItem('gb_player_name', playerName);
  });
  skinSelect.addEventListener('change', () => {
    skinName = skinSelect.value;
    localStorage.setItem('gb_skin', skinName);
    loadBucketSkin(skinName);
  });

  btnPlay.addEventListener('click', () => {
    const nm = playerNameInput.value.trim();
    playerName = nm || 'Jugador';
    localStorage.setItem('gb_player_name', playerName);
    showGame();
  });
  btnBoard.addEventListener('click', showBoard);
  btnBack.addEventListener('click', showStart);
  btnReplay.addEventListener('click', showGame);
  btnHome.addEventListener('click', showStart);
  btnBoard2.addEventListener('click', showBoard);

  // --- Game over ---
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

  // --- Init ---
  showStart();
  placeBucket();
})();
