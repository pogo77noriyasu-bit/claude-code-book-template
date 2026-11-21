// ファイヤースカル(2 面の敵)。青白い炎をまとったドクロ。
// 状態: 'emerge'(爆音アンプの炎の中から姿を現す)→ 'leap'(左右の中段コンベアへ飛び出す)→
//       'walk'(足場を左右に移動)⇔ 'ladder'(ハシゴを上下に移動)。
//       'spawn' はテスト補助で直接出したときの「その場に現れる」演出。
//       emerge / leap / spawn の間は主人公との当たり判定がない(アンプを通り抜けるのも、この間だけ)。
//       着地した瞬間に主人公と重なっていたら、重なりが解けるまで当たり判定をなくす(landGrace)。
// 足場の端やアンプの手前では折り返すので落ちない。主人公がつかまっているハシゴには入らない。
// 触れると炎上のミス(burns)。釘バットで倒せる(500 点)。
window.DP = window.DP || {};

DP.skulls = (function () {
  const geo = DP.geometry;
  let nextId = 1;

  function cfg() {
    return DP.config.skull;
  }

  function create(level, girderId, x, opts) {
    const g = level.byId[girderId];
    return {
      id: nextId++,
      type: 'skull',
      x,
      y: geo.surfaceY(g, x),
      dir: (opts && opts.dir) || 1,
      state: opts && opts.skipSpawn ? 'walk' : 'spawn',
      t: 0, // 状態ごとの経過ステップ
      anim: 0, // ふわふわ・炎のアニメ用
      girder: g,
      ladder: null,
      vdir: 0, // ハシゴでの向き(-1 = 上 / 1 = 下)
      lastLadder: -1, // 直前に通った(判定した)ハシゴ。同じハシゴで何度も判定しない
      burns: true, // 触れると炎上のミス
      dead: false,
    };
  }

  // 爆音アンプから出現させる。landing: { girder, x, dir }(ステージデータの skulls.landings のどれか)
  function createFromAmp(level, landing) {
    const a = level.stage.amp;
    const top = a.y - DP.sprites.DATA.amp.h * DP.config.PIXEL; // アンプの上端
    const g = level.byId[landing.girder];
    return {
      id: nextId++,
      type: 'skull',
      x: a.x,
      y: top + 12, // 炎の中(アンプの上端より下)から
      dir: landing.dir,
      state: 'emerge',
      t: 0,
      anim: 0,
      girder: null,
      ladder: null,
      vdir: 0,
      lastLadder: -1,
      burns: true,
      dead: false,
      from: { x: a.x, y: top - 4 }, // 姿を現しきった位置(炎の上)
      to: { girder: g, x: landing.x, y: geo.surfaceY(g, landing.x), dir: landing.dir },
    };
  }

  // 主人公と当たらない状態か(出現・飛び出しの間と、着地のときの重なりが解けるまで)
  function isHarmless(s) {
    return s.state === 'spawn' || s.state === 'emerge' || s.state === 'leap' || !!s.landGrace;
  }

  // 主人公と重なっているか(当たり判定どうし)
  function touchesPlayer(s, player) {
    return !!player && player.state !== 'dead' && geo.overlaps(hitbox(s), DP.player.hitbox(player));
  }

  // 当たり判定(ドクロの部分だけ。炎は含めない)
  function hitbox(s) {
    const c = cfg();
    return { x: s.x, y: s.y - 1, w: c.hitWidth, h: c.hitHeight };
  }

  // 主人公がつかまっているハシゴ(なければ null)
  function playerLadder(player) {
    return player && player.state === 'ladder' ? player.ladder : null;
  }

  // この位置に来るとアンプに触れてしまうか
  function touchesAmp(level, s, x) {
    const a = level.stage.amp;
    if (!a) return false;
    const box = DP.mechanics.amp.hitbox(a);
    const me = Object.assign(hitbox(s), { x });
    return geo.overlaps(me, box);
  }

  // 主人公が同じ足場の上に立っているか
  function sameLevel(s, player) {
    return !!player && player.state === 'ground' && player.girder === s.girder;
  }

  // 通りかかったハシゴを使う確率。主人公がいる段の方向へのハシゴなら chaseChance、ほかは ladderChance
  function ladderChanceFor(s, l, player) {
    const c = cfg();
    const up = l.lower === s.girder; // 下の段にいれば上へ、上の段にいれば下へ
    const toward = !!player && (up ? player.y < s.y - 20 : player.y > s.y + 20);
    return toward ? c.chaseChance : c.ladderChance;
  }

  // 向きの考え直し(thinkInterval ごと)。新しい向き(-1 / 1)を返す。r は 0〜1 の乱数
  //   同じ段に主人公がいる: sameLevelChase の確率で主人公の方、残りは逆
  //   違う段: wanderChance の確率で気まぐれに反対、残りは今の向きのまま
  function thinkDir(s, player, r) {
    const c = cfg();
    if (sameLevel(s, player)) {
      const toward = player.x >= s.x ? 1 : -1;
      return r < c.sameLevelChase ? toward : -toward;
    }
    return r < c.wanderChance ? -s.dir : s.dir;
  }

  // 足場の上の 1 ステップ
  function walk(s, level, player, rng) {
    const c = cfg();
    const g = s.girder;
    const prevX = s.x;
    // ときどき向きを考え直す(主人公と同じ段なら、主人公の方を向きやすい)
    s.think = (s.think || 0) + 1;
    if (s.think >= c.thinkInterval) {
      s.think = 0;
      s.dir = thinkDir(s, player, rng());
    }
    let nx = s.x + s.dir * c.speed + (g.vx || 0); // コンベアの上ではベルトの速さも足す

    // 主人公がつかまっているハシゴは「壁」: そのハシゴの上下の足場では、ハシゴへ近づく向きに進まない
    const pl = playerLadder(player);
    if (pl && (pl.lower === g || pl.upper === g)) {
      const near = Math.abs(nx - pl.x) < c.playerWall;
      if (near && Math.abs(nx - pl.x) < Math.abs(s.x - pl.x)) {
        s.dir = nx > pl.x ? 1 : -1; // ハシゴから離れる向きへ
        nx = s.x + s.dir * c.speed + (g.vx || 0);
        if (Math.abs(nx - pl.x) < Math.abs(s.x - pl.x)) nx = s.x; // コンベアに押されても近づかない
      }
    }

    // 足場の端(とアンプ)の手前で折り返す。落ちない
    const minX = g.x1 + c.edgeMargin;
    const maxX = g.x2 - c.edgeMargin;
    if (nx < minX) { nx = minX; s.dir = 1; }
    if (nx > maxX) { nx = maxX; s.dir = -1; }
    if (touchesAmp(level, s, nx)) {
      nx = s.x;
      s.dir = -s.dir;
    }
    s.x = nx;
    s.y = geo.surfaceY(g, s.x);

    // 離れたハシゴは、また判定できるようにする
    if (s.lastLadder >= 0) {
      const l = level.ladders[s.lastLadder];
      if (Math.abs(s.x - l.x) > 12) s.lastLadder = -1;
    }

    // 通りかかったハシゴで、ときどき上下の足場へ移る
    for (const l of level.ladders) {
      if (l.noHazard || l.broken || l.index === s.lastLadder) continue;
      if (l.lower !== g && l.upper !== g) continue;
      const crossed = (prevX - l.x) * (s.x - l.x) <= 0;
      if (!crossed) continue;
      s.lastLadder = l.index;
      const up = l.lower === g; // 下の段にいれば上へ、上の段にいれば下へ
      // 主人公がいる段の方向へは行きやすい(ゆるく追いかける)
      const chance = ladderChanceFor(s, l, player);
      const roll = rng();
      if (roll < chance && pl !== l) {
        s.state = 'ladder';
        s.ladder = l;
        s.vdir = up ? -1 : 1;
        s.x = l.x;
        s.girder = null;
        s.t = 0;
        return;
      }
    }
  }

  // ハシゴの上の 1 ステップ
  function climb(s, player, rng) {
    const c = cfg();
    const l = s.ladder;
    // 主人公が同じハシゴにつかまったら、主人公から離れる向きへ引き返す
    if (playerLadder(player) === l) {
      const away = player.y < s.y ? 1 : -1;
      s.vdir = away;
    }
    s.y += s.vdir * c.climbSpeed;
    if (s.vdir < 0 && s.y <= l.topY) arrive(s, l.upper, l.topY, l, player, rng);
    else if (s.vdir > 0 && s.y >= l.bottomY) arrive(s, l.lower, l.bottomY, l, player, rng);
  }

  // ハシゴを降りた(登った)ところ。その段に主人公がいれば sameLevelChase で主人公の方、いなければ左右半々
  function arrive(s, g, y, l, player, rng) {
    s.state = 'walk';
    s.girder = g;
    s.y = y;
    s.ladder = null;
    s.lastLadder = l.index; // 降りた(登った)ハシゴにすぐ戻らない
    const r = rng();
    if (sameLevel(s, player)) {
      const toward = player.x >= s.x ? 1 : -1;
      s.dir = r < cfg().sameLevelChase ? toward : -toward;
    } else {
      s.dir = r < 0.5 ? -1 : 1;
    }
    s.t = 0;
    s.think = 0;
  }

  // 1 ステップ分の更新
  function update(s, level, player, rng) {
    s.t++;
    s.anim++;
    const c = cfg();
    if (s.state === 'emerge') {
      // アンプの炎の中からせり上がる
      const k = Math.min(1, s.t / c.emergeFrames);
      const start = s.from.y + 16;
      s.y = start + (s.from.y - start) * k;
      if (s.t >= c.emergeFrames) {
        s.state = 'leap';
        s.t = 0;
        s.y = s.from.y;
      }
      return;
    }
    if (s.state === 'leap') {
      // 弧を描いて着地点へ(アンプの上を越えて飛び出す)
      const k = Math.min(1, s.t / c.leapFrames);
      s.x = s.from.x + (s.to.x - s.from.x) * k;
      s.y = s.from.y + (s.to.y - s.from.y) * k - Math.sin(Math.PI * k) * c.leapHeight;
      if (s.t >= c.leapFrames) {
        s.state = 'walk';
        s.t = 0;
        s.girder = s.to.girder;
        s.x = s.to.x;
        s.y = s.to.y;
        s.dir = s.to.dir;
        // 着地した場所で主人公と重なっていたら、理不尽な即死を防ぐため、重なりが解けるまで当たらない
        if (touchesPlayer(s, player)) s.landGrace = true;
      }
      return;
    }

    if (s.state === 'spawn') {
      if (s.t >= cfg().spawnFrames) {
        s.state = 'walk';
        s.t = 0;
      }
      return;
    }
    if (s.state === 'walk') walk(s, level, player, rng);
    else if (s.state === 'ladder') climb(s, player, rng);
    // 着地のときの重なりが解けたら、通常の当たり判定に戻す(動いたあとに確かめるので、
    // このステップの主人公との当たり判定と同じ位置で判断する)
    if (s.landGrace && !touchesPlayer(s, player)) s.landGrace = false;
  }

  // 飛び出す側を選ぶ: 主人公の位置に関係なく、左右それぞれ 50% のランダム
  function pickLanding(level, landings, player, rng) {
    return landings[Math.min(landings.length - 1, Math.floor(rng() * landings.length))];
  }

  return { create, createFromAmp, update, hitbox, isHarmless, pickLanding, ladderChanceFor, thinkDir };
})();
