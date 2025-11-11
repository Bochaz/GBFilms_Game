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
  const boardTableBody = document.querySelector('#boardTable tbody');

  const SKINS = ['classic.png', 'bani-rosa.png', 'bani-violeta.png'];

  let running = false;
  let score = 0;
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
  const G = 0.5;
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
  function spawnPopcorn() {
    popcorn.x = (Math.random() * 0.7 + 0.15) * canvas.width;
    popcorn.y = 20 * DPI;
    popcorn.r = 14 * DPI;
    popcorn.vx = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 1.5) * DPI;
    popcorn.vy = (0.5 + Math.random() * 0.6) * DPI;
    popcorn.caught = false;
  }
  function resetGame() {
    score = 0; scoreEl.textContent = score;
    placeBucket();
    spawnPopcorn();
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

  function update() {
    if (!running) return;
    requestAnimationFrame(update);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 2 * DPI;
    ctx.strokeRect(2 * DPI, 2 * DPI, canvas.width - 4 * DPI, canvas.height - 4 * DPI);

    if (pointerX != null) {
      const target = clamp(pointerX - bucket.w / 2, 4 * DPI, canvas.width - bucket.w - 4 * DPI);
      bucket.x += (target - bucket.x) * 0.25;
    }

    popcorn.vy += G * DPI;
    popcorn.x += popcorn.vx;
    popcorn.y += popcorn.vy;

    const minX = 6 * DPI + popcorn.r, maxX = canvas.width - 6 * DPI - popcorn.r;
    if (popcorn.x < minX) { popcorn.x = minX; popcorn.vx *= -BOUNCE_WALL; }
    if (popcorn.x > maxX) { popcorn.x = maxX; popcorn.vx *= -BOUNCE_WALL; }

    const floorY = canvas.height - 8 * DPI;
    if (popcorn.y + popcorn.r >= floorY) { gameOver(); return; }

    if (!popcorn.caught && intersectsBucket(popcorn, bucket)) {
      popcorn.caught = true;
      score += 1; scoreEl.textContent = score;
      showCatchBurst(popcorn.x, bucket.y);
      spawnPopcorn();
    }

    ctx.fillStyle = '#ffe9b3';
    ctx.beginPath(); ctx.arc(popcorn.x, popcorn.y, popcorn.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e6c77a'; ctx.lineWidth = 3 * DPI; ctx.stroke();

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
  function showGame() {
    screenStart.hidden = true;
    screenBoard.hidden = true;
    screenOver.hidden = true;
    resetGame(); running = true;
    requestAnimationFrame(update);
    setTimeout(() => hintEl.style.opacity = 0, 2000);
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
