// PUNKS & SKINS RESCUE: 描画だけ(ゲームの状態は変えない)
window.PSR = window.PSR || {};

PSR.render = (function () {
  const C = PSR.config;
  const chars = POGO77.chars;
  const S = C.SPRITE_SCALE;
  let ctx = null;
  let bg = null;
  let skinImg = null;
  let fireImg = null;

  function init(canvas, images) {
    ctx = canvas.getContext('2d');
    bg = images.bg;
    skinImg = images.skin;
    fireImg = images.fire || null;
    if (PSR.windowHelp) PSR.windowHelp.init(bg); // 窓の HELP! 演出(背景の飾り)
    initDemo();
    // canvas だけで使うウェブフォントは自動で読み込まれないことがあるので、明示的に読み込む(js/dot-text.js)
    // (読み込み中・オフラインのときは代わりの書体をドットにして描き、読み込めた次のフレームから正しい書体になる)
    const ja = [].concat(...PSR.demo.PATTERNS.map((p) => [p.captionJa, p.subJa]));
    PSR.dotText.preload(['PUNKS & SKINS RESCUE 0123456789', '遊び方', 'パンクスを助けろ！', '警察を助けるな！', 'ENTERでスタート', '← → で移動'].concat(ja));
  }

  // 炎のアニメーション(8 ビット風。fire_8bit.png の 4 コマを、背景の炎があった場所に 5 倍で重ねる)
  function drawFire(g) {
    if (!fireImg) return;
    const F = PSR.gfx8.FIRE;
    const B = PSR.gfx8.BLOCK;
    const f = Math.floor(g.frame / F.stepsPerFrame) % F.frames;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fireImg, f * F.w, 0, F.w, F.h, F.x0 * B, F.y0 * B, F.w * B, F.h * B);
  }

  // 黒い縁取りの文字(ドット文字。js/dot-text.js。英数字 = Press Start 2P、日本語 = DotGothic16 を最近傍補間で整数倍に拡大)
  function text(str, x, y, size, color, align) {
    PSR.dotText.draw(ctx, str, x, y, size, color, align || 'left');
  }

  // 英語と日本語の併記(タイトル画面。2026-11-22 に改行に対応)
  // 「英語 / 日本語」が maxW に収まれば 1 行、収まらなければ「英語」と「日本語」の 2 行に分ける。
  // それでも長い行は、英語は単語、日本語は文字の切れ目で折り返す。文字の倍率(整数)は変えない(縮めない)。
  // 戻り値は行の配列 [{ parts: [[文字列, 倍率, 色]], w(幅 px), h(高さ px) }]。描くのは drawLines
  // split = true なら、収まっても「英語」と「日本語」の 2 行に分ける(パターンごとに行の数が変わらないように)
  function pairLines(en, ja, sizeEn, sizeJa, color, colorJa, maxW, split) {
    const T = PSR.dotText;
    const SEP = ' / ';
    const cJa = colorJa || color;
    const kEn = T.scaleOf(en, sizeEn);
    const kJa = T.scaleOf(ja, sizeJa);
    const hEn = 8 * kEn; // 英数字は 8 ドット
    const hJa = 16 * kJa; // 日本語は 16 ドット
    const wOne = T.measure1(en + SEP) * kEn + T.measure1(ja) * kJa;
    if (!split && wOne <= maxW) return [{ parts: [[en + SEP, kEn, color], [ja, kJa, cJa]], w: wOne, h: Math.max(hEn, hJa) }];
    const out = [];
    for (const [str, k, c, h] of [[en, kEn, color, hEn], [ja, kJa, cJa, hJa]]) {
      for (const line of wrapLine(str, k, maxW)) out.push({ parts: [[line, k, c]], w: T.measure1(line) * k, h });
    }
    return out;
  }

  // 1 行の文字列を幅 maxW で折り返す(空白があれば単語ごと、なければ 1 文字ごと)
  function wrapLine(str, k, maxW) {
    const T = PSR.dotText;
    if (T.measure1(str) * k <= maxW) return [str];
    const words = str.indexOf(' ') >= 0 ? str.split(/(?<= )/) : Array.from(str);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (cur && T.measure1((cur + w).trimEnd()) * k > maxW) {
        lines.push(cur.trimEnd());
        cur = '';
      }
      cur += w;
    }
    if (cur.trim()) lines.push(cur.trimEnd());
    return lines;
  }

  // 行の配列を、中心 cx にそろえて上端 top から縦に並べる(行の間は gap px)。描いた下端の y を返す
  function drawLines(lines, cx, top, gap) {
    const T = PSR.dotText;
    let y = top;
    for (const l of lines) {
      let x = cx - l.w / 2;
      for (const [str, k, c] of l.parts) {
        T.draw(ctx, str, x, y + l.h / 2, 0, c, 'left', { scale: k });
        x += T.measure1(str) * k;
      }
      y += l.h + gap;
    }
    return y - gap;
  }
  const linesHeight = (lines, gap) => lines.reduce((n, l) => n + l.h + gap, -gap);

  // 落ちてくる人を中心 (x, y)・回転 rot(ラジアン)で描く。絵は js/characters.js の一覧(共通キャラクターのドット絵を 5 倍)
  function drawPerson(kind, x, y, rot, flip) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    if (kind === 'skin' && skinImg && !(PSR.gfx8 && PSR.gfx8.enabled)) {
      // 元のグラフィック(?gfx=original)のスキンズ: 走りの 2 コマ目(手足を大きく広げたコマ)を体の範囲だけ切り出して原寸で描く
      const k = chars.SKIN;
      const b = k.body;
      ctx.drawImage(skinImg, k.cellW * 1 + b.x, b.y, b.w, b.h, -b.w / 2, -b.h / 2, b.w, b.h);
    } else {
      // 絵の中心を (0, 0) に合わせる(ローダーは足元の中央を基準に描くので、足元 = 高さの半分だけ下)
      const c = PSR.characters.get(kind);
      const sz = PSR.characters.size(kind);
      POGO77.characters.get(c.ref).drawFrame(ctx, c.frame, 0, (sz.h * S) / 2, { scale: S, variant: c.variant });
    }
    ctx.restore();
  }

  // ドット文字(1 ドット = S px。'X' = ドット)。敵の警告「!!」に使う
  const PIXEL_GLYPHS = {
    '!': ['XX', 'XX', 'XX', '..', 'XX'], // 太い「!」(2 ドット幅)
  };
  // 黒い縁取りつきで、中心 cx・上端 top に描く
  function pixelText(str, cx, top, color) {
    const glyphs = str.split('').map((ch) => PIXEL_GLYPHS[ch]);
    const width = glyphs.reduce((n, gl) => n + gl[0].length + 1, -1);
    const x0 = Math.round(cx - (width * S) / 2);
    for (const [col, pad] of [['#000000', 1], [color, 0]]) {
      ctx.fillStyle = col;
      let x = x0;
      for (const gl of glyphs) {
        for (let r = 0; r < gl.length; r++)
          for (let k = 0; k < gl[r].length; k++)
            if (gl[r][k] === 'X') ctx.fillRect(x + (k - pad) * S, top + (r - pad) * S, (1 + 2 * pad) * S, (1 + 2 * pad) * S);
        x += (gl[0].length + 1) * S;
      }
    }
  }

  // 敵の警告: 頭上に赤い「!!」を点滅(描くだけ。判定・進行には関係しない)
  const WARN_COLOR = '#f83800'; // パレットの赤
  const WARN_BLINK = 6; // 点滅の間隔(ステップ)
  function drawWarning(g, j) {
    if (j.side !== 'enemy') return; // 味方には出さない
    if (Math.floor(g.frame / WARN_BLINK) % 2 !== 0) return;
    // 回っていても重ならないよう、絵の中心から 15 ドット上(20 ドットの絵が回ったときの半径より上)に描く
    pixelText('!!', j.x, Math.round(j.y - 15 * S - 5 * S), WARN_COLOR);
  }

  function drawJumper(g, j) {
    if (j.phase === 'appear') {
      // 窓に現れて助けを呼ぶ(点滅して予告)。味方は HELP!、敵は「!!」の警告
      if (Math.floor(j.t / 6) % 2 === 0 || j.t > (j.appearT || C.T.appear) - 20) drawPerson(j.kind, j.x, j.y, 0, false);
      if (j.side === 'enemy') drawWarning(g, j);
      else text('HELP!', j.x, j.y - 72, 40, '#fff27a', 'center'); // ドット文字の 3 倍(窓の飾りの HELP! と同じくらいの大きさ)
      return;
    }
    if (j.phase === 'lie') {
      drawPerson(j.kind, j.x, j.y, Math.PI / 2, false);
      return;
    }
    // 空中: 90 度ずつくるくる回る(ゲーム機の液晶のようにカクカクと)。敵は落ちている間ずっと「!!」
    const rot = (Math.floor(g.frame / 8) % 4) * (Math.PI / 2);
    drawPerson(j.kind, j.x, j.y, rot, false);
    drawWarning(g, j);
  }

  function drawHostess(g) {
    const h = g.hostess; // g はデモの状態(js/demo.js)のこともある
    let name = 'hostessStand';
    if (h.poseT > 0) name = 'hostessRescue';
    else if (h.walkT > 0) name = chars.HOSTESS_WALK[Math.floor(h.walkT / 2) % 4];
    const flip = h.dir < 0;
    chars.draw(ctx, name, h.x, C.FOOT_Y, { scale: S, flip });
    // 担架(手の高さ。受け止めた直後はたわむ)
    const dip = h.dipT > 0;
    const sy = C.FOOT_Y - C.STRETCHER_LIFT + (dip ? 4 * S : 3 * S);
    chars.draw(ctx, dip ? 'stretcherDip' : 'stretcher', h.x, sy, { scale: S });
  }

  // 道路の上に移動地点の印(10 か所)
  function drawLaneMarks(g) {
    ctx.save();
    for (let i = 0; i < C.LANES; i++) {
      const x = PSR.game.laneX(i);
      ctx.fillStyle = i === g.hostess.lane ? 'rgba(255,90,166,0.9)' : 'rgba(255,255,255,0.6)';
      ctx.fillRect(Math.round(x - 10), C.FOOT_Y + 8, 20, 6);
    }
    ctx.restore();
  }

  function drawHud(g) {
    // ステージと、このステージで救助した人数 / クリアに必要な人数(右上)
    text('STAGE ' + g.stage, 1440, 44, 40, '#fff27a');
    text('RESCUE ' + g.stageRescued + '/' + PSR.game.stageNeed(g.stage), 1440, 92, 30, '#7affb0'); // 分母はそのステージのクリア人数
    text('SCORE ' + String(g.score).padStart(6, '0'), 560, 44, 44, '#ffffff');
    text('MISS', 1060, 44, 44, '#ffffff');
    // 残りのキャバ嬢(2026-11-22。前の「× / -」の印の代わり): 予備の人数を並べ、MISS するたびに 1 人ずつ減る(開始時 2 人)。
    // 本編のキャバ嬢の立ち姿のドット絵をそのまま 3 倍(20×20 ドット → 60×60px。本編の 5 倍より小さい)で描く(新しい絵は作らない。最近傍補間でぼかさない)。
    // 2 倍だとスマートフォンの画面で約 13px と小さすぎたので 3 倍(約 19px)。
    // 判定は今までどおり g.miss と MAX_MISS だけ(表示を替えただけ)。設定を大きくしても描きすぎないよう最大 10 人
    const LIFE_SCALE = 3;
    const LIFE_DX = 56; // 間隔(「MISS」の右 x 1156 から STAGE の x 1440 の手前までに 3 人が収まる)
    const LIFE_ART_DX = 2 * LIFE_SCALE; // 絵は 20 ドットの枠の左寄り(体は 3〜13 列目)なので、見た目の中心をそろえるために右へずらす
    // 予備の人数だけ(いま操作しているキャバ嬢は数えない): MISS 0 = 2 人 → 1 MISS = 1 人 → 2 MISS = 0 人 → 3 MISS = GAME OVER
    const left = Math.max(0, Math.min(C.MAX_MISS, 11) - 1 - g.miss);
    for (let i = 0; i < left; i++) {
      // 縦は HUD の文字の中心(y 44)に絵の中心をそろえる
      chars.draw(ctx, 'hostessStand', 1190 + i * LIFE_DX + LIFE_ART_DX, 44 + 10 * LIFE_SCALE, { scale: LIFE_SCALE });
    }
  }

  function drawEffects(g) {
    for (const e of g.effects) {
      const rise = e.t * 0.8;
      if (e.type === 'rescued') {
        text('+' + C.SCORE_RESCUE, e.x, e.y - rise, 48, '#fff27a', 'center');
        text('RESCUED!', e.x, e.y - rise + 50, 32, '#7affb0', 'center');
      } else if (e.type === 'miss') {
        if (Math.floor(e.t / 8) % 2 === 0) text('MISS!', e.x, e.y, 44, '#ff4040', 'center');
      } else if (e.type === 'safe') {
        // 敵を見逃した
        text('SAFE', e.x, e.y - rise * 0.5, 40, '#7affb0', 'center');
      }
    }
  }

  // 画面の中ほどを暗い帯にして文字を出す(STAGE CLEAR! など)。band = [上端, 高さ](省略すると今までの位置)
  function overlay(lines, band) {
    const [top, h] = band || [300, 330];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, top, C.W, h);
    ctx.restore();
    for (const l of lines) text(l.s, C.W / 2, l.y, l.size, l.color, 'center');
  }

  // GAME OVER 画面(2026-11-22 に整理): GAME OVER → 表(SCORE / STAGE / RESCUED。項目は左・数字は右にそろえる)→ ハイスコア。
  // 文字は前より大きく(表は英数字 4 倍 = 1 文字 32px)、行の間をあけた。4 秒後に自動でタイトルへ戻るので PRESS ENTER は出さない
  function drawGameOver(g) {
    const blink = Math.floor(g.frame / 30) % 2 === 0;
    const hi = g.high || { best: g.score, isNew: false };
    overlay([{ s: 'GAME OVER', y: 350, size: 96, color: '#ff4040' }], [282, 380]);
    const L = 580; // 項目の左端
    const R = 1092; // 数字の右端
    const rows = [
      ['SCORE', String(g.score).padStart(6, '0')],
      ['STAGE', String(g.stage)],
      ['RESCUED', String(g.rescued)],
    ];
    rows.forEach(([k, v], i) => {
      const y = 438 + i * 56;
      text(k, L, y, 52, '#bcbcbc', 'left');
      text(v, R, y, 52, '#ffffff', 'right');
    });
    if (hi.isNew) {
      if (blink) text('NEW HIGH SCORE!', C.W / 2, 618, 52, '#fff27a', 'center');
    } else text('HIGH SCORE ' + String(hi.best).padStart(6, '0'), C.W / 2, 618, 44, '#fff27a', 'center');
  }

  // ---- タイトル画面のゲーム説明デモ(2026-11-22。動きは js/demo.js) ----
  // 黒一色の画面に、上にタイトル・中央に 4 パターンのデモ・下に開始の案内。
  // 舞台(窓・キャバ嬢・担架・救急車・落ちてくる人)は本編と同じ座標で描き、全体を DEMO_DY だけ上へずらす。
  // 窓と救急車は背景の画像から切り出して使う(新しく描かない)。
  const DEMO_DY = -118; // 2026-11-22: -130 → -118(窓の HELP! / !! と上の補足の行のあいだをあける。道路の線は y 809 で、下の説明 y 820〜 にかからない)
  // 背景から切り出す窓(人が現れる 2 階の窓のまわり。本編の座標 px)
  const DEMO_WINDOW = { x: 262, y: 382, w: 140, h: 150 };
  // 背景の救急車(5px マスの番号)。まわりの壁・植え込みを消すため、行ごとに残す列の範囲 [左, 右](cx0 からの列)を決める。
  // 黒い画面に描くので、黒のマス(救急車の縁取り)は残っても見えない
  const AMB = { cx0: 258, cy0: 107 };
  const AMB_ROWS = (function () {
    const rows = {};
    const set = (from, to, spans) => {
      for (let r = from; r <= to; r++) rows[r] = spans;
    };
    set(107, 110, [[23, 46]]); // 屋根のランプ
    set(111, 111, [[27, 27]]);
    set(112, 113, [[17, 73]]);
    set(114, 114, [[16, 73]]);
    set(115, 116, [[15, 73]]);
    set(117, 118, [[14, 73]]);
    set(119, 119, [[13, 73]]);
    set(120, 122, [[12, 73]]);
    set(123, 125, [[9, 73]]);
    set(126, 128, [[8, 73]]);
    set(129, 130, [[5, 73]]);
    set(131, 133, [[3, 73]]);
    set(134, 134, [[6, 73]]);
    set(135, 137, [[3, 73]]);
    set(138, 138, [[6, 73]]);
    set(139, 140, [[3, 73]]);
    set(141, 145, [[1, 73]]);
    set(146, 148, [[16, 23], [53, 61]]); // タイヤ
    return rows;
  })();
  let ambCanvas = null; // 切り出した救急車(まわりは透明)

  function initDemo() {
    const B = 5;
    const sx = bg.width / C.W; // ?gfx=original の背景も同じ大きさだが、念のため比率で読む
    const c = document.createElement('canvas');
    c.width = 76 * B;
    c.height = 42 * B;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    for (const r in AMB_ROWS) {
      const y = (r - AMB.cy0) * B;
      for (const [a, b] of AMB_ROWS[r]) {
        const x = a * B;
        const w = (b - a + 1) * B;
        cx.drawImage(bg, ((AMB.cx0 * B + x) * sx), ((r * B) * sx), w * sx, B * sx, x, y, w, B);
      }
    }
    ambCanvas = c;
  }

  // ドットの ○ / ×(BLK px のマスで描く。黒の縁取りつき)
  function drawMark(type, cx, cy) {
    const BLK = 12;
    const R = 9; // 半径(マス)
    const cells = [];
    for (let y = -R; y <= R; y++)
      for (let x = -R; x <= R; x++) {
        if (type === 'ok') {
          const dd = Math.sqrt(x * x + y * y);
          if (dd <= R + 0.3 && dd >= R - 2.4) cells.push([x, y]);
        } else if (Math.abs(Math.abs(x) - Math.abs(y)) <= 1 && Math.abs(x) <= R - 1) cells.push([x, y]);
      }
    for (const [col, pad] of [['#000000', 3], [type === 'ok' ? '#00d800' : '#f83800', 0]]) {
      ctx.fillStyle = col;
      for (const [x, y] of cells) ctx.fillRect(cx + x * BLK - pad, cy + y * BLK - pad, BLK + 2 * pad, BLK + 2 * pad);
    }
  }

  // ---- HIGH SCORES 画面(2026-11-22。タイトル画面のデモの 4 つ目のあと。js/demo.js の phase 'scores') ----
  // 黒一色の画面に、上にタイトル、中央に上位 5 件(順位・スコア・到達ステージ)、下に開始の案内(デモと同じ)。
  // 記録がない順位は「------」で埋め、1 件もないときは「NO SCORES YET / まだ記録がありません」を添える。
  const RANK_NAMES = ['1ST', '2ND', '3RD', '4TH', '5TH'];
  const RANK_COLORS = ['#fff27a', '#7ad8ff', '#7affb0', '#ff8c6a', '#ff5aa6']; // 順位ごとの色(タイトル画面で使っている色から)
  function drawHighScores(g, scores) {
    const max = C.HIGHSCORE_MAX || 5;
    text('PUNKS & SKINS RESCUE', C.W / 2, 46, 76, '#ff5aa6', 'center');
    drawLines(pairLines('HIGH SCORES', 'ハイスコア', 44, 32, '#fff27a', null, C.W - 80), C.W / 2, 118, 10);
    // 表の列(左端の x)。英数字は 1 文字 24px(倍率 3)
    const COL = { rank: 520, score: 720, stage: 1060 }; // 表全体(x 520〜1140)がほぼ画面の中央
    const TOP = 250;
    const ROW = 84;
    text('RANK', COL.rank, TOP - 60, 30, '#bcbcbc');
    text('SCORE', COL.score, TOP - 60, 30, '#bcbcbc');
    text('STAGE', COL.stage, TOP - 60, 30, '#bcbcbc');
    for (let i = 0; i < Math.min(max, RANK_NAMES.length); i++) {
      const e = scores[i];
      const y = TOP + 30 + i * ROW;
      const color = e ? RANK_COLORS[i] : '#5a5a6a'; // 空いている順位は暗い灰色
      text(RANK_NAMES[i], COL.rank, y, 44, color);
      text(e ? String(e.score).padStart(6, '0') : '------', COL.score, y, 44, color);
      text(e ? String(e.stage).padStart(3, ' ') : ' --', COL.stage, y, 44, color);
    }
    if (!scores.length) drawLines(pairLines('NO SCORES YET', 'まだ記録がありません', 28, 28, '#bcbcbc', null, C.W - 80), C.W / 2, 702, 10);
  }

  // タイトル画面の下の案内(デモと HIGH SCORES 画面で共通)。行の中心: ルール 840 / PRESS ENTER 884 / 操作 924
  // (デモの道路の線 y 809 との間 約 15px。下の余白は画面の下端まで約 1px)
  function drawTitleFooter(g) {
    const blink = Math.floor(g.frame / 30) % 2 === 0;
    const LINE_GAP = 10;
    const HALF_W = C.W * 0.5 - 50;
    const centered = (lines, cx, cy) => drawLines(lines, cx, Math.round(cy - linesHeight(lines, LINE_GAP) / 2), LINE_GAP);
    centered(pairLines('RESCUE THE PUNKS!', 'パンクスを助けろ！', 28, 28, '#7affb0', null, HALF_W), C.W * 0.28, 840);
    centered(pairLines("DON'T RESCUE THE POLICE!", '警察を助けるな！', 28, 28, '#ff8c6a', null, HALF_W), C.W * 0.72, 840);
    // 日本語はドット文字の 2 倍(3 倍だと下の行に触れる)
    if (blink) centered(pairLines('PRESS ENTER TO START', 'ENTERでスタート', 44, 32, '#fff27a', null, C.W - 80), C.W / 2, 884);
    centered(pairLines('← → MOVE', '← → で移動', 24, 24, '#ffffff', null, C.W - 80), C.W / 2, 924);
  }

  function drawDemo(g) {
    const D = PSR.demo.state;
    const dg = D.dg;
    const p = PSR.demo.PATTERNS[D.idx];
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.imageSmoothingEnabled = false;
    if (D.phase === 'scores') {
      drawHighScores(g, D.scores);
      drawTitleFooter(g);
      return;
    }

    // 文字は「英語 / 日本語」の併記(言語の切り替えはない)。各行は中央揃え(2026-11-22 に行間を広げて整理)。
    //   最上部の中央にタイトル → HOW TO PLAY / 遊び方 → パターンの説明(いつも英語の行と日本語の行の 2 行)→ 補足(1 行)。
    //   上の説明は y 252 まで(窓の HELP! の上端 y 262・飛び出したキャラクターの一番高いところ y 288 より上。実測)。
    //   幅: パターンの説明は TOP_W まで、補足は SUB_W まで。
    //   それより長い行は単語(英語)・文字(日本語)で折り返す
    const TOP_W = 1000;
    const SUB_W = 1200; // 補足は 1 行(y 252 より上なので、左の窓の上にかかっても重ならない)
    const LINE_GAP = 10; // 英語の行と日本語の行の間
    const BLOCK_GAP = 14; // 説明と説明の間
    // タイトル(最上部の中央)
    text('PUNKS & SKINS RESCUE', C.W / 2, 42, 76, '#ff5aa6', 'center');
    let y = 80;
    // 2026-11-22(最終調整): 英語はすべてドット文字の 3 倍以上(スマートフォンでも読めるように。前の HOW TO PLAY・補足は 2 倍)
    y = drawLines(pairLines('HOW TO PLAY', '遊び方', 40, 32, '#7ad8ff', null, TOP_W), C.W / 2, y, LINE_GAP) + BLOCK_GAP;
    // パターンの説明(番号つき)
    const capColor = PSR.characters.get(p.kind).side === 'enemy' ? '#ff8c6a' : '#7affb0';
    const cap = D.idx + 1 + '/' + PSR.demo.PATTERNS.length + '  ' + p.caption;
    y = drawLines(pairLines(cap, p.captionJa, 36, 34, capColor, null, TOP_W, true), C.W / 2, y, LINE_GAP) + BLOCK_GAP;
    drawLines(pairLines(p.sub, p.subJa, 40, 28, '#bcbcbc', null, SUB_W), C.W / 2, y, LINE_GAP);

    // 舞台(本編と同じ座標で、上へずらす)
    ctx.save();
    ctx.translate(0, DEMO_DY);
    const W = DEMO_WINDOW;
    const s = bg.width / C.W;
    ctx.drawImage(bg, W.x * s, W.y * s, W.w * s, W.h * s, W.x, W.y, W.w, W.h);
    if (ambCanvas) ctx.drawImage(ambCanvas, AMB.cx0 * 5, AMB.cy0 * 5);
    // 道路の線
    ctx.fillStyle = '#7c7c7c';
    for (let x = 440; x < 1640; x += 40) ctx.fillRect(x, C.FOOT_Y + 22, 24, 5);
    drawLaneMarks(dg);
    for (const j of dg.jumpers) if (j.phase === 'lie') drawJumper(dg, j);
    drawHostess(dg);
    for (const j of dg.jumpers) if (j.phase !== 'lie') drawJumper(dg, j);
    drawEffects(dg);
    ctx.restore();

    // 結果の ○ / ×(大きく)
    if (D.phase === 'result' && D.mark) drawMark(D.mark, 1010, 470);

    // 開始の案内(ルールのまとめ・PRESS ENTER・操作。下は y 815 から、舞台の道路にかけない)
    drawTitleFooter(g);
  }

  function draw(g) {
    // タイトル画面: 黒一色のゲーム説明デモ(本編の背景・炎・窓の演出は描かない)
    if (g.state === 'title' && PSR.demo) {
      drawDemo(g);
      return;
    }
    // キャバクラ演出(3 ステージクリアごと): 店内だけを画面いっぱいに描く(js/club.js)
    if (g.state === 'club' && PSR.club) {
      PSR.club.draw(ctx, g, text);
      return;
    }
    // 背景は縦横比のまま原寸で描く(加工しない)。8 ビット風(標準)はドットをぼかさない
    ctx.imageSmoothingEnabled = !(PSR.gfx8 && PSR.gfx8.enabled);
    ctx.drawImage(bg, 0, 0, C.W, C.H);
    drawFire(g);
    if (PSR.windowHelp) PSR.windowHelp.draw(ctx, g); // 窓の中で助けを求める人(背景の飾り。ゲームには影響しない)
    drawLaneMarks(g);
    for (const j of g.jumpers) if (j.phase === 'lie') drawJumper(g, j);
    drawHostess(g);
    for (const j of g.jumpers) if (j.phase !== 'lie') drawJumper(g, j);
    drawEffects(g);
    drawHud(g);
    if (g.state === 'stageclear') {
      overlay([
        { s: 'STAGE CLEAR!', y: 400, size: 96, color: '#fff27a' },
        { s: 'NEXT STAGE ' + (g.stage + 1), y: 500, size: 44, color: '#ffffff' },
      ]);
    } else if (g.state === 'gameover') {
      drawGameOver(g);
    }
  }

  return { init, draw };
})();
