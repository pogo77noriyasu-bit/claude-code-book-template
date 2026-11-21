// 表彰式(ROUND CLEAR の演出。α版)。全 6 種目で TARGET を達成したあと、最後のリザルトの EVENTS から入る(約 15 秒)
// 0〜3 秒   : 競技場の背景に「ROUND 1 CLEAR!!」を大きく。観客の大歓声
// 3〜6 秒   : 3 段の表彰台(画像)がせり上がる(2 位・3 位の選手が乗っている)。4 位は台の横の地面で泣く(敗北のポーズ + 涙。泣いていることは動きだけで見せ、文字は出さない)。
//             プレイヤーが走ってきて 1 位の台に跳び乗り、勝利のポーズ(両手を上げるガッツポーズ)
// 6〜12 秒  : トロフィー(4 コマでキラキラ。優勝者が頭上に掲げる)・紙吹雪・CONGRATULATIONS!! / 全6種目クリア!・全 6 種目の記録を順番に・表彰式のファンファーレ
// 12〜15 秒 : GET READY FOR THE NEXT ROUND!! / 次のラウンドへ!
// 音: 0 秒 大歓声、3 秒 表彰台のファンファーレ、4.4 秒から BGM(オリジナルの 8 ビット風)、トロフィーが光るとキラキラ、
//   終わりの 1.5 秒前から BGM と歓声をフェードアウト。次の画面へ移るとき(PO.main.go)に BGM・歓声とも止める
// 終わったら次のラウンドの種目選択へ(PO.progress.nextRound。タイトル・キャラクター選択には戻らない)。入力は使わない(押しても早送りしない)
// 配置は実際の総合順位(PO.progress.standings。2026-11-19)。総合 4 位のプレイヤーは台の横で号泣し、ROUND n RESULT / GAME OVER、
// BGM・紙吹雪なし、終わったら GAME OVER の画面へ(PO.progress.endRound)。累積スコアはまだない。
// 表彰台・トロフィーは支給画像(podium.png / trophy.png を tools/build-ceremony.js で切り出したもの)、紙吹雪・涙はプログラムで描く(キャラクターは既存の画像)
// params: { preview: true, rank, round } = 開発用のプレビュー(js/dev-preview.js)。仮の記録・仮の総合順位(プレイヤーを rank 位)で表示し、
//   記録・自己ベストには何もしない。終わったら 1〜3 位は ROUND round+1 の種目選択、4 位は GAME OVER の画面へ(自己ベストを保存しない進行)
PO.ceremony = (function () {
  const C = PO.config;
  const I = PO.input;
  const T = (...a) => PO.draw.text(...a);

  const GROUND = 640; // 表彰台と 4 位が立つ地面の y(いちばん手前のレーンのあたり)
  // 表彰台(支給画像 podium.png を tools/build-ceremony.js で切り出したもの。縦横比はそのまま)。下端を地面にそろえ、画面の中央に置く
  const ART = PO.CEREMONY_ART;
  const PODIUM = { x: Math.round(C.W / 2 - ART.podium.w / 2), y: GROUND - ART.podium.h, w: ART.podium.w, h: ART.podium.h };
  // 各段(1 位・2 位・3 位): 中心 x と、選手の足元を置く上面の高さ top(画像から自動で求めた値)
  const STEPS = ART.podium.steps.map((st) => ({ rank: st.rank, x: PODIUM.x + st.x, top: PODIUM.y + st.surface }));
  const TROPHY_FRAME_SEC = 0.15; // トロフィーの 4 コマを 1 コマずつ見せる時間(くり返してキラキラさせる)
  // トロフィーを掲げる高さ: 勝利のポーズ(両手を上げる)の両手(こぶし)の高さに、台座の下端を合わせる(キャラクターごとに画像から測る)。
  // 台座がこぶしの間に乗り、両手と重なって持ち上げているように見える。HOLD_ADJ = こぶしの中心より上へずらす量(0 = 台座の下端がこぶしの中心の高さ。8 人とも台座が手と重なるか 1px 以内)
  const HOLD_ADJ = 0;
  const HOLD_FALLBACK = 85; // こぶしが見つからないときの高さ(足元から)
  const holdCache = {};
  // 勝利のポーズのこぶしの中心の高さ h(足元から上へ px)と、左右のこぶしのまん中の x(体の中心から)mid。画像を小さなキャンバスに描いて、顔より外側(左右 20px より外)の
  // 肌色の画素を左右それぞれ探し、行の中央値をとって左右で平均する
  function fistInfo(id) {
    if (holdCache[id] != null) return holdCache[id];
    const N = 200;
    const FOOT = 190;
    const c = document.createElement('canvas');
    c.width = N;
    c.height = N;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    PO.chars.drawStripPose(g, id, 'goal', N / 2, FOOT);
    const d = g.getImageData(0, 0, N, N).data;
    const skin = (i) => d[i + 3] > 200 && d[i] > 180 && d[i + 1] > 110 && d[i + 1] < 215 && d[i + 2] > 70 && d[i + 2] < 190 && d[i] - d[i + 2] > 40;
    const side = (sgn) => {
      const ys = [];
      const xs = [];
      for (let y = FOOT - 140; y < FOOT - 50; y++)
        for (let x = 0; x < N; x++)
          if ((x - N / 2) * sgn >= 20 && skin((y * N + x) * 4)) {
            ys.push(FOOT - y);
            xs.push(x - N / 2);
          }
      const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
      return ys.length ? { h: med(ys), x: med(xs) } : null;
    };
    const l = side(-1);
    const r = side(1);
    const h = l && r ? (l.h + r.h) / 2 : l ? l.h : r ? r.h : HOLD_FALLBACK;
    holdCache[id] = { h: Math.round(h), mid: l && r ? (l.x + r.x) / 2 : 0 };
    return holdCache[id];
  }
  const fistHeight = (id) => fistInfo(id).h;
  const trophyHold = (id) => fistHeight(id) + HOLD_ADJ; // 台座の下端の高さ(足元から)
  // トロフィーの左右の位置: 両手のこぶしのまん中(台座が左右の手のあいだに来るように)。トロフィーの絵は中心より 0.5px 左寄り
  const trophyX = (id, x) => Math.round(x + fistInfo(id).mid + 0.5);
  const LOSER_X = 820; // 4 位が泣いている場所(3 位の台のすぐ右の地面)
  const LOSER_ZOOM = 1.4; // 4 位の敗北のポーズの拡大率
  const AT = { podium: 3, run: 3.6, hop: 4.5, land: 5.1, celebrate: 6, next: 12, bgm: 4.4, fade: 1.5, score: 12.2 }; // bgm: BGM の始まり、fade: 終わりの前のフェードアウトの長さ、score: 得点のカウントアップの始まり
  const HOP_SEC = AT.land - AT.hop;
  const REC_FROM = 6.6; // 記録を 1 つずつ出し始める時刻
  const REC_GAP = 0.7; // 記録を出す間隔(秒)
  const CONFETTI_COLORS = ['#ff2fa8', '#ffe600', '#3affb0', '#2f8bff', '#ffffff', '#ff6a3a'];

  // 開発用のプレビューで使う仮の記録(実際の記録・自己ベストには使わない)
  const PREVIEW_RESULTS = {
    dash100: { playerValue: 12.34, playerRank: 1 },
    anpan: { playerValue: 15.8, playerRank: 2 },
    tug: { playerValue: 9.5, playerRank: 1 },
    balltoss: { playerValue: 42, playerRank: 1 },
    cankick: { playerValue: 28.75, playerRank: 3 },
    relay: { playerValue: 62.1, playerRank: 2 },
  };

  // 決まった並びの乱数(紙吹雪・涙。毎回同じ動きにする)
  function lcg(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ---------- 描画の小道具 ----------
  // 表彰台の画像を描く。rise(0〜1)でせり上がる(地面より下は見せない)
  function drawPodium(ctx, rise) {
    const dy = Math.round(PODIUM.h * (1 - rise));
    if (dy >= PODIUM.h) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, C.W, GROUND);
    ctx.clip();
    ctx.drawImage(PO.assets.get('podium'), PODIUM.x, PODIUM.y + dy);
    ctx.restore();
  }
  // トロフィーの画像(4 コマ)の f コマ目を、台座の下端の中心 (x, baseY) に合わせて描く
  function drawTrophy(ctx, x, baseY, f) {
    const T2 = ART.trophy;
    ctx.drawImage(PO.assets.get('trophy'), f * T2.w, 0, T2.w, T2.h, Math.round(x - T2.w / 2), Math.round(baseY - T2.baseRow), T2.w, T2.h);
  }

  // ---------- 画面(シーン) ----------
  const scene = {
    t: 0,
    buttons: [],
    enter(p) {
      const prm = p || {};
      this.t = 0;
      this.preview = !!prm.preview;
      this.player = prm.player || PO.progress.player || PO.CHARACTERS[0].id;
      // 全 6 種目の記録(プレビューは仮の記録。進行のデータは読むだけで変えない)
      this.records = PO.EVENT_LIST.map((ev) => {
        const r = this.preview ? PREVIEW_RESULTS[ev.id] : PO.progress.result(ev.id);
        return { id: ev.id, name: ev.name, ja: ev.ja, value: r ? r.playerValue : null, rank: r ? r.playerRank : null };
      });
      // 総合順位(全 6 種目の順位ポイントの合計。PO.progress.standings)で並べる: places[0] = 1 位(金・トロフィー)… places[3] = 4 位(号泣)
      // プレビューは仮の総合順位(プレイヤーを prm.rank 位に置く)
      this.round = this.preview ? prm.round || 1 : PO.progress.round;
      if (this.preview) {
        this.cpus = PO.progress.player === this.player && PO.progress.cpus.length === 3 ? PO.progress.cpus : PO.rng.shuffle(PO.CHARACTERS.map((c) => c.id).filter((id) => id !== this.player)).slice(0, 3);
        const rank = Math.max(1, Math.min(4, prm.rank || 1));
        const order = this.cpus.slice();
        order.splice(rank - 1, 0, this.player);
        const pts = [20, 17, 14, 10];
        this.standings = order.map((id, i) => ({ charId: id, isPlayer: id === this.player, points: pts[i], firsts: 0, seconds: 0, thirds: 0, events: 6, rank: i + 1 }));
      } else {
        this.cpus = PO.progress.cpus;
        this.standings = PO.progress.standings();
      }
      this.places = this.standings.map((r) => r.charId);
      this.winner = this.places[0]; // 走ってきて 1 位の台に乗り、トロフィーを掲げる選手
      this.playerRank = this.places.indexOf(this.player) + 1;
      this.lose = this.playerRank === 4; // 総合 4 位: ROUND の GAME OVER(表彰式のあと GAME OVER の画面へ)
      this.playerPoints = this.standings[this.playerRank - 1].points;
      // 累積スコア: 総合順位ボーナス + ROUND CLEAR ボーナス(総合 1〜3 位)を一度に加える(ROUND ごとに 1 回だけ)。表示は 12 秒からカウントアップ。
      // プレビューはハイスコアを保存しない点で計算する
      if (this.preview) PO.score.newGame({ preview: true, keep: true });
      this.bonus = PO.score.addRound(this.round, this.playerRank);
      this.ticked = 0;
      this.fired = {}; // 一度だけ鳴らす効果音
      this.shown = 0; // 出した記録の数
      // 紙吹雪(決まった並び)
      const rnd = lcg(7);
      this.confetti = Array.from({ length: 110 }, () => ({
        x: rnd() * C.W,
        y0: -rnd() * C.H,
        vy: 70 + rnd() * 90,
        sway: 10 + rnd() * 26,
        ph: rnd() * Math.PI * 2,
        spin: 4 + rnd() * 8,
        w: 5 + Math.floor(rnd() * 5),
        color: CONFETTI_COLORS[Math.floor(rnd() * CONFETTI_COLORS.length)],
      }));
      // 涙のしずく(4 位の目から左右に飛び散る)
      this.tears = [];
      this.tearRnd = lcg(11);
      this.tearAcc = 0;
      // プレビューを URL から開いたときは、音を出せる状態にするため、最初のクリック・タップ・キーを待ってから始める
      // (ブラウザは操作の前に音を出せない)。本番(リザルトの EVENTS から)はすぐ始める
      this.waiting = !!prm.waitStart;
      this.trophyLoop = -1;
      if (!this.waiting) this.begin();
    },
    // 始まり(0 秒): ROUND CLEAR!!(総合 4 位のときは ROUND n RESULT)と観客の大歓声
    begin() {
      PO.sound.crowd('start');
      PO.sound.crowd('up'); // 大歓声
      if (!this.lose) PO.sound.play('victory');
    },
    get trophyFrame() {
      return Math.floor(Math.max(0, this.t - AT.celebrate) / TROPHY_FRAME_SEC) % ART.trophy.frames;
    },
    get phase() {
      const t = this.t;
      return t < AT.podium ? 'clear' : t < AT.celebrate ? 'podium' : t < AT.next ? 'celebrate' : 'next';
    },
    once(key, fn) {
      if (this.fired[key]) return;
      this.fired[key] = true;
      fn();
    },
    update(dt) {
      // 入力は使わない(早送りしない)。プレビューの開始待ちのときだけ、クリック・タップ・SPACE / ENTER で始める
      const pressed = I.consume('run') + I.consume('action') + I.consumeTaps().length > 0;
      ['back', 'up', 'down', 'left', 'right'].forEach((k) => I.consume(k));
      if (this.waiting) {
        if (!pressed) return;
        this.waiting = false;
        this.begin();
      }
      this.t += dt;
      const t = this.t;
      // 表彰台の登場: 台がせり上がる音と、華やかなファンファーレ
      if (t >= AT.podium) this.once('podium', () => {
        PO.sound.play('stomp');
        PO.sound.play('podium');
      });
      // BGM(ファンファーレのあとから表彰式の終わりまで。約 10.8 秒の曲)
      // (総合 4 位のときは BGM なし。歓声・ファンファーレ・トロフィーは CPU の優勝者のため)
      if (t >= AT.bgm && !this.lose) this.once('bgm', () => PO.sound.bgm('start', 'ceremony'));
      // 終わりの前に BGM と歓声をフェードアウト(終わったら次の画面へ移るときに止める)
      if (t >= PO.CEREMONY_SEC - AT.fade) this.once('fade', () => {
        PO.sound.bgm('fade', AT.fade);
        PO.sound.crowd('fade', AT.fade);
      });
      // トロフィーが光る: 4 コマの最後(大きく光るコマ)に入るたび、1 回おきに「キラキラ」
      if (t >= AT.celebrate) {
        const loop = Math.floor((t - AT.celebrate) / (TROPHY_FRAME_SEC * ART.trophy.frames));
        if (this.trophyFrame === ART.trophy.frames - 1 && loop !== this.trophyLoop) {
          this.trophyLoop = loop;
          if (loop % 2 === 0) PO.sound.play('kira');
        }
      }
      if (t >= AT.run + 0.2) this.once('sob', () => PO.sound.play('tugmiss')); // 4 位が泣き出す(コミカルな音)
      if (t >= AT.hop) this.once('hop', () => PO.sound.play('jump'));
      if (t >= AT.land) this.once('land', () => PO.sound.play('perfect'));
      if (t >= AT.next) this.once('next', () => PO.sound.play(this.lose ? 'defeat' : 'ready'));
      // 得点のカウントアップの間、短い電子音
      if (this.bonus.total > 0 && t >= AT.score && t < AT.score + PO.SCORE.countSec) {
        const n = Math.floor((t - AT.score) / 0.07);
        if (n >= this.ticked) {
          this.ticked = n + 1;
          PO.sound.play('tick');
        }
      }
      // 記録を 1 つずつ
      const n = Math.max(0, Math.min(this.records.length, Math.floor((t - REC_FROM) / REC_GAP) + 1));
      while (this.shown < n && t < AT.next) {
        this.shown++;
        PO.sound.play('select');
      }
      // 涙: 泣いている間、1 秒に 26 粒ほど左右に飛ばす(放物線で落ちる)
      if (t >= AT.run) {
        this.tearAcc += dt * 26;
        while (this.tearAcc >= 1) {
          this.tearAcc -= 1;
          const r = this.tearRnd;
          const side = r() < 0.5 ? -1 : 1;
          this.tears.push({ x: side * 7, y: 0, vx: side * (60 + r() * 110), vy: -(90 + r() * 120), life: 0 });
        }
      }
      this.tears.forEach((d) => {
        d.life += dt;
        d.vy += 520 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
      });
      this.tears = this.tears.filter((d) => d.y < 90);
      if (t >= PO.CEREMONY_SEC - 1e-9) this.finish();
    },
    finish() {
      I.reset();
      // プレビューは進行を持たないので、選んだキャラクター・CPU で進行を作る(自己ベストは保存しない進行。PO.progress.previewMode)
      if (this.preview) PO.progress.startPreview(this.player, this.round, this.cpus, true); // プレビューの点は続ける(ハイスコアは保存しない)
      if (this.lose) {
        // 総合 4 位: ROUND の GAME OVER。結果を残して GAME OVER の画面へ(次の ROUND へは進まない)
        PO.progress.endRound();
        PO.score.finalize(this.round, this.player); // 最終結果を確定(将来の API・DB 連携用)
        return PO.main.go('gameOver', { round: this.round, standings: this.standings });
      }
      // 総合 1〜3 位: 次のラウンドへ進めて(ラウンドを 1 増やし、種目のクリア状態を空にする。キャラクター・CPU はそのまま)、次のラウンドの種目選択へ
      PO.progress.nextRound();
      PO.main.go('eventSelect', { eventId: PO.EVENT_LIST[0].id }); // カーソルは 1 番目の種目から
    },
    // プレイヤーの位置(YOU の表示・テスト用)。1 位 = 走ってきて台へ跳び乗る優勝者、2・3 位 = 台の上、4 位 = 台の横で号泣。{ x, foot, pose }
    playerPos() {
      if (this.playerRank === 1) return this.winnerPos();
      if (this.playerRank === 4) return this.t >= AT.run ? { x: LOSER_X, foot: GROUND, pose: 'lose' } : null;
      const st = STEPS[this.playerRank - 1];
      return this.t >= AT.podium + 0.6 ? { x: st.x, foot: st.top, pose: 'stop' } : null;
    },
    // 優勝者(総合 1 位)の位置(地面を走ってきて、1 位の台へ跳び乗る)。{ x, foot, pose }
    winnerPos() {
      const t = this.t;
      const top1 = STEPS[0].top;
      if (t < AT.run) return null;
      if (t < AT.hop) {
        const u = Math.min(1, (t - AT.run) / (AT.hop - AT.run - 0.15));
        return { x: -60 + (200 + 60) * u, foot: GROUND, pose: u < 1 ? 'run' : 'stop' };
      }
      if (t < AT.land) {
        const u = (t - AT.hop) / HOP_SEC;
        return { x: 200 + (STEPS[0].x - 200) * u, foot: GROUND + (top1 - GROUND) * u - 150 * 4 * u * (1 - u), pose: 'jump' };
      }
      return { x: STEPS[0].x, foot: top1, pose: 'goal' };
    },
    render(ctx) {
      const t = this.t;
      // 競技場の背景(上の HUD の帯は暗い色)
      ctx.fillStyle = '#0b0c22';
      ctx.fillRect(0, 0, C.W, C.H);
      PO.stadium.draw(ctx, 0, { lines: [] });
      ctx.fillStyle = 'rgba(6, 6, 30, 0.25)';
      ctx.fillRect(0, 0, C.W, C.H);

      // 表彰台(せり上がる)と 2 位・3 位の選手
      if (t >= AT.podium) {
        const rise = Math.min(1, (t - AT.podium) / 0.6);
        const bounce = rise < 1 ? 0 : Math.max(0, Math.sin((t - AT.podium - 0.6) * 18) * 6 * Math.exp(-(t - AT.podium - 0.6) * 5));
        [STEPS[1], STEPS[2]].forEach((st, i) => {
          const id = this.places[i + 1];
          if (rise >= 1) PO.chars.drawStripPose(ctx, id, 'stop', st.x, st.top - bounce);
        });
        drawPodium(ctx, rise);
        if (rise >= 1) {
          // 台の下に名前(順位の色)
          STEPS.forEach((st) => {
            const ch = PO.chars.byId(this.places[st.rank - 1]);
            T(ctx, ch.name, st.x, GROUND + 22, { size: 16, color: ch.color, align: 'center' });
          });
        }
      }
      // 4 位: 台の横の地面で、敗北のポーズで泣く(しゃくりあげて小刻みに揺れる・涙が左右に飛び散る・足元に水たまり)
      if (t >= AT.run) this.renderLoser(ctx);
      // 優勝者(走ってきて 1 位の台へ)
      const wp = this.winnerPos();
      if (wp) {
        if (wp.pose === 'run') PO.chars.drawRunStrip(ctx, this.winner, Math.floor(t * 14), wp.x, wp.foot);
        else if (wp.pose === 'jump') PO.chars.drawJump(ctx, this.winner, 1, wp.x, wp.foot);
        else PO.chars.drawStripPose(ctx, this.winner, wp.pose, wp.x, wp.foot);
      }
      // トロフィー: 上から降りてきて、優勝者が頭上に掲げる位置へ。4 コマをくり返してキラキラ
      if (t >= AT.celebrate && wp) {
        const u = Math.min(1, (t - AT.celebrate) / 0.5);
        drawTrophy(ctx, trophyX(this.winner, wp.x), wp.foot - trophyHold(this.winner) - (1 - u) * 300, this.trophyFrame);
      }
      // YOU: プレイヤーの位置に合わせる(1 位でトロフィーを掲げてからは、頭上のトロフィーにかからないよう横に)
      const pp = this.playerPos();
      if (pp && pp.pose !== 'run' && pp.pose !== 'jump') {
        if (pp.pose === 'lose') T(ctx, 'YOU', pp.x, pp.foot - 104, { size: 18, color: '#ffe600', align: 'center' });
        else if (pp.pose === 'goal' && t >= AT.celebrate) T(ctx, 'YOU', pp.x - 74, pp.foot - 96, { size: 18, color: '#ffe600', align: 'center' });
        else T(ctx, 'YOU', pp.x, pp.foot - 136, { size: 18, color: '#ffe600', align: 'center' });
      }
      // 紙吹雪(総合 4 位のときはなし)
      if (t >= AT.celebrate && !this.lose) {
        const ct = t - AT.celebrate;
        this.confetti.forEach((c) => {
          const y = ((c.y0 + c.vy * ct) % (C.H + 40) + C.H + 40) % (C.H + 40) - 20;
          if (c.y0 + c.vy * ct < -20) return;
          const x = c.x + Math.sin(ct * 2 + c.ph) * c.sway;
          const w = Math.max(1, Math.round(Math.abs(Math.cos(ct * c.spin + c.ph)) * c.w));
          ctx.fillStyle = c.color;
          ctx.fillRect(Math.round(x - w / 2), Math.round(y), w, 7);
        });
      }
      this.renderText(ctx);
      if (this.preview) T(ctx, 'PREVIEW', C.W - 10, C.H - 14, { size: 14, color: '#ff5cc8', align: 'right', outline: '#000' });
      // プレビューの開始待ち(音を出せるようにするため)
      if (this.waiting) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, C.W, C.H);
        T(ctx, 'CLICK / TAP / PRESS SPACE TO START', C.W / 2, 330, { size: 34, color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
        T(ctx, 'クリック・タップ・スペースキーで開始(音が出ます)', C.W / 2, 380, { size: 22, color: '#fff', align: 'center' });
      }
    },
    renderLoser(ctx) {
      const t = this.t;
      const id = this.places[3];
      const sob = Math.round(Math.sin(t * 30) * 2); // しゃくりあげ
      // 足元の水たまり(だんだん広がる)
      const pw = Math.min(70, (t - AT.run) * 18);
      ctx.fillStyle = 'rgba(90, 170, 255, 0.55)';
      ctx.beginPath();
      ctx.ellipse(LOSER_X, GROUND + 2, pw, Math.max(1, pw / 6), 0, 0, Math.PI * 2);
      ctx.fill();
      // 敗北のポーズは小さく縮んだ絵なので、目立つよう 1.4 倍に拡大して描く(最近傍)
      ctx.save();
      ctx.translate(LOSER_X + sob, GROUND);
      ctx.scale(LOSER_ZOOM, LOSER_ZOOM);
      PO.chars.drawStripPose(ctx, id, 'lose', 0, 0);
      ctx.restore();
      // 目のあたり(敗北のポーズは頭が足元から 30px ほど。拡大したぶん上へ)から涙
      const ex = LOSER_X + sob;
      const ey = GROUND - 30 * LOSER_ZOOM;
      this.tears.forEach((d) => {
        const x = Math.round(ex + d.x);
        const y = Math.round(ey + d.y);
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 3, y - 4, 7, 9);
        ctx.fillStyle = '#5ab4ff';
        ctx.fillRect(x - 2, y - 3, 5, 7);
        ctx.fillStyle = '#e8f6ff';
        ctx.fillRect(x - 1, y - 2, 2, 2);
      });
      const ch = PO.chars.byId(id);
      T(ctx, '4TH  ' + ch.name, LOSER_X, GROUND + 22, { size: 14, color: '#bbb', align: 'center' });
    },
    // 1UP に出す点(12.2 秒から 1 秒でカウントアップ。点そのものは始めに加えてある)
    get shownScore() {
      const k = Math.max(0, Math.min(1, (this.t - AT.score) / PO.SCORE.countSec));
      return Math.round(this.bonus.before + (this.bonus.after - this.bonus.before) * k);
    },
    renderText(ctx) {
      const t = this.t;
      PO.draw.scores(ctx, 'corner', this.shownScore);
      const round = this.round;
      // 総合 4 位のときは ROUND n RESULT(ラウンドn 結果)
      const head = this.lose ? ['ROUND ' + round + ' RESULT', 'ラウンド' + round + ' 結果'] : ['ROUND ' + round + ' CLEAR!!', 'ラウンド' + round + ' クリア!'];
      if (t < AT.podium) {
        // 0〜3 秒: 中央に大きく
        const pop = Math.min(1, t * 6);
        T(ctx, head[0], C.W / 2, 230, { size: Math.round(84 * (0.5 + 0.5 * pop)), color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8', outline: '#000' });
        if (t > 0.3) T(ctx, head[1], C.W / 2, 310, { size: 34, color: '#fff', align: 'center', outline: '#000', shadow: '#ff2fa8' });
      } else {
        // 3 秒から: 上の帯に小さく残す
        T(ctx, head[0], C.W / 2, 32, { size: 40, color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
        T(ctx, head[1], C.W / 2, 64, { size: 18, color: '#fff', align: 'center' });
      }
      if (t >= AT.celebrate && t < AT.next) {
        // 6〜12 秒: CONGRATULATIONS!! と全 6 種目の記録
        PO.draw.panel(ctx, 150, 84, 660, 236, 'rgba(16, 18, 56, 0.9)', '#ffe600');
        const pop = Math.min(1, (t - AT.celebrate) * 6);
        // 総合 1〜3 位 = CONGRATULATIONS!!、総合 4 位 = GAME OVER
        T(ctx, this.lose ? 'GAME OVER' : 'CONGRATULATIONS!!', C.W / 2, 118, { size: Math.round(44 * (0.6 + 0.4 * pop)), color: this.lose ? '#ff3a46' : '#3affb0', align: 'center', italic: true, shadow: '#000', outline: '#000' });
        T(ctx, '全6種目クリア!', C.W / 2, 154, { size: 22, color: '#fff', align: 'center' });
        this.records.slice(0, this.shown).forEach((r, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const x = col ? 492 : 172;
          const y = 192 + row * 40;
          T(ctx, r.name, x, y - 7, { size: 17, color: '#fff', outline: null });
          T(ctx, r.ja, x, y + 11, { size: 12, color: '#9fd0ff', outline: null });
          const val = r.value == null ? (r.id === 'tug' ? 'WIN' : '--') : PO.records.format(r.id, r.value);
          T(ctx, val, x + 228, y, { size: 20, color: '#ffe600', align: 'right', outline: null });
          T(ctx, r.rank ? PO.draw.ordinal(r.rank) : '--', x + 296, y, { size: 18, color: r.rank === 1 ? '#ffe600' : '#fff', align: 'right', outline: null });
        });
        // プレイヤーの総合順位と順位ポイント(記録がそろってから)
        if (this.shown >= this.records.length) {
          T(ctx, 'TOTAL  ' + PO.draw.ordinal(this.playerRank) + '  ' + this.playerPoints + ' PTS', C.W / 2 - 16, 302, { size: 20, color: this.lose ? '#ff6a6a' : '#ffe600', align: 'right', outline: null });
          T(ctx, '総合' + this.playerRank + '位', C.W / 2 + 16, 302, { size: 18, color: '#fff', outline: null });
        }
      }
      if (t >= AT.next) {
        // 12〜15 秒: 次のラウンドへ
        const pop = Math.min(1, (t - AT.next) * 6);
        const blink = Math.floor(t * 3) % 2 === 0;
        if (this.lose) {
          // 総合 4 位: 次のラウンドへは進まない
          T(ctx, 'GAME OVER', C.W / 2, 170, { size: Math.round(64 * (0.6 + 0.4 * pop)), color: '#ff3a46', align: 'center', italic: true, shadow: '#000', outline: '#000' });
          T(ctx, '総合4位… ゲームオーバー', C.W / 2, 226, { size: 30, color: '#fff', align: 'center', outline: '#000', shadow: '#000' });
        } else {
          T(ctx, 'GET READY FOR THE NEXT ROUND!!', C.W / 2, 170, { size: Math.round(44 * (0.6 + 0.4 * pop)), color: blink ? '#ffe600' : '#ff5cc8', align: 'center', italic: true, shadow: '#000', outline: '#000' });
          T(ctx, '次のラウンドへ!', C.W / 2, 226, { size: 32, color: '#fff', align: 'center', outline: '#000', shadow: '#ff2fa8' });
        }
        // 得点: 総合順位ボーナス・ROUND CLEAR ボーナス・加えたあとの累積得点(カウントアップ)
        PO.draw.panel(ctx, 190, 248, 580, 72, 'rgba(16, 18, 56, 0.9)', '#ff5cc8');
        T(ctx, 'OVERALL BONUS  +' + this.bonus.overall, 340, 268, { size: 16, color: '#9fd0ff', align: 'center', outline: null });
        T(ctx, 'ROUND CLEAR BONUS  +' + this.bonus.clear, 620, 268, { size: 16, color: '#9fd0ff', align: 'center', outline: null });
        T(ctx, 'TOTAL SCORE', C.W / 2 - 14, 300, { size: 18, color: '#ffe600', align: 'right', outline: null });
        T(ctx, PO.score.text(this.shownScore), C.W / 2 + 14, 300, { size: 26, color: '#fff', outline: null });
      }
    },
    // テスト用の状態
    snapshot() {
      const pp = this.playerPos();
      const wp = this.winnerPos();
      return {
        t: this.t,
        phase: this.phase,
        preview: this.preview,
        places: this.places.slice(),
        player: pp ? { x: pp.x, foot: pp.foot, pose: pp.pose } : null,
        shown: this.shown,
        records: this.records.map((r) => ({ id: r.id, value: r.value, rank: r.rank })),
        tears: this.tears.length,
        trophyFrame: this.trophyFrame,
        bonus: Object.assign({}, this.bonus),
        shownScore: this.shownScore,
        waiting: this.waiting,
        // 表彰台に立つ選手の足元(段の上面)とトロフィーの位置
        standing: this.t >= AT.podium + 0.6 ? STEPS.slice(1).map((st) => ({ rank: st.rank, x: st.x, foot: st.top })) : [],
        trophy: this.t >= AT.celebrate && wp ? { x: trophyX(this.winner, wp.x), base: wp.foot - trophyHold(this.winner) - (1 - Math.min(1, (this.t - AT.celebrate) / 0.5)) * 300 } : null,
        winner: this.winner,
        winnerPos: wp,
        playerRank: this.playerRank,
        lose: this.lose,
        round: this.round,
        standings: this.standings.map((r) => ({ charId: r.charId, points: r.points, rank: r.rank })),
      };
    },
  };

  return { scene, GROUND, STEPS, PODIUM, AT, fistHeight, trophyHold, trophyX };
})();
