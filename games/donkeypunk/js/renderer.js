// 画面描画(ゲームの状態を読むだけで、状態は変更しない)
window.DP = window.DP || {};

DP.createRenderer = function (canvas) {
  const C = DP.config;
  const geo = DP.geometry;
  const spr = DP.sprites;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const FONT_EN = '"Press Start 2P", monospace';
  const FONT_JA = '"DotGothic16", "Press Start 2P", monospace';

  // 背景の星(固定配置)
  const stars = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) stars.push({ x: rand() * C.WIDTH, y: rand() * C.HEIGHT * 0.9, c: rand() < 0.3 ? '#8a8aff' : '#ffffff' });

  function text(str, x, y, opts) {
    opts = opts || {};
    ctx.font = (opts.size || 12) + 'px ' + (opts.ja ? FONT_JA : FONT_EN);
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = 'top';
    if (opts.shadow) {
      ctx.fillStyle = opts.shadow;
      ctx.fillText(str, x + 2, y + 2);
    }
    ctx.fillStyle = opts.color || '#fff';
    ctx.fillText(str, x, y);
  }

  function drawBackground(frame, stage) {
    ctx.fillStyle = '#05040f';
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
    for (const s of stars) {
      ctx.fillStyle = s.c;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
    }
    if (stage && stage.background === 'demolition') {
      drawDemolition();
      return;
    }
    // 遠くのビル街のシルエット
    ctx.fillStyle = '#120f2a';
    const bx = [0, 40, 70, 120, 150, 210, 250, 300, 340, 390, 430];
    const bh = [60, 90, 50, 110, 70, 95, 55, 120, 80, 100, 65];
    for (let i = 0; i < bx.length; i++) ctx.fillRect(bx[i], C.HEIGHT - bh[i] - 20, 44, bh[i] + 20);
    // ビルの窓(ときどき点滅)
    ctx.fillStyle = '#3a2f6a';
    for (let i = 0; i < bx.length; i++) {
      for (let wy = C.HEIGHT - bh[i] - 10; wy < C.HEIGHT - 30; wy += 14) {
        if ((i * 7 + wy + Math.floor(frame / 90)) % 5 === 0) ctx.fillRect(bx[i] + 10, wy, 6, 6);
      }
    }
  }

  // 3 面の背景: 解体途中のビルの壁(上の縁がギザギザに崩れ、窓の穴と鉄筋が見える)
  const WALLS = [
    { x: 0, w: 60, top: 300 }, { x: 60, w: 70, top: 230 }, { x: 130, w: 60, top: 270 },
    { x: 190, w: 90, top: 210 }, { x: 280, w: 60, top: 250 }, { x: 340, w: 70, top: 190 }, { x: 410, w: 70, top: 260 },
  ];
  function drawDemolition() {
    for (const [i, wl] of WALLS.entries()) {
      ctx.fillStyle = '#1b1a26';
      ctx.fillRect(wl.x, wl.top, wl.w, C.HEIGHT - wl.top);
      // 崩れた上の縁(8px ごとに高さを変える)
      for (let x = wl.x; x < wl.x + wl.w; x += 8) {
        const d = ((x * 7 + i * 13) % 5) * 4;
        ctx.fillRect(x, wl.top - d, 8, d);
      }
      // 窓の穴(壁の色より暗く)
      ctx.fillStyle = '#0a0912';
      for (let y = wl.top + 16; y < C.HEIGHT - 40; y += 34) {
        for (let x = wl.x + 10; x + 12 < wl.x + wl.w; x += 22) ctx.fillRect(x, y, 12, 16);
      }
      // 崩れた所から飛び出した鉄筋
      ctx.fillStyle = '#4a3a30';
      ctx.fillRect(wl.x + 14, wl.top - 18, 2, 18);
      ctx.fillRect(wl.x + wl.w - 18, wl.top - 12, 2, 12);
    }
    // 壁のスプレーの落書き(見た目だけ)
    ctx.fillStyle = '#5a1f3a';
    ctx.fillRect(28, 470, 30, 3);
    ctx.fillRect(196, 380, 36, 3);
  }

  function drawLadder(l) {
    const top = Math.round(l.topY);
    const bottom = Math.round(l.bottomY);
    ctx.fillStyle = '#3cd8ff';
    if (!l.broken) {
      ctx.fillRect(l.x - 8, top, 2, bottom - top);
      ctx.fillRect(l.x + 6, top, 2, bottom - top);
      for (let y = bottom - 6; y > top; y -= 8) ctx.fillRect(l.x - 8, y, 16, 2);
      return;
    }
    // 切れたハシゴ: 下の部分(登れる)と、上の段からぶら下がる切れ端の 2 本。
    // 切れ目は左右の支柱の長さをずらして、折れたように見せる
    const climbTop = Math.round(l.climbTopY);
    const stubBottom = Math.round(l.stubBottomY);
    // 下の部分: 主人公の足が climbTop まで来られる。支柱は少し上まで(左は長め・右は短め)
    const lowTopL = climbTop - 6;
    const lowTopR = climbTop - 1;
    ctx.fillRect(l.x - 8, lowTopL, 2, bottom - lowTopL);
    ctx.fillRect(l.x + 6, lowTopR, 2, bottom - lowTopR);
    for (let y = bottom - 6; y > climbTop; y -= 8) ctx.fillRect(l.x - 8, y, 16, 2);
    // 上の切れ端(右は長め・左は短め)
    ctx.fillRect(l.x - 8, top, 2, stubBottom - 4 - top);
    ctx.fillRect(l.x + 6, top, 2, stubBottom - top);
    ctx.fillRect(l.x - 8, top + 14, 16, 2); // 鉄骨の下に見える位置の横棒
    // 折れた先の欠け(少し暗い色の小さな破片)
    ctx.fillStyle = '#1f7a99';
    ctx.fillRect(l.x - 9, lowTopL - 2, 2, 2);
    ctx.fillRect(l.x + 7, stubBottom, 2, 2);
  }

  // ゴリラの逃走用ハシゴ(2 本)。g5 の上面から画面の最上部まで。飾りなのでつかめない
  function drawEscapeLadders(level) {
    const s = level.stage.escape;
    if (!s) return;
    const g5 = level.byId[level.stage.boss.girder];
    ctx.fillStyle = '#3cd8ff';
    for (const x of s.ladders) {
      const bottom = Math.round(geo.surfaceY(g5, x));
      ctx.fillRect(x - 8, 0, 2, bottom);
      ctx.fillRect(x + 6, 0, 2, bottom);
      for (let y = bottom - 6; y > 0; y -= 8) ctx.fillRect(x - 8, y, 16, 2);
    }
  }

  // ベルトコンベア(2 面)。黒いベルトの継ぎ目が流れる向きに動き、両端の滑車の軸の点が回る。
  // 向きが逆転する直前(convWarn)は滑車が黄色く点滅する
  function drawConveyor(g, frame) {
    const T = C.GIRDER_THICKNESS;
    const y = Math.round(g.y1);
    ctx.fillStyle = '#2a2a34';
    ctx.fillRect(g.x1, y, g.x2 - g.x1, T);
    ctx.fillStyle = '#9a9aae'; // ベルトの上面
    ctx.fillRect(g.x1, y, g.x2 - g.x1, 1);
    // 継ぎ目(8px ごと)。beltOffset ぶんずらして、流れているように見せる
    const off = ((Math.round(g.beltOffset || 0) % 8) + 8) % 8;
    ctx.fillStyle = '#55556a';
    for (let x = g.x1 + 6 + off - 8; x < g.x2 - 4; x += 8) {
      if (x >= g.x1 + 4) ctx.fillRect(x, y + 2, 2, T - 3);
    }
    // 両端の滑車
    const blink = g.convWarn && Math.floor(frame / 6) % 2 === 0;
    // 軸の点の位置(ベルトが流れると回る。4 か所を順に回る)
    const spokes = [[-3, 1], [1, -1], [3, 3], [-1, 5]];
    const k = ((Math.floor((g.beltOffset || 0) / 3) % 4) + 4) % 4;
    // 画面の端まで届いているベルトは、滑車が画面からはみ出さないよう内側に寄せて描く(見た目だけ)
    for (const px of [Math.max(g.x1, 6), Math.min(g.x2, C.WIDTH - 6)]) {
      ctx.fillStyle = blink ? '#ffd23c' : '#3cd8ff';
      ctx.fillRect(px - 6, y - 1, 12, T + 2);
      ctx.fillRect(px - 4, y - 3, 8, T + 6);
      ctx.fillStyle = '#05040f';
      ctx.fillRect(px - 1, y + 2, 2, 2);
      const [sx, sy] = spokes[k];
      ctx.fillRect(px + sx - 1, y + sy - 1, 2, 2);
    }
  }

  // 3 面のがれき(崩れたコンクリートの塊)。乗れる上の面は x1〜x2 にまっすぐ描き(当たり判定と同じ範囲)、
  // 下側だけを欠けた形にして、崩れた塊らしく見せる
  function drawRubble(g, colors) {
    const col = colors || DEFAULT_GIRDER_COLORS;
    const T = C.GIRDER_THICKNESS;
    const y = Math.round(g.y1);
    const w = g.x2 - g.x1;
    ctx.fillStyle = col.body;
    ctx.fillRect(g.x1, y, w, T);
    // 下側の欠け(4px ごとに 0〜4px 下へはみ出す。端は少し内側だけ)
    for (let x = g.x1 + 2; x < g.x2 - 2; x += 4) {
      const d = ((x * 5 + y) % 3) * 2;
      ctx.fillRect(x, y + T, 4, d);
    }
    ctx.fillStyle = col.top;
    ctx.fillRect(g.x1, y, w, 1);
    // ひび
    ctx.fillStyle = col.bottom;
    ctx.fillRect(g.x1 + Math.floor(w / 3), y + 2, 1, 4);
    ctx.fillRect(g.x1 + Math.floor(w / 3) + 1, y + 5, 3, 1);
  }

  // 3 面のリフトの板・床(黄と黒の工事しま模様)
  function drawLiftPlate(g) {
    const T = C.GIRDER_THICKNESS;
    const y = Math.round(g.y1);
    ctx.fillStyle = '#ffd23c';
    ctx.fillRect(g.x1, y, g.x2 - g.x1, T);
    ctx.fillStyle = '#15141c';
    for (let x = g.x1 + 2; x < g.x2 - 2; x += 8) ctx.fillRect(x, y + 2, 4, T - 3);
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(g.x1, y, g.x2 - g.x1, 1);
  }

  // 3 面のリフトの縦穴(鉄骨・リフトの板より奥に描く)
  //   循環リフト: 左右のレールと、上端で板を引き込む機械の箱(黄黒のしま)・地面の差し込み口
  //   往復リフト: 上の巻き上げ機の箱と、床を吊る 2 本のワイヤー
  function drawLiftShafts(level, frame) {
    for (const L of level.lifts || []) {
      const d = L.def;
      if (L.type === 'loop') {
        ctx.fillStyle = '#3b3a48';
        ctx.fillRect(L.x1 - 4, d.top - 16, 2, d.bottom - d.top + 16);
        ctx.fillRect(L.x2 + 2, d.top - 16, 2, d.bottom - d.top + 16);
        // 上端の機械の箱(板はここで引き込まれて消える)
        const by = d.top - 30;
        ctx.fillStyle = '#2a2933';
        ctx.fillRect(L.x1 - 6, by, L.x2 - L.x1 + 12, 22);
        for (let x = L.x1 - 6; x < L.x2 + 6; x += 8) {
          ctx.fillStyle = Math.floor((x - L.x1) / 8) % 2 === 0 ? '#ffd23c' : '#15141c';
          ctx.fillRect(x, by + 18, 8, 4);
        }
        // 回る歯車(見た目だけ)
        ctx.fillStyle = '#9a9aae';
        const k = Math.floor(frame / 6) % 2;
        ctx.fillRect((L.x1 + L.x2) / 2 - 5, by + 5, 10, 10);
        ctx.fillStyle = '#2a2933';
        ctx.fillRect((L.x1 + L.x2) / 2 - 1 - (k ? 3 : 0), by + 9, 2, 2);
        ctx.fillRect((L.x1 + L.x2) / 2 - 1 + (k ? 3 : 0), by + 9, 2, 2);
      } else {
        const top = Math.min(...L.stops) - 60;
        ctx.fillStyle = '#2a2933';
        ctx.fillRect(L.x1 - 4, top, L.x2 - L.x1 + 8, 16);
        ctx.fillStyle = '#ffd23c';
        ctx.fillRect(L.x1 - 4, top + 14, L.x2 - L.x1 + 8, 2);
        const py = L.plates[0] ? Math.round(L.plates[0].y1) : L.stops[0];
        ctx.fillStyle = '#8a8a9e';
        ctx.fillRect(L.x1 + 6, top + 16, 1, py - top - 16);
        ctx.fillRect(L.x2 - 7, top + 16, 1, py - top - 16);
      }
    }
  }

  // 解体用の鉄球(3 面)。屋上の下から吊られて左右に揺れる。位置は当たり判定と同じ計算(DP.mechanics.wreckingBall)。
  // 本体の 3 枚の矩形は当たり判定(hitboxes)と同じ大きさ。ワイヤーには当たり判定がない
  function drawWreckingBall(wb, frame) {
    const { x: bx, y: by } = DP.mechanics.wreckingBall.position(wb, frame);
    // ワイヤー(2px ごとの点で描く)
    ctx.fillStyle = '#8a8a9e';
    const n = Math.floor(wb.length / 3);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      ctx.fillRect(Math.round(wb.pivotX + (bx - wb.pivotX) * t), Math.round(wb.pivotY + (by - wb.pivotY) * t), 1, 2);
    }
    // 鉄球(丸をドットで)
    ctx.fillStyle = '#6a6a78';
    ctx.fillRect(bx - 6, by - 10, 12, 20);
    ctx.fillRect(bx - 10, by - 6, 20, 12);
    ctx.fillRect(bx - 8, by - 8, 16, 16);
    ctx.fillStyle = '#b4b4c4'; // 光っている所
    ctx.fillRect(bx - 6, by - 6, 4, 4);
  }

  // 爆音アンプの下の格子の台(錆びた鉄骨の X 字の組み合わせ)。見た目だけ
  function drawAmpStand(a, colors) {
    const col = colors || DEFAULT_GIRDER_COLORS;
    const left = a.x - 16;
    const top = a.y;
    const h = a.standBottom - a.y;
    ctx.fillStyle = col.bottom;
    ctx.fillRect(left, top, 2, h); // 左右の柱
    ctx.fillRect(left + 30, top, 2, h);
    ctx.fillStyle = col.body;
    // 16px ごとに X 字の筋交い(2px のドットで斜めに)
    for (let y0 = top; y0 + 16 <= top + h; y0 += 16) {
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(left + 2 + i * 3.5, y0 + i * 2, 2, 2);
        ctx.fillRect(left + 28 - i * 3.5, y0 + i * 2, 2, 2);
      }
      ctx.fillRect(left, y0, 32, 2); // 横の梁
    }
  }

  // 爆音アンプの上で揺らめく炎(下から黄 → オレンジ → 赤)。2x2 のドットの柱を 16 本並べ、
  // 5 ステップごとに高さを変えて揺らす。中央ほど高い。ときどき火の粉が飛ぶ
  const FLAME = { Y: '#ffd23c', O: '#ff8a1e', R: '#ff2a2a' };
  // fs: 炎の大きさ({ scale, cols, flaring }。DP.mechanics.amp.flameScale)。ふだんは scale 1・柱 16 本。
  // スカルが出現するときは高く・広く噴き上がり、揺らめきが速くなって、てっぺんから火の粉が上へ飛ぶ
  function drawAmpFlames(cx, baseY, frame, fs) {
    const f = fs || { scale: 1, cols: 16, flaring: false };
    const t = Math.floor(frame / (f.flaring ? 3 : 5));
    const sc = f.scale;
    const n = f.cols;
    const mid = (n - 1) / 2;
    for (let c = 0; c < n; c++) {
      const center = 1 - Math.abs(c - mid) / (mid + 0.5); // 中央 1 → 端 0 くらい
      const wave = 2.2 * Math.sin(t * 1.7 + c * 1.3) + 1.4 * Math.sin(t * 0.9 + c * 2.7);
      const h = Math.max(1, Math.round((2 + center * 9 + wave) * sc)); // 柱の高さ(ドット数)
      const x = cx - n + c * 2;
      // 燃え上がり中: 柱のてっぺんから火の粉が勢いよく上へ飛ぶ
      if (f.flaring && (c + t) % 3 === 0) {
        const rise = (frame * 3 + c * 11) % 28;
        ctx.fillStyle = (c + t) % 2 ? FLAME.Y : FLAME.O;
        ctx.fillRect(x, baseY - (h + 2) * 2 - rise, 2, 2);
      }
      for (let r = 0; r < h; r++) {
        ctx.fillStyle = r < h * 0.4 ? FLAME.Y : r < h * 0.75 ? FLAME.O : FLAME.R;
        ctx.fillRect(x, baseY - (r + 1) * 2, 2, 2);
      }
      // 火の粉(柱の少し上に、ときどき)
      if ((t + c * 7) % 11 === 0) {
        ctx.fillStyle = FLAME.O;
        ctx.fillRect(x, baseY - (h + 2 + ((t + c) % 3)) * 2, 2, 2);
      }
    }
  }

  // 爆音アンプ(2 面の中央)。台 → 本体 → 炎の順に描く。
  // flare: ファイヤースカルが出現するときの残りステップ。炎が一瞬大きく燃え上がって、また戻る
  function drawAmp(a, colors, frame, flare) {
    spr.draw(ctx, 'amp', a.x, a.y);
    drawAmpFlames(a.x, a.y - spr.DATA.amp.h * C.PIXEL, frame, DP.mechanics.amp.flameScale(flare));
  }

  // 鉄骨の色(本体・上の縁・下の縁)。ステージデータの girderColors で面ごとに変えられる(1 面はこの色)
  const DEFAULT_GIRDER_COLORS = { body: '#ff2f6e', top: '#ffa0c0', bottom: '#8a0f38' };

  // 鉄骨は 16px ごとの段々で描く(ドット絵らしい斜め)。kind: 'conveyor' はベルトコンベアとして描く
  function drawGirder(g, colors, frame) {
    if (g.kind === 'lift') {
      drawLiftPlate(g);
      return;
    }
    if (g.kind === 'rubble') {
      drawRubble(g, colors);
      return;
    }
    if (g.kind === 'conveyor') {
      drawConveyor(g, frame || 0);
      return;
    }
    const col = colors || DEFAULT_GIRDER_COLORS;
    const T = C.GIRDER_THICKNESS;
    for (let x = g.x1; x < g.x2; x += 16) {
      const w = Math.min(16, g.x2 - x);
      const y = Math.round(geo.surfaceY(g, x + w / 2));
      ctx.fillStyle = col.body;
      ctx.fillRect(x, y, w, T);
      ctx.fillStyle = col.top;
      ctx.fillRect(x, y, w, 1);
      ctx.fillStyle = col.bottom;
      ctx.fillRect(x, y + T - 1, w, 1);
      // 筋交い(V 字)
      ctx.fillStyle = '#05040f';
      if (w >= 12) {
        ctx.fillRect(x + 3, y + 2, 2, 2);
        ctx.fillRect(x + 7, y + 4, 2, 2);
        ctx.fillRect(x + 11, y + 2, 2, 2);
      }
    }
  }

  // 炎上(ミスの理由 'burn')の演出: その場で止まった主人公を、黄・オレンジ・赤の炎が包む。
  // 後半はだんだん黒こげになる。炎は 2x2 のドットの柱で、4 ステップごとに高さが変わって揺らめく。
  // (爆音アンプ・将来のファイヤースカルなど、炎上のミスはすべてこの演出)
  function drawBurning(p, timer) {
    const total = (C.timing.dyingByReason || {}).burn || C.timing.dying;
    const k = Math.min(1, timer / total); // 0 → 1
    spr.draw(ctx, 'punkStand', p.x, p.y + 1, { flip: p.facing < 0 });
    // 黒こげ(後半ほど濃く)。主人公の体のまわりだけを暗くする
    if (k > 0.3) {
      ctx.fillStyle = 'rgba(20,8,0,' + Math.min(0.85, (k - 0.3) * 1.4).toFixed(2) + ')';
      ctx.fillRect(Math.round(p.x - 14), Math.round(p.y - 39), 28, 40);
    }
    // 炎: 足元から頭の上まで。中央ほど高く、はじめの数ステップで一気に燃え上がる
    const t = Math.floor(timer / 4);
    const grow = Math.min(1, timer / 8);
    for (let c = 0; c < 14; c++) {
      const center = 1 - Math.abs(c - 6.5) / 7.5;
      const wave = 2.5 * Math.sin(t * 1.9 + c * 1.1) + 1.5 * Math.sin(t * 1.1 + c * 2.3);
      const h = Math.max(1, Math.round((6 + center * 16 + wave) * grow));
      const x = Math.round(p.x - 14 + c * 2);
      for (let r = 0; r < h; r++) {
        ctx.fillStyle = r < h * 0.35 ? FLAME.Y : r < h * 0.7 ? FLAME.O : FLAME.R;
        ctx.fillRect(x, Math.round(p.y + 1) - (r + 1) * 2, 2, 2);
      }
    }
  }

  function drawPlayer(p, frame, state, timer, deathReason) {
    if (p.state === 'dead' && deathReason === 'burn') {
      drawBurning(p, timer);
      return;
    }
    if (p.state === 'dead') {
      // ミス: くるくる回ってから倒れる
      const t = timer;
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y - 16));
      const angle = t < 60 ? Math.floor(t / 6) * (Math.PI / 2) : Math.PI / 2;
      ctx.rotate(angle);
      spr.draw(ctx, 'punkStand', 0, 16, { flip: p.facing < 0 });
      ctx.restore();
      if (t >= 60) {
        // 頭の上の星
        for (let i = 0; i < 3; i++) {
          const a = frame / 10 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = '#ffd23c';
          ctx.fillRect(Math.round(p.x + Math.cos(a) * 12), Math.round(p.y - 20 + Math.sin(a) * 4), 3, 3);
        }
      }
      return;
    }
    let name = 'punkStand';
    let flip = p.facing < 0;
    if (p.state === 'ladder') {
      name = 'punkClimb';
      flip = Math.floor(p.y / 6) % 2 === 0;
    } else if (p.state === 'air') {
      name = 'punkJump';
    } else if (p.walkTime > 0 && Math.floor(p.walkTime / 6) % 2 === 1) {
      name = 'punkWalk';
    }
    spr.draw(ctx, name, p.x, p.y + 1, { flip });
  }

  // 鉄骨から浮いている釘バット。ときどき光って目立たせる。
  // 当たり判定と一致させるため、揺らさずに下端 = it.y の位置へそのまま描く
  function drawItems(items, frame) {
    for (const it of items) {
      if (it.taken) continue;
      spr.draw(ctx, 'batSide', it.x, it.y);
      if (Math.floor(frame / 10) % 6 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(it.x + 10), Math.round(it.y - 16), 2, 2);
        ctx.fillRect(Math.round(it.x + 8), Math.round(it.y - 14), 6, 2);
        ctx.fillRect(Math.round(it.x + 10), Math.round(it.y - 12), 2, 2);
      }
    }
  }

  // 主人公が振り回している釘バットと、頭の上の残り時間バー
  function drawHeldBat(p, frame) {
    const ph = DP.player.batPhase(p);
    if (!ph) return;
    const warn = p.bat <= C.bat.warnAt;
    // 残りわずかのときは点滅(消える瞬間を作る)
    const visible = !warn || Math.floor(frame / 4) % 2 === 0;
    if (visible) {
      if (ph === 'up') {
        // 頭の上に振りかぶる(持ち手を手の位置に)
        spr.draw(ctx, 'batUp', p.x + p.facing * 6, p.y - 18);
      } else {
        // 前の地面に叩きつける
        spr.draw(ctx, 'batSide', p.x + p.facing * 22, p.y + 1, { flip: p.facing < 0 });
        // 叩きつけた衝撃の火花
        if (p.batTime % (C.bat.swingHalf * 2) === C.bat.swingHalf) {
          ctx.fillStyle = '#ffd23c';
          const sx = p.x + p.facing * 38;
          ctx.fillRect(Math.round(sx - 1), Math.round(p.y - 8), 2, 4);
          ctx.fillRect(Math.round(sx + p.facing * 4), Math.round(p.y - 4), 4, 2);
        }
      }
    }
    // 残り時間バー
    const ratio = p.bat / C.bat.duration;
    const bw = 24;
    const bx = Math.round(p.x - bw / 2);
    const by = Math.round(p.y - 64);
    ctx.fillStyle = '#05040f';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = ratio > 0.5 ? '#3cff6a' : ratio > C.bat.warnAt / C.bat.duration ? '#ffd23c' : '#ff2f2f';
    ctx.fillRect(bx, by, Math.ceil(bw * ratio), 3);
  }

  // ファイヤースカルの青白い炎(ドクロの後ろで揺らめく)。2x2 のドットの柱を 16 本(幅 32px)並べ、
  // ドクロ(幅 24px)の左右と上からはみ出して見えるようにする
  const SKULL_FLAME = { core: '#e8f8ff', mid: '#7fd8ff', out: '#2f7fff' };
  function drawSkullFlame(cx, baseY, anim, scale) {
    const t = Math.floor(anim / 4);
    for (let c = 0; c < 16; c++) {
      const center = 1 - Math.abs(c - 7.5) / 8.5;
      const wave = 2 * Math.sin(t * 1.6 + c * 1.4) + 1.3 * Math.sin(t * 0.8 + c * 2.6);
      const h = Math.max(1, Math.round((6 + center * 12 + wave) * scale));
      for (let r = 0; r < h; r++) {
        ctx.fillStyle = r < h * 0.35 ? SKULL_FLAME.core : r < h * 0.7 ? SKULL_FLAME.mid : SKULL_FLAME.out;
        ctx.fillRect(Math.round(cx - 16 + c * 2), Math.round(baseY) - (r + 1) * 2, 2, 2);
      }
    }
  }

  // ファイヤースカル。出現中は炎が燃え上がり、ドクロが下からせり上がる
  function drawSkull(e) {
    if (e.state === 'emerge') {
      // 爆音アンプの炎の中から、青白い炎とともにせり上がる(ドクロは半分を過ぎてから見える)
      const k = Math.min(1, e.t / C.skull.emergeFrames);
      drawSkullFlame(e.x, e.y - 2, e.anim, 0.4 + 0.6 * k);
      if (k > 0.35) spr.draw(ctx, 'skull', e.x, e.y - 1, { flip: e.dir < 0 });
      return;
    }
    const bob = e.state === 'spawn' || e.state === 'leap' ? 0 : Math.round(Math.sin(e.anim / 8) * 1.5); // ふわふわ
    const footY = e.y - 1 + bob;
    if (e.state === 'spawn') {
      const k = Math.min(1, e.t / C.skull.spawnFrames);
      drawSkullFlame(e.x, footY, e.anim, k);
      if (k > 0.4) spr.draw(ctx, 'skull', e.x, footY + Math.round((1 - k) * 14));
      return;
    }
    drawSkullFlame(e.x, footY - 2, e.anim, 1);
    spr.draw(ctx, 'skull', e.x, footY, { flip: e.dir < 0 });
  }

  // ビールが割れた破片(瓶は緑、缶は赤と銀)
  function drawEffects(effects) {
    for (const e of effects) {
      if (e.type === 'bird') {
        // パンクニワトリが倒れる: 白い羽根とトサカの色の羽根が舞い散る
        const comb = { blue: '#3a8cff', red: '#ff2a2a', yellow: '#ffd23c', green: '#3cd04a' }[e.color] || '#ffffff';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.4;
          const r = e.t * 1.5;
          ctx.fillStyle = i % 3 === 0 ? comb : '#ffffff';
          ctx.fillRect(Math.round(e.x + Math.cos(a) * r), Math.round(e.y + Math.sin(a) * r + e.t * e.t * 0.03), 3, 2);
        }
        if (e.t < 6) text('BOK!', e.x, e.y - 18, { size: 8, align: 'center', color: '#ffffff' });
        continue;
      }
      if (e.type === 'skull') {
        // ファイヤースカルが砕ける: 白い骨のかけらが飛び散り、青い炎がしぼんで消える
        if (e.t < 16) drawSkullFlame(e.x, e.y + 8, e.t * 3, Math.max(0, 1 - e.t / 16));
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.2;
          const r = e.t * 1.8;
          ctx.fillStyle = i % 2 ? '#ffffff' : '#d8e4f0';
          ctx.fillRect(Math.round(e.x + Math.cos(a) * r), Math.round(e.y + Math.sin(a) * r + e.t * e.t * 0.05), 3, 3);
        }
        if (e.t < 6) text('CRASH!', e.x, e.y - 18, { size: 8, align: 'center', color: '#7fd8ff' });
        continue;
      }
      const colors = e.type === 'bottle' ? ['#1f8a3a', '#8cf0a0'] : ['#e02a2a', '#d8dde4'];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const r = e.t * 1.6;
        ctx.fillStyle = colors[i % 2];
        ctx.fillRect(Math.round(e.x + Math.cos(a) * r), Math.round(e.y + Math.sin(a) * r + e.t * e.t * 0.04), 3, 3);
      }
      if (e.t < 6) text('BANG!', e.x, e.y - 16, { size: 8, align: 'center', color: '#ffffff' });
    }
  }

  // 横倒しにしたスプライトを (cx, cy) を中心に描く(担がれているガール用)。頭が右を向く
  function drawSideways(name, cx, cy, flip) {
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.rotate(Math.PI / 2);
    const s = spr.DATA[name];
    spr.draw(ctx, name, 0, (s.h * C.PIXEL) / 2, { flip });
    ctx.restore();
  }

  // クリア後の逃走演出(ゴリラ警官とガール)
  function drawEscape(e) {
    const kick = 'girlKick' + (Math.floor(e.total / 6) % 2); // ジタバタは 6 ステップごと
    if (e.phase === 'walk') {
      spr.draw(ctx, 'bossWalk' + e.walkFrame, e.bossX, e.bossY + 1);
      // ガールは近づいてくるゴリラに気づいて手を振る
      const wave = Math.floor(e.total / 12) % 2 === 0;
      spr.draw(ctx, wave ? 'girlWave' : 'girl', e.girlX, e.girlY + 1, { flip: true });
    } else if (e.phase === 'reach') {
      // 腕を振り上げたゴリラ。ガールは足場の端へ引き寄せられながらジタバタ
      spr.draw(ctx, 'bossUp', e.bossX, e.bossY + 1);
      spr.draw(ctx, kick, e.girlX, e.girlY + 1, { flip: true });
    } else if (e.phase === 'lift' || e.phase === 'struggle') {
      // 担いだまま、その場で足踏み(勝ちほこる)
      const stomp = e.phase === 'struggle' ? 'bossCarryWalk' + (Math.floor(e.t / 8) % 2) : 'bossCarry';
      spr.draw(ctx, stomp, e.bossX, e.bossY + 1);
      drawSideways(kick, e.girlX, e.girlY);
    } else if (e.phase === 'carry') {
      spr.draw(ctx, 'bossCarryWalk' + e.walkFrame, e.bossX, e.bossY + 1);
      drawSideways(kick, e.girlX, e.girlY);
    } else if (e.phase === 'climb') {
      // 背中向きで、左右の手を交互に 2 本のハシゴへかける(左右反転で 2 コマ)。
      // ガールを先に描き、振り上げた腕がガールの手前に来るようにする(腕で押さえて見える)
      drawSideways(kick, e.girlX, e.girlY);
      spr.draw(ctx, 'bossClimb', e.bossX, e.bossY + 1, { flip: e.walkFrame === 1 });
    }
  }

  function drawBoss(b) {
    const up = b.state === 'grab' || (b.state === 'idle' && Math.floor(b.anim / 20) % 6 === 0);
    spr.draw(ctx, up ? 'bossUp' : 'boss', b.x, b.y + 1);
    // 持ち上げているビール
    if (b.state === 'grab' && b.holding) {
      const name = b.holding === 'can' ? 'can0' : 'bottle0';
      spr.draw(ctx, name, b.x, b.y - 46);
    }
    // 予備のビールケース(飾り)
    ctx.fillStyle = '#c87a1a';
    ctx.fillRect(b.x - 50, b.y - 16, 22, 16);
    ctx.fillStyle = '#7a4a10';
    ctx.fillRect(b.x - 50, b.y - 10, 22, 2);
    ctx.fillStyle = '#1f8a3a';
    for (let i = 0; i < 4; i++) ctx.fillRect(b.x - 48 + i * 5, b.y - 22, 3, 7);
  }

  function drawHeroine(h, frame, state) {
    const wave = state === 'clear' || Math.floor(frame / 24) % 2 === 0;
    spr.draw(ctx, wave ? 'girlWave' : 'girl', h.x, h.y + 1, { flip: true });
    if (state === 'playing' || state === 'ready') {
      if (Math.floor(frame / 40) % 3 !== 2) text('HELP!', h.x + 14, h.y - 44, { size: 8, color: '#ff5aa6' });
    }
  }

  function drawHazard(h) {
    if (h.type === 'bottle') {
      const f = Math.floor(h.spin / 6) % 3;
      spr.draw(ctx, 'bottle' + f, h.x, h.y + 1, { flip: h.dir < 0 });
    } else {
      const f = Math.floor(h.spin / 5) % 4;
      const name = 'can' + (h.dir < 0 ? 3 - f : f);
      spr.draw(ctx, name, h.x, h.y + 1);
    }
  }

  function drawHud(g) {
    text('1UP', 12, 8, { size: 10, color: '#ff4848' });
    text(String(g.score).padStart(6, '0'), 12, 22, { size: 10 });
    text('HI', 200, 8, { size: 10, color: '#ff4848' });
    text(String(g.hiScore).padStart(6, '0'), 200, 22, { size: 10 });
    // 残機(モヒカンの頭アイコン)
    for (let i = 0; i < g.lives; i++) {
      ctx.fillStyle = '#ff2a2a';
      ctx.fillRect(14 + i * 14, 40, 4, 4);
      ctx.fillStyle = '#f4bc94';
      ctx.fillRect(12 + i * 14, 44, 8, 6);
    }
    // ボーナス
    if (g.state !== 'title') {
      ctx.strokeStyle = '#3cd8ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(372, 8, 96, 32);
      text('BONUS', 420, 12, { size: 8, align: 'center', color: '#3cd8ff' });
      text(String(g.bonus), 420, 25, { size: 10, align: 'center' });
      text('R' + g.round, 340, 22, { size: 8, color: '#a8a8c8' });
    }
    // 釘バットの残り時間(HUD)
    const p = g.player;
    if (p && p.bat > 0 && g.state === 'playing') {
      const ratio = p.bat / C.bat.duration;
      const warn = p.bat <= C.bat.warnAt;
      text('BAT', 200, 40, { size: 8, color: warn ? '#ff2f2f' : '#ffd23c' });
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(228, 40, 80, 8);
      ctx.fillStyle = warn && Math.floor(g.frame / 4) % 2 === 0 ? '#ffffff' : warn ? '#ff2f2f' : '#ffd23c';
      ctx.fillRect(228, 40, Math.ceil(80 * ratio), 8);
    }
  }

  function drawPopups(g) {
    for (const pp of g.popups) text(pp.text, pp.x, pp.y - pp.t * 0.4, { size: 8, align: 'center', color: '#ffd23c' });
  }

  function overlay(alpha) {
    ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
  }

  function drawTitle(g) {
    overlay(0.7);
    const cx = C.WIDTH / 2;
    text('DONKEY', cx, 110, { size: 32, align: 'center', color: '#ff2f6e', shadow: '#3a0a1a' });
    text('PUNK', cx, 152, { size: 40, align: 'center', color: '#ffd23c', shadow: '#5a3a00' });
    text('ドンキーパンク', cx, 204, { size: 20, align: 'center', ja: true, color: '#3cd8ff' });
    // 3 人の足元は 308(主人公のモヒカンの先がタイトル文字に触れない高さ)
    spr.draw(ctx, 'punkStand', cx - 70, 308, { scale: 4 });
    spr.draw(ctx, 'boss', cx + 10, 308, { scale: 3 });
    spr.draw(ctx, 'girlWave', cx + 90, 308, { scale: 4, flip: true });
    if (Math.floor(g.frame / 30) % 2 === 0) text('PRESS ENTER', cx, 330, { size: 14, align: 'center' });
    text('← → 移動  ↑ ↓ ハシゴ  SPACE ジャンプ', cx, 380, { size: 14, align: 'center', ja: true, color: '#a8a8c8' });
    text('ENTER 開始・再挑戦  M 音 ON/OFF', cx, 404, { size: 14, align: 'center', ja: true, color: '#a8a8c8' });
    text('ビール瓶・缶をよけて、さらわれたガールを救え!', cx, 440, { size: 14, align: 'center', ja: true });
    text('釘バットを拾うと、しばらくビールを叩き割れる!', cx, 462, { size: 12, align: 'center', ja: true, color: '#ffd23c' });
    text('SOUND: ' + (DP.audio.isEnabled() ? 'ON' : 'OFF'), cx, 500, { size: 8, align: 'center', color: '#6a6a8a' });
  }

  function render(game) {
    const g = game.data;
    drawBackground(g.frame, g.level && g.level.stage);

    if (g.level) {
      const stage = g.level.stage;
      if (stage.amp) drawAmpStand(stage.amp, stage.girderColors); // 格子の台は鉄骨・ハシゴより奥
      drawEscapeLadders(g.level);
      drawLiftShafts(g.level, g.frame);
      for (const l of g.level.ladders) drawLadder(l);
      for (const gd of g.level.girders) drawGirder(gd, stage.girderColors, g.frame);
      if (stage.amp) drawAmp(stage.amp, stage.girderColors, g.frame, g.level.ampFlare || 0);
      if (stage.wreckingBall) drawWreckingBall(stage.wreckingBall, g.frame);
      if (g.state === 'escape' && g.escape) {
        drawEscape(g.escape);
      } else {
        // 逃走演出のあと(クリア表示中)は 2 人とも画面の外へ消えている
        if (!g.heroine.gone) drawHeroine(g.heroine, g.frame, g.state);
        if (!g.boss.gone) drawBoss(g.boss);
      }
      drawItems(g.items, g.frame);
      for (const h of g.hazards) drawHazard(h);
      for (const e of g.enemies) drawSkull(e);
      // 3 面のパンクニワトリ(羽ばたきの 2 枚を入れ替える。左へ飛ぶときは左右反転)
      for (const b of (g.level.birds || [])) spr.draw(ctx, `bird_${b.color}_${DP.birds.wing(b)}`, b.x, b.y, { flip: b.dir < 0 });
      drawPlayer(g.player, g.frame, g.state, g.timer, g.deathReason);
      drawHeldBat(g.player, g.frame);
      drawEffects(g.effects);
      drawPopups(g);
    }
    drawHud(g);
    // 開発用ショートカットが有効なときだけ、画面の下に目印を出す
    // (いちばん下の床 y=540〜548 に重ならないよう、その下に出す)
    if (g.devMode) text('DEV  C:クリア演出  1〜3:面を選んで開始', 8, C.HEIGHT - 11, { size: 10, ja: true, color: '#ffd23c' });

    const cx = C.WIDTH / 2;
    if (g.state === 'title') {
      drawTitle(g);
    } else if (g.state === 'ready') {
      text(g.message, cx, 250, { size: 16, align: 'center', color: '#3cd8ff', shadow: '#000' });
      text('READY!', cx, 276, { size: 16, align: 'center', shadow: '#000' });
    } else if (g.state === 'clear') {
      // クリア演出: 「Oi! Oi! Oi!」とハート
      const h = g.heroine;
      // ハートはガールがいるときだけ(さらわれた後は出さない)
      if (!h.gone) spr.draw(ctx, 'heart', h.x + 20, h.y - 36 - Math.sin(g.frame / 8) * 3, { scale: 3 });
      overlay(0.35);
      const bump = Math.floor(g.timer / 20) % 2 === 0 ? 0 : 4;
      text('Oi! Oi! Oi!', cx, 236 - bump, { size: 28, align: 'center', color: '#ffd23c', shadow: '#ff2f6e' });
      text('SCORE ' + g.score, cx, 290, { size: 12, align: 'center' });
      if (g.timer >= C.timing.clearWait && Math.floor(g.frame / 30) % 2 === 0) {
        text('PRESS ENTER', cx, 320, { size: 12, align: 'center' });
      }
    } else if (g.state === 'gameover') {
      overlay(0.6);
      text('GAME OVER', cx, 230, { size: 28, align: 'center', color: '#ff2f6e', shadow: '#000' });
      text('SCORE ' + g.score, cx, 280, { size: 12, align: 'center' });
      if (Math.floor(g.frame / 30) % 2 === 0) text('PRESS ENTER', cx, 316, { size: 12, align: 'center' });
    }
  }

  return { render };
};
