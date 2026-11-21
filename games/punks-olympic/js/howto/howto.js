// 操作説明のデモ(HOW TO PLAY)。全 6 種目で共通の画面の管理
// 流れ: 種目選択 → ROUND・種目名・TARGET(roundIntro、2 秒)→ このデモ(PO.HOWTO_SEC 秒 = 5 秒)→ 競技
// - 黒い背景。上に HOW TO PLAY・遊び方・種目名(英語と日本語)、中央で選んだキャラクターが操作を実演、
//   その下に短い英語(大)と日本語(小)の説明、下に操作ボタン、いちばん下に残り時間のバー
// - 操作ボタンは PC ではキー(SPACE / ENTER)、スマホでは画面の下のボタン(RUN / ACTION など、競技と同じ文字・色)の形で描く。
//   キャラクターが操作した瞬間(同じステップ)にボタンが光り、効果音もそのステップで鳴らす
// - SKIP: PC は SPACE、スマホは画面のタップで、すぐ競技へ進む(操作しなければ 5 秒)。画面の下に SKIP の案内(英語・日本語)
// - SKIP 以外の入力はすべて捨てる(競技の操作にならない)。記録・自己ベスト・進行には何も残さない。
//   終わったら入力の状態をリセットしてから競技へ
// 種目ごとの実演は js/howto/demo-<id>.js が PO.howto.register({ id, roles, init, update, render }) で登録する:
//   roles: PC のキーの下に出す役割の名前 { run: 'RUN', action: 'JUMP' }(スマホのボタンの文字は EVENT_LIST のものを使う)
//   init(env)            デモの状態を作って返す
//   update(s, dt, env)   固定ステップごと。env.press / env.hold でボタンを光らせ、env.caption で説明を切り替える
//   render(ctx, s, env)  キャラクターと小道具を描く(背景・見出し・説明・ボタン・残り時間のバーは共通で描く)
PO.howto = (function () {
  const C = PO.config;
  const I = PO.input;
  const T = (...a) => PO.draw.text(...a);
  const demos = {};

  // 画面の配置(すべて 960×720 の論理座標)
  const L = {
    TITLE_Y: 38, // HOW TO PLAY
    TITLE_JA_Y: 74, // 遊び方
    EVENT_Y: 114, // 種目名(英語)
    EVENT_JA_Y: 148, // 種目名(日本語)
    FOOT_Y: 440, // 実演するキャラクターの足元
    CX: C.W / 2, // 実演の中心
    ZOOM: 1.5, // 実演の拡大率(競技の画面より大きく見せる。最近傍)
    CAP_Y: 500, // 説明(英語)
    CAP_JA_Y: 547, // 説明(日本語)
    BTN_Y: 572, // ボタンの上端
    BTN_H: 72,
    BAR_Y: 652, // 残り時間のバー
    BAR_H: 10,
    SKIP_Y: 680, // SKIP の案内(英語)
    SKIP_JA_Y: 704, // SKIP の案内(日本語)
  };
  const LIT_SEC = 0.12; // 押したボタンが光っている時間(秒。押しっぱなしは離すまで)

  function register(def) {
    demos[def.id] = def;
  }
  function get(id) {
    return demos[id] || null;
  }

  // スマホ(画面のボタンで遊ぶ)か。main.js が body に touch を付ける
  const isTouch = () => document.body.classList.contains('touch');

  // ---------------- 走る種目で共通に使う走りのモデル(100m 走と同じ式) ----------------
  // 連打 1 回で TAP_BOOST 加速、DRAG × 速さ + FRICTION で減速、VMAX で頭打ち。走りのコマは競技と同じ式(PO.chars.stripCycles)で進める
  function runner(charId, P) {
    const R = PO.RUN_STRIPS[charId];
    return {
      charId,
      v: 0,
      dist: 0,
      anim: 0,
      taps: [], // 直近の連打の時刻(見た目の足の回転の上乗せに使う)
      tap(t) {
        this.v = Math.min(P.VMAX, this.v + P.TAP_BOOST);
        this.taps.push(t);
      },
      // 1 ステップ進める。air = true(ジャンプの空中)はコマと足音を止める。sound = true なら着地のコマで足音
      step(dt, t, opt) {
        const o = opt || {};
        this.v = Math.max(0, this.v - (P.DRAG * this.v + P.FRICTION) * dt);
        this.dist += this.v * dt;
        this.taps = this.taps.filter((x) => t - x < 1);
        if (o.air || this.v <= 0.15 || !R) return;
        const before = Math.floor(this.anim);
        this.anim += dt * R.frames * PO.chars.stripCycles(R, this.v, this.taps.length);
        const after = Math.floor(this.anim);
        if (o.sound && after !== before && R.stepFrames.includes(after % R.frames)) PO.sound.play('step');
      },
    };
  }
  // 連打の時刻の並び: t0 から t1 まで、間隔を i0 から i1 へだんだん短くする
  function tapTimes(t0, t1, i0, i1) {
    const out = [];
    for (let t = t0; t < t1; ) {
      out.push(t);
      const k = (t - t0) / Math.max(0.001, t1 - t0);
      t += i0 + (i1 - i0) * k;
    }
    return out;
  }
  // 時刻の並び list のうち、(t - dt, t] に入るものの数(このステップで起きる操作)
  const due = (list, t, dt) => list.filter((x) => x <= t + 1e-9 && x > t - dt + 1e-9).length;

  // ---------------- 実演の描画の小道具 ----------------
  // 実演の座標(足元の中心が原点・拡大率 ZOOM)で描く
  function world(ctx, fn) {
    ctx.save();
    ctx.translate(L.CX, L.FOOT_Y);
    ctx.scale(L.ZOOM, L.ZOOM);
    fn();
    ctx.restore();
  }
  // 実演の座標 → 画面の座標
  const toScreen = (x, y) => ({ x: L.CX + x * L.ZOOM, y: L.FOOT_Y + y * L.ZOOM });
  // 走る種目の地面(実演の座標で描く): トラックの帯と、1m ごとの目盛り(走った距離 camDist に合わせて流れ、速さが見える)
  function drawTrack(ctx, camDist) {
    const half = C.W / 2 / L.ZOOM + 4;
    const pxm = C.PX_PER_M;
    ctx.fillStyle = '#8a3324';
    ctx.fillRect(-half, -10, half * 2, 26);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-half, -12, half * 2, 2);
    ctx.fillRect(-half, 16, half * 2, 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    const m0 = Math.floor(camDist - half / pxm) - 1;
    for (let m = m0; m < camDist + half / pxm + 1; m++) ctx.fillRect(Math.round((m - camDist) * pxm) - 1, 8, 2, 8);
  }
  // ---------------- 操作ボタン ----------------
  // 競技と同じボタン(EVENT_LIST の buttons・labels)。スマホの並びは画面の下のボタンと同じ(ACTION が左、RUN が右で大きい)
  function buttonList(eventId, demo) {
    const info = PO.EVENT_LIST.find((e) => e.id === eventId);
    const order = ['action', 'run'].filter((id) => info.buttons.includes(id));
    return order.map((id) => ({
      id,
      pad: (info.labels && info.labels[id]) || id.toUpperCase(), // スマホのボタンの文字
      key: id === 'run' ? 'SPACE' : 'ENTER', // PC のキー
      role: (demo.roles && demo.roles[id]) || id.toUpperCase(), // PC のキーの下の役割
    }));
  }
  function buttonRects(list, touch) {
    const gap = 24;
    const weights = list.map((b) => (touch && b.id === 'run' ? 2 : 1)); // スマホの RUN は横に 2 倍(画面の下のボタンと同じ)
    const total = touch ? 640 : list.length * 250 + (list.length - 1) * gap;
    const unit = (total - gap * (list.length - 1)) / weights.reduce((a, b) => a + b, 0);
    let x = (C.W - total) / 2;
    return list.map((b, i) => {
      const r = { x, y: L.BTN_Y, w: unit * weights[i], h: L.BTN_H };
      x += r.w + gap;
      return r;
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const PAD_COLOR = { run: ['#ff2fa8', '#5c1240'], action: ['#2f8bff', '#13305c'] }; // [光ったとき(画面の下のボタンの色), ふだん(暗く)]
  function drawButtons(ctx, sc) {
    const touch = isTouch();
    const list = sc.btns;
    buttonRects(list, touch).forEach((r, i) => {
      const b = list[i];
      const lit = sc.isLit(b.id);
      const dy = lit ? 6 : 0; // 押したときは沈む
      if (touch) {
        // スマホ: 画面の下のボタンと同じ形(角の丸い枠・黒い縁・下に影)
        ctx.fillStyle = '#000';
        roundRect(ctx, r.x, r.y + 8, r.w, r.h - 8, 22);
        ctx.fill();
        ctx.fillStyle = PAD_COLOR[b.id][lit ? 0 : 1];
        roundRect(ctx, r.x + 4, r.y + 4 + dy, r.w - 8, r.h - 16, 18);
        ctx.fill();
        if (lit) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 4;
          ctx.stroke();
        }
        T(ctx, b.pad, r.x + r.w / 2, r.y + (r.h - 8) / 2 + dy, { size: 32, color: lit ? '#fff' : '#9a9aae', align: 'center', shadow: lit ? '#000' : null, outline: lit ? '#000' : null });
      } else {
        // PC: キーボードのキー(SPACE / ENTER)と、その下に役割
        ctx.fillStyle = '#000';
        roundRect(ctx, r.x, r.y + 6, r.w, r.h - 26, 10);
        ctx.fill();
        ctx.fillStyle = lit ? '#ffe600' : '#2c2e44';
        roundRect(ctx, r.x + 3, r.y + dy, r.w - 6, r.h - 32, 10);
        ctx.fill();
        ctx.strokeStyle = lit ? '#fff' : '#6c6e88';
        ctx.lineWidth = 3;
        ctx.stroke();
        T(ctx, b.key, r.x + r.w / 2, r.y + (r.h - 32) / 2 + dy, { size: 26, color: lit ? '#000' : '#b8b8cc', align: 'center', outline: null });
        T(ctx, b.role, r.x + r.w / 2, r.y + r.h - 8, { size: 16, color: lit ? '#ffe600' : '#8a8aa0', align: 'center', outline: null });
      }
    });
  }

  // ---------------- 画面(シーン)----------------
  const scene = {
    t: 0,
    setup: null,
    demo: null,
    s: null,
    buttons: [], // 画面の下のボタン(DOM)は出さない(押せないようにする。ボタンはキャンバスに描く)
    enter(p) {
      this.t = 0;
      this.setup = p;
      this.demo = get(p.eventId);
      this.info = PO.EVENT_LIST.find((e) => e.id === p.eventId);
      this.btns = buttonList(p.eventId, this.demo || {});
      this.lit = {}; // ボタンごとの残りの点灯時間
      this.held = {}; // 押しっぱなしで光っているボタン
      this.cap = null; // { en, ja, t }
      this.skipped = false;
      this.log = []; // テスト用: { t, name, kind } ボタンを光らせた時刻
      this.env = this.makeEnv();
      this.s = this.demo ? this.demo.init(this.env) : null;
    },
    makeEnv() {
      const sc = this;
      return {
        get t() {
          return sc.t;
        },
        player: sc.setup.player,
        rival: (sc.setup.cpus && sc.setup.cpus[0]) || PO.CHARACTERS.find((c) => c.id !== sc.setup.player).id,
        // ボタンを押した(短く光る)。効果音は呼ぶ側が同じステップで鳴らす
        press(name) {
          sc.lit[name] = LIT_SEC;
          sc.log.push({ t: sc.t, name, kind: 'press' });
        },
        // 押しっぱなし(on の間ずっと光る)
        hold(name, on) {
          if (!!sc.held[name] !== !!on) sc.log.push({ t: sc.t, name, kind: on ? 'hold' : 'release' });
          sc.held[name] = !!on;
        },
        // 説明の文字(英語・日本語)。同じ文字なら出し直さない。pop = true なら同じ文字でも弾ませる(連打の TAP!)
        caption(en, ja, pop) {
          if (!sc.cap || sc.cap.en !== en || sc.cap.ja !== ja) sc.cap = { en, ja, t: 0 };
          else if (pop) sc.cap.t = 0;
        },
      };
    },
    isLit(name) {
      return !!this.held[name] || (this.lit[name] || 0) > 0;
    },
    update(dt) {
      // SKIP: PC は SPACE(RUN)、スマホは画面のタップ。ほかの入力は捨てる(競技の操作にならない)
      const skip = I.consume('run') + I.consumeTaps().length > 0;
      ['action', 'back', 'up', 'down', 'left', 'right'].forEach((k) => I.consume(k));
      if (skip) return this.finish(true);
      this.t += dt;
      Object.keys(this.lit).forEach((k) => (this.lit[k] = Math.max(0, this.lit[k] - dt)));
      if (this.cap) this.cap.t += dt;
      if (this.demo) this.demo.update(this.s, dt, this.env);
      if (this.t >= PO.HOWTO_SEC - 1e-9) this.finish(false);
    },
    // デモを終えて競技へ(skipped = SKIP した)。デモの間・SKIP に押したキー・連打の記録は競技に持ち込まない
    finish(skipped) {
      this.skipped = skipped;
      I.reset();
      PO.main.go('play', this.setup);
    },
    render(ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, C.W, C.H);
      const info = this.info;
      // 見出し: HOW TO PLAY / 遊び方 / 種目名(英語・日本語)
      T(ctx, 'HOW TO PLAY', C.W / 2, L.TITLE_Y, { size: 40, color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
      T(ctx, '遊び方', C.W / 2, L.TITLE_JA_Y, { size: 22, color: '#fff', align: 'center' });
      T(ctx, info.name, C.W / 2, L.EVENT_Y, { size: 36, color: '#fff', align: 'center', italic: true });
      T(ctx, info.ja, C.W / 2, L.EVENT_JA_Y, { size: 20, color: '#9fd0ff', align: 'center' });
      // 実演(種目ごと)
      if (this.demo) {
        ctx.save();
        this.demo.render(ctx, this.s, this.env);
        ctx.restore();
      }
      // 説明: 短い英語を大きく、その下に日本語を少し小さく
      if (this.cap) {
        const pop = Math.min(1, this.cap.t * 10);
        T(ctx, this.cap.en, C.W / 2, L.CAP_Y, { size: Math.round(50 * (0.82 + 0.18 * pop)), color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
        if (this.cap.ja) T(ctx, this.cap.ja, C.W / 2, L.CAP_JA_Y, { size: 26, color: '#fff', align: 'center' });
      }
      drawButtons(ctx, this);
      // 残り時間のバー(5 秒で右から減る)
      const k = Math.max(0, 1 - this.t / PO.HOWTO_SEC);
      const bw = 640;
      const bx = (C.W - bw) / 2;
      ctx.fillStyle = '#333';
      ctx.fillRect(bx - 3, L.BAR_Y - 3, bw + 6, L.BAR_H + 6);
      ctx.fillStyle = '#111';
      ctx.fillRect(bx, L.BAR_Y, bw, L.BAR_H);
      ctx.fillStyle = k > 0.25 ? '#3affb0' : '#ff5cc8';
      ctx.fillRect(bx, L.BAR_Y, Math.round(bw * k), L.BAR_H);
      // SKIP の案内
      T(ctx, 'PRESS SPACE OR TAP TO SKIP', C.W / 2, L.SKIP_Y, { size: 18, color: '#ccc', align: 'center', outline: null });
      T(ctx, 'スペースキーまたはタップでスキップ', C.W / 2, L.SKIP_JA_Y, { size: 14, color: '#aaa', align: 'center', outline: null });
    },
    // テスト用の状態
    snapshot() {
      return {
        t: this.t,
        eventId: this.setup.eventId,
        skipped: this.skipped,
        lit: this.btns.map((b) => b.id).filter((id) => this.isLit(id)),
        caption: this.cap ? { en: this.cap.en, ja: this.cap.ja } : null,
        log: this.log.slice(),
        demo: this.demo && this.demo.snapshot ? this.demo.snapshot(this.s) : null,
        buttons: this.btns.map((b) => (isTouch() ? b.pad : b.key + ' ' + b.role)),
      };
    },
  };

  return { register, get, scene, L, runner, tapTimes, due, world, toScreen, drawTrack, buttonList };
})();
