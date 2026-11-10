(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const ui = {
    score: document.getElementById('scoreValue'),
    deliveries: document.getElementById('deliveriesValue'),
    lives: document.getElementById('livesValue'),
    progress: document.getElementById('deliveryProgress'),
    message: document.getElementById('deliveryMessage'),
    routeIcon: document.getElementById('routeIcon'),
    startScreen: document.getElementById('startScreen'),
    garageScreen: document.getElementById('garageScreen'),
    gameOverScreen: document.getElementById('gameOverScreen'),
    start: document.getElementById('startButton'),
    garage: document.getElementById('garageButton'),
    backToMenu: document.getElementById('backToMenuButton'),
    motoList: document.getElementById('motoList'),
    bank: document.getElementById('bankValue'),
    restart: document.getElementById('restartButton'),
    finalScore: document.getElementById('finalScore'),
    finalDeliveries: document.getElementById('finalDeliveries'),
    finalBank: document.getElementById('finalBankValue'),
    sound: document.getElementById('soundButton'),
  };

  const W = canvas.width;
  const H = canvas.height;
  const STORAGE_KEY = 'entregaMalucaGarageV1';
  const road = { left: 52, right: 308, lanes: [95, 180, 265] };
  const controls = { left: false, right: false, boost: false };
  const motos = [
    { id: 'flecha', name: 'FLECHA VERMELHA', price: 0, speedBonus: 0, detail: 'EQUILIBRADA • GRÁTIS', primary: '#db3e4a', accent: '#f47b36', helmet: '#48a8df' },
    { id: 'rastro', name: 'RASTRO AZUL', price: 220, speedBonus: 0.28, detail: 'MAIS VELOZ • +VELOCIDADE', primary: '#347dd1', accent: '#72d7ff', helmet: '#ffc83d' },
    { id: 'falcao', name: 'FALCÃO DOURADO', price: 600, speedBonus: 0.55, detail: 'TURBO MÁXIMO • +VELOCIDADE', primary: '#f0a52b', accent: '#fff0a4', helmet: '#db3e4a' },
  ];

  let soundOn = false;
  let audioContext;
  let game;
  let garage = loadGarage();

  const colors = {
    sky: '#4b89ba', grass: '#31704d', grassDark: '#235b3f', road: '#30394e',
    curb: '#e5e6d8', roadLine: '#f6d55c', shadow: '#152035', cream: '#fff4c6',
    red: '#db3e4a', orange: '#f47b36', yellow: '#ffc83d', blue: '#48a8df',
  };

  function loadGarage() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const owned = Array.isArray(saved?.owned) ? saved.owned.filter((id) => motos.some((moto) => moto.id === id)) : [];
      if (!owned.includes('flecha')) owned.push('flecha');
      return {
        coins: Number.isFinite(saved?.coins) ? Math.max(0, Math.floor(saved.coins)) : 0,
        owned,
        selected: owned.includes(saved?.selected) ? saved.selected : 'flecha',
      };
    } catch (_) {
      return { coins: 0, owned: ['flecha'], selected: 'flecha' };
    }
  }

  function saveGarage() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(garage)); } catch (_) { /* Saving is optional. */ }
  }

  function currentMoto() {
    return motos.find((moto) => moto.id === garage.selected) ?? motos[0];
  }

  function resetGame() {
    const moto = currentMoto();
    game = {
      active: false,
      score: 0,
      deliveries: 0,
      lives: 3,
      distance: 0,
      routeLength: 700,
      speed: 3.15 + moto.speedBonus,
      stripeOffset: 0,
      elapsed: 0,
      spawnTimer: 25,
      damageTimer: 0,
      flash: 0,
      rewardSaved: false,
      player: { x: 180, y: 506, width: 28, height: 51 },
      obstacles: [],
      particles: [],
    };
    updateUi();
    draw();
  }

  function startGame() {
    resetGame();
    ui.startScreen.classList.remove('screen-visible');
    ui.garageScreen.classList.remove('screen-visible');
    ui.gameOverScreen.classList.remove('screen-visible');
    ui.gameOverScreen.setAttribute('aria-hidden', 'true');
    game.active = true;
    ui.message.textContent = `${currentMoto().name}: pedido coletado. Leve ao cliente!`;
    ui.routeIcon.textContent = '▣';
    beep(170, 0.06, 'square');
    requestAnimationFrame(loop);
  }

  function endGame() {
    game.active = false;
    if (!game.rewardSaved) {
      garage.coins += game.score;
      game.rewardSaved = true;
      saveGarage();
      renderGarage();
    }
    ui.finalScore.textContent = game.score;
    ui.finalDeliveries.textContent = game.deliveries;
    ui.finalBank.textContent = garage.coins;
    ui.gameOverScreen.classList.add('screen-visible');
    ui.gameOverScreen.setAttribute('aria-hidden', 'false');
    beep(75, 0.22, 'sawtooth');
  }

  function loop() {
    if (!game.active) return;
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function update() {
    game.elapsed++;
    const horizontalSpeed = controls.boost ? 6.5 : 4.6;
    if (controls.left) game.player.x -= horizontalSpeed;
    if (controls.right) game.player.x += horizontalSpeed;
    game.player.x = Math.max(road.left + 19, Math.min(road.right - 19, game.player.x));

    const pace = game.speed + (controls.boost ? 1.45 : 0);
    game.stripeOffset = (game.stripeOffset + pace) % 52;
    game.distance += controls.boost ? 1.55 : 1;
    game.score += controls.boost && game.elapsed % 10 === 0 ? 1 : 0;
    game.routeLength = 700 + game.deliveries * 120;

    if (game.distance >= game.routeLength) completeDelivery();

    game.spawnTimer--;
    const spawnRate = Math.max(36, 82 - game.deliveries * 4);
    if (game.spawnTimer <= 0) {
      spawnObstacle();
      game.spawnTimer = spawnRate + Math.floor(Math.random() * 30);
    }

    for (const obstacle of game.obstacles) {
      obstacle.y += pace * obstacle.speed;
      if (!obstacle.hit && collides(game.player, obstacle)) {
        obstacle.hit = true;
        game.lives--;
        game.flash = 12;
        game.damageTimer = 36;
        addCrashParticles(game.player.x, game.player.y + 22);
        beep(90, 0.12, 'square');
        updateUi();
        if (game.lives <= 0) {
          endGame();
          return;
        }
      }
    }

    game.obstacles = game.obstacles.filter((obstacle) => obstacle.y < H + 65);
    for (const particle of game.particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.12;
      particle.life--;
    }
    game.particles = game.particles.filter((particle) => particle.life > 0);
    game.damageTimer = Math.max(0, game.damageTimer - 1);
    game.flash = Math.max(0, game.flash - 1);
    updateUi();
  }

  function completeDelivery() {
    game.deliveries++;
    game.score += 100 + game.deliveries * 20;
    game.distance = 0;
    addStars(game.player.x, game.player.y);
    ui.message.textContent = `Entrega ${String(game.deliveries).padStart(2, '0')} concluída! Próximo pedido...`;
    ui.routeIcon.textContent = '★';
    setTimeout(() => {
      if (game.active) {
        ui.message.textContent = 'Novo pedido coletado. Acelera!';
        ui.routeIcon.textContent = '▣';
      }
    }, 1400);
    beep(440, 0.08, 'square');
    setTimeout(() => beep(660, 0.11, 'square'), 90);
  }

  function spawnObstacle() {
    const x = road.lanes[Math.floor(Math.random() * road.lanes.length)];
    const roll = Math.random();
    const type = roll < 0.48 ? 'car' : roll < 0.77 ? 'cone' : 'hole';
    const size = type === 'car' ? { width: 34, height: 62 } : type === 'cone' ? { width: 24, height: 28 } : { width: 38, height: 18 };
    game.obstacles.push({
      type, x, y: -size.height - 5, ...size,
      speed: type === 'car' ? 0.7 + Math.random() * 0.36 : 0.92 + Math.random() * 0.25,
      hit: false,
      color: ['#db3e4a', '#48a8df', '#ffc83d'][Math.floor(Math.random() * 3)],
    });
  }

  function collides(a, b) {
    const ax = a.x - a.width / 2 + 5;
    const ay = a.y - a.height / 2 + 7;
    const aw = a.width - 10;
    const ah = a.height - 11;
    const bx = b.x - b.width / 2 + 3;
    const by = b.y - b.height / 2 + 3;
    const bw = b.width - 6;
    const bh = b.height - 6;
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function addCrashParticles(x, y) {
    for (let i = 0; i < 12; i++) game.particles.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 4, life: 18 + Math.random() * 12, color: i % 2 ? colors.yellow : colors.orange });
  }

  function addStars(x, y) {
    for (let i = 0; i < 14; i++) game.particles.push({ x, y, vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 7, life: 24 + Math.random() * 13, color: i % 2 ? colors.cream : colors.yellow });
  }

  function updateUi() {
    if (!game) return;
    ui.score.textContent = String(game.score).padStart(3, '0');
    ui.deliveries.textContent = String(game.deliveries).padStart(2, '0');
    ui.lives.textContent = '♥'.repeat(game.lives) + '♡'.repeat(3 - game.lives);
    ui.progress.style.width = `${Math.min(100, (game.distance / game.routeLength) * 100)}%`;
  }

  function renderGarage() {
    ui.bank.textContent = String(garage.coins).padStart(3, '0');
    ui.motoList.innerHTML = motos.map((moto) => {
      const owned = garage.owned.includes(moto.id);
      const selected = garage.selected === moto.id;
      const label = selected ? 'EM USO' : owned ? 'ESCOLHER' : `COMPRAR ${moto.price} MOEDAS`;
      return `<article class="moto-card ${selected ? 'selected' : ''}">
        <div class="moto-preview" style="--bike-color:${moto.primary};--bike-accent:${moto.accent}"><i class="box"></i><i class="bike-body"></i></div>
        <div class="moto-info"><strong class="moto-name">${moto.name}</strong><span class="moto-detail">${moto.detail}</span></div>
        <button class="moto-action ${selected ? 'equipped' : ''}" data-moto-id="${moto.id}" type="button" ${selected ? 'disabled' : ''}>${label}</button>
      </article>`;
    }).join('');
  }

  function chooseOrBuyMoto(id) {
    const moto = motos.find((item) => item.id === id);
    if (!moto) return;
    if (garage.owned.includes(id)) {
      garage.selected = id;
      ui.message.textContent = `${moto.name} equipada. Bora entregar!`;
      ui.routeIcon.textContent = '★';
      beep(420, 0.07, 'square');
    } else if (garage.coins >= moto.price) {
      garage.coins -= moto.price;
      garage.owned.push(id);
      garage.selected = id;
      ui.message.textContent = `${moto.name} comprada e equipada!`;
      ui.routeIcon.textContent = '★';
      beep(550, 0.1, 'square');
    } else {
      const missing = moto.price - garage.coins;
      ui.message.textContent = `Faltam ${missing} moedas para a ${moto.name}.`;
      ui.routeIcon.textContent = '○';
      beep(120, 0.08, 'square');
      return;
    }
    saveGarage();
    renderGarage();
    resetGame();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawWorld();
    for (const obstacle of game.obstacles) drawObstacle(obstacle);
    drawParticles();
    if (game.damageTimer === 0 || Math.floor(game.damageTimer / 4) % 2 === 0) drawMotorcycle(game.player, currentMoto());
    if (game.flash > 0) {
      ctx.fillStyle = 'rgba(255, 50, 50, .13)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawWorld() {
    ctx.fillStyle = colors.sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#376b87';
    for (let x = 0; x < W; x += 29) {
      const height = 25 + ((x * 17) % 46);
      ctx.fillRect(x, 112 - height, 23, height);
      ctx.fillStyle = '#ffe27d';
      for (let wy = 120 - height; wy < 110; wy += 11) ctx.fillRect(x + 5, wy, 4, 5);
      ctx.fillStyle = '#376b87';
    }
    ctx.fillStyle = colors.grass;
    ctx.fillRect(0, 112, W, H - 112);
    for (let y = 135; y < H; y += 33) {
      ctx.fillStyle = colors.grassDark;
      ctx.fillRect(13, y + (game.stripeOffset % 23), 12, 4);
      ctx.fillRect(329, y + ((game.stripeOffset + 12) % 23), 12, 4);
    }
    ctx.fillStyle = colors.curb;
    ctx.fillRect(road.left - 7, 112, 7, H - 112);
    ctx.fillRect(road.right, 112, 7, H - 112);
    ctx.fillStyle = colors.road;
    ctx.fillRect(road.left, 112, road.right - road.left, H - 112);
    ctx.fillStyle = '#536078';
    ctx.fillRect(road.left + 3, 112, 3, H - 112);
    ctx.fillRect(road.right - 6, 112, 3, H - 112);
    ctx.fillStyle = colors.roadLine;
    for (const x of [137, 222]) for (let y = 112 - game.stripeOffset; y < H; y += 52) ctx.fillRect(x, y, 4, 27);
    ctx.fillStyle = '#1b293e';
    ctx.fillRect(24, 200, 4, 34);
    ctx.fillStyle = colors.yellow;
    ctx.fillRect(15, 188, 22, 15);
    ctx.fillStyle = '#1b293e';
    ctx.fillRect(20, 192, 12, 4);
    ctx.fillRect(332, 330, 4, 36);
    ctx.fillStyle = colors.red;
    ctx.fillRect(324, 317, 20, 17);
    ctx.fillStyle = colors.cream;
    ctx.fillRect(328, 323, 12, 4);
  }

  function drawMotorcycle(player, moto) {
    const x = Math.round(player.x);
    const y = player.y;
    ctx.fillStyle = colors.shadow;
    ctx.fillRect(x - 20, y + 22, 40, 7);
    ctx.fillStyle = '#10131e';
    ctx.fillRect(x - 18, y + 16, 10, 20);
    ctx.fillRect(x + 8, y + 16, 10, 20);
    ctx.fillStyle = '#8d9aaa';
    ctx.fillRect(x - 15, y + 20, 4, 11);
    ctx.fillRect(x + 11, y + 20, 4, 11);
    ctx.fillStyle = moto.accent;
    ctx.fillRect(x - 11, y + 9, 22, 14);
    ctx.fillStyle = moto.primary;
    ctx.fillRect(x - 14, y + 7, 23, 10);
    ctx.fillRect(x + 8, y + 14, 10, 6);
    ctx.fillStyle = colors.yellow;
    ctx.fillRect(x + 14, y + 15, 4, 4);
    ctx.fillStyle = '#74411d';
    ctx.fillRect(x - 15, y - 13, 18, 17);
    ctx.fillStyle = colors.orange;
    ctx.fillRect(x - 13, y - 11, 14, 12);
    ctx.fillStyle = '#fff1b3';
    ctx.fillRect(x - 9, y - 8, 6, 4);
    ctx.fillStyle = '#24324a';
    ctx.fillRect(x - 3, y - 8, 12, 19);
    ctx.fillStyle = '#efa878';
    ctx.fillRect(x + 1, y - 22, 10, 12);
    ctx.fillStyle = moto.helmet;
    ctx.fillRect(x - 1, y - 27, 15, 7);
    ctx.fillRect(x + 8, y - 21, 7, 4);
  }

  function drawObstacle(obstacle) {
    const x = Math.round(obstacle.x);
    const y = Math.round(obstacle.y);
    if (obstacle.type === 'car') {
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(x - 19, y + 51, 38, 8);
      ctx.fillStyle = '#182336';
      ctx.fillRect(x - 15, y + 4, 30, 52);
      ctx.fillStyle = obstacle.color;
      ctx.fillRect(x - 16, y + 11, 32, 39);
      ctx.fillRect(x - 12, y + 3, 24, 18);
      ctx.fillStyle = '#b9e7f5';
      ctx.fillRect(x - 8, y + 7, 16, 10);
      ctx.fillStyle = colors.yellow;
      ctx.fillRect(x - 13, y + 42, 5, 5);
      ctx.fillRect(x + 8, y + 42, 5, 5);
    } else if (obstacle.type === 'cone') {
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(x - 15, y + 22, 30, 5);
      ctx.fillStyle = colors.orange;
      ctx.fillRect(x - 7, y, 14, 21);
      ctx.fillRect(x - 11, y + 20, 22, 5);
      ctx.fillStyle = colors.cream;
      ctx.fillRect(x - 5, y + 9, 10, 4);
    } else {
      ctx.fillStyle = '#172033';
      ctx.fillRect(x - 19, y + 3, 38, 11);
      ctx.fillStyle = '#111827';
      ctx.fillRect(x - 14, y, 28, 17);
      ctx.fillStyle = '#4c5260';
      ctx.fillRect(x - 8, y + 3, 9, 3);
    }
  }

  function drawParticles() {
    for (const particle of game.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / 25);
      ctx.fillStyle = particle.color;
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function beep(frequency, duration, type) {
    if (!soundOn) return;
    try {
      audioContext ??= new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.04, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) { /* Browser audio is optional. */ }
  }

  function setControl(direction, pressed, button) {
    controls[direction] = pressed;
    if (button) button.classList.toggle('is-active', pressed);
  }

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const direction = key === 'arrowleft' || key === 'a' ? 'left' : key === 'arrowright' || key === 'd' ? 'right' : key === 'arrowup' || key === 'w' || key === ' ' ? 'boost' : null;
    if (!direction) return;
    event.preventDefault();
    setControl(direction, true);
  });

  document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    const direction = key === 'arrowleft' || key === 'a' ? 'left' : key === 'arrowright' || key === 'd' ? 'right' : key === 'arrowup' || key === 'w' || key === ' ' ? 'boost' : null;
    if (direction) setControl(direction, false);
  });

  document.querySelectorAll('[data-direction]').forEach((button) => {
    const direction = button.dataset.direction;
    for (const eventName of ['pointerdown', 'pointerenter']) {
      button.addEventListener(eventName, (event) => {
        if (eventName === 'pointerenter' && event.buttons !== 1) return;
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        setControl(direction, true, button);
      });
    }
    for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(eventName, () => setControl(direction, false, button));
  });

  ui.start.addEventListener('click', startGame);
  ui.restart.addEventListener('click', startGame);
  ui.garage.addEventListener('click', () => {
    renderGarage();
    ui.startScreen.classList.remove('screen-visible');
    ui.garageScreen.classList.add('screen-visible');
    ui.garageScreen.setAttribute('aria-hidden', 'false');
  });
  ui.backToMenu.addEventListener('click', () => {
    ui.garageScreen.classList.remove('screen-visible');
    ui.garageScreen.setAttribute('aria-hidden', 'true');
    ui.startScreen.classList.add('screen-visible');
    resetGame();
  });
  ui.motoList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-moto-id]');
    if (button) chooseOrBuyMoto(button.dataset.motoId);
  });
  ui.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    ui.sound.setAttribute('aria-pressed', String(soundOn));
    ui.sound.textContent = soundOn ? '♫' : '♪';
    ui.sound.setAttribute('aria-label', soundOn ? 'Desativar sons' : 'Ativar sons');
    if (soundOn) beep(330, 0.06, 'square');
  });

  renderGarage();
  resetGame();
})();
