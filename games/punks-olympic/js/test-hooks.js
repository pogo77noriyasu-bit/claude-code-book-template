// テスト補助(URL に ?test があるときだけ window.__po を作る)
(function () {
  if (!/[?&]test\b/.test(location.search)) return;
  const M = PO.main;
  window.__po = {
    // ループを止めて、step で固定ステップずつ進める
    setManual: (on) => M.setManual(on),
    step(n) {
      for (let i = 0; i < (n || 1); i++) M.tick(PO.config.STEP);
      M.render();
    },
    // 条件を満たすまで進める(最大 maxSteps)。進めたステップ数を返す
    stepUntil(fnSrc, maxSteps) {
      const fn = new Function('s', 'return (' + fnSrc + ')(s)');
      for (let i = 0; i < (maxSteps || 20000); i++) {
        if (fn(window.__po.snapshot())) return i;
        M.tick(PO.config.STEP);
      }
      M.render();
      return -1;
    },
    go: (name, params) => M.go(name, params),
    seed: (v) => PO.rng.seed(v),
    press: (name) => PO.input.press(name, true),
    hold: (name, on) => PO.input.setHeld(name, on), // 押しっぱなし(缶蹴りの角度)
    instance: () => M.scene.instance || null, // 競技中の種目(綱引きのタイミングの計算など)
    snapshot() {
      const sc = M.scene;
      const s = { scene: M.sceneName, sound: PO.sound.log.slice(-20), ignored: PO.input.ignored, score: PO.score.current, hiScore: PO.score.hi };
      if (M.sceneName === 'charSelect') s.cursor = sc.cursor;
      if (M.sceneName === 'eventSelect') s.cursor = sc.cursor;
      if (M.sceneName === 'roundIntro') s.setup = sc.setup;
      if (M.sceneName === 'ceremony') s.ceremony = sc.snapshot(); // 表彰式
      if (M.sceneName === 'howTo') {
        s.setup = sc.setup;
        s.howto = sc.snapshot(); // 操作説明のデモ(光ったボタン・説明の文字・種目ごとの状態)
      }
      if (M.sceneName === 'play') {
        s.setup = sc.setup;
        s.race = sc.instance.snapshot();
      }
      if (M.sceneName === 'result') {
        s.setup = sc.setup;
        s.result = sc.data;
        s.isNew = sc.isNew;
        s.judge = sc.judge; // 通過基準の判定 { clear, value, target, label }
        s.judgeShown = sc.judgeShown;
        s.scoreBreakdown = sc.score; // 累積スコアの内訳 { record, place, target, total, before, after }
        s.menu = sc.menu; // EVENTS / TITLE
        s.cursor = sc.cursor;
        s.race = sc.instance.snapshot();
      }
      return s;
    },
    records: () => PO.records.loadAll(),
    progress: () => PO.progress.snapshot(), // 全 6 種目の進行
    config: PO.config,
    dash: PO.DASH100,
  };
})();
