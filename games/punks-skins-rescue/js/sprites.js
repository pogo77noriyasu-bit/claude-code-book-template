// PUNKS & SKINS RESCUE: このゲームだけのドット絵(共通部品 POGO77.chars に登録する)
(function () {
  const def = POGO77.chars.def;
  POGO77.chars.register({
    // 担架(19×4 ドット)。木の柄(T/t)に白い布(W)、中央に赤十字(C)
    stretcher: def([
      'TtWWWWWWWWCWWWWWWtT',
      'TtWWWWWWWCCCWWWWWtT',
      'TtWWWWWWWWCWWWWWWtT',
      'ttttttttttttttttttt',
    ]),
    // 受け止めた瞬間の担架(布が下へたわむ)
    stretcherDip: def([
      'Tt...............tT',
      'TtWW...........WWtT',
      'tttWWWWWWCWWWWWWttt',
      '...WWWWWCCCWWWWW...',
      '.....WWWWCWWWW.....',
    ]),
  });
})();
