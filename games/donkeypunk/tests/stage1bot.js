// 1 面を「無敵なし」で自動プレイする補助(周回難易度の改修で、どの周回もクリアできることを確かめる)。
// キー入力はゲームと同じ入力処理(js/input.js)に keydown / keyup を送る。
// 最短ルート(ハシゴ 110 → 72 → 184 → 92 → 216 → 288 → ガール)を進みながら、毎ステップ、
// 主人公の段の瓶・缶(転がっている・ハシゴを降りてくる・上の段の端から落ちてくる)の動きを先まで予測して、
// 「そのまま進む / 進みながら跳ぶ / 止まる / その場で跳ぶ / 下がる」のうち当たらないものを選ぶ。
// ハシゴは、降りてくる物がないときだけ登り始める。ハシゴの途中(頭が上の段の面より下)は、上の段を転がる物は頭上を通り、
// そのハシゴには瓶・缶が降りてこないので安全。ここで待って、上がってから次のハシゴまで歩く道のりが空いていると予測できたら上がる。
// 先の乱数(この先ハシゴを降りるか)は分からないので、ときどきミスする。残機があるかぎり続ける
async function playStage1(page, { round, seed, maxSteps = 9000 }) {
  return page.evaluate(([round, seed, maxSteps]) => {
    const d = window.__dp;
    const DP = window.DP;
    const C = DP.config;
    const geo = DP.geometry;
    const G = () => d.gameForRender().data;
    d.setManual(true);
    d.setSeed(seed);
    d.startStage(0, round);
    const keys = new Set();
    const key = (k, down) => {
      if (down === keys.has(k)) return;
      if (down) keys.add(k); else keys.delete(k);
      document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, bubbles: true }));
    };
    const release = () => { for (const k of [...keys]) key(k, false); };
    // ジャンプの高さ(踏み切りから 1 ステップごと。player.js と同じ計算)
    const HS = [];
    { let y = 0, vy = -C.player.jumpVelocity; for (;;) { vy = Math.min(vy + C.player.gravity, C.player.maxFallSpeed); y += vy; if (y >= 0) { HS.push(0); break; } HS.push(-y); } }
    const HORIZON = 60; // 歩いている途中の判断で先を読む長さ(ハシゴで待つ判断 pathDanger は道のりの長さぶん読む)
    const FAR = 240; // 上の段の端から落ちてくる物を予測に入れる長さ
    // [ハシゴの x, 登るか]。最後はガールの x まで歩くだけ
    const ROUTE = [[110, true], [72, true], [184, true], [92, true], [216, true], [288, true], [210, false]];

    const speedOf = (h) => C.hazard[DP.hazards.baseType(h.type)].speed * h.speedMul;
    // (x, y) の真下で最初に着地する鉄骨
    function girderBelow(level, x, y) {
      let best = null;
      for (const q of level.girders) {
        if (!geo.containsX(q, x)) continue;
        const qy = geo.surfaceY(q, x);
        if (qy > y + 1 && (!best || qy < geo.surfaceY(best, x))) best = q;
      }
      return best;
    }
    // girder の上で主人公に当たりうる物の予測: { x, vx, w, h, from(何ステップ後から), to(何ステップ後まで) }
    function obstacles(g, girder) {
      const out = [];
      const level = g.level;
      for (const h of g.hazards) {
        const box = DP.hazards.hitbox(h);
        const v = speedOf(h);
        const roll = (girder.downhill || 1) * v;
        if (h.state === 'roll' && h.girder === girder) out.push({ x: h.x, vx: h.dir * v, w: box.w, h: box.h, from: 0 });
        // ハシゴをこの段へ降りてくる物: 降りている間はハシゴの x に縦に、着いたらこの段の低い側へ転がる
        if (h.state === 'ladder' && h.ladder.lower === girder) {
          const t = Math.max(0, (h.ladder.bottomY - h.y) / (C.hazard.ladderSpeed * h.speedMul));
          out.push({ x: h.ladder.x, vx: 0, w: box.w + 6, h: 60, from: 0, to: t });
          out.push({ x: h.ladder.x, vx: roll, w: box.w, h: Math.max(box.h, 12), from: t });
        }
        // 落ちている物
        if (h.state === 'fall') {
          const lg = girderBelow(level, h.x, h.y);
          if (lg === girder) {
            const t = Math.max(0, Math.sqrt(Math.max(0, 2 * (geo.surfaceY(girder, h.x) - h.y) / C.hazard.gravity)));
            out.push({ x: h.x, vx: h.vx, w: box.w + 10, h: 40, from: 0, to: t + 2 });
            out.push({ x: h.x + h.vx * t, vx: roll, w: box.w + 6, h: box.h + 6, from: t });
          }
        }
        // ジグザグ落下のゴミ箱: ゲームと同じ規則(まっすぐ斜め下・鉄骨と画面の端で左右反転)で先まで動かし、
        // この段の上面を横切る時刻と位置を求める。横切る前の、主人公の体の高さを通る間を障害物とみなす
        if (h.state === 'zigzag') {
          let x = h.x, y = h.y, vx = h.vx, vy = h.vy;
          const passed = new Set(h.passed);
          const half = box.w / 2;
          for (let t = 1; t <= FAR; t++) {
            const px = x, py = y;
            x += vx; y += vy;
            if (x < half && vx < 0) { x = 2 * half - x; vx = -vx; } else if (x > 480 - half && vx > 0) { x = 2 * (480 - half) - x; vx = -vx; }
            let crossedMine = false;
            for (const q of level.girders) {
              if (q.kind === 'lift' || passed.has(q.id) || !geo.containsX(q, x)) continue;
              if (py <= geo.surfaceY(q, px) && y > geo.surfaceY(q, x)) {
                // 最初の鉄骨では、最初の 1 区間の角度から通常の角度に切り替わる(hazards.js と同じ)
                if (passed.size === 0 && h.firstAngle !== h.angle) { const r = (h.angle * Math.PI) / 180; vx = (vx > 0 ? -1 : 1) * h.zigSpeed * Math.cos(r); vy = h.zigSpeed * Math.sin(r); } else vx = -vx;
                passed.add(q.id);
                if (q === girder) crossedMine = true;
                break;
              }
            }
            if (crossedMine) {
              const band = (22 + box.h + 6) / vy; // 体の高さ + ゴミ箱の高さを通り抜ける時間
              out.push({ x, vx: 0, w: box.w + Math.abs(h.vx) * band + 8, h: 60, from: Math.max(0, t - band - 2), to: t + 2 });
              break;
            }
            if (y > 600) break;
          }
        }
        // 上の段を転がっていて、端から落ちてこの段に来る物
        if (h.state === 'roll' && h.girder !== girder) {
          const u = h.girder;
          const endX = h.dir > 0 ? u.x2 : u.x1;
          const endY = geo.surfaceY(u, endX);
          const fallT = Math.sqrt((2 * 70) / C.hazard.gravity);
          const landX = Math.max(1, Math.min(479, endX + h.dir * v * 0.6 * fallT));
          if (girderBelow(level, landX, endY) === girder) {
            const t = Math.abs(endX - h.x) / v;
            if (t < FAR) {
              out.push({ x: landX, vx: 0, w: box.w + 30, h: 60, from: t, to: t + fallT + 4 });
              out.push({ x: landX, vx: roll, w: box.w + 6, h: box.h + 6, from: t + fallT });
            }
          }
        }
      }
      return out;
    }
    // ジグザグ落下のゴミ箱が、horizon ステップの間に、x ± 14・高さ yTop〜yBottom の範囲(ハシゴを登る主人公の通り道)を通るか
    function trashThreat(g, x, yTop, yBottom, horizon) {
      for (const h of g.hazards) {
        if (h.state !== 'zigzag') continue;
        let hx = h.x, hy = h.y, vx = h.vx, vy = h.vy;
        const passed = new Set(h.passed);
        const half = 7;
        for (let t = 1; t <= horizon; t++) {
          const px = hx, py = hy;
          hx += vx; hy += vy;
          if (hx < half && vx < 0) { hx = 2 * half - hx; vx = -vx; } else if (hx > 480 - half && vx > 0) { hx = 2 * (480 - half) - hx; vx = -vx; }
          for (const q of g.level.girders) {
            if (q.kind === 'lift' || passed.has(q.id) || !geo.containsX(q, hx)) continue;
            if (py <= geo.surfaceY(q, px) && hy > geo.surfaceY(q, hx)) {
              if (passed.size === 0 && h.firstAngle !== h.angle) { const r = (h.angle * Math.PI) / 180; vx = (vx > 0 ? -1 : 1) * h.zigSpeed * Math.cos(r); vy = h.zigSpeed * Math.sin(r); } else vx = -vx;
              passed.add(q.id);
              break;
            }
          }
          if (Math.abs(hx - x) < 14 + 6 && hy > yTop - 4 && hy - 14 < yBottom + 4) return true;
          if (hy > yBottom + 40) break;
        }
      }
      return false;
    }
    // 主人公が x から横の速さ vx で(jump なら跳んで)進んだとき、HORIZON ステップの間に予測した物に当たるか。
    // stopAt を過ぎたら止まる(歩く場合)。lo / hi は動ける範囲
    function danger(obs, x, vx, jump, stopAt, lo, hi) {
      let px = x;
      for (let t = 1; t <= HORIZON; t++) {
        const inAir = jump && t <= HS.length;
        const hgt = inAir ? HS[t - 1] : 0;
        let mv = jump ? (inAir ? vx : 0) : vx;
        if (!jump && stopAt !== null && ((mv > 0 && px >= stopAt) || (mv < 0 && px <= stopAt))) mv = 0;
        px = Math.max(lo, Math.min(hi, px + mv));
        for (const o of obs) {
          if (t < o.from || (o.to !== undefined && t > o.to)) continue;
          const ox = o.x + o.vx * (t - o.from);
          if (Math.abs(px - ox) * 2 < 12 + o.w + 6 && hgt < o.h + 3) return true;
        }
      }
      return false;
    }
    // ハシゴの途中で待っている主人公が、t0 ステップ後に上の段 x0 に立ち、tx まで歩いて(着いたら 20 ステップ立つ)いく間に当たるか
    // tv: 頭が上の段の面を越えて当たりうるようになるステップ(それより前はハシゴの途中で安全)
    function pathDanger(obs, x0, tx, t0, tv) {
      const v = tx > x0 ? C.player.walkSpeed : -C.player.walkSpeed;
      const T = t0 + Math.abs(tx - x0) / C.player.walkSpeed + 20;
      for (let t = Math.max(0, Math.floor(tv)); t <= T; t++) {
        const px = t <= t0 ? x0 : (v > 0 ? Math.min(tx, x0 + v * (t - t0)) : Math.max(tx, x0 + v * (t - t0)));
        for (const o of obs) {
          if (t < o.from || (o.to !== undefined && t > o.to)) continue;
          const ox = o.x + o.vx * (t - o.from);
          if (Math.abs(px - ox) * 2 < 12 + o.w + 8) return true;
        }
      }
      return false;
    }
    let idx = 0;
    let deaths = 0;
    let steps = 0;
    let wasDead = false;
    const log = [];
    for (; steps < maxSteps; steps++) {
      const g = G();
      if (g.state === 'escape' || g.state === 'clear' || g.state === 'gameover') break;
      if (g.state !== 'playing') {
        release();
        if (g.state === 'dying' && !wasDead) {
          deaths++;
          wasDead = true;
          const pp = g.player;
          const pb = DP.hazards.playerHitbox(pp);
          const hit = g.hazards.filter((h) => geo.overlaps(pb, DP.hazards.hitbox(h)));
          log.push({ t: steps, girder: pp.girder ? pp.girder.id : null, ladder: pp.ladder ? pp.ladder.x : null, x: Math.round(pp.x), y: Math.round(pp.y), hit: hit.map((h) => h.type + ':' + h.state + ':' + (h.girder ? h.girder.id : '-') + ':' + Math.round(h.x) + ',' + Math.round(h.y)) });
        }
        if (g.state === 'ready') { idx = 0; wasDead = false; }
        d.step(1);
        continue;
      }
      const p = g.player;
      const [tx, climb] = ROUTE[Math.min(idx, ROUTE.length - 1)];
      if (p.state === 'air') { release(); d.step(1); continue; }
      if (p.state === 'ladder') {
        // 登っている途中: 頭が上の段の面より下(足元が上面の 24px 以上下)にいる間に、上の段が危なければ待つ
        const l = p.ladder;
        const headroom = p.y - l.topY;
        let wait = false;
        if (headroom >= 24 && headroom <= 34) {
          // 上がってから次の目的地(次のハシゴ・ガール)まで歩く道のりが空いているか
          const next = ROUTE[Math.min(idx + 1, ROUTE.length - 1)][0];
          const obs = obstacles(g, l.upper);
          wait = pathDanger(obs, l.x, next, headroom / C.player.climbSpeed, (headroom - 24) / C.player.climbSpeed);
        }
        // 登っている途中でジグザグ落下のゴミ箱が来そうなら、上か下の、来ない方へ逃げる(登る前には投げられていなかった物)
        let down = false;
        if (trashThreat(g, l.x, p.y - 22, p.y, 25)) {
          const upSafe = !trashThreat(g, l.x, p.y - 22 - 28, p.y - 28, 25);
          const downSafe = p.y < l.bottomY - 4 && !trashThreat(g, l.x, p.y - 22 + 28, p.y + 28, 25);
          if (!upSafe && downSafe) down = true;
        }
        key('ArrowDown', down);
        key('ArrowUp', !wait && !down);
        d.step(1);
        if (G().player.state === 'ground' && G().player.girder === l.upper) { release(); idx++; }
        continue;
      }
      // 地上: tx へ向かう(着いたら、登るならハシゴを登り始める)
      const obs = obstacles(g, p.girder);
      const near = Math.abs(p.x - tx) <= 1;
      if (near && climb) {
        // そのハシゴを降りてくる物がなく、ここに立っていても当たらなければ登り始める
        const l = g.level.ladders.find((q) => !q.broken && q.lower === p.girder && Math.abs(q.x - tx) <= 6);
        // 登る間(上の段に着いて少しあとまで)に、ジグザグ落下のゴミ箱がハシゴの上を通るなら待つ
        const climbT = (l.bottomY - l.topY) / C.player.climbSpeed + 20;
        const busy = g.hazards.some((h) => h.state === 'ladder' && h.ladder === l) || trashThreat(g, l.x, l.topY - 26, l.bottomY, climbT);
        if (!busy && !danger(obs, p.x, 0, false, null, 0, 480)) {
          p.x = tx;
          release();
          key('ArrowUp', true);
          d.step(1);
          continue;
        }
      }
      if (near && !climb) { release(); d.step(1); continue; }
      const dir = near ? 0 : p.x < tx ? 1 : -1;
      const lo = Math.max(8, p.girder.x1 + 8);
      const hi = Math.min(472, p.girder.x2 - 8);
      const kDir = dir >= 0 ? 'ArrowRight' : 'ArrowLeft';
      const v = dir * C.player.walkSpeed;
      const choose = () => {
        if (dir !== 0 && !danger(obs, p.x, v, false, tx, lo, hi)) return 'go';
        if (dir !== 0 && !danger(obs, p.x, v, true, null, lo, hi)) return 'goJump';
        if (!danger(obs, p.x, 0, false, null, lo, hi)) return 'stay';
        if (!danger(obs, p.x, 0, true, null, lo, hi)) return 'stayJump';
        if (!danger(obs, p.x, -C.player.walkSpeed, false, null, lo, hi)) return 'backL';
        if (!danger(obs, p.x, C.player.walkSpeed, false, null, lo, hi)) return 'backR';
        if (!danger(obs, p.x, -C.player.walkSpeed, true, null, lo, hi)) return 'jumpL';
        if (!danger(obs, p.x, C.player.walkSpeed, true, null, lo, hi)) return 'jumpR';
        return dir !== 0 ? 'goJump' : 'stayJump';
      };
      const c = choose();
      release();
      if (c === 'go') key(kDir, true);
      else if (c === 'goJump') { key(kDir, true); key(' ', true); }
      else if (c === 'stayJump') key(' ', true);
      else if (c === 'backL') key('ArrowLeft', true);
      else if (c === 'backR') key('ArrowRight', true);
      else if (c === 'jumpL') { key('ArrowLeft', true); key(' ', true); }
      else if (c === 'jumpR') { key('ArrowRight', true); key(' ', true); }
      d.step(1);
      key(' ', false);
      // ハシゴの位置ちょうどで止める(つかめる範囲は ±6px)
      const np = G().player;
      if (np.state === 'ground' && Math.abs(np.x - tx) <= 1.5) np.x = tx;
    }
    release();
    const g = G();
    return { state: g.state, deaths, steps, lives: g.lives, log };
  }, [round, seed, maxSteps]);
}

module.exports = { playStage1 };
