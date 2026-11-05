'use strict';

// =====================================================================
// 設定
// =====================================================================
const T = 32;                 // 1マスの大きさ(px)
const COLS = 14;              // 横のマス数
const ROWS = 18;              // 縦のマス数(0行目: 上HUD, 17行目: 下HUD)
const SKY_ROW = 1;            // 地上(空)の行
const EARTH_TOP = 2;          // 地中の最上段
const EARTH_BOTTOM = 16;      // 地中の最下段
const W = COLS * T;
const H = ROWS * T;

const PLAYER_SPEED = 4.2;     // 掘られた穴を進む速さ(マス/秒)
const PLAYER_DIG_SPEED = 3.2; // 土を掘りながら進む速さ(マス/秒)
const START_X = 6;            // 主人公の開始位置
const START_Y = 8;

const ENEMY_SPEED = 2.3;      // 敵の基本速度(マス/秒)
const GHOST_SPEED_RATE = 0.55;// すり抜け中は速度がこの倍率になる
const ENEMY_START_WAIT = 0.8; // 開始直後に敵が動き出すまでの秒数

const HARPOON_MAX = 3.5;          // 銛の最大長(マス)
const HARPOON_SPEED = 16;         // 銛が伸びる速さ(マス/秒)
const HARPOON_BACK_SPEED = 22;    // 銛が戻る速さ(マス/秒)
const PUMP_HOLD_INTERVAL = 0.38;  // 押しっぱなしでふくらむ間隔(秒)
const PUMP_COOLDOWN = 0.1;        // 連打の最短間隔(秒)
const DEFLATE_INTERVAL = 0.8;     // 放置すると1段階しぼむまでの秒数
const POP_STAGE = 4;              // 3段階を超えて(=4段階目で)破裂

const ROCK_WOBBLE_TIME = 0.7;     // 落下前にぐらぐらする秒数
const ROCK_FALL_SPEED = 7;        // 落下速度(マス/秒)
const ROCK_BREAK_TIME = 1.3;      // 着地後、泡が出て消えるまでの秒数
const ROCK_HOLD_GRACE = 0.3;      // 岩の真下を掘ってから上を向くまでの猶予(秒)

const START_LIVES = 3;
const EXTRA_LIFE_SCORE = 20000;

// 地層ごとの色(浅い → 深い)と、破裂させたときの得点
const LAYER_COLORS = ['#e2b15b', '#cc7b37', '#9d4a2e', '#6b2f40'];
const LAYER_DOTS = ['#c8954a', '#a8602a', '#7b3522', '#4e1f2f'];
const POP_SCORE = [200, 300, 400, 500];
// 岩でまとめて潰した数ごとの得点
const ROCK_SCORE = [0, 1000, 2500, 4000, 6000, 8000, 10000, 12000, 15000];

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DIR_LIST = ['up', 'down', 'left', 'right'];

const KEY_HIGH = 'horiPon.highScore';
const KEY_SOUND = 'horiPon.sound';

// =====================================================================
// 状態
// =====================================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// 'title' | 'ready' | 'playing' | 'dying' | 'clear' | 'gameover' | 'paused'
let state = 'title';
let pausedFrom = null;      // 一時停止前の状態
let stateTimer = 0;         // ready / dying / clear の残り時間
let level = 1;
let score = 0;
let highScore = Number(loadStorage(KEY_HIGH, '0')) || 0;
let lives = START_LIVES;
let extraGiven = false;

// 地形: dug[y][x] = 掘られているか、hOpen/vOpen = 隣のマスとつながっているか
let dug = [];
let hOpen = [];   // (x,y) と (x+1,y) の間
let vOpen = [];   // (x,y) と (x,y+1) の間
let earthCanvas = null; // 地層の絵(面ごとに作り直す)

let player = null;
let enemies = [];
let rocks = [];
let harpoon = null;
let popups = [];

let roundTime = 0;      // 面が始まってからの秒数
let speedStage = 0;     // スピードアップの段階
let enemyWait = 0;      // 敵が動き出すまでの残り時間
let lastEnemyTriggered = false;
let pumpCooldown = 0;

// 入力
const dirStack = [];    // 押されている方向キー(最後に押したものが優先)
let pumpPressed = false; // このフレームでボタンが押された
let pumpHeld = false;    // ボタンが押されたまま

// 音楽(移動中だけ進む)
let musicTimer = 0;
let musicIdx = 0;
let movedThisStep = false;
let footToggle = false;

// =====================================================================
// 保存
// =====================================================================
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
  if (!extraGiven && score >= EXTRA_LIFE_SCORE) {
    extraGiven = true;
    lives++;
    playSound('extra');
  }
  if (score > highScore) {
    highScore = score;
    saveStorage(KEY_HIGH, highScore);
  }
}

// =====================================================================
// 効果音・音楽(Web Audio API で合成)
// =====================================================================
let audioCtx = null;
let soundOn = loadStorage(KEY_SOUND, 'on') !== 'off';

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// 1音を鳴らす。slide を指定すると周波数がその値まで変化する
function tone(freq, dur, opts = {}) {
  const { type = 'square', vol = 0.06, when = 0, slide = null } = opts;
  const t0 = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// 短いフレーズ(ジングル)を鳴らす。notes は [midi番号, 長さ秒] の配列(0 は休符)
function jingle(notes, type = 'square', vol = 0.06) {
  let t = 0;
  for (const [n, d] of notes) {
    if (n) tone(midi(n), d * 0.9, { type, vol, when: t });
    t += d;
  }
}

// 移動中に流れるオリジナルの曲(1要素 = 1ステップ、0 は休符)
const MELODY = [
  72, 76, 79, 76, 77, 81, 79, 77, 76, 79, 74, 77, 72, 74, 76, 0,
  69, 72, 76, 72, 74, 77, 81, 77, 79, 77, 76, 74, 72, 0, 67, 0,
];
const MUSIC_STEP = 0.13;

function playSound(name, arg) {
  if (!soundOn || !audioCtx) return;
  switch (name) {
    case 'note':   // 移動中の曲の1音
      if (arg) tone(midi(arg), 0.11, { type: 'square', vol: 0.035 });
      if (musicIdx % 4 === 1) tone(midi(48 + (musicIdx % 16 < 8 ? 0 : 5)), 0.12, { type: 'triangle', vol: 0.06 });
      break;
    case 'foot':   // 止まっているときの敵の足音
      tone(arg ? 98 : 110, 0.06, { type: 'triangle', vol: 0.07 });
      break;
    case 'shoot':
      tone(900, 0.12, { type: 'sawtooth', vol: 0.04, slide: 300 });
      break;
    case 'hit':
      tone(500, 0.08, { type: 'square', vol: 0.05 });
      break;
    case 'pump':   // ふくらむたびに音が高くなる
      tone(220 + arg * 120, 0.12, { type: 'square', vol: 0.06, slide: 320 + arg * 160 });
      break;
    case 'pop':
      tone(1200, 0.25, { type: 'sawtooth', vol: 0.07, slide: 80 });
      tone(180, 0.2, { type: 'triangle', vol: 0.08, when: 0.02 });
      break;
    case 'wobble':
      tone(140, 0.25, { type: 'triangle', vol: 0.06, slide: 120 });
      break;
    case 'crash':
      tone(160, 0.35, { type: 'sawtooth', vol: 0.08, slide: 40 });
      break;
    case 'fizz': {
      // 泡のシュワッという音(高い音だけ通したノイズ)
      const len = 0.6;
      const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * len), audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.3 ? 1 : 0.3);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 3000;
      const gain = audioCtx.createGain();
      const t0 = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      src.connect(filter).connect(gain).connect(audioCtx.destination);
      src.start(t0);
      break;
    }
    case 'miss':
      jingle([[79, 0.12], [74, 0.12], [70, 0.12], [67, 0.12], [62, 0.4]], 'triangle', 0.09);
      break;
    case 'start':
      jingle([[72, 0.12], [76, 0.12], [79, 0.12], [84, 0.3], [0, 0.1], [79, 0.12], [84, 0.4]]);
      break;
    case 'clear':
      jingle([[76, 0.1], [79, 0.1], [84, 0.1], [88, 0.1], [91, 0.4], [0, 0.05], [88, 0.12], [91, 0.5]]);
      break;
    case 'speedup':
      jingle([[84, 0.07], [86, 0.07], [88, 0.07], [91, 0.07], [84, 0.07], [86, 0.07], [88, 0.07], [91, 0.2]], 'square', 0.05);
      break;
    case 'last':
      jingle([[81, 0.1], [77, 0.1], [74, 0.1], [69, 0.1], [74, 0.1], [77, 0.1], [81, 0.3]], 'square', 0.05);
      break;
    case 'extra':
      jingle([[84, 0.08], [88, 0.08], [91, 0.08], [96, 0.3]], 'triangle', 0.08);
      break;
  }
}

// 音楽を1フレーム分進める。移動していたステップだけ曲が進み、止まっていると敵の足音になる
function updateMusic(dt) {
  if (player.moving) movedThisStep = true;
  musicTimer += dt;
  if (musicTimer < MUSIC_STEP) return;
  musicTimer -= MUSIC_STEP;
  if (movedThisStep) {
    playSound('note', MELODY[musicIdx]);
    musicIdx = (musicIdx + 1) % MELODY.length;
  } else {
    footToggle = !footToggle;
    if (footToggle && enemies.some((e) => e.state === 'walk' || e.state === 'ghost')) {
      playSound('foot', Math.floor(roundTime / (MUSIC_STEP * 2)) % 2);
    }
  }
  movedThisStep = false;
}

function toggleSound() {
  soundOn = !soundOn;
  saveStorage(KEY_SOUND, soundOn ? 'on' : 'off');
  updateButtons();
}

// =====================================================================
// 地形ヘルパー
// =====================================================================
function makeGrid(v) {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(v));
}
// 主人公や敵が入れる範囲(地上〜地中の最下段)
function inField(x, y) {
  return x >= 0 && x < COLS && y >= SKY_ROW && y <= EARTH_BOTTOM;
}
function isDug(x, y) {
  return inField(x, y) && dug[y][x];
}
// 隣り合う2マスが穴でつながっているか
function edgeOpen(ax, ay, bx, by) {
  if (!inField(ax, ay) || !inField(bx, by)) return false;
  if (ay === by) return hOpen[ay][Math.min(ax, bx)];
  return vOpen[Math.min(ay, by)][ax];
}
// 2マスの間を掘ってつなげる
function openEdge(ax, ay, bx, by) {
  if (!inField(ax, ay) || !inField(bx, by)) return;
  dug[ay][ax] = true;
  dug[by][bx] = true;
  if (ay === by) hOpen[ay][Math.min(ax, bx)] = true;
  else vOpen[Math.min(ay, by)][ax] = true;
}
// 地層(0〜3)。地上は0扱い
function layerOf(y) {
  if (y < EARTH_TOP) return 0;
  return Math.min(3, Math.floor((y - EARTH_TOP) / 4));
}
// そのマスに(落ちていない)岩があってふさがれているか
function rockBlocking(x, y) {
  return rocks.some((r) => (r.state === 'still' || r.state === 'wobble') && r.x === x && r.row === y);
}
function isAligned(o) {
  return o.x === Math.round(o.x) && o.y === Math.round(o.y);
}
function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

// =====================================================================
// 面の生成
// =====================================================================
function buildRound(lv) {
  dug = makeGrid(false);
  hOpen = makeGrid(false);
  vOpen = makeGrid(false);
  // 地上は最初から自由に歩ける
  for (let x = 0; x < COLS; x++) {
    dug[SKY_ROW][x] = true;
    hOpen[SKY_ROW][x] = true;
  }
  // 主人公の開始地点: 地上からの縦穴と短い横穴
  for (let y = SKY_ROW; y < START_Y; y++) openEdge(START_X, y, START_X, y + 1);
  openEdge(START_X - 1, START_Y, START_X, START_Y);
  openEdge(START_X, START_Y, START_X + 1, START_Y);

  // 敵: それぞれ短い横穴か縦穴に配置する
  enemies = [];
  const enemyCount = Math.min(8, 2 + lv);
  for (let i = 0, tries = 0; i < enemyCount && tries < 500; tries++) {
    const vertical = Math.random() < 0.4;
    const len = randInt(3, 4);
    const x0 = randInt(0, vertical ? COLS - 1 : COLS - len);
    const y0 = randInt(3, vertical ? EARTH_BOTTOM - len : EARTH_BOTTOM - 1);
    const cells = [];
    for (let k = 0; k < len; k++) cells.push(vertical ? [x0, y0 + k] : [x0 + k, y0]);
    // 他の穴と離れていて、主人公から遠いこと
    const ok = cells.every(([cx, cy]) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (isDug(cx + dx, cy + dy) && cy + dy > SKY_ROW) return false;
        }
      }
      return Math.abs(cx - START_X) + Math.abs(cy - START_Y) >= 5;
    });
    if (!ok) continue;
    for (let k = 1; k < len; k++) openEdge(cells[k - 1][0], cells[k - 1][1], cells[k][0], cells[k][1]);
    const [sx, sy] = cells[Math.floor(len / 2)];
    enemies.push(makeEnemy(sx, sy, i));
    i++;
  }

  // 岩: 周りが土のマスに置く(すぐには落ちないように)
  rocks = [];
  const rockCount = Math.min(6, 3 + Math.floor((lv - 1) / 2));
  for (let i = 0, tries = 0; i < rockCount && tries < 500; tries++) {
    const x = randInt(0, COLS - 1);
    const y = randInt(3, 13);
    const around = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    if (around.some(([dx, dy]) => isDug(x + dx, y + dy))) continue;
    if (rocks.some((r) => Math.abs(r.x - x) + Math.abs(r.row - y) <= 2)) continue;
    // kind: 0 = ビール缶、1 = ビールジョッキ(交互に置く)
    rocks.push({ x, row: y, fy: y, kind: i % 2, state: 'still', timer: 0, grace: 0, holdable: true, wasHeld: false, crushed: [] });
    i++;
  }

  player = makePlayer();
  harpoon = null;
  popups = [];
  roundTime = 0;
  speedStage = 0;
  lastEnemyTriggered = false;
  earthCanvas = renderEarth();
}

function makePlayer() {
  return { x: START_X, y: START_Y, fromX: START_X, fromY: START_Y, dir: 'right', face: 'right', moving: false, anim: 0 };
}

function makeEnemy(x, y, i) {
  return {
    x, y, fromX: x, fromY: y, dir: 'left', moving: false,
    spawnX: x, spawnY: y,
    kind: i % 2,          // 見た目の種類(色違い)
    state: 'walk',        // 'walk' | 'ghost' | 'crushed' | 'dead' | 'escaped'
    inflate: 0,           // ふくらみ段階(0 = 通常)
    deflateT: 0,
    ghostT: ghostInterval(),
    ghostTime: 0,
    ghostLeftDug: false,
    escaping: false,
    deadT: 0, deadKind: '',
    anim: Math.random() * 10,
  };
}

// 次にすり抜け状態になるまでの秒数
function ghostInterval() {
  return Math.max(3, 5 + Math.random() * 6 - level * 0.3);
}

// 地層の絵を作る(土の色と粒々の模様)
function renderEarth() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  for (let y = EARTH_TOP; y <= EARTH_BOTTOM; y++) {
    const layer = layerOf(y);
    g.fillStyle = LAYER_COLORS[layer];
    g.fillRect(0, y * T, W, T);
    g.fillStyle = LAYER_DOTS[layer];
    for (let i = 0; i < 26; i++) {
      const px = Math.random() * W;
      const py = y * T + Math.random() * T;
      g.fillRect(Math.floor(px), Math.floor(py), 3, 2);
    }
  }
  return c;
}

// =====================================================================
// 状態遷移
// =====================================================================
function startGame() {
  ensureAudio();
  level = 1;
  score = 0;
  lives = START_LIVES;
  extraGiven = false;
  buildRound(level);
  toReady(2.2);
  playSound('start');
}

function toReady(sec) {
  state = 'ready';
  stateTimer = sec;
  dirStack.length = 0;
}

function startPlaying() {
  state = 'playing';
  enemyWait = ENEMY_START_WAIT;
  checkEnemies();
}

function killPlayer() {
  if (state !== 'playing') return;
  state = 'dying';
  stateTimer = 2;
  harpoon = null;
  playSound('miss');
}

// ミスの後: 主人公と敵を初期位置に戻して再開
function afterMiss() {
  lives--;
  if (lives <= 0) {
    state = 'gameover';
    return;
  }
  player = makePlayer();
  harpoon = null;
  for (const e of enemies) {
    if (e.state === 'walk' || e.state === 'ghost') {
      Object.assign(e, { x: e.spawnX, y: e.spawnY, fromX: e.spawnX, fromY: e.spawnY, state: 'walk', inflate: 0, moving: false, ghostT: ghostInterval() });
    }
  }
  toReady(1.6);
}

function nextRound() {
  level++;
  buildRound(level);
  toReady(2);
  playSound('start');
}

function togglePause() {
  if (state === 'paused') {
    state = pausedFrom;
    pausedFrom = null;
  } else if (state === 'playing' || state === 'ready') {
    pausedFrom = state;
    state = 'paused';
  }
  updateButtons();
}

// 残りの敵を数え、最後の1匹なら撤退、0匹なら面クリア
function checkEnemies() {
  const live = enemies.filter((e) => e.state === 'walk' || e.state === 'ghost' || e.state === 'crushed');
  if (live.length === 0) {
    if (state === 'playing') {
      state = 'clear';
      stateTimer = 2.5;
      harpoon = null;
      playSound('clear');
    }
  } else if (live.length === 1 && !lastEnemyTriggered && enemies.length > 1 && live[0].state !== 'crushed') {
    lastEnemyTriggered = true;
    live[0].escaping = true;
    playSound('last');
  }
}

// =====================================================================
// 入力
// =====================================================================
const KEY_DIRS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const PUMP_KEYS = ['Space', 'KeyZ', 'KeyX', 'KeyJ'];

function pressDir(d) {
  const i = dirStack.indexOf(d);
  if (i >= 0) dirStack.splice(i, 1);
  dirStack.push(d);
}
function releaseDir(d) {
  const i = dirStack.indexOf(d);
  if (i >= 0) dirStack.splice(i, 1);
}
function pressPump() {
  ensureAudio();
  if (state === 'title' || state === 'gameover') {
    startGame();
    return;
  }
  pumpPressed = true;
  pumpHeld = true;
}

window.addEventListener('keydown', (e) => {
  if (KEY_DIRS[e.code]) {
    pressDir(KEY_DIRS[e.code]);
    e.preventDefault();
  } else if (PUMP_KEYS.includes(e.code)) {
    if (!e.repeat) pressPump();
    e.preventDefault();
  } else if (e.code === 'Enter') {
    if (state === 'title' || state === 'gameover') startGame();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    togglePause();
  } else if (e.code === 'KeyM') {
    toggleSound();
  }
});
window.addEventListener('keyup', (e) => {
  if (KEY_DIRS[e.code]) releaseDir(KEY_DIRS[e.code]);
  else if (PUMP_KEYS.includes(e.code)) pumpHeld = false;
});
// フォーカスが外れたらキーをすべて離したことにする
window.addEventListener('blur', () => {
  dirStack.length = 0;
  pumpHeld = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state === 'playing' || state === 'ready')) togglePause();
});

canvas.addEventListener('pointerdown', () => {
  ensureAudio();
  if (state === 'title' || state === 'gameover') startGame();
  else if (state === 'paused') togglePause();
});

// タッチ用の十字キー
for (const btn of document.querySelectorAll('.pad button')) {
  const d = btn.dataset.dir;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ensureAudio();
    pressDir(d);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    btn.addEventListener(ev, () => releaseDir(d));
  }
}
const pumpBtn = document.getElementById('pump-btn');
pumpBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pressPump();
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  pumpBtn.addEventListener(ev, () => { pumpHeld = false; });
}

const soundBtn = document.getElementById('sound-toggle');
const pauseBtn = document.getElementById('pause-toggle');
soundBtn.addEventListener('click', () => { ensureAudio(); toggleSound(); soundBtn.blur(); });
pauseBtn.addEventListener('click', () => { togglePause(); pauseBtn.blur(); });
function updateButtons() {
  soundBtn.textContent = soundOn ? '音: ON' : '音: OFF';
  pauseBtn.textContent = state === 'paused' ? '再開' : '一時停止';
}

// =====================================================================
// 更新: 主人公
// =====================================================================
function canPlayerEnter(x, y) {
  return inField(x, y) && !rockBlocking(x, y);
}

function updatePlayer(dt) {
  player.moving = false;
  const d = dirStack[dirStack.length - 1];
  // 銛を撃っている最中は動けない
  if (harpoon && harpoon.state !== 'attached') return;
  if (!d) return;
  // 銛を刺した状態で動くと銛が外れる
  if (harpoon && harpoon.state === 'attached') harpoon = null;

  let remaining = null;
  for (let step = 0; step < 2; step++) {
    if (isAligned(player)) {
      // マスの中心では好きな方向へ曲がれる
      player.face = d;
      const [dx, dy] = DIRS[d];
      if (!canPlayerEnter(player.x + dx, player.y + dy)) return;
      player.dir = d;
      player.fromX = player.x;
      player.fromY = player.y;
    } else if (d === OPP[player.dir]) {
      // 途中で反転: 進んでいた先のマスまで掘れたことにして向きを変える
      const [dx, dy] = DIRS[player.dir];
      const tx = player.fromX + dx;
      const ty = player.fromY + dy;
      openEdge(player.fromX, player.fromY, tx, ty);
      player.fromX = tx;
      player.fromY = ty;
      player.dir = d;
      player.face = d;
    }
    // 横向きの入力のときは、次のマスの中心までそのまま進んでから曲がる
    const [dx, dy] = DIRS[player.dir];
    const tx = player.fromX + dx;
    const ty = player.fromY + dy;
    if (remaining === null) {
      const digging = !edgeOpen(player.fromX, player.fromY, tx, ty);
      remaining = (digging ? PLAYER_DIG_SPEED : PLAYER_SPEED) * dt;
    }
    const left = Math.abs(tx - player.x) + Math.abs(ty - player.y);
    player.moving = true;
    player.anim += dt;
    if (remaining < left) {
      player.x += dx * remaining;
      player.y += dy * remaining;
      return;
    }
    // 次のマスに到着
    player.x = tx;
    player.y = ty;
    openEdge(player.fromX, player.fromY, tx, ty);
    remaining -= left;
    if (remaining <= 0) return;
  }
}

// =====================================================================
// 更新: 銛とポンプ
// =====================================================================
function harpoonOrigin() {
  return { x: player.x, y: player.y };
}

// 主人公が今まさに掘っている途中の区間か
function isPlayerDigEdge(ax, ay, bx, by) {
  if (isAligned(player)) return false;
  const [dx, dy] = DIRS[player.dir];
  const tx = player.fromX + dx;
  const ty = player.fromY + dy;
  return (ax === player.fromX && ay === player.fromY && bx === tx && by === ty) ||
         (bx === player.fromX && by === player.fromY && ax === tx && ay === ty);
}

function updateHarpoon(dt) {
  pumpCooldown -= dt;
  if (pumpPressed) {
    if (!harpoon) {
      harpoon = { dir: player.face, len: 0, state: 'extend', enemy: null, holdT: 0 };
      playSound('shoot');
    } else if (harpoon.state === 'attached') {
      pump();
    }
  }
  if (!harpoon) return;

  const [dx, dy] = DIRS[harpoon.dir];
  const o = harpoonOrigin();

  if (harpoon.state === 'extend') {
    harpoon.len += HARPOON_SPEED * dt;
    // 穴の中しか進めない。土や岩に当たったら止まる
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    for (let k = 1; k <= 5; k++) {
      const tx = px + dx * k;
      const ty = py + dy * k;
      const edgeDist = (tx - o.x) * dx + (ty - o.y) * dy - 0.5; // 主人公からそのマスの手前の境目まで
      if (harpoon.len <= edgeDist + 0.15) break;
      const prevX = tx - dx;
      const prevY = ty - dy;
      const passable = isDug(tx, ty) && (edgeOpen(prevX, prevY, tx, ty) || isPlayerDigEdge(prevX, prevY, tx, ty));
      if (!passable) {
        harpoon.len = Math.max(0.2, edgeDist + 0.15);
        harpoon.state = 'retract';
        break;
      }
    }
    // 敵に当たったか(銛の線上にいる一番近い敵)
    if (harpoon.state === 'extend') {
      let best = null;
      let bestAlong = Infinity;
      for (const e of enemies) {
        if (e.state !== 'walk' && e.state !== 'ghost') continue;
        const rx = e.x - o.x;
        const ry = e.y - o.y;
        const along = rx * dx + ry * dy;
        const perp = Math.abs(rx * dy - ry * dx);
        if (perp < 0.5 && along > -0.2 && along < harpoon.len + 0.4 && along < bestAlong) {
          best = e;
          bestAlong = along;
        }
      }
      if (best) {
        harpoon.state = 'attached';
        harpoon.enemy = best;
        harpoon.len = Math.max(0.3, bestAlong - 0.3);
        playSound('hit');
        inflateEnemy(best);
      } else if (harpoon.len >= HARPOON_MAX) {
        harpoon.len = HARPOON_MAX;
        harpoon.state = 'retract';
      }
    }
  } else if (harpoon.state === 'retract') {
    harpoon.len -= HARPOON_BACK_SPEED * dt;
    if (harpoon.len <= 0) harpoon = null;
  } else if (harpoon.state === 'attached') {
    const e = harpoon.enemy;
    if (e.state !== 'walk' && e.state !== 'ghost') {
      harpoon = null;
      return;
    }
    // 押しっぱなしでもふくらむ
    if (pumpHeld && !pumpPressed) {
      harpoon.holdT += dt;
      if (harpoon.holdT >= PUMP_HOLD_INTERVAL) {
        harpoon.holdT = 0;
        pump();
      }
    } else {
      harpoon.holdT = 0;
    }
  }
}

function pump() {
  if (!harpoon || harpoon.state !== 'attached' || pumpCooldown > 0) return;
  pumpCooldown = PUMP_COOLDOWN;
  inflateEnemy(harpoon.enemy);
}

// 敵を1段階ふくらませる。3段階を超えたら破裂
function inflateEnemy(e) {
  e.inflate++;
  e.deflateT = 0;
  if (e.inflate >= POP_STAGE) {
    popEnemy(e);
  } else {
    playSound('pump', e.inflate);
  }
}

function popEnemy(e) {
  const layer = layerOf(Math.round(e.y));
  const pts = POP_SCORE[layer];
  addScore(pts);
  popups.push({ x: e.x, y: e.y, text: String(pts), t: 1.2 });
  e.state = 'dead';
  e.deadKind = 'pop';
  e.deadT = 0.5;
  harpoon = null;
  playSound('pop');
  checkEnemies();
}

// =====================================================================
// 更新: 敵
// =====================================================================
function canEnemyStep(ax, ay, bx, by, allowSky) {
  if (!inField(bx, by)) return false;
  if (!allowSky && by === SKY_ROW) return false;
  return edgeOpen(ax, ay, bx, by) && !rockBlocking(bx, by);
}

// 穴の中を通って (tx,ty) へ向かうときの最初の一歩の方向(届かなければ null)
function bfsNextDir(sx, sy, tx, ty, allowSky) {
  if (sx === tx && sy === ty) return null;
  const first = new Array(COLS * ROWS).fill(null);
  const seen = new Uint8Array(COLS * ROWS);
  const queue = [[sx, sy]];
  seen[sy * COLS + sx] = 1;
  while (queue.length) {
    const [cx, cy] = queue.shift();
    for (const d of DIR_LIST) {
      const [dx, dy] = DIRS[d];
      const nx = cx + dx;
      const ny = cy + dy;
      if (!canEnemyStep(cx, cy, nx, ny, allowSky)) continue;
      const id = ny * COLS + nx;
      if (seen[id]) continue;
      seen[id] = 1;
      first[id] = (cx === sx && cy === sy) ? d : first[cy * COLS + cx];
      if (nx === tx && ny === ty) return first[id];
      queue.push([nx, ny]);
    }
  }
  return null;
}

function enemySpeed() {
  const base = ENEMY_SPEED + Math.min(0.8, (level - 1) * 0.08);
  return base * (1 + 0.25 * speedStage);
}

function startGhost(e) {
  e.state = 'ghost';
  e.ghostTime = 0;
  e.ghostLeftDug = false;
}

function updateEnemy(e, dt) {
  if (e.state === 'dead') {
    e.deadT -= dt;
    return;
  }
  if (e.state !== 'walk' && e.state !== 'ghost') return;
  e.anim += dt;

  // ふくらんでいる間は動けない。放っておくと少しずつしぼむ
  if (e.inflate > 0) {
    e.deflateT += dt;
    if (e.deflateT >= DEFLATE_INTERVAL) {
      e.deflateT = 0;
      e.inflate--;
      if (e.inflate === 0 && harpoon && harpoon.enemy === e) harpoon = null;
    }
    return;
  }
  if (enemyWait > 0) return;

  const speed = enemySpeed() * (e.escaping ? 1.15 : 1);

  if (e.state === 'ghost') {
    // すり抜け: 土の中を通って主人公(撤退中は真上の地上)へまっすぐ向かう
    const tx = e.escaping ? Math.round(e.x) : player.x;
    const ty = e.escaping ? SKY_ROW : player.y;
    const vx = tx - e.x;
    const vy = ty - e.y;
    const dist = Math.hypot(vx, vy);
    const step = speed * GHOST_SPEED_RATE * dt;
    if (dist > 0.001) {
      const s = Math.min(step, dist);
      e.x += (vx / dist) * s;
      e.y += (vy / dist) * s;
    }
    e.ghostTime += dt;
    const rx = Math.round(e.x);
    const ry = Math.round(e.y);
    if (!isDug(rx, ry)) e.ghostLeftDug = true;
    // どこかの穴に着いたら元に戻る
    if (isDug(rx, ry) && (e.ghostLeftDug || e.ghostTime > 2.5) && Math.hypot(e.x - rx, e.y - ry) < 0.3) {
      e.x = rx;
      e.y = ry;
      e.fromX = rx;
      e.fromY = ry;
      e.state = 'walk';
      e.ghostT = ghostInterval();
    }
    return;
  }

  // 通常: 穴の中だけを移動する
  e.ghostT -= dt;
  let remaining = speed * dt;
  for (let step = 0; step < 2 && remaining > 0; step++) {
    if (isAligned(e)) {
      const ex = e.x;
      const ey = e.y;
      if (e.escaping) {
        if (ex === 0 && ey === SKY_ROW) {
          // 左上まで逃げきった
          e.state = 'escaped';
          checkEnemies();
          return;
        }
        const d = bfsNextDir(ex, ey, 0, SKY_ROW, true);
        if (!d) {
          startGhost(e);
          return;
        }
        e.dir = d;
      } else {
        if (e.ghostT <= 0) {
          startGhost(e);
          return;
        }
        const allowSky = ey === SKY_ROW;
        const opts = DIR_LIST.filter((d) => canEnemyStep(ex, ey, ex + DIRS[d][0], ey + DIRS[d][1], allowSky));
        if (!opts.length) {
          e.ghostT -= dt * 2; // 行き止まりで動けないときは早めにすり抜ける
          return;
        }
        let choice = null;
        const chase = Math.min(0.9, 0.6 + level * 0.04);
        if (Math.random() < chase) {
          choice = bfsNextDir(ex, ey, Math.round(player.x), Math.round(player.y), allowSky);
        }
        if (!choice || !opts.includes(choice)) {
          const forward = opts.filter((d) => d !== OPP[e.dir]);
          const pool = forward.length ? forward : opts;
          choice = pool[Math.floor(Math.random() * pool.length)];
        }
        e.dir = choice;
      }
      e.fromX = ex;
      e.fromY = ey;
    }
    const [dx, dy] = DIRS[e.dir];
    const tx = e.fromX + dx;
    const ty = e.fromY + dy;
    const left = Math.abs(tx - e.x) + Math.abs(ty - e.y);
    if (remaining < left) {
      e.x += dx * remaining;
      e.y += dy * remaining;
      return;
    }
    e.x = tx;
    e.y = ty;
    remaining -= left;
  }
}

// =====================================================================
// 更新: 岩
// =====================================================================
function playerInTile(x, y) {
  return Math.abs(player.x - x) < 0.5 && Math.abs(player.y - y) < 0.5;
}

function updateRock(r, dt) {
  if (r.state === 'still') {
    const bx = r.x;
    const by = r.row + 1;
    if (by > EARTH_BOTTOM || !isDug(bx, by)) return;
    // 真下を掘られた。すぐ上を向けば落下を抑えられる
    if (r.holdable && state === 'playing' && playerInTile(bx, by)) {
      if (player.face === 'up') {
        r.wasHeld = true;
        return;
      }
      if (!r.wasHeld) {
        r.grace += dt;
        if (r.grace < ROCK_HOLD_GRACE) return;
      }
    }
    // 一度抑えるのをやめたら、もう抑えられない
    r.holdable = false;
    r.state = 'wobble';
    r.timer = 0;
    playSound('wobble');
  } else if (r.state === 'wobble') {
    r.timer += dt;
    if (r.timer >= ROCK_WOBBLE_TIME) {
      r.state = 'fall';
      r.fy = r.row;
      dug[r.row][r.x] = true; // 岩のあった場所は空洞になる
    }
  } else if (r.state === 'fall') {
    r.fy += ROCK_FALL_SPEED * dt;
    const base = Math.floor(r.fy);
    if (base > r.row) {
      openEdge(r.x, r.row, r.x, base);
      r.row = base;
    }
    // 下に巻き込んだ敵と主人公を潰す
    for (const e of enemies) {
      if (e.state !== 'walk' && e.state !== 'ghost') continue;
      if (Math.abs(e.x - r.x) < 0.6 && e.y > r.fy - 0.2 && e.y < r.fy + 0.95) {
        e.state = 'crushed';
        r.crushed.push(e);
        if (harpoon && harpoon.enemy === e) harpoon = null;
      }
    }
    for (const e of r.crushed) {
      e.x = r.x;
      e.y = r.fy + 0.6;
    }
    if (state === 'playing' && Math.abs(player.x - r.x) < 0.6 && player.y > r.fy - 0.2 && player.y < r.fy + 0.9) {
      killPlayer();
    }
    // 下が土(または最下段)なら着地して割れる
    if (base + 1 > EARTH_BOTTOM || !isDug(r.x, base + 1)) {
      r.fy = base;
      r.state = 'break';
      r.timer = 0;
      playSound('crash');
      playSound('fizz');
      const n = r.crushed.length;
      for (const e of r.crushed) {
        e.state = 'dead';
        e.deadKind = 'crush';
        e.deadT = 0.8;
        e.y = base + 0.6;
      }
      if (n > 0) {
        const pts = ROCK_SCORE[Math.min(n, ROCK_SCORE.length - 1)];
        addScore(pts);
        popups.push({ x: r.x, y: base, text: String(pts), t: 1.5 });
        checkEnemies();
      }
    }
  } else if (r.state === 'break') {
    r.timer += dt;
  }
}

// =====================================================================
// 更新: 全体
// =====================================================================
function speedupTimes() {
  const first = Math.max(20, 40 - level * 2);
  return [first, first * 2];
}

function update(dt) {
  switch (state) {
    case 'ready':
      stateTimer -= dt;
      if (stateTimer <= 0) startPlaying();
      break;
    case 'playing': {
      roundTime += dt;
      enemyWait -= dt;
      // 時間が経つと敵がスピードアップ
      const times = speedupTimes();
      if (speedStage < times.length && roundTime >= times[speedStage]) {
        speedStage++;
        playSound('speedup');
      }
      updatePlayer(dt);
      updateHarpoon(dt);
      for (const e of enemies) updateEnemy(e, dt);
      for (const r of rocks) updateRock(r, dt);
      rocks = rocks.filter((r) => !(r.state === 'break' && r.timer >= ROCK_BREAK_TIME));
      // 敵との接触(ふくらんでいる敵はセーフ)
      if (state === 'playing') {
        for (const e of enemies) {
          if ((e.state === 'walk' || e.state === 'ghost') && e.inflate === 0 &&
              Math.hypot(e.x - player.x, e.y - player.y) < 0.65) {
            killPlayer();
            break;
          }
        }
      }
      if (state === 'playing') updateMusic(dt);
      break;
    }
    case 'dying':
      stateTimer -= dt;
      for (const e of enemies) if (e.state === 'dead') e.deadT -= dt;
      for (const r of rocks) updateRock(r, dt);
      rocks = rocks.filter((r) => !(r.state === 'break' && r.timer >= ROCK_BREAK_TIME));
      if (stateTimer <= 0) afterMiss();
      break;
    case 'clear':
      stateTimer -= dt;
      if (stateTimer <= 0) nextRound();
      break;
  }
  for (const p of popups) p.t -= dt;
  popups = popups.filter((p) => p.t > 0);
  pumpPressed = false;
}

// =====================================================================
// 描画
// =====================================================================
const FONT = '"Hiragino Sans", "Noto Sans JP", sans-serif';
const cxOf = (x) => (x + 0.5) * T;
const cyOf = (y) => (y + 0.5) * T;

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawSky();
  ctx.drawImage(earthCanvas, 0, 0);
  drawTunnels();
  drawGrass();
  for (const r of rocks) if (r.state !== 'fall') drawRock(r);
  for (const e of enemies) drawEnemy(e);
  drawHarpoon();
  drawPlayer();
  for (const r of rocks) if (r.state === 'fall') drawRock(r);
  drawPopups();
  drawHud();
  drawOverlay();
}

function drawSky() {
  const g = ctx.createLinearGradient(0, T, 0, 2 * T);
  g.addColorStop(0, '#1b1840');
  g.addColorStop(1, '#3a2f6a');
  ctx.fillStyle = g;
  ctx.fillRect(0, T, W, T);
  // 小さな星
  ctx.fillStyle = '#fff6c8';
  for (let i = 0; i < 9; i++) ctx.fillRect((i * 53 + 17) % W, T + ((i * 7) % 12) + 3, 2, 2);
}

function drawTunnels() {
  const pad = 4;
  const w = T - pad * 2;
  ctx.fillStyle = '#0a0606';
  for (let y = EARTH_TOP; y <= EARTH_BOTTOM; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!dug[y][x]) continue;
      ctx.fillRect(x * T + pad, y * T + pad, w, w);
      if (x < COLS - 1 && hOpen[y][x]) ctx.fillRect(x * T + T / 2, y * T + pad, T, w);
      if (y < EARTH_BOTTOM && vOpen[y][x]) ctx.fillRect(x * T + pad, y * T + T / 2, w, T);
    }
  }
  // 地上から地中への入口
  for (let x = 0; x < COLS; x++) {
    if (vOpen[SKY_ROW][x]) ctx.fillRect(x * T + pad, EARTH_TOP * T, w, T / 2);
  }
  // 主人公が掘っている途中の部分
  if (player && !isAligned(player)) {
    const x1 = Math.min(cxOf(player.fromX), cxOf(player.x)) - w / 2;
    const x2 = Math.max(cxOf(player.fromX), cxOf(player.x)) + w / 2;
    let y1 = Math.min(cyOf(player.fromY), cyOf(player.y)) - w / 2;
    const y2 = Math.max(cyOf(player.fromY), cyOf(player.y)) + w / 2;
    y1 = Math.max(y1, EARTH_TOP * T);
    if (y2 > y1) ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  }
}

// 地面のふちの草(穴の入口は切れる)
function drawGrass() {
  for (let x = 0; x < COLS; x++) {
    const open = vOpen[SKY_ROW][x] || (player && Math.round(player.x) === x && player.y < EARTH_TOP && player.y > SKY_ROW);
    ctx.fillStyle = '#5bbf4a';
    if (open) {
      ctx.fillRect(x * T, EARTH_TOP * T, 4, 4);
      ctx.fillRect(x * T + T - 4, EARTH_TOP * T, 4, 4);
    } else {
      ctx.fillRect(x * T, EARTH_TOP * T, T, 4);
      ctx.fillStyle = '#7fdc5e';
      ctx.fillRect(x * T + 6, EARTH_TOP * T - 3, 2, 3);
      ctx.fillRect(x * T + 20, EARTH_TOP * T - 2, 2, 2);
    }
  }
}

// 着地したビールからあふれる泡。[横のずれ(px), 上る高さ(px), 半径(px), 出はじめ(0〜1)]
const FOAM_BUBBLES = [
  [0, 26, 7, 0], [-9, 18, 6, 0.02], [9, 20, 6, 0.04], [-4, 34, 5, 0.1],
  [5, 38, 5, 0.12], [-14, 10, 5, 0.06], [14, 12, 5, 0.08], [0, 46, 4, 0.2],
  [-8, 42, 3.5, 0.25], [8, 30, 4, 0.18], [-16, 4, 4, 0.15], [16, 6, 4, 0.16],
];

// 岩の代わりのビール。kind 0 = ビール缶、1 = ビールジョッキ
function drawRock(r) {
  let cx = cxOf(r.x);
  const cy = cyOf(r.state === 'fall' || r.state === 'break' ? r.fy : r.row);
  if (r.state === 'wobble') cx += Math.sin(r.timer * 45) * 2;
  const isMug = r.kind === 1;
  if (r.state !== 'break') {
    drawBeerBody(cx, cy, isMug);
    return;
  }
  // 着地: 泡がシュワッとあふれ出し、ビールごと消える
  const k = r.timer / ROCK_BREAK_TIME;
  if (k < 0.45) {
    ctx.globalAlpha = 1 - k / 0.45;
    drawBeerBody(cx, cy, isMug);
    ctx.globalAlpha = 1;
  }
  for (const [dx, up, rr, delay] of FOAM_BUBBLES) {
    const t = (k - delay) / (1 - delay); // この泡の進み具合(0〜1)
    if (t <= 0) continue;
    const grow = Math.min(1, t * 4);                  // ぷくっと出てくる
    const pop = t > 0.8 ? 1 + (t - 0.8) * 2.5 : 1;    // 最後に少し広がってはじける
    const alpha = t < 0.7 ? 0.95 : 0.95 * (1 - (t - 0.7) / 0.3);
    const bx = cx + dx * (0.5 + grow * 0.5) + Math.sin(t * 9 + dx) * 1.5;
    const by = cy + 6 - up * Math.sqrt(t);
    const br = rr * grow * pop;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f2d48a';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx - br * 0.45, by - br * 0.45, Math.max(1, br * 0.3), Math.max(1, br * 0.3));
  }
  ctx.globalAlpha = 1;
}

// ビール本体の絵
function drawBeerBody(cx, cy, isMug) {
  if (isMug) {
    // ジョッキの取っ手
    ctx.strokeStyle = '#d8f1ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx + 9, cy + 2, 6, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    // ガラスとビール
    ctx.fillStyle = '#d8f1ff';
    ctx.fillRect(cx - 11, cy - 9, 20, 23);
    ctx.fillStyle = '#f2a51a';
    ctx.fillRect(cx - 9, cy - 6, 16, 18);
    ctx.fillStyle = '#ffc94a';
    ctx.fillRect(cx - 7, cy - 4, 3, 14);
    // 泡の粒
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(cx + 1, cy + 3, 2, 2);
    ctx.fillRect(cx - 2, cy + 8, 2, 2);
    ctx.fillRect(cx + 3, cy - 2, 2, 2);
    // あふれる泡
    ctx.fillStyle = '#fffdf2';
    for (const [dx, rr] of [[-8, 5], [-2, 6], [4, 5.5]]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy - 10, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // 缶の胴体
    ctx.fillStyle = '#d9a520';
    ctx.fillRect(cx - 9, cy - 11, 18, 24);
    ctx.fillStyle = '#f5cd55';
    ctx.fillRect(cx - 6, cy - 11, 3, 24); // つや
    // ふちとプルタブ
    ctx.fillStyle = '#c0c0c8';
    ctx.fillRect(cx - 10, cy - 14, 20, 4);
    ctx.fillRect(cx - 10, cy + 12, 20, 3);
    ctx.fillStyle = '#8f8f9a';
    ctx.fillRect(cx - 2, cy - 16, 6, 2);
    // ラベル
    ctx.fillStyle = '#b8231c';
    ctx.fillRect(cx - 9, cy - 3, 18, 8);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 7px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BEER', cx, cy + 1.5);
    ctx.textBaseline = 'alphabetic';
  }
}

// モヒカン(頭のてっぺん (x,y) から立つトゲトゲ)
function drawMohawk(x, y, s) {
  ctx.fillStyle = '#ff2f92';
  ctx.beginPath();
  ctx.moveTo(x - 6 * s, y);
  ctx.lineTo(x - 6 * s, y - 8 * s);
  ctx.lineTo(x - 2.5 * s, y - 2 * s);
  ctx.lineTo(x, y - 12 * s);
  ctx.lineTo(x + 2.5 * s, y - 2 * s);
  ctx.lineTo(x + 6 * s, y - 9 * s);
  ctx.lineTo(x + 6 * s, y);
  ctx.closePath();
  ctx.fill();
  // 先っぽだけ緑に染めている
  ctx.fillStyle = '#7cff4f';
  for (const [tx, ty] of [[-6, -8], [0, -12], [6, -9]]) {
    ctx.beginPath();
    ctx.moveTo(x + tx * s, y + ty * s);
    ctx.lineTo(x + (tx - 1.5) * s, y + (ty + 3.5) * s);
    ctx.lineTo(x + (tx + 1.5) * s, y + (ty + 3.5) * s);
    ctx.closePath();
    ctx.fill();
  }
}

// 主人公: モヒカンのパンク野郎
function drawPlayer() {
  if (!player) return;
  const cx = cxOf(player.x);
  const cy = cyOf(player.y);
  const [fx, fy] = DIRS[player.face];
  ctx.save();
  ctx.translate(cx, cy);
  if (state === 'dying') {
    // ミス: くるくる回って縮む
    const k = Math.min(1, (2 - stateTimer) / 1.2);
    ctx.rotate(k * Math.PI * 4);
    ctx.scale(1 - k * 0.8, 1 - k * 0.8);
  }
  if (state === 'ready' && Math.floor(stateTimer * 6) % 2 === 0) ctx.globalAlpha = 0.5;
  const bob = player.moving ? Math.sin(player.anim * 20) * 1.2 : 0;
  // ポンプの筒(向いている方向)
  ctx.fillStyle = '#c9c9d6';
  if (fx !== 0) ctx.fillRect(fx > 0 ? 6 : -16, 3 + bob, 10, 5);
  else ctx.fillRect(-2, fy > 0 ? 8 : -16, 5, 10);
  // 黒い革ジャンと鋲
  ctx.fillStyle = '#26232e';
  ctx.beginPath();
  ctx.arc(0, 10 + bob, 10, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-10, 10 + bob, 20, 4);
  ctx.fillStyle = '#e4e4ee';
  for (const sx of [-7, -3, 2, 6]) ctx.fillRect(sx, 6 + bob, 1.5, 1.5);
  // 頭
  ctx.fillStyle = '#f1c49b';
  ctx.beginPath();
  ctx.arc(0, -1 + bob, 8, 0, Math.PI * 2);
  ctx.fill();
  drawMohawk(0, -6 + bob, 1);
  if (fy < 0) {
    // 上向き(後ろ姿): 刈り上げた後頭部
    ctx.fillStyle = '#9b7a62';
    ctx.beginPath();
    ctx.arc(0, -1 + bob, 8, Math.PI * 1.1, Math.PI * 1.9);
    ctx.fill();
  } else {
    // サングラス
    const gx = fx * 2;
    ctx.fillStyle = '#111';
    ctx.fillRect(gx - 6, -3 + bob, 12, 3.5);
    ctx.fillStyle = '#6ad1ff';
    ctx.fillRect(gx - 4, -2.5 + bob, 2, 1);
    // ニヤリと笑う口
    ctx.strokeStyle = '#7a3b2a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(gx - 2, 3 + bob);
    ctx.lineTo(gx + 3, 2 + bob);
    ctx.stroke();
  }
  // ピアス
  ctx.fillStyle = '#ffd23a';
  ctx.fillRect(fx > 0 ? -8 : 7, 1 + bob, 2, 2);
  ctx.restore();
}

// 敵: 怒った女の子。kind 0 = ピンク髪ツインテール、1 = 茶髪お団子
function drawGirlHead(cx, cy, r, kind, lx, ly, puffed) {
  const k = r / 11;
  const hair = kind === 0 ? '#ff6fb1' : '#8a5a3c';
  // 後ろ髪とツインテール / お団子
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(cx, cy - 1 * k, r, 0, Math.PI * 2);
  ctx.fill();
  if (kind === 0) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * (r + 3 * k), cy + 2 * k, 4 * k, 7 * k, side * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe14a'; // 髪ゴム
    ctx.fillRect(cx - r - 2 * k, cy - 5 * k, 3 * k, 3 * k);
    ctx.fillRect(cx + r - 1 * k, cy - 5 * k, 3 * k, 3 * k);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy - r - 2 * k, 5 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  // 顔
  ctx.fillStyle = '#ffd9bd';
  ctx.beginPath();
  ctx.arc(cx, cy + 1.5 * k, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  // 前髪
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(cx, cy + 1 * k, r * 0.85, Math.PI * 1.08, Math.PI * 1.92);
  ctx.closePath();
  ctx.fill();
  drawAngryFace(cx, cy, k, lx, ly, puffed);
  // 怒りマーク
  drawAngerMark(cx + r * 0.75, cy - r * 0.75, k);
}

// 怒った顔(つり上がった眉・目・ほっぺ・口)
function drawAngryFace(cx, cy, k, lx, ly, puffed) {
  // 眉: 真ん中に向かって下がる
  ctx.strokeStyle = '#3a1a1a';
  ctx.lineWidth = 1.8 * k;
  ctx.beginPath();
  ctx.moveTo(cx - 7 * k, cy - 3 * k);
  ctx.lineTo(cx - 2 * k, cy - 1 * k);
  ctx.moveTo(cx + 7 * k, cy - 3 * k);
  ctx.lineTo(cx + 2 * k, cy - 1 * k);
  ctx.stroke();
  if (puffed) {
    // ふくらんでいる間はぎゅっと目をつぶる(> <)
    ctx.beginPath();
    ctx.moveTo(cx - 6 * k, cy + 0.5 * k);
    ctx.lineTo(cx - 3 * k, cy + 2 * k);
    ctx.lineTo(cx - 6 * k, cy + 3.5 * k);
    ctx.moveTo(cx + 6 * k, cy + 0.5 * k);
    ctx.lineTo(cx + 3 * k, cy + 2 * k);
    ctx.lineTo(cx + 6 * k, cy + 3.5 * k);
    ctx.stroke();
  } else {
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx + side * 4.5 * k, cy + 2 * k, 2.6 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a1030';
      ctx.beginPath();
      ctx.arc(cx + side * 4.5 * k + lx * 1 * k, cy + 2 * k + ly * 1 * k, 1.5 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // ほっぺ
  ctx.fillStyle = puffed ? 'rgba(255,60,80,0.75)' : 'rgba(255,90,110,0.55)';
  const cr = puffed ? 3.2 : 2.2;
  ctx.beginPath();
  ctx.ellipse(cx - 7 * k, cy + 6 * k, cr * k, cr * 0.7 * k, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 7 * k, cy + 6 * k, cr * k, cr * 0.7 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  // 口: への字(ふくらむと「む」っとすぼめる)
  ctx.strokeStyle = '#8a2030';
  ctx.lineWidth = 1.4 * k;
  ctx.beginPath();
  if (puffed) {
    ctx.arc(cx, cy + 7.5 * k, 1.5 * k, 0, Math.PI * 2);
  } else {
    ctx.arc(cx, cy + 9.5 * k, 3 * k, Math.PI * 1.15, Math.PI * 1.85);
  }
  ctx.stroke();
}

// 怒りマーク(赤い十字の血管マーク)
function drawAngerMark(x, y, k) {
  ctx.strokeStyle = '#ff2a2a';
  ctx.lineWidth = 1.6 * k;
  const s = 3 * k;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, s * 0.9, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ff2a2a';
}

function drawEnemy(e) {
  if (e.state === 'escaped') return;
  if (e.state === 'dead' && e.deadT <= 0) return;
  const cx = cxOf(e.x);
  const cy = cyOf(e.y);
  const hair = e.kind === 0 ? '#ff6fb1' : '#8a5a3c';
  const dress = e.kind === 0 ? '#7a4dff' : '#ff8a3a';

  if (e.state === 'dead' && e.deadKind === 'pop') {
    // 破裂のしぶきとハート
    const k = 1 - e.deadT / 0.5;
    ctx.strokeStyle = hair;
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (8 + k * 10), cy + Math.sin(a) * (8 + k * 10));
      ctx.lineTo(cx + Math.cos(a) * (14 + k * 16), cy + Math.sin(a) * (14 + k * 16));
      ctx.stroke();
    }
    return;
  }
  if (e.state === 'crushed' || (e.state === 'dead' && e.deadKind === 'crush')) {
    // ぺしゃんこ(髪と服の色だけ見える)
    ctx.fillStyle = dress;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, 14, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 目は主人公の方を見る
  const lx = player ? Math.sign(Math.round((player.x - e.x) * 2)) : 0;
  const ly = player ? Math.sign(Math.round((player.y - e.y) * 2)) : 0;

  if (e.state === 'ghost') {
    // すり抜け中: 怒った目と眉だけが土の中をただよう
    ctx.globalAlpha = Math.sin(e.anim * 10) > 0 ? 1 : 0.6;
    ctx.strokeStyle = hair;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 5);
    ctx.lineTo(cx - 2, cy - 2);
    ctx.moveTo(cx + 8, cy - 5);
    ctx.lineTo(cx + 2, cy - 2);
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx + side * 5, cy + 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff2a4a';
      ctx.beginPath();
      ctx.arc(cx + side * 5 + lx * 1.4, cy + 2 + ly * 1.4, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    drawAngerMark(cx + 9, cy - 9, 1);
    ctx.globalAlpha = 1;
    return;
  }

  if (e.inflate > 0) {
    // ふくらむ: ほっぺをぷくーっとふくらませて顔ごと大きくなる
    const r = 11 * (1 + 0.28 * e.inflate);
    drawGirlHead(cx, cy, r, e.kind, 0, 0, true);
    return;
  }
  const bob = Math.abs(Math.sin(e.anim * 9)) * 1.5;
  // 足とワンピース
  ctx.fillStyle = '#2a1838';
  const step = Math.sin(e.anim * 12) * 2.5;
  ctx.fillRect(cx - 6 + step, cy + 12, 4, 3);
  ctx.fillRect(cx + 2 - step, cy + 12, 4, 3);
  ctx.fillStyle = dress;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy + 13);
  ctx.lineTo(cx + 8, cy + 13);
  ctx.lineTo(cx + 3, cy + 4);
  ctx.lineTo(cx - 3, cy + 4);
  ctx.closePath();
  ctx.fill();
  drawGirlHead(cx, cy - 3 - bob, 9, e.kind, lx, ly, false);
}

function drawHarpoon() {
  if (!harpoon || !player) return;
  const [dx, dy] = DIRS[harpoon.dir];
  const ox = cxOf(player.x) + dx * 12;
  const oy = cyOf(player.y) + dy * 12;
  const len = Math.max(0, harpoon.len * T - 12);
  const tx = ox + dx * len;
  const ty = oy + dy * len;
  // チューブ(少し波打つ線)
  ctx.strokeStyle = '#e8e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const n = Math.max(1, Math.floor(len / 6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const wave = Math.sin(t * Math.PI * 4) * 1.5;
    const px = ox + dx * len * t + dy * wave;
    const py = oy + dy * len * t + dx * wave;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // 銛の先
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(tx + dx * 7, ty + dy * 7);
  ctx.lineTo(tx - dy * 4, ty + dx * 4);
  ctx.lineTo(tx + dy * 4, ty - dx * 4);
  ctx.closePath();
  ctx.fill();
}

function drawPopups() {
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.t * 2);
    ctx.fillStyle = '#000';
    ctx.fillText(p.text, cxOf(p.x) + 1, cyOf(p.y) - (1.2 - p.t) * 20 + 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(p.text, cxOf(p.x), cyOf(p.y) - (1.2 - p.t) * 20);
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, T);
  ctx.fillRect(0, (ROWS - 1) * T, W, T);
  ctx.font = `bold 14px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ff7b6b';
  ctx.fillText('SCORE', 8, T / 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(score).padStart(6, '0'), 62, T / 2);
  ctx.fillStyle = '#ff7b6b';
  ctx.fillText('HI', 160, T / 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(highScore).padStart(6, '0'), 182, T / 2);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffd36b';
  ctx.fillText(`ROUND ${level}`, W - 8, T / 2);

  // 下HUD: 残りの主人公(控え)とスピード段階
  const by = (ROWS - 0.5) * T;
  for (let i = 0; i < Math.max(0, lives - 1); i++) {
    // モヒカン頭のアイコン
    const x = 16 + i * 22;
    ctx.fillStyle = '#f1c49b';
    ctx.beginPath();
    ctx.arc(x, by + 3, 6, 0, Math.PI * 2);
    ctx.fill();
    drawMohawk(x, by - 1, 0.6);
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 4, by + 1, 8, 2.5);
  }
  ctx.textAlign = 'right';
  ctx.font = `12px ${FONT}`;
  if (speedStage > 0) {
    ctx.fillStyle = '#ff9b6b';
    ctx.fillText(`敵スピード${'▲'.repeat(speedStage)}`, W - 8, by);
  }
  ctx.textBaseline = 'alphabetic';
}

function drawOverlay() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const midY = H / 2;
  if (state === 'ready') {
    textWithShadow(`ROUND ${level}`, W / 2, cyOf(START_Y) - 56, `bold 20px ${FONT}`, '#ffd36b');
    textWithShadow('READY!', W / 2, cyOf(START_Y) + 44, `bold 20px ${FONT}`, '#fff');
  } else if (state === 'clear') {
    textWithShadow('ROUND CLEAR!', W / 2, midY, `bold 26px ${FONT}`, '#ffd36b');
  } else if (state === 'paused') {
    dim();
    textWithShadow('一時停止中', W / 2, midY - 10, `bold 24px ${FONT}`, '#fff');
    textWithShadow('P / クリックで再開', W / 2, midY + 24, `14px ${FONT}`, '#ddd');
  } else if (state === 'title') {
    dim();
    textWithShadow('ほりポン', W / 2, 130, `bold 44px ${FONT}`, '#ffc93a');
    const lines = [
      'モヒカンパンクで土を掘り、怒った女子から逃げきれ!',
      '',
      '矢印 / WASD … 移動(土があれば掘る)',
      'スペース / Z … ポンプを撃つ',
      '刺したまま連打・長押しでふくらませて破裂!',
      '真下を掘ったビールは落ちてくる。まとめて潰せ',
      '深い地層で倒すほど高得点',
      '',
    ];
    lines.forEach((l, i) => textWithShadow(l, W / 2, 200 + i * 24, `14px ${FONT}`, '#f3e9d2'));
    textWithShadow('Enter / スペース / タップでスタート', W / 2, 420, `bold 16px ${FONT}`, '#fff');
    textWithShadow(`HI SCORE ${highScore}`, W / 2, 456, `14px ${FONT}`, '#ff9b8b');
  } else if (state === 'gameover') {
    dim();
    textWithShadow('GAME OVER', W / 2, midY - 40, `bold 34px ${FONT}`, '#ff6b6b');
    textWithShadow(`SCORE ${score}`, W / 2, midY + 6, `bold 18px ${FONT}`, '#fff');
    textWithShadow(`HI SCORE ${highScore}`, W / 2, midY + 34, `14px ${FONT}`, '#ffd36b');
    textWithShadow('Enter / スペース / タップで再挑戦', W / 2, midY + 76, `14px ${FONT}`, '#ddd');
  }
  ctx.textBaseline = 'alphabetic';
}

function dim() {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, T, W, H - 2 * T);
}

function textWithShadow(text, x, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = '#000';
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// =====================================================================
// ループ
// =====================================================================
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state !== 'paused') update(dt);
  draw();
  requestAnimationFrame(loop);
}

buildRound(1); // タイトル画面の背景用
updateButtons();
requestAnimationFrame(loop);
