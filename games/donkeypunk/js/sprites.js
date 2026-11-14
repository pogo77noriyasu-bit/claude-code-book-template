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
    O: '#ff8a1e', // オレンジ(炎)
    e: '#d8e4f0', // ドクロの影(青白い白)。パンクニワトリの羽の影にも使う
    U: '#3a8cff', // 青(ニワトリのトサカ)
    V: '#3cd04a', // 緑(ニワトリのトサカ)
    m: '#0e5222', // 濃い緑(札束のお札の縁取り)
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

  // 怒ったポリスマン(雑魚警察官。右向き)。14x18。面間演出の作業員と、4 面の雑魚敵(あとで追加)で同じドット絵を使う。
  // ツバのある紺の制帽に金のバッジ、つり上がった太い眉、への字口、赤い頬で「いつも怒っている」顔。
  // 制服は紺(N)に明るい紺(n)の前立て、金ボタン(Y)、黒いベルトとブーツ
  const COP_HEAD = [
    '....NNNNNN....',
    '...NNNNYNNN...',
    '...NNNNNNNNKK.', // 帽子のツバ(前 = 右へ突き出す)
    '....SSSSSSS...',
    '....KKKSKKK...', // つり上がった太い眉
    '....SWKSSWKS..',
    '....SSSSsSSS..',
    '....PSKKKSP...', // 赤い頬とへの字口
    '.....SSSSS....',
  ];
  const COP_BODY = [
    '....NNNYNN....',
    '...NNNNNNNN...',
    '..SNnNNYNnNS..', // 両手は体の横
    '..SNnNNNNnNS..',
    '...NKKKYKKN...',
    '...NNNNNNNN...',
  ];
  const COP_LEGS_A = ['...NNN..NNN...', '...NN....NN...', '..KKK...KKKK..'];
  const COP_LEGS_B = ['....NNNNNN....', '....NN.NN.....', '...KKKKKKK....'];
  // 行 from〜to の col 列を ch にする(腕を描き足す)
  const setCol = (rows, col, from, to, ch) => rows.map((r, i) => (i >= from && i <= to ? r.slice(0, col) + (i === from ? ch[0] : ch[1]) + r.slice(col + 1) : r));
  // 両腕を頭の上へ上げる(鉄骨をかつぐ・万歳)。手(S)は頭の上、腕は制服の紺
  const armsUp = (rows) => setCol(setCol(rows, 2, 0, 11, 'SN'), 11, 0, 11, 'SN');
  const copUpBody = COP_BODY.map((r) => r.replace(/S/g, 'N'));
  const cop = (head, body, legs) => def(head.concat(body, legs));
  // 背中側(ハシゴを登る)。帽子の後ろ・短い髪・制服の背中。左手を上のハシゴの段へ伸ばす(左右反転でもう 1 コマ)
  const COP_BACK = [
    '....NNNNNN....',
    '...NNNNNNNN...',
    '...NNNNNNNN...',
    '....kkkkkk....',
    '....kkkkkk....',
    '....kSSSSk....',
    '.....SSSS.....',
    '...NNNNNNNN...',
    '..NNNNNNNNNN..',
    '..NNNNNNNNNN..',
    '..NNNNNNNNNN..',
    '...NKKKKKKN...',
    '...NNNNNNNN...',
    '...NNNNNNNN...',
    '...NNN..NNN...',
    '...NN....NN...',
    '...NN....NN...',
    '..KKK....KKK..',
  ];

  const DATA = {
    // ---- 4 面のボーナスアイテム(すべてオリジナル) ----
    // エロ本(17×18。2 倍で描く): ピンクの表紙にカタカナの「エロ」を大きく、その下に少し小さく「本」(白い文字)。
    // 右下に赤いビキニのお姉さんの小さな記号的なシルエット(顔・髪・水着だけ)
    hbook: def([
      'ppppppppppppppppp',
      'pPPPPPPPPPPPPPPPp',
      'pPPPWWWPPPWWWWWPp',
      'pPPPPWPPPPWPPPWPp',
      'pPPPPWPPPPWPPPWPp',
      'pPPPPWPPPPWPPPWPp',
      'pPPWWWWWPPWWWWWPp',
      'pPPPPPPPPPPPPPPPp',
      'pPPPPPPPPPPKKKPPp',
      'pPPPPWPPPPKSSSKPp',
      'pPWWWWWWWPPSSSPPp',
      'pPPPWWWPPPPPSPPPp',
      'pPPWPWPWPPRRSRRPp',
      'pPWPPWPPWPPSSSPPp',
      'pPPWWWWWPPPRRRPPp',
      'pPPPPWPPPPPSPSPPp',
      'pPPPPPPPPPPSPSPPp',
      'ppppppppppppppppp'
    ]),
    // ビール瓶(8×15): 立てて置いた茶色の瓶に、金の王冠とクリーム色のラベル(赤い帯)。1 面の転がる緑の瓶(横向き)とは色・向き・大きさで区別
    beerUp: def([
      '...YY...',
      '...tt...',
      '...tt...',
      '...Tt...',
      '..tTtt..',
      '.ttTttt.',
      '.tTtttt.',
      '.LLLLLL.',
      '.LCCCCL.',
      '.LLLLLL.',
      '.tTtttt.',
      '.tTtttt.',
      '.tTtttt.',
      '.tTtttt.',
      '..tttt..',
    ]),
    // 札束(18×13。2 倍で描く): 上は正面から見たお札 1 枚(濃い緑の縁取り・左に「¥」・右に肖像の丸)、
    // 下は重なった紙の厚み(白い縞)。真ん中に赤い縁取りの白い帯封と赤い印
    cash: def([
      'mmmmmmmrWWrmmmmmmm',
      'mhghhhgrWWrhhhhhhm',
      'mhhghghrWWrhggghhm',
      'mhgggggrCWrgKKKghm',
      'mhhhghhrCCrgSSSghm',
      'mhgggggrWCrgsSsghm',
      'mhhhghhrWWrhggghhm',
      'mhhhhhhrWWrhhhhhhm',
      'mmmmmmmrWWrmmmmmmm',
      'mWWWWWWrWWrWWWWWWm',
      'mccccccrWWrccccccm',
      'mWWWWWWrWWrWWWWWWm',
      'mmmmmmmrWWrmmmmmmm'
    ]),
    // 四角い金属製のゴミ箱(7×7。1 面の斜め投げ): 銀のふた・黒い縁・灰色のたての溝。瓶(緑)・缶(赤・丸)と色と形で区別する
    trash: def([
      '.kkkkk.',
      'kGGGGGk',
      'kkkkkkk',
      'kcbcbck',
      'kcbcbck',
      'kcbcbck',
      '.kkkkk.',
    ]),
    // 怒ったポリスマン: 歩く 2 枚 / 鉄骨をかつぐ 2 枚 / 敬礼 / 万歳(口を開けて叫ぶ)
    copWalkA: cop(COP_HEAD, COP_BODY, COP_LEGS_A),
    copWalkB: cop(COP_HEAD, COP_BODY, COP_LEGS_B),
    copCarryA: def(armsUp(COP_HEAD.concat(copUpBody, COP_LEGS_A))),
    copCarryB: def(armsUp(COP_HEAD.concat(copUpBody, COP_LEGS_B))),
    copSalute: def(setCol(COP_HEAD.concat(COP_BODY.map((r, i) => (i >= 2 && i <= 3 ? r.slice(0, 11) + 'N' + r.slice(12) : r)), COP_LEGS_A), 12, 2, 11, 'SN')),
    // ハシゴを登る(背中向き。左手を上へ。左右反転して手を入れ替える)
    copClimb: def(setCol(setCol(COP_BACK, 2, 0, 8, 'SN'), 11, 8, 12, 'NN').map((r, i) => (i === 12 ? r.slice(0, 11) + 'S' + r.slice(12) : r))),
    // 目を回して気絶(目をつぶって口を「O」に開ける。renderer が頭の上に星を回す)
    copDizzy: cop(COP_HEAD.map((r, i) => (i === 5 ? '....SKKSSKKS..' : i === 7 ? '....PSKWKSP...' : r)), COP_BODY, COP_LEGS_A),
    copCheer: def(armsUp(COP_HEAD.map((r, i) => (i === 7 ? '....PSKWKSP...' : r)).concat(copUpBody, COP_LEGS_A))),
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

    // ファイヤースカル(2 面の敵)。12x11。白いドクロに、銀の鋲とトゲの付いた赤いバンダナ。
    // 左右反転で向きを変える(目の位置はほぼ対称)。青白い炎は renderer.js が後ろに描く
    skull: def([
      '...WWWWWW...',
      'G.WWWWWWWW.G',
      'GRRRRRRRRRRG',
      '.RGRRGRRGRR.',
      '.WWWWWWWWWe.',
      '.WKKWWWWKKe.',
      '.WKKWWWWKKe.',
      '..WWWKKWWe..',
      '..WWWWWWWe..',
      '...WKWKWK...',
      '....WWWW....',
    ]),

    // 爆音アンプ(2 面の中央)。18x20。銀の枠に金色のつまみと赤いロゴ板、下に 4 つのスピーカー
    amp: def([
      'GGGGGGGGGGGGGGGGGG',
      'GkkkkkkkkkkkkkkkkG',
      'GkYkYkYkYkkRRRRRkG',
      'GkkkkkkkkkkkkkkkkG',
      'GGGGGGGGGGGGGGGGGG',
      'GKKKKKKKKKKKKKKKKG',
      'GKKkkkkKKKKkkkkKKG',
      'GKkkGGkkKKkkGGkkKG',
      'GKkGkkGkKKkGkkGkKG',
      'GKkGkkGkKKkGkkGkKG',
      'GKkkGGkkKKkkGGkkKG',
      'GKKkkkkKKKKkkkkKKG',
      'GKKKKKKKKKKKKKKKKG',
      'GKKkkkkKKKKkkkkKKG',
      'GKkkGGkkKKkkGGkkKG',
      'GKkGkkGkKKkGkkGkKG',
      'GKkGkkGkKKkGkkGkKG',
      'GKkkGGkkKKkkGGkkKG',
      'GKKkkkkKKKKkkkkKKG',
      'GGGGGGGGGGGGGGGGGG',
    ]),

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

  // 空飛ぶパンクニワトリ(3 面の敵)。12x11・右向き(左へ飛ぶときは左右反転)。白い体に、モヒカンのように逆立った
  // 3 段のトサカ(X をラインの色に置き換える)、オレンジのくちばしと足、赤い肉ぜん(r)。羽を上げた姿・下げた姿の 2 枚で羽ばたく。
  // 胴体(4〜8 行目)の形と大きさは 2 枚とも同じで、違うのは羽だけ(当たり判定は胴体の中の小さな矩形。js/birds.js)
  const BIRD_UP = [
    '.......X..X.',
    '..W....XX.X.',
    '.WW....XXXX.',
    '.WWW...WWWW.',
    '..WWWWWWWKWO',
    '.WWWWWWWWWOO',
    'WWWWWWWWWWr.',
    '.WWWWWWWWW..',
    '..eWWWWWe...',
    '....O.O.....',
    '............',
  ];
  const BIRD_DOWN = [
    '.......X..X.',
    '.......XX.X.',
    '.......XXXX.',
    '.......WWWW.',
    '..WWWWWWWKWO',
    '.WWWWWWWWWOO',
    'WWWWeeeWWWr.',
    '.WWWeWeWWW..',
    '..eWWWWWe...',
    '...WWeO.O...',
    '....We......',
  ];
  const BIRD_COMB = { blue: 'U', red: 'R', yellow: 'Y', green: 'V' };
  // くちばしを開いた姿(R5 以降の火炎の予備動作と噴いている間): 上のくちばし(O)を 1 段上げ、口の中(赤 R)を見せる
  const openBeak = (rows) => rows.map((r, i) => (i === 3 ? r.slice(0, 11) + 'O' : i === 4 ? r.slice(0, 11) + 'R' : r));
  for (const [color, ch] of Object.entries(BIRD_COMB)) {
    DATA['bird_' + color + '_up'] = def(BIRD_UP.map((r) => r.replace(/X/g, ch)));
    DATA['bird_' + color + '_down'] = def(BIRD_DOWN.map((r) => r.replace(/X/g, ch)));
    DATA['bird_' + color + '_up_open'] = def(openBeak(BIRD_UP).map((r) => r.replace(/X/g, ch)));
    DATA['bird_' + color + '_down_open'] = def(openBeak(BIRD_DOWN).map((r) => r.replace(/X/g, ch)));
  }

  // 2 面: バズーカ砲を構えたゴリラ警官(右向き。左向きは左右反転)。頭と脚は通常の boss と同じで、腕だけが違う。
  // 前へ出した右腕(袖 N + 手 F)と、胸の前を横切る左腕で筒をつかむ。筒そのものは renderer.js が角度に合わせて回して描く。
  // H = 水平(肩の高さでつかむ)/ D = 斜め下 / S = 急角度(低い位置でつかむ)。hr: 手の行
  const BOSS_TORSO = [
    '....NNNNFFFFFFFFNNNN',
    '...NNNNNnnnYnnnNNNNN',
    '...NNNNNnnnnnnnNNNNN',
    '...NNNNNnnnYnnnNNNNN',
    '...NNNNNnnnnnnnNNNNN',
    '....NNNNKKKYKKKNNNN',
    '....NNNNNNNNNNNNNNN',
  ];
  function bossAim(hr) {
    const torso = BOSS_TORSO.map((r, i) => {
      const row = 12 + i;
      if (row === hr) return r.padEnd(19, '.') + 'NNFF'; // 前へ出した右腕と手
      if (row === hr + 1) return r.slice(0, 8) + 'NNNNNNNNNNNFF'; // 胸の前を横切る左腕と手
      return r;
    });
    const b = DATA.boss.rows;
    return def(b.slice(0, 12).concat(torso, b.slice(19)));
  }
  DATA.bossAimH = bossAim(13);
  DATA.bossAimD = bossAim(14);
  DATA.bossAimS = bossAim(16);

  // 2 面: 蛇行ミサイル(右向き。描画で進む向きに回す)。10x5 ドット = 20x10px
  // 黒い尾翼(K)、銀の胴体(G)と白いつや(W)、赤い弾頭(R)
  DATA.missile = def([
    '.K........',
    'KGGGGGGRR.',
    'KGWWWGGRRR',
    'KGGGGGGRR.',
    '.K........',
  ]);

  // 3 面のボーナスアイテム(仕掛け 'prizes'。renderer.js が 2 倍で描く。どれも当たり判定 20×24px 以内)
  // カセットテープ(300 点): 黒い本体に白いラベル・赤い線・2 つのリール(銀の軸)。12x7
  DATA.tape = def([
    'KKKKKKKKKKKK',
    'KWWWWWWWWWWK',
    'KWRRRRRRRRWK',
    'KWKGKWWKGKWK',
    'KWWWWWWWWWWK',
    'KkkkKKKKkkkK',
    'KKKKKKKKKKKK',
  ]);
  // 革ジャン(500 点): 黒い縁取りの濃いグレーの革(暗い背景でも形が見えるように)に、銀の斜めジッパーと肩・胸の鋲、
  // 胸に赤いワッペン、立てた襟。袖と胴の間を少しあけて形を見せる。12x9
  DATA.jacket = def([
    '..KK....KK..',
    '.KkkK..KkkK.',
    'KkGkkKKkkGkK',
    'KkkkGkkkkRkK',
    'KkkkkGkkkkkK',
    'KkGkkkGkkGkK',
    'Kk.KkkkGkK.K',
    'Kk.KkkkkkK.K',
    '...KKKKKKK..',
  ]);
  // エレキギター(1,000 点): 赤いボディに白いピックガード、黒いネックと銀の弦(縦向き。ヘッドが上)。8x10
  DATA.guitar = def([
    '...KK...',
    '...KK...',
    '...KG...',
    '...KG...',
    '...KG...',
    '.RRKGRR.',
    'RRRWGRRR',
    'RRWWGWRR',
    '.RRRGRR.',
    '..RRRR..',
  ]);

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
