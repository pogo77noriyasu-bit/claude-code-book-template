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

  function drawBackground(frame) {
    ctx.fillStyle = '#05040f';
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
    for (const s of stars) {
      ctx.fillStyle = s.c;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
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

  // 鉄骨は 16px ごとの段々で描く(ドット絵らしい斜め)
  function drawGirder(g) {
    const T = C.GIRDER_THICKNESS;
    for (let x = g.x1; x < g.x2; x += 16) {
      const w = Math.min(16, g.x2 - x);
      const y = Math.round(geo.surfaceY(g, x + w / 2));
      ctx.fillStyle = '#ff2f6e';
      ctx.fillRect(x, y, w, T);
      ctx.fillStyle = '#ffa0c0';
      ctx.fillRect(x, y, w, 1);
      ctx.fillStyle = '#8a0f38';
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

  function drawPlayer(p, frame, state, timer) {
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

  // ビールが割れた破片(瓶は緑、缶は赤と銀)
  function drawEffects(effects) {
    for (const e of effects) {
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
    drawBackground(g.frame);

    if (g.level) {
      drawEscapeLadders(g.level);
      for (const l of g.level.ladders) drawLadder(l);
      for (const gd of g.level.girders) drawGirder(gd);
      if (g.state === 'escape' && g.escape) {
        drawEscape(g.escape);
      } else {
        // 逃走演出のあと(クリア表示中)は 2 人とも画面の外へ消えている
        if (!g.heroine.gone) drawHeroine(g.heroine, g.frame, g.state);
        if (!g.boss.gone) drawBoss(g.boss);
      }
      drawItems(g.items, g.frame);
      for (const h of g.hazards) drawHazard(h);
      drawPlayer(g.player, g.frame, g.state, g.timer);
      drawHeldBat(g.player, g.frame);
      drawEffects(g.effects);
      drawPopups(g);
    }
    drawHud(g);
    // 開発用ショートカットが有効なときだけ、画面の下に目印を出す
    if (g.devMode) text('DEV  C:クリア演出', 8, C.HEIGHT - 16, { size: 10, ja: true, color: '#ffd23c' });

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
