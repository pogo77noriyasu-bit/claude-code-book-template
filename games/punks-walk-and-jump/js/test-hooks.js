// テスト補助(URL に ?test があるときだけ window.__pw を公開する。通常プレイには影響しない)
(function () {
  if (!/[?&]test\b/.test(location.search)) return;
  const g = PW.game.data;
  const T = PW.config.TILE;
  window.__pw = {
    setManual(on) {
      PW.loop.manual = !!on;
    },
    step(n) {
      for (let i = 0; i < (n || 1); i++) PW.game.update();
    },
    render() {
      PW.renderer.draw(g);
    },
    snapshot() {
      const p = g.player;
      return {
        state: g.state,
        score: g.score,
        hiScore: g.hiScore,
        lives: g.lives,
        stage: g.stage,
        doors: g.doors.slice(),
        doorColors: g.doorColors.slice(),
        heroIndex: g.heroIndex,
        heroColor: g.heroColor,
        timeLeft: g.timeLeft,
        death: g.death,
        player: p && { row: p.row, x: p.x, col: PW.player.nearestCol(p.x), hopping: !!p.hop, face: p.face, bestRow: p.bestRow },
        heroFrame: p && PW.renderer.heroFrame(p),
        diff: g.lanes && g.lanes.diff, // 難易度 { road: 車の速さ, count: 車の台数, river: 浮遊物の速さ, drumPeriod: ドラム缶の周期 }
        extendCount: g.extendCount, // 得点で 1UP した回数
        nextExtend: g.nextExtend, // 次に 1UP する得点
        oneUpTimer: g.oneUpTimer, // 「1UP」を出している残りステップ
        dev: { mode: !!g.devMode, invincible: !!g.devInvincible },
        sounds: PW.audio.log.slice(),
        music: { wanted: PW.audio.musicWanted(), playing: PW.audio.musicPlaying(), soundOn: PW.audio.isOn() },
      };
    },
    // 主人公をマス (col, row) に置く(跳んでいる途中ならやめる)
    placeHero(col, row) {
      const p = g.player;
      p.hop = null;
      p.row = row;
      p.x = PW.player.colX(col);
    },
    // 主人公の x(px、中心)をそのまま決める(川の上で流された位置などを作る)
    setHeroX(x) {
      g.player.x = x;
    },
    // レーン row の物をすべて消す
    clearLane(row) {
      g.lanes.byRow[row].objects.length = 0;
    },
    // レーン row に物を置く(x は左端の px、len はマス数、kind は省略するとレーンの種類)
    addObject(row, x, len, kind, index) {
      const lane = g.lanes.byRow[row];
      lane.objects.push({ x, len: len * T, kind: kind || lane.kind, index: index || 0 });
    },
    // レーンの流れを止める・動かす(速さを 0 にする。元の速さは覚えておく)
    freezeLanes(on) {
      for (const lane of g.lanes.list) {
        if (on) {
          if (lane.saved === undefined) lane.saved = lane.speed;
          lane.speed = 0;
        } else if (lane.saved !== undefined) {
          lane.speed = lane.saved;
          delete lane.saved;
        }
      }
    },
    // すべての道路の車を消す(川のテスト用)
    clearRoads() {
      for (const r of PW.config.ROAD_ROWS) g.lanes.byRow[r].objects.length = 0;
    },
    // 残り時間(ステップ)を決める
    setTime(steps) {
      g.timeLeft = steps;
    },
    // 色 color の主人公の絵一式(形が全色で同じことを確かめる)
    heroBuild(color) {
      const b = PW.hero.build(color);
      return { sprites: b.sprites, palette: b.palette };
    },
    // キャンバスの範囲 (x, y, w, h) の中で、色 hex('#rrggbb')のドットの数を数える
    countColor(x, y, w, h, hex) {
      PW.renderer.draw(g);
      const d = document.getElementById('game').getContext('2d').getImageData(x, y, w, h).data;
      const r = parseInt(hex.slice(1, 3), 16), gg = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      let n = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k] === r && d[k + 1] === gg && d[k + 2] === b) n++;
      return n;
    },
    // 得点を足す(1UP の判定も通る)
    addScore(n) {
      PW.game.addScore(n);
    },
    // ステージ stage の難易度とレーン(作るだけ。いまのゲームは変えない)
    stageInfo(stage) {
      const L = PW.lanes.create(stage);
      return { diff: L.diff, lanes: L.list.map((l) => ({ row: l.row, type: l.type, speed: l.speed, loop: l.loop, count: l.objects.length })) };
    },
    lanes() {
      return g.lanes.list.map((l) => ({ row: l.row, type: l.type, kind: l.kind, dir: l.dir, speed: l.speed, loop: l.loop, objects: l.objects.map((o) => ({ x: o.x, len: o.len, kind: o.kind })) }));
    },
  };
})();
