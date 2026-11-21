// 描画だけ(状態は変更しない)
// 主人公は js/outfit.js の着せ替えドット絵、警察官・機動隊員はドンキーパンクのドット絵(DP.sprites.DATA の
// copWalkA / copWalkB / riotA / riotB)をそのまま使う。服のアイコン・缶バッジ・迷路の絵はこのゲーム用に新しく描いたもの。
NP.renderer = (function () {
  const cfg = NP.config;
  const T = cfg.TILE;
  const MY = cfg.HUD_H; // 迷路の上端の y
  const MAZE_H = cfg.ROWS * T;
  const BAR_Y = MY + MAZE_H; // 下の帯の上端
  const EN = '"Press Start 2P", monospace';
  const JA = '"DotGothic16", sans-serif';
  let ctx = null;
  let bg = null; // 迷路の背景(壁など動かないもの)を焼いたオフスクリーン

  function init(canvas) {
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function text(str, x, y, color, size, align, font) {
    ctx.fillStyle = color;
    ctx.font = `${size}px ${font || EN}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(str, x, y);
  }
  const center = (str, y, color, size, font) => text(str, cfg.WIDTH / 2, y, color, size, 'center', font);

  // ---- ドット絵をオフスクリーンへ焼いておく(絵・パレット・反転ごと) ----
  const cache = {};
  function bake(key, s, palette, flip) {
    const k = key + (flip ? ':f' : '');
    if (cache[k]) return cache[k];
    const cv = document.createElement('canvas');
    cv.width = s.w;
    cv.height = s.h;
    const c = cv.getContext('2d');
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const ch = s.rows[y][x];
        if (ch === '.' || !palette[ch]) continue;
        c.fillStyle = palette[ch];
        c.fillRect(flip ? s.w - 1 - x : x, y, 1, 1);
      }
    }
    cache[k] = cv;
    return cv;
  }
  // 1 色で塗りつぶしたシルエット(パワーアップ中の主人公の光)
  function silhouette(key, s, color, flip) {
    const pal = {};
    for (const row of s.rows) for (const ch of row) if (ch !== '.') pal[ch] = color;
    return bake('sil:' + color + ':' + key, s, pal, flip);
  }

  // ---- 服のアイコン(12×10。このゲーム用のオリジナル) ----
  const ICON_PAL = Object.assign({}, NP.outfit.PALETTE);
  const ICONS = {
    boots: [
      '..BBB.......',
      '..BBB...BBB.',
      '..BBB...BBB.',
      '..BKB...BBB.',
      '..BBBB..BKB.',
      '..BBBBB.BBBB',
      '.BBBBBB.BBBB',
      'bbbbbbb.BBBB',
      '.......bbbbb',
      '............',
    ],
    pants: [
      '.5555555555.',
      '.4454454454.',
      '.4454454454.',
      '.5555555555.',
      '.44545.4454.',
      '.4454...454.',
      '.55555555555',
      '.4454...454.',
      '.4454...454.',
      '.5555...555.',
    ],
    tshirt: [
      '...WW..WW...',
      '.WWWWWWWWWW.',
      'WWWWWWWWWWWW',
      'WWW.WRRW.WWW',
      '...WRWWRW...',
      '...WWRRWW...',
      '...WRWWRW...',
      '...WWRRWW...',
      '...WWWWWW...',
      '............',
    ],
    jacket: [
      '...KKKKKK...',
      '.KKKGKKGKKK.',
      'KKKKKWWKKKKK',
      'KKKGKWWKGKKK',
      'KKK.KWWK.KKK',
      'KKK.KKKK.KKK',
      'GGG.KGKK.GGG',
      '....KKKK....',
      '....KKKK....',
      '............',
    ],
    belt: [
      '............',
      '............',
      'KKKKKKKKKKKK',
      'KGKGKGYYKGKG',
      'KKKKKKYKYKKK',
      'KGKGKGYYKGKG',
      'KKKKKKKKKKKK',
      '............',
      '............',
      '............',
    ],
  };
  const iconSprite = (name) => ({ w: 12, h: 10, rows: ICONS[name] });
  function drawIcon(name, x, y, gray) {
    const pal = gray ? Object.fromEntries(Object.keys(ICON_PAL).map((k) => [k, '#3a3a44'])) : ICON_PAL;
    ctx.drawImage(bake('icon:' + name + (gray ? ':g' : ''), iconSprite(name), pal), Math.round(x), Math.round(y));
  }

  // ---- 迷路の背景を焼く ----
  function buildBackground() {
    const cv = document.createElement('canvas');
    cv.width = cfg.COLS * T;
    cv.height = MAZE_H;
    const c = cv.getContext('2d');
    const wall = (col, row) => NP.maze.isWallChar(NP.maze.at(col, row)) || ((col < 0 || col >= cfg.COLS) && row !== cfg.WARP_ROW);
    const isBase = (col, row) => {
      const ch = NP.maze.at(col, row);
      return ch === 'B' || ch === '=';
    };
    // 床(夜のアスファルト。ところどころに小石の点)
    c.fillStyle = '#050508';
    c.fillRect(0, 0, cv.width, cv.height);
    const r = NP.enemies.rng(7);
    c.fillStyle = '#16161e';
    for (let i = 0; i < 220; i++) c.fillRect(Math.floor(r() * cv.width), Math.floor(r() * cv.height), 1, 1);
    for (let row = 0; row < cfg.ROWS; row++) {
      for (let col = 0; col < cfg.COLS; col++) {
        const ch = cfg.MAZE[row][col];
        const x = col * T;
        const y = row * T;
        if (ch === '#') {
          // レンガ(8×4 のレンガを段ごとに半分ずらす。画面全体で模様がつながる)
          c.fillStyle = '#2a0c08';
          c.fillRect(x, y, T, T);
          for (let by = 0; by < T; by += 4) {
            const off = ((y + by) / 4) % 2 ? 4 : 0;
            for (let bx = -8; bx < T; bx += 8) {
              const px = x + bx + off;
              const shade = ((px >> 3) * 5 + ((y + by) >> 2) * 3) % 3;
              c.fillStyle = ['#6b2418', '#5a1c12', '#7a2c1c'][shade];
              const x0 = Math.max(x, px);
              const x1 = Math.min(x + T, px + 7);
              if (x1 > x0) c.fillRect(x0, y + by, x1 - x0, 3);
            }
          }
          // 通路に面した辺: ネオンの照り返し
          c.fillStyle = '#d0583c';
          if (!wall(col, row - 1) && !isBase(col, row - 1)) c.fillRect(x, y, T, 1);
          if (!wall(col, row + 1) && !isBase(col, row + 1)) c.fillRect(x, y + T - 1, T, 1);
          if (!wall(col - 1, row) && !isBase(col - 1, row)) c.fillRect(x, y, 1, T);
          if (!wall(col + 1, row) && !isBase(col + 1, row)) c.fillRect(x + T - 1, y, 1, T);
        } else if (ch === 'B') {
          c.fillStyle = '#0a1438';
          c.fillRect(x, y, T, T);
        } else if (ch === '=') {
          // 交番の出入口: 黄色と黒のしま模様のバー
          c.fillStyle = '#000';
          c.fillRect(x, y, T, T);
          for (let i = 0; i < T; i += 4) {
            c.fillStyle = (i / 4) % 2 ? '#141414' : '#ffd23c';
            c.fillRect(x + i, y + T - 5, 4, 3);
          }
        }
      }
    }
    // ライブハウス(L のマス): 紫の建物・入口の扉・ポスター。ネオン看板は毎回描く(点滅するので)
    const L = findBlock('L');
    if (L) {
      const x = L.col * T;
      const y = L.row * T;
      const w = L.w * T;
      const h = L.h * T;
      c.fillStyle = '#1c0f2a';
      c.fillRect(x, y, w, h);
      c.fillStyle = '#3a1c50';
      c.fillRect(x, y, w, 2);
      c.fillRect(x, y + h - 2, w, 2);
      // 入口の扉(下のまん中)
      c.fillStyle = '#0a0a0a';
      c.fillRect(x + w / 2 - 6, y + h - 16, 12, 14);
      c.fillStyle = '#ffd23c';
      c.fillRect(x + w / 2 + 3, y + h - 9, 1, 2);
      // 壁に貼ったポスター
      c.fillStyle = '#ff5aa6';
      c.fillRect(x + 4, y + h - 15, 7, 9);
      c.fillStyle = '#3cf0ff';
      c.fillRect(x + w - 11, y + h - 15, 7, 9);
      c.fillStyle = '#141414';
      c.fillRect(x + 6, y + h - 12, 3, 1);
      c.fillRect(x + w - 9, y + h - 12, 3, 1);
    }
    return cv;
  }
  // 文字 ch のマスがつくる長方形
  function findBlock(ch) {
    let a = null;
    for (let r = 0; r < cfg.ROWS; r++)
      for (let c = 0; c < cfg.COLS; c++)
        if (cfg.MAZE[r][c] === ch) {
          if (!a) a = { col: c, row: r, c1: c, r1: r };
          a.c1 = Math.max(a.c1, c);
          a.r1 = Math.max(a.r1, r);
        }
    return a && { col: a.col, row: a.row, w: a.c1 - a.col + 1, h: a.r1 - a.row + 1 };
  }

  // ---- HUD と下の帯 ----
  function drawHud(g) {
    rect(0, 0, cfg.WIDTH, MY, '#000');
    text('SCORE', 6, 4, '#ff3c3c', 8);
    text(String(g.score).padStart(6, '0'), 6, 16, '#fff', 10);
    text('HI', 120, 4, '#ffe83c', 8);
    text(String(g.hiScore).padStart(6, '0'), 120, 16, '#fff', 10);
    text('STAGE', 250, 4, '#ff3cc8', 8);
    text(String(g.stage), 250, 16, '#fff', 10);
  }

  function drawBar(g) {
    rect(0, BAR_Y, cfg.WIDTH, cfg.HEIGHT - BAR_Y, '#000');
    if (g.state === 'title') return; // タイトル画面では残機・服を出さない
    // 残機: プレイ中の 1 人を除いた予備の人数だけ、モヒカンの頭を描く
    const spare = Math.max(0, g.lives - 1);
    const head = NP.outfit.sprite('punkStand', {});
    const img = bake('life', { w: head.w, h: 11, rows: head.rows.slice(0, 11) }, NP.outfit.PALETTE);
    // 4 人までは頭を並べ、5 人以上は「頭 + x人数」(1UP に上限がないので、どれだけ増えても帯からはみ出さない)
    if (spare <= 4) for (let i = 0; i < spare; i++) ctx.drawImage(img, 4 + i * 18, BAR_Y + 7);
    else {
      ctx.drawImage(img, 4, BAR_Y + 7);
      text('x' + spare, 24, BAR_Y + 10, '#fff', 8);
    }
    // 集めた服(まだのものは灰色)。黒い服も見えるよう、集めた服は明るい台紙の上に描く
    cfg.CLOTHES.forEach((c, i) => {
      const x = cfg.WIDTH - 5 * 16 - 4 + i * 16;
      if (g.wear[c]) rect(x - 1, BAR_Y + 7, 14, 12, '#7a7a9a');
      drawIcon(c, x, BAR_Y + 8, !g.wear[c]);
    });
  }

  // ---- アイテム ----
  const BADGE_COLORS = ['#ff5aa6', '#ffd23c', '#3cf0ff'];
  // 缶バッジ(4×4 の丸)を迷路の座標 (x, y) に描く。k で 3 色を選ぶ
  function drawBadgeAt(x, y, k) {
    const col = BADGE_COLORS[k % 3];
    const cy = MY + y;
    rect(x - 1, cy - 2, 2, 4, col);
    rect(x - 2, cy - 1, 4, 2, col);
    rect(x - 1, cy - 1, 1, 1, '#ffffff');
  }
  function drawItems(g) {
    for (let r = 0; r < cfg.ROWS; r++) {
      for (let c = 0; c < cfg.COLS; c++) {
        const it = g.items[r][c];
        if (!it) continue;
        const cx = c * T + T / 2;
        const cy = MY + r * T + T / 2;
        if (it === 'badge') {
          // 缶バッジ(4×4 の丸。色は場所ごとに 3 色)
          const col = BADGE_COLORS[(c + r) % 3];
          rect(cx - 1, cy - 2, 2, 4, col);
          rect(cx - 2, cy - 1, 4, 2, col);
          rect(cx - 1, cy - 1, 1, 1, '#ffffff');
        } else if (it === 'beer') {
          // ビール瓶(ドンキーパンクの beerUp。点滅で目立たせる)
          if (Math.floor(g.t / 12) % 4 === 3) continue;
          const s = DP.sprites.DATA.beerUp;
          ctx.drawImage(bake('beer', s, DP.sprites.PALETTE), cx - s.w / 2, cy - 8);
        } else {
          // 服: 光る台座の上にアイコン
          const name = it.slice(8);
          const glow = Math.floor(g.t / 8) % 2 ? '#ff3cc8' : '#ffd23c';
          const bob = Math.floor(g.t / 16) % 2;
          rect(cx - 8, cy + 5, 16, 2, glow);
          rect(cx - 7, cy - 7 + bob, 14, 12, '#7a7a9a'); // 黒い服も見えるように明るい台紙
          drawIcon(name, cx - 6, cy - 6 + bob, false);
        }
      }
    }
  }

  // ---- キャラクター ----
  // (x, y) を中心として img を描く。ワープ通路の端では反対側にも描く(迷路の外にはみ出した分は切り取る)
  function drawWrapped(img, x, y, dyTop) {
    const px = Math.round(x - img.width / 2);
    const py = Math.round(MY + y - dyTop);
    ctx.drawImage(img, px, py);
    const W = cfg.COLS * T;
    if (x < img.width) ctx.drawImage(img, px + W, py);
    if (x > W - img.width) ctx.drawImage(img, px - W, py);
  }

  function heroFrame(g) {
    const p = g.player;
    if (g.state === 'dying') {
      // くるくる回る(正面 → 左 → 背面 → 右)
      const k = Math.floor((cfg.timing.dying - g.timer) / 5) % 4;
      return NP.outfit.frameFor(['down', 'left', 'up', 'right'][k], false, 0);
    }
    const moving = p.moving && g.state === 'playing';
    return NP.outfit.frameFor(p.face, moving, p.walk);
  }

  function drawHero(g) {
    const p = g.player;
    if (g.state === 'dying' && g.timer < 30 && Math.floor(g.timer / 3) % 2) return; // 最後は点滅して消える
    const f = heroFrame(g);
    const s = NP.outfit.sprite(f.name, g.wear);
    const key = f.name + ':' + NP.outfit.key(g.wear);
    if (g.powerTimer > 0 && g.state !== 'dying') {
      // パワーアップ中: 金色に光る縁取り
      const glow = silhouette(key, s, Math.floor(g.t / 4) % 2 ? '#ffd23c' : '#ff8a1e', f.flip);
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawWrapped(glow, p.x + ox, p.y + oy, 13);
    }
    drawWrapped(bake('hero:' + key, s, NP.outfit.PALETTE, f.flip), p.x, p.y, 13);
  }

  // 敵の絵とパレット
  // ---- 怯えた顔(追加修正④)。ドンキーパンクの絵の顔の行だけを差し替えたコピー(元のデータは変えない) ----
  // 警察官: 八の字に下がった眉・見開いた白目に小さな黒目・歯をガチガチ鳴らす口(2 コマで口の形が変わる)
  // 機動隊員: バイザー越しに見開いた目・バイザーの下でガチガチ鳴らす口
  const SCARED_FACE = {
    cop: [
      { 4: '....KKSSSKK...', 5: '....WKWSWKWS..', 7: '....PKWKWKP...' },
      { 4: '....KKSSSKK...', 5: '....WKWSWKWS..', 7: '....PWKWKWP...' },
    ],
    riot: [
      { 3: '..NNWKWUWKWN...', 5: '...NKWKWKSN....' },
      { 3: '..NNWKWUWKWN...', 5: '...NSKWKWKN....' },
    ],
  };
  const scaredCache = {};
  function scaredSprite(name, kind, mouth) {
    const k = name + ':' + mouth;
    if (scaredCache[k]) return scaredCache[k];
    const s = DP.sprites.DATA[name];
    const face = SCARED_FACE[kind][mouth];
    const rows = s.rows.map((row, y) => (face[y] ? face[y].padEnd(s.w, '.').slice(0, s.w) : row));
    scaredCache[k] = { w: s.w, h: s.h, rows };
    return scaredCache[k];
  }
  // 怯えているときの色: 体はピンク。顔の線(K)・肌(S)は残す。終わりが近いと、ピンクとふだんの色で点滅
  const SCARED_PAL = Object.assign({}, DP.sprites.PALETTE, {
    N: '#ff7ab8', // 制服・ヘルメット
    n: '#ffb0d6', // 明るい部分
    k: '#d04888', // 機動隊のベスト
    Y: '#ffffff', // バッジ・バックル
    U: '#ffd0e8', // バイザー
    e: '#ffffff',
    W: '#ffffff',
    P: '#ff3c8c', // 頬(真っ赤)
  });

  // 敵のふだんの色(追加修正⑬): 体を config.enemies[].body の色に、バッジ・ベストの帯は白っぽく光らせる
  function normalPalette(def) {
    return Object.assign({}, DP.sprites.PALETTE, def.body, def.kind === 'cop' ? { Y: '#ffe83c' } : { W: '#f0f0f0' });
  }

  function enemyLook(e, g) {
    // 怯えて逃げるときは足をばたつかせる(歩きのコマを速く替える)
    const step = Math.floor(e.walk / (e.fright ? 4 : 8)) % 2;
    const name = e.def.kind === 'cop' ? (step ? 'copWalkB' : 'copWalkA') : step ? 'riotB' : 'riotA';
    let pal;
    let key;
    if (e.fright) {
      // 怯えて逃げている(追加修正④): ピンクの体と怯えた顔。終わりが近いとふだんの色と交互に点滅
      const warn = g.powerTimer < cfg.power.warn && Math.floor(g.powerTimer / 8) % 2 === 0;
      const normal = normalPalette(e.def);
      pal = warn ? normal : SCARED_PAL;
      const mouth = Math.floor(g.t / 5) % 2; // 歯をガチガチ
      key = 'scared' + mouth + (warn ? 'W:' + e.def.name : '');
      return { s: scaredSprite(name, e.def.kind, mouth), key: name + ':' + key, pal, scared: true, warn };
    } else {
      // ふだん: 1 人ずつ色の違う体(赤・青・緑・オレンジ。追加修正⑬)
      pal = normalPalette(e.def);
      key = 'e:' + e.def.name;
    }
    return { s: DP.sprites.DATA[name], key: name + ':' + key, pal };
  }

  // 汗のしずく(水色に白い光。3×4 ドット)
  function drop(x, y) {
    rect(x, y + 1, 3, 2, '#7fd0ff');
    rect(x + 1, y, 1, 4, '#7fd0ff');
    rect(x + 1, y + 1, 1, 1, '#ffffff');
  }

  function drawEnemies(g) {
    for (const e of g.enemies) {
      const look = enemyLook(e, g);
      const img = bake(look.key, look.s, look.pal, e.face === 'left');
      const bob = e.state === 'home' ? Math.round(Math.sin(e.walk / 6) * 2) : 0;
      // 怯えているときはブルブル震える(1px 左右に揺れる)
      const shiver = look.scared ? (Math.floor(g.t / 2) % 2 ? 1 : -1) : 0;
      drawWrapped(img, e.x + shiver, e.y + bob, look.s.h - 7);
      if (look.scared) drawSweat(e, g);
    }
  }

  // 汗を飛ばしながら逃げる: 頭の両側から、しずくが弧を描いて飛び散る(2 粒が交互に。後ろへ流れる)
  function drawSweat(e, g) {
    const top = MY + e.y - 8; // 頭の横(絵の上端は e.y - 10)
    const back = e.face === 'left' ? 1 : -1; // 進む向きの反対側
    for (let k = 0; k < 2; k++) {
      const a = (g.t + e.i * 7 + k * 9) % 18; // 0〜17 で 1 粒が飛んで消える
      const side = k === 0 ? back : -back;
      const dx = side * (5 + a * 0.5) + back * a * 0.3;
      const dy = -a * 0.8 + a * a * 0.07; // 上へはねてから落ちる
      drop(Math.round(e.x + dx - 1), Math.round(top + dy));
    }
    // 頭の上の大きな汗マーク(ファミコンらしい記号)
    if (Math.floor(g.t / 10) % 2 === 0) drop(Math.round(e.x + back * 6), Math.round(top - 5));
  }

  // ---- 文字の演出 ----
  function drawSigns(g) {
    // ライブハウスのネオン看板(ときどき一瞬消える)
    const L = findBlock('L');
    if (L) {
      const x = L.col * T + (L.w * T) / 2;
      const y = MY + L.row * T + 5;
      const flick = g.t % 97 < 4 || g.t % 233 < 3;
      const pink = flick ? '#5a2040' : '#ff3cc8';
      text('LIVE', x, y, pink, 8, 'center');
      text('HOUSE', x, y + 11, flick ? '#205a5a' : '#3cf0ff', 6, 'center');
    }
    // 交番(看板は交番の下の壁に。上の出入口のあたりは敵が出入りするので避ける)
    const B = findBlock('B');
    if (B) {
      const x = B.col * T + (B.w * T) / 2;
      const y = MY + (B.row + 1) * T + 4;
      rect(x - 22, y - 2, 44, 10, '#0a1438');
      text('POLICE', x, y, '#7fa8ff', 6, 'center');
    }
  }

  // ---- 乱入キャラクター(追加修正②)。上から見た車両の絵(右向きで描いて、向きに合わせて回す) ----
  const CAR_PAL = {
    K: '#141414', W: '#f0f0f0', k: '#2a3a4a', R: '#ff2a2a', U: '#3a8cff', Y: '#ffe8a0', S: '#f4bc94', G: '#8a8a8a',
    O: '#5a6a2a', o: '#3a4a1a', T: '#2a2a20', t: '#4a4a3a', H: '#3c443a', h: '#5a6458', D: '#202420',
  };
  const TRACKS = (w, n) => 'Tt'.repeat(n).padEnd(w, '.');
  const CARS = {
    // パトカー: 白黒の車体、屋根に赤と青の回転灯、前に黄色いライト
    patrol: { pivot: 9, rows: ['..KKK.......KKK...', '.KWWWWWWWWWWWWWWK.', 'KWWWkkkWWRWkkkkWWY', 'KWWWkkkWWRWkkkkWWK', 'KWWWkkkWWUWkkkkWWK', 'KWWWkkkWWUWkkkkWWY', '.KWWWWWWWWWWWWWWK.', '..KKK.......KKK...'] },
    // ジープ: オリーブ色の車体、運転席の窓、荷台の銃手と前へ向けた機関銃
    jeep: { pivot: 8, rows: ['..KK.......KK...', '.oOOOOOOOOOOOo..', 'oOOkkOOOSSOOOOOY', 'oOOkkOOOSSGGGGGG', 'oOOkkOOOSSGGGGGG', 'oOOkkOOOSSOOOOOY', '.oOOOOOOOOOOOo..', '..KK.......KK...'] },
    // 軽武装戦車: 両側のキャタピラ、オリーブ色の車体と砲塔、短い砲身
    lightTank: { pivot: 7, rows: [TRACKS(18, 7), TRACKS(18, 7), '.OOOOOOOOOOOOO....', '.OOOoooooOOOOO....', '.OOOoooooGGGGGGGGG', '.OOOoooooGGGGGGGGG', '.OOOoooooOOOOO....', '.OOOOOOOOOOOOO....', TRACKS(18, 7), TRACKS(18, 7)] },
    // 重戦車: 太いキャタピラ、暗い灰緑の大きな車体と砲塔、長い砲身
    heavyTank: {
      pivot: 9,
      rows: [TRACKS(26, 9), TRACKS(26, 9), TRACKS(26, 9), '.HHHHHHHHHHHHHHHHH........', '.HHhhhhhhhhhHHHHHH........', '.HHhDDDDDDDhHHHHHH........', '.HHhDDDDDDDGGGGGGGGGGGGGGG', '.HHhDDDDDDDGGGGGGGGGGGGGGG', '.HHhDDDDDDDhHHHHHH........', '.HHhhhhhhhhhHHHHHH........', '.HHHHHHHHHHHHHHHHH........', TRACKS(26, 9), TRACKS(26, 9), TRACKS(26, 9)],
    },
  };
  const ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

  // 予備動作で武器(機関銃・砲身 = 絵の G のドット)が点滅しているか(追加修正⑦)。4 ステップごとに点灯・消灯
  function weaponFlash(v) {
    return !!(v.aim && Math.floor((v.def.windup - v.aim.timer) / 4) % 2 === 0);
  }

  // 車両の絵(コマ: パトカーは回転灯の赤青が入れ替わる、戦車はキャタピラが動く)。
  // 予備動作の点灯中は、武器のドットを車両ごとの色(ジープ 黄 / 軽戦車 オレンジ / 重戦車 赤)にする
  function carImage(v, g) {
    const c = CARS[v.type];
    const frame = Math.floor(v.walk / (v.type === 'patrol' ? 10 : 6)) % 2;
    let rows = c.rows;
    if (frame) rows = rows.map((row) => row.replace(/[RUTt]/g, (ch) => ({ R: 'U', U: 'R', T: 't', t: 'T' })[ch]));
    const s = { w: rows[0].length, h: rows.length, rows };
    const lit = weaponFlash(v);
    const key = 'car:' + v.type + ':' + frame + (lit ? ':lit' : '');
    return bake(key, s, lit ? Object.assign({}, CAR_PAL, { G: v.def.flash }) : CAR_PAL);
  }

  // 銃口・砲口の発射炎(追加修正⑦)。ジープは小さな黄色い炎(1 発ごと)、戦車は大きな炎(重戦車ほど大きい)
  function drawMuzzle(v) {
    if (!v.flash) return;
    const c = CARS[v.type];
    const [dx, dy] = NP.move.DIRS[v.face];
    const tip = c.rows[0].length - c.pivot; // 車体の中心から砲口までの距離
    const size = v.type === 'jeep' ? 3 : v.type === 'lightTank' ? 5 : 8;
    const x = v.x + dx * (tip + size * 0.6);
    const y = MY + v.y + dy * (tip + size * 0.6);
    circle(x, y, size, '#ff8a1e');
    circle(x, y, size * 0.6, '#ffe83c');
    circle(x, y, size * 0.3, '#ffffff');
    // 前へ飛ぶ火花
    rect(x + dx * size - 1, y + dy * size - 1, 2, 2, '#ffe83c');
  }

  // 構えた向きの、弾が届く範囲(壁の手前まで)を赤い点線で示す(よけるための予告)
  function drawAimLine(v) {
    const [dx, dy] = NP.move.DIRS[v.aim.dir];
    const col = NP.maze.colOf(v.x);
    const row = NP.maze.rowOf(v.y);
    ctx.fillStyle = '#ff3030';
    for (let k = 1; k <= v.def.range; k++) {
      if (!NP.maze.playerCan(col + dx * k, row + dy * k)) break;
      const cx = NP.maze.wrapX(v.x + dx * k * T);
      const cy = MY + v.y + dy * k * T;
      for (let i = -6; i <= 6; i += 4) ctx.fillRect(Math.round(cx + (dx ? i : 0)) - 1, Math.round(cy + (dy ? i : 0)) - 1, 2, 2);
    }
  }

  // 車両 1 台を描く(wrap: ワープ通路の反対側にも描くか)
  function drawCar(v, g, wrap) {
    const W = cfg.COLS * T;
    const c = CARS[v.type];
    const img = carImage(v, g);
    for (const ox of wrap ? [0, -W, W] : [0]) {
      if (ox && Math.abs(v.x + ox - W / 2) > W / 2 + 16) continue;
      ctx.save();
      ctx.translate(Math.round(v.x + ox), Math.round(MY + v.y));
      ctx.rotate(ANGLE[v.face] || 0);
      ctx.drawImage(img, -c.pivot, -img.height / 2);
      ctx.restore();
    }
  }

  function drawIntruders(g) {
    for (const v of g.intruders || []) {
      const warn = weaponFlash(v);
      drawCar(v, g, true);
      drawMuzzle(v);
      if (v.aim) {
        drawAimLine(v);
        if (warn) text('!', v.x, MY + v.y - 20, v.def.flash, 10, 'center');
      }
    }
  }

  // 銃弾(黄色い小さな弾)・砲弾(黒い弾に赤い光)。list を省略すると本編の弾
  function drawShots(g, list) {
    for (const s of list || g.shots || []) {
      const x = Math.round(s.x);
      const y = Math.round(MY + s.y);
      if (s.kind === 'bullet') {
        rect(x - 1, y - 1, 3, 3, '#ffe83c');
        rect(x, y, 1, 1, '#ffffff');
      } else {
        rect(x - 2, y - 2, 5, 5, '#202020');
        rect(x - 1, y - 1, 3, 3, '#ff6a1e');
      }
    }
  }

  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    ctx.fill();
  }

  // 砲弾の爆風(当たり判定のある大きさで描く)。list を省略すると本編の爆風
  function drawBlasts(g, list) {
    for (const b of list || g.blasts || []) {
      const age = b.life - b.t;
      const r = b.r * Math.min(1, (age + 1) / 4);
      const y = MY + b.y;
      ctx.globalAlpha = Math.min(1, b.t / 10);
      circle(b.x, y, r, age < b.hit ? '#ff6a1e' : '#6a5a50');
      circle(b.x, y, r * 0.65, age < b.hit ? '#ffd23c' : '#4a4440');
      if (age < 5) circle(b.x, y, r * 0.35, '#ffffff');
      ctx.globalAlpha = 1;
    }
  }

  // 撃破の大爆発(閃光・火の玉 → 煙・飛び散る車両の破片)。戦車ほど大きく長い
  function drawBooms(g) {
    for (const b of g.booms || []) {
      const age = b.life - b.t;
      const y = MY + b.y;
      const fade = Math.min(1, b.t / 15);
      if (age < 5) circle(b.x, y, (14 + age * 4) * b.scale, age % 2 ? '#ffffff' : '#ffe83c'); // 閃光
      for (const f of b.fires) {
        const a = age - f.delay;
        if (a < 0) continue;
        const grow = Math.min(1, (a + 1) / 6);
        ctx.globalAlpha = fade;
        const hot = a < 14;
        circle(b.x + f.dx, y + f.dy - (hot ? 0 : (a - 14) * 0.3), f.r * grow * (hot ? 1 : 1.3), hot ? (a < 6 ? '#ffd23c' : '#ff6a1e') : '#5a5450');
        if (hot) circle(b.x + f.dx, y + f.dy, f.r * grow * 0.5, '#fff4c0');
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = fade;
      for (const p of b.parts) {
        const sz = p.spin && Math.floor(age / 3) % 2 ? Math.max(1, p.size - 1) : p.size;
        rect(p.x - sz / 2, MY + p.y - sz / 2, sz, p.spin && Math.floor(age / 3) % 2 ? p.size : sz, p.color);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawPopups(g) {
    // 得点の表示(少しずつ浮き上がる)。連続撃破で高い得点ほど大きく。乱入キャラクターの撃破はさらに大きく
    for (const p of g.popups) {
      if (p.big) {
        const y = MY + p.y - 18 - ((p.life || 50) - p.t) * 0.2;
        const x = Math.min(cfg.WIDTH - 30, Math.max(30, p.x));
        text(p.text, x + 1, y + 1, '#000000', 13, 'center');
        text(p.text, x, y, Math.floor(p.t / 4) % 2 ? '#ffe83c' : '#ff3c3c', 13, 'center');
        continue;
      }
      const big = Number(p.text) >= 400;
      text(p.text, p.x, MY + p.y - 10 - ((p.life || 50) - p.t) * 0.3, big ? '#ffe83c' : '#3cf0ff', big ? 8 : 7, 'center');
    }
  }

  function drawMessages(g) {
    const midY = MY + 12 * T + 4; // 交番の下の通路
    // 得点による 1UP(追加修正⑨): 迷路のまん中(交番のすぐ上)に「1UP」を点滅表示
    if (g.oneUpTimer > 0 && Math.floor(g.oneUpTimer / 6) % 2 === 0) {
      const y = MY + 7 * T + 2;
      rect(cfg.WIDTH / 2 - 30, y - 4, 60, 20, '#000');
      center('1UP', y, Math.floor(g.oneUpTimer / 12) % 2 ? '#ffe83c' : '#3cff6e', 12);
    }
    if (g.state === 'ready') {
      center('READY!', midY, '#ffe83c', 10);
      if (g.stage > 1 || g.timer > 60) center(`STAGE ${g.stage}`, MY + 7 * T + 4, '#ff3cc8', 8);
    }
    if (g.state === 'clear') {
      rect(40, midY - 6, cfg.WIDTH - 80, 22, '#000');
      center('PUNK RESTORED!', midY, Math.floor(g.t / 8) % 2 ? '#ffe83c' : '#ff3c3c', 9);
    }
    if (g.state === 'gameover') {
      rect(60, midY - 6, cfg.WIDTH - 120, 22, '#000');
      center('GAME OVER', midY, '#ff3c3c', 10);
    }
    if (g.pickupTimer > 0 && g.lastPickup && g.state === 'playing') {
      const label = cfg.CLOTHES_LABEL[g.lastPickup] + ' GET!';
      ctx.font = `12px ${JA}`;
      const w = ctx.measureText(label).width + 12;
      rect(cfg.WIDTH / 2 - w / 2, MY + 1, w, 15, '#000');
      center(label, MY + 2, '#ffe83c', 12, JA);
    }
  }

  // ---- タイトルのデモ・ブレイク演出(最終演出)で使う、迷路の外の描き方 ----
  // 主人公を (x, y) に描く(大きさ・絵はゲーム本編と同じ。glow: パワーアップの光)
  function drawHeroAt(h, wear, glow, t) {
    const f = NP.outfit.frameFor(h.face, h.moving, h.walk);
    const s = NP.outfit.sprite(f.name, wear);
    const key = f.name + ':' + NP.outfit.key(wear);
    const at = (img, x, y) => ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(MY + y - 13));
    if (glow) {
      const gl = silhouette(key, s, Math.floor(t / 4) % 2 ? '#ffd23c' : '#ff8a1e', f.flip);
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) at(gl, h.x + ox, h.y + oy);
    }
    at(bake('hero:' + key, s, NP.outfit.PALETTE, f.flip), h.x, h.y);
  }
  // タイトルの追手 1 人(警察官・機動隊員・車両)。怯えているときは本編と同じ汗と震え
  function drawChaserAt(c, g) {
    if (c.kind === 'cop' || c.kind === 'riot') return drawCopAt(Object.assign({}, c, { def: cfg.enemies[c.enemy] }), g.t);
    const v = { type: c.kind, def: cfg.intruder.types[c.kind], x: c.x, y: c.y, face: c.face, walk: c.walk, aim: null, flash: 0 };
    if (c.scared) v.x += Math.floor(g.t / 2) % 2 ? 1 : -1;
    drawCar(v, g, false);
    if (c.scared) drawSweat({ i: ORDER_I[c.kind], x: v.x, y: v.y - 2, face: v.face }, g);
  }
  const ORDER_I = { patrol: 4, jeep: 5, lightTank: 6, heavyTank: 7 }; // 汗のしずくの出るタイミングをずらす番号
  // 警察官(追跡巡査の絵)・機動隊員(巡回機動隊の絵)を描く。scared なら本編のビール中と同じ怯えた姿(ピンク・怯えた顔・汗・震え)
  function drawCopAt(c, t) {
    const def = c.def || (c.kind === 'riot' ? cfg.enemies[2] : cfg.enemies[0]);
    const e = { i: cfg.enemies.indexOf(def), def, walk: c.walk, fright: !!c.scared, state: 'active', face: c.face, x: c.x, y: c.y };
    const fake = { powerTimer: 9999, t };
    const look = enemyLook(e, fake);
    const img = bake(look.key, look.s, look.pal, c.face === 'left');
    const shiver = look.scared ? (Math.floor(t / 2) % 2 ? 1 : -1) : 0;
    ctx.drawImage(img, Math.round(c.x + shiver - img.width / 2), Math.round(MY + c.y - (look.s.h - 7)));
    if (look.scared) drawSweat(e, fake);
  }
  // 服(本編の迷路と同じ、台紙つきのアイコン)
  function drawClothesAt(name, x, y, t) {
    const bob = Math.floor(t / 16) % 2;
    rect(x - 8, MY + y + 5, 16, 2, Math.floor(t / 8) % 2 ? '#ff3cc8' : '#ffd23c');
    rect(x - 7, MY + y - 7 + bob, 14, 12, '#7a7a9a');
    drawIcon(name, x - 6, MY + y - 6 + bob, false);
  }

  // タイトルの最後のキャラクター紹介(追加修正⑬): まん中に主人公、その下に敵 4 人を横一列。各敵の下に名前と行動パターン
  function drawIntro(f, g) {
    center('- CHARACTERS -', MY + 74, '#ff3cc8', 8);
    // 主人公(完全装備・正面)。大きさは本編と同じ
    drawHeroAt(f.hero, f.wear, false, g.t);
    center('NAKED PUNK', MY + f.hero.y + 12, '#ffffff', 8);
    center('きみ(主人公)', MY + f.hero.y + 24, '#a8a8c8', 10, JA);
    // 敵 4 人(1 人ずつ出てくる。出た瞬間は少し点滅)
    const n = cfg.enemies.length;
    const colW = cfg.WIDTH / n;
    cfg.enemies.forEach((def, i) => {
      if (f.shown < i + 2) return;
      const age = f.introT - (i + 1) * NP.demo.D.introStep;
      if (age < 12 && Math.floor(age / 3) % 2) return;
      const x = Math.round(colW * i + colW / 2);
      const y = 178;
      // 足ぶみしながら右を向いて立つ(ふだんの色)
      drawCopAt({ kind: def.kind, def, x, y, face: 'right', walk: g.t, scared: false }, g.t);
      text(def.name, x, MY + y + 14, def.color, 10, 'center', JA);
      def.intro.forEach((line, k) => text(line, x, MY + y + 28 + k * 13, '#e0e0ff', 10, 'center', JA));
    });
  }

  // タイトル画面(最終演出①): 黒い画面にタイトル、服を集めるデモ(js/demo.js)、点滅する PRESS ENTER TO START
  function drawTitle(g) {
    rect(0, MY, cfg.WIDTH, MAZE_H, '#000');
    center('NAKED', MY + 12, '#ff2a2a', 22);
    center('PUNK', MY + 42, '#ffffff', 22);
    const f = NP.demo.frame(g.demoT);
    if (f.phase === 'intro') {
      drawIntro(f, g);
      if (Math.floor(g.t / 30) % 2 === 0) center('PRESS ENTER TO START', MY + 252, '#ffe83c', 9);
      center('↑↓←→ 移動  M 音 ON/OFF', MY + 298, '#a8a8c8', 11, JA);
      return;
    }
    // コースに並べた缶バッジ(本編と同じ絵・色。主人公が通ったら消える)
    for (const b of f.badges) if (!b.taken) drawBadgeAt(b.x, b.y, b.i);
    for (const c of f.clothes) if (!c.taken) drawClothesAt(c.name, c.x, c.y, g.t);
    // 追手の行列(後ろの大きい車両から描き、先頭の警察官が手前)
    for (const c of f.chasers.slice().reverse()) drawChaserAt(c, g);
    drawHeroAt(f.hero, f.wear, false, g.t);
    // 5 つそろって正面を向いたら
    if (f.phase === 'pose') center('PUNK RESTORED!', MY + f.hero.y - 34, Math.floor(g.t / 8) % 2 ? '#ffe83c' : '#ff3c3c', 8);
    if (Math.floor(g.t / 30) % 2 === 0) center('PRESS ENTER TO START', MY + 252, '#ffe83c', 9);
    center('裸のパンクスが服を集めて元の姿に戻る!', MY + 274, '#e0e0ff', 12, JA);
    center('↑↓←→ 移動  M 音 ON/OFF', MY + 298, '#a8a8c8', 11, JA);
  }

  // ブレイク演出(最終演出②): 黒い画面に道路。裸の主人公と車両の追いかけっこ(js/demo.js の NP.intermission)
  function drawIntermission(g) {
    const it = g.inter;
    const f = NP.intermission.frame(it.t, it.type);
    const y = NP.intermission.C.y;
    rect(0, MY, cfg.WIDTH, MAZE_H, '#000');
    // 道路(歩道の縁と、まん中の白い破線)
    rect(0, MY + y + 14, cfg.WIDTH, 2, '#3a3a4a');
    rect(0, MY + y - 26, cfg.WIDTH, 2, '#3a3a4a');
    ctx.fillStyle = '#2a2a3a';
    for (let x = ((-it.t * 2) % 24) + 24; x < cfg.WIDTH; x += 24) ctx.fillRect(x - 24, MY + y + 26, 12, 2);
    center('BREAK TIME!', MY + 60, '#ff3cc8', 10);
    center(`NEXT STAGE ${it.next}`, MY + 80, '#a8a8c8', 8);
    if (f.beer) {
      const s = DP.sprites.DATA.beerUp;
      ctx.drawImage(bake('beer', s, DP.sprites.PALETTE), f.beerX - s.w / 2, MY + y - 8);
    }
    if (f.car) {
      // 予備動作(武器の点滅)・発射炎は本編と同じ描き方
      const v = { type: it.type, def: cfg.intruder.types[it.type], x: f.car.x, y: f.car.y, face: f.car.face, walk: f.car.walk, aim: f.car.aim || null, flash: f.car.flash || 0 };
      if (f.car.scared) v.x += Math.floor(g.t / 2) % 2 ? 1 : -1; // ブルブル震える
      drawCar(v, g, false);
      drawMuzzle(v);
      if (v.aim && weaponFlash(v)) text('!', v.x, MY + v.y - 22, v.def.flash, 10, 'center');
      if (f.car.scared) {
        drawSweat({ i: 0, x: v.x, y: v.y - 2, face: v.face }, g); // 本編と同じ汗
        if (f.phase === 'surprise' && Math.floor(g.t / 6) % 2 === 0) text('!', v.x, MY + v.y - 24, '#ff3030', 12, 'center');
      }
    }
    drawShots(g, f.shots);
    drawBlasts(g, f.blasts);
    if (f.hero) {
      drawHeroAt(f.hero, {}, f.hero.power, g.t);
      // 追われているあいだは主人公も冷や汗(本編の汗と同じ)
      if (f.hero.sweat) drawSweat({ i: 1, x: f.hero.x, y: f.hero.y - 2, face: f.hero.face }, g);
      if (f.hero.hop > 3) center('ヒィッ!', MY + f.hero.y - 34, '#ffffff', 11, JA);
    }
    if (f.phase === 'surprise') center('POWER UP!', MY + y - 44, Math.floor(g.t / 4) % 2 ? '#ffe83c' : '#ff8a1e', 9);
  }

  function drawDev(g) {
    if (!g.devMode) return;
    text(`DEV ST${g.stage} 1-9:面 C:クリア I:無敵 P/J/T/H:乱入 B:寸劇`, 2, MY + 1, '#3cff6e', 10, 'left', JA);
    if (g.devInvincible) text('INVINCIBLE', cfg.WIDTH - 2, MY + 2, '#3cff6e', 7, 'right');
  }

  function draw(g) {
    if (!ctx) return;
    if (!bg) bg = buildBackground();
    rect(0, 0, cfg.WIDTH, cfg.HEIGHT, '#000');
    drawHud(g);
    ctx.drawImage(bg, 0, MY);
    drawSigns(g);
    if (g.items) drawItems(g);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, MY, cfg.WIDTH, MAZE_H);
    ctx.clip();
    // 戦車の撃破で画面(迷路)が揺れる
    if (g.shake > 0) ctx.translate(((g.shake % 4) - 1.5) * Math.min(3, g.shake / 4), ((g.shake % 3) - 1) * Math.min(2, g.shake / 5));
    if (g.player && g.state !== 'title' && g.state !== 'intermission') {
      drawEnemies(g);
      drawIntruders(g);
      drawHero(g);
      drawShots(g);
      drawBlasts(g);
      drawBooms(g);
    }
    ctx.restore();
    drawPopups(g);
    drawBar(g);
    if (g.state === 'title') drawTitle(g);
    else if (g.state === 'intermission') drawIntermission(g);
    else drawMessages(g);
    drawDev(g);
  }

  return { init, draw, heroFrame, enemyLook, weaponFlash, ICONS, CARS, BAR_Y, MY };
})();
