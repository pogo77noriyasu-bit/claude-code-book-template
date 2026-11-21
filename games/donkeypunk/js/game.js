// ゲーム全体の進行(状態遷移・スコア・残機・当たり判定のまとめ)
// 状態: 'title' | 'ready' | 'playing' | 'escape'(クリア後の逃走演出) | 'collapse'(4 面のエンディング) | 'clear'
//       | 'intermission'(1〜3 面のあとの面間演出) | 'dying' | 'gameover'
window.DP = window.DP || {};

DP.createGame = function () {
  const C = DP.config;
  const geo = DP.geometry;

  // 乱数(テストでは種を固定できるよう差し替え可能にしている)
  let rng = Math.random;

  const g = {
    state: 'title',
    timer: 0, // 状態ごとの経過ステップ
    frame: 0, // 通算ステップ(アニメ用)
    score: 0,
    hiScore: loadHiScore(),
    lives: C.lives,
    nextExtend: C.score.extendEvery, // 次に 1UP する得点(10,000 点ごと)
    round: 1, // 周回数(全ステージを回ると +1)
    stageIndex: 0,
    level: null,
    player: null,
    boss: null,
    heroine: null,
    hazards: [],
    enemies: [], // 敵(2 面のファイヤースカルなど)。動きは仕掛け、当たり判定と撃破はここで共通に行う
    skullsEnabled: true, // テスト用にファイヤースカルの出現を止められるようにしている
    copsEnabled: true, // テスト用に怒ったポリスマン(4 面)の出現を止められるようにしている
    birdsEnabled: true, // テスト用に 3 面のパンクニワトリの出現を止められるようにしている
    riotEnabled: true, // テスト用に 4 面のヘリ(機動隊員の投下)を止められるようにしている
    bazookaEnabled: true, // テスト用に 2 面のゴリラ警官のバズーカ(蛇行ミサイル)を止められるようにしている
    escape: null, // クリア後の逃走演出(DP.escape)。演出中だけ使う
    collapse: null, // 4 面のクリア演出(DP.collapse。鉄骨崩壊 → 拳銃乱射 → ゴリラ落下 → ガール救出)。演出中だけ使う
    clearBonus: 0, // 4 面のクリアで足した得点(ROUND CLEAR の表示用)
    items: [], // 鉄骨の上に置かれたアイテム(釘バット)
    effects: [], // ビールが割れたときの破片
    popups: [], // 得点表示などの浮かぶ文字
    bonus: C.score.bonusStart,
    deathReason: null,
    message: '',
  };

  function loadHiScore() {
    try {
      return parseInt(localStorage.getItem(C.storageKeys.highScore), 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveHiScore() {
    // DEV モード(開発環境で ?dev)のときはハイスコアを保存しない(画面の HI も変えない)。
    // 面・周回の指定や無敵で出した得点で、本番のハイスコアを上書きしないため。得点の計算そのものは通常どおり
    if (g.devMode) return;
    if (g.score <= g.hiScore) return;
    g.hiScore = g.score;
    try {
      localStorage.setItem(C.storageKeys.highScore, String(g.hiScore));
    } catch (e) {
      /* 保存できなくても続行 */
    }
  }

  // 周回が進むほど速く・頻繁にする(4 面ができたら「4 面クリア後に周回」で使う)
  function difficulty() {
    const r = g.round - 1;
    return {
      speedMul: Math.min(1.8, 1 + 0.15 * r),
      throwMul: Math.max(0.5, 1 - 0.12 * r),
      round: g.round, // 1 面の周回ごとの難しさ(ステージデータの roundRules)を選ぶため
    };
  }

  function addScore(n, x, y) {
    g.score += n;
    if (x !== undefined) g.popups.push({ text: String(n), x, y, t: 0 });
    // 得点による 1UP: 10,000 点・20,000 点・30,000 点…を越えるたびに 1 機。1 回の加点で 2 つ越えたら 2 機。
    // 次の目標(nextExtend)を進めるので、同じ得点で二重には増えない
    while (g.score >= g.nextExtend) {
      g.nextExtend += C.score.extendEvery;
      extraLife();
    }
    saveHiScore();
  }

  // 残機を 1 機増やす(得点による 1UP・4 面クリアで次の周回へ進んだとき)。「ピロロ～ン♪」(extend)
  function extraLife() {
    g.lives++;
    g.extends = (g.extends || 0) + 1; // テスト・確認用: 増えた回数
    DP.audio.play('extend');
  }

  // ジャンプで真下を飛び越えた物(ビール・3 面のパンクニワトリ)に得点を与える。
  // 主人公が空中にいて、obj が真下(横のずれ 6px 未満・高さの差 48px 未満)にいれば jumpOver 点と得点表示・効果音。
  // obj.jumpedOver の印を付けるので、同じ物からは 1 回しか入らない。
  // accept(p) を渡すと、それが true のときだけ加点する(鳥の「同じ床から跳んだときだけ」など)。加点したら true
  // 敵の種類ごとの処理(当たり判定・当たらない状態か)。2 面のファイヤースカル / 4 面の怒ったポリスマン
  function enemyKind(e) {
    return e.type === 'cop' ? DP.cops : e.type === 'riot' ? DP.riot : DP.skulls;
  }

  // obj が真下を通ったか(主人公が空中で、obj が真下 = 横のずれ 6px 未満・高さの差 48px 未満)。通ったら obj.jumpedOver の印を付けて true。
  // 同じ物は 1 回だけ。accept(p) を渡すと、それが true のときだけ(鳥の「同じ床から跳んだときだけ」など)
  function passedUnder(obj, accept) {
    const p = g.player;
    if (p.state !== 'air' || obj.jumpedOver) return false;
    const below = obj.y > p.y && obj.y - p.y < 48;
    if (!below || Math.abs(obj.x - p.x) >= 6) return false;
    if (accept && !accept(p)) return false;
    obj.jumpedOver = true;
    return true;
  }

  // 真下を通った物に、その場で jumpOver 点(100 点)と得点表示・効果音(2 面のスカル・3 面の鳥・4 面のポリスマン・1 面のゴミ箱)。加点したら true
  function checkJumpOver(obj, accept) {
    if (!passedUnder(obj, accept)) return false;
    const p = g.player;
    addScore(C.score.jumpOver, p.x, p.y - 34);
    DP.audio.play('score');
    return true;
  }

  // 1 面の 2 個セット(くっついている間): ジャンプ中に真上を通ったら「越えかけ」の印(そのジャンプの番号)を付け、
  // 2 個とも主人公の後ろへ抜けた(横に重ならなくなった)ときに true(同じジャンプのうちに越えかけたものだけ)。
  // 後ろの 1 個に当たったときは、そのステップでミスになってここまで来ない
  function checkPairJumpOver(h) {
    const p = g.player;
    if (h.jumpedOver) return false;
    if (p.state === 'air' && h.y > p.y && h.y - p.y < 48 && Math.abs(h.x - p.x) < 6) h.overJumpId = p.jumpId;
    if (h.overJumpId === undefined) return false;
    const hb = DP.hazards.hitbox(h);
    const pb = DP.hazards.playerHitbox(p);
    if (Math.abs(h.x - p.x) * 2 < hb.w + pb.w) return false; // まだ真下を通っている
    h.jumpedOver = true;
    return h.overJumpId === p.jumpId;
  }

  // 1 面の瓶・缶の飛び越え: 1 回のジャンプで飛び越えた個数を数えておき(p.jumpTally)、着地したときに
  // 50 × 個数 × (個数 + 1) 点をまとめて 1 回だけ加点する(得点表示・効果音も 1 回)。ジャンプ中にミスしたら加点しない(数えた個数は捨てる)。
  // 次のジャンプには持ち越さない(踏み切るたびに 0 から数え直す)
  function tallyJump(n) {
    const p = g.player;
    if (!p.jumpTally || p.jumpTally.id !== p.jumpId) p.jumpTally = { id: p.jumpId, count: 0 };
    p.jumpTally.count += n;
  }
  function settleJumpTally() {
    const p = g.player;
    const t = p.jumpTally;
    if (!t || p.state === 'air' || p.state === 'dead') return;
    p.jumpTally = null;
    if (t.count <= 0) return;
    addScore(C.score.jumpComboUnit * t.count * (t.count + 1), p.x, p.y - 34);
    DP.audio.play('score');
  }

  function setState(s, message) {
    g.state = s;
    g.timer = 0;
    g.message = message || '';
  }

  // ステージを組み立て直して、プレイヤーを開始位置に置く(ミス後もここから再開)。
  // carry: ミスのあとだけ渡す、仕掛けごとの引き継ぎ(carryOver() の戻り値。4 面の抜いたピン)。
  // 新しいゲーム・次の面・次の周回では渡さないので、すべて初期状態に戻る
  function setupStage(carry) {
    const stage = DP.stages[g.stageIndex];
    g.level = geo.buildLevel(stage);
    // 組み立てのときに準備がいる仕掛け(3 面のリフトなど)。周回で速さが変わるので g も渡す
    for (const name of stage.mechanics || []) {
      const m = DP.mechanics[name];
      if (m && m.setup) m.setup(g.level, g);
    }
    g.player = DP.player.create(g.level);
    const prevEnabled = g.boss ? g.boss.enabled : true;
    g.boss = DP.enemies.createBoss(g.level, difficulty(), () => rng());
    g.boss.enabled = prevEnabled;
    g.heroine = DP.enemies.createHeroine(g.level);
    // ミス前の状態を引き継ぐ仕掛け(4 面のピンと穴)。主人公とゴリラを作ったあとに戻す
    // (穴の右側に来たゴリラの足場を付け替えるため)。1〜3 面の仕掛けは restore を持たないので何もしない
    if (carry) {
      for (const name of stage.mechanics || []) {
        const m = DP.mechanics[name];
        if (m && m.restore && carry[name]) m.restore(g.level, carry[name], [g.player, g.boss]);
      }
    }
    g.hazards = []; // 開始時(ミス後の再開も)の鉄骨の上に瓶・缶はない。1 面の瓶・缶はすべてゴリラが投げて出す
    g.enemies = [];
    // アイテムはステージのデータから毎回置き直す(ミスすると元の場所に戻る)。
    // 鉄骨から少し浮かせて置き、y はアイテムの下端
    g.items = (stage.items || []).map((it) => {
      const gd = g.level.byId[it.girder];
      return { type: it.type, x: it.x, y: geo.surfaceY(gd, it.x) - C.bat.itemFloat, taken: false };
    });
    g.effects = [];
    g.popups = [];
    g.escape = null;
    g.collapse = null;
    g.intermission = null;
    g.clearBonus = 0;
    g.bonus = C.score.bonusStart;
    g.deathReason = null;
    g.devSafe = null; // DEV の無敵: 落ちたときの戻り先(この面で最後に立った足場)
    setState('ready', stage.name);
  }

  // stageIndex: 始める面(0 = 1 面)。通常は 0。開発用ショートカットだけが別の面を指定する
  function newGame(stageIndex) {
    g.score = 0;
    g.lives = C.lives;
    g.nextExtend = C.score.extendEvery;
    g.extends = 0;
    g.round = 1;
    g.stageIndex = stageIndex || 0;
    g.boss = null;
    setupStage();
    DP.audio.play('start');
  }

  function nextStage() {
    const from = g.stageIndex;
    // 開発中の面(ステージデータで devOnly: true)は通常の並びでは飛ばす(開発用ショートカット・テスト補助からだけ始められる)
    do {
      g.stageIndex++;
      if (g.stageIndex >= DP.stages.length) {
        // 全ステージを回ったら最初に戻って難易度アップ。4 面クリアで次の周回へ進むたびに 1UP
        // (クリアの得点で 10,000 点を越えていれば、そちらの 1UP と合わせて 2 機増える)
        g.stageIndex = 0;
        g.round++;
        extraLife();
      }
    } while (DP.stages[g.stageIndex].devOnly);
    // 1〜3 面のあと(次が 2〜4 面)は、面間演出(やぐらを積み上げる)を流してから次の面を組み立てる。
    // 4 面のあと(次の周回の 1 面)は演出なし(4 面のエンディングのまま)。周回で分岐しないので、どの周も同じ演出
    if (DP.intermission && DP.intermission.has(from, g.stageIndex)) {
      g.intermission = DP.intermission.create(from, g.stageIndex);
      setState('intermission');
      return;
    }
    setupStage();
  }

  // 面間演出を 1 ステップ進める。終わったら(または開始から skipAfter ステップ後に ENTER で飛ばしたら)次の面の READY へ。
  // 演出中は updatePlaying を呼ばないので、主人公・得点・残機・ボーナスは変わらない(飛ばしても同じ)
  function updateIntermission(input) {
    const it = g.intermission;
    const done = DP.intermission.update(it);
    for (const name of it.sounds) DP.audio.play(name);
    const skip = g.timer > C.intermission.skipAfter && input.wasPressed('start');
    if (done || skip) {
      g.intermission = null;
      setupStage();
    }
  }

  // ミスで組み立て直す前に、引き継ぐ仕掛けの状態を集める({ 仕掛けの名前: 状態 })。
  // carry を持つ仕掛け(4 面の pins)だけが対象で、1〜3 面では null(今までどおり全部組み立て直す)
  function carryOver() {
    let carry = null;
    for (const name of g.level.stage.mechanics || []) {
      const m = DP.mechanics[name];
      if (m && m.carry) {
        carry = carry || {};
        carry[name] = m.carry(g.level);
      }
    }
    return carry;
  }

  // ミスの演出の長さ(ステップ数)
  function dyingFrames(reason) {
    const by = C.timing.dyingByReason || {};
    return by[reason] || C.timing.dying;
  }

  // 主人公をミスにする。reason: 'fall' | 'hazard' | 'boss' | 'burn'(炎上。爆音アンプ・将来のファイヤースカル)。
  // すでにミスしているときは何もしない(残機が二重に減らない)
  // 主人公をミスにする。本当にミスになったら true を返す(呼び出し側は true のときだけ、そのステップの残りの処理をやめる)。
  // DEV モードの無敵中(開発環境で ?dev のときだけ。js/dev-tools.js)は、敵・障害物・落下のどれでもミスにしない(残機も減らない)。
  // 落下で画面の下へ出てしまったときだけ、最後に立っていた安全な足場へ戻す
  function killPlayer(reason) {
    if (g.player.state === 'dead') return false;
    if (devInvincible()) {
      if (reason === 'fall') recoverFromFall();
      return false;
    }
    g.player.state = 'dead';
    g.deathReason = reason;
    setState('dying');
    DP.audio.play('miss');
    return true;
  }

  // DEV モードの無敵が有効か。devMode は dev-tools.js が URL に ?dev があるときだけ立てるので、通常プレイでは必ず false
  function devInvincible() {
    return g.devMode === true && g.devInvincible === true;
  }

  // 無敵中に、最後に立っていた安全な足場(リフト以外)を覚えておく。画面の下へ落ちたときの戻り先
  function rememberSafeGround(p) {
    if (!devInvincible() || p.state !== 'ground' || !p.girder || p.girder.kind === 'lift') return;
    g.devSafe = { id: p.girder.id, x: p.x };
  }

  // 無敵中の落下: 着地してから「高すぎた」と分かったときは、そのまま立っていればよい(何もしない)。
  // 画面の下へ出てしまったとき(3 面の縦穴など、下に足場がない)は、覚えておいた足場へ戻す。
  // その鉄骨がなくなっている(4 面のピンで分かれた)ときは同じ床の x を含む鉄骨、それもなければスタート位置
  function recoverFromFall() {
    const p = g.player;
    if (p.state !== 'air' || p.y <= C.HEIGHT) return;
    const lv = g.level;
    const usable = (q, x) => q && q.kind !== 'lift' && x >= q.x1 + 4 && x <= q.x2 - 4;
    let gd = null;
    let x = 0;
    const safe = g.devSafe;
    if (safe) {
      x = safe.x;
      gd = lv.girders.find((q) => q.id === safe.id && usable(q, x)) ||
        lv.girders.find((q) => (q.floor || q.id) === safe.id.split('@')[0] && usable(q, x)) || null;
    }
    if (!gd) {
      x = lv.stage.playerStart.x;
      gd = lv.byId[lv.stage.playerStart.girder];
    }
    p.state = 'ground';
    p.girder = gd;
    p.ladder = null;
    p.x = x;
    p.y = geo.surfaceY(gd, x);
    p.vx = 0;
    p.vy = 0;
    p.fallFromY = p.y;
    g.devRecovered = (g.devRecovered || 0) + 1; // テストと画面の確認用(戻った回数)
  }

  function spawnHazard(type, girderId, x) {
    const h = DP.hazards.create(g.level, type, x, girderId, difficulty().speedMul);
    g.hazards.push(h);
    return h;
  }

  // 浮いている釘バットの当たり判定(描画と同じ位置・大きさ)
  function itemHitbox(it) {
    return { x: it.x, y: it.y, w: C.bat.itemWidth, h: C.bat.itemHeight };
  }

  // 釘バット: 拾う・残り時間を減らす
  function updateBat(p) {
    if (p.bat > 0) {
      p.bat--;
      p.batTime++;
      // 残りわずかになったら 0.5 秒ごとに警告音
      if (p.bat > 0 && p.bat <= C.bat.warnAt && p.bat % 30 === 0) DP.audio.play('batTick');
      if (p.bat === 0) {
        p.batTime = 0;
        DP.audio.play('batEnd');
      }
      return;
    }
    // 持っていないときだけ、ジャンプ中(空中)に実際に触れたら拾える。
    // 高さ的にも歩きでは届かないが、念のため空中にいるときだけ判定する
    if (p.state !== 'air') return;
    const pb = DP.player.hitbox(p);
    for (const it of g.items) {
      if (it.taken || it.gone) continue;
      if (geo.overlaps(pb, itemHitbox(it))) {
        it.taken = true;
        p.bat = C.bat.duration;
        p.batTime = 0;
        DP.audio.play('batGet');
        break;
      }
    }
  }

  // 釘バットの攻撃範囲に入ったビールを割る
  function smashHazards(p) {
    const bb = DP.player.batHitbox(p);
    if (!bb) return;
    for (const h of g.hazards) {
      if (h.dead || !geo.overlaps(bb, DP.hazards.hitbox(h))) continue;
      h.dead = true;
      h.smashed = true;
      if (DP.hazards.isPair(h)) {
        // 1 面の 2 個セット: 2 個ぶん割れる演出、得点は 2 個まとめて 300 点を 1 回、破壊音も 1 回
        const base = DP.hazards.baseType(h.type);
        const d = DP.hazards.pairDims(base);
        const stack = h.state === 'ladder';
        for (const k of [-1, 1]) {
          g.effects.push(stack
            ? { x: h.x, y: h.y - 5 - (k > 0 ? d.stackStep : 0), t: 0, type: base }
            : { x: h.x + (k * d.step) / 2, y: h.y - 5, t: 0, type: base });
        }
        addScore(C.score.pairSmash, h.x, h.y - 20);
      } else {
        g.effects.push({ x: h.x, y: h.y - 5, t: 0, type: h.type });
        // 2 個セットの片割れは 150 点(セット合計で最大 300 点)。単体は今までどおり 300 点
        addScore(h.piece ? C.score.pairPiece : C.score.smash, h.x, h.y - 20);
      }
      DP.audio.play('smash');
    }
    g.hazards = g.hazards.filter((h) => !h.dead);
    // 敵(2 面のファイヤースカル・4 面の怒ったポリスマン)も釘バットで倒せる。
    // スカルはドクロが砕けて炎が消える演出(effects の type: 'skull')、ポリスマンは制帽が飛んで星が散る(type: 'cop')。
    // 倒した敵は消える。ポリスマンは仕掛け 'cops' の通常の出現ルール(人数が上限より少なく、出現の間隔がたったら)でまた出る
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (e.type === 'skull') {
        if (e.state === 'emerge' || e.state === 'spawn') continue; // まだ炎の中(姿を現していない)
        if (!geo.overlaps(bb, DP.skulls.hitbox(e))) continue;
        e.dead = true;
        g.effects.push({ x: e.x, y: e.y - 8, t: 0, type: e.type });
        addScore(C.score.skull, e.x, e.y - 24);
        DP.audio.play('smash');
      } else if (e.type === 'cop') {
        // 現れている途中(点滅)・穴から落ちている・気絶している間は、主人公にも当たらないのでバットも届かない(得点の二重取りを防ぐ)
        if (DP.cops.isHarmless(e)) continue;
        if (!geo.overlaps(bb, DP.cops.hitbox(e))) continue;
        e.dead = true;
        g.effects.push({ x: e.x, y: e.y - 14, t: 0, type: 'cop', dir: e.dir || 1 });
        addScore(C.score.copSmash, e.x, e.y - 40);
        DP.audio.play('smash'); // 既存の敵と同じ破壊音
        DP.mechanics.cops.onSmashed(g.level, g.round); // 代わりが出るまでの待ち時間(出現の間隔の 2 倍)
      } else if (e.type === 'riot') {
        // 4 面の機動隊員: 1,000 点。降下中・落ちている・気絶している間は主人公にも当たらないのでバットも届かない
        if (DP.riot.isHarmless(e)) continue;
        if (!geo.overlaps(bb, DP.riot.hitbox(e))) continue;
        e.dead = true; // 当たり判定はすぐ消える(同じステップのうちに外す)ので、二重に加点しない
        g.effects.push({ x: e.x, y: e.y - 14, t: 0, type: 'riot', dir: p.facing || 1, life: 40 });
        addScore(C.score.riotSmash, e.x, e.y - 40);
        DP.audio.play('riotDown');
      }
    }
    g.enemies = g.enemies.filter((e) => !e.dead);
  }

  // クリア後の逃走演出を始める。通常プレイの処理はここで止める
  // (演出中は updatePlaying を呼ばないので、操作・障害物・当たり判定・ボーナス減少も止まる)
  function startEscape() {
    const p = g.player;
    g.hazards = []; // 残っているビールは片付ける
    g.enemies = []; // 敵も片付ける
    if (g.level.birds) g.level.birds = []; // 3 面のパンクニワトリも
    DP.mechanics.bazooka.clear(g.level); // 2 面の蛇行ミサイル・煙・爆発も(ゴリラは構えを解く)
    p.bat = 0; // 釘バットは手放す(BGM は updateMusic の条件から外れて止まる)
    p.batTime = 0;
    p.walkTime = 0;
    g.boss.state = 'idle';
    g.boss.holding = null;
    g.escape = DP.escape.create(g.level, g.boss, g.heroine);
    setState('escape');
    // BGM はその場で止める(開発用ショートカットのように update の外から呼ばれても止まるように)
    updateMusic();
  }

  // 4 面: 8 本目の安全ピンを抜いた瞬間に、クリア演出(鉄骨崩壊 → 拳銃乱射 → ゴリラ落下 → ガール救出)を始める。
  // 演出中は updatePlaying を呼ばないので、操作・当たり判定・落下のミス・ボーナス減少は止まる
  function startCollapse() {
    if (g.state !== 'playing') return;
    const p = g.player;
    g.hazards = [];
    g.enemies = []; // ポリスマン・機動隊員は、歩いている・現れている途中・降下中・落ちている・気絶しているどれでも全員消す(エンディングには出さない)
    DP.mechanics.riot.clear(g.level); // ヘリ・銃弾も片付ける(ローター音はヘリが消えれば鳴らない)
    p.bat = 0;
    p.batTime = 0;
    p.walkTime = 0;
    g.boss.state = 'idle';
    g.boss.holding = null;
    // 取っていないボーナスアイテムは消える(演出の中には出さない。取ったかどうかの記録は残す)
    if (g.level.prizes) for (const pz of g.level.prizes) if (!pz.taken) pz.gone = true;
    // 取っていない釘バットも消す(崩れる鉄骨と一緒に空中に残らないように)
    for (const it of g.items) if (!it.taken) it.gone = true;
    g.collapse = DP.collapse.create(g.level, p, g.boss, g.heroine);
    setState('collapse');
    DP.audio.play('clank'); // 8 本目を抜いた瞬間の「ガキン!」
    updateMusic(); // BGM はその場で止める
  }

  function updateCollapse() {
    const c = g.collapse;
    const prevPhase = c.phase;
    const done = DP.collapse.update(c);
    for (const name of c.sounds) DP.audio.play(name);
    // 鉄骨が崩れ終わったら、レベルからも地面以外の鉄骨とハシゴを消す(クリア表示でも元に戻らない)
    if (prevPhase === 'crumble' && c.phase !== 'crumble') {
      const ground = g.level.byId[g.level.stage.playerStart.girder];
      g.level.girders = [ground];
      g.level.ladders = [];
    }
    if (done) {
      // 2 人が画面の中央に並んだ位置で、クリア表示へ。得点はここで 1 回だけ足す
      const m = DP.collapse.meetX();
      const ground = g.level.byId[g.level.stage.playerStart.girder];
      Object.assign(g.player, { x: m.player, y: c.groundY, state: 'ground', girder: ground, facing: 1, vx: 0, vy: 0, ladder: null });
      g.heroine.x = m.girl;
      g.heroine.y = c.groundY;
      g.boss.gone = true;
      if (!c.scored) {
        c.scored = true;
        g.clearBonus = C.score.clearBase * g.round + g.bonus;
        addScore(g.clearBonus);
      }
      setState('clear', 'ROUND CLEAR');
      DP.audio.play('clear');
    }
  }

  function updateEscape() {
    const done = DP.escape.update(g.escape);
    if (g.escape.sound) DP.audio.play(g.escape.sound, g.escape.soundArg);
    if (done) {
      // 2 人とも画面の上へ消えた。いつものクリア表示へ
      g.boss.gone = true;
      g.heroine.gone = true;
      setState('clear', 'Oi! Oi! Oi!');
      DP.audio.play('clear');
    }
  }

  // ステージデータの mechanics に書かれた仕掛けを順に動かす(js/mechanics.js)
  const mechanicsCtx = {
    g,
    rng: () => rng(),
    spawnHazard: (type, girderId, x) => spawnHazard(type, girderId, x),
    audio: DP.audio,
    killPlayer: (reason) => killPlayer(reason), // 本当にミスになったら true(DEV の無敵中は false)
    addScore: (n, x, y) => addScore(n, x, y),
    checkJumpOver: (obj, accept) => checkJumpOver(obj, accept),
    startCollapse: () => startCollapse(),
  };
  function updateMechanics() {
    const names = g.level.stage.mechanics || [];
    for (const name of names) {
      DP.mechanics[name].update(mechanicsCtx);
      // 4 面: 8 本目のピンでクリア演出に入ったら、同じステップで残りの仕掛け(ポリスマンの出現など)を動かさない
      // (エンディングにポリスマンが残る不具合の修正。1〜3 面の仕掛けはクリア演出に入らないので影響しない)
      if (g.state === 'collapse') break;
    }
    // ゴリラを動かす仕掛けがない面でも、待機アニメ(ときどき腕を上げる)は進める
    if (!names.includes('beerThrow')) DP.enemies.idleBoss(g.boss);
  }

  // プレイ中の 1 ステップ
  function updatePlaying(input) {
    const p = g.player;
    const ev = DP.player.update(p, g.level, input);
    if (ev.jumped) DP.audio.play('jump');
    // ジャンプで踏み切った高さ(歩いて踏み外したときは null)。3 面のパンクニワトリの回避ボーナスで
    // 「その鳥のラインの床から跳んだか」を見るのに使う。空中にいない間は消す
    // jumpId: ジャンプするたびに増える番号(2 面のスカルの回避ボーナスを「1 回のジャンプで 1 体 1 回」にするため)
    if (ev.jumped) {
      p.jumpFromY = p.y;
      p.jumpId = (p.jumpId || 0) + 1;
      p.jumpTally = { id: p.jumpId, count: 0 }; // 1 面の瓶・缶の飛び越えの個数(着地で加点)
    } else if (p.state !== 'air') p.jumpFromY = null;
    // 足音(地上を歩いているときだけ player.js が出す)。釘バット使用中は BGM があるので鳴らさない
    if (ev.step && !(p.bat > 0)) DP.audio.play(ev.step);
    if (ev.died && killPlayer(ev.died)) return;
    rememberSafeGround(p);

    updateBat(p);

    // ステージごとの仕掛け(1 面はゴリラ警官のビール投下、2 面はコンベアと爆音アンプ)
    updateMechanics();
    if (g.state !== 'playing') return; // 仕掛けでミスになった(アンプで炎上など)

    // 障害物を動かす
    for (const h of g.hazards) DP.hazards.update(h, g.level, () => rng(), p);
    // 1 面のゴミ箱が角で倒れた「ガタン」(何個転がっていても 6 ステップに 1 回まで)
    let thud = false;
    for (const h of g.hazards) if (h.thud) { h.thud = false; thud = true; }
    if (thud && g.frame - (g.lastThud || -99) >= 6) { g.lastThud = g.frame; DP.audio.play('trashThud'); }
    // 1 面の 2 個セットがハシゴで 1 個だけ降りた(パターン B): 単体 2 つ(片割れ)に置き換える
    const born = [];
    for (const h of g.hazards) if (h.splitInto) born.push(...h.splitInto);
    g.hazards = g.hazards.filter((h) => !h.dead).concat(born);

    // 釘バットで割る(体に当たるより先に判定する)
    smashHazards(p);

    // 当たり判定(ジャンプ中も含めて毎ステップ行う)
    const pb = DP.player.hitbox(p);
    // ビール瓶・缶とは少し小さい箱(額のてっぺん・体の端をかすめた程度ではミスにしない)。敵・ゴリラは pb のまま
    const hb = DP.hazards.playerHitbox(p);
    for (const h of g.hazards) {
      if (geo.overlaps(hb, DP.hazards.hitbox(h))) {
        // burns の付いた障害物(将来のファイヤースカルなど)は炎上のミス
        if (killPlayer(h.burns ? 'burn' : 'hazard')) return;
      }
    }
    // 敵(ファイヤースカル・怒ったポリスマン)。出現の間などは当たらない。burns なら炎上のミス
    for (const e of g.enemies) {
      const kind = enemyKind(e);
      if (kind.isHarmless(e)) continue;
      if (geo.overlaps(pb, kind.hitbox(e))) {
        if (killPlayer(e.burns ? 'burn' : 'hazard')) return;
      }
    }
    if (geo.overlaps(pb, DP.enemies.bossHitbox(g.boss))) {
      if (killPlayer('boss')) return;
    }

    // ジャンプで飛び越えたら得点(真下を通過した障害物 1 つにつき 1 回)
    // 1 面の瓶・缶は、このジャンプで飛び越えた個数を数える(単体・分かれた片割れは 1 個、2 個セットは 2 個とも越えたら 2 個)。
    // 加点は着地したとき(settleJumpTally)。ゴミ箱は今までどおり、真下を通ったその場で 100 点
    for (const h of g.hazards) {
      if (h.type === 'trash') checkJumpOver(h);
      else if (DP.hazards.isPair(h)) { if (checkPairJumpOver(h)) tallyJump(2); }
      else if (passedUnder(h)) tallyJump(1);
    }
    // 2 面のファイヤースカルもジャンプで飛び越えたら 100 点(ビールと同じ checkJumpOver。当たってミスになったステップでは入らない)。
    // スカルは消えずに歩き回るので、印 jumpedOver はジャンプごとに付け直す: 同じジャンプの間は同じスカルから 1 回だけ、
    // 次のジャンプでまた飛び越えればまた入る。歩いている(walk)スカルだけで、出現・飛び出し中(当たらない間)やハシゴの上は対象外。
    // そのスカルの床から跳んだときだけ(踏み切った高さとスカルの足元の差が jumpOverFloor 以内。上の段から落ちながら通っても入らない)
    // 4 面の怒ったポリスマンも同じ(歩いている・振り向きの予告中だけ。落ちている・気絶している間は対象外)
    for (const e of g.enemies) {
      const walking = e.type === 'skull' ? e.state === 'walk' && !DP.skulls.isHarmless(e)
        : e.type === 'riot' ? DP.riot.canJumpOver(e) : e.type === 'cop' && DP.cops.canJumpOver(e);
      if (!walking) continue;
      if (e.jumpedOverId !== p.jumpId) e.jumpedOver = false;
      const floorTol = (e.type === 'cop' ? C.cop : e.type === 'riot' ? C.riot : C.skull).jumpOverFloor;
      const ok = checkJumpOver(e, (pl) => pl.jumpFromY != null && Math.abs(pl.jumpFromY - e.y) <= floorTol);
      if (ok) e.jumpedOverId = p.jumpId;
    }

    // 1 面の瓶・缶の飛び越え: 着地したら、このジャンプで飛び越えた個数ぶんの得点をまとめて加点する
    settleJumpTally();

    // ボーナスは時間とともに減る
    if (g.timer % C.score.bonusIntervalFrames === 0 && g.timer > 0) {
      g.bonus = Math.max(0, g.bonus - C.score.bonusStep);
    }

    // ヒロインに触れたらクリア。得点を足して、逃走演出へ(逃走演出の配置 escape がない 4 面は、ピンを 8 本抜いてクリア)
    if (g.level.stage.escape && geo.overlaps(pb, DP.enemies.heroineHitbox(g.heroine))) {
      addScore(C.score.clearBase * g.round + g.bonus);
      startEscape();
    }
  }

  // BGM: ゲーム開始(各面・ミス後の READY)から通常の BGM('main'。全ステージ・全周回で共通の 1 曲)をループで流し、
  // 釘バットを持っている間は釘バットの BGM('bat')を優先する。釘バットの時間切れで通常の BGM に戻る(頭から)。
  // ミス(dying。ミスのジングルを聞かせる)・クリア(逃走演出の音とクリアジングル)・ゲームオーバー・タイトルでは止める。
  // 面が変わるときは逃走演出で一度止まり、次の面の READY で頭から流し直すので、2 曲が重なることはない。
  // 音 OFF の間は audio 側で流さず、ON に戻すと今の状態の BGM を再開する
  function updateMusic() {
    const p = g.player;
    // 4 面のクリア演出: ハートが出たら幸せな BGM(ROUND CLEAR の表示中も流し続ける。次の面へ進むと止まる)
    const c = g.collapse;
    if (c && c.heart && (g.state === 'collapse' || g.state === 'clear')) return DP.audio.setMusic('happy');
    if (g.state === 'ready') return DP.audio.setMusic('main');
    if (g.state !== 'playing' || !p || p.state === 'dead') return DP.audio.setMusic(null);
    DP.audio.setMusic(p.bat > 0 ? 'bat' : 'main');
  }

  // 1 ステップ(1/60 秒)分の更新
  function update(input) {
    g.frame++;
    g.timer++;
    if (input.wasPressed('sound')) DP.audio.toggle();

    for (const pp of g.popups) pp.t++;
    g.popups = g.popups.filter((pp) => pp.t < 60);
    for (const e of g.effects) e.t++;
    g.effects = g.effects.filter((e) => e.t < (e.life || 24)); // life: 長い演出(機動隊員の撃破など)だけが持つ
    if (g.heroine) g.heroine.anim++;

    switch (g.state) {
      case 'title':
        if (input.wasPressed('start')) newGame();
        break;
      case 'ready':
        if (g.timer >= 90) setState('playing');
        break;
      case 'playing':
        updatePlaying(input);
        break;
      case 'escape':
        updateEscape();
        break;
      case 'collapse':
        updateCollapse();
        break;
      case 'intermission':
        updateIntermission(input);
        break;
      case 'dying':
        // ミスの演出の長さは理由ごと(炎上は約 1 秒、それ以外は従来どおり)。
        // 終わったら 1 回だけ残機を減らす(この状態の間に主人公がもう一度ミスになることはない)
        if (g.timer >= dyingFrames(g.deathReason)) {
          g.lives--;
          if (g.lives <= 0) {
            g.lives = 0;
            saveHiScore();
            setState('gameover', 'GAME OVER');
            DP.audio.play('gameover');
          } else {
            // ミス後の再開: 4 面では抜いたピンと穴を残す(得点・スコアはそのまま、ボーナスは初期値)
            setupStage(carryOver());
          }
        }
        break;
      case 'clear':
        // 4 面: ROUND CLEAR の表示中も花火を打ち上げ続ける
        if (g.collapse) {
          g.collapse.sounds = []; // 演出の最後のステップで鳴らした音は除く
          DP.collapse.updateCelebration(g.collapse);
          for (const name of g.collapse.sounds) DP.audio.play(name);
          g.collapse.sounds = [];
        }
        // クリア表示が終わったら自動で次へ(1〜3 面は面間演出、4 面は次の周回の 1 面)。ENTER は使わない
        if (g.timer >= (g.collapse ? C.timing.roundClearAuto : C.timing.clearAuto)) nextStage();
        break;
      case 'gameover':
        if (input.wasPressed('start')) newGame();
        break;
    }
    // このステップで拾った・時間切れ・ミス・クリアになった場合もすぐ反映する
    updateMusic();
  }

  return {
    data: g,
    update,
    difficulty,
    // ↓ テスト補助(test-hooks.js)からだけ使う操作
    _spawnHazard: spawnHazard,
    _setRng: (fn) => { rng = fn; },
    _killPlayer: killPlayer,
    // 開発用ショートカット(dev-tools.js)から: プレイ中ならクリアしたことにして逃走演出を始める
    // 開発用ショートカット / テスト補助から: 指定の面(0 始まり)から新しいゲームを始める
    // round: 周回(省略すると 1 周目)。DEV モードの周回指定(URL の round・R キー)とテスト補助が使う
    _startStage: (index, round) => {
      if (index < 0 || index >= DP.stages.length) return false;
      newGame(index);
      if (round > 1) {
        g.round = round;
        setupStage();
      }
      return true;
    },
    _devClear: () => {
      if (g.state !== 'playing') return false;
      // 4 面(逃走演出の配置 escape がない)では、残りのピンをすべて抜いた状態にしてクリア演出を始める
      if (!g.level.stage.escape) {
        if (!g.level.pins) return false;
        for (const pin of g.level.pins) DP.mechanics.pins.pull(g.level, pin, [g.player, g.boss].concat(g.enemies));
        startCollapse();
        return true;
      }
      addScore(C.score.clearBase * g.round + g.bonus);
      startEscape();
      return true;
    },
    _itemHitbox: itemHitbox,
  };
};
