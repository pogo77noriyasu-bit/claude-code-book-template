// ステージごとの仕掛け(メカニクス)
// ステージデータの mechanics: ['beerThrow', ...] に書いた名前の仕掛けを、game.js がプレイ中に毎ステップ呼ぶ。
// 主人公・釘バット・障害物の移動・当たり判定などすべての面で共通の処理は game.js 側に置き、
// 面ごとに違う仕掛け(1 面のビール投下、2 面以降のコンベアなど)だけをここに登録する。
//
// 仕掛けの形: { update(ctx) }
//   ctx = { g: ゲームの状態, rng: () => 乱数, spawnHazard(type, girderId, x), audio: DP.audio,
//           killPlayer(reason): 主人公をミスにする('burn' なら炎上の演出)。本当にミスになったら true(DEV の無敵中は false) }
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
        if (ctx.killPlayer('hazard')) return; // DEV の無敵中はミスにならないので、跳び越えの得点の判定へ進む
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

  // 4 面: 巨大な安全ピン(ステージデータの pins)を抜く。
  // 主人公の中心がピンの x±halfWidth に入り、足元が床の上面から touchHeight 以内にあれば「触れた」とし、
  // そのあと中心が x±halfWidth の外へ出た瞬間に抜く(歩いて通り抜けても、真上を跳び越えても抜ける。
  // その場で真上に跳んでも抜けないので、足元のピンを抜いて穴に落ちることはない)。
  // 抜くとピンの x±halfWidth の床が消え、床の鉄骨が左右 2 枚に分かれる(穴の左は元の鉄骨の id のまま、右は新しい id)。
  // ハシゴ・主人公・ゴリラが元の鉄骨を参照していて、それが穴の右側になったら、右の鉄骨に付け替える(ハシゴは切れない)。
  // 得点 score.pin と得点表示・効果音 'pin'・ピンが回りながら飛び出す演出(effects の type: 'pin')。
  // 状態(level.pins)はレベルに持つ。ミスして組み立て直すときは、game.js が carry() で抜いたピンを受け取り、
  // 組み立て直したあとに restore() で同じ順番に抜き直す(ピンも穴も残る。得点は入れ直さない)。
  // 新しいゲーム・次の周回で 4 面に入ったときは受け渡さないので、8 本とも元に戻る
  pins: {
    setup(level) {
      level.pins = (level.stage.pins || []).map((p) => ({ id: p.id, girder: p.girder, x: p.x, touched: false, pulled: false }));
      // 抜いた順番(ピンの id)。穴の右側の鉄骨の id は抜く順番で変わるので、抜き直すときは同じ順番にする
      level.pinOrder = [];
    },
    // ミスで組み立て直す前に呼ぶ: 抜いたピンの id を抜いた順に返す(game.js の setupStage へ渡す)
    carry(level) {
      return level.pinOrder ? level.pinOrder.slice() : [];
    },
    // 組み立て直したあとに呼ぶ: carry() の id を同じ順番で抜き直す。得点・効果音・演出は出さない。
    // refs: 穴の右側に来たら鉄骨を付け替えるもの(主人公・ゴリラ)。ゴリラを作ったあとに呼ぶこと
    restore(level, ids, refs) {
      if (!level.pins) this.setup(level);
      for (const id of ids || []) {
        const pin = level.pins.find((q) => q.id === id);
        if (pin) this.pull(level, pin, refs);
      }
    },
    // ピンが留めている床の、今の鉄骨(分かれたあとは、ピンの x を含む方)
    floorAt(level, pin) {
      return level.girders.find((g) => (g.floor || g.id) === pin.girder && g.kind !== 'lift' && DP.geometry.containsX(g, pin.x));
    },
    // ピンを抜いて、その場所の床を消す(テスト補助からも呼ぶ)。抜けたら true
    pull(level, pin, refs) {
      if (pin.pulled) return false;
      const h = DP.config.pin.halfWidth;
      const g = this.floorAt(level, pin);
      pin.pulled = true;
      if (!level.pinOrder) level.pinOrder = [];
      level.pinOrder.push(pin.id);
      if (!g) return true;
      const right = Object.assign({}, g, { id: g.id + '@' + (pin.x + h), floor: g.floor || g.id, x1: pin.x + h, index: level.girders.length });
      g.floor = g.floor || g.id;
      g.x2 = pin.x - h;
      level.girders.push(right);
      level.byId[right.id] = right;
      // 元の鉄骨を参照していて、穴の右側に来たものを付け替える
      const fix = (girder, x) => (girder === g && x > g.x2 ? right : girder);
      for (const l of level.ladders) {
        l.lower = fix(l.lower, l.x);
        l.upper = fix(l.upper, l.x);
      }
      for (const r of refs || []) if (r && r.girder) r.girder = fix(r.girder, r.x);
      return true;
    },
    update(ctx) {
      const g = ctx.g;
      const level = g.level;
      if (!level.pins) this.setup(level);
      const p = g.player;
      if (p.state === 'dead' || p.state === 'ladder') return;
      const c = DP.config.pin;
      for (const pin of level.pins) {
        if (pin.pulled) continue;
        const floorY = DP.geometry.surfaceY(level.byId[pin.girder], pin.x);
        const inside = Math.abs(p.x - pin.x) <= c.halfWidth;
        const near = p.y <= floorY + 0.5 && p.y >= floorY - c.touchHeight;
        if (inside && near) {
          pin.touched = true;
        } else if (pin.touched && !inside) {
          // 敵(怒ったポリスマン)も、穴の右側に来たら右の鉄骨に付け替える。足元に穴が開いた敵は下の段へ落ちる
          this.pull(level, pin, [p, g.boss].concat(g.enemies));
          if (DP.cops) DP.cops.dropIntoHole(g.enemies, level, pin);
          ctx.addScore(DP.config.score.pin, pin.x, floorY - 30);
          ctx.audio.play('pin');
          g.effects.push({ x: pin.x, y: floorY - 8, t: 0, type: 'pin', dir: p.x > pin.x ? -1 : 1 });
          // 8 本すべて抜いたら、クリア演出(鉄骨崩壊 → 拳銃乱射 → ゴリラ落下 → ガール救出)へ。
          // ここで状態が 'collapse' に変わるので、updatePlaying はこのあとの当たり判定をせずに終わる
          if (level.pins.every((q) => q.pulled)) {
            ctx.startCollapse();
            return;
          }
        } else if (!near) {
          // 触れたあと、横に出ずに上下へ離れた(ここでは起きないが念のため)
          pin.touched = false;
        }
      }
    },
  },

  // 4 面: 怒ったポリスマン(js/cops.js)の出現と動き。ステージデータの cops.spawns(出現地点)から交互に出す。
  // 最初はプレイ開始から firstSpawn、そのあとは spawnInterval ごとに 1 人ずつ、同時に maxAlive 人まで(周回で変わる)。
  // 出現地点が穴の中・穴の端に近すぎるとき、主人公が同じ段の spawnAvoid 以内にいるときは、もう一方の地点から出す。
  // 出現の経過はレベルに持つので、ミスすると数え直し(ピンと穴は残る)。足元のピンを抜かれて落ちた敵は、気絶すると 300 点
  cops: {
    // 出現地点 sp に今出せるなら、その鉄骨(穴で分かれたあとは x を含む方)を返す。出せなければ null
    spawnGirder(level, sp, player, enemies) {
      const c = DP.config.cop;
      const g = level.girders.find((q) => (q.floor || q.id) === sp.girder && q.kind !== 'lift' && sp.x >= q.x1 + c.edgeMargin && sp.x <= q.x2 - c.edgeMargin);
      if (!g) return null;
      const y = DP.geometry.surfaceY(g, sp.x);
      if (player && player.state !== 'dead' && Math.abs(player.x - sp.x) < c.spawnAvoid && Math.abs(player.y - y) < 30) return null;
      if (enemies.some((e) => e.type === 'cop' && !e.dead && e.girder === g && Math.abs(e.x - sp.x) < 24)) return null;
      return g;
    },
    // 釘バットでポリスマンを倒したときに game.js が呼ぶ: その 1 人ぶんの枠を、出現の間隔 × smashRespawnFactor の間は埋めない
    onSmashed(level, round) {
      const c = DP.config.cop;
      if (!level.copSmashWaits) level.copSmashWaits = [];
      level.copSmashWaits.push(DP.cops.byRound(c.spawnInterval, round) * c.smashRespawnFactor);
    },
    update(ctx) {
      const g = ctx.g;
      // クリア演出(エンディング)に入ったら何もしない。8 本目のピンを抜いたのと同じステップでも、新しいポリスマンを出さない
      if (g.state !== 'playing') return;
      const c = DP.config.cop;
      const lv = g.level;
      const spawns = (lv.stage.cops && lv.stage.cops.spawns) || [];
      if (lv.copTimer === undefined) {
        lv.copTimer = 0;
        lv.copNext = 0;
      }
      lv.copTimer++;
      // 釘バットで倒された枠の残り待ち時間(倒した 1 人ごとに 1 つ。0 になったら枠が空く)
      if (!lv.copSmashWaits) lv.copSmashWaits = [];
      lv.copSmashWaits = lv.copSmashWaits.map((w) => w - 1).filter((w) => w > 0);
      const max = DP.cops.byRound(c.maxAlive, g.round);
      const due = lv.copTimer >= (lv.copSpawned ? DP.cops.byRound(c.spawnInterval, g.round) : c.firstSpawn);
      // 待ち時間中の枠は、いるものとして数える(その間は代わりを出さない)
      const alive = g.enemies.filter((e) => e.type === 'cop').length + lv.copSmashWaits.length;
      if (g.copsEnabled && due && alive < max && spawns.length) {
        for (let k = 0; k < spawns.length; k++) {
          const sp = spawns[(lv.copNext + k) % spawns.length];
          const gd = this.spawnGirder(lv, sp, g.player, g.enemies);
          if (!gd) continue;
          // 主人公の方を向いて現れる(現れている間は当たらない)
          const dir = g.player.x >= sp.x ? 1 : -1;
          g.enemies.push(DP.cops.create(lv, gd, sp.x, { dir, round: g.round }));
          lv.copNext = (lv.copNext + k + 1) % spawns.length;
          lv.copTimer = 0;
          lv.copSpawned = true;
          ctx.audio.play('whistle'); // ゴリラ警官の笛「ピーッ」
          break;
        }
      }
      for (const e of g.enemies) {
        if (e.type !== 'cop') continue;
        const ev = DP.cops.update(e, lv, g.player, ctx.rng);
        if (ev.stunned) {
          ctx.addScore(DP.config.score.copDrop, e.x, e.y - 40);
          ctx.audio.play('copStun');
        }
      }
      g.enemies = g.enemies.filter((e) => !e.dead);
    },
  },

  // 4 面: ボーナスアイテム(ステージデータの prizes。ビール瓶 300 点・エロ本 500 点・札束 800 点)。面の最初から床に置いてあり、
  // 主人公が歩いて触れるだけで取れる(得点・得点表示・効果音 'prize'・光の粒)。ポリスマンやゴリラは取らない。
  // 置き場所は穴の端から 20px 以上離してあるので、ピンをどう抜いても真下に穴は開かず、取れなくならない(テストで 256 通りを確認)。
  // 状態(level.prizes)はピンと同じく carry / restore でミス後に引き継ぐ: 取ったアイテムは消えたまま(得点の二重取りなし)、
  // 新しいゲーム・次の周回では引き継がないので 3 つとも戻る
  prizes: {
    setup(level) {
      level.prizes = (level.stage.prizes || []).map((p) => ({ id: p.id, type: p.type, floor: p.girder, x: p.x, taken: false }));
    },
    carry(level) {
      return (level.prizes || []).filter((p) => p.taken).map((p) => p.id);
    },
    restore(level, ids) {
      if (!level.prizes) this.setup(level);
      for (const p of level.prizes) if (ids.includes(p.id)) p.taken = true;
    },
    // アイテムが乗っている床の鉄骨(ピンで分かれたあとは x を含む方)と、足元の高さ
    floorOf(level, p) {
      const g = level.girders.find((q) => (q.floor || q.id) === p.floor && q.kind !== 'lift' && DP.geometry.containsX(q, p.x));
      return { girder: g || null, y: g ? DP.geometry.surfaceY(g, p.x) : null };
    },
    hitbox(level, p) {
      const c = DP.config.prize;
      return { x: p.x, y: this.floorOf(level, p).y, w: c.width, h: c.height };
    },
    update(ctx) {
      const g = ctx.g;
      const level = g.level;
      if (!level.prizes) this.setup(level);
      const pl = g.player;
      if (!pl || pl.state === 'dead') return;
      const pb = DP.player.hitbox(pl);
      for (const p of level.prizes) {
        if (p.taken || p.gone || !DP.geometry.overlaps(pb, this.hitbox(level, p))) continue;
        p.taken = true;
        const score = DP.config.score.prize[p.type];
        const y = this.floorOf(level, p).y;
        ctx.addScore(score, p.x, y - 40);
        ctx.audio.play('prize', score);
        g.effects.push({ x: p.x, y: y - 14, t: 0, type: 'prize' });
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
        const h = ctx.spawnHazard(bev.spawn, g.boss.girder.id, g.boss.throwX);
        // 斜め投げ(ステージデータの lob。1 面はゴミ箱): ゴリラの頭の上から斜め下へ放物線を描いて飛ばす(共通の DP.hazards.launch)
        const lob = g.level.stage.lob;
        if (lob && bev.spawn === lob.type) {
          const x = g.boss.x + lob.handDx;
          const y = g.boss.y + lob.handDy;
          if (lob.motion === 'zigzag') {
            // ジグザグ落下: 投げるたびに角度(最初の鉄骨から)と、最初の 1 区間の角度を選ぶ。速さは瓶・缶と同じく周回の速さの倍率を掛ける。最初は右下へ
            const angle = DP.hazards.pickAngle(lob, ctx.rng);
            DP.hazards.zigzag(h, x, y, angle, lob.speed * h.speedMul, 1, DP.hazards.pickFirstAngle(lob, ctx.rng));
          } else {
            // 放物線(今は使っていない。ほかの面で使うときのために残す)
            DP.hazards.launch(h, x, y, lob.vxMin + (lob.vxMax - lob.vxMin) * ctx.rng(), lob.vy);
          }
        }
        ctx.audio.play('throw');
      }
    },
  },
};
