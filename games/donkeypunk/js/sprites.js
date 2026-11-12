// ドット絵のデータと描画
// 1 文字 = 1 ドット。'.' は透明。色は PALETTE で決める。
// すべてオリジナルのデザイン(既存作品の画像は使っていない)。
window.DP = window.DP || {};

DP.sprites = (function () {
  const PALETTE = {
    K: '#141414', // 黒(革ジャン・ブーツ)
    k: '#3a3a44', // 濃いグレー
    R: '#ff2a2a', // 赤(モヒカン)
    r: '#a81414', // 暗い赤
    S: '#f4bc94', // 肌
    s: '#c98a62', // 肌の影
    W: '#ffffff',
    G: '#cfd6e0', // 銀(スタッズ・ピアス)
    J: '#3458b0', // ジーンズ
    j: '#22397a',
    B: '#2a1a12', // ブーツ
    b: '#7a7a7a', // ブーツの底
    N: '#1d2c74', // 警官の制服(紺)
    n: '#2f48b8', // 制服の明るい部分
    Y: '#ffd23c', // 金(バッジ)
    F: '#5c3418', // ゴリラの毛
    f: '#8a5630', // ゴリラの顔
    P: '#ff5aa6', // ピンク
    p: '#b8306e',
    g: '#1f8a3a', // ビール瓶(緑のガラス)
    h: '#8cf0a0', // ガラスの光
    L: '#f4e2a0', // ラベル
    C: '#e02a2a', // 缶の赤
    c: '#d8dde4', // 缶の銀
    T: '#d89a52', // バットの木(明るい)
    t: '#8e5626', // バットの木(影)
    w: '#f6d29a', // バットの木のつや
  };

  // 文字列の配列 → { w, h, rows }(短い行は右を透明で埋める)
  function def(rows) {
    const w = Math.max(...rows.map((r) => r.length));
    return { w, h: rows.length, rows: rows.map((r) => r.padEnd(w, '.')) };
  }

  // 時計回りに 90 度回したスプライトを作る(縦向きのバット → 横向き)
  function rotateCW(s) {
    const rows = [];
    for (let y = 0; y < s.w; y++) {
      let row = '';
      for (let x = 0; x < s.h; x++) row += s.rows[s.h - 1 - x][y];
      rows.push(row);
    }
    return def(rows);
  }

  // 釘バット(縦向き・先端が上)。9x18
  // 太い先端に銀色の釘(G)が四方へ突き出し、持ち手には黒いテープ(K)を巻いている
  const BAT_UP = def([
    '..G.G.G..',
    'G..tTt..G',
    '.GtTwTtG.',
    '..tTwTt..',
    'GGtTwTtGG',
    '..tTTTt..',
    '.GtTwTtG.',
    '..tTTTt..',
    'GGtTTTtGG',
    '..GtTtG..',
    '...tTt...',
    '...tTt...',
    '...tTt...',
    '...KKK...',
    '...KkK...',
    '...KKK...',
    '...tTt...',
    '..ttttt..',
  ]);

  // 主人公(右向き)。12x16
  const HEAD = [
    '.....RR.....',
    '....RRR.....',
    '....RRr.....',
    '...SSRSSS...',
    '...SSSSKS...',
    '...SSSSSSG..',
    '....SsSS....',
  ];
  const DATA = {
    punkStand: def(HEAD.concat([
      '...KKKKKK...',
      '..KKGKKKKS..',
      '..KKKKKKKS..',
      '..SKKKKKK...',
      '...JJJJJ....',
      '...JJ.JJ....',
      '...JJ.JJ....',
      '..BBB.BBB...',
      '..bbb.bbbb..',
    ])),
    punkWalk: def(HEAD.concat([
      '...KKKKKK...',
      '..KKGKKKKS..',
      '.SKKKKKKK...',
      '...KKKKKK...',
      '...JJJJJ....',
      '..JJJ.JJJ...',
      '..JJ...JJ...',
      '.BBB...BBB..',
      '.bbb...bbbb.',
    ])),
    punkJump: def(HEAD.concat([
      '.S.KKKKK.S..',
      '.SKKGKKKKS..',
      '..KKKKKKK...',
      '...KKKKKK...',
      '...JJJJJ....',
      '..JJ..JJJ...',
      '.BBB...JJ...',
      '.bbb..BBB...',
      '......bbbb..',
    ])),
    // 背中側(ハシゴ用)。左右反転してもう 1 コマにする
    punkClimb: def([
      '.....RR.....',
      '....RRRR....',
      '....RRRR....',
      '...SSRRSS...',
      '.S.SSSSSS...',
      '.S.SSSSSS...',
      '.KK.SsSS....',
      '..KKKKKKKK..',
      '..KKKGGKKKS.',
      '..KKKKKKKKS.',
      '...KKKKKK...',
      '...JJJJJJ...',
      '...JJ..JJ...',
      '...JJ..BBB..',
      '..BBB..bbb..',
      '..bbb.......',
    ]),

    // ゴリラ警官(正面)。24x24
    boss: def([
      '........NNNNNNNN',
      '......NNNNNNNNNNNN',
      '.....NNNNNNYYNNNNNN',
      '.....kkkkkkkkkkkkkk',
      '......FFFFFFFFFFFF',
      '.....FFffffffffffFF',
      '.....FfWKffffffKWfF',
      '.....FffffffffffffF',
      '......FffssssssffF',
      '......FfsKsssssKsfF',
      '.......FsssssssssF',
      '.......FsWWWWWWWsF',
      '....NNNNFFFFFFFFNNNN',
      '..NNNNNNnnnYnnnNNNNNN',
      '.NNNNNNNnnnnnnnNNNNNNN',
      'FFNNNNNNnnnYnnnNNNNNNFF',
      'FFFNNNNNnnnnnnnNNNNNFFF',
      'FFF.NNNNKKKYKKKNNNN.FFF',
      'FF..NNNNNNNNNNNNNNN..FF',
      '....NNNNNNNNNNNNNNN',
      '....NNNNN.....NNNNN',
      '....NNNN.......NNNN',
      '...KKKKK.......KKKKK',
      '..KKKKKK.......KKKKKK',
    ]),
    // 両腕を上げたポーズ(ビールを持ち上げる・胸をたたく)
    bossUp: def([
      'FF......NNNNNNNN......FF',
      'FF....NNNNNNNNNNNN....FF',
      'FF...NNNNNNYYNNNNNN...FF',
      'FF...kkkkkkkkkkkkkk...FF',
      'FF....FFFFFFFFFFFF....FF',
      '.FF..FFffffffffffFF..FF',
      '.FF..FfWKffffffKWfF..FF',
      '.FF..FffffffffffffF..FF',
      '..FF..FffssssssffF..FF',
      '..FF..FfsKsssssKsfF.FF',
      '...FF..FsssssssssF.FF',
      '...FF..FsKKKKKKKsF.FF',
      '....NNNNFFFFFFFFNNNN',
      '...NNNNNnnnYnnnNNNNN',
      '...NNNNNnnnnnnnNNNNN',
      '...NNNNNnnnYnnnNNNNN',
      '...NNNNNnnnnnnnNNNNN',
      '....NNNNKKKYKKKNNNN',
      '....NNNNNNNNNNNNNNN',
      '....NNNNNNNNNNNNNNN',
      '....NNNNN.....NNNNN',
      '....NNNN.......NNNN',
      '...KKKKK.......KKKKK',
      '..KKKKKK.......KKKKKK',
    ]),

    // スキンヘッドのパンクガール。12x16
    girl: def([
      '....ssss....',
      '...SSSSSS...',
      '..SSSSSSSS..',
      '..SSKSSKSS..',
      '.GSSSSSSSSG.',
      '.G.SSPPSS.G.',
      '....SSSS....',
      '...KKKKKK...',
      '..SKKGGKKS..',
      '..SKKKKKKS..',
      '..RrRrRrRr..',
      '..rRrRrRrR..',
      '...SS..SS...',
      '...SS..SS...',
      '..KKK..KKK..',
      '..KKK..KKK..',
    ]),
    girlWave: def([
      '....ssss....',
      '...SSSSSS...',
      '..SSSSSSSS..',
      '..SSKSSKSS..',
      '.GSSSSSSSSG.',
      '.G.SSPPSS.GS',
      '....SSSS..S.',
      '.S.KKKKKKS..',
      '.SKKKGGKK...',
      '...KKKKKK...',
      '..RrRrRrRr..',
      '..rRrRrRrR..',
      '...SS..SS...',
      '...SS..SS...',
      '..KKK..KKK..',
      '..KKK..KKK..',
    ]),

    // ビール瓶(横倒し・口が右)。12x6。ラベルの位置を変えて転がって見せる
    bottle0: def([
      '.gggggg.....',
      'gggggggggg..',
      'ghhhhggggggY',
      'gLLLLggggggY',
      'gggggggggg..',
      '.gggggg.....',
    ]),
    bottle1: def([
      '.gggggg.....',
      'gLLLLggggg..',
      'ghhhhggggggY',
      'ggggggggg gY'.replace(' ', 'g'),
      'gggggggggg..',
      '.gggggg.....',
    ]),
    bottle2: def([
      '.gggggg.....',
      'gggggggggg..',
      'ggggggggg gY'.replace(' ', 'g'),
      'ghhhhggggggY',
      'gLLLLggggg..',
      '.gggggg.....',
    ]),

    // ビール缶(丸い缶が転がる)。8x8。白い帯が回る
    can0: def(['..cccc..', '.cCCCCc.', 'cCWWCCCc', 'cCCWCCCc', 'cCCCCCCc', 'cCCCCCCc', '.cCCCCc.', '..cccc..']),
    can1: def(['..cccc..', '.cCCCCc.', 'cCCCCWWc', 'cCCCCWCc', 'cCCCCCCc', 'cCCCCCCc', '.cCCCCc.', '..cccc..']),
    can2: def(['..cccc..', '.cCCCCc.', 'cCCCCCCc', 'cCCCCCCc', 'cCCCWCCc', 'cCCCWWCc', '.cCCCCc.', '..cccc..']),
    can3: def(['..cccc..', '.cCCCCc.', 'cCCCCCCc', 'cCCCCCCc', 'cCWCCCCc', 'cWWCCCCc', '.cCCCCc.', '..cccc..']),

    // 釘バット。縦(振りかぶり)と横(叩きつけ・置いてあるとき。先端が右)
    batUp: BAT_UP,
    batSide: rotateCW(BAT_UP),

    // ハート(クリア演出)
    heart: def(['.RR.RR.', 'RRRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...']),
  };

  // 描画を速くするため、スプライトごと(左右反転ごと)にオフスクリーンキャンバスへ焼いておく
  const cache = {};
  function bake(name, flip) {
    const key = name + (flip ? ':f' : '');
    if (cache[key]) return cache[key];
    const s = DATA[name];
    const cv = document.createElement('canvas');
    cv.width = s.w;
    cv.height = s.h;
    const c = cv.getContext('2d');
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const ch = s.rows[y][x];
        if (ch === '.' || !PALETTE[ch]) continue;
        c.fillStyle = PALETTE[ch];
        c.fillRect(flip ? s.w - 1 - x : x, y, 1, 1);
      }
    }
    cache[key] = cv;
    return cv;
  }

  // (cx, footY) を下端中央として描く
  function draw(ctx, name, cx, footY, opts) {
    opts = opts || {};
    const scale = opts.scale || DP.config.PIXEL;
    const s = DATA[name];
    const img = bake(name, !!opts.flip);
    const w = s.w * scale;
    const h = s.h * scale;
    ctx.drawImage(img, Math.round(cx - w / 2), Math.round(footY - h), w, h);
  }

  return { draw, DATA, PALETTE };
})();
