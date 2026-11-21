// 画面(シーン): タイトル → キャラクター選択(最初の 1 回だけ)→ 種目選択 → ROUND・TARGET(2 秒)→ 操作説明のデモ(5 秒)→ 競技 → リザルト → 種目選択 …(全 6 種目を通して遊ぶ。全種目クリアでリザルト → 表彰式 → ROUND CLEAR)
// 進行(選んだキャラクター・終わった種目と結果)は PO.progress。一度終わった種目は全種目が終わるまで選べない
// 各シーンは enter(params) / update(dt) / render(ctx) / buttons(スマホに出すボタン) を持つ
PO.scenes = (function () {
  const C = PO.config;
  const I = PO.input;
  const T = PO.draw.text;
  const go = (name, params) => PO.main.go(name, params);
  // メニューの決定は RUN(SPACE)・ACTION(ENTER)のどちらでもよい
  const confirmed = () => I.consume('run') + I.consume('action') > 0;
  const inRect = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

  // 対戦相手: キャラクターを決めたときに抽選した CPU 3 人(PO.progress.cpus。全種目・全 ROUND で同じ、強い順)。
  // 進行がないとき(テストで直接など)だけ、選んだキャラクター以外の 7 人からランダムに 3 人
  function pickCpus(player) {
    if (PO.progress.started && PO.progress.player === player && PO.progress.cpus.length === 3) return PO.progress.cpus;
    return PO.rng.shuffle(PO.CHARACTERS.map((c) => c.id).filter((id) => id !== player)).slice(0, 3);
  }

  // ---------------- タイトル ----------------
  const TITLE_SUB_Y = 230; // サブタイトルの y(背景画像のロゴの下)
  // 英語のサブタイトル: 背景画像にはロゴの下に「100m DASH」の文字が描かれているので、画像は変えずに、
  // 描くときにその文字の範囲を背景と同じピンク(文字のまわりのピンクの画素の中央値)で覆い、上に「RUN! JUMP! FIGHT!」を描く。
  // 字は白・黒の縁取り・斜体(元の文字に合わせる)。横幅 TITLE_EN.maxW に収まるよう文字の大きさを自動で決める
  const TITLE_EN = { text: 'RUN! JUMP! FIGHT!', cover: { x: 284, y: 140, w: 402, h: 73 }, pink: '#f94cb1', y: 176, maxSize: 58, maxW: 384 };
  let titleEnSize = 0;
  function drawTitleEn(ctx) {
    const E = TITLE_EN;
    ctx.fillStyle = E.pink;
    ctx.fillRect(E.cover.x, E.cover.y, E.cover.w, E.cover.h);
    if (!titleEnSize) {
      // 斜体の太字で幅を測って、収まる大きさにする(1 回だけ)
      ctx.save();
      for (titleEnSize = E.maxSize; titleEnSize > 12; titleEnSize--) {
        ctx.font = 'italic 900 ' + titleEnSize + 'px ' + PO.draw.FONT;
        if (ctx.measureText(E.text).width + titleEnSize / 5 <= E.maxW) break;
      }
      ctx.restore();
    }
    T(ctx, E.text, C.W / 2, E.y, { size: titleEnSize, color: '#fff', align: 'center', italic: true, outline: '#000', shadow: '#000' });
  }
  const title = {
    t: 0,
    buttons: [{ id: 'run', label: 'START' }],
    enter() {
      this.t = 0;
    },
    update(dt) {
      this.t += dt;
      const taps = I.consumeTaps().length;
      if (confirmed() || taps) {
        PO.sound.play('decide');
        // キャラクターを選んだあと(途中まで遊んだ)なら種目選択へ。最初はキャラクター選択から
        go(PO.progress.started ? 'eventSelect' : 'charSelect');
      }
    },
    render(ctx) {
      const im = PO.assets.get('title');
      ctx.drawImage(im, Math.round((im.width - C.W) / 2), 0, C.W, C.H, 0, 0, C.W, C.H);
      drawTitleEn(ctx);
      // 日本語のサブタイトル(背景画像は変えず、ロゴの下に文字を重ねる。2026-11-19 に後ろの半透明の矩形を削除)
      T(ctx, '― パンクス大運動会 ―', C.W / 2, TITLE_SUB_Y, { size: 30, color: '#fff', align: 'center', outline: '#000', shadow: '#ff2fa8' });
      if (Math.floor(this.t * 2.5) % 2 === 0) {
        T(ctx, 'PRESS START', C.W / 2, 560, { size: 54, color: '#ffe600', align: 'center', shadow: '#ff2fa8' });
      }
      T(ctx, 'PC: ENTER   SMARTPHONE: TAP', C.W / 2, 612, { size: 20, align: 'center' });
      // 種目ごとの自己ベスト(遊べる種目だけ)
      const lines = PO.EVENT_LIST.filter((e) => e.available).map((e) => {
        const b = PO.records.get(e.id);
        return e.name + '  BEST ' + PO.records.format(e.id, b ? b.value : null);
      });
      // 種目が増えても画面に収まるよう、2 列に並べる。3 行になったら行の間隔と文字を少し詰める(最後の行が 700 前後)
      const rows = Math.ceil(lines.length / 2);
      const gap = rows > 2 ? 28 : 32;
      const y0 = 700 - (rows - 1) * gap;
      lines.forEach((s, i) => T(ctx, s, C.W / 2 + (i % 2 ? 235 : -235), y0 + Math.floor(i / 2) * gap, { size: rows > 2 ? 20 : 22, color: '#fff', align: 'center' }));
      PO.draw.scores(ctx, 'corner'); // 1UP(前のゲームの点は次のゲームを始めるまで残す)・HI-SCORE
    },
  };

  // ---------------- 種目選択 ----------------
  // 種目が 5 つ以上なら、行を低くして画面に収める(124〜640 の間に並べる)
  const ROW =
    PO.EVENT_LIST.length > 4
      ? { x: 110, w: 740, h: Math.min(88, Math.floor((640 - 124 - (PO.EVENT_LIST.length - 1) * 8) / PO.EVENT_LIST.length)), y0: 124, gap: 8 }
      : { x: 110, w: 740, h: 104, y0: 132, gap: 14 };
  const rowRect = (i) => ({ x: ROW.x, y: ROW.y0 + i * (ROW.h + ROW.gap), w: ROW.w, h: ROW.h });
  const eventSelect = {
    t: 0,
    cursor: 0,
    buttons: [{ id: 'run', label: 'OK' }],
    enter(p) {
      this.t = 0;
      if (p && p.eventId) this.cursor = Math.max(0, PO.EVENT_LIST.findIndex((e) => e.id === p.eventId));
      // カーソルはプレイ済みの種目に置かない(いまの位置から下へ、まだの種目を探す)
      if (this.open(this.cursor) === false) this.cursor = this.step(this.cursor, 1);
    },
    // まだ遊べる種目か(プレイ済み・未実装は false)
    open(i) {
      const ev = PO.EVENT_LIST[i];
      return PO.events.playable(ev.id) && !PO.progress.isCleared(ev.id);
    },
    // i から dir の向きに、プレイ済みの種目を飛ばして次の種目へ(遊べる種目がなければ i のまま)
    step(i, dir) {
      const n = PO.EVENT_LIST.length;
      for (let k = 1; k <= n; k++) {
        const j = (((i + dir * k) % n) + n) % n;
        if (!PO.progress.isCleared(PO.EVENT_LIST[j].id)) return j;
      }
      return i;
    },
    choose() {
      // ROUND CLEAR(全種目で基準を達成。仮の画面)・GAME OVER(ふつうはリザルトからタイトルへ行くので来ない): 決定で進行を最初に戻してタイトルへ
      if (PO.progress.allDone || PO.progress.gameOver) {
        PO.sound.play('decide');
        PO.progress.reset();
        return go('title');
      }
      const ev = PO.EVENT_LIST[this.cursor];
      if (!this.open(this.cursor)) return PO.sound.play('deny');
      PO.sound.play('decide');
      // キャラクターを選ぶ前に種目選択へ来た場合(テストなど)は、キャラクター選択をはさんでからこの種目へ
      if (!PO.progress.started) return go('charSelect', { eventId: ev.id });
      const player = PO.progress.player;
      go('roundIntro', { eventId: ev.id, player, cpus: pickCpus(player) }); // ROUND・種目名・TARGET を見せてから競技へ
    },
    update(dt) {
      this.t += dt;
      const n = PO.EVENT_LIST.length;
      const mv = I.consume('down') - I.consume('up');
      I.consume('left');
      I.consume('right');
      if (mv && !PO.progress.allDone) {
        for (let k = 0; k < Math.abs(mv); k++) this.cursor = this.step(this.cursor, mv > 0 ? 1 : -1);
        PO.sound.play('select');
      }
      if (I.consume('back')) {
        // ROUND 1 でまだ 1 種目も終わっていなければ、キャラクターを選び直せる。始まったあと・ROUND 2 以降はもどれない(キャラクターは変えられない)
        if (PO.progress.canRechoose) {
          PO.progress.reset();
          return go('charSelect');
        }
        PO.sound.play('deny');
      }
      I.consumeTaps().forEach((p) => {
        if (PO.progress.allDone) return this.choose();
        for (let i = 0; i < n; i++)
          if (inRect(p, rowRect(i))) {
            // プレイ済みの種目はタップしても選べない
            if (!this.open(i)) return PO.sound.play('deny');
            this.cursor = i;
            this.choose();
          }
      });
      if (confirmed()) this.choose();
    },
    render(ctx) {
      PO.draw.menuBackdrop(ctx, this.t);
      // いまのラウンド(大きく黄色)と見出し
      T(ctx, 'ROUND ' + PO.progress.round, C.W / 2, 38, { size: 48, color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
      T(ctx, 'SELECT EVENT', C.W / 2, 82, { size: 26, color: '#fff', align: 'center', italic: true });
      // 終わった種目の数と、使っているキャラクター
      T(ctx, PO.progress.clearCount + ' / ' + PO.progress.total + ' CLEAR', C.W - 110, 106, { size: 20, color: '#3affb0', align: 'right' });
      if (PO.progress.player) {
        const pc = PO.chars.byId(PO.progress.player);
        T(ctx, 'YOUR PUNK: ' + pc.name, 110, 106, { size: 16, color: pc.color });
      }
      PO.EVENT_LIST.forEach((ev, i) => {
        const r = rowRect(i);
        const done = PO.progress.isCleared(ev.id); // 基準を達成した種目だけ灰色・選べない
        const sel = i === this.cursor && !done;
        const ok = PO.events.playable(ev.id) && !done;
        const blink = sel && Math.floor(this.t * 4) % 2 === 0;
        PO.draw.panel(ctx, r.x, r.y, r.w, r.h, ok ? '#1d2160' : '#26263a', sel ? (blink ? '#ffe600' : '#ff2fa8') : '#8888aa');
        T(ctx, i + 1 + '.', r.x + 30, r.y + r.h / 2, { size: 34, color: ok ? '#ffe600' : '#777' });
        const k = r.h / 104; // 行の高さに合わせて文字の位置を縮める
        T(ctx, ev.name, r.x + 90, r.y + 40 * k, { size: Math.round(36 * Math.min(1, k + 0.05)), color: ok ? '#fff' : '#777' });
        T(ctx, ev.ja, r.x + 92, r.y + 78 * k, { size: 20, color: ok ? '#9fd0ff' : '#666' });
        // 通過基準(TARGET)。プレイ済みの種目も表示は残す(灰色)
        const tg = PO.target.get(ev.id);
        if (tg) {
          // 英語(ピンク)の下に日本語(白、少し小さく)。右端は BEST の文字の手前
          T(ctx, PO.target.text(tg), r.x + 530, r.y + 40 * k, { size: 18, color: done ? '#777' : PO.target.COLOR.en, align: 'right' });
          T(ctx, PO.target.ja(tg), r.x + 530, r.y + 72 * k, { size: 15, color: done ? '#666' : PO.target.COLOR.ja, align: 'right' });
        }
        if (done) {
          T(ctx, 'CLEAR!!', r.x + r.w - 30, r.y + r.h / 2, { size: 26, color: '#3affb0', align: 'right' });
        } else if (ok) {
          const b = PO.records.get(ev.id);
          T(ctx, 'BEST', r.x + r.w - 190, r.y + 36 * k, { size: 18, color: '#ffe600', outline: null });
          T(ctx, PO.records.format(ev.id, b ? b.value : null), r.x + r.w - 30, r.y + 68 * k, { size: 32, align: 'right' });
        } else T(ctx, 'COMING SOON', r.x + r.w - 30, r.y + r.h / 2, { size: 22, color: '#888', align: 'right' });
        if (sel) T(ctx, '▶', r.x - 34, r.y + r.h / 2, { size: 34, color: '#ffe600' });
      });
      T(ctx, PO.progress.canRechoose ? '↑↓: えらぶ   SPACE / ENTER: けってい   ESC: キャラクター選択へ' : '↑↓: えらぶ   SPACE / ENTER: けってい', C.W / 2, 690, { size: 18, align: 'center', color: '#ccc' });
      if (PO.progress.allDone) this.renderAllDone(ctx);
      // 開発用のプレビューから始めた進行(自己ベストは保存しない)
      if (PO.progress.previewMode) T(ctx, 'PREVIEW', 12, 702, { size: 14, color: '#ff5cc8', outline: '#000' });
      PO.draw.scores(ctx, 'corner');
    },
    // 全 6 種目で基準を達成したとき(ROUND CLEAR!!。仮のラウンド終了画面): 各種目のプレイヤーの順位・記録・TARGET。
    // 決定でタイトルへ(進行は最初から)。正式な表彰台・ラウンド 2 は別途
    renderAllDone(ctx) {
      ctx.fillStyle = 'rgba(6, 6, 24, 0.85)';
      ctx.fillRect(0, 0, C.W, C.H);
      PO.draw.panel(ctx, 110, 90, 740, 540, '#1d2160', '#3aff6a');
      T(ctx, 'ROUND ' + PO.progress.round + '  CLEAR!!', C.W / 2, 146, { size: 52, color: '#3aff6a', align: 'center', italic: true, shadow: '#000', outline: '#000' });
      PO.EVENT_LIST.forEach((ev, i) => {
        const r = PO.progress.result(ev.id);
        const y = 222 + i * 54;
        T(ctx, ev.name, 140, y, { size: 24 });
        T(ctx, r.playerRank ? PO.draw.ordinal(r.playerRank) : '--', 470, y, { size: 24, color: r.playerRank === 1 ? '#ffe600' : '#fff', align: 'right' });
        T(ctx, r.playerValue == null ? '--' : PO.records.format(ev.id, r.playerValue), 640, y, { size: 24, align: 'right' });
        const tg = PO.target.get(ev.id);
        if (tg) {
          T(ctx, PO.target.text(tg), 820, y - 8, { size: 15, color: PO.target.COLOR.en, align: 'right' });
          T(ctx, PO.target.ja(tg), 820, y + 12, { size: 13, color: PO.target.COLOR.ja, align: 'right' });
        }
      });
      if (Math.floor(this.t * 2.5) % 2 === 0) T(ctx, 'PRESS SPACE / ENTER: TITLE', C.W / 2, 580, { size: 22, align: 'center', color: '#3affb0' });
    },
  };

  // ---------------- キャラクター選択 ----------------
  const CARD = { w: 210, h: 232, gap: 16, y0: 110 };
  const cardRect = (i) => {
    const x0 = (C.W - CARD.w * 4 - CARD.gap * 3) / 2;
    return { x: x0 + (i % 4) * (CARD.w + CARD.gap), y: CARD.y0 + Math.floor(i / 4) * (CARD.h + CARD.gap), w: CARD.w, h: CARD.h };
  };
  const charSelect = {
    t: 0,
    cursor: 0,
    eventId: 'dash100',
    buttons: [{ id: 'run', label: 'OK' }],
    enter(p) {
      this.t = 0;
      this.eventId = (p && p.eventId) || null; // 種目選択から来たときは、その種目へそのまま進む
    },
    // 決めたキャラクターを全種目で使う(PO.progress)。そのあと種目選択へ
    choose() {
      const player = PO.progress.start(PO.CHARACTERS[this.cursor].id);
      PO.sound.play('decide');
      if (this.eventId) go('roundIntro', { eventId: this.eventId, player, cpus: pickCpus(player) });
      else go('eventSelect');
    },
    update(dt) {
      this.t += dt;
      const dx = I.consume('right') - I.consume('left');
      const dy = I.consume('down') - I.consume('up');
      if (dx || dy) {
        const col = (this.cursor % 4 + dx + 4) % 4;
        const row = (Math.floor(this.cursor / 4) + dy + 2) % 2;
        this.cursor = row * 4 + col;
        PO.sound.play('select');
      }
      if (I.consume('back')) return go('title');
      // タップ: 1 回目でえらび、えらばれているカードをもう一度タップで決定
      let tapped = false;
      I.consumeTaps().forEach((p) => {
        for (let i = 0; i < 8; i++)
          if (inRect(p, cardRect(i))) {
            if (i === this.cursor) tapped = true;
            else {
              this.cursor = i;
              PO.sound.play('select');
            }
          }
      });
      if (tapped || confirmed()) this.choose();
    },
    render(ctx) {
      PO.draw.menuBackdrop(ctx, this.t);
      T(ctx, 'SELECT YOUR PUNK', C.W / 2, 56, { size: 48, color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
      PO.CHARACTERS.forEach((ch, i) => {
        const r = cardRect(i);
        const sel = i === this.cursor;
        const blink = sel && Math.floor(this.t * 4) % 2 === 0;
        PO.draw.panel(ctx, r.x, r.y, r.w, r.h, sel ? '#3a3f9a' : '#1d2160', sel ? (blink ? '#ffe600' : '#ff2fa8') : ch.color);
        PO.chars.drawFace(ctx, ch.id, r.x + 8, r.y + 10, r.w - 16, r.h - 56);
        ctx.fillStyle = ch.color;
        ctx.fillRect(r.x + 6, r.y + r.h - 44, r.w - 12, 38);
        T(ctx, i + 1 + ' ' + ch.name, r.x + r.w / 2, r.y + r.h - 25, { size: 15, color: '#fff', align: 'center' });
      });
      // えらんでいるキャラクターの名前と走る姿
      const ch = PO.CHARACTERS[this.cursor];
      T(ctx, ch.name, C.W / 2, 622, { size: 40, color: ch.color, align: 'center' });
      T(ctx, ch.ja, C.W / 2, 664, { size: 22, align: 'center' });
      const frame = PO.chars.frameName(ch.id, 'run', this.t * 10);
      PO.chars.draw(ctx, ch.id, frame, 140, 700, 1);
      PO.chars.draw(ctx, ch.id, frame, C.W - 140, 700, 1);
      T(ctx, 'TAP AGAIN / OK', C.W / 2, 700, { size: 16, align: 'center', color: '#ccc' });
      PO.draw.scores(ctx, 'corner');
    },
  };

  // ---------------- 競技の前の表示(ROUND・種目名・TARGET) ----------------
  // 黒い背景に大きく PO.ROUND_INTRO_SEC 秒(いまは 2 秒)出してから競技へ。入力は数えない(押しても早送りしない)
  // 文字が順に出るタイミング(種目名・TARGET)は表示時間に比例させる(3 秒のときの 0.25 秒・0.6 秒と同じ割合)
  const roundIntro = {
    t: 0,
    setup: null,
    buttons: [],
    enter(p) {
      this.t = 0;
      this.setup = p;
      PO.sound.play('ready');
    },
    update(dt) {
      this.t += dt;
      I.consume('run');
      I.consume('action');
      I.consume('back');
      I.consumeTaps();
      if (this.t >= PO.ROUND_INTRO_SEC) go('howTo', this.setup); // 次は操作説明のデモ(PO.HOWTO_SEC 秒)、そのあと競技
    },
    render(ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, C.W, C.H);
      const info = PO.EVENT_LIST.find((e) => e.id === this.setup.eventId);
      const t = PO.target.get(this.setup.eventId);
      const k = PO.ROUND_INTRO_SEC / 3; // 3 秒のときを 1 とした時間の倍率
      const pop = (d) => Math.min(1, Math.max(0, ((this.t - d) * 6) / k));
      T(ctx, 'ROUND ' + PO.progress.round, C.W / 2, 150, { size: Math.round(60 * (0.6 + 0.4 * pop(0))), color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
      if (this.t > 0.25 * k) {
        T(ctx, info.name, C.W / 2, 290, { size: 80, color: '#fff', align: 'center', italic: true, shadow: '#ff2fa8' });
        T(ctx, info.ja, C.W / 2, 360, { size: 30, color: '#9fd0ff', align: 'center' });
      }
      if (t && this.t > 0.6 * k) {
        T(ctx, PO.target.text(t), C.W / 2, 490, { size: Math.round(56 * (0.6 + 0.4 * pop(0.6 * k))), color: PO.target.COLOR.en, align: 'center', shadow: '#000' });
        T(ctx, PO.target.ja(t), C.W / 2, 560, { size: 36, color: PO.target.COLOR.ja, align: 'center' });
      }
    },
  };

  // ---------------- 競技 ----------------
  const play = {
    setup: null,
    instance: null,
    buttons: [],
    enter(p) {
      this.setup = p;
      this.instance = PO.events.get(p.eventId).create(p);
      const info = PO.EVENT_LIST.find((e) => e.id === p.eventId);
      // ボタンの文字は種目ごとに変えられる(玉入れの PICK / THROW など。省略時は RUN / ACTION)
      this.buttons = info.buttons.map((id) => ({ id, label: (info.labels && info.labels[id]) || id.toUpperCase() }));
    },
    update(dt) {
      I.consumeTaps(); // 競技中の画面タップは使わない(ボタンだけ)
      I.consume('back');
      this.instance.update(dt);
      if (this.instance.done) go('result', { setup: this.setup, instance: this.instance });
    },
    render(ctx) {
      this.instance.render(ctx);
      drawTargetBadge(ctx, this.setup.eventId);
      PO.draw.scores(ctx, 'strip'); // 1UP・HI-SCORE(画面の下の芝の上。右下の TARGET の札の左)
    },
  };
  // 競技中の TARGET の表示: 画面の右下の芝の上に小さく(どの種目でも競技の邪魔にならない場所)。英語(ピンク)の下に日本語(白)
  function drawTargetBadge(ctx, eventId) {
    const t = PO.target.get(eventId);
    if (!t) return;
    const w = 210;
    const h = 42;
    const x = C.W - w - 8;
    const y = C.H - h - 6;
    PO.draw.panel(ctx, x, y, w, h, 'rgba(16, 18, 46, 0.85)', '#ff5cc8');
    T(ctx, PO.target.text(t), x + w / 2, y + 14, { size: 15, color: PO.target.COLOR.en, align: 'center', outline: null });
    T(ctx, PO.target.ja(t), x + w / 2, y + 31, { size: 13, color: PO.target.COLOR.ja, align: 'center', outline: null });
  }

  // ---------------- リザルト ----------------
  // 順位の表のあとに、プレイヤーの記録と TARGET、判定(CLEAR!! / GAME OVER)を大きく出す。
  // ボタンは 1 つ: CLEAR なら EVENTS(種目選択へ)、GAME OVER なら TITLE(進行を最初に戻してタイトルへ)。画面の中央に置く
  const menuRect = () => ({ x: (C.W - 260) / 2, y: 616, w: 260, h: 60 });
  const JUDGE_AT = 0.8; // 判定を出すまでの時間(秒。順位の表を先に見せる)
  const COUNT_AT = 0.3; // 累積スコアのカウントアップを始める時間(秒)
  const result = {
    t: 0,
    cursor: 0,
    data: null,
    isNew: false,
    judge: null,
    buttons: [{ id: 'run', label: 'OK' }],
    enter(p) {
      this.t = 0;
      this.cursor = 0;
      this.setup = p.setup;
      this.instance = p.instance;
      this.data = p.instance.result();
      // 自己ベスト(開発用のプレビューから始めた進行では保存しない)
      this.isNew = PO.progress.previewMode ? false : PO.records.submit(p.setup.eventId, this.data.playerValue, p.setup.player);
      // 通過基準の判定(全種目共通)。順位に関係なく、終わった種目はプレイ済み
      this.judge = PO.target.judge(p.setup.eventId, this.data);
      PO.progress.complete(p.setup.eventId, this.data, this.judge);
      // 累積スコア: 基本得点 + 順位ボーナス + TARGET ボーナスを一度に加える(ROUND・種目ごとに 1 回だけ。TARGET 未達成でも記録の点と順位の点は加える)
      this.score = PO.score.addEvent(p.setup.eventId, this.data, this.judge, PO.progress.round);
      // TARGET 未達成の GAME OVER: 最終結果を確定(将来の API・DB 連携用。PO.score.getFinalResult)
      if (!this.judge.clear) PO.score.finalize(PO.progress.round, p.setup.player);
      this.ticked = 0;
      this.judgeShown = false;
      if (this.isNew) PO.sound.play('record');
    },
    // 1UP に出す点(加えた点を COUNT_AT から PO.SCORE.countSec 秒でカウントアップ。表示だけで、点は enter で加えてある)
    get shownScore() {
      const sc = this.score;
      const k = Math.max(0, Math.min(1, (this.t - COUNT_AT) / PO.SCORE.countSec));
      return Math.round(sc.before + (sc.after - sc.before) * k);
    },
    get menu() {
      return this.judge && !this.judge.clear ? 'TITLE' : 'EVENTS';
    },
    choose() {
      PO.sound.play('decide');
      if (this.menu === 'TITLE') {
        PO.progress.reset(); // GAME OVER: 進行を最初から(次はキャラクター選択から)
        go('title');
      } else if (PO.progress.roundClear) go('ceremony'); // 全 6 種目で TARGET を達成: 表彰式(終わったら今までのラウンド終了の画面へ)
      else go('eventSelect', { eventId: this.setup.eventId });
    },
    update(dt) {
      this.t += dt;
      ['right', 'down', 'left', 'up'].forEach((k) => I.consume(k)); // ボタンが 1 つなのでカーソルは動かさない
      // カウントアップの間、短い電子音(0.07 秒ごと)
      if (this.score.total > 0 && this.t >= COUNT_AT && this.t < COUNT_AT + PO.SCORE.countSec) {
        const n = Math.floor((this.t - COUNT_AT) / 0.07);
        if (n >= this.ticked) {
          this.ticked = n + 1;
          PO.sound.play('tick');
        }
      }
      if (!this.judgeShown && this.t >= JUDGE_AT) {
        // 判定を出す瞬間の効果音(既存の音: 達成 = 勝利のファンファーレ、未達成 = 決着の負けの音)
        this.judgeShown = true;
        PO.sound.play(this.judge.clear ? 'victory' : 'defeat');
      }
      const taps = I.consumeTaps();
      const ok = confirmed();
      // 連打の勢いで押してしまわないよう、判定が出てしばらくは決定を受け付けない
      if (this.t >= JUDGE_AT + 0.6) {
        taps.forEach((p) => {
          if (inRect(p, menuRect()) && PO.main.sceneName === 'result') this.choose();
        });
        if (ok && PO.main.sceneName === 'result') this.choose();
      }
      if (PO.main.sceneName === 'result') this.instance.update(dt); // 勝利ポーズを動かし続ける
    },
    render(ctx) {
      this.instance.render(ctx);
      ctx.fillStyle = 'rgba(6, 6, 24, 0.76)';
      ctx.fillRect(0, C.HUD_H, C.W, C.H - C.HUD_H);
      // 上の帯(競技の HUD)は隠して、1UP(カウントアップ)・HI-SCORE を出す
      ctx.fillStyle = '#0b0c22';
      ctx.fillRect(0, 0, C.W, C.HUD_H);
      const sc = this.score;
      const shown = this.shownScore;
      PO.draw.scores(ctx, 'corner', shown);
      const over = !this.judge.clear;
      if (this.isNew && Math.floor(this.t * 3) % 2 === 0) T(ctx, 'NEW RECORD!!', 800, 52, { size: 20, color: '#ff5cc8', align: 'right', italic: true, shadow: '#000' });
      if (over && PO.score.newHi && Math.floor(this.t * 3) % 2 === 1) T(ctx, 'NEW HI-SCORE!!', C.W / 2, 52, { size: 22, color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
      const info = PO.EVENT_LIST.find((e) => e.id === this.setup.eventId);
      T(ctx, info.name + '  RESULT', C.W / 2, 104, { size: 36, color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
      // 順位の表(4 人)
      this.data.entries.forEach((e, i) => {
        const y = 130 + i * 60;
        const ch = PO.chars.byId(e.charId);
        PO.draw.panel(ctx, 110, y, 740, 56, e.isPlayer ? '#4a3a10' : '#1d2160', e.isPlayer ? '#ffe600' : ch.color);
        T(ctx, PO.draw.ordinal(e.rank), 140, y + 28, { size: 26, color: e.rank === 1 ? '#ffe600' : '#fff' });
        ctx.save();
        ctx.beginPath();
        ctx.rect(236, y + 6, 70, 44);
        ctx.clip();
        PO.chars.drawFace(ctx, e.charId, 236, y + 6, 70, 44);
        ctx.restore();
        T(ctx, ch.name, 324, y + 21, { size: 20, color: ch.color });
        T(ctx, e.isPlayer ? 'YOU' : 'CPU', 326, y + 42, { size: 13, color: e.isPlayer ? '#ffe600' : '#aaa', outline: null });
        // label: 種目が決める表示(綱引きの LOSE など)。なければ記録(記録なしは DNF)
        T(ctx, e.label || (e.value == null ? 'DNF' : PO.records.format(this.setup.eventId, e.value)), 820, y + 29, { size: 28, align: 'right' });
      });
      const j = this.judge;
      if (j.target) {
        // プレイヤーの記録と TARGET
        T(ctx, 'YOU  ' + PO.target.valueText(this.setup.eventId, j), C.W / 2 - 20, 388, { size: 22, color: '#ffe600', align: 'right' });
        T(ctx, PO.target.text(j.target), C.W / 2 + 20, 388, { size: 22, color: PO.target.COLOR.en });
        T(ctx, PO.target.ja(j.target), C.W / 2 + 22, 410, { size: 15, color: PO.target.COLOR.ja });
      }
      // 得点の内訳(左)と、加えたあとの累積スコア(右。GAME OVER のときは最終得点・ハイスコア・キャラクター・到達 ROUND)
      PO.draw.panel(ctx, 150, 424, 660, 120, 'rgba(16, 18, 56, 0.92)', '#ff5cc8');
      const row = (label, v, y, size, color) => {
        T(ctx, label, 174, y, { size: size || 16, color: color || '#9fd0ff', outline: null });
        T(ctx, (v > 0 ? '+' : '') + v, 470, y, { size: size || 16, color: color || '#fff', align: 'right', outline: null });
      };
      row('RECORD SCORE', sc.record, 448);
      row('PLACE BONUS', sc.place, 472);
      row('TARGET BONUS', sc.target, 496);
      ctx.fillStyle = '#ff5cc8';
      ctx.fillRect(174, 508, 296, 2);
      row('TOTAL POINTS', sc.total, 526, 19, '#ffe600');
      if (over) {
        const ch = PO.chars.byId(this.setup.player);
        T(ctx, ch.name + '  ROUND ' + PO.progress.round, 640, 446, { size: 14, color: ch.color, align: 'center', outline: null });
        T(ctx, 'FINAL SCORE', 640, 468, { size: 14, color: '#ff5cc8', align: 'center', outline: null });
        T(ctx, PO.score.text(shown), 640, 494, { size: 28, color: '#fff', align: 'center' });
        T(ctx, 'HI-SCORE  ' + PO.score.text(Math.max(PO.score.hi, shown)), 640, 526, { size: 15, color: '#ffe600', align: 'center', outline: null });
      } else {
        T(ctx, '1UP', 640, 452, { size: 15, color: '#ff5cc8', align: 'center', outline: null });
        T(ctx, PO.score.text(shown), 640, 484, { size: 32, color: '#fff', align: 'center' });
        T(ctx, 'HI-SCORE  ' + PO.score.text(Math.max(PO.score.hi, shown)), 640, 522, { size: 15, color: '#ffe600', align: 'center', outline: null });
      }
      if (this.judgeShown) {
        const pop = Math.min(1, (this.t - JUDGE_AT) * 8);
        T(ctx, j.clear ? 'CLEAR!!' : 'GAME OVER', C.W / 2, 578, {
          size: Math.round(64 * (0.6 + 0.4 * pop)),
          color: j.clear ? '#3aff6a' : '#ff3a46',
          align: 'center',
          italic: true,
          shadow: '#000',
          outline: '#000',
        });
      }
      if (this.judgeShown) {
        const r = menuRect();
        PO.draw.panel(ctx, r.x, r.y, r.w, r.h, '#ff2fa8', '#ffe600');
        T(ctx, this.menu, r.x + r.w / 2, r.y + r.h / 2, { size: 26, align: 'center' });
        T(ctx, this.menu === 'TITLE' ? 'SPACE / ENTER: タイトルへ' : 'SPACE / ENTER: しゅもく選択へ', C.W / 2, 702, { size: 16, align: 'center', color: '#ccc' });
      }
    },
  };

  // ---------------- GAME OVER(ROUND の総合 4 位。表彰式のあと)----------------
  // 全 6 種目で TARGET を達成しても総合 4 位なら GAME OVER(2026-11-19)。その ROUND の総合順位とポイント、到達した ROUND を出す。
  // ボタンは TITLE だけ(進行を最初に戻してタイトルへ。次のゲームは ROUND 1・キャラクター選択から)。連打の勢いで押さないよう少し待つ
  const gameOverRect = () => ({ x: (C.W - 260) / 2, y: 604, w: 260, h: 60 });
  const gameOver = {
    t: 0,
    buttons: [{ id: 'run', label: 'TITLE' }],
    enter(p) {
      this.t = 0;
      const h = PO.progress.history(PO.progress.round);
      this.round = (p && p.round) || PO.progress.round;
      this.standings = (p && p.standings) || (h && h.standings) || PO.progress.standings();
      this.player = PO.progress.player || (this.standings.find((r) => r.isPlayer) || {}).charId;
      // 最終結果を確定(将来の API・DB 連携用。表彰式のあとで確定済みならそのまま)
      this.final = PO.score.finalize(this.round, this.player);
      PO.sound.play('defeat');
    },
    choose() {
      PO.sound.play('decide');
      PO.progress.reset(); // 進行を最初から(ROUND 1・キャラクター選択から・CPU も抽選しなおし)
      go('title');
    },
    update(dt) {
      this.t += dt;
      ['right', 'down', 'left', 'up', 'back'].forEach((k) => I.consume(k));
      const taps = I.consumeTaps();
      const ok = confirmed();
      if (this.t < 1.0) return; // 少し待ってから受け付ける
      taps.forEach((pt) => {
        if (inRect(pt, gameOverRect()) && PO.main.sceneName === 'gameOver') this.choose();
      });
      if (ok && PO.main.sceneName === 'gameOver') this.choose();
    },
    render(ctx) {
      PO.draw.menuBackdrop(ctx, this.t);
      PO.draw.scores(ctx, 'corner');
      const pop = Math.min(1, this.t * 6);
      T(ctx, 'GAME OVER', C.W / 2, 104, { size: Math.round(84 * (0.6 + 0.4 * pop)), color: '#ff3a46', align: 'center', italic: true, shadow: '#000', outline: '#000' });
      T(ctx, 'ゲームオーバー', C.W / 2, 166, { size: 26, color: '#fff', align: 'center' });
      T(ctx, 'ROUND ' + this.round + ' RESULT', C.W / 2, 210, { size: 28, color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
      // 総合順位(4 人)
      this.standings.forEach((r, i) => {
        const y = 234 + i * 54;
        const ch = PO.chars.byId(r.charId);
        PO.draw.panel(ctx, 160, y, 640, 50, r.isPlayer ? '#4a1018' : '#1d2160', r.isPlayer ? '#ff3a46' : ch.color);
        T(ctx, PO.draw.ordinal(r.rank), 190, y + 25, { size: 24, color: r.rank === 1 ? '#ffe600' : '#fff' });
        ctx.save();
        ctx.beginPath();
        ctx.rect(270, y + 6, 56, 38);
        ctx.clip();
        PO.chars.drawFace(ctx, r.charId, 270, y + 6, 56, 38);
        ctx.restore();
        T(ctx, ch.name, 344, y + 19, { size: 18, color: ch.color });
        T(ctx, r.isPlayer ? 'YOU' : 'CPU', 346, y + 38, { size: 12, color: r.isPlayer ? '#ffe600' : '#aaa', outline: null });
        T(ctx, r.points + ' PTS', 770, y + 25, { size: 24, align: 'right' });
      });
      // 使ったキャラクター・到達した ROUND・最終得点・ハイスコア
      const pc = PO.chars.byId(this.player);
      T(ctx, (pc ? pc.name + '   ' : '') + 'YOU REACHED ROUND ' + this.round + '   ラウンド' + this.round + 'まで到達', C.W / 2, 464, { size: 17, color: '#9fd0ff', align: 'center' });
      T(ctx, 'FINAL SCORE', C.W / 2 - 16, 502, { size: 22, color: '#ff5cc8', align: 'right' });
      T(ctx, PO.score.text(this.final.score), C.W / 2 + 16, 502, { size: 32, color: '#fff' });
      T(ctx, 'HI-SCORE', C.W / 2 - 16, 540, { size: 18, color: '#ffe600', align: 'right' });
      T(ctx, PO.score.text(PO.score.hi), C.W / 2 + 16, 540, { size: 22, color: '#fff' });
      if (this.final.newHi && Math.floor(this.t * 3) % 2 === 0) T(ctx, 'NEW HI-SCORE!!', C.W / 2, 576, { size: 26, color: '#ffe600', align: 'center', italic: true, shadow: '#ff2fa8' });
      if (this.t >= 1.0) {
        const r = gameOverRect();
        PO.draw.panel(ctx, r.x, r.y, r.w, r.h, '#ff2fa8', '#ffe600');
        T(ctx, 'TITLE', r.x + r.w / 2, r.y + r.h / 2, { size: 26, align: 'center' });
        T(ctx, 'SPACE / ENTER: タイトルへ', C.W / 2, 694, { size: 16, align: 'center', color: '#ccc' });
      }
    },
  };

  // howTo: 操作説明のデモ(js/howto/howto.js)、ceremony: 全 6 種目クリアのあとの表彰式(js/ceremony.js)
  return { title, eventSelect, charSelect, roundIntro, howTo: PO.howto.scene, play, result, ceremony: PO.ceremony.scene, gameOver };
})();
