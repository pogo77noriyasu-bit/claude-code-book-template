'use strict';

// ============================================================
// 設定
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;   // 480
const H = canvas.height;  // 640

const SHIP_Y = H - 70;          // 自機の y 座標(固定)
const SHIP_RADIUS = 14;         // 自機の当たり判定の半径(見た目より少し小さめ)
const SHIP_SPEED = 360;         // キー操作時の移動速度(px/秒)
const MAX_LIVES = 3;
const INVINCIBLE_TIME = 1.5;    // 被弾後の無敵時間(秒)
const SHIELD_TIME = 6;          // シールドの持続時間(秒)

const STAR_SCORE = 50;          // 星を取ったときの得点
const SURVIVE_SCORE = 10;       // 1秒生き残るごとの得点

// 落ちてくる物の種類。weight は出現の重み
const ITEM_TYPES = [
  { kind: 'star',   weight: 8 },
  { kind: 'shield', weight: 1 },
  { kind: 'heart',  weight: 1 },
];

// localStorage のキー
const KEY_HIGH = 'meteorDodge.highScore';
const KEY_SOUND = 'meteorDodge.sound';

// ============================================================
// 状態
// ============================================================
let state = 'ready';            // 'ready' | 'playing' | 'paused' | 'gameover'
let score = 0;
let lives = MAX_LIVES;
let elapsed = 0;                // プレイ経過時間(秒)。難易度の計算に使う
let surviveAcc = 0;             // 生存点の端数を貯めておく
let highScore = Number(loadStorage(KEY_HIGH, '0')) || 0;
let newRecord = false;
let soundOn = loadStorage(KEY_SOUND, 'on') !== 'off';

const ship = { x: W / 2, invincible: 0, shield: 0, tilt: 0 };
let meteors = [];
let items = [];
let particles = [];
let meteorTimer = 0;
let itemTimer = 2;
let shake = 0;                  // 画面揺れの強さ

// 背景の星(3層のパララックス)
const bgStars = Array.from({ length: 90 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  layer: 1 + Math.floor(Math.random() * 3),
}));

// ============================================================
// 保存(localStorage が使えない環境でも遊べるよう try/catch で包む)
// ============================================================
function loadStorage(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
function saveStorage(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {
    // 保存できなくても続行する
  }
}

function addScore(n) {
  score += n;
  if (score > highScore) {
    highScore = score;
    newRecord = true;
    saveStorage(KEY_HIGH, highScore);
  }
}

// ============================================================
// 効果音(Web Audio API で合成)
// ============================================================
let audioCtx = null;

function tone(freq, duration, type = 'square', volume = 0.08, slideTo = null) {
  if (!audioCtx) {
    // 自動再生制限があるので、最初に鳴らすときに作る
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

const SOUNDS = {
  start:  () => { tone(440, 0.1); setTimeout(() => tone(660, 0.15), 90); },
  star:   () => tone(1200, 0.1, 'triangle', 0.07, 1800),
  shield: () => tone(500, 0.3, 'sine', 0.1, 1000),
  heart:  () => { tone(660, 0.1, 'triangle'); setTimeout(() => tone(880, 0.15, 'triangle'), 80); },
  hit:    () => tone(200, 0.35, 'sawtooth', 0.12, 50),
  block:  () => tone(900, 0.15, 'sine', 0.1, 300),
  over:   () => tone(300, 0.8, 'triangle', 0.12, 60),
};

function playSound(name) {
  if (!soundOn) return;
  const s = SOUNDS[name];
  if (s) s();
}

const soundButton = document.getElementById('sound-toggle');
function updateSoundButton() {
  soundButton.textContent = soundOn ? '音: ON' : '音: OFF';
}
function toggleSound() {
  soundOn = !soundOn;
  saveStorage(KEY_SOUND, soundOn ? 'on' : 'off');
  updateSoundButton();
}
soundButton.addEventListener('click', () => {
  toggleSound();
  soundButton.blur(); // スペースキーでボタンが反応しないようにする
});
updateSoundButton();

// ============================================================
// ゲームの初期化・状態遷移
// ============================================================
function resetGame() {
  score = 0;
  lives = MAX_LIVES;
  elapsed = 0;
  surviveAcc = 0;
  newRecord = false;
  ship.x = W / 2;
  ship.invincible = 0;
  ship.shield = 0;
  meteors = [];
  items = [];
  particles = [];
  meteorTimer = 0;
  itemTimer = 2;
}

// スペース/Enter/クリック/タップで呼ばれる
function launch() {
  if (state === 'ready' || state === 'gameover') {
    resetGame();
    state = 'playing';
    playSound('start');
  }
}

function togglePause() {
  if (state === 'playing') state = 'paused';
  else if (state === 'paused') state = 'playing';
}

// ============================================================
// 入力
// ============================================================
const keys = { left: false, right: false };
let pointerX = null; // ドラッグ中の目標 x(キャンバス座標)

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  else if (e.key === ' ' || e.key === 'Enter') { launch(); e.preventDefault(); }
  else if (e.key === 'p' || e.key === 'P') togglePause();
  else if (e.key === 'm' || e.key === 'M') toggleSound();
  if (e.key.startsWith('Arrow')) e.preventDefault();
  if (keys.left || keys.right) pointerX = null; // キー操作中はポインタ追従をやめる
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});

// CSS で縮小表示しているので、画面座標をキャンバス内部の座標に変換する
function pointerToCanvasX(e) {
  const rect = canvas.getBoundingClientRect();
  return ((e.clientX - rect.left) / rect.width) * W;
}

let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'playing' && state !== 'paused') { launch(); return; }
  dragging = true;
  pointerX = pointerToCanvasX(e);
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  // マウスはボタンを押していなくても追従、タッチはドラッグ中のみ
  if (dragging || e.pointerType === 'mouse') pointerX = pointerToCanvasX(e);
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

// タブが裏に回ったら自動で一時停止
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') state = 'paused';
});

// ============================================================
// 生成
// ============================================================

// 経過時間に応じた難易度(0 から始まり、ゆっくり上がり続ける)
function difficulty() {
  return elapsed / 20;
}

function spawnMeteor() {
  const d = difficulty();
  const r = 12 + Math.random() * (14 + d * 4);
  // 凸凹した岩の形を作るため、頂点ごとの半径の揺らぎを先に決めておく
  const verts = Array.from({ length: 9 }, () => 0.75 + Math.random() * 0.35);
  meteors.push({
    x: r + Math.random() * (W - r * 2),
    y: -r,
    r,
    vy: 140 + Math.random() * 80 + d * 45,
    vx: (Math.random() - 0.5) * (30 + d * 20),
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 3,
    verts,
  });
}

function pickItemKind() {
  const total = ITEM_TYPES.reduce((s, t) => s + t.weight, 0);
  let n = Math.random() * total;
  for (const t of ITEM_TYPES) {
    n -= t.weight;
    if (n < 0) return t.kind;
  }
  return ITEM_TYPES[0].kind;
}

function spawnItem() {
  let kind = pickItemKind();
  if (kind === 'heart' && lives >= MAX_LIVES) kind = 'star'; // 満タンならハートは出さない
  items.push({
    kind,
    x: 20 + Math.random() * (W - 40),
    y: -16,
    vy: 120 + Math.random() * 40,
    t: 0,
  });
}

function burst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.4 + Math.random() * 0.5,
      max: 0.9,
      color,
    });
  }
}

// ============================================================
// 更新(dt は秒単位。フレームレートに依存しない)
// ============================================================
function update(dt) {
  // 背景の星はどの状態でも流しておく(一時停止中は止める)
  if (state !== 'paused') {
    const speedUp = state === 'playing' ? 1 + difficulty() * 0.3 : 1;
    for (const s of bgStars) {
      s.y += s.layer * 25 * speedUp * dt;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    }
  }
  updateParticles(dt);
  shake = Math.max(0, shake - dt * 30);

  if (state !== 'playing') return;

  elapsed += dt;

  // 生存点
  surviveAcc += dt * SURVIVE_SCORE;
  if (surviveAcc >= 1) {
    const n = Math.floor(surviveAcc);
    surviveAcc -= n;
    addScore(n);
  }

  // 自機の移動
  const prevX = ship.x;
  if (keys.left) ship.x -= SHIP_SPEED * dt;
  if (keys.right) ship.x += SHIP_SPEED * dt;
  if (pointerX !== null && !keys.left && !keys.right) {
    // 目標位置へなめらかに寄せる(速すぎないよう上限あり)
    const diff = pointerX - ship.x;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), SHIP_SPEED * 1.8 * dt);
    ship.x += step;
  }
  ship.x = Math.max(SHIP_RADIUS + 4, Math.min(W - SHIP_RADIUS - 4, ship.x));
  // 移動方向に機体を少し傾ける(見た目用)
  const targetTilt = Math.max(-1, Math.min(1, (ship.x - prevX) / (SHIP_SPEED * dt || 1)));
  ship.tilt += (targetTilt - ship.tilt) * Math.min(1, dt * 10);

  ship.invincible = Math.max(0, ship.invincible - dt);
  ship.shield = Math.max(0, ship.shield - dt);

  // 隕石の生成。難易度が上がるほど間隔が短くなる
  meteorTimer -= dt;
  if (meteorTimer <= 0) {
    spawnMeteor();
    meteorTimer = Math.max(0.18, 0.9 - difficulty() * 0.12) * (0.6 + Math.random() * 0.8);
  }
  itemTimer -= dt;
  if (itemTimer <= 0) {
    spawnItem();
    itemTimer = 1.2 + Math.random() * 1.5;
  }

  // 隕石の移動と当たり判定
  for (const m of meteors) {
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.angle += m.spin * dt;
    if (m.x < m.r || m.x > W - m.r) m.vx *= -1; // 左右の壁で跳ね返る

    if (!m.dead && circleHit(m.x, m.y, m.r * 0.85, ship.x, SHIP_Y, SHIP_RADIUS)) {
      if (ship.shield > 0) {
        // シールドで隕石を破壊(シールドは残る)
        m.dead = true;
        burst(m.x, m.y, '#7fd8ff', 14, 200);
        addScore(20);
        playSound('block');
      } else if (ship.invincible <= 0) {
        m.dead = true;
        hitShip();
      }
    }
  }
  meteors = meteors.filter((m) => !m.dead && m.y - m.r < H);

  // アイテムの移動と取得判定
  for (const it of items) {
    it.y += it.vy * dt;
    it.t += dt;
    if (circleHit(it.x, it.y, 14, ship.x, SHIP_Y, SHIP_RADIUS + 6)) {
      it.dead = true;
      collect(it);
    }
  }
  items = items.filter((it) => !it.dead && it.y < H + 20);
}

function circleHit(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy < (r1 + r2) * (r1 + r2);
}

function hitShip() {
  lives--;
  shake = 12;
  burst(ship.x, SHIP_Y, '#ff9a5a', 30, 260);
  if (lives <= 0) {
    state = 'gameover';
    burst(ship.x, SHIP_Y, '#ffffff', 40, 340);
    playSound('over');
  } else {
    ship.invincible = INVINCIBLE_TIME;
    playSound('hit');
  }
}

function collect(it) {
  if (it.kind === 'star') {
    addScore(STAR_SCORE);
    burst(it.x, it.y, '#ffe066', 12, 150);
    playSound('star');
  } else if (it.kind === 'shield') {
    ship.shield = SHIELD_TIME;
    burst(it.x, it.y, '#7fd8ff', 16, 180);
    playSound('shield');
  } else if (it.kind === 'heart') {
    lives = Math.min(MAX_LIVES, lives + 1);
    burst(it.x, it.y, '#ff6b9a', 16, 180);
    playSound('heart');
  }
}

function updateParticles(dt) {
  if (state === 'paused') return;
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

// ============================================================
// 描画
// ============================================================
function draw() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  // 背景
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#05081a');
  g.addColorStop(1, '#141a3d');
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);
  for (const s of bgStars) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 * s.layer})`;
    ctx.fillRect(s.x, s.y, s.layer * 0.8, s.layer * 0.8);
  }

  for (const it of items) drawItem(it);
  for (const m of meteors) drawMeteor(m);
  if (state !== 'gameover') drawShip();
  drawParticles();

  ctx.restore();

  drawHud();

  if (state === 'ready') {
    drawCenterText('流星よけ', '降りそそぐ隕石をよけて星を集めよう', 'スペース / クリック / タップでスタート');
  } else if (state === 'paused') {
    drawCenterText('一時停止', '', 'P キーで再開');
  } else if (state === 'gameover') {
    drawCenterText(
      'ゲームオーバー',
      `スコア ${score}` + (newRecord ? '  ハイスコア更新!' : ''),
      'スペース / クリック / タップでもう一度'
    );
  }
}

function drawShip() {
  // 無敵中は点滅させる
  if (ship.invincible > 0 && Math.floor(ship.invincible * 12) % 2 === 0) return;

  ctx.save();
  ctx.translate(ship.x, SHIP_Y);
  ctx.rotate(ship.tilt * 0.25);

  // 噴射炎
  const flame = 10 + Math.random() * 8;
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.moveTo(-6, 14);
  ctx.lineTo(0, 14 + flame);
  ctx.lineTo(6, 14);
  ctx.closePath();
  ctx.fill();

  // 機体
  ctx.fillStyle = '#e8ecff';
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(16, 14);
  ctx.lineTo(0, 8);
  ctx.lineTo(-16, 14);
  ctx.closePath();
  ctx.fill();
  // 操縦席
  ctx.fillStyle = '#4fc3ff';
  ctx.beginPath();
  ctx.ellipse(0, -4, 4, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // シールド(残り時間が少ないと点滅)
  if (ship.shield > 0 && (ship.shield > 1.5 || Math.floor(ship.shield * 8) % 2 === 0)) {
    ctx.strokeStyle = 'rgba(127,216,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(127,216,255,0.12)';
    ctx.fill();
  }
  ctx.restore();
}

function drawMeteor(m) {
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.angle);
  ctx.fillStyle = '#8a6a55';
  ctx.strokeStyle = '#c49a7a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  m.verts.forEach((k, i) => {
    const a = (i / m.verts.length) * Math.PI * 2;
    const x = Math.cos(a) * m.r * k;
    const y = Math.sin(a) * m.r * k;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // クレーター
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(m.r * 0.25, -m.r * 0.2, m.r * 0.22, 0, Math.PI * 2);
  ctx.arc(-m.r * 0.3, m.r * 0.25, m.r * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawItem(it) {
  ctx.save();
  ctx.translate(it.x, it.y);
  const pulse = 1 + Math.sin(it.t * 8) * 0.1;
  ctx.scale(pulse, pulse);
  if (it.kind === 'star') {
    ctx.rotate(it.t * 2);
    ctx.fillStyle = '#ffe066';
    drawStarShape(12, 5);
  } else if (it.kind === 'shield') {
    ctx.strokeStyle = '#7fd8ff';
    ctx.fillStyle = 'rgba(127,216,255,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7fd8ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', 0, 1);
  } else if (it.kind === 'heart') {
    ctx.fillStyle = '#ff6b9a';
    drawHeartShape(12);
  }
  ctx.restore();
}

function drawStarShape(outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

function drawHeartShape(size) {
  const s = size / 12;
  ctx.beginPath();
  ctx.moveTo(0, 10 * s);
  ctx.bezierCurveTo(-14 * s, 0, -8 * s, -12 * s, 0, -5 * s);
  ctx.bezierCurveTo(8 * s, -12 * s, 14 * s, 0, 0, 10 * s);
  ctx.fill();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.fillStyle = '#dfe6ff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(`スコア ${score}`, 12, 10);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8f9bd0';
  ctx.font = '14px sans-serif';
  ctx.fillText(`ハイスコア ${highScore}`, W - 12, 12);

  // 残りライフをハートで表示
  for (let i = 0; i < MAX_LIVES; i++) {
    ctx.save();
    ctx.translate(20 + i * 24, 46);
    ctx.fillStyle = i < lives ? '#ff6b9a' : 'rgba(255,107,154,0.2)';
    drawHeartShape(9);
    ctx.restore();
  }
}

function drawCenterText(title, sub, hint) {
  ctx.fillStyle = 'rgba(5,8,26,0.6)';
  ctx.fillRect(0, H / 2 - 90, W, 180);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText(title, W / 2, H / 2 - 40);
  if (sub) {
    ctx.fillStyle = '#ffe066';
    ctx.font = '18px sans-serif';
    ctx.fillText(sub, W / 2, H / 2 + 8);
  }
  ctx.fillStyle = '#8f9bd0';
  ctx.font = '15px sans-serif';
  ctx.fillText(hint, W / 2, H / 2 + 50);
}

// ============================================================
// ループ
// ============================================================
let lastTime = performance.now();
function loop(now) {
  // タブ復帰直後などに dt が大きくなりすぎないよう上限を付ける
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
