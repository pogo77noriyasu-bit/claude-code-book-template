// ステージクリア後の演出: ゴリラ警官がガールを担いで、2 本の逃走用ハシゴから画面の上へ逃げる
// 段階: 'walk'(ガールの下へ歩く)→ 'reach'(腕を振り上げ、ガールを足場の端へ引き寄せる)
//      → 'lift'(担ぎ上げる)→ 'struggle'(ガールがジタバタ)→ 'carry'(ハシゴへ歩く)
//      → 'climb'(2 本のハシゴを登る)→ 'done'
// ゲームの状態は変えず、自分の中の位置と段階だけを進める(描画は renderer.js)。
window.DP = window.DP || {};

DP.escape = (function () {
  const geo = DP.geometry;

  function cfg() {
    return DP.config.escape;
  }

  // 担いでいるときのガールの位置(ゴリラの右肩の上。x は中心、y は横倒しにした体の中心)。
  // 横倒しのガールは高さ 24px なので、中心を頭の上端(足元 - 48px)より 8px 上にして肩に乗せる
  function carryPos(e) {
    return { x: e.bossX + 14, y: e.bossY - 56 };
  }

  function create(level, boss, heroine) {
    const s = level.stage.escape;
    const g5 = boss.girder;
    const ladderX = (s.ladders[0] + s.ladders[1]) / 2;
    return {
      phase: 'walk',
      t: 0, // 段階ごとの経過ステップ
      total: 0, // 演出全体の経過ステップ
      g5,
      bossX: boss.x,
      bossY: boss.y,
      grabX: s.grabX,
      ladderX,
      // 逃走用ハシゴの下端(g5 の上面)
      ladderBottom: geo.surfaceY(g5, ladderX),
      girlX: heroine.x,
      girlY: heroine.y, // 立っているときは足元、担がれているときは体の中心
      girlStart: { x: heroine.x, y: heroine.y },
      edgeX: s.girlEdgeX, // 引き寄せられる足場の端
      carrying: false,
      walkFrame: 0, // 歩き・登りのコマ(0/1)
      sound: null, // このステップで鳴らしたい音(game.js が鳴らす)
      soundArg: 0, // 音に渡す値(登った段数)
      climbSteps: 0, // ハシゴを登った段数(登る音がだんだん高くなる)
    };
  }

  function lerp(a, b, k) {
    return a + (b - a) * Math.max(0, Math.min(1, k));
  }

  // 8 ステップごとに足を入れ替え、そのたびにドスン(左右の足で音の高さを変える)
  function stepSound(e) {
    const f = Math.floor(e.t / 8) % 2;
    if (f !== e.walkFrame) {
      e.walkFrame = f;
      e.sound = f === 1 ? 'bossStep' : 'bossStep2';
    }
  }

  // 横に歩く(目標に着いたら true)
  function walkTo(e, x, speed) {
    const dir = Math.sign(x - e.bossX);
    e.bossX += dir * speed;
    if ((dir > 0 && e.bossX >= x) || (dir < 0 && e.bossX <= x) || dir === 0) e.bossX = x;
    e.bossY = geo.surfaceY(e.g5, e.bossX);
    stepSound(e);
    return e.bossX === x;
  }

  function next(e, phase) {
    e.phase = phase;
    e.t = 0;
    e.walkFrame = 0;
  }

  // 1 ステップ進める。終わったら true
  function update(e) {
    const c = cfg();
    e.t++;
    e.total++;
    e.sound = null;

    if (e.phase === 'walk') {
      if (walkTo(e, e.grabX, c.walkSpeed)) next(e, 'reach');
    } else if (e.phase === 'reach') {
      // 腕を振り上げたゴリラに、ガールが足場の端へ引き寄せられる
      const k = e.t / c.reachFrames;
      e.girlX = lerp(e.girlStart.x, e.edgeX, k);
      e.girlY = e.girlStart.y;
      if (e.t >= c.reachFrames) next(e, 'lift');
    } else if (e.phase === 'lift') {
      // 足場の端から肩の上へ担ぎ上げる(足元 → 体の中心へ座標の意味が変わるので、中心で補間する)
      e.carrying = true;
      if (e.t === 1) e.sound = 'scream'; // 抱き上げた瞬間に悲鳴
      const from = { x: e.edgeX, y: e.girlStart.y - 16 };
      const to = carryPos(e);
      const k = e.t / c.liftFrames;
      e.girlX = lerp(from.x, to.x, k);
      e.girlY = lerp(from.y, to.y, k) - Math.sin(Math.PI * Math.min(1, k)) * 8;
      if (e.t >= c.liftFrames) next(e, 'struggle');
    } else if (e.phase === 'struggle') {
      // その場で足踏みしながら、ガールがジタバタ
      const p = carryPos(e);
      e.girlX = p.x;
      e.girlY = p.y;
      stepSound(e); // 足踏みのドスン(描画の足踏みと同じ 8 ステップごと)
      if (e.t >= c.struggleFrames) next(e, 'carry');
    } else if (e.phase === 'carry') {
      const arrived = walkTo(e, e.ladderX, c.carrySpeed);
      const p = carryPos(e);
      e.girlX = p.x;
      e.girlY = p.y;
      if (arrived) next(e, 'climb');
    } else if (e.phase === 'climb') {
      // 2 本のハシゴを左右の手で交互につかんで登る
      e.bossX = e.ladderX;
      e.bossY -= c.climbSpeed;
      const f = Math.floor(e.t / 10) % 2;
      if (f !== e.walkFrame) {
        // 手をかけ替えるたびに「ピュッ」。登るほど高くなる
        e.walkFrame = f;
        e.climbSteps++;
        e.sound = 'climb';
        e.soundArg = e.climbSteps;
      }
      const p = carryPos(e);
      e.girlX = p.x + 2; // 登るときは右肩の上(左手がハシゴにかかって見えるよう、少し右寄り)
      e.girlY = p.y;
      // いちばん下にあるゴリラの足元まで画面の上へ出きったら終わり(ガールはそれより上にいる)
      if (e.bossY < -2) next(e, 'done');
    }
    return e.phase === 'done';
  }

  return { create, update };
})();
