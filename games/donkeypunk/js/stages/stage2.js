// ステージ 2「ライブハウス搬入口」の定義データ
// 足場はすべて平ら。kind: 'conveyor' はベルトコンベア。conveyor: { dir: 流れる向き(1 = 右 / -1 = 左),
// reverseEvery: 何ステップごとに向きが逆転するか(書かなければ逆転しない) }。速さは config.conveyor.speed。
// 中央の左右のコンベアのすき間(x 220〜260)には「爆音アンプ」(今は見た目だけ)。
//
// 段の間隔は約 95px(ハシゴを使わずに落ちるとミスになる高さ)。
//   y=540 床 / y=445 下段コンベア / y=350 中段の足場(画面の端から端まで 1 枚)
//   (床・下段・中段の足場・中段・最上段は画面の端まで届いているので、画面の左右の端からは落ちない)
//   y=255 中段コンベア(左右に分かれる)/ y=160 最上段コンベア(ゴリラ警官)/ y=82 ガールの足場
window.DP = window.DP || {};
DP.stages = DP.stages || [];

DP.stages.push({
  id: 'livehouse',
  name: 'STAGE 2',
  // この面の仕掛け。ベルトコンベアが動き、爆音アンプ(本体と炎)に触れると炎上する。
  // ファイヤースカルが出現して足場とハシゴを動き回る。ゴリラはビールを投げず、バズーカ砲で蛇行ミサイルを撃つ
  mechanics: ['conveyors', 'amp', 'fireSkulls', 'bazooka'],
  // ゴリラ警官のバズーカ砲(仕掛け 'bazooka'、js/bazooka.js)。周回ごとの値: 1 行目が R1。R11 以降は最後の行(R10)で上限。
  //   aim: 狙う時間(構えたあと、発射までの予告。ステップ)/ interval: 発射から次の発射まで(ステップ)/
  //   speed: 弾速(px/ステップ)/ amp: 蛇行の幅(片側 px)/ wave: 波の長さ(進む距離 px)/ maxAlive: 同時に飛べる数
  // 試作値。DEV モード(?dev&round=10&stage=2)で遊んで調整する
  bazooka: {
    rounds: [
      { aim: 60, interval: 330, speed: 1.8, amp: 10, wave: 120, maxAlive: 1 }, // R1
      { aim: 56, interval: 300, speed: 1.9, amp: 11, wave: 116, maxAlive: 1 }, // R2
      { aim: 52, interval: 280, speed: 2.0, amp: 12, wave: 112, maxAlive: 1 }, // R3
      { aim: 50, interval: 260, speed: 2.1, amp: 13, wave: 108, maxAlive: 2 }, // R4
      { aim: 48, interval: 240, speed: 2.2, amp: 14, wave: 104, maxAlive: 2 }, // R5
      { aim: 46, interval: 220, speed: 2.3, amp: 15, wave: 100, maxAlive: 2 }, // R6
      { aim: 44, interval: 200, speed: 2.4, amp: 16, wave: 96, maxAlive: 2 }, // R7
      { aim: 42, interval: 185, speed: 2.5, amp: 17, wave: 92, maxAlive: 2 }, // R8
      { aim: 40, interval: 170, speed: 2.6, amp: 18, wave: 88, maxAlive: 2 }, // R9
      { aim: 38, interval: 150, speed: 2.7, amp: 18, wave: 84, maxAlive: 2 }, // R10〜(上限)
    ],
  },
  // ファイヤースカルは爆音アンプから出現し、左右どちらかの中段コンベアへ飛び出して着地する。
  // landings: 着地点(アンプの当たり判定に触れない位置)と、着地後に向く方向(アンプから離れる向き)
  skulls: {
    landings: [
      { girder: 'c2l', x: 200, dir: -1 },
      { girder: 'c2r', x: 280, dir: 1 },
    ],
  },
  // 鉄骨の色(錆びた茶色)。1 面は指定なし = ピンク
  girderColors: { body: '#9a5226', top: '#d08a52', bottom: '#4e260e' },
  // 中央の「爆音アンプ」。本体と炎に触れると炎上してミス(当たり判定は config.amp)。敵の生成・攻撃はまだない。
  // x: 中心 / y: アンプの下端 / standBottom: 下の格子の台が届く高さ(中段の足場の上面)
  amp: { x: 240, y: 258, standBottom: 350 },
  girders: [
    { id: 'f0', x1: 0, y1: 540, x2: 480, y2: 540 }, // 床(スタート)
    { id: 'c1', x1: 0, y1: 445, x2: 480, y2: 445, kind: 'conveyor', conveyor: { dir: 1, reverseEvery: 480 } }, // 下段コンベア(8 秒ごとに逆転。画面の端から端まで)
    { id: 'mid', x1: 0, y1: 350, x2: 480, y2: 350 }, // 中段の足場(茶色。画面の左端から右端まで 1 枚。すき間なし)
    { id: 'c2l', x1: 0, y1: 255, x2: 220, y2: 255, kind: 'conveyor', conveyor: { dir: 1 } }, // 中段コンベア(左。アンプへ向かう。左端は画面の端まで)
    { id: 'c2r', x1: 260, y1: 255, x2: 480, y2: 255, kind: 'conveyor', conveyor: { dir: -1 } }, // 中段コンベア(右。アンプへ向かう。右端は画面の端まで)
    { id: 'c3', x1: 0, y1: 160, x2: 480, y2: 160, kind: 'conveyor', conveyor: { dir: -1, reverseEvery: 360 } }, // 最上段コンベア(ゴリラ警官。6 秒ごとに逆転。画面の端から端まで)
    { id: 'top', x1: 176, y1: 82, x2: 304, y2: 82, noHazard: true }, // ガールの足場(1 面と同じ位置)
  ],
  // ハシゴはジグザグに置く: 左右どちらか片側だけで最上段まで登れないようにし、
  // 各段でコンベアや足場を横断させる(最短クリアは約 19 秒)。
  //   床を右へ → 下段コンベアを左へ(x=64 か 200 で中段の足場へ)→ 中段の足場を横へ
  //   → 中段左コンベア(x=96)なら右へ、中段右コンベア(x=296 / 384)なら流れに逆らって右へ → 最上段 → ガール
  // 中段の足場は端から端まで 1 枚なので、下段からの 2 本と中段コンベアへの 3 本を自由に組み合わせられる(6 通り)。
  ladders: [
    // 床 → 下段コンベア(右端だけ。スタート x=60 から床を横断する)
    { x: 440, lower: 'f0', upper: 'c1' },
    // 下段コンベア → 中段の足場(どちらも下段コンベアを左へ横断した先)
    { x: 64, lower: 'c1', upper: 'mid' },
    { x: 200, lower: 'c1', upper: 'mid' },
    // 中段の足場 → 中段コンベア
    { x: 96, lower: 'mid', upper: 'c2l' },
    { x: 296, lower: 'mid', upper: 'c2r' },
    { x: 384, lower: 'mid', upper: 'c2r' },
    // 中段コンベア → 最上段コンベア(ゴリラ警官より右に出る)
    { x: 200, lower: 'c2l', upper: 'c3' },
    { x: 448, lower: 'c2r', upper: 'c3' },
    // 最上段 → ガールの足場
    { x: 288, lower: 'c3', upper: 'top', noHazard: true },
  ],
  // 釘バット(1 面と同じく浮かせて置き、ジャンプで取る)。ハシゴからハシゴへの通り道から外れた場所
  items: [
    { type: 'bat', girder: 'mid', x: 32 },
    { type: 'bat', girder: 'c1', x: 345 },
  ],
  playerStart: { x: 60, girder: 'f0', facing: 1 },
  // ゴリラ警官(最上段の左)。バズーカ砲を構えて蛇行ミサイルを撃つ(歩かない)
  boss: { x: 56, girder: 'c3' },
  // クリア後の逃走演出(1 面と同じ配置。逃走用ハシゴは c3 から画面の最上部まで)
  escape: { ladders: [120, 152], grabX: 162, girlEdgeX: 188 },
  heroine: { x: 210, girder: 'top' },
});
