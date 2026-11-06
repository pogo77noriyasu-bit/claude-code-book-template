'use strict';

// ============================================================
// 設定
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;   // 640
const H = canvas.height;  // 480

const GROUND = 400;             // 地面の y 座標
const CANOPY_Y = 150;           // 木の葉っぱの中心の高さ
const TREES_PER_STAGE = 3;      // 1面あたりの木の本数(全部切ると面クリア)
const TREE_HP = 8;              // 木を倒すのに必要なオノの回数

const PLAYER_SPEED = 170;       // 移動速度(px/秒)
const PLAYER_HALF = 10;         // 当たり判定の半幅(見た目より小さめにして遊びやすくする)
const CHOP_COOLDOWN = 0.24;     // オノを振る間隔(秒)
const SWING_TIME = 0.16;        // オノを振るアニメーションの長さ(秒)
const STUN_TIME = 1.4;          // 鳥のフンでしびれる時間(秒)
const RESPAWN_INVINCIBLE = 2;   // 復活直後の無敵時間(秒)
const MAX_LIVES = 3;

// 得点
const SCORE_CHOP = 10;          // 木に1回オノを入れる
const SCORE_TREE = 500;         // 木を切り倒す
const SCORE_SNAKE = 100;        // ヘビをオノで倒す
const SCORE_BOAR = 200;         // イノシシをオノで倒す
const SCORE_CRUSH = 300;        // 倒れた木で敵を下敷きにする
const SCORE_STAGE = 1000;       // 面クリアのボーナス(×面数)

// localStorage のキー
const KEY_HIGH = 'kikoriMokuta.highScore';
const KEY_SOUND = 'kikoriMokuta.sound';

// ============================================================
// 状態
// ============================================================
// 'ready' | 'playing' | 'dying' | 'clear' | 'paused' | 'gameover'
let state = 'ready';
let pausedFrom = 'playing';     // 一時停止を解除したときに戻る状態
let stateTimer = 0;             // dying / clear の演出用タイマー
let score = 0;
let lives = MAX_LIVES;
let stage = 1;
let highScore = Number(loadStorage(KEY_HIGH, '0')) || 0;
let newRecord = false;
let soundOn = loadStorage(KEY_SOUND, 'on') !== 'off';

const player = {
  x: 60,
  dir: 1,          // 向き(1: 右, -1: 左)
  chopCool: 0,     // 次にオノを振れるまでの時間
  swing: 0,        // オノを振るアニメーションの残り時間
  stun: 0,         // しびれている残り時間
  invincible: 0,   // 無敵の残り時間
  hiding: false,   // 木の陰にかくれているか
  walk: 0,         // 歩きアニメーション用
  ghostY: 0,       // やられたときに浮かんでいく量
};

let trees = [];
let enemies = [];   // ヘビとイノシシ
let branches = [];  // 落ちてくる枝
let birds = [];
let drops = [];     // 鳥のフン
let particles = [];
let popups = [];    // 得点の表示
let enemyTimer = 0;
let birdTimer = 0;
let shake = 0;

const keys = { left: false, right: false, down: false };

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

function addScore(n, x, y) {
  score += n;
  if (x !== undefined) popups.push({ x, y, text: String(n), life: 0.9 });
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

// delay 秒後に1音鳴らす
function tone(freq, duration, type = 'square', volume = 0.08, slideTo = null, delay = 0) {
  if (!audioCtx) {
    // 自動再生制限があるので、最初に鳴らすときに作る
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }
  const t = audioCtx.currentTime + delay;
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

// 音符の並び [周波数, 長さ] を順に鳴らす(このゲームのためのオリジナルの短いフレーズ)
function melody(notes, type = 'square', volume = 0.07) {
  let t = 0;
  for (const [f, d] of notes) {
    if (f) tone(f, d * 0.9, type, volume, null, t);
    t += d;
  }
}

const SOUNDS = {
  start: () => melody([[392, 0.12], [523, 0.12], [659, 0.12], [784, 0.24], [659, 0.12], [784, 0.36]]),
  chop:  () => { tone(1500, 0.05, 'square', 0.06, 700); tone(180, 0.09, 'triangle', 0.12, 90); },
  fall:  () => { tone(300, 0.5, 'sawtooth', 0.08, 60); tone(90, 0.4, 'triangle', 0.14, 40, 0.4); },
  whiff: () => tone(400, 0.05, 'triangle', 0.04),
  kill:  () => tone(880, 0.12, 'square', 0.07, 1760),
  crush: () => { tone(660, 0.1, 'square', 0.07); tone(990, 0.15, 'square', 0.07, null, 0.08); },
  stun:  () => tone(1200, 0.4, 'sine', 0.06, 300),
  warn:  () => tone(1000, 0.08, 'square', 0.05),
  miss:  () => melody([[523, 0.15], [494, 0.15], [466, 0.15], [440, 0.5]], 'triangle', 0.1),
  clear: () => melody([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.3], [0, 0.05], [988, 0.1], [1047, 0.4]]),
  over:  () => melody([[392, 0.3], [330, 0.3], [262, 0.7]], 'triangle', 0.1),
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
// 初期化・状態遷移
// ============================================================
function resetGame() {
  score = 0;
  lives = MAX_LIVES;
  stage = 1;
  newRecord = false;
  setupStage();
}

// 面の開始: 木を並べ直して、敵などを全部消す
function setupStage() {
  trees = [];
  // 画面を3つに分けて、それぞれの区画に1本ずつ少しずらして植える
  const section = (W - 160) / TREES_PER_STAGE;
  for (let i = 0; i < TREES_PER_STAGE; i++) {
    const x = 120 + section * i + section / 2 + (Math.random() - 0.5) * 50;
    trees.push({ x, hp: TREE_HP, state: 'stand', angle: 0, fallDir: 1, fade: 1, shake: 0, crushed: false });
  }
  resetActors();
  player.x = 50;
  player.dir = 1;
  player.invincible = RESPAWN_INVINCIBLE;
}

// 敵や落下物を消して、自分の状態を戻す(面開始・復活時)
function resetActors() {
  enemies = [];
  branches = [];
  birds = [];
  drops = [];
  enemyTimer = 2.5;
  birdTimer = 5;
  player.chopCool = 0;
  player.swing = 0;
  player.stun = 0;
  player.hiding = false;
  player.ghostY = 0;
}

function launch() {
  resetGame();
  state = 'playing';
  playSound('start');
}

function togglePause() {
  if (state === 'paused') {
    state = pausedFrom;
  } else if (state === 'playing' || state === 'dying' || state === 'clear') {
    pausedFrom = state;
    state = 'paused';
  }
}

// ============================================================
// 入力
// ============================================================
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'down', KeyS: 'down',
};

window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) {
    keys[KEYMAP[e.code]] = true;
    e.preventDefault();
    return;
  }
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ' || e.code === 'KeyJ') {
    e.preventDefault();
    if (e.repeat) return; // 押しっぱなしで連打にならないようにする
    pressAction();
  } else if (e.code === 'KeyP') {
    togglePause();
  } else if (e.code === 'KeyM') {
    toggleSound();
  }
});

window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false;
});

// スタート・リトライ、またはプレイ中ならオノを振る
function pressAction() {
  if (state === 'ready' || state === 'gameover') launch();
  else if (state === 'playing') chop();
  else if (state === 'paused') togglePause();
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state !== 'playing') pressAction();
});

// タッチ用ボタン: 押している間だけキーが押されている扱いにする
document.querySelectorAll('.pad button').forEach((btn) => {
  const k = btn.dataset.key;
  const down = (e) => {
    e.preventDefault();
    if (k === 'axe') pressAction();
    else keys[k] = true;
  };
  const up = () => { if (k !== 'axe') keys[k] = false; };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
});

// タブを切り替えたら自動で一時停止する
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state !== 'paused') togglePause();
  keys.left = keys.right = keys.down = false;
});

// ============================================================
// 行動(オノ)
// ============================================================
// 目の前にある、立っている木を探す
function treeInFront() {
  return trees.find((t) => {
    if (t.state !== 'stand') return false;
    const d = (t.x - player.x) * player.dir; // 向いている方向への距離
    return d > 8 && d < 42;
  });
}

function chop() {
  if (player.chopCool > 0 || player.stun > 0 || player.hiding) return;
  player.chopCool = CHOP_COOLDOWN;
  player.swing = SWING_TIME;

  // まず目の前の敵を狙う(オノの届く範囲)
  const reachFrom = player.x + player.dir * 6;
  const reachTo = player.x + player.dir * 52;
  const lo = Math.min(reachFrom, reachTo);
  const hi = Math.max(reachFrom, reachTo);
  let hitEnemy = false;
  for (const e of enemies) {
    if (e.warn > 0 || e.dead) continue;
    if (e.x + e.half > lo && e.x - e.half < hi) {
      killEnemy(e, e.type === 'boar' ? SCORE_BOAR : SCORE_SNAKE);
      hitEnemy = true;
    }
  }
  if (hitEnemy) {
    playSound('kill');
    return;
  }

  // 敵がいなければ木を切る
  const t = treeInFront();
  if (!t) {
    // 空振り
    playSound('whiff');
    return;
  }
  t.hp--;
  t.shake = 0.15;
  playSound('chop');
  addScore(SCORE_CHOP);
  burst(t.x - player.dir * 12, GROUND - 30, '#e8c27a', 6, 120);

  // 切っている最中に枝が落ちてくることがある(面が進むほど起こりやすい)
  const branchChance = Math.min(0.5, 0.18 + stage * 0.04);
  if (t.hp > 0 && Math.random() < branchChance) spawnBranch(t);

  if (t.hp <= 0) {
    // 自分と反対側へ倒れる
    t.state = 'falling';
    t.fallDir = player.dir;
    addScore(SCORE_TREE, t.x, GROUND - 120);
    playSound('fall');
    shake = 6;
  }
}

function killEnemy(e, points) {
  e.dead = true;
  addScore(points, e.x, GROUND - 40);
  burst(e.x, GROUND - 10, e.type === 'boar' ? '#8a5a34' : '#5fbf4a', 12, 160);
}

// ============================================================
// 生成
// ============================================================
function spawnEnemy() {
  // 同時に出てくる敵の数を制限して、見切れるようにする
  const limit = Math.min(4, 2 + Math.floor(stage / 2));
  if (enemies.filter((e) => !e.dead).length >= limit) return;

  const fromLeft = Math.random() < 0.5;
  const boarChance = Math.min(0.5, 0.2 + stage * 0.05);
  if (Math.random() < boarChance) {
    // イノシシ: 画面の端に「！」を出して予告してから突進してくる
    enemies.push({
      type: 'boar', x: fromLeft ? -30 : W + 30, dir: fromLeft ? 1 : -1,
      speed: 190 + stage * 15, half: 20, warn: 1.0, dead: false, anim: 0,
    });
    playSound('warn');
  } else {
    // ヘビ: ゆっくり這ってくる。ときどき向きを変える
    enemies.push({
      type: 'snake', x: fromLeft ? -20 : W + 20, dir: fromLeft ? 1 : -1,
      speed: 45 + stage * 8, half: 16, warn: 0, dead: false, anim: 0,
      turnTimer: 2 + Math.random() * 3, turns: 0,
    });
  }
}

function spawnBranch(tree) {
  // 木の葉っぱの範囲のどこか(自分の近くを狙いやすい)から落ちる
  const x = tree.x + (player.x - tree.x) * 0.5 + (Math.random() - 0.5) * 70;
  branches.push({ x, y: CANOPY_Y + 20, vy: 0, warn: 0.65, rot: Math.random() * Math.PI });
}

function spawnBird() {
  const fromLeft = Math.random() < 0.5;
  birds.push({
    x: fromLeft ? -20 : W + 20, y: 50 + Math.random() * 50,
    dir: fromLeft ? 1 : -1, speed: 100 + stage * 8,
    dropsLeft: 1 + (stage >= 3 ? 1 : 0), dropCool: 0, flap: 0,
  });
}

function burst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
      life: 0.5 + Math.random() * 0.4, color,
    });
  }
}

// ============================================================
// 更新
// ============================================================
function update(dt) {
  if (shake > 0) shake = Math.max(0, shake - dt * 20);
  updateParticles(dt);

  if (state === 'dying') {
    // やられ演出: 魂が浮かんでいく
    stateTimer -= dt;
    player.ghostY += dt * 70;
    if (stateTimer <= 0) {
      lives--;
      if (lives <= 0) {
        state = 'gameover';
        playSound('over');
      } else {
        resetActors();
        player.invincible = RESPAWN_INVINCIBLE;
        state = 'playing';
      }
    }
    return;
  }

  if (state === 'clear') {
    stateTimer -= dt;
    updateTrees(dt);
    if (stateTimer <= 0) {
      stage++;
      setupStage();
      state = 'playing';
      playSound('start');
    }
    return;
  }

  if (state !== 'playing') return;

  updatePlayer(dt);
  updateTrees(dt);
  updateEnemies(dt);
  updateBranches(dt);
  updateBirds(dt);

  // 敵の出現
  enemyTimer -= dt;
  if (enemyTimer <= 0) {
    spawnEnemy();
    const base = Math.max(1.6, 4.2 - stage * 0.3);
    enemyTimer = base * (0.7 + Math.random() * 0.6);
  }
  birdTimer -= dt;
  if (birdTimer <= 0) {
    spawnBird();
    birdTimer = Math.max(4, 9 - stage * 0.6) * (0.7 + Math.random() * 0.6);
  }

  // 全部の木を倒したら面クリア
  if (trees.every((t) => t.state !== 'stand') && trees.every((t) => t.state === 'gone' || t.angle >= Math.PI / 2)) {
    state = 'clear';
    stateTimer = 2.6;
    addScore(SCORE_STAGE * stage);
    playSound('clear');
  }
}

function updatePlayer(dt) {
  if (player.chopCool > 0) player.chopCool -= dt;
  if (player.swing > 0) player.swing -= dt;
  if (player.invincible > 0) player.invincible -= dt;

  if (player.stun > 0) {
    player.stun -= dt;
    player.hiding = false;
    return;
  }

  // ↓を押していて、立っている木の幹に重なっていればかくれる
  const nearTree = trees.find((t) => t.state === 'stand' && Math.abs(t.x - player.x) < 22);
  player.hiding = keys.down && !!nearTree;
  if (player.hiding) return; // かくれている間は動けない

  let move = 0;
  if (keys.left) move -= 1;
  if (keys.right) move += 1;
  // オノを振っている最中は動けない
  if (move !== 0 && player.swing <= 0) {
    player.dir = move;
    player.x += move * PLAYER_SPEED * dt;
    player.walk += dt * 10;
  }
  player.x = Math.max(16, Math.min(W - 16, player.x));
}

function updateTrees(dt) {
  for (const t of trees) {
    if (t.shake > 0) t.shake -= dt;
    if (t.state === 'falling') {
      // だんだん速く倒れる
      t.angle += dt * (0.6 + t.angle * 2.8);
      // 倒れる途中で、倒れる側にいる敵を下敷きにする
      if (t.angle > 0.9 && !t.crushed) {
        t.crushed = true;
        for (const e of enemies) {
          if (e.dead || e.warn > 0) continue;
          const d = (e.x - t.x) * t.fallDir;
          if (d > 10 && d < GROUND - CANOPY_Y + 40) {
            killEnemy(e, SCORE_CRUSH);
            playSound('crush');
          }
        }
      }
      if (t.angle >= Math.PI / 2) {
        t.angle = Math.PI / 2;
        t.state = 'down';
        shake = 8;
        burst(t.x + t.fallDir * 150, GROUND - 10, '#6b8f3a', 18, 200);
      }
    } else if (t.state === 'down') {
      // 倒れた木はしばらくしたら消える(切り株は残る)
      t.fade -= dt * 0.8;
      if (t.fade <= 0) t.state = 'gone';
    }
  }
}

// プレイヤーに当たったか(左右方向だけで判定)
function touchesPlayer(x, half) {
  return Math.abs(x - player.x) < half + PLAYER_HALF;
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.dead) continue;
    e.anim += dt;
    if (e.warn > 0) {
      e.warn -= dt;
      continue;
    }
    e.x += e.dir * e.speed * dt;

    // ヘビは画面内でときどき向きを変える(最大2回)
    if (e.type === 'snake' && e.x > 40 && e.x < W - 40) {
      e.turnTimer -= dt;
      if (e.turnTimer <= 0 && e.turns < 2) {
        e.dir *= -1;
        e.turns++;
        e.turnTimer = 2 + Math.random() * 3;
      }
    }

    if (!player.hiding && player.invincible <= 0 && touchesPlayer(e.x, e.half - 4)) {
      miss();
      return;
    }
  }
  // 死んだ敵と、画面外に出た敵を消す
  enemies = enemies.filter((e) => !e.dead && e.x > -60 && e.x < W + 60);
}

function updateBranches(dt) {
  for (const b of branches) {
    if (b.warn > 0) {
      b.warn -= dt;
      continue;
    }
    b.vy += 900 * dt;
    b.y += b.vy * dt;
    b.rot += dt * 6;
    // 頭の高さまで落ちてきたら当たり判定(かくれていても枝は防げない)
    if (b.y > GROUND - 56 && b.y < GROUND - 10 && player.invincible <= 0 && touchesPlayer(b.x, 12)) {
      miss();
      return;
    }
    if (b.y >= GROUND - 6) {
      b.done = true;
      burst(b.x, GROUND - 6, '#7a5232', 8, 120);
    }
  }
  branches = branches.filter((b) => !b.done);
}

function updateBirds(dt) {
  for (const b of birds) {
    b.x += b.dir * b.speed * dt;
    b.flap += dt * 12;
    if (b.dropCool > 0) b.dropCool -= dt;
    // 自分の真上あたりに来たらフンを落とす
    if (b.dropsLeft > 0 && b.dropCool <= 0 && Math.abs(b.x - player.x) < 60 && Math.random() < dt * 3) {
      drops.push({ x: b.x, y: b.y + 8, vy: 60 });
      b.dropsLeft--;
      b.dropCool = 0.8;
    }
  }
  birds = birds.filter((b) => b.x > -40 && b.x < W + 40);

  for (const d of drops) {
    d.vy += 300 * dt;
    d.y += d.vy * dt;
    // 木の陰にかくれていれば葉っぱが守ってくれる
    if (d.y > GROUND - 56 && d.y < GROUND - 10 && !player.hiding && player.stun <= 0 && touchesPlayer(d.x, 6)) {
      d.done = true;
      player.stun = STUN_TIME;
      player.swing = 0;
      playSound('stun');
      burst(d.x, d.y, '#f2f2e0', 8, 90);
    }
    if (d.y >= GROUND - 2) {
      d.done = true;
      burst(d.x, GROUND - 2, '#f2f2e0', 4, 60);
    }
  }
  drops = drops.filter((d) => !d.done);
}

function miss() {
  if (state !== 'playing') return;
  state = 'dying';
  stateTimer = 2;
  player.hiding = false;
  player.stun = 0;
  shake = 10;
  playSound('miss');
}

function updateParticles(dt) {
  for (const p of particles) {
    p.vy += 500 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) {
    p.y -= 40 * dt;
    p.life -= dt;
  }
  popups = popups.filter((p) => p.life > 0);
}

// ============================================================
// 描画
// ============================================================
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  drawBackground();

  // かくれているときは自分を木より奥に描く
  if (player.hiding) drawPlayer();
  for (const t of trees) drawTree(t);
  for (const e of enemies) drawEnemy(e);
  if (!player.hiding) drawPlayer();
  for (const b of branches) drawBranch(b);
  for (const d of drops) drawDrop(d);
  for (const b of birds) drawBird(b);
  drawParticles();

  ctx.restore();
  drawHud();

  if (state === 'ready') {
    drawCenterText('きこりのモク太', 'ヘビやイノシシをよけて、木を3本切り倒そう',
      'スペース / クリック でスタート');
  } else if (state === 'paused') {
    drawCenterText('一時停止', '', 'P または スペース で再開');
  } else if (state === 'clear') {
    drawCenterText(`STAGE ${stage} クリア!`, `ボーナス ${SCORE_STAGE * stage} 点`, '');
  } else if (state === 'gameover') {
    drawCenterText('ゲームオーバー', `スコア ${score}${newRecord ? '  ハイスコア更新!' : ''}`,
      'スペース / クリック でもう一度');
  }
}

function drawBackground() {
  // 空
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#6fb7e8');
  sky.addColorStop(1, '#cfeaf2');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND);

  // 遠くの山
  ctx.fillStyle = '#8fb5a0';
  ctx.beginPath();
  ctx.moveTo(0, 300);
  ctx.lineTo(90, 220); ctx.lineTo(180, 290); ctx.lineTo(300, 200);
  ctx.lineTo(420, 285); ctx.lineTo(530, 215); ctx.lineTo(640, 280);
  ctx.lineTo(640, GROUND); ctx.lineTo(0, GROUND);
  ctx.fill();

  // 奥の森のシルエット
  ctx.fillStyle = '#4f8a52';
  for (let x = -20; x < W + 40; x += 38) {
    const h = 40 + ((x * 37) % 30);
    ctx.beginPath();
    ctx.moveTo(x, GROUND - 20);
    ctx.lineTo(x + 20, GROUND - 20 - h);
    ctx.lineTo(x + 40, GROUND - 20);
    ctx.fill();
  }

  // 地面
  ctx.fillStyle = '#7a5a36';
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#5c9a3e';
  ctx.fillRect(0, GROUND - 6, W, 12);
  ctx.fillStyle = '#6a4a2a';
  for (let x = 10; x < W; x += 47) ctx.fillRect(x, GROUND + 30 + ((x * 13) % 30), 6, 4);
}

function drawTree(t) {
  if (t.state === 'gone') {
    drawStump(t.x);
    return;
  }
  const trunkW = 26;
  const trunkH = GROUND - CANOPY_Y;
  ctx.save();
  // 倒れるときは根元(切り口の高さ)を支点に回転させる
  const pivotY = GROUND - 24;
  let sx = t.shake > 0 ? Math.sin(t.shake * 120) * 2 : 0;
  ctx.translate(t.x + sx, pivotY);
  ctx.rotate(t.angle * t.fallDir);
  ctx.globalAlpha = t.state === 'down' ? Math.max(0, t.fade) : 1;

  // 幹
  ctx.fillStyle = '#7b4f2a';
  ctx.fillRect(-trunkW / 2, -(trunkH - 24), trunkW, trunkH);
  ctx.fillStyle = '#5e3a1e';
  ctx.fillRect(-trunkW / 2 + 4, -(trunkH - 24) + 30, 3, trunkH - 60);
  ctx.fillRect(trunkW / 2 - 8, -(trunkH - 24) + 70, 3, trunkH - 120);

  // 葉っぱ(円を重ねてもこもこにする)
  ctx.fillStyle = '#2f7a35';
  const cy = -(pivotY - CANOPY_Y);
  for (const [dx, dy, r] of [[0, -20, 46], [-40, 10, 38], [40, 10, 38], [-20, 30, 36], [22, 32, 36]]) {
    ctx.beginPath();
    ctx.arc(dx, cy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#3f9443';
  ctx.beginPath(); ctx.arc(-14, cy - 30, 22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(30, cy - 4, 16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  if (t.state === 'stand') {
    // 切り込み(残り体力に応じて深くなる)
    const depth = ((TREE_HP - t.hp) / TREE_HP) * (trunkW - 4);
    if (depth > 0) {
      ctx.fillStyle = '#e8c27a';
      const side = player.x < t.x ? -1 : 1; // 自分のいる側に切り込みを見せる
      const x0 = side < 0 ? t.x - trunkW / 2 : t.x + trunkW / 2 - depth;
      ctx.beginPath();
      if (side < 0) {
        ctx.moveTo(x0, GROUND - 32); ctx.lineTo(x0 + depth, GROUND - 24); ctx.lineTo(x0, GROUND - 16);
      } else {
        ctx.moveTo(x0 + depth, GROUND - 32); ctx.lineTo(x0, GROUND - 24); ctx.lineTo(x0 + depth, GROUND - 16);
      }
      ctx.fill();
    }
  } else {
    drawStump(t.x);
  }
}

function drawStump(x) {
  ctx.fillStyle = '#7b4f2a';
  ctx.fillRect(x - 13, GROUND - 24, 26, 24);
  ctx.fillStyle = '#e8c27a';
  ctx.beginPath();
  ctx.ellipse(x, GROUND - 24, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer() {
  const blink = player.invincible > 0 && state === 'playing' && Math.floor(player.invincible * 10) % 2 === 0;
  if (blink) return;

  const x = player.x;
  const y = GROUND;
  ctx.save();

  if (state === 'dying' || state === 'gameover') {
    // やられ: その場に倒れた姿と、浮かんでいく魂
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(x - 16, y - 12, 28, 10);
    ctx.fillStyle = '#f2c79a';
    ctx.beginPath(); ctx.arc(x + 18, y - 8, 7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#ffffff';
    const gy = y - 40 - player.ghostY;
    ctx.beginPath();
    ctx.arc(x, gy, 10, Math.PI, 0);
    ctx.lineTo(x + 10, gy + 14);
    ctx.lineTo(x + 3, gy + 9);
    ctx.lineTo(x - 3, gy + 14);
    ctx.lineTo(x - 10, gy + 9);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (player.hiding) ctx.globalAlpha = 0.45;
  ctx.translate(x, y);
  ctx.scale(player.dir, 1); // 右向きで描いて、左向きのときは反転する

  // 足(歩くと交互に動く)
  const step = player.stun > 0 ? 0 : Math.sin(player.walk) * 4;
  ctx.fillStyle = '#2c4a7a';
  ctx.fillRect(-8 + step, -16, 6, 16);
  ctx.fillRect(2 - step, -16, 6, 16);
  // 体(赤いチェックの上着)
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(-10, -36, 20, 22);
  ctx.fillStyle = '#8e2a20';
  ctx.fillRect(-10, -28, 20, 3);
  ctx.fillRect(-2, -36, 3, 22);
  // 顔
  ctx.fillStyle = '#f2c79a';
  ctx.beginPath(); ctx.arc(0, -44, 9, 0, Math.PI * 2); ctx.fill();
  // ひげ
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(-2, -41, 10, 5);
  // 目
  ctx.fillStyle = '#222';
  ctx.fillRect(4, -47, 2, 3);
  // 帽子(緑のニット帽)
  ctx.fillStyle = '#2e8b57';
  ctx.beginPath(); ctx.arc(0, -48, 9, Math.PI, 0); ctx.fill();
  ctx.fillRect(-10, -50, 20, 4);
  ctx.beginPath(); ctx.arc(-2, -58, 3, 0, Math.PI * 2); ctx.fill();

  // オノ: 振っているときは前に振り下ろす
  const swingT = player.swing > 0 ? 1 - player.swing / SWING_TIME : -1;
  const angle = swingT >= 0 ? -1.6 + swingT * 2.6 : -2.2;
  ctx.save();
  ctx.translate(6, -30);
  ctx.rotate(angle + Math.PI / 2);
  ctx.fillStyle = '#9a6a3a';
  ctx.fillRect(-2, -26, 4, 28);  // 柄
  ctx.fillStyle = '#c8ccd2';
  ctx.beginPath();               // 刃
  ctx.moveTo(2, -26); ctx.lineTo(13, -30); ctx.lineTo(13, -16); ctx.lineTo(2, -19);
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // しびれているときは頭の上に星を回す
  if (player.stun > 0) {
    ctx.fillStyle = '#ffe83c';
    const t = performance.now() / 150;
    for (let i = 0; i < 3; i++) {
      const a = t + (i * Math.PI * 2) / 3;
      ctx.fillRect(x + Math.cos(a) * 14 - 2, GROUND - 66 + Math.sin(a) * 4 - 2, 5, 5);
    }
  }
}

function drawEnemy(e) {
  if (e.warn > 0) {
    // イノシシの予告: 出てくる側の端に「！」を点滅させる
    if (Math.floor(e.warn * 8) % 2 === 0) {
      ctx.fillStyle = '#ff3c3c';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', e.dir > 0 ? 16 : W - 16, GROUND - 20);
    }
    return;
  }
  ctx.save();
  ctx.translate(e.x, GROUND);
  ctx.scale(e.dir, 1);
  if (e.type === 'snake') {
    // ヘビ: くねくねした体
    ctx.strokeStyle = '#4caf3c';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const px = -18 + i * 4;
      const py = -6 + Math.sin(e.anim * 10 + i * 0.9) * 3;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = '#3d9130';
    ctx.beginPath(); ctx.ellipse(16, -8, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(17, -11, 3, 3);
    ctx.fillStyle = '#e03030';
    ctx.fillRect(22, -7, 6, 1.5);
  } else {
    // イノシシ: 丸い体と牙
    const bob = Math.abs(Math.sin(e.anim * 20)) * 2;
    ctx.fillStyle = '#5a3a22';
    const leg = Math.sin(e.anim * 25) * 4;
    ctx.fillRect(-14 + leg, -10, 5, 10);
    ctx.fillRect(8 - leg, -10, 5, 10);
    ctx.fillStyle = '#7a4e2c';
    ctx.beginPath(); ctx.ellipse(0, -20 - bob, 22, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(20, -18 - bob, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9a37a';
    ctx.fillRect(26, -20 - bob, 5, 6);
    ctx.fillStyle = '#f5f0e0';
    ctx.fillRect(24, -14 - bob, 3, 6);
    ctx.fillStyle = '#222';
    ctx.fillRect(20, -24 - bob, 3, 3);
    // たてがみ
    ctx.fillStyle = '#4a2e18';
    ctx.fillRect(-14, -34 - bob, 24, 4);
  }
  ctx.restore();
}

function drawBranch(b) {
  if (b.warn > 0) {
    // 落ちる前: 葉っぱの中でゆれて、地面に影が出る
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    const r = 14 * (1 - b.warn / 0.65) + 4;
    ctx.beginPath(); ctx.ellipse(b.x, GROUND - 2, r, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.translate(b.x + (b.warn > 0 ? Math.sin(b.warn * 60) * 2 : 0), b.y);
  ctx.rotate(b.rot);
  ctx.fillStyle = '#6b4424';
  ctx.fillRect(-16, -3, 32, 6);
  ctx.fillRect(4, -10, 4, 9);
  ctx.fillStyle = '#3f9443';
  ctx.beginPath(); ctx.arc(8, -12, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-14, -4, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBird(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(b.dir, 1);
  ctx.fillStyle = '#3a3a48';
  ctx.beginPath(); ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(10, -3, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0a020';
  ctx.beginPath(); ctx.moveTo(14, -4); ctx.lineTo(20, -2); ctx.lineTo(14, 0); ctx.fill();
  // 羽ばたく翼
  const wing = Math.sin(b.flap) * 9;
  ctx.fillStyle = '#4a4a5a';
  ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(4, -2); ctx.lineTo(-2, -4 - wing); ctx.fill();
  ctx.restore();
}

function drawDrop(d) {
  ctx.fillStyle = '#f2f2e0';
  ctx.beginPath(); ctx.arc(d.x, d.y, 4, 0, Math.PI * 2); ctx.fill();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, 30);
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE ${score}`, 10, 21);
  ctx.textAlign = 'center';
  ctx.fillText(`HI ${highScore}`, W / 2 - 60, 21);
  ctx.fillText(`STAGE ${stage}`, W / 2 + 70, 21);
  // 残りの木の数
  const left = trees.filter((t) => t.state === 'stand').length;
  ctx.textAlign = 'right';
  ctx.fillText(`木 ${left}`, W - 90, 21);
  // 残りライフ(帽子のアイコン)
  for (let i = 0; i < lives; i++) {
    const hx = W - 70 + i * 22;
    ctx.fillStyle = '#2e8b57';
    ctx.beginPath(); ctx.arc(hx, 19, 7, Math.PI, 0); ctx.fill();
    ctx.fillRect(hx - 8, 18, 16, 3);
  }
}

function drawCenterText(title, sub, hint) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, H / 2 - 80, W, 150);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe83c';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText(title, W / 2, H / 2 - 25);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  if (sub) ctx.fillText(sub, W / 2, H / 2 + 12);
  if (hint && Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#bfe8ff';
    ctx.font = '16px sans-serif';
    ctx.fillText(hint, W / 2, H / 2 + 46);
  }
}

// ============================================================
// ループ
// ============================================================
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); // 長いフレーム落ちで飛ばないよう制限
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

setupStage();
requestAnimationFrame(loop);
