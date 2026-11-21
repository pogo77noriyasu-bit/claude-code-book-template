// ステージ 1「斜め鉄骨」の定義データ
// ステージはデータだけで表す。ロジックは geometry / physics / hazards 側に置く。
// 2 面以降(ベルトコンベア・エレベーター・リベット)は同じ形式で js/stages/ に追加し、
// DP.stages に登録する想定。
window.DP = window.DP || {};
DP.stages = DP.stages || [];

DP.stages.push({
  id: 'girders',
  name: 'STAGE 1',
  // この面の仕掛け(js/mechanics.js)。ゴリラ警官がビールを転がす
  mechanics: ['beerThrow'],
  // 鉄骨: (x1, y1) から (x2, y2) への線分。y は上面(立つ面)の高さ。
  // 低い側(y が大きい側)へ障害物が転がる。
  girders: [
    { id: 'g0', x1: 0, y1: 540, x2: 480, y2: 528 }, // 最下段(左へ転がる→画面外へ)
    { id: 'g1', x1: 0, y1: 452, x2: 448, y2: 470 }, // 右へ転がる
    { id: 'g2', x1: 32, y1: 388, x2: 480, y2: 370 }, // 左へ転がる
    { id: 'g3', x1: 0, y1: 290, x2: 448, y2: 308 }, // 右へ転がる
    { id: 'g4', x1: 32, y1: 228, x2: 480, y2: 210 }, // 左へ転がる
    { id: 'g5', x1: 0, y1: 146, x2: 448, y2: 158 }, // ゴリラ警官の段。右へ転がる
    { id: 'top', x1: 176, y1: 82, x2: 304, y2: 82, noHazard: true }, // ヒロインの足場
  ],
  // ハシゴ: x の位置で、lower 段から upper 段までをつなぐ
  ladders: [
    { x: 110, lower: 'g0', upper: 'g1' },
    { x: 380, lower: 'g0', upper: 'g1' },
    { x: 72, lower: 'g1', upper: 'g2' },
    { x: 256, lower: 'g1', upper: 'g2' },
    { x: 184, lower: 'g2', upper: 'g3' },
    { x: 404, lower: 'g2', upper: 'g3' },
    { x: 92, lower: 'g3', upper: 'g4' },
    { x: 316, lower: 'g3', upper: 'g4' },
    { x: 216, lower: 'g4', upper: 'g5' },
    { x: 408, lower: 'g4', upper: 'g5' },
    { x: 288, lower: 'g5', upper: 'top', noHazard: true },
    // 途中で切れているハシゴ(途中まで登れるが上の段には届かない)。
    // 正規のハシゴの番号を変えないよう、最後に足す
    { x: 250, lower: 'g0', upper: 'g1', broken: true },
    { x: 160, lower: 'g1', upper: 'g2', broken: true },
    { x: 300, lower: 'g2', upper: 'g3', broken: true },
    { x: 200, lower: 'g3', upper: 'g4', broken: true },
  ],
  // アイテム(釘バット)。触れると自動で拾うので、ハシゴからハシゴへの通り道から外れた
  // 鉄骨の端に置く(取りたい人だけ寄り道する)
  items: [
    { type: 'bat', girder: 'g2', x: 450 },
    { type: 'bat', girder: 'g4', x: 55 },
  ],
  playerStart: { x: 40, girder: 'g0', facing: 1 },
  // ゴリラ警官(左上)。throwX はビールを置く位置
  boss: { x: 56, girder: 'g5', throwX: 104 },
  // クリア後の逃走演出。ladders: ゴリラとガールの間に立つ、g5 から画面の最上部までの 2 本のハシゴの x
  // (飾り。level.ladders には入れないのでプレイヤーはつかめず、障害物も降りない)。
  // grabX: ガールを捕まえるときにゴリラが立つ位置 / girlEdgeX: ガールが引き寄せられる足場の端
  escape: { ladders: [120, 152], grabX: 162, girlEdgeX: 188 },
  // スキンヘッドガール。触れるとクリア
  heroine: { x: 210, girder: 'top' },
  // 投げる間隔(ステップ)。周回が進むと短くなる
  throwInterval: { min: 110, max: 200 },
  // 缶の出る割合(残りはビール瓶)
  canRatio: 0.4,
  // 斜め投げ(面ごとに投げる物と動きを変えられる。js/hazards.js)。
  //   type: 投げる物 / motion: 'zigzag'(ジグザグ落下。DP.hazards.zigzag)か 'arc'(放物線。DP.hazards.launch)/
  //   handDx・handDy: ゴリラの足元からの投げ始めの位置(頭の上)
  // ジグザグ落下(1 面のゴミ箱): 投げるたびに水平から angleMin〜angleMax 度の角度を選び(coreChance の割合で coreMin〜coreMax 度の中心の範囲、
  // 残りはそれ以外の範囲から一様に)、
  // speed × 周回の速さの倍率(瓶・缶と同じ。R5 2.4・R10 2.7 px/ステップ)で、重力なしにまっすぐ斜め下へ進む。
  // 鉄骨に当たるたびに左右だけ反転して(角度は同じ)その鉄骨を通り抜け、最下段の下へ抜けたら消える。R5・R10 のプレイを見てここで調整する
  // 角度は最初 45〜75 度だったが、縦に落ちすぎて画面の左側の狭い範囲に集まったので、20〜45 度(25〜35 度が中心)にした。
  // それでも鉄骨のたびの反転で投げた位置(左上)のまわりを往復して左側に閉じ込められたので、最初の 1 区間(最初の鉄骨に当たるまで)だけ
  // firstAngleMin〜firstAngleMax 度(一様)で横へ長く飛ばし、最初の鉄骨から 20〜45 度に切り替える(中央・右側にも飛んでくる)。
  // 10〜25 度では左 64%・中央 29%・右 7% と左寄りだったので、5〜15 度にした(左右にほぼ均等に散らばる)
  lob: { type: 'trash', motion: 'zigzag', handDx: 18, handDy: -54, speed: 1.5, angleMin: 20, angleMax: 45, coreMin: 25, coreMax: 35, coreChance: 0.7, firstAngleMin: 5, firstAngleMax: 15 },
  // 周回ごとの難しさ(1 行目が R1。R11 以降は最後の行 = R10 を使う。DP.hazards.roundRules)。
  // 速さと投げる間隔は game.js の difficulty() のまま(R7・R6 で上限)。R10 まではここで段階的に難しくする。
  // 開始時(ミス後の再開も)の鉄骨の上には、どの周回でも瓶・缶はない。瓶・缶はすべてゴリラが投げて出す。
  //   openingThrows: プレイが始まってすぐ、ゴリラが続けて投げる本数(開幕の連続投げ。同じ種類で、端と端を 140px 以上あける)
  //   openingPairs: 開幕の連続投げのうち、必ず 2 個セットにする番号(何本目か)
  //   pairRate: ゴリラが投げるときの 2 個セットの割合 / doubleRate: 連投の割合(開幕の連続投げの間は連投しない)
  //   trashRate: 通常の投げ方のうち、ゴミ箱(斜め投げ)に置き換える割合。開幕の連続投げ・連投の 2 本目はゴミ箱にしない。
  //   0 の周回(R1〜R4)では乱数を引かないので、R1〜R4 の投げる時刻・種類・軌跡は今までと同じ
  // R1 はすべて 0(乱数も引かないので、R1 の投げる時刻・種類・軌跡は改修前と同じ)
  // 開幕の本数は、開始時の配置があったころと「無敵でよけずに最短ルートを進んだときにぶつかる数」がそろうよう、提案から ±1 本で調整した
  roundRules: [
    { openingThrows: 0, openingPairs: [], pairRate: 0, doubleRate: 0, trashRate: 0 }, // R1
    { openingThrows: 1, openingPairs: [], pairRate: 0.1, doubleRate: 0, trashRate: 0 }, // R2
    { openingThrows: 2, openingPairs: [], pairRate: 0.15, doubleRate: 0, trashRate: 0 }, // R3
    { openingThrows: 2, openingPairs: [2], pairRate: 0.2, doubleRate: 0.1, trashRate: 0 }, // R4
    { openingThrows: 5, openingPairs: [3], pairRate: 0.25, doubleRate: 0.1, trashRate: 0.1 }, // R5(提案の 4 本から +1)
    { openingThrows: 5, openingPairs: [3], pairRate: 0.3, doubleRate: 0.15, trashRate: 0.1 }, // R6(提案の 4 本から +1)
    { openingThrows: 6, openingPairs: [3, 4], pairRate: 0.35, doubleRate: 0.15, trashRate: 0.2 }, // R7(提案の 5 本から +1)
    { openingThrows: 6, openingPairs: [3, 4], pairRate: 0.4, doubleRate: 0.2, trashRate: 0.2 }, // R8(提案の 5 本から +1)
    { openingThrows: 6, openingPairs: [4, 5], pairRate: 0.45, doubleRate: 0.2, trashRate: 0.25 }, // R9
    { openingThrows: 6, openingPairs: [3, 4, 5], pairRate: 0.5, doubleRate: 0.25, trashRate: 0.3 }, // R10 以降
  ],
});
