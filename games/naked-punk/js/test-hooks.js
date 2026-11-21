// テスト補助(URL に ?test があるときだけ window.__np を公開する。通常プレイには影響しない)
(function () {
  if (!/[?&]test\b/.test(location.search)) return;
  const g = NP.game.data;
  const Z = NP.maze;
  const tileOf = (a) => ({ col: Z.colOf(a.x), row: Z.rowOf(a.y) });
  window.__np = {
    setManual(on) {
      NP.loop.manual = !!on;
    },
    step(n) {
      for (let i = 0; i < (n || 1); i++) NP.game.update();
    },
    render() {
      NP.renderer.draw(g);
    },
    snapshot() {
      const p = g.player;
      return {
        state: g.state,
        stage: g.stage,
        score: g.score,
        hiScore: g.hiScore,
        lives: g.lives,
        badgesLeft: g.badgesLeft,
        badgesTotal: g.badgesTotal,
        wear: Object.assign({}, g.wear),
        clothes: NP.game.clothesCount(),
        powerTimer: g.powerTimer,
        chain: g.chain,
        demoT: g.demoT, // タイトルのデモの経過ステップ
        demo: g.state === 'title' ? NP.demo.frame(g.demoT) : null,
        inter: g.inter && Object.assign({ type: g.inter.type, t: g.inter.t, next: g.inter.next }, { frame: NP.intermission.frame(g.inter.t, g.inter.type) }),
        jingle: { wanted: NP.audio.jingleWanted(), playing: NP.audio.jinglePlaying() },
        nextExtend: g.nextExtend, // 次に 1UP する得点
        extendCount: g.extendCount, // 1UP した回数
        oneUpTimer: g.oneUpTimer, // 「1UP」を表示している残りステップ
        popups: g.popups.map((pp) => ({ text: pp.text, x: pp.x, y: pp.y, t: pp.t })),
        diff: g.diff,
        player: p && { x: p.x, y: p.y, dir: p.dir, want: p.want, face: p.face, moving: p.moving, tile: tileOf(p) },
        heroFrame: p && NP.renderer.heroFrame(g),
        enemies: g.enemies.map((e) => ({ name: e.def.name, ai: e.def.ai, kind: e.def.kind, state: e.state, fright: e.fright, x: e.x, y: e.y, dir: e.dir, timer: e.timer, tile: tileOf(e) })),
        intruders: (g.intruders || []).map((v) => ({ type: v.type, state: v.state, x: v.x, y: v.y, dir: v.dir, face: v.face, t: v.t, aim: v.aim && { dir: v.aim.dir, timer: v.aim.timer }, cooldown: v.cooldown, flash: v.flash, weaponLit: NP.renderer.weaponFlash(v), tile: tileOf(v) })),
        shots: (g.shots || []).map((s) => ({ kind: s.kind, x: s.x, y: s.y, dir: s.dir, dist: s.dist })),
        blasts: (g.blasts || []).map((b) => ({ x: b.x, y: b.y, r: b.r, t: b.t })),
        booms: (g.booms || []).length,
        intruderTimer: g.intruderTimer,
        intruderType: NP.intruders.typeFor(g.stage),
        shake: g.shake,
        dev: { mode: !!g.devMode, invincible: !!g.devInvincible },
        sounds: NP.audio.log.slice(),
        music: { wanted: NP.audio.musicWanted(), playing: NP.audio.musicPlaying(), soundOn: NP.audio.isOn() },
        vehicleSound: { wanted: NP.audio.vehicleWanted(), playing: NP.audio.vehiclePlaying() }, // 乱入キャラクターの巡回音
      };
    },
    // 主人公をマス (col, row) の中心に置いて止める
    placePlayer(col, row, dir) {
      const p = g.player;
      p.x = Z.centerX(col);
      p.y = Z.centerY(row);
      p.dir = dir || null;
      p.want = dir || null;
    },
    // 敵 i をマス (col, row) に置いて外を歩かせる(dir: 向き)
    placeEnemy(i, col, row, dir) {
      const e = g.enemies[i];
      e.state = 'active';
      e.x = Z.centerX(col);
      e.y = Z.centerY(row);
      e.dir = dir || 'left';
    },
    // 敵をすべて交番の中で待たせたままにする(timer を大きく)
    parkEnemies() {
      for (const e of g.enemies) {
        NP.enemies.arrest(e);
        e.timer = 1e9;
      }
    },
    // 乱入キャラクターを出す(side: 'left' | 'right')
    spawnIntruder(type, side) {
      NP.intruders.spawn(g, type, side);
    },
    // 乱入キャラクター i をマス (col, row) に置いて巡回させる(cooldown: 次に構えられるまで)
    placeIntruder(i, col, row, dir, cooldown) {
      const v = g.intruders[i];
      v.state = 'roam';
      v.x = Z.centerX(col);
      v.y = Z.centerY(row);
      v.dir = dir || null;
      v.face = dir || v.face;
      v.aim = null;
      v.burst = 0;
      v.cooldown = cooldown || 0;
    },
    // 乱入キャラクター i が巡回を始めてからのステップ数を決める(退場のテスト用)
    setIntruderTime(i, t) {
      g.intruders[i].t = t;
    },
    // 爆風を置く(当たり判定のテスト用)
    addBlast(x, y, r) {
      g.blasts.push({ x, y, r, t: 30, life: 30, hit: 20 });
    },
    // マス (col, row) のアイテム
    item(col, row) {
      return g.items[row][col];
    },
    // 缶バッジを n 個だけ残して取ったことにする(得点は入らない)
    leaveBadges(n) {
      let left = g.badgesLeft;
      for (const row of g.items)
        for (let c = 0; c < row.length; c++)
          if (row[c] === 'badge' && left > n) {
            row[c] = null;
            left--;
          }
      g.badgesLeft = left;
    },
    // 残っている缶バッジのマス
    badgeTiles() {
      const out = [];
      g.items.forEach((row, r) => row.forEach((it, c) => it === 'badge' && out.push({ col: c, row: r })));
      return out;
    },
    // 服 name を着たことにする / 迷路から消す
    wearClothes(name) {
      g.wear[name] = true;
      g.items.forEach((row) => row.forEach((it, c) => it === 'clothes:' + name && (row[c] = null)));
    },
    // 敵 i が狙っているマス
    target(i) {
      return NP.enemies.target(g.enemies[i], g);
    },
    // 敵 i の、いまの位置での次の向き(状態は変えない)
    choose(i) {
      return NP.enemies.choose(g.enemies[i], g);
    },
    // 迷路の情報
    mazeInfo() {
      return { walkable: Z.countWalkable(), cols: NP.config.COLS, rows: NP.config.ROWS };
    },
    playerCan(col, row) {
      return Z.playerCan(col, row);
    },
    // 服の組み合わせ wear のときの絵 name
    heroSprite(name, wear) {
      return NP.outfit.sprite(name, wear || {});
    },
    addScore(n) {
      NP.game.addScore(n);
    },
    // キャンバスの範囲 (x, y, w, h) の中で、色 hex('#rrggbb')のドットの数を数える
    countColor(x, y, w, h, hex) {
      NP.renderer.draw(g);
      const d = document.getElementById('game').getContext('2d').getImageData(x, y, w, h).data;
      const r = parseInt(hex.slice(1, 3), 16),
        gg = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
      let n = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k] === r && d[k + 1] === gg && d[k + 2] === b) n++;
      return n;
    },
    bgm() {
      const B = NP.audio.BGM;
      return { bpm: B.bpm, steps: B.steps, bars: B.bars.length, seconds: (B.steps * 60) / B.bpm / 2, bass: B.bars.map((b) => b.bass), lead: B.bars.map((b) => b.lead) };
    },
  };
})();
