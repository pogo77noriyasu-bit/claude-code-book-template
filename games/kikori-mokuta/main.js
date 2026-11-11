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
const POSE_TIME = 0.8;          // 木を倒したときのキメポーズを見せる時間(秒・見た目だけ)
const MAX_LIVES = 3;            // 初期の残機
const LIFE_CAP = 5;             // 安全ピンで増やせる残機の上限

// アイテム(安全ピン・ビール缶)
const PINS_FOR_LIFE = 5;        // 安全ピンをこの数集めると残機 +1
const PIN_CHOP_CHANCE = 0.06;   // 木にオノを入れたとき、葉っぱから安全ピンが落ちてくる確率
const PIN_BOAR_CHANCE = 1.0;    // イノシシを倒したとき安全ピンを落とす確率
const PIN_SNAKE_CHANCE = 0.2;   // ヘビを倒したとき安全ピンを落とす確率
const PIN_MAX = 2;              // 画面に同時に出る安全ピンの最大数
const CAN_CHANCE = 0.35;        // 木が倒れ始めたときビール缶が出る確率(その面の最後の木は除く)
const CAN_MAX = 1;              // 画面に同時に出るビール缶の最大数
const ITEM_LIFE = 8;            // アイテムが消えるまでの時間(秒)。最後の2秒は点滅する

// 得点
const SCORE_CHOP = 10;          // 木に1回オノを入れる
const SCORE_TREE = 500;         // 木を切り倒す
const SCORE_SNAKE = 100;        // ヘビをオノで倒す
const SCORE_BOAR = 200;         // イノシシをオノで倒す
const SCORE_CRUSH = 300;        // 倒れた木で敵を下敷きにする
const SCORE_STAGE = 1000;       // 面クリアのボーナス(×面数)
const SCORE_CAN = 500;          // ビール缶を拾う
const SCORE_PIN_FULL = 1000;    // 残機が上限のときに安全ピンを集め切ったボーナス

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
  // ここから下は見た目だけに使う値(操作・当たり判定には使わない)
  moving: false,   // このフレームで歩いたか
  pose: 0,         // キメポーズの残り時間
  hairLean: 0,     // モヒカンのなびき(マイナスで後ろへ)
  hairVel: 0,      // なびきの速さ(ばねの計算用)
  droop: 0,        // モヒカンのへたり具合(0: ピン, 1: ぺったり)
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
let items = [];     // アイテム { type: 'pin' | 'can', x, y(下端), vx, vy, landed, life, anim }
let pins = 0;       // 集めた安全ピンの数(面をまたいで持ち越し、ミスしても減らない)
let pinFlash = 0;   // HUD のピン表示を光らせる残り時間

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

// AudioContext を用意する。自動再生制限があるので、最初に鳴らすときに作る。使えなければ false
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    audioCtx = new AC();
  }
  return true;
}

// delay 秒後に1音鳴らす
function tone(freq, duration, type = 'square', volume = 0.08, slideTo = null, delay = 0) {
  if (!ensureAudio()) return;
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

// 歪み(ディストーション)。パンク風のギター音に使う。最初に使うときに1つだけ作る
let distortion = null;
function getDistortion() {
  if (!distortion) {
    distortion = audioCtx.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 6); // 強めにつぶして、ジャリッとした音にする
    }
    distortion.curve = curve;
    distortion.connect(audioCtx.destination);
  }
  return distortion;
}

// パワーコード(根音・5度・オクターブ)を歪ませて鳴らす。slideTo を渡すと根音の周波数まで音程を下げる
function powerChord(root, duration, delay = 0, volume = 0.05, slideTo = null) {
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime + delay;
  const out = getDistortion();
  for (const m of [1, 1.5, 2]) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(root * m, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo * m, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.setValueAtTime(volume, t + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + duration);
  }
}

// キック(バスドラム風)
function kick(delay) {
  tone(150, 0.12, 'sine', 0.25, 45, delay);
}

// リフ: [根音の周波数(0 は休み), 長さ, キックを鳴らすか] を順に鳴らす
function riff(steps, volume = 0.05) {
  let t = 0;
  for (const [f, d, k, slide] of steps) {
    if (f) powerChord(f, d * 0.92, t, volume, slide || null);
    if (k) kick(t);
    t += d;
  }
}

// ノイズ(シャーという音)。highpass で高い成分だけ残して「プシュッ」にする
function noise(duration, volume = 0.08, delay = 0, cutoff = 3000) {
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime + delay;
  const len = Math.floor(audioCtx.sampleRate * duration);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = cutoff;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start(t);
}

// 音の高さ(Hz)。ジングルで使う音だけ
const N = { E3: 164.8, F3: 174.6, G3: 196.0, A3: 220.0, B3: 246.9, D4: 293.7, E4: 329.6 };

const SOUNDS = {
  start: () => melody([[392, 0.12], [523, 0.12], [659, 0.12], [784, 0.24], [659, 0.12], [784, 0.36]]),
  chop:  () => { tone(1500, 0.05, 'square', 0.06, 700); tone(180, 0.09, 'triangle', 0.12, 90); },
  fall:  () => { tone(300, 0.5, 'sawtooth', 0.08, 60); tone(90, 0.4, 'triangle', 0.14, 40, 0.4); },
  whiff: () => tone(400, 0.05, 'triangle', 0.04),
  kill:  () => tone(880, 0.12, 'square', 0.07, 1760),
  crush: () => { tone(660, 0.1, 'square', 0.07); tone(990, 0.15, 'square', 0.07, null, 0.08); },
  stun:  () => tone(1200, 0.4, 'sine', 0.06, 300),
  pin:   () => { tone(1568, 0.06, 'square', 0.05); tone(2093, 0.12, 'square', 0.05, null, 0.06); },
  can:   () => { noise(0.18, 0.09); tone(1319, 0.3, 'triangle', 0.09, null, 0.14); tone(1976, 0.25, 'triangle', 0.05, null, 0.14); },
  oneup: () => melody([[784, 0.07], [988, 0.07], [1175, 0.07], [1568, 0.07], [0, 0.03], [1568, 0.25]], 'square', 0.06),
  warn:  () => tone(1000, 0.08, 'square', 0.05),
  miss:  () => melody([[523, 0.15], [494, 0.15], [466, 0.15], [440, 0.5]], 'triangle', 0.1),
  // 面クリア: 勢いよく刻んで、最後に高い音で伸ばすオリジナルのパンク風リフ(約 1.6 秒)
  clear: () => riff([
    [N.E3, 0.11, true], [N.E3, 0.11], [0, 0.05], [N.G3, 0.11, true], [N.A3, 0.22],
    [0, 0.05], [N.B3, 0.11, true], [N.A3, 0.11], [N.D4, 0.11, true], [N.E4, 0.55, true],
  ]),
  // ゲームオーバー: 重たく下がっていき、最後の音がだらんと沈むオリジナルのリフ(約 1.9 秒)
  over: () => riff([
    [N.A3, 0.28, true], [N.G3, 0.28, true], [N.F3, 0.28, true], [N.E3, 1.0, true, N.E3 / 2],
  ], 0.045),
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
  pins = 0;
  pinFlash = 0;
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
  items = [];
  enemyTimer = 2.5;
  birdTimer = 5;
  player.chopCool = 0;
  player.swing = 0;
  player.stun = 0;
  player.hiding = false;
  player.ghostY = 0;
  player.pose = 0;
  player.droop = 0;
  player.hairLean = 0;
  player.hairVel = 0;
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
  // 葉っぱから安全ピンが落ちてくることがある
  if (Math.random() < PIN_CHOP_CHANCE) {
    spawnItem('pin', t.x + (Math.random() - 0.5) * 80, CANOPY_Y + 20, 0, 0);
  }

  if (t.hp <= 0) {
    // ビール缶: 根元からポンと飛び出し、弧を描いてプレイヤーの後ろ側に落ちる(少し歩いて拾いに行く)。
    // その面の最後の木は、倒れ切るとすぐ面クリアになって拾えないので出さない
    const isLastTree = trees.every((o) => o === t || o.state !== 'stand');
    if (!isLastTree && Math.random() < CAN_CHANCE) {
      spawnItem('can', t.x, GROUND - 30, -300, -player.dir * 120);
    }
    // 自分と反対側へ倒れる
    t.state = 'falling';
    t.fallDir = player.dir;
    addScore(SCORE_TREE, t.x, GROUND - 120);
    playSound('fall');
    shake = 6;
    player.pose = POSE_TIME; // 拳を突き上げる(見た目だけ)
  }
}

function killEnemy(e, points) {
  e.dead = true;
  addScore(points, e.x, GROUND - 40);
  burst(e.x, GROUND - 10, e.type === 'boar' ? '#8a5a34' : '#5fbf4a', 12, 160);
  // 倒した敵が安全ピンを落とすことがある(オノでも下敷きでも同じ)
  const chance = e.type === 'boar' ? PIN_BOAR_CHANCE : PIN_SNAKE_CHANCE;
  if (Math.random() < chance) spawnItem('pin', e.x, GROUND - 24, -200, 0);
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

// アイテムを出す。y は下端の高さ、vy は最初の縦の速さ(マイナスで上へ跳ねる)、vx は横の速さ
function spawnItem(type, x, y, vy, vx) {
  const max = type === 'pin' ? PIN_MAX : CAN_MAX;
  if (items.filter((it) => it.type === type).length >= max) return;
  x = Math.max(20, Math.min(W - 20, x)); // 画面の外に出ないようにする
  items.push({ type, x, y, vx, vy, landed: false, life: ITEM_LIFE, anim: Math.random() * 10 });
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
  if (pinFlash > 0) pinFlash -= dt;
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
    player.moving = false;
    updateHair(dt);
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
  updateHair(dt);
  updateTrees(dt);
  updateEnemies(dt);
  updateBranches(dt);
  updateBirds(dt);
  updateItems(dt);

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
  if (player.pose > 0) player.pose -= dt;
  player.moving = false;

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
    player.moving = true;
  }
  player.x = Math.max(16, Math.min(W - 16, player.x));
}

// モヒカンの動き(見た目だけ)。ばねのように目標の傾きへ近づける
function updateHair(dt) {
  let target = 0;
  if (player.moving) target = -2.5 + Math.sin(player.walk * 2) * 2; // 歩くと後ろになびいて、足に合わせて揺れる
  if (player.swing > 0) target = -6;                               // オノを振ると、勢いで大きく後ろへ
  if (state === 'clear') target = Math.sin(performance.now() / 90) * 2.5; // クリア中はノリノリで揺れる
  player.hairVel += ((target - player.hairLean) * 180 - player.hairVel * 12) * dt;
  player.hairLean += player.hairVel * dt;
  // しびれている間はへたり、治ると元に戻る
  const droopTarget = player.stun > 0 && state !== 'clear' ? 1 : 0;
  player.droop += (droopTarget - player.droop) * Math.min(1, dt * (droopTarget ? 10 : 5));
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

function updateItems(dt) {
  for (const it of items) {
    it.anim += dt;
    if (!it.landed) {
      // 落ちる。ピンはひらひら落ちるので、落ちる速さに上限をつける
      it.vy += 700 * dt;
      if (it.type === 'pin') it.vy = Math.min(it.vy, 170);
      it.y += it.vy * dt;
      it.x = Math.max(20, Math.min(W - 20, it.x + it.vx * dt));
      if (it.y >= GROUND) {
        it.y = GROUND;
        it.landed = true; // 地面に着いたら止まる
      }
    } else {
      it.life -= dt;
      if (it.life <= 0) it.done = true;
    }
    // 落ちてくる途中か地面にあって、頭の高さより下で重なっていれば拾う。
    // 跳ね上がっている途中は拾えない(飛び出した缶をその場で自動的に拾ってしまわないように)。
    // かくれている間も拾えない
    const catchable = it.landed || it.vy >= 0;
    if (!it.done && catchable && !player.hiding && it.y > GROUND - 60 && touchesPlayer(it.x, 8)) {
      it.done = true;
      pickUp(it);
    }
  }
  items = items.filter((it) => !it.done);
}

function pickUp(it) {
  if (it.type === 'can') {
    addScore(SCORE_CAN, it.x, GROUND - 50);
    burst(it.x, GROUND - 14, '#f2c230', 10, 140);
    playSound('can');
    return;
  }
  // 安全ピン
  pins++;
  pinFlash = 0.4;
  burst(it.x, GROUND - 10, '#e6eaf0', 6, 100);
  if (pins >= PINS_FOR_LIFE) {
    pins = 0;
    if (lives < LIFE_CAP) {
      lives++;
      popups.push({ x: player.x, y: GROUND - 80, text: '1UP!', life: 1.2 });
    } else {
      addScore(SCORE_PIN_FULL, player.x, GROUND - 80);
    }
    playSound('oneup');
  } else {
    playSound('pin');
  }
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
  for (const it of items) drawItem(it);
  for (const e of enemies) drawEnemy(e);
  if (!player.hiding) drawPlayer();
  for (const b of branches) drawBranch(b);
  for (const d of drops) drawDrop(d);
  for (const b of birds) drawBird(b);
  drawParticles();

  ctx.restore();
  drawHud();

  if (state === 'ready') {
    drawCenterText('きこりのパンク', 'ヘビやイノシシをよけて、木を3本切り倒そう',
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
    // ブーツ(足を左に投げ出して横たわる)
    ctx.fillStyle = '#111114';
    ctx.fillRect(x - 32, y - 10, 16, 7);
    ctx.fillRect(x - 34, y - 12, 4, 9);   // つま先が上を向く
    ctx.fillStyle = '#ffd23c';            // 黄色いステッチ
    for (let sx = x - 31; sx < x - 17; sx += 3) ctx.fillRect(sx, y - 4, 1.5, 1);
    // 黒い鋲ジャンの胴体
    ctx.fillStyle = '#1f1f26';
    ctx.fillRect(x - 16, y - 12, 28, 10);
    ctx.fillStyle = '#d8dce4';
    for (let sx = x - 13; sx < x + 10; sx += 5) {
      ctx.fillRect(sx, y - 11, 2, 2);
      ctx.fillRect(sx + 2, y - 5, 2, 2);
    }
    // 頭と、横に倒れた赤いモヒカン
    ctx.fillStyle = '#f2c79a';
    ctx.beginPath(); ctx.arc(x + 18, y - 8, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff2a2a';
    ctx.strokeStyle = '#4a0606';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 23, y - 13);
    ctx.lineTo(x + 32, y - 15); ctx.lineTo(x + 26, y - 10);
    ctx.lineTo(x + 34, y - 8);  ctx.lineTo(x + 26, y - 6);
    ctx.lineTo(x + 32, y - 1);  ctx.lineTo(x + 23, y - 3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
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

  // 足(歩くと交互に動く)。奥の足は少し暗くして前後をわかりやすくする
  const step = player.stun > 0 ? 0 : Math.sin(player.walk) * 4;
  drawBoot(2 - step, '#0c0c0f');
  drawBoot(-8 + step, '#1b1b20');
  // 体(黒い鋲ジャン)
  drawStudJacket();
  // キメポーズ: 背中側の腕で拳を突き上げる(オノを振っている間・しびれている間は出さない)
  if (showPose()) drawRaisedFist();
  // 頭(顔・ひげ)
  drawPunkHead(0, -44);

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

  // 赤いモヒカン: いちばん目立たせたいので、オノより手前に描く。なびきとへたりを反映する
  drawMohawk(0, -44, 9, 1, player.hairLean, player.droop);

  ctx.restore();

  // 面クリア中は「OI!」の吹き出し
  if (inClear()) drawOiBubble(x);

  // しびれているときはモヒカンのさらに上で星を回す(モヒカンと重ならない高さ)
  if (player.stun > 0 && !inClear()) {
    ctx.fillStyle = '#ffe83c';
    const t = performance.now() / 150;
    for (let i = 0; i < 3; i++) {
      const a = t + (i * Math.PI * 2) / 3;
      ctx.fillRect(x + Math.cos(a) * 14 - 2, GROUND - 80 + Math.sin(a) * 4 - 2, 5, 5);
    }
  }
}

// ---- モク太(パンク)の部品 ----
// どれも右向きの座標で描く。左向きは drawPlayer() の ctx.scale(-1, 1) でそのまま反転される。
// 文字や左右で意味の変わる模様は入れず、前後どちらにも鋲を置くので、反転しても自然に見える。

// 20ホール相当の黒い編み上げブーツ(膝下まである長いブーツ)。ox は足の左端
function drawBoot(ox, color) {
  // 筒(すね)と足の甲・つま先
  ctx.fillStyle = color;
  ctx.fillRect(ox, -16, 7, 14);
  ctx.fillRect(ox, -5, 10, 4);
  ctx.beginPath(); ctx.arc(ox + 9.5, -3, 2, -Math.PI / 2, Math.PI / 2); ctx.fill();
  // 厚い靴底
  ctx.fillStyle = '#050505';
  ctx.fillRect(ox - 0.5, -1.5, 12.5, 1.5);
  // 編み上げのひも: 片側 10 個(左右で 20 ホール)のハトメを、前側にジグザグでつなぐ
  ctx.strokeStyle = '#55555e';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ly = -15.2 + i * 1.25;
    const lx = ox + (i % 2 === 0 ? 4.2 : 6.6);
    if (i === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
  }
  ctx.stroke();
  ctx.fillStyle = '#c8ccd4'; // ハトメ(銀)
  for (let i = 0; i < 10; i++) ctx.fillRect(ox + 6.2, -15.6 + i * 1.25, 0.8, 0.8);
  // 黄色いステッチ: 靴底のまわり(ウェルト)と、かかとの縦の縫い目
  ctx.fillStyle = '#ffd23c';
  for (let sx = ox; sx < ox + 11; sx += 2) ctx.fillRect(sx, -2.4, 1.2, 0.8);
  for (let sy = -15; sy < -3; sy += 2) ctx.fillRect(ox + 0.6, sy, 0.8, 1.2);
  // かかとのプルタブ(黄色)
  ctx.fillRect(ox - 1, -17, 1.6, 3);
}

// 黒い鋲ジャン。前(右)にも背中(左)にも鋲を打つ
function drawStudJacket() {
  ctx.fillStyle = '#1f1f26';
  ctx.fillRect(-10, -36, 20, 20);
  // 前のえり(折り返し)と、すそのベルト
  ctx.fillStyle = '#34343f';
  ctx.beginPath();
  ctx.moveTo(4, -36); ctx.lineTo(10, -36); ctx.lineTo(10, -27); ctx.closePath();
  ctx.fill();
  ctx.fillRect(-10, -19, 20, 3);
  // 鋲(銀の粒 + 光る点)。前・背中・肩
  const studs = [
    [7, -33], [7, -29], [7, -25], [7, -21],      // 前の合わせ
    [-9, -34], [-9, -30], [-9, -26], [-9, -22],  // 背中側の縁
    [-6, -32], [-6, -28], [-6, -24],             // 背中の面(互い違い)
    [-5, -36], [-1, -36], [3, -36],              // 肩
  ];
  for (const [sx, sy] of studs) {
    ctx.fillStyle = '#b8bec8';
    ctx.fillRect(sx, sy, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx, sy, 1, 1);
  }
  // ときどき1つの鋲がキラッと光る。0.9 秒ごとに、時刻から決めた鋲を 0.2 秒だけ光らせる
  // (乱数を使わず時刻から決めるので、描画のたびに光る場所が変わってちらつくことがない)
  const now = performance.now() / 1000;
  const slot = Math.floor(now / 0.9);
  const phase = now - slot * 0.9;
  if (phase < 0.2) {
    const [sx, sy] = studs[(slot * 7 + 3) % studs.length];
    const size = Math.sin((phase / 0.2) * Math.PI) * 4.5; // 大きくなってから消える
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx + 1 - size, sy + 0.5, size * 2, 1);     // 横の光
    ctx.fillRect(sx + 0.5, sy + 1 - size, 1, size * 2);     // 縦の光
  }
  // 黄色いステッチ(すそのベルト)
  ctx.fillStyle = '#ffd23c';
  for (let sx = -9; sx < 10; sx += 3) ctx.fillRect(sx, -17.6, 1.5, 0.8);
}

// 赤いモヒカン。(cx, cy) は頭の中心、r は頭の半径、s は大きさの倍率。
// lean はとげの先の横ずれ(マイナスで後ろへなびく)、droop はへたり具合(0〜1)。
// 小さな画面でも目立つよう、明るい赤に濃い縁取りを付け、頭より高く突き出させる
function drawMohawk(cx, cy, r, s, lean = 0, droop = 0) {
  // とげの根元は頭頂部の弧に沿わせ、先は少し後ろ(左)へなびかせる
  const upTips = [[-10, -7], [-5, -13], [1, -15], [7, -12]];
  // へたったときのとげの先: 後ろへ倒れて垂れ下がる
  const flatTips = [[-15, 4], [-13, -1], [-9, -3], [-4, -3]];
  const tips = upTips.map(([ux, uy], i) => {
    const [fx, fy] = flatTips[i];
    // 高いとげほど大きくなびく。へたっているときはなびかない
    const sway = lean * (-uy / 15) * (1 - droop);
    return [ux + (fx - ux) * droop + sway, uy + (fy - uy) * droop];
  });
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.85, cy - r * 0.45);
  const bases = [-0.6, -0.15, 0.3, 0.75];
  for (let i = 0; i < tips.length; i++) {
    ctx.lineTo(cx + tips[i][0] * s, cy - r + tips[i][1] * s);
    const b = bases[i];
    ctx.lineTo(cx + b * r, cy - Math.sqrt(1 - b * b) * r);
  }
  ctx.lineTo(cx + r * 0.85, cy - r * 0.45);
  ctx.closePath();
  ctx.fillStyle = '#ff2a2a';
  ctx.strokeStyle = '#4a0606';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
  // つやのハイライト(へたっているときはつやが消える)
  if (droop > 0.5) return;
  ctx.strokeStyle = '#ff9a8a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.2, cy - r);
  ctx.lineTo(cx + tips[2][0] * s - 1, cy - r + tips[2][1] * s + 3 * s);
  ctx.stroke();
}

// 面クリア中か(一時停止で止めているときも含む)
function inClear() {
  return state === 'clear' || (state === 'paused' && pausedFrom === 'clear');
}

// キメポーズを見せるか: 木を倒した直後と面クリア中。オノを振っている間・しびれている間は出さない
function showPose() {
  if (player.swing > 0) return false;
  if (inClear()) return true;
  return player.pose > 0 && player.stun <= 0;
}

// 背中側の腕で拳を突き上げる(右向きの座標)。最初の一瞬で腕を振り上げる
function drawRaisedFist() {
  const elapsed = inClear() ? 1 : POSE_TIME - player.pose;
  const k = Math.min(1, elapsed / 0.1);       // 0 → 1 で腕が上がる
  const hx = -7 + (-8) * k, hy = -30 + (-26) * k; // 拳の位置(肩 (-7, -33) から上へ)
  ctx.strokeStyle = '#1f1f26';                // 袖(鋲ジャンの色)
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -33);
  ctx.lineTo(hx, hy + 3);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#b8bec8';                  // 袖の鋲
  ctx.fillRect((-6 + hx) / 2 - 1, (-33 + hy + 3) / 2 - 1, 2, 2);
  ctx.fillStyle = '#f2c79a';                  // 拳
  ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c99a70';                  // 指の線
  ctx.fillRect(hx - 2, hy - 1, 4, 0.8);
}

// 「OI!」の吹き出し。文字が鏡文字にならないよう、反転していない座標で描く
function drawOiBubble(px) {
  const dir = player.dir;
  // 頭の前上に出す。画面の端からはみ出さないようにする
  const bx = Math.max(36, Math.min(W - 36, px + dir * 30));
  const by = GROUND - 96 + Math.sin(performance.now() / 120) * 1.5;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1f1f26';
  ctx.lineWidth = 2;
  // しっぽ(モク太の頭のほうを向く)
  ctx.beginPath();
  ctx.moveTo(bx - dir * 6, by + 8);
  ctx.lineTo(px + dir * 12, GROUND - 58);
  ctx.lineTo(bx + dir * 4, by + 10);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // 本体
  ctx.beginPath();
  ctx.ellipse(bx, by, 26, 14, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // しっぽと本体のつなぎ目の線を消す
  ctx.beginPath();
  ctx.ellipse(bx, by, 24.5, 12.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e0201a';
  ctx.fillText('OI!', bx, by + 1);
  ctx.restore();
}

// 頭: 顔、剃り上げた横の部分、ひげ(モク太の個性なので残す)、目
function drawPunkHead(cx, cy) {
  ctx.fillStyle = '#f2c79a';
  ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
  // 剃り上げた横の部分(少し青みがかった肌色)
  ctx.fillStyle = '#d9b49a';
  ctx.beginPath(); ctx.arc(cx, cy, 9, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  // 耳
  ctx.fillStyle = '#e6b688';
  ctx.beginPath(); ctx.arc(cx - 2, cy - 1, 2.2, 0, Math.PI * 2); ctx.fill();
  // ひげ
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(cx - 2, cy + 3, 10, 5);
  // 目
  ctx.fillStyle = '#222';
  ctx.fillRect(cx + 4, cy - 3, 2, 3);
  // モヒカンは drawPlayer() でオノのあとに描く(担いだオノの刃に隠れないように)
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
    // パンクなイノシシ: 頭に小さな赤いモヒカン。突進の勢いで後ろになびき、走りに合わせて揺れる
    // (見た目だけ。速さ・当たり判定は変えない)
    drawMohawk(18, -19 - bob, 6, 0.75, -4 + Math.sin(e.anim * 20) * 1.5);
  }
  ctx.restore();
}

// ---- ドット絵 ----
// 文字列の配列で絵を表す。1文字が1マスで、'.' は透明。palette で文字ごとの色を決める
const PIN_SPRITE = [
  '.kkk.kkkkkkkkkk',
  'ksssksswwsssyyk',
  'ks.skkkkkkkkyyk',
  'ksssssssssssyyk',
  '.kkkkkkkkkkkkkk',
];
const PIN_PALETTE = { k: '#2a2a33', s: '#c8ccd4', w: '#ffffff', y: '#e8b830' };

// ビール缶(架空のデザイン。実在の銘柄は使わない)
const CAN_SPRITE = [
  '.kkkkkk.',
  'kbsssswk',
  'kkkkkkkk',
  'kwyyyyok',
  'kwyyyyok',
  'krrrrrdk',
  'kwrWWrdk',
  'krrrrrdk',
  'kwyyyyok',
  'kwyyyyok',
  'kkkkkkkk',
  '.kkkkkk.',
];
const CAN_PALETTE = {
  k: '#1a1a1a', s: '#d8dce4', b: '#9aa0aa', w: '#fff3b0', y: '#f2c230',
  o: '#c08a10', r: '#d8282a', d: '#8e1414', W: '#ffffff',
};

// (x, y) を左上にして、1マス px ピクセルで描く。にじまないよう整数の座標にそろえる
function drawSprite(sprite, palette, x, y, px) {
  x = Math.round(x); y = Math.round(y);
  for (let r = 0; r < sprite.length; r++) {
    const row = sprite[r];
    for (let c = 0; c < row.length; c++) {
      const color = palette[row[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + c * px, y + r * px, px, px);
    }
  }
}

function drawItem(it) {
  // 消える前の2秒は点滅する
  if (it.landed && it.life < 2 && Math.floor(it.life * 8) % 2 === 0) return;
  if (it.type === 'can') {
    const px = 2;
    const w = CAN_SPRITE[0].length * px;
    const h = CAN_SPRITE.length * px;
    // 地面の影
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(Math.round(it.x - w / 2 - 1), GROUND - 1, w + 2, 2);
    drawSprite(CAN_SPRITE, CAN_PALETTE, it.x - w / 2, it.y - h, px);
  } else {
    const px = 2;
    const w = PIN_SPRITE[0].length * px;
    const h = PIN_SPRITE.length * px;
    // 落ちている間はゆらゆら左右に揺れる
    const sway = it.landed ? 0 : Math.sin(it.anim * 8) * 4;
    drawSprite(PIN_SPRITE, PIN_PALETTE, it.x - w / 2 + sway, it.y - h, px);
    // ときどきキラッと光らせて、危険な枝と見分けやすくする
    const phase = (it.anim % 0.8) / 0.8;
    if (phase < 0.3) {
      const size = Math.sin((phase / 0.3) * Math.PI) * 5;
      const sx = Math.round(it.x + w / 2 - 6 + sway), sy = Math.round(it.y - h - 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx - size, sy, size * 2, 1.5);
      ctx.fillRect(sx, sy - size, 1.5, size * 2);
    }
  }
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
  // 集めた安全ピンの数(拾った直後は黄色く光る)
  drawSprite(PIN_SPRITE, PIN_PALETTE, 140, 10, 1.4);
  ctx.fillStyle = pinFlash > 0 ? '#ffe83c' : '#fff';
  ctx.fillText(`${pins}/${PINS_FOR_LIFE}`, 165, 21);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(`HI ${highScore}`, W / 2 - 60, 21);
  ctx.fillText(`STAGE ${stage}`, W / 2 + 70, 21);
  // 残りの木の数
  const left = trees.filter((t) => t.state === 'stand').length;
  ctx.textAlign = 'right';
  ctx.fillText(`木 ${left}`, W - 90, 21);
  // 残りライフ(赤いモヒカンの頭のアイコン)。4つ以上は画面からはみ出すので「アイコン ×n」で表す
  const icons = lives <= 3 ? lives : 1;
  for (let i = 0; i < icons; i++) {
    const hx = W - 70 + i * 22;
    ctx.fillStyle = '#f2c79a';
    ctx.beginPath(); ctx.arc(hx, 21, 6, 0, Math.PI * 2); ctx.fill();
    drawMohawk(hx, 21, 6, 0.8);
  }
  if (lives > 3) {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(`×${lives}`, W - 58, 21);
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
