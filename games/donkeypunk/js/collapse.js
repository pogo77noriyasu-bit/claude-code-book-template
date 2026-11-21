// 4 面のクリア演出: 8 本目の安全ピンを抜くと、やぐらが崩れてゴリラ警官が落ちる
// 段階: 'clank'(ガキン!。主人公は止まる)→ 'shake'(鉄骨がガタガタ揺れる)→ 'crumble'(崩れ落ちて完全に消える)
//      → 'gun'(空中に残ったゴリラ警官が 8 方向(上下左右・斜め)へランダムに拳銃を乱射。約 3 秒)
//      → 'fall'(ゴリラ警官が地面へ落ちる)→ 'impact'(ドッカーン!。画面が揺れ、ゴリラ警官が消える)
//      → 'reunite'(ガールが落ちてきて着地し、主人公と画面の中央に並ぶ。そろったらハート・背景が青空と教会とお花畑に変わり・
//        幸せな BGM・花火)→ 'done'(ROUND CLEAR。花火はクリア表示の間も続く: updateCelebration)
// 効果音はこのステップで鳴らす名前を c.sounds に入れ、game.js がまとめて鳴らす。
// 地面(いちばん下の床)だけは崩れずに残る(ゴリラ警官が落ちる先と、2 人が並ぶ場所)。
// ゲームの状態は変えず、自分の中の位置と段階だけを進める(得点・状態の切り替えは game.js、描画は renderer.js)。
// 弾丸は見た目だけで、当たり判定はない。演出中は操作・当たり判定・落下のミスがない(updatePlaying を呼ばないため)。
window.DP = window.DP || {};

DP.collapse = (function () {
  const cfg = () => DP.config.collapse;

  // 乱射の 8 方向(右から時計回り。dx, dy は長さ 1 にそろえる)
  const R = Math.SQRT1_2;
  const DIRS = [[1, 0], [R, R], [0, 1], [-R, R], [-1, 0], [-R, -R], [0, -1], [R, -R]];
  // 花火の色(赤・黄・水色・ピンク・緑・オレンジ・紫)
  const FIREWORK_COLORS = ['#ff3c5a', '#ffd23c', '#3cd8ff', '#ff6ad5', '#6aff7a', '#ff9a3c', '#b07aff'];

  // 演出の中だけで使う乱数(同じ順に同じ値が出るので、テストで毎回同じ演出になる。見た目はランダム)
  function rand(c) {
    c.seed = (c.seed * 16807) % 2147483647;
    return c.seed / 2147483647;
  }

  // level: 今のレベル(崩す鉄骨)/ player・boss・heroine: 演出を始めた瞬間の位置
  function create(level, player, boss, heroine) {
    const ground = level.byId[level.stage.playerStart.girder]; // 地面(崩れない)
    const groundY = ground.y1;
    return {
      phase: 'clank',
      t: 0, // 段階ごとの経過ステップ
      total: 0, // 演出全体の経過ステップ
      groundY,
      // 崩れる鉄骨(地面以外すべて)とハシゴ。それぞれ少しずつ遅れて落ち始め、画面の下へ消える。
      // type: 'girder'(x1〜x2、y は上面)/ 'ladder'(x、y は上端、h は長さ)
      debris: level.girders
        .filter((g) => g !== ground)
        .map((g, i) => ({ type: 'girder', x1: g.x1, x2: g.x2, y: g.y1, vy: 0, delay: (i * 7) % 24, kind: g.kind || null, gone: false }))
        .concat(level.ladders.map((l, i) => ({ type: 'ladder', x: l.x, y: l.topY, h: l.bottomY - l.topY, vy: 0, delay: (i * 5 + 3) % 24, gone: false }))),
      // 主人公(操作は止める。崩れたら地面へ落ちて着地する。ミスにはならない)
      px: player.x,
      py: player.y,
      pvy: 0,
      facing: player.facing || 1,
      walking: false,
      // ゴリラ警官(崩れても空中に残り、乱射が終わってから落ちる)
      bx: boss.x,
      by: boss.y,
      bvy: 0,
      gunSide: 1, // 撃った手(1 = 右 / -1 = 左。真上・真下へ撃つときは左右交互)
      gunDir: 0, // 撃った向き(DIRS の番号)
      shots: [], // 撃った向きの記録(テスト・確認用)
      flash: 0, // マズルフラッシュの残りステップ
      bullets: [], // 見た目だけの弾丸 { x, y, vx, vy }
      seed: 20240611, // 演出の中の乱数の種
      bossGone: false,
      // ガール(崩れても空中に残り、ゴリラ警官が落ちたあと地面へ降りてくる)
      gx: heroine.x,
      gy: heroine.y,
      gvy: 0,
      girlLanded: false, // ガールが地面に着地したか
      heart: false, // 2 人の上にハートを出すか(ハートが出ると、背景・BGM・花火のお祝いに切り替わる)
      fireworks: [], // 花火 { x, y, t, color, color2, n, r }(t: 打ち上がってからのステップ)
      fireworkCount: 0, // 打ち上げた花火の数
      celebrateT: 0, // お祝い(ハート)が始まってからのステップ
      shake: 0, // 画面の揺れ(px。renderer が画面全体をずらす)
      sounds: [], // このステップで鳴らす効果音(game.js が鳴らす)
      soundGap: 0, // 鉄骨の衝撃音を続けて鳴らしすぎないための待ち
    };
  }

  function next(c, phase) {
    c.phase = phase;
    c.t = 0;
  }

  // 主人公とガールが並ぶ位置(画面の中央。主人公が左、ガールが右)
  function meetX() {
    const mid = DP.config.WIDTH / 2;
    return { player: mid - cfg().meetGap / 2, girl: mid + cfg().meetGap / 2 };
  }

  // 地面より上にいる人を、重力で地面まで落とす(着地したら true)
  function fallTo(obj, yKey, vyKey, groundY, gravity, maxFall) {
    if (obj[yKey] >= groundY) {
      obj[yKey] = groundY;
      obj[vyKey] = 0;
      return true;
    }
    obj[vyKey] = Math.min(obj[vyKey] + gravity, maxFall);
    obj[yKey] = Math.min(groundY, obj[yKey] + obj[vyKey]);
    return obj[yKey] >= groundY;
  }

  // 1 発撃つ: 8 方向からランダムに選ぶ(直前と同じ向きは避ける)。右向きは右手、左向きは左手、真上・真下は左右交互
  function shoot(c, k) {
    let d = Math.floor(rand(c) * DIRS.length);
    if (c.shots.length && d === c.gunDir) d = (d + 1 + Math.floor(rand(c) * (DIRS.length - 1))) % DIRS.length;
    const [dx, dy] = DIRS[d];
    c.gunDir = d;
    c.gunSide = dx > 0.1 ? 1 : dx < -0.1 ? -1 : -c.gunSide;
    c.shots.push(d);
    c.flash = k.flashFrames;
    const m = muzzle(c);
    c.bullets.push({ x: m.x, y: m.y, vx: dx * k.bulletSpeed, vy: dy * k.bulletSpeed });
    c.sounds.push('gun');
  }

  // 銃口の位置(撃った手の肩 gunHand から、撃った向きへ銃の長さ gunReach だけ先)。描画とそろえる
  function muzzle(c) {
    const k = cfg();
    const [dx, dy] = DIRS[c.gunDir];
    const hx = c.bx + c.gunSide * k.gunHandX;
    const hy = c.by - k.gunHandY;
    return { x: hx + dx * k.gunReach, y: hy + dy * k.gunReach, hx, hy, dx, dy };
  }

  // 花火を 1 発打ち上げる(お祝いの間、fireworkInterval ごと)。位置・色は演出の中の乱数で決める
  function launchFirework(c) {
    const W = DP.config.WIDTH;
    const i = c.fireworkCount++;
    c.fireworks.push({
      x: 50 + rand(c) * (W - 100),
      y: 70 + rand(c) * 170,
      t: 0,
      color: FIREWORK_COLORS[i % FIREWORK_COLORS.length],
      color2: FIREWORK_COLORS[(i * 3 + 2) % FIREWORK_COLORS.length],
      n: 12 + Math.floor(rand(c) * 6), // 火花の数
      r: 36 + rand(c) * 22, // 広がる大きさ
    });
    c.sounds.push('firework');
  }

  // お祝い(ハートのあと)の花火を 1 ステップ進める。ROUND CLEAR の表示中も game.js が呼んで続ける
  function updateCelebration(c) {
    if (!c.heart) return;
    const k = cfg();
    c.celebrateT++;
    for (const f of c.fireworks) f.t++;
    c.fireworks = c.fireworks.filter((f) => f.t < k.fireworkLife);
    if ((c.celebrateT - 1) % k.fireworkInterval === 0) launchFirework(c);
  }

  // 1 ステップ進める。終わったら true
  function update(c) {
    const k = cfg();
    c.t++;
    c.total++;
    c.sounds = [];
    c.shake = 0;
    if (c.soundGap > 0) c.soundGap--;
    if (c.flash > 0) c.flash--;
    for (const b of c.bullets) {
      b.x += b.vx;
      b.y += b.vy;
    }
    c.bullets = c.bullets.filter((b) => b.x > -20 && b.x < DP.config.WIDTH + 20 && b.y > -20 && b.y < DP.config.HEIGHT + 20);
    updateCelebration(c);

    switch (c.phase) {
      case 'clank':
        // 8 本目を抜いた瞬間の「ガキン!」(音は演出を始めた game.js の startCollapse が同じステップで鳴らす)。主人公はその場で止まる
        if (c.t >= k.clankFrames) next(c, 'shake');
        break;
      case 'shake':
        // 鉄骨全体がガタガタ揺れる(揺れは renderer が debris を描くときにずらす)。
        // 最初に「ガラガラガッシャーン!」、揺れている間は rattleInterval ごとに金属がきしむ「ガタガタ」
        if (c.t === 1) c.sounds.push('collapse');
        else if (c.t % k.rattleInterval === 0) c.sounds.push('rattle');
        if (c.t >= k.shakeFrames) next(c, 'crumble');
        break;
      case 'crumble': {
        // 鉄骨が少しずつ遅れて崩れ落ち、画面の下へ消える。主人公は地面まで落ちて着地する。
        // 鉄骨が外れて落ち始めるときに「ギギーッ」(creak)、地面の高さにぶつかったときに「ガシャン!」(debrisHit)。
        // 同じステップに重なったり続きすぎたりしないよう、ぶつかる音は debrisSoundGap ステップあけて鳴らす
        let creak = false;
        let hit = false;
        for (const d of c.debris) {
          if (d.gone || c.t < d.delay) continue;
          if (c.t === d.delay && d.type === 'girder') creak = true;
          d.vy = Math.min(d.vy + k.gravity, k.maxFall);
          d.y += d.vy;
          if (!d.hit && d.y >= c.groundY) {
            d.hit = true;
            hit = true;
          }
          if (d.y > DP.config.HEIGHT + 20) d.gone = true;
        }
        if (creak) c.sounds.push('creak');
        if (hit && c.soundGap === 0) {
          c.sounds.push('debrisHit');
          c.soundGap = k.debrisSoundGap;
        }
        fallTo(c, 'py', 'pvy', c.groundY, k.gravity, k.maxFall);
        if (c.debris.every((d) => d.gone) && c.py >= c.groundY) next(c, 'gun');
        break;
      }
      case 'gun':
        // ゴリラ警官が空中に残ったまま、8 方向へランダムに拳銃を撃ちまくる(約 3 秒)。弾は見た目だけ
        if ((c.t - 1) % k.shotInterval === 0) shoot(c, k);
        if (c.t >= k.gunFrames) next(c, 'fall');
        break;
      case 'fall':
        // 乱射が終わったら真下へ落ちる。地面に着いた瞬間に「ドッカーン!」
        if (fallTo(c, 'by', 'bvy', c.groundY, k.gravity, k.maxFall)) {
          c.sounds.push('boom');
          next(c, 'impact');
        }
        break;
      case 'impact':
        // 画面を短く揺らす(だんだん小さく)。揺れがおさまったらゴリラ警官は消える
        c.shake = c.t < k.impactShakeFrames ? Math.round(k.impactShake * (1 - c.t / k.impactShakeFrames)) * (c.t % 2 ? 1 : -1) : 0;
        if (c.t >= k.impactShakeFrames) c.bossGone = true;
        if (c.t >= k.impactFrames) next(c, 'reunite');
        break;
      case 'reunite': {
        // ガールが地面へ降りてきて、主人公は画面の中央へ歩いて並ぶ。2 人がそろったらハート。
        // 落ち始めに「ヒューン」(girlFall)、地面に着いた瞬間に「ポン」(girlLand)
        const m = meetX();
        if (c.t === 1) c.sounds.push('girlFall');
        const girlDown = fallTo(c, 'gy', 'gvy', c.groundY, k.girlGravity, k.girlMaxFall);
        if (girlDown && !c.girlLanded) {
          c.girlLanded = true;
          c.sounds.push('girlLand');
        }
        if (Math.abs(c.gx - m.girl) > 0.5) c.gx += Math.sign(m.girl - c.gx) * Math.min(k.girlDrift, Math.abs(m.girl - c.gx));
        const dx = m.player - c.px;
        c.walking = Math.abs(dx) > 0.5;
        if (c.walking) {
          c.facing = Math.sign(dx);
          c.px += Math.sign(dx) * Math.min(DP.config.player.walkSpeed, Math.abs(dx));
        } else {
          c.facing = 1; // ガールの方を向く
        }
        // (念のため、そろわないまま長く続いたら打ち切ってハートを出す。ふつうは約 2 秒でそろう)
        const together = (girlDown && !c.walking && Math.abs(c.gx - m.girl) <= 0.5) || c.t >= 600;
        if (together && !c.heart) {
          // ハート → お祝い(背景が青空・教会・お花畑に変わり、幸せな BGM(game.js の updateMusic)と花火が始まる)
          c.heart = true;
          c.heartAt = c.t;
          c.sounds.push('heart');
          updateCelebration(c); // このステップで 1 発目の花火
        }
        if (c.heart && c.t - c.heartAt >= k.heartFrames) {
          next(c, 'done');
          return true;
        }
        break;
      }
      case 'done':
        return true;
    }
    return false;
  }

  return { create, update, updateCelebration, meetX, muzzle, DIRS };
})();
