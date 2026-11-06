'use strict';

// ============================================================
// 設定
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;   // 480
const H = canvas.height;  // 640

const FONT_EN = '"Press Start 2P", monospace';
const FONT_JA = '"DotGothic16", "Press Start 2P", monospace';

const PLAYER_Y = 590;           // 自機の y 座標(通常時)
const PLAYER_SPEED = 260;       // 自機の移動速度(px/秒)
const DUAL_GAP = 13;            // ダブル時、中心から各機までの距離
const SHOT_SPEED = 600;         // 自機の弾の速さ
const SHOT_COOLDOWN = 0.16;     // 連射の間隔(秒)
const ENEMY_SHOT_SPEED = 230;   // 敵の弾の速さ
const BEAM_Y = 330;             // 女王ムシがビームを出す高さ
const BEAM_LEN = 250;           // ビームの長さ
const FIRST_EXTEND = 20000;     // 最初の 1UP の得点
const EVERY_EXTEND = 70000;     // 以降はこの点数ごとに 1UP

// 敵の得点 [編隊にいるとき, 突撃中]
const POINTS = { bee: [50, 100], moth: [80, 160], queen: [150, 400], traitor: [500, 1000] };

// localStorage のキー
const KEY_HIGH = 'hoshimushi.highScore';
const KEY_SOUND = 'hoshimushi.sound';

// ------------------------------------------------------------
// ドット絵。1文字が1ドットで、'.' は透明。文字は PALETTE の色になる
// ------------------------------------------------------------
const PALETTE = {
  w: '#f4f4f4', r: '#ff3a3a', b: '#3a7bff', y: '#ffd23a',
  g: '#3adf6a', p: '#b45aff', c: '#3cf0ff', o: '#ff9a2a', k: '#101018',
};
const GRID_PLAYER = [
  '......w......',
  '......w......',
  '.....www.....',
  '.....wrw.....',
  '..r..www..r..',
  '..r.wwwww.r..',
  '..wwwbwbwww..',
  '.wwwwwwwwwww.',
  'ww.wwwwwww.ww',
  'w..rw.w.wr..w',
  'w....w.w....w',
];
// ブンブン(ハチ型のザコ)
const GRID_BEE = [
  '..b.......b..',
  '...b.....b...',
  '....yyyyy....',
  '...ykyyyky...',
  '.bbyyyyyyybb.',
  'bbb.yrrry.bbb',
  'bb..yyyyy..bb',
  'b...yrrry...b',
  '.....yyy.....',
  '......y......',
];
// ヒラリ(羽の大きいガ型)
const GRID_MOTH = [
  '...c.....c...',
  '....c...c....',
  '.ww.rrrrr.ww.',
  'wwwwrkrkrwwww',
  'wwwrrrrrrrwww',
  '.wwwrrrrrwww.',
  '..w.rwwwr.w..',
  '....rrrrr....',
  '.....rrr.....',
];
// 女王ムシ(2発で倒れる。捕獲ビームを出す)
const GRID_QUEEN = [
  '..o.......o..',
  '...o.....o...',
  '...ggggggg...',
  '..ggkgggkgg..',
  'oogggggggggoo',
  'oogggooogggoo',
  'o.ggggggggg.o',
  'o..gg.g.gg..o',
  '...g..g..g...',
];
const SPRITE_SCALE = 2;  // ドット1粒の大きさ(px)

// 色違いも含めたスプライトの定義
const SPRITE_DEFS = {
  player: { grid: GRID_PLAYER },
  captive: { grid: GRID_PLAYER, remap: { w: 'r', r: 'y' } },  // 捕まった自機(赤)
  bee: { grid: GRID_BEE },
  moth: { grid: GRID_MOTH },
  queen: { grid: GRID_QUEEN },
  queen2: { grid: GRID_QUEEN, remap: { g: 'p' } },           // 1発当たった女王(紫)
  bee_hit: { grid: GRID_BEE, remap: { y: 'w', b: 'w', r: 'w' } },
};
SPRITE_DEFS.traitor = SPRITE_DEFS.captive;  // 敵にされた自機

// チャレンジステージの飛行ルート(始点と3次ベジェ曲線の列)。画面外から入って画面外へ抜ける
const CH_PATTERNS = [
  { start: [-20, 160], segs: [[[160, 120], [300, 360], [200, 420]], [[100, 470], [60, 300], [200, 240]], [[320, 180], [420, 140], [W + 40, 120]]] },
  { start: [140, -20], segs: [[[140, 200], [340, 260], [340, 360]], [[340, 460], [160, 460], [160, 360]], [[160, 250], [300, 160], [W + 40, -20]]] },
  { start: [-20, 460], segs: [[[150, 460], [240, 300], [240, 200]], [[240, 90], [120, 80], [120, 180]], [[120, 300], [360, 320], [W + 40, 300]]] },
  { start: [240, -20], segs: [[[240, 150], [100, 250], [100, 330]], [[100, 420], [380, 420], [380, 330]], [[380, 250], [240, 180], [240, -40]]] },
];

// 通常ステージの入場ルート(左側のみ定義。右側は左右反転して使う)
const ENTRY_LEFT = {
  top: { start: [200, -20], segs: [[[200, 140], [40, 220], [70, 330]], [[100, 450], [260, 440], [230, 330]]] },
  side: { start: [-20, 540], segs: [[[140, 540], [230, 450], [220, 360]], [[210, 260], [110, 250], [110, 330]]] },
};

// 通常ステージの入場ウェーブ。members は [行, 列]。行0=女王、1-2=ヒラリ、3-4=ブンブン
const WAVES = [
  { entry: 'top', mirror: true, members: [[1, 3], [3, 3], [1, 4], [3, 4], [1, 5], [3, 5], [1, 6], [3, 6]] },
  { entry: 'side', mirror: false, members: [[0, 3], [2, 3], [0, 4], [2, 4], [0, 5], [2, 5], [0, 6], [2, 6]] },
  { entry: 'side', mirror: true, members: [[1, 1], [2, 1], [1, 2], [2, 2], [1, 7], [2, 7], [1, 8], [2, 8]] },
  { entry: 'top', mirror: false, members: [[3, 0], [3, 9], [3, 1], [3, 8], [3, 2], [3, 7], [4, 4], [4, 5]] },
  { entry: 'top', mirror: true, members: [[4, 0], [4, 9], [4, 1], [4, 8], [4, 2], [4, 7], [4, 3], [4, 6]] },
];

// ============================================================
// 状態
// ============================================================
let state = 'ready';            // 'ready' | 'playing' | 'paused' | 'gameover'
let soundOn = loadStorage(KEY_SOUND, 'on') !== 'off';

const game = {
  score: 0,
  hi: Number(loadStorage(KEY_HIGH, '0')) || 0,
  lives: 2,           // 残機(画面に出ている自機は含まない)
  stage: 0,
  challenge: false,   // チャレンジステージ中か
  phase: 'intro',     // 'intro' | 'enter' | 'battle' | 'clear' | 'result'
  phaseT: 0,          // 今のフェーズに入ってからの秒数
  queue: [],          // これから入場する敵の予定 { t, ... }
  enterClock: 0,
  attackT: 0,         // 次の突撃までの秒数
  fireCalm: 0,        // 突撃中の女王を倒すと、しばらく敵が撃ってこない
  beamer: null,       // ビームを出しに行っている女王
  nextExtend: FIRST_EXTEND,
  overT: 0,           // ゲームオーバー画面へ移るまでの秒数
  fired: 0,           // 発射数(命中率の計算用)
  hits: 0,            // 命中数
  chHits: 0,          // チャレンジステージの撃墜数
  chWaves: [],        // チャレンジステージのウェーブごとの撃墜数
  chBonus: 0,
  message: '',
  messageT: 0,
  newRecord: false,
};

const player = {
  x: W / 2, y: PLAYER_Y,
  alive: true,        // 操作できる状態か
  dual: false,        // 2機合体中か
  invuln: 0,          // 無敵の残り秒数
  respawnT: 0,        // 復活までの秒数
  captured: null,     // 吸い上げ中なら { q: 女王 }
  spin: 0,            // 吸い上げ中の回転角
  cool: 0,            // 次に撃てるまでの秒数
};

let enemies = [];
let shots = [];       // 自機の弾
let eShots = [];      // 敵の弾
let particles = [];
let popups = [];      // 得点の表示
let rescue = null;    // 救出されて降りてくる自機
let formT = 0;        // 編隊の揺れに使う時間
let breathK = 0;      // 0=左右に揺れる、1=伸び縮みする(全員そろったら切り替える)

// 背景の星
const stars = Array.from({ length: 90 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  speed: 20 + Math.random() * 80,
  color: ['#ffffff', '#ff7070', '#70a0ff', '#ffe070', '#70ff90'][Math.floor(Math.random() * 5)],
  phase: Math.random() * Math.PI * 2,
}));

// 入力
const keys = { left: false, right: false, fire: false };
const pointer = { active: false, x: W / 2 };

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

// ============================================================
// 効果音(Web Audio API で合成)
// ============================================================
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// 単音を鳴らす。endFreq を渡すと音程がその高さへ滑る
function tone(freq, endFreq, dur, type, vol, delay = 0) {
  const t = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// ノイズ(爆発音)
function noise(dur, vol, delay = 0) {
  const len = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  gain.gain.value = vol;
  src.connect(gain).connect(audioCtx.destination);
  src.start(audioCtx.currentTime + delay);
}

function playSound(name) {
  if (!soundOn || !ensureAudio()) return;
  const seq = (notes, len, type, vol) =>
    notes.forEach((f, i) => tone(f, null, len, type, vol, i * len));
  switch (name) {
    case 'shoot': tone(1400, 300, 0.08, 'square', 0.03); break;
    case 'hit': tone(500, 80, 0.12, 'square', 0.05); noise(0.12, 0.08); break;
    case 'queenHit': tone(900, 600, 0.08, 'triangle', 0.08); break;
    case 'boom': noise(0.7, 0.2); tone(200, 40, 0.5, 'sawtooth', 0.06); break;
    case 'beam':
      for (let i = 0; i < 6; i++) tone(300 + i * 30, 700 + i * 30, 0.5, 'sine', 0.04, i * 0.5);
      break;
    case 'capture': tone(900, 150, 1.4, 'sawtooth', 0.05); break;
    case 'rescue': seq([523, 659, 784, 1047, 784, 1047], 0.1, 'square', 0.05); break;
    case 'stage': seq([392, 523, 659, 784, 659, 784, 1047], 0.13, 'square', 0.04); break;
    case 'extend': seq([880, 1175, 880, 1175], 0.1, 'square', 0.05); break;
    case 'perfect': seq([523, 659, 784, 1047, 1319, 1568], 0.12, 'square', 0.05); break;
    case 'gameover': seq([392, 349, 330, 262], 0.3, 'triangle', 0.08); break;
  }
}

function setSound(on) {
  soundOn = on;
  saveStorage(KEY_SOUND, on ? 'on' : 'off');
  document.getElementById('sound-toggle').textContent = on ? '音: ON' : '音: OFF';
}

// ============================================================
// スプライト(起動時にドット絵を小さなキャンバスへ描いておく)
// ============================================================
const sprites = {};
for (const [name, def] of Object.entries(SPRITE_DEFS)) {
  const grid = def.grid;
  const c = document.createElement('canvas');
  c.width = grid[0].length * SPRITE_SCALE;
  c.height = grid.length * SPRITE_SCALE;
  const g = c.getContext('2d');
  grid.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const key = (def.remap && def.remap[ch]) || ch;
      g.fillStyle = PALETTE[key];
      g.fillRect(x * SPRITE_SCALE, y * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
    });
  });
  sprites[name] = c;
}

// 回転・拡大してスプライトを描く(x, y は中心)
function drawSprite(name, x, y, angle = 0, sx = 1, sy = 1) {
  const img = sprites[name];
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (angle) ctx.rotate(angle);
  ctx.scale(sx, sy);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

// ============================================================
// 便利関数
// ============================================================
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 角度 a を目標 b へ少し近づける(-π〜π の範囲で最短の向きに回る)
function approachAngle(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * Math.min(1, k);
}

// 始点と3次ベジェ曲線の列から、たどる点の配列を作る
function buildPath(start, segs, dx = 0, mirror = false) {
  const tx = (x) => (mirror ? W - x : x) + dx;
  const pts = [];
  let p0 = [tx(start[0]), start[1]];
  for (const [c1r, c2r, p3r] of segs) {
    const c1 = [tx(c1r[0]), c1r[1]];
    const c2 = [tx(c2r[0]), c2r[1]];
    const p3 = [tx(p3r[0]), p3r[1]];
    for (let i = 1; i <= 20; i++) {
      const t = i / 20, u = 1 - t;
      pts.push({
        x: u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
        y: u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
      });
    }
    p0 = p3;
  }
  return pts;
}

// 敵を path に沿って動かす。最後まで進んだら true
function followPath(e, dt) {
  let move = e.speed * dt;
  while (move > 0 && e.pi < e.path.length) {
    const p = e.path[e.pi];
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) e.angle = Math.atan2(dy, dx) + Math.PI / 2;  // 進行方向を向く
    if (d <= move) {
      e.x = p.x; e.y = p.y;
      move -= d;
      e.pi++;
    } else {
      e.x += (dx / d) * move;
      e.y += (dy / d) * move;
      move = 0;
    }
  }
  return e.pi >= e.path.length;
}

// 編隊での定位置。入場中は左右に揺れ、全員そろうと伸び縮みする
function slotPos(row, col) {
  const s = Math.sin(formT * 1.6) * 0.07 * breathK;
  const sway = Math.sin(formT * 1.2) * 28 * (1 - breathK);
  return {
    x: W / 2 + (col - 4.5) * 34 * (1 + s) + sway,
    y: 90 + row * 32 * (1 + s),
  };
}

function makeEnemy(type, row, col, x, y) {
  return {
    type, row, col, x, y,
    hp: type === 'queen' ? 2 : 1,
    state: 'home',      // 'enter' | 'home' | 'formation' | 'dive' | 'beamDive' | 'beam'
    angle: 0,
    path: null, pi: 0,
    speed: 230,
    captive: false,     // 捕まえた自機を連れているか(女王のみ)
    escorts: null,      // 一緒に突撃しているお供(女王のみ)
    fireLeft: 0,        // この突撃で撃てる弾の数
    flash: 0,
    beamT: 0,
    dead: false,
    challenge: false,
    wave: 0,
  };
}

const isAttacking = (e) => e.state === 'dive' || e.state === 'beamDive' || e.state === 'beam';
const playerXs = () => (player.dual ? [player.x - DUAL_GAP, player.x + DUAL_GAP] : [player.x]);

function showMessage(text, sec = 2) {
  game.message = text;
  game.messageT = sec;
}

function addPopup(x, y, text) {
  popups.push({ x, y, text, t: 1 });
}

function explode(x, y, color, n = 16) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 160;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.4 + Math.random() * 0.4,
      color: Math.random() < 0.4 ? '#ffffff' : color,
    });
  }
}

function addScore(n) {
  game.score += n;
  if (game.score >= game.nextExtend) {
    game.lives++;
    game.nextExtend += EVERY_EXTEND;
    playSound('extend');
    showMessage('1UP!');
  }
  if (game.score > game.hi) {
    game.hi = game.score;
    game.newRecord = true;
  }
}

// ============================================================
// 初期化・状態遷移
// ============================================================
function launch() {
  ensureAudio();
  Object.assign(game, {
    score: 0, lives: 2, stage: 0, nextExtend: FIRST_EXTEND, overT: 0,
    fired: 0, hits: 0, beamer: null, fireCalm: 0, newRecord: false, messageT: 0,
  });
  Object.assign(player, {
    x: W / 2, y: PLAYER_Y, alive: true, dual: false, invuln: 0,
    respawnT: 0, captured: null, spin: 0, cool: 0,
  });
  shots = []; eShots = []; particles = []; popups = []; rescue = null;
  state = 'playing';
  startStage(1);
}

function setPhase(p) {
  game.phase = p;
  game.phaseT = 0;
}

function startStage(n) {
  game.stage = n;
  // 3面目から4面ごとにチャレンジステージ(3, 7, 11, ...)
  game.challenge = n % 4 === 3;
  enemies = [];
  eShots = [];
  game.beamer = null;
  game.queue = [];
  game.enterClock = 0;
  breathK = 0;
  formT = 0;

  if (game.challenge) {
    game.chHits = 0;
    game.chWaves = Array.from({ length: 5 }, () => ({ killed: 0 }));
    const round = Math.floor(n / 4);
    const types = ['bee', 'moth', 'bee', 'moth', 'bee'];
    for (let w = 0; w < 5; w++) {
      const pat = CH_PATTERNS[(w + round) % CH_PATTERNS.length];
      for (let j = 0; j < 8; j++) {
        // 2組目には女王が混ざる
        let type = types[(w + round) % types.length];
        if (w === 1) type = j % 4 < 2 ? 'queen' : 'moth';
        game.queue.push({
          t: w * 3.4 + Math.floor(j / 2) * 0.22,
          type, wave: w,
          path: buildPath(pat.start, pat.segs, 0, j % 2 === 1),  // 奇数番は左右反転のルート
        });
      }
    }
  } else {
    WAVES.forEach((wave, w) => {
      const def = ENTRY_LEFT[wave.entry];
      wave.members.forEach(([row, col], j) => {
        // 2機ずつ並んで入ってくるよう、奇数番は横にずらす
        const dx = (j % 2) * 24 * (wave.mirror ? -1 : 1);
        game.queue.push({
          t: w * 2.6 + Math.floor(j / 2) * 0.2,
          type: row === 0 ? 'queen' : row <= 2 ? 'moth' : 'bee',
          row, col,
          path: buildPath(def.start, def.segs, dx, wave.mirror),
        });
      });
    });
  }
  setPhase('intro');
  playSound('stage');
}

function togglePause() {
  if (state === 'playing') state = 'paused';
  else if (state === 'paused') state = 'playing';
}

// 自機を失ったとき(撃墜・捕獲の両方)
function onPlayerLost() {
  if (game.lives <= 0) {
    game.overT = 2.5;
  } else {
    game.lives--;
    player.respawnT = 2.5;
  }
}

function gameOver() {
  state = 'gameover';
  game.overAt = performance.now();
  if (game.newRecord) saveStorage(KEY_HIGH, game.hi);
  playSound('gameover');
}

// ============================================================
// 入力
// ============================================================
function canStart() {
  // ゲームオーバー直後の誤操作で、すぐ始まらないようにする
  return state === 'ready' || (state === 'gameover' && performance.now() - game.overAt > 1000);
}

document.addEventListener('keydown', (e) => {
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', ' ', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true;
  if (k === ' ') keys.fire = true;
  if ((k === ' ' || k === 'Enter') && canStart()) launch();
  if (k === 'p' || k === 'P') togglePause();
  if (k === 'm' || k === 'M') setSound(!soundOn);
});
document.addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
  if (k === ' ') keys.fire = false;
});

// タッチ・マウス: 押している間、指の位置へ移動しながら連射する
function canvasX(e) {
  const r = canvas.getBoundingClientRect();
  return ((e.clientX - r.left) / r.width) * W;
}
canvas.addEventListener('pointerdown', (e) => {
  if (canStart()) { launch(); return; }
  if (state === 'paused') { togglePause(); return; }
  pointer.active = true;
  pointer.x = canvasX(e);
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (pointer.active) pointer.x = canvasX(e);
});
const endPointer = () => { pointer.active = false; };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

document.getElementById('sound-toggle').addEventListener('click', (e) => {
  setSound(!soundOn);
  e.currentTarget.blur();  // スペースキーでボタンが押されないようにする
});
setSound(soundOn);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') state = 'paused';
});

// ============================================================
// 敵の行動
// ============================================================

// 突撃のルート: その場で小さく宙返りしてから、自機の方へ急降下して画面下へ抜ける
function divePath(e, tx) {
  const dir = e.x < W / 2 ? -1 : 1;  // 外側へ向かって宙返りする
  return buildPath([e.x, e.y], [
    [[e.x, e.y - 40], [e.x + dir * 60, e.y - 40], [e.x + dir * 60, e.y + 10]],
    [[e.x + dir * 60, e.y + 150], [tx - dir * 120, 330], [tx, 430]],
    [[tx + dir * 100, 530], [tx + dir * 40, 600], [tx - dir * 20, H + 40]],
  ]);
}

function startDive(e) {
  e.state = 'dive';
  e.path = divePath(e, player.x);
  e.pi = 0;
  e.speed = 200 + Math.min(game.stage, 15) * 8 + (e.type === 'moth' ? 20 : 0);
  // 面が進むほど弾を多く撃つ
  e.fireLeft = Math.random() < 0.5 + game.stage * 0.05 ? 1 + (game.stage >= 5 ? 1 : 0) : 0;
}

// 女王の突撃。近くのヒラリを最大2機お供に連れていく
function startQueenDive(q) {
  startDive(q);
  q.speed = 210 + Math.min(game.stage, 15) * 8;
  const cands = enemies
    .filter((e) => !e.dead && e.type === 'moth' && e.row === 1 && e.state === 'formation' && Math.abs(e.col - q.col) <= 2)
    .sort((a, b) => Math.abs(a.col - q.col) - Math.abs(b.col - q.col))
    .slice(0, 2);
  q.escorts = cands;
  cands.forEach((e) => {
    const off = e.col < q.col ? -26 : 26;
    e.state = 'dive';
    e.path = q.path.map((p) => ({ x: p.x + off, y: p.y + 14 }));
    e.pi = 0;
    e.speed = q.speed;
    e.fireLeft = 1;
  });
}

// 捕獲ビームを出すための突撃
function startBeamDive(q) {
  const tx = clamp(player.x, 50, W - 50);
  const dir = q.x < W / 2 ? -1 : 1;
  q.state = 'beamDive';
  q.path = buildPath([q.x, q.y], [
    [[q.x, q.y - 40], [q.x + dir * 60, q.y - 40], [q.x + dir * 60, q.y + 10]],
    [[q.x + dir * 60, q.y + 120], [tx, 200], [tx, BEAM_Y]],
  ]);
  q.pi = 0;
  q.speed = 220;
  q.escorts = null;
  game.beamer = q;
}

// ビームを出せる条件: 自機が1機だけで、他に捕まっている自機がいない
function canBeam() {
  return player.alive && !player.dual && !player.captured && !game.beamer && !rescue &&
    !enemies.some((e) => e.captive || e.type === 'traitor');
}

function launchAttack() {
  if (!player.alive) return;  // 自機がいない間は新しく突撃しない
  const divers = enemies.filter(isAttacking).length;
  const maxDivers = Math.min(2 + Math.floor(game.stage / 2), 6);
  if (divers >= maxDivers) return;
  const inForm = enemies.filter((e) => !e.dead && e.state === 'formation');
  if (!inForm.length) return;

  const queens = inForm.filter((e) => e.type === 'queen');
  if (queens.length && Math.random() < 0.3) {
    const q = pick(queens);
    if (!q.captive && canBeam() && Math.random() < 0.5) startBeamDive(q);
    else startQueenDive(q);
  } else {
    const others = inForm.filter((e) => e.type !== 'queen');
    startDive(others.length ? pick(others) : pick(inForm));
  }
}

function fireEnemyShot(e) {
  // 弾が自機の高さに届くまでの時間から、横方向の速さを決める(狙い撃ち)
  const time = Math.max(0.3, (PLAYER_Y - e.y) / ENEMY_SHOT_SPEED);
  const vx = clamp((player.x - e.x) / time, -110, 110);
  eShots.push({ x: e.x, y: e.y + 10, vx, vy: ENEMY_SHOT_SPEED, dead: false });
}

function maybeFire(e, dt) {
  if (e.challenge || !player.alive || game.fireCalm > 0 || e.fireLeft <= 0) return;
  if (e.y > 160 && e.y < 420 && Math.random() < dt * 1.8) {
    e.fireLeft--;
    fireEnemyShot(e);
  }
}

// ビームの長さ(伸びる→保つ→縮む)
function beamLen(t) {
  if (t < 0.8) return (t / 0.8) * BEAM_LEN;
  if (t < 3.2) return BEAM_LEN;
  if (t < 4) return ((4 - t) / 0.8) * BEAM_LEN;
  return 0;
}

function updateBeam(e, dt) {
  e.beamT += dt;
  const capturing = player.captured && player.captured.q === e;
  if (capturing) {
    // 自機を回転させながら吸い上げる
    e.beamT = Math.min(e.beamT, 2.5);
    player.y -= 80 * dt;
    player.spin += 10 * dt;
    player.x += (e.x - player.x) * Math.min(1, dt * 3);
    if (player.y <= e.y + 30) {
      e.captive = true;
      player.captured = null;
      player.y = PLAYER_Y;
      player.spin = 0;
      e.beamT = 3.2;  // ビームを縮め始める
      showMessage('ファイターが捕まった!');
      onPlayerLost();
    }
  } else if (!player.captured && e.beamT > 0.8 && e.beamT < 3.2 && player.alive &&
             !player.dual && player.invuln <= 0 && Math.abs(player.x - e.x) < 30) {
    // ビームに触れた
    player.captured = { q: e };
    player.alive = false;
    playSound('capture');
  }
  if (e.beamT >= 4 && !capturing) {
    e.state = 'home';
    if (game.beamer === e) game.beamer = null;
  }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    switch (e.state) {
      case 'enter':
        if (followPath(e, dt)) {
          if (e.challenge) e.dead = true;  // チャレンジの敵は画面外へ逃げたら終わり
          else e.state = 'home';
        }
        break;
      case 'home': {
        // 定位置へまっすぐ戻る
        const s = slotPos(e.row, e.col);
        const dx = s.x - e.x, dy = s.y - e.y;
        const d = Math.hypot(dx, dy);
        const step = e.speed * dt;
        if (d <= step) {
          e.x = s.x; e.y = s.y;
          e.state = 'formation';
        } else {
          e.x += (dx / d) * step;
          e.y += (dy / d) * step;
          e.angle = Math.atan2(dy, dx) + Math.PI / 2;
        }
        break;
      }
      case 'formation': {
        const s = slotPos(e.row, e.col);
        e.x = s.x; e.y = s.y;
        e.angle = approachAngle(e.angle, 0, dt * 8);
        break;
      }
      case 'dive':
        if (followPath(e, dt)) {
          // 画面下へ抜けたら、上から定位置へ戻る
          e.x = slotPos(e.row, e.col).x;
          e.y = -30;
          e.state = 'home';
        } else {
          maybeFire(e, dt);
        }
        break;
      case 'beamDive':
        if (followPath(e, dt)) {
          e.state = 'beam';
          e.beamT = 0;
          e.angle = 0;
          playSound('beam');
        }
        break;
      case 'beam':
        updateBeam(e, dt);
        break;
    }
  }
  enemies = enemies.filter((e) => !e.dead);
}

// ============================================================
// 撃墜・被弾
// ============================================================
function hitEnemy(e) {
  if (e.hp > 1) {
    e.hp--;
    e.flash = 0.1;
    playSound('queenHit');
    return;
  }
  killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  const attacking = isAttacking(e);
  let pts;

  if (e.challenge) {
    pts = 100;
    game.chHits++;
    const w = game.chWaves[e.wave];
    w.killed++;
    if (w.killed === 8) {  // 1組まるごと撃墜でボーナス
      addScore(1000);
      addPopup(e.x, e.y - 14, '1000');
    }
  } else {
    pts = POINTS[e.type][attacking ? 1 : 0];
    // お供を残したまま突撃中の女王を倒すと高得点
    if (e.type === 'queen' && attacking && e.escorts) {
      const alive = e.escorts.filter((x) => !x.dead && x.state === 'dive').length;
      pts = [400, 800, 1600][alive];
    }
    if (pts >= 400) addPopup(e.x, e.y, String(pts));
  }

  if (e.captive) {
    // 突撃中なら救出成功、編隊中なら自機が敵になってしまう
    if (attacking) startRescue(e.x, e.y - 30);
    else spawnTraitor(e);
    e.captive = false;
  }
  if (e.type === 'queen' && attacking) game.fireCalm = 2.5;
  if (game.beamer === e) game.beamer = null;
  if (player.captured && player.captured.q === e) {
    // 吸い上げ中に女王を倒したら、自機は元に戻る
    player.captured = null;
    player.alive = true;
    player.y = PLAYER_Y;
    player.spin = 0;
    player.invuln = 1;
  }

  addScore(pts);
  const color = { bee: '#ffd23a', moth: '#ff3a3a', queen: '#3adf6a', traitor: '#ff3a3a' }[e.type];
  explode(e.x, e.y, color);
  playSound('hit');
}

function startRescue(x, y) {
  rescue = { x, y, spin: 0 };
  playSound('rescue');
  showMessage('ファイター救出!');
}

// 編隊中の女王を倒すと、捕まっていた自機が敵になって女王の真上に並ぶ
function spawnTraitor(q) {
  const t = makeEnemy('traitor', -1, q.col, q.x, q.y - 30);
  enemies.push(t);
}

function hitPlayer(i) {
  if (player.invuln > 0 || !player.alive) return;
  const xs = playerXs();
  explode(xs[i], player.y, '#ffffff', 26);
  playSound('boom');
  if (player.dual) {
    // ダブル中は片方を失うだけ
    player.dual = false;
    player.x = xs[1 - i];
    player.invuln = 0.4;
    return;
  }
  player.alive = false;
  onPlayerLost();
}

function checkCollisions() {
  // 自機の弾 → 敵・捕まった自機
  for (const s of shots) {
    if (s.dead) continue;
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.captive && Math.abs(s.x - e.x) < 12 && Math.abs(s.y - (e.y - 30)) < 12) {
        // 捕まった自機を撃ってしまった(救出失敗)
        s.dead = true;
        game.hits++;
        e.captive = false;
        explode(e.x, e.y - 30, '#ff3a3a');
        addScore(1000);
        addPopup(e.x, e.y - 30, '1000');
        playSound('boom');
        break;
      }
      if (Math.abs(s.x - e.x) < 13 && Math.abs(s.y - e.y) < 13) {
        s.dead = true;
        game.hits++;
        hitEnemy(e);
        break;
      }
    }
  }
  // 敵の弾 → 自機
  for (const b of eShots) {
    if (b.dead || !player.alive) continue;
    const xs = playerXs();
    for (let i = 0; i < xs.length; i++) {
      if (Math.abs(b.x - xs[i]) < 9 && Math.abs(b.y - player.y) < 11) {
        b.dead = true;
        hitPlayer(i);
        break;
      }
    }
  }
  // 突撃してきた敵 → 自機(体当たり)
  for (const e of enemies) {
    if (e.dead || e.challenge || e.state === 'formation' || !player.alive) continue;
    const xs = playerXs();
    for (let i = 0; i < xs.length; i++) {
      if (Math.abs(e.x - xs[i]) < 20 && Math.abs(e.y - player.y) < 20) {
        if (player.invuln > 0) break;
        killEnemy(e);
        hitPlayer(i);
        break;
      }
    }
  }
  shots = shots.filter((s) => !s.dead);
  eShots = eShots.filter((b) => !b.dead);
}

// ============================================================
// 更新
// ============================================================
function updatePhase(dt) {
  game.phaseT += dt;
  switch (game.phase) {
    case 'intro':
      if (game.phaseT > 2) setPhase('enter');
      break;
    case 'enter': {
      // 予定時刻になった敵を入場させる
      game.enterClock += dt;
      while (game.queue.length && game.queue[0].t <= game.enterClock) {
        const q = game.queue.shift();
        const e = makeEnemy(q.type, q.row ?? 0, q.col ?? 0, q.path[0].x, q.path[0].y);
        e.state = 'enter';
        e.path = q.path;
        e.pi = 0;
        e.speed = game.challenge ? 250 : 240;
        if (game.challenge) { e.challenge = true; e.wave = q.wave; }
        enemies.push(e);
      }
      if (game.queue.length) break;
      if (game.challenge) {
        if (!enemies.length) {
          // チャレンジステージ終了。パーフェクトなら特別ボーナス
          game.chBonus = game.chHits === 40 ? 10000 : game.chHits * 100;
          addScore(game.chBonus);
          playSound(game.chHits === 40 ? 'perfect' : 'stage');
          setPhase('result');
        }
      } else if (!enemies.length) {
        setPhase('clear');
      } else if (enemies.every((e) => e.state === 'formation')) {
        setPhase('battle');
        game.attackT = 1.5;
      }
      break;
    }
    case 'battle': {
      breathK = Math.min(1, breathK + dt);
      game.attackT -= dt;
      if (game.attackT <= 0) {
        launchAttack();
        // 面が進むほど、残りが少ないほど頻繁に突撃してくる
        const base = Math.max(0.6, 2.0 - game.stage * 0.1);
        game.attackT = enemies.length <= 8 ? base * 0.5 : base;
      }
      if (!enemies.length) setPhase('clear');
      break;
    }
    case 'clear':
      if (game.phaseT > 1.5 && !player.captured && !rescue) startStage(game.stage + 1);
      break;
    case 'result':
      if (game.phaseT > 4) startStage(game.stage + 1);
      break;
  }
}

function updatePlayer(dt) {
  player.invuln = Math.max(0, player.invuln - dt);
  player.cool = Math.max(0, player.cool - dt);

  if (player.alive) {
    const half = player.dual ? 16 + DUAL_GAP : 16;
    let move = 0;
    if (keys.left) move -= 1;
    if (keys.right) move += 1;
    if (pointer.active) {
      // 指の位置へ向かって動く
      const d = pointer.x - player.x;
      move = Math.abs(d) < 4 ? 0 : Math.sign(d) * Math.min(1.4, Math.abs(d) / 20);
    }
    player.x = clamp(player.x + move * PLAYER_SPEED * dt, half, W - half);

    // 発射(押しっぱなしで連射)。画面に出せる弾は1機あたり2発まで
    const maxShots = player.dual ? 4 : 2;
    if ((keys.fire || pointer.active) && player.cool <= 0 && shots.length < maxShots) {
      for (const x of playerXs()) shots.push({ x, y: player.y - 14, dead: false });
      game.fired += player.dual ? 2 : 1;
      player.cool = SHOT_COOLDOWN;
      playSound('shoot');
    }
  } else if (!player.captured && game.overT <= 0) {
    // 復活待ち。ビーム中・救出中の敵がいなくなるまで待つ
    player.respawnT -= dt;
    if (player.respawnT <= 0 && !game.beamer && !rescue) {
      player.alive = true;
      player.x = W / 2;
      player.y = PLAYER_Y;
      player.invuln = 2;
      showMessage('READY', 1.2);
    }
  }
}

function updateRescue(dt) {
  if (!rescue) return;
  rescue.spin += 10 * dt;
  const tx = player.alive ? player.x + DUAL_GAP * 2 : W / 2;
  rescue.x += (tx - rescue.x) * Math.min(1, dt * 2.5);
  rescue.y += 150 * dt;
  if (rescue.y < PLAYER_Y) return;

  if (player.alive) {
    if (!player.dual) {
      // 合体してダブルファイターになる
      player.dual = true;
      player.x = clamp(player.x + DUAL_GAP, 16 + DUAL_GAP, W - 16 - DUAL_GAP);
    } else {
      addScore(1000);
    }
  } else if (!player.captured) {
    // 自機がいないときは、救出した機体がそのまま自機になる
    if (game.overT > 0) game.overT = 0;
    else game.lives++;  // 復活のために減らした残機を戻す
    player.alive = true;
    player.respawnT = 0;
    player.x = clamp(rescue.x, 16, W - 16);
    player.invuln = 1;
  }
  rescue = null;
}

function updateShots(dt) {
  for (const s of shots) {
    s.y -= SHOT_SPEED * dt;
    if (s.y < -10) s.dead = true;
  }
  for (const b of eShots) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y > H + 10) b.dead = true;
  }
}

function updateEffects(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) {
    p.t -= dt;
    p.y -= 20 * dt;
  }
  popups = popups.filter((p) => p.t > 0);
  game.messageT = Math.max(0, game.messageT - dt);
}

function update(dt) {
  // 星はどの画面でも流れる
  for (const s of stars) {
    s.y += s.speed * dt;
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
  }
  if (state !== 'playing') return;

  formT += dt;
  game.fireCalm -= dt;
  updatePhase(dt);
  updatePlayer(dt);
  updateEnemies(dt);
  updateShots(dt);
  updateRescue(dt);
  checkCollisions();
  updateEffects(dt);

  if (game.overT > 0) {
    game.overT -= dt;
    if (game.overT <= 0) gameOver();
  }
}

// ============================================================
// 描画
// ============================================================
function text(str, x, y, { size = 12, color = '#fff', align = 'center', ja = false } = {}) {
  ctx.font = `${size}px ${ja ? FONT_JA : FONT_EN}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function drawStars() {
  const t = performance.now() / 1000;
  for (const s of stars) {
    // ちらちら瞬かせる
    if (Math.sin(t * 3 + s.phase) < -0.3) continue;
    ctx.fillStyle = s.color;
    ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
  }
}

function drawBeam(e) {
  const len = beamLen(e.beamT);
  if (len <= 0) return;
  const top = e.y + 14;
  const colors = ['#3cf0ff', '#3a7bff', '#ff3cc8'];
  ctx.save();
  ctx.globalAlpha = 0.6;
  for (let i = 0; i * 10 < len; i++) {
    // 下へ行くほど広がる帯を重ねて、しま模様のビームにする
    const half = 8 + (i * 10 / BEAM_LEN) * 34;
    ctx.fillStyle = colors[(i + Math.floor(formT * 12)) % 3];
    ctx.fillRect(e.x - half, top + i * 10, half * 2, 6);
  }
  ctx.restore();
}

function drawEnemy(e) {
  if (e.state === 'beam') drawBeam(e);
  // 羽ばたき: 一定間隔で横幅を少し縮める
  const flap = Math.floor(formT * 4 + e.col) % 2 ? 0.86 : 1;
  let name = e.type;
  if (e.type === 'queen' && e.hp === 1) name = 'queen2';
  if (e.flash > 0) name = 'bee_hit';
  drawSprite(name, e.x, e.y, e.angle, e.type === 'traitor' ? 1 : flap);
  if (e.captive) {
    // 捕まった自機は女王の上にくっついている
    const a = e.angle;
    drawSprite('captive', e.x + Math.sin(a) * 30, e.y - Math.cos(a) * 30, a);
  }
}

function drawPlayer() {
  if (player.captured) {
    drawSprite('player', player.x, player.y, player.spin);
    return;
  }
  if (!player.alive) return;
  // 無敵中は点滅
  if (player.invuln > 0 && Math.floor(player.invuln * 10) % 2) return;
  for (const x of playerXs()) drawSprite('player', x, player.y);
}

function drawHud() {
  text('1UP', 20, 14, { size: 10, color: '#ff3a3a', align: 'left' });
  text(String(game.score).padStart(6, '0'), 20, 30, { size: 12, align: 'left' });
  text('HI-SCORE', W / 2, 14, { size: 10, color: '#ff3a3a' });
  text(String(game.hi).padStart(6, '0'), W / 2, 30, { size: 12 });
  if (state !== 'ready') {
    text('STAGE', W - 20, 14, { size: 10, color: '#3cf0ff', align: 'right' });
    text(String(game.stage), W - 20, 30, { size: 12, align: 'right' });
    // 残機
    for (let i = 0; i < Math.min(game.lives, 8); i++) {
      drawSprite('player', 18 + i * 22, H - 16, 0, 0.7, 0.7);
    }
  }
}

function drawReadyScreen() {
  ctx.save();
  ctx.fillStyle = '#ff3cc8';
  ctx.font = `44px ${FONT_JA}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ほしむし艦隊', W / 2 + 4, 154);
  ctx.fillStyle = '#ffd23a';
  ctx.fillText('ほしむし艦隊', W / 2, 150);
  ctx.restore();
  text('HOSHIMUSHI FLEET', W / 2, 200, { size: 10, color: '#3cf0ff' });

  // 得点表
  text('― スコア表 ―', W / 2, 260, { size: 18, ja: true, color: '#3adf6a' });
  const rows = [
    ['bee', 'ブンブン', '50 / 100'],
    ['moth', 'ヒラリ', '80 / 160'],
    ['queen', '女王ムシ', '150 / 400〜1600'],
  ];
  rows.forEach(([name, label, pts], i) => {
    const y = 300 + i * 40;
    drawSprite(name, 110, y);
    text(label, 140, y, { size: 16, ja: true, align: 'left' });
    text(pts, 260, y, { size: 9, align: 'left', color: '#ffd23a' });
  });
  text('女王ムシのビームで捕まった自機を', W / 2, 430, { size: 15, ja: true, color: '#a8a8c8' });
  text('突撃中に取り返すと2機合体!', W / 2, 452, { size: 15, ja: true, color: '#a8a8c8' });

  if (Math.floor(performance.now() / 500) % 2 === 0) {
    text('PUSH SPACE / TAP', W / 2, 520, { size: 14 });
  }
}

function drawOverlay() {
  if (state === 'playing' || state === 'paused') {
    if (game.phase === 'intro') {
      text(game.challenge ? 'CHALLENGING STAGE' : `STAGE ${game.stage}`, W / 2, 320, {
        size: 16, color: game.challenge ? '#ffd23a' : '#3cf0ff',
      });
    }
    if (game.phase === 'result') {
      text('撃墜数', W / 2 - 60, 290, { size: 20, ja: true, color: '#3cf0ff' });
      text(String(game.chHits), W / 2 + 70, 290, { size: 16 });
      if (game.chHits === 40) {
        if (Math.floor(game.phaseT * 4) % 2 === 0) text('PERFECT !!', W / 2, 340, { size: 20, color: '#ff3cc8' });
        text('SPECIAL BONUS 10000', W / 2, 380, { size: 12, color: '#ffd23a' });
      } else {
        text(`BONUS ${game.chBonus}`, W / 2, 350, { size: 14, color: '#ffd23a' });
      }
    }
    if (game.messageT > 0) {
      text(game.message, W / 2, 380, { size: 22, ja: true, color: '#ff3cc8' });
    }
  }
  if (state === 'paused') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, W, H);
    text('PAUSE', W / 2, 300, { size: 20 });
    text('P キーで再開', W / 2, 340, { size: 16, ja: true, color: '#a8a8c8' });
  }
  if (state === 'gameover') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, W, H);
    text('GAME OVER', W / 2, 200, { size: 24, color: '#ff3a3a' });
    // 命中率の結果発表
    const ratio = game.fired ? ((game.hits / game.fired) * 100).toFixed(1) : '0.0';
    text('― 結果 ―', W / 2, 270, { size: 20, ja: true, color: '#ffd23a' });
    text(`発射数   ${game.fired}`, W / 2, 310, { size: 18, ja: true });
    text(`命中数   ${game.hits}`, W / 2, 340, { size: 18, ja: true });
    text(`命中率   ${ratio} %`, W / 2, 370, { size: 18, ja: true });
    if (game.newRecord) text('NEW RECORD!', W / 2, 420, { size: 14, color: '#3adf6a' });
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      text('SPACE / TAP でリトライ', W / 2, 480, { size: 18, ja: true });
    }
  }
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawStars();

  if (state === 'ready') {
    drawHud();
    drawReadyScreen();
    return;
  }

  for (const e of enemies) if (!e.dead) drawEnemy(e);

  // 弾
  for (const s of shots) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s.x - 1, s.y - 6, 3, 12);
    ctx.fillStyle = '#ff3a3a';
    ctx.fillRect(s.x - 1, s.y - 6, 3, 3);
  }
  for (const b of eShots) {
    ctx.fillStyle = '#ffd23a';
    ctx.fillRect(b.x - 1.5, b.y - 5, 3, 10);
    ctx.fillStyle = '#ff3a3a';
    ctx.fillRect(b.x - 1.5, b.y + 2, 3, 3);
  }

  drawPlayer();
  if (rescue) drawSprite('player', rescue.x, rescue.y, rescue.spin);

  // 爆発の粒
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
  }
  for (const p of popups) {
    text(p.text, p.x, p.y, { size: 10, color: '#3cf0ff' });
  }

  drawHud();
  drawOverlay();
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
