// パンクス(主人公)の正面・背面のドット絵と、4 方向の絵の選び方
// ドンキーパンクの主人公(横向き: punkStand / punkWalk / punkJump)に合わせて新しく描いたもの。
// ほかのアクションゲームでも使えるよう、PUNKS QIX の定数(PQ)には頼らない独立した部品にしてある。
//   - 絵の形式はドンキーパンクと同じ { w, h, rows }(1 文字 = 1 ドット、'.' は透明)
//   - 色の文字もドンキーパンクのパレット(DP.sprites.PALETTE)と同じ(K = 革ジャン、J = ジーンズ…)
//   - 髪は横向きと同じ R(基本色)・r(陰影)で、上から HAIR_ROWS 行の中だけにある。
//     髪の色替え(js/hair.js)をそのまま使えるので、色は HAIR_COLORS で管理できる
//   - 大きさは横向きと同じ 20×20(上 11 行がモヒカンと頭、下 9 行が体)
window.PunkViews = (function () {
  const HAIR = { base: 'R', shade: 'r' }; // 髪の色の文字
  const HAIR_ROWS = 11; // 髪と頭の行数(この下に髪の文字はない)

  // 文字列の配列 → { w, h, rows }
  function def(rows) {
    const w = Math.max(...rows.map((r) => r.length));
    return { w, h: rows.length, rows: rows.map((r) => r.padEnd(w, '.')) };
  }
  // 体は横向きと同じく 12 幅で書いて、左右 4 ドットずつ広げる
  const pad4 = (r) => '....' + r + '....';
  const mirrorRow = (r) => r.split('').reverse().join('');

  // 頭の形とモヒカンの考え方(横向きの絵との立体的な整合):
  //   横向きのモヒカンは、額から首筋まで前後に長い扇形のトサカ。これを正面・背面から見ると、
  //   薄いトサカを真正面から見ることになるので、頭のまん中に立つ「細い縦長の帯」になる(左右には広がらない)。
  //   - 幅は 2 ドット(列 9・10。顔の中心と同じ)。高さは横向きと同じく 0 行目から(頭頂より上に 4 行)
  //   - 右の列を陰影(r)にして厚みを出す。先端は 1 ドットで、上が透明な毛はハイライトになる(js/hair.js)
  //   - 左右の側頭部は刈り上げ: 肌(S)の上に剃り跡の影(s)。丸い頭の形が見えるように 4〜7 行目で広がる
  // 体と同じく、頭も左右対称に近い形にしてある(歩きのコマで体だけ反転しても髪型が変わらない)

  // 正面の頭: トサカは額の生え際で終わる。目・両耳の銀のピアス・口
  const FRONT_HEAD = [
    '..........R.........', // トサカの先
    '.........RR.........',
    '.........Rr.........',
    '.........Rr.........',
    '........sRrs........', // ここから頭頂。両側は刈り上げ(剃り跡 s)
    '.......sSRrSs.......',
    '......sSSRrSSs......',
    '......SSSRrSSS......', // 額のまん中がトサカの生え際
    '......SKSSSSKS......', // 目
    '.....GSSSSSSSSG.....', // 耳とピアス
    '.......SSkkSS.......', // 口とあご
  ];
  // 背面の頭: トサカが後頭部を通って首筋まで続く(横向きで首筋まで毛があるのと同じ。正面との見分けどころ)
  const BACK_HEAD = [
    '..........R.........', // トサカの先
    '.........RR.........',
    '.........Rr.........',
    '.........Rr.........',
    '........sRrs........', // ここから頭頂。両側は刈り上げ
    '.......sSRrSs.......',
    '......sSSRrSSs......',
    '......sSSRrSSs......', // 後頭部
    '......SSSRrSSS......',
    '.....GSSSRrSSSG.....', // 耳とピアス
    '.......SsRrsS.......', // 首筋(トサカの終わり)
  ];

  // 正面の体: 革ジャン(襟元に銀のスタッズ、中に白い T シャツ)・ジーンズ・ブーツ
  const FRONT_BODY = [
    '..KKKSSKKK..',
    '.KKGKWWKGKK.',
    '.KKKKWWKKKK.',
    '.SKKKKKKKKS.',
    '...JJJJJJ...',
    '...JJ..JJ...',
    '...JJ..JJ...',
    '..BBB..BBB..',
    '..bbb..bbb..',
  ];
  // 正面の歩き(1 コマ目): 片手を振り上げ、反対側の足を上げる。2 コマ目は体だけ左右反転
  const FRONT_WALK = [
    '..KKKSSKKK..',
    '.KKGKWWKGKK.',
    '.SKKKWWKKKK.',
    '..KKKKKKKKS.',
    '...JJJJJJ...',
    '...JJ..JJ...',
    '..BBB..JJ...',
    '..bbb..BBB..',
    '.......bbb..',
  ];
  // 背面の体: 革ジャンの背中に銀のスタッズで X 字
  const BACK_BODY = [
    '..KKKKKKKK..',
    '.KKKGKKGKKK.',
    '.KKKKGGKKKK.',
    '.SKKGKKGKKS.',
    '...JJJJJJ...',
    '...JJ..JJ...',
    '...JJ..JJ...',
    '..BBB..BBB..',
    '..bbb..bbb..',
  ];
  const BACK_WALK = [
    '..KKKKKKKK..',
    '.KKKGKKGKKK.',
    '.SKKKGGKKKK.',
    '..KKGKKGKKS.',
    '...JJJJJJ...',
    '...JJ..JJ...',
    '..BBB..JJ...',
    '..bbb..BBB..',
    '.......bbb..',
  ];

  // 頭 + 体で 1 コマを作る(mirrorBody: 体だけ左右反転。頭は反転しないので髪がちらつかない)
  const frame = (head, body, mirrorBody) =>
    def(head.concat(body.map((r) => pad4(mirrorBody ? mirrorRow(r) : r))));

  const DATA = {
    punkFront: frame(FRONT_HEAD, FRONT_BODY),
    punkFrontWalkA: frame(FRONT_HEAD, FRONT_WALK),
    punkFrontWalkB: frame(FRONT_HEAD, FRONT_WALK, true),
    punkBack: frame(BACK_HEAD, BACK_BODY),
    punkBackWalkA: frame(BACK_HEAD, BACK_WALK),
    punkBackWalkB: frame(BACK_HEAD, BACK_WALK, true),
  };

  // 向きごとに使う絵の名前。横向きはドンキーパンクの絵(左向きは右向きを反転)
  const NAMES = {
    side: { stand: 'punkStand', walk: ['punkStand', 'punkWalk'], drawing: 'punkJump' },
    down: { stand: 'punkFront', walk: ['punkFrontWalkA', 'punkFrontWalkB'] },
    up: { stand: 'punkBack', walk: ['punkBackWalkA', 'punkBackWalkB'] },
  };

  // 向きと動きから、描く絵を選ぶ。
  //   face: 'up' | 'down' | 'left' | 'right'(止まっているときは最後に動いた向きを渡す)
  //   opts.moving: このステップで動いたか / opts.walkFrame: 歩いたステップ数
  //   opts.drawing: 線を引いている途中か(横向きだけ専用のポーズ) / opts.period: 歩きのコマを替える間隔
  // 返り値: { name, flip }(flip = 左右反転して描く)
  function frameFor(face, opts) {
    opts = opts || {};
    const period = opts.period || 6;
    const step = Math.floor((opts.walkFrame || 0) / period) % 2;
    if (face === 'up' || face === 'down') {
      const n = NAMES[face];
      return { name: opts.moving ? n.walk[step] : n.stand, flip: false };
    }
    const n = NAMES.side;
    const name = opts.drawing ? n.drawing : opts.moving ? n.walk[step] : n.stand;
    return { name, flip: face === 'left' };
  }

  return { DATA, HAIR, HAIR_ROWS, NAMES, frameFor };
})();
