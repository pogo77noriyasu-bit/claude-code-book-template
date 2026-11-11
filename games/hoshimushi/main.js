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
const BEAM_Y = 330;             // ボスパンク(女王)がビームを出す高さ
const BEAM_LEN = 250;           // ビームの長さ
// 難易度ごとの倍率。NORMAL はすべて 1(元のゲームバランスのまま)
//   speed: 敵の移動速度(入場・突撃・定位置へ戻る動き・チャレンジステージのすべて)
//   attackInterval: 突撃の間隔(大きいほど間があく)
//   maxDivers: 同時に突撃できる数の上限に足す数(結果は 1〜7 に収める)
//   fireChance: 突撃した敵が弾を持つ確率、maxFire: 1回の突撃で撃つ弾の最大数
//   fireRate: 弾を撃つ頻度、shotSpeed: 敵の弾の速さ
//   lives: 開始時の控えの残機(画面に出ている自機は含まない。EASY は合計5機)
const DIFFICULTIES = {
  easy: {
    label: 'EASY', color: '#3adf6a', desc: '敵がゆっくり・弾が少ない・残機5',
    speed: 0.8, attackInterval: 1.5, maxDivers: -1, fireChance: 0.6, maxFire: 1, fireRate: 0.6, shotSpeed: 0.85, lives: 4,
  },
  normal: {
    label: 'NORMAL', color: '#3cf0ff', desc: 'ふつうのバランス・残機3',
    speed: 1, attackInterval: 1, maxDivers: 0, fireChance: 1, maxFire: 2, fireRate: 1, shotSpeed: 1, lives: 2,
  },
  hard: {
    label: 'HARD', color: '#ff3a3a', desc: '敵が速い・突撃も弾も多い・残機3',
    speed: 1.15, attackInterval: 0.75, maxDivers: 1, fireChance: 1.3, maxFire: 2, fireRate: 1.3, shotSpeed: 1.1, lives: 2,
  },
};
const DIFF_ORDER = ['easy', 'normal', 'hard'];
// 難易度ボタン(タイトル画面・ゲームオーバー画面)の中心の x と大きさ
const DIFF_BTN_W = 116;
const DIFF_BTN_H = 30;
const diffBtnX = (i) => W / 2 + (i - 1) * 136;

const FIRST_EXTEND = 20000;     // 最初の 1UP の得点
const EVERY_EXTEND = 70000;     // 以降はこの点数ごとに 1UP

// 敵の得点 [編隊にいるとき, 突撃中]
const POINTS = {
  bee: [50, 100], moth: [80, 160], queen: [150, 400], traitor: [500, 1000],
  // 変身した3機編隊の敵と、チャレンジステージ専用の敵
  firefly: [160, 160], mantis: [160, 160], cicada: [160, 160],
  dragonfly: [100, 100], propeller: [100, 100],
};

// 変身(3機編隊)の種類。4〜6面はホタル、8〜10面はカマキリ、12〜14面はセミ、以降くり返し
// offsets は3機の並び方(縦一列・横一列など)、speedUp は突撃の速さの上乗せ
const MORPHS = [
  { type: 'firefly', bonus: 1000, speedUp: 0, offsets: [[0, 0], [0, -26], [0, -52]] },
  { type: 'mantis', bonus: 2000, speedUp: 20, offsets: [[-28, 0], [0, 0], [28, 0]] },
  { type: 'cicada', bonus: 3000, speedUp: 90, offsets: [[-34, 8], [0, 0], [34, 8]] },
];

// チャレンジステージに出る敵の種類(回ごとに順番に変わる)
const CH_TYPES = ['bee', 'moth', 'firefly', 'dragonfly', 'mantis', 'propeller', 'cicada'];

// ランキングの初期値(上位5位)
const DEFAULT_RANKING = [
  { name: 'HSM', score: 20000 },
  { name: 'MUS', score: 18000 },
  { name: 'KAN', score: 16000 },
  { name: 'TAI', score: 14000 },
  { name: 'BUG', score: 12000 },
];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ.!';  // 名前に使える文字

// localStorage のキー
const KEY_RANKING = 'hoshimushi.ranking';  // NORMAL のランキング(EASY / HARD は後ろに .easy / .hard を付ける)
const KEY_DIFFICULTY = 'hoshimushi.difficulty';  // 最後に選んだ難易度('easy' | 'normal' | 'hard')
const KEY_HIGH = 'hoshimushi.highScore';  // 旧版のハイスコア(ランキングへの引き継ぎにだけ使う)
const KEY_SOUND = 'hoshimushi.sound';

// ------------------------------------------------------------
// ドット絵。1文字が1ドットで、'.' は透明。文字は PALETTE の色になる
// 背景が黒なので、黒(k)は目やサングラスなど、色のある部分の内側だけに使う
// ------------------------------------------------------------
const PALETTE = {
  w: '#f4f4f4', r: '#ff3a3a', b: '#3a7bff', y: '#ffd23a',
  g: '#3adf6a', p: '#b45aff', c: '#3cf0ff', o: '#ff9a2a', k: '#101018',
  s: '#f2c79a',  // 肌
  e: '#5a5a6e',  // 革ジャン・ブーツ(黒い背景でも見えるよう、少し明るい灰色)
  v: '#d0d4de',  // 鋲・バッジ(銀)
  m: '#ff5ac8',  // ピンク(モヒカン)
  n: '#2a44b0',  // 警察官の制服(紺。黒い背景でも見える明るさ)
  N: '#5a78e8',  // 制服の肩章(明るい紺)
};

// 自機: POLICEマン(紺の制服・警官帽・サングラス)。上を向いて弾を撃つ
const GRID_PLAYER = [
  '....nnnnn....',
  '...nnnvnnn...',
  '..nnnnnnnnn..',
  '...kkkkkkk...',
  '....sssss....',
  '....kkskk....',
  '....sssss....',
  '.NnnnnnnnnnN.',
  'nn.nnnvnnn.nn',
  's..nnnnnnn..s',
  '...nkkykkn...',
  '...nn...nn...',
  '...ee...ee...',
];

// ---- 敵: 80年代ハードコアパンク風のモヒカンパンクス ----
// 小さくても目立つよう、モヒカンは頭の上に3〜4ドット突き出させ、両横は剃り上げた肌色にする。
// 体は灰色の革ジャンで地味にして、種類ごとに色を変えたモヒカンを目立たせる。

// レッドパンク(ザコ。両腕を上げてポゴダンス)
const GRID_BEE = [
  '......r......',
  '.....rrr.....',
  '.....rrr.....',
  '.....rrr.....',
  '....srrrs....',
  '.s..sksks..s.',
  '.e...sss...e.',
  '.eeeeeeeeeee.',
  '....eveve....',
  '....eeeee....',
  '....e...e....',
  '...ee...ee...',
];
// ブルーパンク(ザコ。鋲付きの肩パッドで横に広い)
const GRID_MOTH = [
  '......b......',
  '.....bbb.....',
  '.....bbb.....',
  '....sbbbs....',
  '....sksks....',
  '.....sss.....',
  'vevveeeeevvev',
  'eee.eeeee.eee',
  's...eeeee...s',
  '....ee.ee....',
  '...ee...ee...',
];
// ボスパンク(2発で倒れる。捕獲ビームを出す。特大の緑モヒカン、トゲの肩パッドとチェーン)
const GRID_QUEEN = [
  '......g......',
  '.....ggg.....',
  '....ggggg....',
  '....ggggg....',
  '....sgggs....',
  '....sksks....',
  'v...sssss...v',
  'vve.eeeee.evv',
  '.eeeeyyyeeee.',
  '.s..eeeee..s.',
  '....ee.ee....',
  '...ee...ee...',
];
// イエローパンク(変身・縦一列で突撃。ボーダーシャツ)
const GRID_FIREFLY = [
  '......y......',
  '.....yyy.....',
  '.....yyy.....',
  '....syyys....',
  '....sksks....',
  '.s...sss...s.',
  '.w..wwwww..w.',
  '..wwrrrrrww..',
  '....wwwww....',
  '....rrrrr....',
  '....e...e....',
  '...ee...ee...',
];
// チェーンパンク(変身・横一列で突撃。両手にチェーン)
const GRID_MANTIS = [
  '......c......',
  '.....ccc.....',
  '.....ccc.....',
  '....scccs....',
  '....sksks....',
  'v....sss....v',
  'vs.eeeeeee.sv',
  'v.eeeeeeeee.v',
  '....eeeee....',
  '....ee.ee....',
  '...ee...ee...',
];
// スパイクパンク(変身・高速で突撃。とげとげのリバティスパイク)
const GRID_CICADA = [
  '...o..o..o...',
  '....o.o.o....',
  '....ooooo....',
  '....sooos....',
  '....sksks....',
  '.....sss.....',
  '.eeeeeeeeeee.',
  'se..evvve..es',
  '....eeeee....',
  '....ee.ee....',
  '...ee...ee...',
];
// ピンクパンク(チャレンジステージ専用。縦に長いモヒカン)
const GRID_DRAGONFLY = [
  '......m......',
  '......m......',
  '.....mmm.....',
  '.....mmm.....',
  '.....mmm.....',
  '....smmms....',
  '....sksks....',
  '.....sss.....',
  '..eeeeeeeee..',
  '.s..eeeee..s.',
  '....ee.ee....',
  '....e...e....',
  '...ee...ee...',
];
// ウニ頭パンク(チャレンジステージ専用。全方向に立てた紫の髪で、くるくる回りながら飛ぶ)
const GRID_PROPELLER = [
  '......p......',
  '..p...p...p..',
  '...p.ppp.p...',
  '....psssp....',
  '.pppsksksppp.',
  '....sssss....',
  '...p.sss.p...',
  '..p.eeeee.p..',
  '...eeeeeee...',
  '....ee.ee....',
  '...ee...ee...',
];
const SPRITE_SCALE = 2;  // ドット1粒の大きさ(px)

// 色違いも含めたスプライトの定義
const SPRITE_DEFS = {
  player: { grid: GRID_PLAYER },
  captive: { grid: GRID_PLAYER, remap: { n: 'r', N: 'o', v: 'y' } },  // 捕まった自機(制服が赤くなった、悪に落ちたポリス)
  bee: { grid: GRID_BEE },
  moth: { grid: GRID_MOTH },
  queen: { grid: GRID_QUEEN },
  queen2: { grid: GRID_QUEEN, remap: { g: 'p' } },           // 1発当たったボス(モヒカンが紫になる)
  bee_hit: { grid: GRID_BEE, remap: { r: 'w', s: 'w', e: 'w', v: 'w' } },  // 弾が当たった瞬間の白い点滅(目だけ残す)
  firefly: { grid: GRID_FIREFLY },
  mantis: { grid: GRID_MANTIS },
  cicada: { grid: GRID_CICADA },
  dragonfly: { grid: GRID_DRAGONFLY },
  propeller: { grid: GRID_PROPELLER },
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

// 通常ステージの入場ウェーブ。members は [行, 列]。行0=女王(ボスパンク)、1-2=ヒラリ(ブルーパンク)、3-4=ブンブン(レッドパンク)
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
// 選んでいる難易度。保存されていなければ NORMAL
let difficulty = loadStorage(KEY_DIFFICULTY, 'normal');
if (!DIFFICULTIES[difficulty]) difficulty = 'normal';
// 難易度ごとのランキング [{ name, score }](得点の高い順に5件)。ranking は選んでいる難易度のもの
const rankings = Object.fromEntries(DIFF_ORDER.map((d) => [d, loadRanking(d)]));
let ranking = rankings[difficulty];

// 名前入力の状態
const entry = { chars: ['A', 'A', 'A'], pos: 0, rank: 0 };

const game = {
  score: 0,
  hi: ranking[0].score,
  lives: 2,           // 残機(画面に出ている自機は含まない)
  diffKey: difficulty,             // このゲームの難易度('easy' | 'normal' | 'hard')
  diff: DIFFICULTIES[difficulty],  // このゲームの難易度の倍率(プレイ中は変わらない)
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
  morphGroup: null,   // 変身中・突撃中の3機編隊
  lastRank: -1,       // 直前に名前を登録した順位(ランキング表で光らせる)
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

// 難易度ごとのランキングの保存キー。NORMAL は旧版と同じキーなので、今までの記録をそのまま使える
function rankingKey(d) {
  return d === 'normal' ? KEY_RANKING : `${KEY_RANKING}.${d}`;
}

// ランキングを読み込む。壊れていたら初期値に戻す
function loadRanking(d) {
  try {
    const r = JSON.parse(loadStorage(rankingKey(d), 'null'));
    if (Array.isArray(r) && r.length === 5 &&
        r.every((x) => x && typeof x.name === 'string' && Number.isFinite(x.score))) {
      return r;
    }
  } catch (e) {
    // 読めなければ初期値を使う
  }
  const r = DEFAULT_RANKING.map((x) => ({ ...x }));
  // 旧版で保存したハイスコアがあれば、NORMAL のランキングに入れて引き継ぐ
  const old = d === 'normal' ? Number(loadStorage(KEY_HIGH, '0')) || 0 : 0;
  if (old > r[4].score) {
    r.push({ name: 'YOU', score: old });
    r.sort((a, b) => b.score - a.score);
    r.length = 5;
  }
  return r;
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
  let move = e.speed * game.diff.speed * dt;  // 難易度の倍率をここでまとめてかける
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
// 難易度を選ぶ(タイトル画面・ゲームオーバー画面だけ)。HI-SCORE とランキング表もその難易度のものにする
function selectDifficulty(d) {
  if (d === difficulty) return;
  difficulty = d;
  saveStorage(KEY_DIFFICULTY, d);
  ranking = rankings[d];
  game.hi = ranking[0].score;
  game.lastRank = -1;  // 前の難易度で登録した順位は光らせない
  playSound('shoot');
}

// 難易度を1つ左右にずらす(端では止まる)
function shiftDifficulty(delta) {
  const i = DIFF_ORDER.indexOf(difficulty);
  selectDifficulty(DIFF_ORDER[clamp(i + delta, 0, DIFF_ORDER.length - 1)]);
}

function launch() {
  ensureAudio();
  Object.assign(game, {
    diffKey: difficulty, diff: DIFFICULTIES[difficulty],
    score: 0, lives: DIFFICULTIES[difficulty].lives, stage: 0, nextExtend: FIRST_EXTEND, overT: 0,
    fired: 0, hits: 0, beamer: null, fireCalm: 0, newRecord: false, messageT: 0,
    hi: ranking[0].score, morphGroup: null, lastRank: -1,
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
  game.morphGroup = null;
  game.queue = [];
  game.enterClock = 0;
  breathK = 0;
  formT = 0;

  if (game.challenge) {
    game.chHits = 0;
    game.chWaves = Array.from({ length: 5 }, () => ({ killed: 0 }));
    const round = Math.floor(n / 4);
    // 回ごとに主役の敵が変わる(レッド→ブルー→イエロー→ピンク→チェーン→ウニ頭→スパイク)
    const main = CH_TYPES[round % CH_TYPES.length];
    for (let w = 0; w < 5; w++) {
      const pat = CH_PATTERNS[(w + round) % CH_PATTERNS.length];
      for (let j = 0; j < 8; j++) {
        // 2組目には女王が混ざる
        let type = main;
        if (w === 1) type = j % 4 < 2 ? 'queen' : main;
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
  game.overAt = performance.now();
  playSound('gameover');
  ranking = rankings[game.diffKey];
  if (game.score > ranking[4].score) {
    // 5位以内に入ったら名前入力へ
    state = 'entry';
    entry.chars = ['A', 'A', 'A'];
    entry.pos = 0;
    entry.rank = ranking.findIndex((r) => game.score > r.score);
  } else {
    state = 'gameover';
  }
}

// 名前入力: 今の文字を delta だけ進める(端まで行ったら反対側へ回る)
function changeLetter(delta) {
  const i = LETTERS.indexOf(entry.chars[entry.pos]);
  entry.chars[entry.pos] = LETTERS[(i + delta + LETTERS.length) % LETTERS.length];
}

// 名前入力: 今の文字を決定して次へ。3文字そろったらランキングに登録する
function confirmLetter() {
  entry.pos++;
  if (entry.pos < 3) return;
  ranking.splice(entry.rank, 0, { name: entry.chars.join(''), score: game.score });
  ranking.length = 5;
  saveStorage(rankingKey(game.diffKey), JSON.stringify(ranking));
  game.lastRank = entry.rank;
  state = 'gameover';
  game.overAt = performance.now();
  playSound('extend');
}

// ゲームオーバー直後の操作で、うっかり名前が決まらないようにする
const entryReady = () => performance.now() - game.overAt > 800;

// ============================================================
// 入力
// ============================================================
function canStart() {
  // ゲームオーバー直後の誤操作で、すぐ始まらないようにする
  return state === 'ready' || (state === 'gameover' && performance.now() - game.overAt > 1000);
}

// 名前入力中のキー操作。←→↑↓で文字を選び、スペース/Enter で決定、英字キーで直接入力
function handleEntryKey(e) {
  const k = e.key;
  if (e.repeat || !entryReady()) return;  // 押しっぱなしの連打は無視する
  if (k === 'ArrowRight' || k === 'ArrowUp') changeLetter(1);
  else if (k === 'ArrowLeft' || k === 'ArrowDown') changeLetter(-1);
  else if (k === ' ' || k === 'Enter') confirmLetter();
  else if (k === 'Backspace') entry.pos = Math.max(0, entry.pos - 1);
  else if (/^[a-zA-Z]$/.test(k)) {
    entry.chars[entry.pos] = k.toUpperCase();
    confirmLetter();
  }
}

document.addEventListener('keydown', (e) => {
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', ' ', 'ArrowUp', 'ArrowDown', 'Backspace'].includes(k)) e.preventDefault();
  if (state === 'entry') {
    handleEntryKey(e);
    return;
  }
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true;
  if (k === ' ') keys.fire = true;
  // タイトル画面・ゲームオーバー画面では ←→ / A D で難易度を選ぶ(押しっぱなしのくり返しは無視)
  if (canStart() && !e.repeat) {
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') shiftDifficulty(-1);
    if (k === 'ArrowRight' || k === 'd' || k === 'D') shiftDifficulty(1);
  }
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
  if (state === 'entry') {
    // 名前入力: 左1/3をタップで前の文字、右1/3で次の文字、真ん中で決定
    if (!entryReady()) return;
    const x = canvasX(e);
    if (x < W / 3) changeLetter(-1);
    else if (x > (W * 2) / 3) changeLetter(1);
    else confirmLetter();
    return;
  }
  if (canStart()) {
    // 難易度ボタンをタップしたら選ぶだけ。それ以外の場所をタップしたら開始
    const d = diffButtonAt(e);
    if (d) selectDifficulty(d);
    else launch();
    return;
  }
  if (state === 'paused') { togglePause(); return; }
  pointer.active = true;
  pointer.x = canvasX(e);
  canvas.setPointerCapture(e.pointerId);
});
// タップした位置にある難易度ボタンを返す(なければ null)
function diffButtonAt(e) {
  const r = canvas.getBoundingClientRect();
  const x = canvasX(e);
  const y = ((e.clientY - r.top) / r.height) * H;
  if (Math.abs(y - diffBtnY()) > DIFF_BTN_H / 2 + 6) return null;  // 少し広めに判定する
  return DIFF_ORDER.find((d, i) => Math.abs(x - diffBtnX(i)) <= DIFF_BTN_W / 2) || null;
}

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
  const d = game.diff;
  e.fireLeft = Math.random() < (0.5 + game.stage * 0.05) * d.fireChance
    ? Math.min(1 + (game.stage >= 5 ? 1 : 0), d.maxFire) : 0;
}

// 女王(ボスパンク)の突撃。近くのヒラリ(ブルーパンク)を最大2機お供に連れていく
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

// 変身の開始: その場でしばらく点滅してから3機に分かれる
function startMorph(e) {
  const kind = MORPHS[Math.floor((game.stage - 4) / 4) % MORPHS.length];
  e.state = 'morph';
  e.morphT = 0;
  e.morphTo = kind.type;
  // 3機のうち何機倒したか・何機逃げたかを数える入れ物
  game.morphGroup = { kind, killed: 0, gone: 0 };
}

// 点滅が終わったら、元の1機を消して3機編隊を突撃させる
function finishMorph(e) {
  const group = game.morphGroup;
  const kind = group.kind;
  e.dead = true;
  const base = divePath(e, player.x);
  for (const [ox, oy] of kind.offsets) {
    const m = makeEnemy(kind.type, e.row, e.col, e.x + ox, e.y + oy);
    m.state = 'dive';
    m.path = base.map((p) => ({ x: p.x + ox, y: p.y + oy }));
    m.pi = 0;
    m.speed = 220 + Math.min(game.stage, 15) * 8 + kind.speedUp;
    m.fireLeft = 1;
    m.group = group;
    enemies.push(m);
  }
  playSound('queenHit');
}

// 3機すべての結末(撃墜か逃げた)が決まったら、次の変身を許可する
function checkMorphDone(group) {
  if (group.killed + group.gone >= 3 && game.morphGroup === group) game.morphGroup = null;
}

// ビームを出せる条件: 自機が1機だけで、他に捕まっている自機がいない
function canBeam() {
  return player.alive && !player.dual && !player.captured && !game.beamer && !rescue &&
    !enemies.some((e) => e.captive || e.type === 'traitor');
}

function launchAttack() {
  if (!player.alive) return;  // 自機がいない間は新しく突撃しない
  const divers = enemies.filter(isAttacking).length;
  const maxDivers = clamp(Math.min(2 + Math.floor(game.stage / 2), 6) + game.diff.maxDivers, 1, 7);
  if (divers >= maxDivers) return;
  const inForm = enemies.filter((e) => !e.dead && e.state === 'formation');
  if (!inForm.length) return;

  // 4面以降は、ときどきザコが3機編隊に変身して突撃してくる(同時に1組まで)
  const small = inForm.filter((e) => e.type === 'bee' || e.type === 'moth');
  if (game.stage >= 4 && !game.morphGroup && small.length && Math.random() < 0.2) {
    startMorph(pick(small));
    return;
  }

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
  const speed = ENEMY_SHOT_SPEED * game.diff.shotSpeed;
  const time = Math.max(0.3, (PLAYER_Y - e.y) / speed);
  const vx = clamp((player.x - e.x) / time, -110, 110);
  eShots.push({ x: e.x, y: e.y + 10, vx, vy: speed, dead: false });
}

function maybeFire(e, dt) {
  if (e.challenge || !player.alive || game.fireCalm > 0 || e.fireLeft <= 0) return;
  if (e.y > 160 && e.y < 420 && Math.random() < dt * 1.8 * game.diff.fireRate) {
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
      showMessage('ポリスが捕まった!');
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
        const step = e.speed * game.diff.speed * dt;
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
      case 'morph': {
        const s = slotPos(e.row, e.col);
        e.x = s.x; e.y = s.y;
        e.morphT += dt;
        if (e.morphT > 0.8) finishMorph(e);
        break;
      }
      case 'dive':
        if (followPath(e, dt) && e.group) {
          // 変身した敵は戻らず、そのまま逃げていく
          e.dead = true;
          e.group.gone++;
          checkMorphDone(e.group);
        } else if (e.pi >= e.path.length) {
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
    // 変身前に倒されたら、その変身は取りやめ
    if (e.state === 'morph') game.morphGroup = null;
    // 3機編隊を全部倒すとボーナス
    if (e.group) {
      e.group.killed++;
      if (e.group.killed === 3) {
        addScore(e.group.kind.bonus);
        addPopup(e.x, e.y - 14, String(e.group.kind.bonus));
      }
      checkMorphDone(e.group);
    }
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
  const color = {
    bee: '#ffd23a', moth: '#ff3a3a', queen: '#3adf6a', traitor: '#ff3a3a',
    firefly: '#3adf6a', mantis: '#3cf0ff', cicada: '#ff9a2a', dragonfly: '#3cf0ff', propeller: '#b45aff',
  }[e.type];
  explode(e.x, e.y, color);
  playSound('hit');
}

function startRescue(x, y) {
  rescue = { x, y, spin: 0 };
  playSound('rescue');
  showMessage('ポリス救出!');
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
        game.attackT = 1.5 * game.diff.attackInterval;
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
        game.attackT = (enemies.length <= 8 ? base * 0.5 : base) * game.diff.attackInterval;
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
      // 合体してダブルポリスになる
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
  // 変身中は元の姿と変身後の姿を交互に見せる
  if (e.state === 'morph' && Math.floor(e.morphT * 12) % 2) name = e.morphTo;
  if (e.type === 'propeller') {
    // プロペラは進む向きに関係なく、くるくる回り続ける
    drawSprite(name, e.x, e.y, formT * 8);
  } else {
    drawSprite(name, e.x, e.y, e.angle, e.type === 'traitor' ? 1 : flap);
  }
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
    // 遊んでいる難易度(右下)。ゲームオーバー画面では、選び直したボタンと食い違わないよう出さない
    if (state === 'playing' || state === 'paused') {
      text(game.diff.label, W - 12, H - 16, { size: 9, color: game.diff.color, align: 'right' });
    }
  }
}

// ランキング表。直前に登録した順位は黄色で点滅させる
function drawRanking(y0) {
  // どの難易度のランキングかを見出しに出す
  text(`― ランキング ${DIFFICULTIES[difficulty].label} ―`, W / 2, y0, { size: 18, ja: true, color: '#3adf6a' });
  const labels = ['1ST', '2ND', '3RD', '4TH', '5TH'];
  ranking.forEach((r, i) => {
    const y = y0 + 38 + i * 30;
    const mine = i === game.lastRank;
    if (mine && Math.floor(performance.now() / 300) % 2) return;
    const color = mine ? '#ffd23a' : i === 0 ? '#3cf0ff' : '#ffffff';
    text(labels[i], 120, y, { size: 12, color, align: 'left' });
    text(String(r.score).padStart(6, '0'), 200, y, { size: 12, color, align: 'left' });
    text(r.name, 320, y, { size: 12, color, align: 'left' });
  });
}

// 名前入力の画面
function drawEntry() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, W, H);
  text('GAME OVER', W / 2, 120, { size: 20, color: '#ff3a3a' });
  text('ランキング入り!', W / 2, 180, { size: 24, ja: true, color: '#ffd23a' });
  text(`${entry.rank + 1}位  ${String(game.score).padStart(6, '0')}`, W / 2, 225, { size: 18, ja: true });
  text('名前を入れてください', W / 2, 275, { size: 16, ja: true, color: '#a8a8c8' });

  // 3文字。入力中の文字は点滅し、下線を引く
  for (let i = 0; i < 3; i++) {
    const x = W / 2 + (i - 1) * 56;
    const active = i === entry.pos;
    if (!(active && Math.floor(performance.now() / 250) % 2)) {
      text(entry.chars[i], x, 345, { size: 32, color: active ? '#3cf0ff' : '#ffffff' });
    }
    if (active) {
      ctx.fillStyle = '#3cf0ff';
      ctx.fillRect(x - 18, 372, 36, 4);
    }
  }
  text('←→ で文字を選ぶ / 英字キーで直接入力', W / 2, 430, { size: 14, ja: true, color: '#a8a8c8' });
  text('スペース・Enter で決定 / BackSpace で戻る', W / 2, 455, { size: 14, ja: true, color: '#a8a8c8' });
  text('タッチ: 左右をタップで選ぶ・真ん中で決定', W / 2, 480, { size: 14, ja: true, color: '#a8a8c8' });
}

// 難易度ボタンの y(タイトル画面とゲームオーバー画面で少し変える)
function diffBtnY() {
  return state === 'gameover' ? 498 : 488;
}

// 難易度ボタンを3つ並べて描く。選んでいるものは塗りつぶして光らせる
function drawDifficultyButtons() {
  const y = diffBtnY();
  DIFF_ORDER.forEach((d, i) => {
    const def = DIFFICULTIES[d];
    const x = diffBtnX(i);
    const on = d === difficulty;
    ctx.fillStyle = on ? def.color : 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x - DIFF_BTN_W / 2, y - DIFF_BTN_H / 2, DIFF_BTN_W, DIFF_BTN_H);
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - DIFF_BTN_W / 2, y - DIFF_BTN_H / 2, DIFF_BTN_W, DIFF_BTN_H);
    text(def.label, x, y + 1, { size: 11, color: on ? '#000' : def.color });
  });
  // 左右の矢印(キーボードで選べることを示す)
  text('◀', diffBtnX(0) - DIFF_BTN_W / 2 - 14, y, { size: 12, color: '#a8a8c8', ja: true });
  text('▶', diffBtnX(2) + DIFF_BTN_W / 2 + 14, y, { size: 12, color: '#a8a8c8', ja: true });
}

function drawReadyScreen() {
  ctx.save();
  ctx.fillStyle = '#ff3cc8';
  ctx.font = `40px ${FONT_JA}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ポリス vs パンクス', W / 2 + 4, 154);
  ctx.fillStyle = '#ffd23a';
  ctx.fillText('ポリス vs パンクス', W / 2, 150);
  ctx.restore();
  text('POLICE VS PUNKS', W / 2, 200, { size: 10, color: '#3cf0ff' });

  // 6秒ごとに「スコア表」「3機編隊」「ランキング」を切り替えて見せる
  const page = Math.floor(performance.now() / 6000) % 3;
  if (page === 0) {
    text('― スコア表 ―', W / 2, 260, { size: 18, ja: true, color: '#3adf6a' });
    const rows = [
      ['bee', 'レッドパンク', '50 / 100'],
      ['moth', 'ブルーパンク', '80 / 160'],
      ['queen', 'ボスパンク', '150 / 400〜1600'],
    ];
    rows.forEach(([name, label, pts], i) => {
      const y = 300 + i * 40;
      drawSprite(name, 110, y);
      text(label, 140, y, { size: 16, ja: true, align: 'left' });
      text(pts, 260, y, { size: 9, align: 'left', color: '#ffd23a' });
    });
    text('ボスパンクのビームで捕まったポリスを', W / 2, 430, { size: 15, ja: true, color: '#a8a8c8' });
    text('突撃中に取り返すと2機合体!', W / 2, 452, { size: 15, ja: true, color: '#a8a8c8' });
  } else if (page === 1) {
    text('― 3機編隊ボーナス ―', W / 2, 260, { size: 18, ja: true, color: '#3adf6a' });
    const rows = [['firefly', 'イエローパンク'], ['mantis', 'チェーンパンク'], ['cicada', 'スパイクパンク']];
    rows.forEach(([name, label], i) => {
      const y = 300 + i * 40;
      // 3機並べて描く
      for (let k = 0; k < 3; k++) drawSprite(name, 80 + k * 26, y);
      text(label, 170, y, { size: 16, ja: true, align: 'left' });
      text(String(MORPHS[i].bonus), 290, y, { size: 10, align: 'left', color: '#ffd23a' });
    });
    text('4面からザコが変身して突撃してくる', W / 2, 430, { size: 15, ja: true, color: '#a8a8c8' });
    text('3機とも倒すとボーナス!', W / 2, 452, { size: 15, ja: true, color: '#a8a8c8' });
  } else {
    drawRanking(250);
  }

  // 難易度の選択
  drawDifficultyButtons();
  text(DIFFICULTIES[difficulty].desc, W / 2, 522, { size: 14, ja: true, color: '#a8a8c8' });

  if (Math.floor(performance.now() / 500) % 2 === 0) {
    text('PUSH SPACE / TAP', W / 2, 562, { size: 14 });
  }
  text('←→ / ボタンで難易度を選ぶ', W / 2, 592, { size: 13, ja: true, color: '#a8a8c8' });
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
  if (state === 'entry') drawEntry();
  if (state === 'gameover') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, W, H);
    text('GAME OVER', W / 2, 90, { size: 24, color: '#ff3a3a' });
    // 命中率の結果発表
    const ratio = game.fired ? ((game.hits / game.fired) * 100).toFixed(1) : '0.0';
    text('― 結果 ―', W / 2, 145, { size: 18, ja: true, color: '#ffd23a' });
    text(`発射数   ${game.fired}`, W / 2, 180, { size: 16, ja: true });
    text(`命中数   ${game.hits}`, W / 2, 206, { size: 16, ja: true });
    text(`命中率   ${ratio} %`, W / 2, 232, { size: 16, ja: true });
    if (game.newRecord) text('NEW RECORD!', W / 2, 268, { size: 14, color: '#3adf6a' });
    drawRanking(310);
    // リトライの前に難易度を変えられる
    drawDifficultyButtons();
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      text('SPACE / TAP でリトライ', W / 2, 548, { size: 18, ja: true });
    }
    text('←→ / ボタンで難易度を変える', W / 2, 580, { size: 13, ja: true, color: '#a8a8c8' });
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
