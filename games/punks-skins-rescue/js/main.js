// PUNKS & SKINS RESCUE: 起動・キー入力・固定ステップ(1/60 秒)のメインループ
(function () {
  const C = PSR.config;
  const canvas = document.getElementById('game');
  canvas.width = C.W;
  canvas.height = C.H;

  const params = new URLSearchParams(location.search);
  const testMode = params.has('test');
  const g = PSR.game.create(testMode ? 1 : undefined);
  PSR.state = g;
  let manual = false; // テストで手動ステップにするとき true

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を読み込めません: ' + src));
      img.src = src;
    });
  }

  // キー入力: 押した瞬間だけ(押しっぱなしのオートリピートは無視して、1 回で 1 地点)
  window.addEventListener('keydown', (e) => {
    PSR.audio.unlock();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (e.repeat) return;
      PSR.game.move(g, e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      // 新しいゲームはタイトル画面からだけ始める(GAME OVER の表示中は無視。4 秒後に自動でタイトルへ戻る)
      if (g.state === 'title') PSR.game.start(g);
    } else if (e.key === 'm' || e.key === 'M') {
      PSR.audio.toggle();
    }
  });

  function tick() {
    PSR.game.step(g);
    if (g.state === 'title') PSR.demo.step(); // タイトル画面のゲーム説明デモ(本編の状態にはさわらない)
    for (const ev of g.events) {
      if (ev === 'title') PSR.demo.reset(); // GAME OVER からタイトルへ戻った: デモは 1 つ目のパターンから
      PSR.audio.play(ev);
    }
    g.events.length = 0;
  }

  const STEP = 1000 / 60;
  let last = 0;
  let acc = 0;
  function loop(now) {
    if (!last) last = now;
    acc += Math.min(250, now - last); // タブが裏に回ったあとにまとめて進めすぎない
    last = now;
    if (!manual) {
      while (acc >= STEP) {
        tick();
        acc -= STEP;
      }
    } else {
      acc = 0;
    }
    PSR.bgm.update(g.state); // BGM: プレイ中だけ鳴らす(タイトルは無音・GAME OVER で止める。js/bgm.js)
    PSR.render.draw(g);
    requestAnimationFrame(loop);
  }

  // 背景: 標準は 8 ビット風(js/gfx-8bit.js)。炎のアニメーションが有効なら、炎を消した背景 + 炎の 4 コマのシート(?fire=0 で止める)。
  //       ?gfx=original のときは元の background.png
  const gfx8 = PSR.gfx8 && PSR.gfx8.enabled;
  const fireOn = gfx8 && PSR.gfx8.FIRE.enabled;
  const bgSrc = fireOn ? PSR.gfx8.FIRE.background : gfx8 ? PSR.gfx8.background : 'background.png';
  // キャバクラ演出の背景(js/club.js): 標準は 8 ビット風に変換した画像、?gfx=original のときは元の nightclub.png。
  // 読み込めなくてもゲームは動く(店内は黒い背景になる)
  const clubSrc = gfx8 ? 'assets-8bit/nightclub_8bit.png' : 'nightclub.png';
  Promise.all([
    loadImage(bgSrc),
    loadImage('../shared/characters/' + POGO77.chars.SKIN.src),
    fireOn ? loadImage(PSR.gfx8.FIRE.sheet) : Promise.resolve(null),
    loadImage(clubSrc).catch(() => null),
  ]).then(([bg, skin, fire, club]) => {
    PSR.render.init(canvas, { bg, skin, fire });
    PSR.club.init(club);
    // 確認用: ?club=ステージ番号 で、そのステージのキャバクラ店内を出したままにする(例: ?club=30。通常のプレイには影響しない)
    const clubPreview = parseInt(params.get('club'), 10);
    if (clubPreview > 0) {
      g.state = 'club';
      g.stage = clubPreview;
      g.clubT = Infinity;
    }
    PSR.ready = true;
    requestAnimationFrame(loop);
  });

  // テスト補助(?test のときだけ公開する。通常プレイには影響させない)
  if (testMode) {
    window.__psr = {
      setManual(on) {
        manual = !!on;
      },
      step(n) {
        for (let i = 0; i < (n || 1); i++) tick();
        PSR.render.draw(g);
      },
      // 指定の条件になるまで進める(最大 max ステップ)。進めたステップ数を返す
      stepUntil(fnSrc, max) {
        const fn = new Function('g', 'return (' + fnSrc + ')');
        let n = 0;
        while (!fn(g) && n < (max || 5000)) {
          tick();
          n++;
        }
        PSR.render.draw(g);
        return n;
      },
      spawn(opts) {
        g.jumpers = [];
        const j = PSR.game.spawn(g, opts);
        return j.targets.slice();
      },
      // 今いる人を消さずに 1 人足す(複数人の同時落下のテスト用)。出せなかったら null
      spawnMore(opts) {
        const j = PSR.game.spawn(g, opts);
        return j ? j.targets.slice() : null;
      },
      setSpawnTimer(n) {
        g.spawnTimer = n;
      },
      // ステージと、そのステージでの救助人数を決める(難易度のテスト用)
      setStage(stage, stageRescued) {
        g.stage = stage;
        g.stageRescued = stageRescued || 0;
      },
      // キャバクラ演出の人数と配置(ステージ stage のとき。読むだけ)
      club(stage) {
        return PSR.club.snapshot(stage);
      },
      // タイトル画面のデモの状態(パターン番号・結果の ○ / × の履歴)
      demo() {
        return PSR.demo.snapshot();
      },
      snapshot() {
        return JSON.parse(
          JSON.stringify({
            state: g.state,
            score: g.score,
            miss: g.miss,
            rescued: g.rescued,
            stage: g.stage,
            stageRescued: g.stageRescued,
            difficulty: PSR.game.difficulty(g),
            lane: g.hostess.lane,
            hostessX: g.hostess.x,
            jumpers: g.jumpers.map((j) => ({ id: j.id, kind: j.kind, side: j.side, result: j.result || null, phase: j.phase, x: j.x, y: j.y, targets: j.targets, idx: j.idx, catches: j.catches })),
          })
        );
      },
    };
  }
})();
