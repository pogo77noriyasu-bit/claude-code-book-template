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

  // 3 面: 解体用の鉄球(ステージデータの wreckingBall)。吊った点(pivot)から振り子のように左右に揺れる。
  // 位置は通算ステップ g.frame だけで決まる(描画の renderer.js も同じ position を使うので、見た目と当たり判定がずれない)。
  // 当たり判定は鉄球本体だけ(鎖・ワイヤーにはない)。本体は見た目と同じ 3 枚の矩形(12×20・20×12・16×16 の
  // 中心をそろえた、ドットの丸)で、主人公の当たり判定がどれかに重なるとミス('hazard')。
  wreckingBall: {
    // 鉄球の中心の位置(画面のドットにそろえて整数にする)
    position(wb, frame) {
      const a = wb.swing * Math.sin((2 * Math.PI * frame) / wb.period);
      return {
        x: Math.round(wb.pivotX + Math.sin(a) * wb.length),
        y: Math.round(wb.pivotY + Math.cos(a) * wb.length),
      };
    },
    // 鉄球本体の当たり判定(geometry.overlaps の形 {x(中心), y(下端), w, h} の矩形 3 枚)
    hitboxes(wb, frame) {
      const { x, y } = this.position(wb, frame);
      return [
        { x, y: y + 10, w: 12, h: 20 }, // 縦長(x-6〜x+6、y-10〜y+10)
        { x, y: y + 6, w: 20, h: 12 }, // 横長(x-10〜x+10、y-6〜y+6)
        { x, y: y + 8, w: 16, h: 16 }, // 角を埋める正方形(x-8〜x+8、y-8〜y+8)
      ];
    },
    update(ctx) {
      const g = ctx.g;
      const wb = g.level.stage.wreckingBall;
      if (!wb || g.player.state === 'dead' || g.wreckingBallOff) return; // wreckingBallOff はテスト補助だけが立てる
      const pb = DP.player.hitbox(g.player);
      if (this.hitboxes(wb, g.frame).some((b) => DP.geometry.overlaps(pb, b))) ctx.killPlayer('hazard');
    },
  },

  // 3 面: 空飛ぶパンクニワトリ(js/birds.js。ステージデータの birds.lines)。
  // ラインごとに 1 羽ずつ: 最初は line.firstSpawn ステップ後、そのあとは config.bird.interval ごとに、
  // 飛んでくる側の画面の外から出る(前の鳥がまだ画面にいるラインは、消えるまで次を出さない)。
  // 主人公が胴体の当たり判定に触れるとミス('hazard')。釘バット(config.bird.batSmash)の攻撃範囲に入ると倒れる。
  // 出現の経過と鳥はレベルに持つので、ミスして組み立て直すと最初から数え直す(鳥も消える)
  birds: {
    // 鳥の状態をレベルに用意する(最初の update と、テスト補助で鳥を出すときに呼ぶ)
    init(lv) {
      lv.birds = [];
      lv.birdTimers = lv.stage.birds.lines.map(() => 0);
      lv.birdSpawned = lv.stage.birds.lines.map(() => false);
    },
    update(ctx) {
      const g = ctx.g;
      const lv = g.level;
      const def = lv.stage.birds;
      if (!def) return;
      const c = DP.config.bird;
      if (!lv.birds) this.init(lv);
      def.lines.forEach((line, i) => {
        lv.birdTimers[i]++;
        const due = lv.birdTimers[i] >= (lv.birdSpawned[i] ? c.interval : line.firstSpawn);
        if (g.birdsEnabled && due && !lv.birds.some((b) => b.line === i)) {
          lv.birds.push(DP.birds.create(line, i));
          lv.birdTimers[i] = 0;
          lv.birdSpawned[i] = true;
        }
      });
      for (const b of lv.birds) DP.birds.update(b);
      const p = g.player;
      // 釘バットで倒す(体に当たるより先に判定する。ビール・スカルと同じ)
      const bb = c.batSmash ? DP.player.batHitbox(p) : null;
      if (bb) {
        for (const b of lv.birds) {
          if (b.dead || !DP.geometry.overlaps(bb, DP.birds.hitbox(b))) continue;
          b.dead = true;
          g.effects.push({ x: b.x, y: b.y - 8, t: 0, type: 'bird', color: b.color });
          ctx.addScore(DP.config.score.bird, b.x, b.y - 24);
          ctx.audio.play('smash');
        }
      }
      lv.birds = lv.birds.filter((b) => !b.dead);
      if (p.state === 'dead') return;
      const pb = DP.player.hitbox(p);
      if (lv.birds.some((b) => DP.geometry.overlaps(pb, DP.birds.hitbox(b)))) {
        ctx.killPlayer('hazard');
        return;
      }
      // ジャンプで跳び越えたら 100 点(1 面のビールを跳び越えたときと同じ処理 ctx.checkJumpOver。1 羽につき 1 回)。
      // その鳥のラインの床(屋上の端のがれき y152・K1 y150 も ① の床なので ±jumpOverFloor px まで)から
      // ジャンプしたときだけ。歩いて踏み外して落ちている間や、別の高さの足場で跳んだとき、
      // 立っている・リフトで運ばれているだけのときは入らない
      const tol = c.jumpOverFloor;
      for (const b of lv.birds) {
        ctx.checkJumpOver(b, (pl) => pl.jumpFromY != null && Math.abs(pl.jumpFromY - b.y) <= tol);
      }
    },
  },

  // 3 面: リフト(ステージデータの lifts)。
  //   'loop'   … 循環リフト: 板が bottom から top へ上がり続ける。top で板が消え、乗っていた主人公はその場から落ちる。
  //   'shuttle'… 往復リフト: 床 1 つが stops の高さを往復し、各階で止まる。
  // リフトの板・床は「動く鉄骨」(kind: 'lift')としてレベルの girders に入れるので、着地・天井・歩く処理は
  // ほかの鉄骨と同じものが使える。動かすのはこの仕掛けで、乗っている主人公も一緒に上下へ運ぶ。
  // 上がってくる板が主人公の足元を通り過ぎるときは、その板に乗せる(地面で待っていれば乗れる。
  // 空中から乗った場合は落ちた高さで落下のミスを判定する)。
  // 速さ・止まる時間は config.lift の周回ごとの値。setup はステージを組み立てるたびに game.js が呼ぶ。
  lifts: {
    // 周回ごとの値を選ぶ(1 周目 = [0]、3 周目以降 = 最後の値)
    byRound(list, round) {
      return list[Math.min(list.length - 1, Math.max(0, (round || 1) - 1))];
    },
    setup(level, g) {
      const c = DP.config.lift;
      level.lifts = [];
      for (const def of level.stage.lifts || []) {
        const L = { def, id: def.id, type: def.type, x1: def.x1, x2: def.x2, plates: [], serial: 0 };
        if (def.type === 'loop') {
          L.speed = this.byRound(c.loop.speed, g.round);
          L.spacing = c.loop.spacing;
          // 地面の高さに次の板が firstArrival ステップ後に来るよう、いちばん下の板の位置を決めて、上へ並べる
          let y = def.bottom - L.spacing + L.speed * (def.firstArrival || 0);
          while (y >= def.top) {
            this.addPlate(level, L, y);
            y -= L.spacing;
          }
        } else {
          L.speed = this.byRound(c.shuttle.speed, g.round);
          L.pauseFrames = this.byRound(c.shuttle.pause, g.round);
          L.stops = def.stops.slice().sort((a, b) => b - a); // 下(y が大きい)から上へ
          const st = { y: L.stops[0], dir: -1, pause: L.pauseFrames, arrivedUp: null, arrived: null, arrivedDir: 0 };
          // 決まった階に決まった向きで着くのが、決まったステップ後になるよう、動きを先に進めておく。
          //   upAt     … 真ん中の階(stops が 3 つ以上のとき)へ「上り」で着くステップ
          //   bottomAt … いちばん下の階へ(上から降りてきて)着くステップ。stops が 2 つの往復でも使える
          let sync = null;
          if (def.bottomAt !== undefined) sync = { at: def.bottomAt, y: L.stops[0], dir: 1 };
          else if (def.upAt !== undefined) sync = { at: def.upAt, y: L.stops[1], dir: -1 };
          if (sync) {
            const sim = Object.assign({}, st);
            let first = -1;
            let t = 0;
            for (; t < 20000; t++) {
              this.stepShuttle(L, sim);
              if (sim.arrived === sync.y && sim.arrivedDir === sync.dir) {
                if (first < 0) first = t + 1;
                else break;
              }
            }
            const cycle = t + 1 - first;
            const n = (((first - sync.at) % cycle) + cycle) % cycle;
            for (let i = 0; i < n; i++) this.stepShuttle(L, st);
          }
          L.state = st;
          this.addPlate(level, L, st.y);
        }
        level.lifts.push(L);
      }
    },
    // 動く鉄骨を 1 枚足す
    addPlate(level, L, y) {
      const gd = { id: L.id + (L.serial++), kind: 'lift', lift: L.id, x1: L.x1, x2: L.x2, y1: y, y2: y, index: level.girders.length };
      level.girders.push(gd);
      level.byId[gd.id] = gd;
      L.plates.push(gd);
      return gd;
    },
    removePlate(level, L, gd) {
      level.girders.splice(level.girders.indexOf(gd), 1);
      delete level.byId[gd.id];
      L.plates.splice(L.plates.indexOf(gd), 1);
    },
    // 往復リフトを 1 ステップ進める(st: { y, dir(-1 = 上 / 1 = 下), pause, arrivedUp, arrived, arrivedDir })。
    // 階に着いたステップだけ arrived(その階)と arrivedDir(着いたときの向き)が入る(上りなら arrivedUp も)
    stepShuttle(L, st) {
      st.arrivedUp = null;
      st.arrived = null;
      st.arrivedDir = 0;
      if (st.pause > 0) {
        st.pause--;
        return;
      }
      st.y += st.dir * L.speed;
      // 進む向きにある、いちばん近い階
      const ahead = L.stops.filter((y) => (st.dir < 0 ? y < st.y + L.speed : y > st.y - L.speed));
      const next = st.dir < 0 ? Math.max(...ahead) : Math.min(...ahead);
      if ((st.dir < 0 && st.y <= next) || (st.dir > 0 && st.y >= next)) {
        st.y = next;
        st.pause = L.pauseFrames;
        st.arrived = next;
        st.arrivedDir = st.dir;
        if (st.dir < 0) st.arrivedUp = next;
        // いちばん上・いちばん下の階で折り返す
        if (next === L.stops[L.stops.length - 1] || next === L.stops[0]) st.dir = -st.dir;
      }
    },
    // 板を oldY から newY へ動かし、乗っている主人公を運ぶ。上がる板が足元を通り過ぎたら乗せる
    movePlate(ctx, gd, oldY, newY) {
      gd.y1 = gd.y2 = newY;
      const p = ctx.g.player;
      if (p.state === 'ground' && p.girder === gd) {
        p.y = newY;
        return;
      }
      if (newY >= oldY || !DP.geometry.containsX(gd, p.x)) return;
      // 空中では落ちている(上向きに飛んでいない)ときだけ。ジャンプで踏み切った直後に乗せ直さない
      const falling = p.state === 'air' && p.vy >= 0;
      if ((falling || p.state === 'ground') && p.y >= newY - 0.01 && p.y <= oldY + 0.5) {
        const died = DP.player.landOn(p, gd);
        if (died) ctx.killPlayer('fall');
      }
    },
    update(ctx) {
      const level = ctx.g.level;
      for (const L of level.lifts || []) {
        if (L.type === 'loop') {
          for (const gd of L.plates.slice()) this.movePlate(ctx, gd, gd.y1, gd.y1 - L.speed);
          // 上端を越えた板は消える(乗っていた主人公はその場から落ちる)
          for (const gd of L.plates.slice()) {
            if (gd.y1 < L.def.top) {
              const p = ctx.g.player;
              if (p.state === 'ground' && p.girder === gd) DP.player.drop(p);
              this.removePlate(level, L, gd);
            }
          }
          // いちばん下の板が間隔ぶん上がったら、地面の高さに次の板を出す(地面で待つ主人公はここで乗る)
          let lowest = Math.max(...L.plates.map((x) => x.y1), -Infinity);
          while (lowest <= L.def.bottom - L.spacing) {
            const y = lowest + L.spacing;
            const gd = this.addPlate(level, L, L.def.bottom);
            this.movePlate(ctx, gd, L.def.bottom, y);
            lowest = y;
          }
        } else {
          const gd = L.plates[0];
          const old = L.state.y;
          this.stepShuttle(L, L.state);
          this.movePlate(ctx, gd, old, L.state.y);
        }
        if (ctx.g.state !== 'playing') return;
      }
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
