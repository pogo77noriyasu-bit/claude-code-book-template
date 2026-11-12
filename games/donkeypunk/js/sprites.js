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

  // 下 4 行(脚)だけを差し替えたスプライトを作る
  function withLegs(s, legs) {
    return def(s.rows.slice(0, s.h - legs.length).concat(legs));
  }

  // 左半分を a、右半分を b から取って合成する(同じ幅にそろえてから)
  function combine(a, b, w) {
    const rows = [];
    for (let y = 0; y < a.h; y++) {
      const ra = a.rows[y].padEnd(w, '.');
      const rb = b.rows[y].padEnd(w, '.');
      rows.push(ra.slice(0, w / 2) + rb.slice(w / 2));
    }
    return def(rows);
  }

  // ゴリラの歩き(脚だけ差し替え)。A: 左足を上げる / B: 右足を上げる
  const BOSS_LEGS_A = [
    '....NNNNN.....NNNNN',
    '...KKKKKK......NNNN',
    '..KKKKKKK......KKKKK',
    '...............KKKKKK',
  ];
  const BOSS_LEGS_B = [
    '....NNNNN.....NNNNN',
    '....NNNN......KKKKKK',
    '...KKKKK......KKKKKKK',
    '..KKKKKK..............',
  ];

  // 主人公(右向き)。20x20(モヒカン 7 行 + 体 13 行)。
  // モヒカンは 80 年代ハードコアパンクスの大きな扇形(半円)。額から頭頂部・後頭部を通って
  // 首の付け根まで続き、中央がいちばん高く、前と後ろへ放射状にトゲが広がる。毛先はギザギザ。
  // 後頭部へ広がるぶん、元の 12 幅の体を左右 4 ドットずつ広げて 20 幅にしている
  // (左右同じだけ広げるので、反転しても顔・胴体・足元の位置は変わらない)。
  // 当たり判定(config.player: 幅 14 × 高さ 26px)は顔から下の体だけで、モヒカンは含まない
  const HEAD = [
    '.......R.R..R.......',
    '....R..RRRR.RR..R...',
    '....RR.RRRRRRR.RR...',
    '.R..RRRRRRRRRRRR....',
    '.RRRRRRRRRRRRRR.....',
    '..RRRRRRrRrRrRR.....',
    'RRRRRRRrRrRrRR......',
    '.RRRRRRSSSSSS.......', // ここから顔。後頭部の毛
    'RRRRRrRSSSSKS.......',
    '.RRRRRRSSSSSSG......',
    '..RRRrr.SsSS........', // 首筋の毛(扇形の後ろの端)
  ];
  // 元の 12 幅の行を左右 4 ドットずつ広げる
  const pad4 = (r) => '....' + r + '....';
  // 主人公の 1 コマ = モヒカンと顔(HEAD)+ 体(12 幅で書いて広げる)
  const punk = (bodyRows) => def(HEAD.concat(bodyRows.map(pad4)));

  const DATA = {
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
    // 背中側(ハシゴ用)。左右反転してもう 1 コマにする。
    // 後ろから見たモヒカンは細いトサカ(横向きと同じ 6 行の高さ・ギザギザの毛先)
    punkClimb: def([
      '....R..R....',
      '....RRRR....',
      '.....RR.....',
      '....RRRR....',
      '....RRRR....',
      '....RrrR....',
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
    ].map(pad4)),

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

    // 背中向きのゴリラ警官(逃走用ハシゴを登る)。左手を高く・右手を低く。左右反転でもう 1 コマ
    // 手のひら(f)が左右のハシゴの外側の支柱にかかる幅(48px)にしている。
    // 左手は頭より高く振り上げ、右手は肩の高さでつかむ
    bossClimb: def([
      'ff......................',
      'fF......................',
      'FFF.....................',
      '.FF.....................',
      '.FFF....NNNNNNNN........',
      '..FF..NNNNNNNNNNNN......',
      '..FFFNNNNNNNNNNNNNN.....',
      '...FFkkkkkkkkkkkkkk...ff',
      '...FFFFFFFFFFFFFFFFF.FFf',
      '....FFFFFFFFFFFFFFFFFFF.',
      '....FFFFFFFFFFFFFFFFFF..',
      '....FFFFFFFFFFFFFFFFF...',
      '....NNNNNNNNNNNNNNNN....',
      '...NNNNNNNNNNNNNNNNNN...',
      '..NNNNNNNNNNNNNNNNNNNN..',
      '..NNNNNNNNNNNNNNNNNNNN..',
      '..NNNNNNNNNNNNNNNNNNNN..',
      '...NNNNNNNNNNNNNNNNNN...',
      '....NNNNKKKKKKKKNNNN....',
      '....NNNNNNNNNNNNNNNN....',
      '....NNNNNNNNNNNNNNNN....',
      '....NNNNN......NNNNN....',
      '....NNNN........NNNN....',
      '...KKKKK........NNNN....',
      '..KKKKKK.......KKKKK....',
      '...............KKKKKK...',
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

    // さらわれてジタバタするガール(2 コマ)。口を開けて叫び、手足をばたつかせる
    girlKick0: def([
      '....ssss....',
      '...SSSSSS...',
      '..SSSSSSSS..',
      '..SSKSSKSS..',
      '.GSSSSSSSSG.',
      'S..SSKKSS..S',
      '.S..SSSS..S.',
      '..SKKKKKKS..',
      '...KKGGKK...',
      '...KKKKKK...',
      '..RrRrRrRr..',
      '..rRrRrRrR..',
      '..SS....SS..',
      '.SS......SS.',
      'KKK......KKK',
      'KK........KK',
    ]),
    girlKick1: def([
      '....ssss....',
      '...SSSSSS...',
      '..SSSSSSSS..',
      '..SSKSSKSS..',
      '.GSSSSSSSSG.',
      '.G.SSKKSS.G.',
      '....SSSS....',
      '.SSKKKKKKSS.',
      'S..KKGGKK..S',
      '...KKKKKK...',
      '..RrRrRrRr..',
      '..rRrRrRrR..',
      '....SSSS....',
      '....SSSS....',
      '...KKKKKK...',
      '...KK..KK...',
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

  // ゴリラの歩き・担ぎ(既存のデザインから作る)
  DATA.bossWalk0 = withLegs(DATA.boss, BOSS_LEGS_A);
  DATA.bossWalk1 = withLegs(DATA.boss, BOSS_LEGS_B);
  // 担ぐ: 左半分は腕を下ろした姿、右半分は腕を上げた姿(右手でガールを肩の上に支える)
  DATA.bossCarry = combine(DATA.boss, DATA.bossUp, 24);
  DATA.bossCarryWalk0 = withLegs(DATA.bossCarry, BOSS_LEGS_A);
  DATA.bossCarryWalk1 = withLegs(DATA.bossCarry, BOSS_LEGS_B);

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
