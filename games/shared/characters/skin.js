// POGO77 GAMES 共通キャラクター: スキンズ(スキンヘッズ)の画像 skin.png の情報
// 元画像: games/punks-olympic/assets/chars/skin.png の写し(PUNKS OLYMPIC 側は変更しない・ここを参照させない)。
// 画像の形: 112×128 のセルを横に 4 つ(走り run0〜3、右向き)。足元(影の下端)はセルの 126 行目、左右中央。
// 体の範囲(実測): 横 x 15〜97、縦 y 22〜118。y 119〜126 は足と地面の影が重なっている。
window.POGO77 = window.POGO77 || {};
POGO77.chars = POGO77.chars || {};

POGO77.chars.SKIN = {
  src: 'skin.png', // このファイルと同じディレクトリ
  cellW: 112,
  cellH: 128,
  frames: 4,
  // 影を除いて使うときの切り出し範囲(セルの中の座標)
  body: { x: 15, y: 22, w: 83, h: 98 },
};
