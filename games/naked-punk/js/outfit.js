// 主人公(赤モヒカンのパンクス)の着せ替えドット絵
// 絵は既存のものをそのまま読み込んで使う(どちらのファイルも変更しない):
//   - 横向き: ドンキーパンクの DP.sprites.DATA(punkStand / punkWalk)
//   - 正面・背面: PUNKS QIX の PunkViews.DATA(punkFront… / punkBack…)
// どちらも 20×20 で、上 11 行がモヒカンと頭、下 9 行が体(上から 胴 4 行・腰 1 行・脚 2 行・ブーツ 2 行)。
// 体の行の文字(K = 革ジャン、G = スタッズ、W = 白い T シャツ、J = ジーンズ、B / b = ブーツ)を、
// 着ている服に合わせて差し替えたコピーを作る。服を着ていないところは肌(S)にする。
// ボンデージパンツをはいていないあいだは、腰にモザイクをかける(コミカルな表現)。
NP.outfit = (function () {
  const HEAD_ROWS = 11; // 頭の行数(この下が体)
  const SIDE = ['punkStand', 'punkWalk'];
  const VIEWS = ['punkFront', 'punkFrontWalkA', 'punkFrontWalkB', 'punkBack', 'punkBackWalkA', 'punkBackWalkB'];
  const NAMES = SIDE.concat(VIEWS);

  // ドンキーパンクのパレットに足す色(パレットにない文字を使う)
  const EXTRA = {
    4: '#c8102e', // ボンデージパンツの赤いタータン
    5: '#161616', // タータンの黒い線・ストラップ
    6: '#fff0e0', // モザイク(明)
    7: '#d88060', // モザイク(中)
    8: '#8a3c28', // モザイク(暗)
  };
  const PALETTE = Object.assign({}, DP.sprites.PALETTE, EXTRA);

  function source(name) {
    return SIDE.includes(name) ? DP.sprites.DATA[name] : PunkViews.DATA[name];
  }

  // 服の組み合わせ wear = { boots, pants, tshirt, jacket, belt }(true / false)から 1 コマを作る
  function dress(s, wear, name) {
    const rows = s.rows.map((row) => row.split(''));
    for (let y = HEAD_ROWS; y < s.h; y++) {
      const by = y - HEAD_ROWS; // 体の中の行(0〜8)
      const src = s.rows[y];
      for (let x = 0; x < s.w; x++) {
        const ch = src[x];
        let out = ch;
        if (by <= 3) {
          // 胴: 革ジャン(K・G)と、正面の襟元から見える T シャツ(W)
          if (ch === 'K' || ch === 'G') out = wear.jacket ? ch : wear.tshirt ? 'W' : 'S';
          else if (ch === 'W') out = wear.tshirt ? (wear.jacket ? 'W' : 'R') : 'S'; // T シャツだけなら胸に赤いプリント
        } else if (ch === 'J') {
          if (by === 4 && wear.belt) out = x % 2 ? 'G' : 'K'; // スタッズベルト(黒い革に銀の鋲)
          else if (wear.pants) out = x % 3 === 0 || y % 3 === 0 ? '5' : '4'; // 赤と黒のタータン
          else out = 'S';
        } else if (ch === 'B') out = wear.boots ? 'B' : 'S'; // はだし
        else if (ch === 'b') out = wear.boots ? 'b' : 's';
        rows[y][x] = out;
      }
    }
    // ボンデージパンツ: 脚のあいだにストラップ(脚の 1 行目の、左右を脚にはさまれた透明のドット)
    if (wear.pants) bridge(rows, HEAD_ROWS + 5, '5', s.rows);
    // パンツをはいていなければ腰にモザイク(ベルトをしているときはベルトの下)
    if (!wear.pants) {
      const top = HEAD_ROWS + (wear.belt ? 5 : 4);
      bridge(rows, top + 1, 'S', s.rows); // 股のすき間を埋めて、モザイクを 1 つのかたまりにする
      for (let y = top; y < top + 2; y++) {
        for (let x = 0; x < s.w; x++) {
          const wasJeans = s.rows[y][x] === 'J';
          const gap = s.rows[y][x] === '.' && rows[y][x] === 'S'; // 上で埋めた股のすき間
          if (!wasJeans && !gap) continue;
          // 1 ドットごとに 3 色を混ぜる(行ごとにずらして、ます目模様に見せる)
          rows[y][x] = '678'[(x + (y - top) * 2) % 3];
        }
      }
    }
    return { w: s.w, h: s.h, rows: rows.map((r) => r.join('')) };
  }

  // 行 y の、左右を J にはさまれた透明のドットを ch にする
  function bridge(rows, y, ch, orig) {
    const src = orig[y];
    const first = src.indexOf('J');
    const last = src.lastIndexOf('J');
    if (first < 0) return;
    for (let x = first + 1; x < last; x++) if (src[x] === '.') rows[y][x] = ch;
  }

  // 服の組み合わせを 5 ビットの数にする(絵のキャッシュのキー)
  function key(wear) {
    return NP.config.CLOTHES.reduce((n, c, i) => n | (wear[c] ? 1 << i : 0), 0);
  }

  const cache = {};
  // 服の組み合わせ wear のときの絵 name({ w, h, rows })
  function sprite(name, wear) {
    const k = name + ':' + key(wear);
    if (!cache[k]) cache[k] = dress(source(name), wear, name);
    return cache[k];
  }

  // 向き face と歩いているか・歩いた量から絵を選ぶ(上 = 背面、下 = 正面、左右 = 横向き。左は反転)
  function frameFor(face, moving, walk) {
    const step = Math.floor(walk / 6) % 2;
    if (face === 'up') return { name: moving ? (step ? 'punkBackWalkA' : 'punkBackWalkB') : 'punkBack', flip: false };
    if (face === 'down') return { name: moving ? (step ? 'punkFrontWalkA' : 'punkFrontWalkB') : 'punkFront', flip: false };
    return { name: moving && step ? 'punkWalk' : 'punkStand', flip: face === 'left' };
  }

  return { sprite, frameFor, key, PALETTE, NAMES, HEAD_ROWS };
})();
