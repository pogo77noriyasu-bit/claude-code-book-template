// ステージ 1「斜め鉄骨」の定義データ
// ステージはデータだけで表す。ロジックは geometry / physics / hazards 側に置く。
// 2 面以降(ベルトコンベア・エレベーター・リベット)は同じ形式で js/stages/ に追加し、
// DP.stages に登録する想定。
window.DP = window.DP || {};
DP.stages = DP.stages || [];

DP.stages.push({
  id: 'girders',
  name: 'STAGE 1',
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
  // スキンヘッドガール。触れるとクリア
  heroine: { x: 210, girder: 'top' },
  // 投げる間隔(ステップ)。周回が進むと短くなる
  throwInterval: { min: 110, max: 200 },
  // 缶の出る割合(残りはビール瓶)
  canRatio: 0.4,
});
