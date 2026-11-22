// POGO77 GAMES 共通キャラクター: 赤モヒカンのパンクス(20×20 ドット、右向き)
// 元データ: games/donkeypunk/js/sprites.js の HEAD / pad4 / punk と punkStand / punkWalk / punkJump の写し
// (ドット・色は変えていない。ドンキーパンク本体は変更しない・ここを参照させない)。
// 必要: pixel-sprite.js を先に読み込むこと。
(function () {
  const def = POGO77.chars.def;

  // モヒカンと顔(20 幅 × 11 行)。80 年代ハードコアパンクスの大きな扇形のモヒカン
  const HEAD = [
    '.......R.R..R.......',
    '....R..RRRR.RR..R...',
    '....RR.RRRRRRR.RR...',
    '.R..RRRRRRRRRRRR....',
    '.RRRRRRRRRRRRRR.....',
    '..RRRRRRrRrRrRR.....',
    'RRRRRRRrRrRrRR......',
    '.RRRRRRSSSSSS.......',
    'RRRRRrRSSSSKS.......',
    '.RRRRRRSSSSSSG......',
    '..RRRrr.SsSS........',
  ];
  // 12 幅で書いた体の行を左右 4 ドットずつ広げる
  const pad4 = (r) => '....' + r + '....';
  const punk = (bodyRows) => def(HEAD.concat(bodyRows.map(pad4)));

  POGO77.chars.register({
    punkStand: punk([
      '...KKKKKK...',
      '..KKGKKKKS..',
      '..KKKKKKKS..',
      '..SKKKKKK...',
      '...JJJJJ....',
      '...JJ.JJ....',
      '...JJ.JJ....',
      '..BBB.BBB...',
      '..bbb.bbbb..',
    ]),
    punkWalk: punk([
      '...KKKKKK...',
      '..KKGKKKKS..',
      '.SKKKKKKK...',
      '...KKKKKK...',
      '...JJJJJ....',
      '..JJJ.JJJ...',
      '..JJ...JJ...',
      '.BBB...BBB..',
      '.bbb...bbbb.',
    ]),
    punkJump: punk([
      '.S.KKKKK.S..',
      '.SKKGKKKKS..',
      '..KKKKKKK...',
      '...KKKKKK...',
      '...JJJJJ....',
      '..JJ..JJJ...',
      '.BBB...JJ...',
      '.bbb..BBB...',
      '......bbbb..',
    ]),
  });
})();
