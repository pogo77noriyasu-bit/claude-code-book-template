// 調整用の定数とデータ(キャラクター・種目の一覧)。すべてグローバル名前空間 PO にぶら下がる
window.PO = window.PO || {};

PO.config = {
  // 画面(論理解像度)。表示はウィンドウに合わせて拡大縮小する
  W: 960,
  H: 720,
  STEP: 1 / 120, // 固定ステップ(秒)。フレームレートに関係なく、時間はこの刻みで進む

  // 競技画面: 上に HUD、その下に背景画像の 300 行目から下(観客席の屋根〜トラック〜芝)を並べる
  HUD_H: 80,
  WORLD_SRC_Y0: 300,
  STANDS_PARALLAX: 0.5, // 観客席はトラックの半分の速さで流す(奥行き)
  PX_PER_M: 60, // 1m = 60px
  START_X: 520, // レーン 1 のスタートラインの位置(ワールド座標の px)
  CAMERA_PLAYER_X: 300, // プレイヤーを画面のこの x に置いてカメラを追わせる

  // 保存キー
  RECORDS_KEY: 'punks-olympic-records-v1',
  SOUND_KEY: 'punks-olympic-sound',

  // 入力: これより短い間隔の連打は数えない(チャタリング・連射装置よけ。秒)
  MIN_TAP_INTERVAL: 0.035,
};

// 8 人のパンクス(全種目で共通)。id は assets/chars/<id>.png と assets/faces/<id>.png に対応
// 電光掲示板(js/core/scoreboard.js)の位置。競技画面の上部(HUD の下・観客席の上に重ねる)
// MSG_Y: 合図の文字(ON YOUR MARKS / GO!! / FINISH! など)の高さ。掲示板と重ならないよう、その下に出す
PO.SCOREBOARD = { x: 240, y: 86, w: 480, h: 226, MSG_Y: 372 };

// 効果音の音量の倍率(1.0 = 標準)。ピストル(スタート・1 位のゴール)・観客の歓声・足音を別々に調整できる
PO.SOUND_VOLUME = {
  pistol: 1.0,
  crowd: 5.0, // 2026-11-18: 実機で小さかったため 5 倍
  step: 5.0, // 2026-11-18: 実機で聞こえなかったため 5 倍(暫定)
  bgm: 1.0, // BGM(表彰式。2026-11-19)
};

PO.CHARACTERS = [
  { id: 'red', name: 'RED MOHAWK', ja: '赤モヒカン', color: '#ff3a46' },
  { id: 'skin', name: 'SKINHEAD', ja: 'スキンヘッズ', color: '#e8e8e8' },
  { id: 'green', name: 'GREEN SPIKY', ja: '緑スパイキー', color: '#3ed84a' },
  { id: 'leopard', name: 'LEOPARD', ja: 'レオパード', color: '#ffa424' },
  { id: 'blue', name: 'BLUE MOHAWK', ja: '青モヒカン', color: '#2f8bff' },
  { id: 'pink', name: 'PINK MOHAWK', ja: 'ピンクモヒカン', color: '#ff5cc8' },
  { id: 'purple', name: 'PURPLE LONG', ja: '紫ロングモヒカン', color: '#b05cff' },
  { id: 'yellow', name: 'YELLOW LIBERTY', ja: '黄色リバティスパイク', color: '#fff04a' },
];

// 競技中の走行・ポーズに使う、キャラクターごとの画像(支給画像 <n>punk_run.png / <n>punk_stop.png を
// tools/build-run-strips.js で切り出したもの。寸法は自動生成の js/core/run-strip-data.js)。全 8 人で同じ設定を使う
// 走行は横一列に frames 枚(1 コマ w×h)。左から順にくり返す。scale は表示の倍率(最近傍)
// footRow: 足の下端の次の行(コマの中の y)。これを足元の少し上(FOOT_LIFT px)に合わせる
// stepFrames: 着地のコマ。ここに入ったら足音を鳴らす
// 8 コマ 1 周の速さ(周/秒)= base + perMps × 走る速さ(m/s)
//   高速域(hiFrom m/s 以上)だけ、hiGain × ((速さ - hiFrom) / (hiTo - hiFrom)) ^ hiPow を足して、連打で速さが上がるほど
//   足の回転がはっきり速くなるようにする(hiFrom 以下は足さないので低速の見え方は変わらない)。
//   maxCycles: 上限。60Hz の画面で 1 コマを最低 2 回は描けるよう、毎秒 30 コマ(3.75 周)未満にする
PO.RUN_ANIM = {
  frames: 8,
  scale: 1.5,
  stepFrames: [0, 4],
  base: 0.6,
  perMps: 0.18,
  hiFrom: 6,
  hiTo: 11,
  hiGain: 1.02,
  hiPow: 1.3,
  maxCycles: 3.6,
  // 最高速度付近の「連打の頑張り」演出(見た目だけ。走る速さには影響しない。プレイヤーだけ)
  // 直近の連打ペース(回/秒、tapTau 秒で平滑化)が rushFrom を超えたぶん、
  // rushGain × 超過 × 高速度合い(速さ hiFrom→hiTo で 0→1)を 1 周の速さに足す。上限 rushMax 周/秒
  tapTau: 0.5,
  rushFrom: 8,
  rushGain: 0.4,
  rushMax: 6.0,
};
// CPU の走りのコマの開始位相(コマ数)。CPU 1〜3 人目でずらし、全員が同じ足の動きにならないようにする
PO.CPU_ANIM_PHASE = [0, 2.7, 5.3];
// キャラクターごとの設定(画像の場所と寸法だけが違う)。
// poses: スタートの構え(start)・停止時の直立(stop)・ゴール後のガッツポーズ(goal、1 位)・敗北(lose、2〜4 位)。走行コマと同じ大きさ・同じ足元の行
PO.RUN_STRIPS = {};
Object.keys(PO.RUN_STRIP_DATA.chars).forEach((id) => {
  const D = PO.RUN_STRIP_DATA;
  const cell = { w: D.cell.w, h: D.cell.h, footRow: D.cell.footRow };
  PO.RUN_STRIPS[id] = Object.assign({ src: D.chars[id].run }, PO.RUN_ANIM, cell, {
    // 走りの各コマの手(コマの中の x, y とバトンの角度(度))。リレーのバトンを手に持たせる
    hands: D.chars[id].hands || null,
    poses: Object.assign({ src: D.chars[id].poses, index: { start: 0, stop: 1, goal: 2, lose: 3 } }, cell),
    // ジャンプ(あんパン食い競争): 踏み切り・空中・着地の 3 コマ。mouth = 空中のコマの口の位置(足元・左右中央からのコマの px、上が正)
    jump: { src: D.chars[id].jump, w: D.jumpCell.w, h: D.jumpCell.h, footRow: D.jumpCell.footRow, mouth: D.chars[id].mouth },
    // 綱引き: 構え・引く・踏ん張りの 3 コマ(右向き)。rope = 各コマの綱の端(足元・左右中央からのコマの px、上が正)。画像がなければ null
    pull: D.chars[id].pull ? { src: D.chars[id].pull, w: D.pullCell.w, h: D.pullCell.h, footRow: D.pullCell.footRow, rope: D.chars[id].rope } : null,
    // 玉入れ: 拾う・振りかぶる(玉を持つ)・投げるの 3 コマ(右向き)。release = 投げるコマの玉を放す位置(足元・左右中央からのコマの px、上が正)。画像がなければ null
    throw: D.chars[id].throw ? { src: D.chars[id].throw.src, w: D.throwCell.w, h: D.throwCell.h, footRow: D.throwCell.footRow, release: D.chars[id].throw.release } : null,
  });
});
PO.RUN_STRIP_FOOT_LIFT = 4;

// 種目の一覧(種目選択画面の並び)。available: false はまだ作っていない種目
// buttons: スマホに出すボタン(最大 2 つ: run / action)。labels: ボタンの文字(省略時は RUN / ACTION)
// record: 'time' は小さいほど良い、'distance' / 'count' は大きいほど良い('count' は個数。玉入れ)
PO.EVENT_LIST = [
  { id: 'dash100', name: '100m DASH', ja: '100m走', buttons: ['run'], record: 'time', available: true },
  { id: 'anpan', name: 'ANPAN RACE', ja: 'あんパン食い競争', buttons: ['run', 'action'], record: 'time', available: true },
  // 綱引きの記録 = 勝ったときの決着までの時間(負けは記録なし)
  { id: 'tug', name: 'TUG OF WAR', ja: '綱引き', buttons: ['action'], record: 'time', available: true },
  // 玉入れの記録 = カゴに入れた玉の数
  { id: 'balltoss', name: 'BALL TOSS', ja: '玉入れ', buttons: ['run', 'action'], labels: { run: 'PICK', action: 'THROW' }, record: 'count', available: true },
  // 缶蹴りの記録 = 3 回の試技のうちいちばん遠い飛距離(3 回とも FOUL なら記録なし)
  { id: 'cankick', name: 'CAN KICK', ja: '缶蹴り', buttons: ['run', 'action'], labels: { action: 'KICK' }, record: 'distance', available: true },
  // リレーの記録 = プレイヤーのチームの 400m のゴールタイム
  { id: 'relay', name: 'RELAY', ja: 'リレー', buttons: ['run', 'action'], labels: { action: 'PASS' }, record: 'time', available: true },
];

// 100m 走の調整値
PO.DASH100 = {
  DIST: 100, // m
  TAP_BOOST: 1.2, // 1 回の連打で上がる速さ(m/s)
  DRAG: 1.0, // 速さに比例する減速(1/s)
  FRICTION: 0.6, // 一定の減速(m/s²)。連打を止めるとだんだん止まる
  VMAX: 11.0, // 最高速度(m/s)
  TIME_LIMIT: 30, // これを過ぎてもゴールしていなければ記録なし(秒)
  // CPU の巡航速度(m/s)の帯。3 人に 1 つずつ割り当てる(速い・ふつう・遅い)
  CPU_SPEEDS: [
    [9.5, 10.1],
    [8.7, 9.3],
    [7.7, 8.3],
  ],
  // CPU の巡航速度の倍率(暫定。CPU_SPEEDS にかける)。1.0 = 調整前。0.8 = 2 割遅く(速い 7.6〜8.08・ふつう 6.96〜7.44・遅い 6.16〜6.64 m/s)
  CPU_SPEED_SCALE: 0.8,
  CPU_ACCEL_K: 1.5, // 目標速度へ近づく速さ(1/s)
  CPU_ACCEL_MAX: 6.0, // CPU の加速度の上限(m/s²)。不自然な急加速をしない
  CPU_REACT: [0.12, 0.26], // GO!! からの反応時間(秒)
  // 演出の時間(秒)
  INTRO: 1.2,
  MARKS: 1.6,
  SET_MIN: 1.0,
  SET_MAX: 2.0,
  GO_SHOW: 0.9,
  FOUL_SHOW: 1.8,
  FINISH_WAIT: 2.6, // 全員ゴールしてからリザルトまで
  RUNOUT_DECEL: 2.5, // ゴール後の減速(1/s)
};

// あんパン食い競争の調整値。走り・CPU の速さ・スタートなどは 100m 走(PO.DASH100)と同じで、ここに書いたものだけ上書き・追加する
// 高さ・距離の px は画面の px(キャラクターは 1.5 倍で描いた大きさ)
PO.ANPAN_RACE = {
  BREADS: [20, 35, 50, 65, 80], // あんパンの位置(スタートからの m)。各レーンに 1 個ずつ
  // CPU の巡航速度の倍率。100m 走(0.8)より 5% 遅く(2026-11-18、実機確認のあと)。100m 走の CPU には影響しない
  CPU_SPEED_SCALE: PO.DASH100.CPU_SPEED_SCALE * 0.95,
  BREAD_H: 108, // あんパンの中心の、足元からの高さ(px)。空中のコマの口は足元から 44〜49px なので、ジャンプの頂点の少し手前で届く
  BREAD_W: 26, // あんパンの幅・高さ(px)
  BREAD_HT: 20,
  BAR_H: 152, // 吊り下げる横棒の、足元からの高さ(px)
  JUMP_PREP: 0.06, // 踏み切りのコマを見せる時間(秒。地面にいる)
  JUMP_AIR: 0.56, // 空中にいる時間(秒)
  JUMP_LAND: 0.12, // 着地のコマを見せる時間(秒。地面にいる)
  JUMP_H: 70, // ジャンプの高さ(px)
  HIT_Y: 16, // 口があんパンの真下を通るとき、口とあんパンの中心の高さの差がこれ以内なら成功(px)
  MISS_SLOW: 0.55, // 失敗したときに速さにかける倍率(一時的な減速。そのあとは連打・CPU の加速で戻る)
  // CPU 3 人のジャンプの成功率(3 人に 1 つずつ割り振る)。失敗する回は、わざとタイミングを外す
  CPU_JUMP_SUCCESS: [0.85, 0.65, 0.45],
  CPU_HIT_ERR: 0.05, // 成功する回のタイミングのずれ(秒、±)
  CPU_MISS_ERR: [0.24, 0.34], // 失敗する回のタイミングのずれ(秒、早すぎ・遅すぎのどちらか)
};

// 綱引きの調整値(2 対 2。プレイヤー + 味方 CPU が左、敵 CPU 2 人が右)。px は画面の px
// 綱の目印の位置 p(中央 0、右が +)。引く力は綱の速さに足され(PULL_IMPULSE × 力)、DAMP で弱まる。
// 1 回の引きで動く距離の目安 = 力 × PULL_IMPULSE ÷ DAMP(PERFECT で約 37px)
PO.TUG = {
  TIME_LIMIT: 30, // 制限時間(秒。暫定)
  OVERTIME: 10, // 時間切れで目印がちょうど中央(TIE_PX 以内)のときの延長(秒)
  TIE_PX: 2,
  WIN_PX: 120, // 目印が中央からこれだけ動いたら(勝敗判定ライン)決着
  INTRO: 1.0, // 入場(秒)
  READY: 1.3, // READY の表示(秒)
  SET_MIN: 0.8, // SET から PULL!! までのランダムな待ち(秒)
  SET_MAX: 1.6,
  END_WAIT: 3.2, // 決着からリザルトまで(秒)
  // タイミングゲージ: カーソルが左右を往復する(1 往復 GAUGE_PERIOD 秒)。1 往復に 1 回だけ押せる(連打は無効)
  GAUGE_PERIOD: 1.6,
  // 判定の範囲(ゲージの中央からのずれ。ゲージの幅を 1 とする)。外側は MISS
  ZONES: { PERFECT: 0.05, GREAT: 0.12, GOOD: 0.22 },
  FORCE: { PERFECT: 1.0, GREAT: 0.6, GOOD: 0.3, MISS: 0 }, // 引く力
  PULL_IMPULSE: 60, // 力 1 で綱に足される速さ(px/秒)
  DAMP: 1.6, // 綱の速さの減り方(1/秒)
  // CPU の判定の確率(残りは MISS)。味方はやや上手、敵はやや下手(初心者でもタイミングを覚えれば勝てる)
  CPU_ALLY: { PERFECT: 0.2, GREAT: 0.35, GOOD: 0.3 },
  CPU_ENEMY: { PERFECT: 0.15, GREAT: 0.3, GOOD: 0.3 },
  PULL_SHOW: 0.35, // 引いたあと「引く」のコマを見せる時間(秒)
  STRAIN_V: 12, // 綱が自分のチームと逆へこの速さ(px/秒)以上で動いているときは「踏ん張り」のコマ
  // 配置: 中央の目印から前の人の手まで FRONT_GAP、前の人と後ろの人の手の間 MEMBER_GAP
  FRONT_GAP: 70,
  MEMBER_GAP: 84,
  GAUGE: { x: 230, y: 430, w: 500, h: 34 }, // ゲージの位置(競技場の奥のレーンの上)
};

// 玉入れの調整値(1 人 + CPU 3 人の個人戦)。px は画面の px
// 操作: RUN(SPACE / PICK)で玉を拾い、ACTION(ENTER / THROW)で投げる。交互に押す。
// 手が空なのに投げる・玉を持っているのに拾う(= 同じキーを続けて押した)と、PENALTY 秒だけ操作できない
PO.BALL_TOSS = {
  TIME_LIMIT: 30, // 制限時間(秒)
  INTRO: 1.0, // 入場(秒)
  READY: 1.2, // READY の表示(秒)
  SET_MIN: 0.8, // SET から START!! までのランダムな待ち(秒)
  SET_MAX: 1.4,
  END_WAIT: 3.2, // 順位発表(勝敗のポーズ)からリザルトまで(秒)
  COUNTDOWN: 5, // 残りこの秒数からカウントダウンの音を鳴らし、観客の歓声を大きくする
  PENALTY: 0.3, // 操作ミスで操作できない時間(秒。軽め)
  PLAYER_HIT: 0.8, // プレイヤーの投げた玉がカゴに入る確率
  // CPU 3 人の速さ(1 秒に投げる回数)とカゴに入る確率。3 人に 1 つずつ割り振る(速い・ふつう・遅い)
  CPU_RATES: [2.6, 2.3, 2.0],
  CPU_HITS: [0.75, 0.7, 0.65],
  CPU_SPEED_SCALE: 0.9, // CPU の速さの倍率(難易度。1.0 = 初版、小さいほどやさしい)。2026-11-18、実機プレイのあと 1.0 → 1.2。2026-11-19、実機プレイ(CPU 71・56・45 個、プレイヤー 39 個)のあと 75% の 0.9 に(弱すぎたら変更前の 80% = 0.96 にする予定)
  CPU_JITTER: 0.25, // CPU の動作の間隔のゆらぎ(± の割合)。全員が同じタイミングにならないようにする
  CPU_START: [0.15, 0.6], // START!! から CPU が最初に拾うまでの時間(秒、ランダム)
  PICK_SHOW: 0.14, // 拾うコマを見せる時間(秒。そのあとは振りかぶって玉を持つコマ)
  THROW_SHOW: 0.18, // 投げるコマを見せる時間(秒。そのあと手が空なら待機のポーズ)
  // 玉の飛び方: 放物線。FLIGHT 秒でカゴに届く。重力 GRAVITY px/秒²
  FLIGHT: 0.7,
  GRAVITY: 1500,
  BALL_R: 6, // 玉の半径(px)
  // カゴ(画面中央の高い支柱の上)。BASKET_Y = カゴの口の高さ、BASKET_W = 口の幅
  BASKET_X: 480,
  BASKET_Y: 262,
  BASKET_W: 70,
  BASKET_DEPTH: 46, // 網の深さ(px)
  POLE_BASE_Y: 560, // 支柱の根元(地面)の y
  // 4 人の立ち位置(足元)。0 = プレイヤー(左手前)、1〜3 = CPU。side -1 = 左側(右向き)、+1 = 右側(左右反転)
  SPOTS: [
    { x: 300, y: 634, side: -1 },
    { x: 660, y: 634, side: 1 },
    { x: 350, y: 506, side: -1 },
    { x: 610, y: 506, side: 1 },
  ],
  // 地面の玉: 最初は 1 人 GROUND_START 個。拾うたびに、その色が GROUND_MIN 個未満なら 1 個足す(なくならない)
  GROUND_START: 14,
  GROUND_MIN: 10,
  GROUND_MAX: 90, // 地面の玉の総数の上限(外れた玉が落ちて増えすぎないように)
  GROUND_AREA: { x0: 40, x1: 920, y0: 452, y1: 676 },
  GROUND_NEAR: { share: 0.75, dx: 170, dy: 70 }, // 地面の玉の share の割合は持ち主のまわり(足元から ±dx, ±dy)に置く
  SETTLE_MAX: 2.0, // 時間切れのあと、飛んでいる玉が落ちきるのを待つ最大時間(秒)
};

// 缶蹴りの調整値(1 人 + CPU 3 人が 1 人ずつ 3 回ずつ試技。いちばん遠い飛距離で順位)。距離は m、px は画面の px
// 操作: RUN 連打で助走 → キックラインの手前で ACTION を押す(助走終了)→ 押している間だけ角度が上がる → 離した瞬間に蹴る
// 飛距離(キックラインから最初に地面に着いた位置まで)= DIST_K × 助走の速さ² × sin(2 × 角度) × ラインの近さの係数
//   ラインの近さの係数 = max(LINE_MIN, 1 - ラインまでの距離 / LINE_FALLOFF)。速く・ラインぎりぎり・45 度で最も遠くへ飛ぶ
PO.CAN_KICK = {
  TRIES: 3, // 1 人の試技の回数
  RUNUP: 25, // スタートからキックラインまで(m)
  CAN_OFFSET: 0.4, // キックラインから缶までの距離(m)
  // 助走(プレイヤー): 100m 走と同じ式。連打 1 回で TAP_BOOST 加速、DRAG × 速さ + FRICTION で減速、VMAX で頭打ち
  TAP_BOOST: 1.2,
  DRAG: 1.0,
  FRICTION: 0.6,
  VMAX: 11.0,
  RUN_TIMEOUT: 10, // 助走を始めてから(READY のあと)この秒数のうちに蹴らなければ FOUL
  AIM_DECEL: 30, // ACTION を押したあと助走を止める減速(m/s²。キックラインは越えない)
  // 角度: ACTION を押している間 ANGLE_SPEED 度/秒で上がる(ANGLE_MIN から ANGLE_MAX まで)。最大のまま AUTO_KICK 秒たつと自動で蹴る
  ANGLE_SPEED: 60,
  ANGLE_MIN: 5,
  ANGLE_MAX: 85,
  AUTO_KICK: 0.5,
  // 飛距離
  DIST_K: 0.5, // 9 m/s・45 度・ラインぎりぎりで約 40m
  LINE_FALLOFF: 3, // ラインからこれだけ離れて蹴ると係数 0
  LINE_MIN: 0.4, // ラインの近さの係数の下限
  // 缶の飛び方(見た目。飛距離は上の式で決まる)
  FLIGHT_BASE: 0.5, // 飛んでいる時間(秒)= FLIGHT_BASE + FLIGHT_K × sin(角度) × min(1, 飛距離 / 30)
  FLIGHT_K: 1.4,
  HEIGHT_K: 0.35, // 高さ(px)= 飛距離 × tan(角度) ÷ 4 × 1m の px × HEIGHT_K(画面に収めるため本物より低い)
  HEIGHT_MAX: 290,
  SPIN: 14, // 飛んでいる間の回転(ラジアン/秒)
  // 着地後のバウンド(演出。飛距離には入れない): [高さの比, 進む距離の比] × 回数、そのあと ROLL m 転がる
  BOUNCES: [
    [0.3, 0.1],
    [0.12, 0.05],
    [0.05, 0.025],
  ],
  BOUNCE_MIN: 0.6, // バウンドで進む最小の距離(m)
  ROLL: 0.8,
  ROLL_T: 0.6,
  // 演出の時間(秒)。CPU の試技はテンポよく短め
  INTRO: 1.0,
  READY_PLAYER: 1.3,
  READY_CPU: 0.8,
  KICK_SHOW: 0.3, // 蹴るポーズを見せる時間
  SHOW_PLAYER: 1.8, // 飛距離の大きな表示(着地してから)
  SHOW_CPU: 1.2,
  FOUL_SHOW: 1.5,
  END_WAIT: 3.4, // 順位発表からリザルトまで
  // CPU(3 人に 1 つずつ割り振る。強い・ふつう・弱い)
  CPU_SPEEDS: [
    [8.2, 8.8],
    [7.6, 8.2],
    [6.8, 7.4],
  ], // 助走の速さ(m/s)
  CPU_SPEED_SCALE: 1.0, // CPU の強さの倍率(助走の速さにかける。1.0 = 標準)
  CPU_GAP: [
    [0.05, 0.3],
    [0.1, 0.5],
    [0.2, 0.8],
  ], // 蹴る位置(キックラインの何 m 手前で ACTION を押すか)
  CPU_FOUL: [0.08, 0.12, 0.16], // FOUL(ラインを越えてしまう)の確率
  CPU_ANGLE_ERR: [5, 9, 13], // 角度のばらつき(45 度から ± 度)
  CPU_ACCEL_K: 1.5,
  CPU_ACCEL_MAX: 6.0,
  CPU_REACT: [0.15, 0.35], // READY のあと走り出すまで(秒)
  CAN_W: 12, // 缶の大きさ(px)
  CAN_H: 18,
};

// 400m リレーの調整値。走り・CPU の走り方・スタートは 100m 走(PO.DASH100)と同じで、ここに書いたものだけ上書き・追加する
// 1 チーム = 同じキャラクター 4 人。100m ごとにバトン交換(交換ゾーンの中で ACTION)。距離は m
PO.RELAY = {
  DIST: 400,
  LEGS: 4,
  TIME_LIMIT: 120, // これを過ぎてもゴールしていなければ記録なし(秒)
  FINISH_WAIT: 3.6, // 全チームがゴールしてからリザルトまで(秒)
  CPU_SPEED_SCALE: 0.64, // CPU の巡航速度の倍率(リレーだけ。2026-11-19、実機プレイで 400m の連打がきついため 0.8 → 0.64 = 2 割遅く)
  // バトン交換: 交換地点 EXCHANGES の手前 ZONE_IN m 〜 先 ZONE_OUT m が交換ゾーン。ゾーンの中で ACTION を押すと交換する
  //   判定は交換地点からのずれ: PERFECT_M 以内 = PERFECT、GOOD_M 以内 = GOOD、それ以外(ゾーンの中)= MISS
  //   ゾーンの外で押しても何も起きない。押さずにゾーンを通り過ぎたら、ゾーンの終わりで自動的に MISS で交換する
  EXCHANGES: [100, 200, 300],
  // 2026-11-19、実機プレイで 3 回とも交換に失敗したため緩和(ゾーン 手前 8m・先 5m → 前後 10m、PERFECT ±1.5m → ±3m、GOOD ±4m → ±6m)
  ZONE_IN: 10,
  ZONE_OUT: 10,
  PERFECT_M: 3,
  GOOD_M: 6,
  KEEP: { PERFECT: 1.0, GOOD: 0.85, MISS: 0.55 }, // 交換したときに速さにかける倍率
  LEAD: 0.5, // 次の走者は前の走者のこれだけ前を走りながらバトンを受け取る(m。見た目)
  APPROACH: 25, // プレイヤーがこれだけ手前まで来たら、交換のタイミングのバーを出す(m)
  // CPU のバトン交換の判定の確率(残りは MISS)。CPU の速い・ふつう・遅いの順に割り振る
  CPU_PASS: [
    { PERFECT: 0.6, GOOD: 0.3 },
    { PERFECT: 0.45, GOOD: 0.35 },
    { PERFECT: 0.3, GOOD: 0.4 },
  ],
  FINAL_SHOW: 1.6, // FINAL RUNNER! の表示(秒)
  JUDGE_SHOW: 1.2, // 交換の判定の大きな表示(秒)
};

// 通過基準(TARGET)。ラウンドごと・種目ごとに 1 つ。プレイヤー自身の記録で判定する(基準値と同じ記録も CLEAR)
//   kind: 'time'(max 秒以内)/ 'rank'(max 位以内)/ 'count'(min 個以上)/ 'distance'(min m 以上)
//   記録なし(DNF・3 回とも FOUL など)は未達成。ラウンドごとの値を下に書く(書いていないラウンドは、それより前でいちばん近いラウンドの値)
PO.TARGETS = {
  1: {
    dash100: { kind: 'time', max: 15 }, // 2026-11-19 暫定
    anpan: { kind: 'time', max: 18 },
    tug: { kind: 'rank', max: 1 }, // 勝ったときだけ CLEAR(2026-11-19 に 3 位以内から変更。表示は WIN)
    balltoss: { kind: 'count', min: 30 }, // 2026-11-19 に 40 → 30(実機プレイのあと。CPU の速さも 75% に)
    cankick: { kind: 'distance', min: 20 },
    relay: { kind: 'time', max: 75 },
  },
  // ROUND 2〜6(2026-11-19 の初期設定値。テストプレイのあとで調整する)。R7 以降は R6 の値を使う(PO.target.get の決まり)
  2: { dash100: { kind: 'time', max: 14.5 }, anpan: { kind: 'time', max: 17 }, tug: { kind: 'rank', max: 1 }, balltoss: { kind: 'count', min: 40 }, cankick: { kind: 'distance', min: 22 }, relay: { kind: 'time', max: 72 } },
  3: { dash100: { kind: 'time', max: 14 }, anpan: { kind: 'time', max: 16 }, tug: { kind: 'rank', max: 1 }, balltoss: { kind: 'count', min: 50 }, cankick: { kind: 'distance', min: 24 }, relay: { kind: 'time', max: 69 } },
  4: { dash100: { kind: 'time', max: 13.5 }, anpan: { kind: 'time', max: 15 }, tug: { kind: 'rank', max: 1 }, balltoss: { kind: 'count', min: 60 }, cankick: { kind: 'distance', min: 26 }, relay: { kind: 'time', max: 66 } },
  5: { dash100: { kind: 'time', max: 13 }, anpan: { kind: 'time', max: 14 }, tug: { kind: 'rank', max: 1 }, balltoss: { kind: 'count', min: 70 }, cankick: { kind: 'distance', min: 28 }, relay: { kind: 'time', max: 63 } },
  6: { dash100: { kind: 'time', max: 12.5 }, anpan: { kind: 'time', max: 13 }, tug: { kind: 'rank', max: 1 }, balltoss: { kind: 'count', min: 80 }, cankick: { kind: 'distance', min: 30 }, relay: { kind: 'time', max: 60 } },
};

// ---------------- ROUND 別の CPU の難易度(2026-11-19。数値は暫定。テストプレイのあとで種目ごとに調整する) ----------------
// cpuLevel: ROUND ごとの基準の CPU 能力(R1 = 1.00 = いまの R1 の CPU)。配列の最後の値を、それ以降の ROUND にも使う(R10 以降 = 1.80)
// 各種目の値は「R1 の値(各種目の調整値)」から js/core/difficulty.js が計算する。L = cpuLevel - 1(R1 = 0、R10 以降 = 0.8)として
//   scale: R1 の値 ×(1 + L × 重み)(速さ・頻度。上限 cap で止める)
//   add  : R1 の値 + L × 量(成功率。上限 max で止める)
//   shrink: R1 の値 ×(1 - L × 重み)(ばらつき・ファウル率。下限 min で止める)
// 種目ごとの重みは独立して変えられる。基準の CPU 能力を全種目に一律でかけるのではなく、種目に合わせて弱めたり上限で止めたりする
PO.ROUND_DIFFICULTY = {
  cpuLevel: [1.0, 1.05, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8],
  events: {
    // 100m 走: CPU の巡航速度。上限 = プレイヤーの最高速度(VMAX 11)より少し下(CPU が人間離れした速さにならない)
    dash100: { speed: 0.5, speedCap: 10.8 },
    // あんパン: CPU の巡航速度と、あんパンを取る成功率
    anpan: { speed: 0.5, speedCap: 10.8, jumpAdd: 0.3, jumpMax: 0.97 },
    // 綱引き(勝たないと GAME OVER なので、ほかより緩やか): 敵 CPU の PERFECT・GREAT の確率を上げる(MISS が減る)。
    //   合計(PERFECT + GREAT + GOOD)は total まで。味方 CPU とプレイヤーの操作(片道 1 回)は変えない。引く力も変えない
    tug: { perfect: 0.6, great: 0.3, total: 0.92 },
    // 玉入れ: CPU の拾う・投げる頻度(上限 rateCap 回/秒。拾う・投げるのコマが見える速さ)と命中率
    balltoss: { rate: 0.6, rateCap: 3.0, hitAdd: 0.25, hitMax: 0.95 },
    // 缶蹴り: CPU の助走の速さ、蹴る位置(ラインの手前の距離を短く)、角度のばらつき、ファウル率
    cankick: { speed: 0.4, speedCap: 10.8, gap: 0.5, gapMin: 0.02, angleErr: 0.7, angleErrMin: 1, foul: 0.9 },
    // リレー: CPU の巡航速度と、バトン交換の PERFECT の確率(成功 = PERFECT + GOOD の合計も少し上げる。上限 passTotal)
    relay: { speed: 0.5, speedCap: 10.8, perfectAdd: 0.3, perfectMax: 0.9, passTotal: 0.97 },
  },
  // リレーのプレイヤー(と CPU)のバトン交換の判定。R1・R2・R3 以降(最後の値をそれ以降にも使う)。交換ゾーンは全 ROUND 前後 10m(PO.RELAY)
  relayJudge: [
    { PERFECT_M: 3, GOOD_M: 6 },
    { PERFECT_M: 2, GOOD_M: 5 },
    { PERFECT_M: 1.5, GOOD_M: 4 },
  ],
};

// 総合順位のポイント(ROUND ごとに全 6 種目の合計で総合順位を決める。2026-11-19)。累積スコア(将来)とは別のデータ
//   ふつうの種目: 順位 → ポイント(同じ順位は同じポイント)。綱引き: 勝ったチームの 2 人 = win、負けたチームの 2 人 = lose
//   同点は 1 位(綱引きの勝ちを含む)の回数 → 2 位の回数 → 3 位相当(3 位・綱引きの負け)の回数 → プレイヤー → CPU の固定順
PO.RANK_POINTS = { 1: 4, 2: 3, 3: 2, 4: 1 };
PO.TUG_POINTS = { win: 4, lose: 2 };
PO.ROUND_INTRO_SEC = 2; // 競技の前の ROUND・種目名・TARGET の表示(秒)。2026-11-19 に 3 → 1 → 2
PO.HOWTO_SEC = 5; // 競技の前の操作説明のデモ(HOW TO PLAY)の表示(秒)。毎回出す。2026-11-19
PO.CEREMONY_SEC = 15; // 全 6 種目クリアのあとの表彰式(ROUND CLEAR の演出)の長さ(秒)。2026-11-19 α版

// ---------------- 累積スコア(1UP)・ハイスコア(2026-11-19) ----------------
// ゲームの始め(キャラクターを決めたとき)に 0。ROUND が変わっても続く。総合順位ポイント(PO.RANK_POINTS)・自己ベストとは別のデータ。
// 計算は js/core/score.js。種目のファイルには書かない
PO.SCORE = {
  // 競技記録による基本得点(最低 0 点、10 点未満は切り捨て。記録なし・NO MARK・未完走は 0 点)
  //   time  : (base - 記録の秒) × mult
  //   per   : 記録(個・m)× per
  //   tug   : 勝ち = win + 残り時間ボーナス(制限時間に対する残り時間の割合 × timeBonus)、負け = 0
  record: {
    dash100: { kind: 'time', base: 20, mult: 1000 },
    anpan: { kind: 'time', base: 25, mult: 1000 },
    tug: { kind: 'tug', win: 5000, timeBonus: 5000 },
    balltoss: { kind: 'per', per: 100 },
    cankick: { kind: 'per', per: 300 }, // 3 回のうちいちばん遠い飛距離(m)
    relay: { kind: 'time', base: 100, mult: 200 },
  },
  floor: 10, // この単位未満は切り捨て
  place: { 1: 3000, 2: 2000, 3: 1000, 4: 0 }, // 種目の順位ボーナス(同じ順位は同じ点。記録なしには付けない)
  tugPlace: { win: 3000, lose: 0 },
  target: 1000, // TARGET 達成ボーナス
  overall: { 1: 10000, 2: 5000, 3: 2000, 4: 0 }, // 全 6 種目のあとの総合順位ボーナス
  roundClear: 10000, // ROUND CLEAR ボーナス = roundClear × ROUND 番号(総合 1〜3 位のとき)
  digits: 6, // 表示の桁(ゼロ埋め)。これより大きい点は桁を増やす
  countSec: 1.0, // 加算のカウントアップの演出の長さ(秒。表示だけ。内部の点は一度に加える)
  HI_KEY: 'punks-olympic-hiscore-v1', // ハイスコアの保存先(自己ベストの保存先とは別)
  GAME_CODE: 'punks-olympic', // 将来の世界ランキング(API・DB)に送る game_code
};
