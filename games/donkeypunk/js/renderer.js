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

  // celebrate: 4 面のクリア演出でハートが出たあと(背景を青空・教会・お花畑に切り替える)
  function drawBackground(frame, stage, celebrate) {
    if (celebrate) {
      drawWedding(frame);
      return;
    }
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
    if (stage && stage.background === 'festival') {
      drawFestival(frame);
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

  // 4 面のクリア演出(ハートのあと)の背景: 青空と白い雲、丘の上の教会、手前のお花畑(すべてドット風のオリジナル)
  const FLOWERS = [];
  for (let i = 0; i < 70; i++) {
    FLOWERS.push({ x: rand() * C.WIDTH, y: 480 + rand() * 76, c: ['#ff5a8a', '#ffd23c', '#ffffff', '#ff9ad5', '#b07aff', '#ff7a3c'][i % 6], ph: rand() * 6 });
  }
  function drawWedding(frame) {
    // 青空(上ほど濃い青の帯を重ねる)
    const sky = ['#2a7ae8', '#3a8af0', '#4a9af4', '#5aaaf8', '#6ab8fa', '#80c8fc', '#98d6fe'];
    const band = Math.ceil(420 / sky.length);
    sky.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(0, i * band, C.WIDTH, band);
    });
    ctx.fillStyle = '#98d6fe';
    ctx.fillRect(0, 420, C.WIDTH, C.HEIGHT - 420);
    // お日さま
    ctx.fillStyle = '#fff3a0';
    ctx.fillRect(392, 60, 40, 40);
    ctx.fillRect(386, 68, 52, 24);
    ctx.fillRect(400, 54, 24, 52);
    // 白い雲(ゆっくり右へ流れる)
    ctx.fillStyle = '#ffffff';
    for (const cl of [{ x: 30, y: 90, w: 70 }, { x: 200, y: 50, w: 90 }, { x: 330, y: 150, w: 60 }]) {
      const x = ((cl.x + frame * 0.2) % (C.WIDTH + 120)) - 60;
      ctx.fillRect(x, cl.y, cl.w, 14);
      ctx.fillRect(x + 10, cl.y - 10, cl.w * 0.5, 12);
      ctx.fillRect(x + cl.w * 0.45, cl.y - 6, cl.w * 0.4, 8);
    }
    // 奥の丘
    ctx.fillStyle = '#6ac85a';
    ctx.beginPath();
    ctx.moveTo(0, 470);
    ctx.quadraticCurveTo(120, 400, 240, 440);
    ctx.quadraticCurveTo(360, 400, 480, 460);
    ctx.lineTo(480, C.HEIGHT);
    ctx.lineTo(0, C.HEIGHT);
    ctx.closePath();
    ctx.fill();
    // 教会(画面の中央。白い壁・赤い屋根・塔と十字架・バラ窓・木の扉・鐘)
    const cx = C.WIDTH / 2;
    ctx.fillStyle = '#f4f0e6'; // 本堂の壁
    ctx.fillRect(cx - 70, 380, 140, 130);
    ctx.fillStyle = '#d8d0c0'; // 壁の影
    ctx.fillRect(cx - 70, 500, 140, 10);
    ctx.fillStyle = '#c83a3a'; // 本堂の屋根
    ctx.beginPath();
    ctx.moveTo(cx - 80, 384);
    ctx.lineTo(cx, 330);
    ctx.lineTo(cx + 80, 384);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4f0e6'; // 塔
    ctx.fillRect(cx - 18, 250, 36, 90);
    ctx.fillStyle = '#c83a3a'; // 塔のとんがり屋根
    ctx.beginPath();
    ctx.moveTo(cx - 24, 254);
    ctx.lineTo(cx, 200);
    ctx.lineTo(cx + 24, 254);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd23c'; // 十字架
    ctx.fillRect(cx - 2, 176, 4, 26);
    ctx.fillRect(cx - 9, 184, 18, 4);
    ctx.fillStyle = '#5a4a3a'; // 鐘の窓
    ctx.fillRect(cx - 9, 266, 18, 22);
    ctx.fillStyle = '#ffd23c'; // 鐘(ゆらゆら揺れる)
    const swing = Math.round(Math.sin(frame / 10) * 2);
    ctx.fillRect(cx - 5 + swing, 270, 10, 10);
    ctx.fillRect(cx - 7 + swing, 279, 14, 3);
    // バラ窓(ステンドグラス。色が順に光る)
    const glass = ['#ff5a8a', '#3cd8ff', '#ffd23c', '#6aff7a'];
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(cx - 13, 392, 26, 26);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = glass[(i + Math.floor(frame / 20)) % 4];
      ctx.fillRect(cx - 11 + (i % 2) * 12, 394 + Math.floor(i / 2) * 12, 10, 10);
    }
    // 両側の窓
    ctx.fillStyle = '#7ab8e8';
    for (const wx of [cx - 56, cx - 40, cx + 30, cx + 46]) ctx.fillRect(wx, 430, 10, 22);
    // 木の扉(2 人が並ぶ位置の後ろ)
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(cx - 16, 462, 32, 48);
    ctx.fillStyle = '#6a4220';
    ctx.fillRect(cx - 1, 462, 2, 48);
    // お花畑(手前の緑に、色とりどりの花がそよぐ)
    ctx.fillStyle = '#4ab84a';
    ctx.fillRect(0, 500, C.WIDTH, C.HEIGHT - 500);
    ctx.fillStyle = '#3a9a3a';
    for (let x = 0; x < C.WIDTH; x += 8) ctx.fillRect(x + ((x / 8) % 2) * 3, 500 - ((x / 8) % 3), 2, 6); // 草
    for (const f of FLOWERS) {
      const sway = Math.round(Math.sin(frame / 15 + f.ph));
      ctx.fillStyle = f.c;
      ctx.fillRect(Math.round(f.x) + sway, Math.round(f.y), 4, 4);
      ctx.fillStyle = '#ffe680';
      ctx.fillRect(Math.round(f.x) + sway + 1, Math.round(f.y) + 1, 2, 2);
    }
  }

  // 4 面のクリア演出の花火(ハートのあと。打ち上がって丸く開き、色が変わりながら落ちて消える)
  function drawFireworks(c) {
    const life = C.collapse.fireworkLife;
    for (const f of c.fireworks) {
      if (f.t < 8) {
        // 打ち上げ中: 下から昇る光の点と尾
        const y = f.y + (8 - f.t) * 14;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(f.x) - 1, Math.round(y), 3, 3);
        ctx.fillStyle = f.color;
        ctx.fillRect(Math.round(f.x), Math.round(y) + 4, 1, 8);
        continue;
      }
      // 開いた花火: 火花が円く広がり、少しずつ下へ垂れて薄くなる
      const p = (f.t - 8) / (life - 8);
      const r = f.r * Math.min(1, p * 2.2);
      const drop = p * p * 14;
      ctx.globalAlpha = Math.max(0, 1 - p * p * 0.9); // 終わり近くまで明るく、最後に薄くなる
      for (let i = 0; i < f.n; i++) {
        const a = (i / f.n) * Math.PI * 2;
        const x = Math.round(f.x + Math.cos(a) * r);
        const y = Math.round(f.y + Math.sin(a) * r + drop);
        ctx.fillStyle = (i + Math.floor(f.t / 4)) % 2 ? f.color : f.color2;
        ctx.fillRect(x - 2, y - 2, 4, 4);
        ctx.fillRect(Math.round(f.x + Math.cos(a) * r * 0.6) - 1, Math.round(f.y + Math.sin(a) * r * 0.6 + drop) - 1, 3, 3);
      }
      if (f.t < 12) {
        // 開いた瞬間の光
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(f.x) - 3, Math.round(f.y) - 3, 7, 7);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- 面間演出(1〜3 面のあと。やぐらを積み上げる。js/intermission.js) ----
  // 暗い夜の工事現場に、赤錆のやぐら・クレーン・紺の制服の警察官が浮き上がるように描く
  function drawIntermission(it, frame, timer) {
    const L = DP.intermission.LAYOUT;
    const colors = (DP.stages[3] && DP.stages[3].girderColors) || { body: '#b0482a', top: '#f08a5a', bottom: '#4a1a10' };
    // 暗い背景(夜空と、ほのかな星)
    ctx.fillStyle = '#07060f';
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
    for (const st of stars) {
      ctx.fillStyle = '#3a3a5a';
      ctx.fillRect(Math.round(st.x), Math.round(st.y), 2, 2);
    }
    // 下からの投光器の光(うすい黄色の三角)
    ctx.fillStyle = 'rgba(255,220,120,0.05)';
    for (const lx of [20, 460]) {
      ctx.beginPath();
      ctx.moveTo(lx, L.groundY);
      ctx.lineTo(L.towerX - 140, 0);
      ctx.lineTo(L.towerX + 140, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.save();
    if (it.shake) ctx.translate(it.shake, 0);
    // 地面(暗い土と砂利)。奥の列の警察官(y=506)も地面の上に立つよう、少し奥から塗る
    ctx.fillStyle = '#1a1420';
    ctx.fillRect(0, 496, C.WIDTH, C.HEIGHT - 496);
    ctx.fillStyle = '#2a2230';
    for (let x = 6; x < C.WIDTH; x += 17) ctx.fillRect(x, L.groundY + 6 + (x % 3) * 4, 3, 2);
    // クレーン(左の柱と、やぐらの上まで伸びる腕。格子の筋交い)
    ctx.fillStyle = '#6a4a1a';
    ctx.fillRect(22, L.jibY, 4, L.groundY - L.jibY);
    ctx.fillRect(38, L.jibY, 4, L.groundY - L.jibY);
    for (let y = L.jibY; y < L.groundY; y += 20) {
      ctx.fillRect(22, y, 20, 2);
      for (let k = 0; k < 10; k++) ctx.fillRect(22 + k * 2, y + k * 2, 2, 2);
    }
    ctx.fillRect(10, L.jibY - 4, 450, 4);
    ctx.fillRect(10, L.jibY + 8, 450, 2);
    for (let x = 10; x < 460; x += 16) for (let k = 0; k < 6; k++) ctx.fillRect(x + k * 2, L.jibY + k * 2 - 2, 2, 2);
    ctx.fillStyle = '#3a3a44'; // つり合いのおもり
    ctx.fillRect(4, L.jibY - 2, 18, 16);
    // フックとワイヤー(腕の上を動く台車から下がる)
    ctx.fillStyle = '#9a9aa8';
    ctx.fillRect(Math.round(it.hook.x) - 6, L.jibY + 2, 12, 6);
    ctx.fillRect(Math.round(it.hook.x), L.jibY + 8, 1, Math.max(0, Math.round(it.hook.y) - L.jibY - 8));
    ctx.fillStyle = '#d8d8e0';
    ctx.fillRect(Math.round(it.hook.x) - 3, Math.round(it.hook.y) - 2, 7, 3);
    ctx.fillRect(Math.round(it.hook.x) + 2, Math.round(it.hook.y), 2, 4);
    // にぎやかしの警察官(奥の列)。やぐらより奥にいるので先に描く
    const crowdBack = it.crowd.filter((o) => o.kind !== 'tower' && o.y < L.groundY);
    const crowdFront = it.crowd.filter((o) => o.kind !== 'tower' && o.y > L.groundY);
    for (const o of crowdBack) drawCrowdCop(o, colors, frame);
    // やぐら(積まれた段。各段は上の鉄骨と、その下の 2 本の柱と X の筋交い)
    const x1 = L.towerX - L.tierW / 2;
    const x2 = L.towerX + L.tierW / 2;
    for (let n = 1; n <= it.tiers; n++) {
      const top = DP.intermission.tierTopY(n);
      ctx.fillStyle = colors.bottom;
      for (const px of [x1 + 14, x2 - 18]) ctx.fillRect(px, top + 8, 4, L.tierH - 8);
      ctx.fillStyle = 'rgba(176,72,42,0.55)';
      for (let k = 0; k < 20; k++) {
        const fy = top + 8 + k * ((L.tierH - 10) / 20);
        ctx.fillRect(Math.round(x1 + 18 + k * ((x2 - x1 - 36) / 20)), Math.round(fy), 3, 3);
        ctx.fillRect(Math.round(x2 - 21 - k * ((x2 - x1 - 36) / 20)), Math.round(fy), 3, 3);
      }
      drawGirder({ x1, x2, y1: top, y2: top }, colors, frame);
    }
    // 安全ピン(3 面のあと: 下の段から順に、各段の左右へ差し込む)
    for (let i = 0; i < it.pinsIn; i++) {
      const top = DP.intermission.tierTopY(1 + Math.floor(i / 2));
      const px = L.towerX + (i % 2 ? 58 : -62);
      ctx.fillStyle = '#ffd23c';
      ctx.fillRect(px - 8, top - 1, 16, 10);
      ctx.fillStyle = '#fff3a0';
      ctx.fillRect(px - 2, top - 12, 4, 12);
      ctx.fillRect(px - 5, top - 15, 10, 4);
    }
    // やぐらの上で鉄骨をたたく警察官
    for (const o of it.crowd) if (o.kind === 'tower') drawCrowdCop(o, colors, frame);
    // 運んでいる・つっている鉄骨(置いたあとはやぐらの段として描く)
    if (it.beam.state !== 'placed') {
      ctx.save();
      ctx.translate(Math.round(it.beam.x), Math.round(it.beam.y));
      if (it.beam.tilt) ctx.rotate(it.beam.tilt);
      drawGirder({ x1: -L.tierW / 2, x2: L.tierW / 2, y1: 0, y2: 0 }, colors, frame);
      ctx.restore();
    }
    // 置いたときの火花(鉄骨の両端から飛び散る)
    if (it.sparks > 0) {
      const top = DP.intermission.tierTopY(it.tiers);
      const r = (C.intermission.sparkFrames - it.sparks) * 3;
      ctx.fillStyle = it.sparks % 4 < 2 ? '#ffd23c' : '#ffffff';
      for (const ex of [x1, x2]) {
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + (k - 2.5) * 0.45;
          ctx.fillRect(Math.round(ex + Math.cos(a) * r), Math.round(top + Math.sin(a) * r), 3, 3);
        }
      }
      text('GAKIIN!', L.towerX, DP.intermission.tierTopY(it.tiers) - 92, { size: 12, align: 'center', color: '#ffd23c', shadow: '#000' });
    }
    // 旗(3 面のあと: 右の 2 人がかついでくる → やぐらのてっぺんに立って上がる)。紺地に金の星(警察の旗)
    if (it.final) {
      if (it.flag.carried) {
        const fy = L.groundY - L.carryLift;
        ctx.fillStyle = '#9a9aa8';
        ctx.fillRect(Math.round(it.flag.x) - 50, fy, 100, 3);
        drawFlagCloth(Math.round(it.flag.x) - 50, fy + 3, frame, false);
      } else if (it.phase === 'done' || it.phase === 'title') {
        const top = DP.intermission.tierTopY(it.tiers);
        const px = L.towerX + 76;
        ctx.fillStyle = '#9a9aa8';
        ctx.fillRect(px, top - 70, 3, 70);
        drawFlagCloth(px + 3, Math.round(top - 70 + (1 - it.flag.up) * 52), frame, true);
      }
    }
    // 警察官(歩く・かつぐ・敬礼・万歳)
    for (const c of it.cops) {
      let name = 'copWalkA';
      if (c.pose === 'carry') name = c.step ? 'copCarryB' : 'copCarryA';
      else if (c.pose === 'salute') name = 'copSalute';
      else if (c.pose === 'cheer') name = 'copCheer';
      else if (c.walking) name = c.step ? 'copWalkB' : 'copWalkA';
      spr.draw(ctx, name, c.x, c.y - (c.hop || 0), { flip: c.facing < 0 });
    }
    // 現場監督のゴリラ警官(やぐらのてっぺん。指示を出すときは腕を振り上げ、吹き出しを出す)
    const b = it.boss;
    spr.draw(ctx, b.pose === 'up' ? 'bossUp' : 'boss', b.x, b.y + 1);
    // にぎやかしの警察官(手前の列)
    for (const o of crowdFront) drawCrowdCop(o, colors, frame);
    if (b.shout > 0 && b.bubble) {
      const bx = b.x - 92;
      const by = b.y - 82;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx - 34, by - 4, 68, 24);
      ctx.fillRect(bx + 20, by + 20, 8, 4);
      ctx.fillRect(bx + 28, by + 24, 6, 4);
      text(b.bubble, bx, by, { size: 16, ja: true, align: 'center', color: '#d01a2a' });
    }
    ctx.restore();
    // 文字: 完成(3 面のあと)/ 次の面の名前
    if (it.phase === 'done' || (it.final && it.phase === 'title')) {
      const bump = Math.floor(it.total / 12) % 2 ? 2 : 0;
      text('やぐら完成!', C.WIDTH / 2, 168 - bump, { size: 28, ja: true, align: 'center', color: '#ffd23c', shadow: '#ff2f6e' });
    }
    if (it.phase === 'title') {
      text('NEXT', 150, 250, { size: 12, align: 'center', color: '#3cd8ff', shadow: '#000' });
      text(it.stageName, 150, 272, { size: 18, align: 'center', color: '#ffffff', shadow: '#000' });
      text(it.stageTitle, 150, 302, { size: 16, ja: true, align: 'center', color: '#ffd23c', shadow: '#000' });
    }
    // 1 秒たったら ENTER で飛ばせる
    if (timer > C.intermission.skipAfter && Math.floor(frame / 30) % 2 === 0) {
      text('ENTER: SKIP', C.WIDTH - 10, C.HEIGHT - 20, { size: 8, align: 'right', color: '#8a8aa8' });
    }
    if (it.fade > 0) overlay(Math.min(1, it.fade));
  }

  // にぎやかしの警察官 1 人(ポーズのドット絵 + かついだ短い鉄骨 + 頭の上の「?」「!」「Zzz」)
  function drawCrowdCop(o, colors, frame) {
    let name = 'copWalkA';
    if (o.pose === 'carry') name = o.step ? 'copCarryB' : 'copCarryA';
    else if (o.pose === 'salute') name = 'copSalute';
    else if (o.pose === 'cheer') name = 'copCheer';
    else if (o.walking) name = o.step ? 'copWalkB' : 'copWalkA';
    const y = o.y - (o.hop || 0);
    spr.draw(ctx, name, o.x, y, { flip: o.facing < 0 });
    if (o.pose === 'carry') drawGirder({ x1: o.x - 22, x2: o.x + 22, y1: y - 44, y2: y - 44 }, colors, frame);
    if (o.label) {
      const bob = o.label === 'Zzz' ? Math.round(Math.sin(frame / 12) * 2) : 0;
      text(o.label, o.x + (o.label === 'Zzz' ? 10 : 0), y - 50 + bob, { size: 8, align: 'center', color: o.label === '!' ? '#ff5a5a' : '#cfd6e0' });
    }
  }

  // 4 面のボーナスアイテム(取っていないものだけ)。当たり判定は動かさず、見た目だけ上下に 2px ゆっくり揺らし、ときどきキラッと光る
  const PRIZE_SPRITE = { beer: 'beerUp', hbook: 'hbook', cash: 'cash' };
  function drawPrizes(level, frame) {
    level.prizes.forEach((p, i) => {
      if (p.taken || p.gone) return;
      const f = DP.mechanics.prizes.floorOf(level, p);
      if (f.y === null) return;
      const bob = Math.round(Math.sin(frame / 20 + i * 2) * 2) - 2;
      spr.draw(ctx, PRIZE_SPRITE[p.type], p.x, f.y + bob, { scale: 2 });
      // キラッ(90 ステップごとに、アイテムごとにずらして)
      const k = (frame + i * 30) % 90;
      if (k < 10) {
        const sx = p.x + 8;
        const sy = f.y + bob - 26;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 1, sy - 4, 2, 9);
        ctx.fillRect(sx - 4, sy - 1, 9, 2);
      }
    });
  }

  // 4 面の怒ったポリスマン(js/cops.js)。現れている間は点滅、振り向きの予告は「!」、ハシゴは背中向き、
  // 落ちている間は両手を上げてじたばた、気絶は目を回して頭の上に星
  function drawCop(e, frame) {
    if (e.state === 'spawn' && Math.floor(e.t / 4) % 2 === 1) return; // 点滅
    let name = Math.floor(e.anim / 8) % 2 ? 'copWalkB' : 'copWalkA';
    let flip = e.dir < 0;
    if (e.state === 'spawn' || e.state === 'turn') name = 'copWalkA';
    if (e.state === 'ladder') {
      name = 'copClimb';
      flip = Math.floor(e.y / 8) % 2 === 1; // 登った量で手を入れ替える
    } else if (e.state === 'fall') name = 'copCheer';
    else if (e.state === 'stunned') name = 'copDizzy';
    spr.draw(ctx, name, e.x, e.y + 1, { flip });
    if (e.state === 'turn') text('!', e.x, e.y - 52, { size: 14, align: 'center', color: '#ff3c3c', shadow: '#000' });
    if (e.state === 'stunned') {
      ctx.fillStyle = '#ffd23c';
      for (let i = 0; i < 3; i++) {
        const a = frame / 6 + (i * Math.PI * 2) / 3;
        ctx.fillRect(Math.round(e.x + Math.cos(a) * 12) - 1, Math.round(e.y - 40 + Math.sin(a) * 3) - 1, 3, 3);
      }
    }
  }

  // 旗の布(紺地に金の星。風でゆれる)。x, y は布の左上
  function drawFlagCloth(x, y, frame, wave) {
    for (let i = 0; i < 36; i += 2) {
      const dy = wave ? Math.round(Math.sin(frame / 6 + i / 5) * 2) : 0;
      ctx.fillStyle = '#2f48b8';
      ctx.fillRect(x + i, y + dy, 2, 22);
    }
    ctx.fillStyle = '#ffd23c';
    ctx.fillRect(x + 14, y + 6, 8, 8);
    ctx.fillRect(x + 12, y + 9, 12, 2);
    ctx.fillRect(x + 17, y + 3, 2, 14);
  }

  // 3 面の背景: 解体途中のビルの壁(上の縁がギザギザに崩れ、窓の穴と鉄筋が見える)
  const WALLS = [
    { x: 0, w: 60, top: 300 }, { x: 60, w: 70, top: 230 }, { x: 130, w: 60, top: 270 },
    { x: 190, w: 90, top: 210 }, { x: 280, w: 60, top: 250 }, { x: 340, w: 70, top: 190 }, { x: 410, w: 70, top: 260 },
  ];
  // 4 面の背景: 野外フェスの夜。左右の奥に照明用のトラス塔、上から色付きのスポットライトがゆっくり揺れ、
  // 下には観客のシルエット。どれも暗い色にして、手前の鉄骨・ピン・主人公が見やすいようにする
  function drawFestival(frame) {
    // スポットライト(上の照明から斜め下へ広がる光。半透明で、4 本が左右にゆっくり振れる)
    const lights = [
      { x: 40, c: 'rgba(255,60,140,0.07)', ph: 0 }, { x: 160, c: 'rgba(60,200,255,0.06)', ph: 1.7 },
      { x: 320, c: 'rgba(255,210,60,0.06)', ph: 3.1 }, { x: 440, c: 'rgba(140,90,255,0.07)', ph: 4.4 },
    ];
    for (const l of lights) {
      const sway = Math.sin(frame / 120 + l.ph) * 60;
      ctx.fillStyle = l.c;
      ctx.beginPath();
      ctx.moveTo(l.x - 4, 0);
      ctx.lineTo(l.x + 4, 0);
      ctx.lineTo(l.x + sway + 70, C.HEIGHT);
      ctx.lineTo(l.x + sway - 70, C.HEIGHT);
      ctx.closePath();
      ctx.fill();
    }
    // 奥のトラス塔(左右の端。細い柱と X 字の筋交い)
    ctx.fillStyle = '#1d1630';
    for (const tx of [4, 452]) {
      ctx.fillRect(tx, 40, 2, C.HEIGHT - 40);
      ctx.fillRect(tx + 22, 40, 2, C.HEIGHT - 40);
      for (let y = 40; y < C.HEIGHT; y += 24) {
        ctx.fillRect(tx, y, 24, 2);
        for (let k = 0; k < 12; k++) {
          ctx.fillRect(tx + k * 2, y + k * 2, 2, 2); // \
          ctx.fillRect(tx + 22 - k * 2, y + k * 2, 2, 2); // /
        }
      }
      // 塔の上の照明(ゆっくり点滅)
      ctx.fillStyle = Math.floor(frame / 40) % 2 === 0 ? '#ffd23c' : '#8a6a1c';
      ctx.fillRect(tx + 6, 32, 12, 6);
      ctx.fillStyle = '#1d1630';
    }
    // 観客のシルエット(地面の奥。頭が並んで、ときどき拳が上がる)
    ctx.fillStyle = '#140f22';
    ctx.fillRect(0, C.HEIGHT - 44, C.WIDTH, 44);
    for (let x = 4; x < C.WIDTH; x += 12) {
      const up = (x * 13 + Math.floor(frame / 20)) % 7 === 0;
      ctx.fillRect(x, C.HEIGHT - 52, 8, 8); // 頭
      if (up) ctx.fillRect(x + 6, C.HEIGHT - 64, 3, 10); // 拳
    }
  }

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

  // 4 面の巨大な安全ピン(ステージデータの pins)。床の継ぎ目(x±12)を黄色い留め金で覆い、
  // その上に安全ピンの頭(輪と針)が突き出す。抜けたピン(pulled)は描かない(床には穴が開いている)
  function drawPins(pins, level) {
    const T = C.GIRDER_THICKNESS;
    for (const pin of pins) {
      if (pin.pulled) continue;
      const gd = level.byId[pin.girder];
      if (!gd) continue;
      const y = Math.round(geo.surfaceY(gd, pin.x));
      const x = Math.round(pin.x);
      // 留め金(床の継ぎ目を覆う黄色い板。幅 24px = 第 2 段階で消える床の幅)
      ctx.fillStyle = '#ffd23c';
      ctx.fillRect(x - 12, y, 24, T);
      ctx.fillStyle = '#fff3a0';
      ctx.fillRect(x - 12, y, 24, 1);
      ctx.fillStyle = '#9a7410';
      ctx.fillRect(x - 12, y + T - 1, 24, 1);
      ctx.fillRect(x - 1, y + 2, 2, T - 4); // 継ぎ目
      // 安全ピンの頭: 床から上へ突き出した針(2 本)と、上の丸い輪・留め具
      ctx.fillStyle = '#e8e8f0';
      ctx.fillRect(x - 5, y - 12, 2, 12); // 左の針
      ctx.fillRect(x + 3, y - 12, 2, 12); // 右の針
      ctx.fillRect(x - 4, y - 14, 8, 2); // 輪の上
      ctx.fillStyle = '#a0a0b8';
      ctx.fillRect(x - 3, y - 12, 2, 2); // 輪の内側の影
      ctx.fillStyle = '#ffd23c';
      ctx.fillRect(x - 6, y - 4, 12, 4); // 留め具(黄色)
    }
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
      if (it.taken || it.gone) continue;
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
      if (e.type === 'prize') {
        // 4 面のボーナスアイテムを取った: 金と白の光の粒が丸く広がる
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const r = 4 + e.t * 1.8;
          ctx.fillStyle = i % 2 ? '#ffd23c' : '#ffffff';
          ctx.fillRect(Math.round(e.x + Math.cos(a) * r) - 1, Math.round(e.y + Math.sin(a) * r) - 1, 3, 3);
        }
        continue;
      }
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
      if (e.type === 'pin') {
        // 安全ピンが抜けた: ピンがくるくる回りながら斜め上へ飛び出して落ちていく(抜いた向きと反対へ)
        const px = e.x + e.dir * e.t * 1.2;
        const py = e.y - e.t * 3 + e.t * e.t * 0.22;
        const a = e.t * 0.6;
        const dx = Math.round(Math.cos(a) * 6);
        const dy = Math.round(Math.sin(a) * 6);
        ctx.fillStyle = '#e8e8f0'; // 針
        for (let k = -3; k <= 3; k++) ctx.fillRect(Math.round(px + (dx * k) / 3), Math.round(py + (dy * k) / 3), 2, 2);
        ctx.fillStyle = '#ffd23c'; // 留め具
        ctx.fillRect(Math.round(px - dx) - 2, Math.round(py - dy) - 2, 5, 5);
        if (e.t < 8) text('PING!', e.x, e.y - 22, { size: 8, align: 'center', color: '#ffd23c' });
        continue;
      }
      if (e.type === 'cop') {
        // 怒ったポリスマンを釘バットで倒した: 制帽が打たれた向きへくるくる飛び、紺と金のかけら・黄色い星が散る
        const hx = e.x + e.dir * e.t * 1.6;
        const hy = e.y - 10 - e.t * 2.4 + e.t * e.t * 0.12;
        ctx.fillStyle = '#1d2c74'; // 制帽(紺)
        if (Math.floor(e.t / 3) % 2 === 0) ctx.fillRect(Math.round(hx) - 6, Math.round(hy) - 3, 12, 5);
        else ctx.fillRect(Math.round(hx) - 3, Math.round(hy) - 6, 5, 12);
        ctx.fillStyle = '#ffd23c'; // 帽子のバッジ
        ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 2, 2);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.3;
          const r = e.t * 1.7;
          ctx.fillStyle = i % 2 ? '#2f48b8' : '#ffd23c';
          ctx.fillRect(Math.round(e.x + Math.cos(a) * r), Math.round(e.y + Math.sin(a) * r + e.t * e.t * 0.05), 3, 3);
        }
        if (e.t < 6) text('BONK!', e.x, e.y - 24, { size: 8, align: 'center', color: '#ffd23c' });
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
      const colors = e.type === 'bottle' ? ['#1f8a3a', '#8cf0a0'] : e.type === 'trash' ? ['#7a7a7a', '#cfd6e0'] : ['#e02a2a', '#d8dde4'];
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
    if (b.state === 'grab' && b.holding === 'trash') {
      // ゴミ箱を頭の上に持ち上げる
      spr.draw(ctx, 'trash', b.x, b.y - 44);
    } else if (b.state === 'grab' && b.holding) {
      const base = DP.hazards.baseType(b.holding);
      const name = base === 'can' ? 'can0' : 'bottle0';
      if (DP.hazards.isPair({ type: b.holding })) {
        // 2 個セットは 2 個並べて持ち上げる
        const step = DP.hazards.pairDims(base).step;
        spr.draw(ctx, name, b.x - step / 2, b.y - 46);
        spr.draw(ctx, name, b.x + step / 2, b.y - 46);
      } else {
        spr.draw(ctx, name, b.x, b.y - 46);
      }
    }
    // 斜め投げ: 投げた直後は、腕を振り下ろした向き(右下)に風切りの線を出す
    if (b.state === 'throw' && b.thrown === 'trash' && b.timer > 14) {
      ctx.fillStyle = '#cfd6e0';
      for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(b.x + 14 + i * 6), Math.round(b.y - 52 + i * 7), 6, 2);
    }
    // 予備のビールケース(飾り)
    ctx.fillStyle = '#c87a1a';
    ctx.fillRect(b.x - 50, b.y - 16, 22, 16);
    ctx.fillStyle = '#7a4a10';
    ctx.fillRect(b.x - 50, b.y - 10, 22, 2);
    ctx.fillStyle = '#1f8a3a';
    for (let i = 0; i < 4; i++) ctx.fillRect(b.x - 48 + i * 5, b.y - 22, 3, 7);
  }

  // 4 面のクリア演出: 崩れていく鉄骨とハシゴ(地面は崩れない)。揺れている間は 1 本ずつ小刻みにずらす
  function drawCollapseTower(c, level, colors, frame) {
    const ground = level.byId[level.stage.playerStart.girder];
    drawGirder(ground, colors, frame);
    c.debris.forEach((d, i) => {
      if (d.gone) return;
      const jitter = c.phase === 'shake' || c.phase === 'clank';
      const amp = c.phase === 'shake' ? 2 : c.phase === 'clank' ? 1 : 0;
      const dx = jitter ? (((i * 7 + frame) % 3) - 1) * amp : 0;
      const dy = jitter ? (((i * 5 + frame * 3) % 3) - 1) * amp : 0;
      if (d.type === 'ladder') {
        const top = Math.round(d.y + dy);
        drawLadder({ x: d.x + dx, topY: top, bottomY: top + d.h, broken: false });
      } else {
        drawGirder({ x1: d.x1 + dx, x2: d.x2 + dx, y1: d.y + dy, y2: d.y + dy, kind: d.kind }, colors, frame);
      }
    });
  }

  // 4 面のクリア演出: ゴリラ警官(空中で拳銃を乱射 → 落下 → 衝撃)・ガール・主人公・弾丸・ハート
  function drawCollapseActors(c, frame) {
    const cx = (v) => Math.round(v);
    // 弾丸(見た目だけ。進む向きに 3 つの点を並べた黄色い短い線)
    ctx.fillStyle = '#ffe680';
    for (const b of c.bullets) {
      const n = Math.hypot(b.vx, b.vy) || 1;
      for (let i = 0; i < 3; i++) ctx.fillRect(cx(b.x - (b.vx / n) * i * 2) - 1, cx(b.y - (b.vy / n) * i * 2) - 1, 2, 2);
    }
    // ゴリラ警官
    if (!c.bossGone) {
      const shooting = c.phase === 'gun';
      const flailing = c.phase === 'fall' || c.phase === 'shake' || c.phase === 'crumble';
      spr.draw(ctx, shooting || flailing ? 'bossUp' : 'boss', c.bx, c.by + 1);
      if (shooting) {
        // 両手に拳銃(灰色)。撃った手の銃は撃った向き(8 方向)へ向け、銃口にマズルフラッシュ。
        // もう片方の手の銃は外側(横)へ向けておく。銃口の位置は DP.collapse.muzzle と同じ計算
        const k = C.collapse;
        const m = DP.collapse.muzzle(c);
        for (const side of [-1, 1]) {
          const firing = side === c.gunSide;
          const hx = c.bx + side * k.gunHandX;
          const hy = c.by - k.gunHandY;
          const dx = firing ? m.dx : side;
          const dy = firing ? m.dy : 0;
          ctx.fillStyle = '#3a3a4a';
          ctx.fillRect(cx(hx) - 2, cx(hy) - 2, 4, 5); // 握り
          ctx.fillStyle = '#6a6a7a';
          for (let i = 2; i <= k.gunReach; i += 2) ctx.fillRect(cx(hx + dx * i) - 1, cx(hy + dy * i) - 1, 3, 3); // 銃身
        }
        if (c.flash > 0) {
          const fx = cx(m.x + m.dx * 3);
          const fy = cx(m.y + m.dy * 3);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(fx - 2, fy - 2, 5, 5);
          ctx.fillStyle = '#ffd23c';
          ctx.fillRect(fx - 5, fy, 11, 1);
          ctx.fillRect(fx, fy - 5, 1, 11);
          ctx.fillStyle = '#ff7a1a';
          ctx.fillRect(cx(fx + m.dx * 6) - 1, cx(fy + m.dy * 6) - 1, 3, 3); // 撃った向きへ伸びる炎
          text('BANG!', fx + m.dx * 16, fy + m.dy * 16 - 4, { size: 8, align: 'center', color: '#ffd23c' });
        }
      }
      if (c.phase === 'impact') {
        // 落ちた衝撃: 土けむりと星
        const r = c.t * 2;
        ctx.fillStyle = '#8a7a6a';
        for (let i = 0; i < 8; i++) ctx.fillRect(cx(c.bx - r - 10 + i * 4), cx(c.by - 4 - (i % 3) * 3), 4, 4);
        for (let i = 0; i < 8; i++) ctx.fillRect(cx(c.bx + r + 10 - i * 4), cx(c.by - 4 - (i % 3) * 3), 4, 4);
        ctx.fillStyle = '#ffd23c';
        for (let i = 0; i < 3; i++) {
          const a = frame / 6 + (i * Math.PI * 2) / 3;
          ctx.fillRect(cx(c.bx + Math.cos(a) * 16), cx(c.by - 52 + Math.sin(a) * 4), 3, 3);
        }
      }
    }
    if (c.phase === 'impact' && c.t < 30) text('BOOM!', c.bx, c.by - 64, { size: 16, align: 'center', color: '#ff7a1a', shadow: '#000' });
    // ガール(崩れても空中に残り、あとで地面へ降りてくる。そろったら手を振る)
    spr.draw(ctx, c.heart ? 'girlWave' : 'girl', c.gx, c.gy + 1, { flip: true });
    // 主人公(落ちている間はジャンプの絵、歩くときは足を入れ替える)
    let name = 'punkStand';
    if (c.py < c.groundY) name = 'punkJump';
    else if (c.walking && Math.floor(c.total / 6) % 2 === 0) name = 'punkWalk';
    spr.draw(ctx, name, c.px, c.py + 1, { flip: c.facing < 0 });
    if (c.phase === 'clank') text('GAKIN!', c.px, c.py - 48, { size: 8, align: 'center', color: '#ffffff' });
    // 2 人の上のハート
    if (c.heart) spr.draw(ctx, 'heart', (c.px + c.gx) / 2, c.groundY - 52 - Math.sin(frame / 8) * 3, { scale: 3 });
  }

  function drawHeroine(h, frame, state) {
    const wave = state === 'clear' || Math.floor(frame / 24) % 2 === 0;
    spr.draw(ctx, wave ? 'girlWave' : 'girl', h.x, h.y + 1, { flip: true });
    if (state === 'playing' || state === 'ready') {
      if (Math.floor(frame / 40) % 3 !== 2) text('HELP!', h.x + 14, h.y - 44, { size: 8, color: '#ff5aa6' });
    }
  }

  // 瓶・缶 1 個(base: 'bottle' / 'can')を (x, y) に描く。spin で転がるコマを選ぶ
  function drawOneHazard(base, x, y, spin, dir) {
    if (base === 'bottle') {
      const f = Math.floor(spin / 6) % 3;
      spr.draw(ctx, 'bottle' + f, x, y + 1, { flip: dir < 0 });
    } else {
      const f = Math.floor(spin / 5) % 4;
      const name = 'can' + (dir < 0 ? 3 - f : f);
      spr.draw(ctx, name, x, y + 1);
    }
  }

  // 1 面の 2 個セットは 2 個を少し重ねて描く(横に転がる間は横並び、ハシゴを降りる間は縦に重なる)。
  // 2 個の回るコマを少しずらして、別々に転がっているように見せる
  // 1 面のゴミ箱: 角を使って転がる。1 辺(14px)進むごとに 90 度倒れる。倒れる途中は 0・30・60 度のコマで描き、
  // 角で持ち上がるぶん中心を上げる(見た目だけ。当たり判定は 14×14 のまま動かない)。ハシゴを降りる間は回さない
  function drawTrash(h) {
    const s = C.hazard.trash.width;
    const quarter = Math.floor(h.spin / s);
    const phase = (h.spin % s) / s;
    const tilt = h.state === 'ladder' ? 0 : Math.floor(phase * 3) * 30; // 0 / 30 / 60 度(ジグザグ落下の間も、進んだ距離に合わせて回す)
    const rad = (tilt * Math.PI) / 180;
    const lift = h.state === 'roll' ? (s / 2) * (Math.sin(rad) + Math.cos(rad) - 1) : 0;
    const angle = (h.state === 'ladder' ? 0 : (quarter % 4) * 90 + tilt) * (h.dir < 0 ? -1 : 1);
    ctx.save();
    ctx.translate(Math.round(h.x), Math.round(h.y + 1 - s / 2 - lift));
    ctx.rotate((angle * Math.PI) / 180);
    spr.draw(ctx, 'trash', 0, s / 2);
    ctx.restore();
  }

  function drawHazard(h) {
    if (h.type === 'trash') return drawTrash(h);
    const base = DP.hazards.baseType(h.type);
    if (!DP.hazards.isPair(h)) return drawOneHazard(base, h.x, h.y, h.spin, h.dir);
    const d = DP.hazards.pairDims(base);
    if (h.state === 'ladder') {
      drawOneHazard(base, h.x, h.y - d.stackStep, h.spin + 7, h.dir); // 上の 1 個
      drawOneHazard(base, h.x, h.y, h.spin, h.dir); // 下の 1 個
    } else {
      drawOneHazard(base, h.x - (h.dir * d.step) / 2, h.y, h.spin + 7, h.dir); // 後ろの 1 個
      drawOneHazard(base, h.x + (h.dir * d.step) / 2, h.y, h.spin, h.dir); // 前の 1 個(手前に描く)
    }
  }

  function drawHud(g) {
    text('1UP', 12, 8, { size: 10, color: '#ff4848' });
    text(String(g.score).padStart(6, '0'), 12, 22, { size: 10 });
    text('HI', 200, 8, { size: 10, color: '#ff4848' });
    text(String(g.hiScore).padStart(6, '0'), 200, 22, { size: 10 });
    // 残機(モヒカンの頭アイコン)。プレイ中の 1 人を除いた予備の数だけ描く(開始時は 2 人、最後の 1 人のときは 0 人)。
    // 表示だけの話で、内部の残機 g.lives(開始時 3)・ミス・ゲームオーバーの判定は変えない
    const spare = Math.max(0, g.lives - 1);
    for (let i = 0; i < spare; i++) {
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
    // 面間演出(1〜3 面のあと)の間は、ステージの代わりに演出の画面を描く(HUD はそのまま)
    if (g.state === 'intermission' && g.intermission) {
      drawIntermission(g.intermission, g.frame, g.timer);
      drawHud(g);
      return;
    }
    // 4 面のクリア演出でハートが出たあと(ROUND CLEAR の表示中も)は、お祝いの背景と花火
    const celebrate = !!(g.collapse && g.collapse.heart && (g.state === 'collapse' || g.state === 'clear'));
    drawBackground(g.frame, g.level && g.level.stage, celebrate);
    if (celebrate) drawFireworks(g.collapse);

    if (g.level) {
      const stage = g.level.stage;
      if (stage.amp) drawAmpStand(stage.amp, stage.girderColors); // 格子の台は鉄骨・ハシゴより奥
      // 4 面のクリア演出中(collapse)。地面に落ちた衝撃で画面全体を横に揺らす
      const col = g.state === 'collapse' ? g.collapse : null;
      if (col && col.shake) {
        ctx.save();
        ctx.translate(col.shake, 0);
      }
      drawEscapeLadders(g.level);
      drawLiftShafts(g.level, g.frame);
      if (col) {
        drawCollapseTower(col, g.level, stage.girderColors, g.frame);
      } else {
        for (const l of g.level.ladders) drawLadder(l);
        for (const gd of g.level.girders) drawGirder(gd, stage.girderColors, g.frame);
      }
      if (stage.amp) drawAmp(stage.amp, stage.girderColors, g.frame, g.level.ampFlare || 0);
      if (stage.wreckingBall) drawWreckingBall(stage.wreckingBall, g.frame);
      if (g.state === 'escape' && g.escape) {
        drawEscape(g.escape);
      } else if (col) {
        drawCollapseActors(col, g.frame);
      } else {
        // 逃走演出のあと(クリア表示中)は 2 人とも画面の外へ消えている
        if (!g.heroine.gone) drawHeroine(g.heroine, g.frame, g.state);
        if (!g.boss.gone) drawBoss(g.boss);
      }
      if (stage.pins && !col) drawPins(g.level.pins || stage.pins, g.level);
      if (g.level.prizes && !col) drawPrizes(g.level, g.frame);
      drawItems(g.items, g.frame);
      for (const h of g.hazards) drawHazard(h);
      for (const e of g.enemies) {
        if (e.type === 'cop') drawCop(e, g.frame);
        else drawSkull(e);
      }
      // 3 面のパンクニワトリ(羽ばたきの 2 枚を入れ替える。左へ飛ぶときは左右反転)
      for (const b of (g.level.birds || [])) spr.draw(ctx, `bird_${b.color}_${DP.birds.wing(b)}`, b.x, b.y, { flip: b.dir < 0 });
      if (!col) {
        drawPlayer(g.player, g.frame, g.state, g.timer, g.deathReason);
        drawHeldBat(g.player, g.frame);
      }
      drawEffects(g.effects);
      drawPopups(g);
      if (col && col.shake) ctx.restore();
    }
    drawHud(g);
    // 開発用ショートカットが有効なときだけ、画面の下に目印を出す
    // (いちばん下の床 y=540〜548 に重ならないよう、その下に出す)
    // 今の周回(R)と面(ST)、使えるキー。無敵中は右下に「INVINCIBLE」(黄と赤で点滅。消えはしない)
    if (g.devMode) {
      text('DEV R' + g.round + ' ST' + (g.stageIndex + 1) + '  C:クリア 1〜4:面 R:周回 I:無敵', 8, C.HEIGHT - 11, { size: 10, ja: true, color: '#ffd23c' });
      if (g.devInvincible) {
        const blink = Math.floor(g.frame / 15) % 2 === 0;
        text('INVINCIBLE', C.WIDTH - 8, C.HEIGHT - 11, { size: 10, align: 'right', color: blink ? '#ffd23c' : '#ff5a5a' });
      }
    }

    const cx = C.WIDTH / 2;
    if (g.state === 'title') {
      drawTitle(g);
    } else if (g.state === 'ready') {
      text(g.message, cx, 250, { size: 16, align: 'center', color: '#3cd8ff', shadow: '#000' });
      text('READY!', cx, 276, { size: 16, align: 'center', shadow: '#000' });
    } else if (g.state === 'clear') {
      // クリア演出: 「Oi! Oi! Oi!」(4 面は「ROUND CLEAR」)とハート
      const h = g.heroine;
      // ハートはガールがいるときだけ(さらわれた後は出さない)。4 面は救出した 2 人の間の上
      const roundClear = g.message === 'ROUND CLEAR';
      const hx = roundClear ? (g.player.x + h.x) / 2 : h.x + 20;
      if (!h.gone) spr.draw(ctx, 'heart', hx, h.y - (roundClear ? 52 : 36) - Math.sin(g.frame / 8) * 3, { scale: 3 });
      overlay(0.35);
      const bump = Math.floor(g.timer / 20) % 2 === 0 ? 0 : 4;
      text(g.message || 'Oi! Oi! Oi!', cx, 236 - bump, { size: roundClear ? 24 : 28, align: 'center', color: '#ffd23c', shadow: '#ff2f6e' });
      if (roundClear && g.clearBonus) text('BONUS +' + g.clearBonus, cx, 268, { size: 12, align: 'center', color: '#3cd8ff' });
      text('SCORE ' + g.score, cx, 290, { size: 12, align: 'center' });
    } else if (g.state === 'gameover') {
      overlay(0.6);
      text('GAME OVER', cx, 230, { size: 28, align: 'center', color: '#ff2f6e', shadow: '#000' });
      text('SCORE ' + g.score, cx, 280, { size: 12, align: 'center' });
      if (Math.floor(g.frame / 30) % 2 === 0) text('PRESS ENTER', cx, 316, { size: 12, align: 'center' });
    }
  }

  return { render };
};
