// ステージごとの仕掛け(メカニクス)
// ステージデータの mechanics: ['beerThrow', ...] に書いた名前の仕掛けを、game.js がプレイ中に毎ステップ呼ぶ。
// 主人公・釘バット・障害物の移動・当たり判定などすべての面で共通の処理は game.js 側に置き、
// 面ごとに違う仕掛け(1 面のビール投下、2 面以降のコンベアなど)だけをここに登録する。
//
// 仕掛けの形: { update(ctx) }
//   ctx = { g: ゲームの状態, rng: () => 乱数, spawnHazard(type, girderId, x), audio: DP.audio,
//           killPlayer(reason): 主人公をミスにする('burn' なら炎上の演出) }
//   仕掛けが主人公をミスにしたら、そのステップの残りの処理(障害物の移動・当たり判定)は行わない。
//   update はプレイ中の 1 ステップごとに、主人公と釘バットの処理のあと・障害物の移動の前に呼ばれる。
window.DP = window.DP || {};

DP.mechanics = {
  // 2 面: ベルトコンベア。kind: 'conveyor' の鉄骨が流れ、地上で乗っている主人公を運ぶ。
  // 実行時の状態は鉄骨(レベルの中のコピー)に持つ: convDir(今の向き)/ convTimer(逆転までの経過)/
  // vx(今のステップの速さ)/ convWarn(逆転の予告中か)/ beltOffset(ベルトの模様の位置。描画用)。
  // ステージデータの conveyor オブジェクトは書き換えない(ミスして組み立て直すと最初の向きに戻る)。
  conveyors: {
    update(ctx) {
      const g = ctx.g;
      const c = DP.config.conveyor;
      for (const gd of g.level.girders) {
        if (!gd.conveyor) continue;
        if (gd.convDir === undefined) {
          gd.convDir = gd.conveyor.dir;
          gd.convTimer = 0;
          gd.beltOffset = 0;
        }
        const every = gd.conveyor.reverseEvery;
        if (every) {
          gd.convTimer++;
          if (gd.convTimer >= every) {
            gd.convTimer = 0;
            gd.convDir = -gd.convDir;
          }
          gd.convWarn = every - gd.convTimer <= c.warnFrames;
        } else {
          gd.convWarn = false;
        }
        gd.vx = gd.convDir * c.speed;
        gd.beltOffset += gd.vx;
      }
      // 地上でコンベアに乗っている主人公を運ぶ(ハシゴの上・空中では運ばない)
      const p = g.player;
      if (p.state === 'ground' && p.girder && p.girder.vx) DP.player.carry(p, p.girder.vx);
    },
  },

  // 2 面: 爆音アンプ(ステージデータの amp)。本体とその上の炎に触れると炎上してミス。
  // まわりの足場のすき間から落ちただけなら、アンプに触れないので通常の落下ミスになる。
  amp: {
    hitbox(a) {
      const c = DP.config.amp;
      return { x: a.x, y: a.y, w: c.hitWidth, h: c.hitHeight };
    },
    // 炎の見た目の大きさ(当たり判定には使わない)。flare: 燃え上がりの残りステップ(level.ampFlare)。
    // 出現の最初の flareRise ステップで最大(flareScale 倍)まで一気に噴き上がり、スカルが現れる間は最大のまま、
    // 飛び出している間に元の大きさへ戻る。cols: 炎の柱の数(ふだん 16、最大で +flareExtraCols)
    flameScale(flare) {
      const c = DP.config.skull;
      const total = c.emergeFrames + c.leapFrames;
      if (!(flare > 0)) return { scale: 1, cols: 16, flaring: false };
      const t = total - flare; // 燃え上がってからの経過
      let k; // 0(ふだん)〜 1(最大)
      if (t < c.flareRise) k = (t + 1) / c.flareRise;
      else if (t < c.emergeFrames) k = 1;
      else k = 1 - (t - c.emergeFrames + 1) / c.leapFrames;
      k = Math.max(0, Math.min(1, k));
      return {
        scale: 1 + (c.flareScale - 1) * k,
        cols: 16 + 2 * Math.round((c.flareExtraCols / 2) * k), // 左右対称に増やす
        flaring: true,
      };
    },
    update(ctx) {
      const g = ctx.g;
      const a = g.level.stage.amp;
      if (!a || g.player.state === 'dead') return;
      if (DP.geometry.overlaps(DP.player.hitbox(g.player), this.hitbox(a))) ctx.killPlayer('burn');
    },
  },

  // 2 面: ファイヤースカルの出現と移動(js/skulls.js)。爆音アンプから出現し、ステージデータの
  // skulls.landings(左右の中段コンベア)のどちらかへ飛び出す。出現のときはアンプの炎が燃え上がる(level.ampFlare)。
  // 主人公との当たり判定と釘バットでの撃破は、すべての敵に共通の処理として game.js が行う。
  // 出現の経過はレベル(ミスすると組み立て直される)に持つので、ミスのたびに最初から数え直す。
  fireSkulls: {
    update(ctx) {
      const g = ctx.g;
      const c = DP.config.skull;
      const lv = g.level;
      if (lv.skullTimer === undefined) lv.skullTimer = 0;
      lv.skullTimer++;
      // 出現: 最初は firstSpawn、そのあとは spawnInterval ごと。同時に出られる数を超えない
      const max = Math.min(c.maxAliveCap, c.maxAlive + (g.round - 1));
      const due = lv.skullTimer >= (lv.skullSpawned ? c.spawnInterval : c.firstSpawn);
      const alive = g.enemies.filter((e) => e.type === 'skull').length;
      if (g.skullsEnabled && due && alive < max) {
        // 飛び出す側は左右 50% のランダム(着地のときに主人公と重なっていたら、重なりが解けるまで当たらない)
        const landing = DP.skulls.pickLanding(lv, lv.stage.skulls.landings, g.player, ctx.rng);
        if (landing) {
          lv.skullTimer = 0;
          g.enemies.push(DP.skulls.createFromAmp(lv, landing));
          lv.skullSpawned = true;
          lv.ampFlare = c.emergeFrames + c.leapFrames; // アンプの炎が燃え上がる(現れて飛び出し終わるまで。見た目だけ)
        }
      }
      if (lv.ampFlare > 0) lv.ampFlare--;
      for (const e of g.enemies) if (e.type === 'skull') DP.skulls.update(e, lv, g.player, ctx.rng);
    },
  },

  // 1 面: ゴリラ警官がビール瓶・缶を持ち上げて、鉄骨へ転がす。
  // (ステージデータの boss.throwX / throwInterval / canRatio を使う)
  beerThrow: {
    update(ctx) {
      const g = ctx.g;
      const bev = DP.enemies.updateBoss(g.boss, g.level, ctx.rng);
      if (bev.spawn) {
        ctx.spawnHazard(bev.spawn, g.boss.girder.id, g.boss.throwX);
        ctx.audio.play('throw');
      }
    },
  },
};
