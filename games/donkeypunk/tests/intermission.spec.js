// ドンキーパンク 面間演出(1〜3 面のクリア後、次の面の前に流す「やぐらを積み上げる」演出)のテスト
// 1→2: やぐら 1 → 2 段(約 8 秒)/ 2→3: 2 → 3 段(約 8 秒)/ 3→4: 3 → 4 段 + 安全ピン + 旗で完成(約 11 秒)。
// 1 周目も 2 周目以降も同じ。自動で進み、開始から 1 秒たったら ENTER で飛ばせる。BGM はなし(効果音だけ)。
// 4 面のあと(次の周回の 1 面)は演出なし(4 面のエンディングのまま)。
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors } = require('./helpers');

watchConsoleErrors(test);

// 面 index(0 始まり)を周回 round で始め、開発用の C キーでクリアして、クリア表示が自動で終わって面間演出に入った直後の状態を返す
async function toIntermission(page, index, round = 1) {
  await page.goto('./?test&dev');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(([i, r]) => {
    window.__dp.setManual(true);
    window.__dp.setSeed(1);
    window.__dp.setSkullsEnabled(false);
    window.__dp.startStage(i, r);
  }, [index, round]);
  let s = await step(page, 1);
  await page.evaluate(() => window.__dp.setBossEnabled(false));
  for (let i = 0; i < 200 && s.state !== 'playing'; i++) s = await step(page, 1);
  await page.keyboard.press('KeyC');
  for (let i = 0; i < 3000 && s.state !== 'clear'; i++) s = await step(page, 1);
  expect(s.state).toBe('clear');
  // クリア表示の長さ(ENTER は押さない)。最後のステップの直前で効果音の記録を消す
  s = await step(page, 170);
  expect(s.state).toBe('clear');
  await page.evaluate(() => window.__dp.clearSounds());
  for (let i = 0; i < 20 && s.state === 'clear'; i++) s = await step(page, 1);
  return s;
}

// 演出が終わるまで 1 ステップずつ進め、ステップごとの段階・段数・鳴った効果音・BGM を記録する(ブラウザの中で速く回す)
async function recordIntermission(page) {
  return page.evaluate(() => {
    const dp = window.__dp;
    const rec = [];
    let s = dp.snapshot();
    rec.push({ phase: s.intermission.phase, tiers: s.intermission.tiers, pinsIn: s.intermission.pinsIn, flagUp: s.intermission.flagUp, bubble: s.intermission.bubble, cops: s.intermission.cops, crowd: s.intermission.crowd, sounds: dp.sounds(), music: dp.music(), state: s.state });
    for (let i = 0; i < 2000 && s.state === 'intermission'; i++) {
      dp.clearSounds();
      s = dp.step(1);
      rec.push({
        phase: s.intermission ? s.intermission.phase : null,
        tiers: s.intermission ? s.intermission.tiers : null,
        pinsIn: s.intermission ? s.intermission.pinsIn : null,
        flagUp: s.intermission ? s.intermission.flagUp : null,
        bubble: s.intermission ? s.intermission.bubble : '',
        cops: s.intermission ? s.intermission.cops : null,
        crowd: s.intermission ? s.intermission.crowd : null,
        sounds: dp.sounds(),
        music: dp.music(),
        state: s.state,
      });
    }
    return { rec, s };
  });
}

// 段階の並び(続けて同じ段階はまとめる)
const phaseOrder = (rec) => rec.map((r) => r.phase).filter((p, i, a) => p && p !== a[i - 1]);
const allSounds = (rec) => rec.flatMap((r) => r.sounds);

test('I1. 1 面をクリアすると、クリア表示のあと自動で面間演出に入り、約 8 秒(480 ステップ)で自動的に 2 面の READY になる。やぐらは 1 段 → 2 段。段階は 登場 → 運ぶ → つり上げる → 置く → 次の面の表示', async ({ page }) => {
  test.setTimeout(120000);
  let s = await toIntermission(page, 0);
  expect(s.state).toBe('intermission');
  expect(s.intermission).toMatchObject({ from: 0, to: 1, final: false, length: 480, tiers: 1, phase: 'intro' });
  const before = { score: s.score, lives: s.lives, round: s.round };
  const { rec, s: end } = await recordIntermission(page);
  expect(phaseOrder(rec)).toEqual(['intro', 'carry', 'hoist', 'place', 'title']);
  // クリア表示が終わったステップで演出に入り(経過 0)、そこから 480 ステップ進むと READY
  expect(rec.length - 1).toBe(480);
  expect(end.state).toBe('ready');
  expect(end.stageId).toBe('livehouse');
  expect(end.message).toBe('STAGE 2');
  // やぐらは 1 段 → 2 段(置いたときに 1 回だけ増える)
  const tiers = rec.map((r) => r.tiers).filter((t) => t !== null);
  expect(tiers[0]).toBe(1);
  expect(tiers[tiers.length - 1]).toBe(2);
  expect(new Set(tiers)).toEqual(new Set([1, 2]));
  // 演出の間、得点・残機・周回は変わらない
  expect([end.score, end.lives, end.round]).toEqual([before.score, before.lives, before.round]);
});

test('I2. 面間演出の効果音: ゴリラの指示 → 足踏み(くり返し)→ 巻き上げ(くり返し)→ 鉄骨の「ガキーン!」の順。「ガキーン!」は 1 回で、鳴った瞬間にやぐらが 1 段高くなる。ゴリラは「急げ!」「コラー!」「よし!」と吹き出しで指示する。BGM は流れない', async ({ page }) => {
  test.setTimeout(120000);
  await toIntermission(page, 0);
  const { rec } = await recordIntermission(page);
  const snd = allSounds(rec);
  const order = ['bossBark', 'copStep', 'winch', 'beamClang'];
  for (const n of order) expect(snd, n).toContain(n);
  for (let i = 1; i < order.length; i++) expect(snd.indexOf(order[i - 1]), `${order[i - 1]} → ${order[i]}`).toBeLessThan(snd.indexOf(order[i]));
  expect(snd.filter((n) => n === 'copStep').length).toBeGreaterThanOrEqual(8);
  expect(snd.filter((n) => n === 'winch').length).toBeGreaterThanOrEqual(5);
  expect(snd.filter((n) => n === 'beamClang').length).toBe(1);
  expect(snd.filter((n) => n === 'bossBark').length).toBe(3);
  const clang = rec.findIndex((r) => r.sounds.includes('beamClang'));
  expect(rec[clang - 1].tiers).toBe(1);
  expect(rec[clang].tiers).toBe(2);
  const bubbles = [...new Set(rec.map((r) => r.bubble).filter(Boolean))];
  expect(bubbles).toEqual(['急げ!', 'コラー!', 'よし!']);
  // BGM は演出の間ずっとなし。READY になると通常の BGM
  for (const r of rec.slice(0, -1)) expect(r.music).toBe(null);
  expect(rec[rec.length - 1].music).toBe('main');
});

test('I3. 警察官は左から 2 人で鉄骨をかついで歩いてくる(足を交互に動かす)。途中で 1 回よろけて止まる。つり上げると手を離し、置いたら敬礼する', async ({ page }) => {
  test.setTimeout(120000);
  await toIntermission(page, 1);
  const { rec } = await recordIntermission(page);
  const carry = rec.filter((r) => r.phase === 'carry');
  expect(carry[0].cops.length).toBe(2);
  // 2 人とも右へ進み、間隔は一定(鉄骨の両端を持っている)
  const first = carry[0].cops;
  const last = carry[carry.length - 1].cops;
  for (let i = 0; i < 2; i++) expect(last[i].x).toBeGreaterThan(first[i].x + 100);
  expect(Math.round(last[1].x - last[0].x)).toBe(Math.round(first[1].x - first[0].x));
  expect(carry.every((r) => r.cops.every((c) => c.pose === 'carry'))).toBe(true);
  expect(new Set(carry.map((r) => r.cops[0].step))).toEqual(new Set([0, 1])); // 足を交互に
  // よろけている間は止まる(歩いている途中で、walking が false の区間がある)
  const walking = carry.map((r) => r.cops[0].walking);
  const firstStop = walking.indexOf(false, 1); // 最初の 1 件は「登場」の最後のステップ(まだ歩き出していない)
  expect(firstStop).toBeGreaterThan(10);
  expect(walking.lastIndexOf(true)).toBeGreaterThan(firstStop);
  expect(rec.filter((r) => r.phase === 'hoist').slice(-1)[0].cops.every((c) => c.pose === 'stand')).toBe(true);
  expect(rec.filter((r) => r.phase === 'title')[0].cops.every((c) => c.pose === 'salute')).toBe(true);
});

test('I4. 2 面をクリアすると、やぐらは 2 段 → 3 段(約 8 秒)で 3 面へ。3 面をクリアすると、警察官が総出(左右から 4 人)で 3 段 → 4 段にし、安全ピン 8 本を差し込み、旗を上げて「やぐら完成!」(完成のファンファーレ・万歳)。約 11 秒(660 ステップ)で 4 面へ', async ({ page }) => {
  test.setTimeout(180000);
  let s = await toIntermission(page, 1);
  expect(s.intermission).toMatchObject({ from: 1, to: 2, length: 480, tiers: 2 });
  let r = await recordIntermission(page);
  expect(r.rec.length - 1).toBe(480);
  expect(r.rec[r.rec.length - 2].tiers).toBe(3);
  expect(r.s.stageId).toBe('squat');

  s = await toIntermission(page, 2);
  expect(s.intermission).toMatchObject({ from: 2, to: 3, final: true, length: 660, tiers: 3 });
  expect(s.intermission.cops.map((c) => c.side)).toEqual(['left', 'left', 'right', 'right']);
  r = await recordIntermission(page);
  expect(r.rec.length - 1).toBe(660);
  expect(phaseOrder(r.rec)).toEqual(['intro', 'carry', 'hoist', 'place', 'pins', 'done', 'title']);
  const last = r.rec[r.rec.length - 2];
  expect(last.tiers).toBe(4);
  expect(last.pinsIn).toBe(8);
  expect(last.flagUp).toBe(1);
  expect(last.cops.every((c) => c.pose === 'cheer')).toBe(true);
  const snd = allSounds(r.rec);
  expect(snd.filter((n) => n === 'pin').length).toBe(8);
  expect(snd.filter((n) => n === 'towerDone').length).toBe(1);
  expect(snd.indexOf('beamClang')).toBeLessThan(snd.indexOf('pin'));
  expect(snd.indexOf('pin')).toBeLessThan(snd.indexOf('towerDone'));
  expect([...new Set(r.rec.map((x) => x.bubble).filter(Boolean))]).toContain('完成だ!');
  // 4 面はピン 8 本が抜けていない初期状態で始まる(面間演出はピンの状態に関係しない)
  expect(r.s.stageId).toBe('rivets');
  expect(r.s.state).toBe('ready');
  expect(r.s.pins.filter((p) => p.pulled)).toEqual([]);
});

test('I5. 2 周目以降も 1 周目とまったく同じ演出・同じ長さ(ステップごとの段階・段数・効果音が一致する)', async ({ page }) => {
  test.setTimeout(240000);
  for (const index of [0, 2]) {
    const runs = [];
    for (const round of [1, 2, 3]) {
      const s = await toIntermission(page, index, round);
      expect(s.round).toBe(round);
      const { rec, s: end } = await recordIntermission(page);
      expect(end.round).toBe(round); // 演出で周回は変わらない
      // にぎやかしの警察官の位置・ポーズも含めて比べる
      runs.push(rec.map((x) => [x.phase, x.tiers, x.pinsIn, x.sounds.join(','), JSON.stringify(x.crowd)]));
    }
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  }
});

test('I6. 開始から 1 秒(60 ステップ)までは ENTER を押しても飛ばせない。1 秒をすぎたら ENTER で飛ばせて、すぐ次の面の READY になる。飛ばしても、最後まで見たときと次の面・得点・残機・周回は同じ', async ({ page }) => {
  test.setTimeout(180000);
  // 最後まで見た場合
  await toIntermission(page, 0);
  const full = (await recordIntermission(page)).s;
  // 30 ステップ目・60 ステップ目に ENTER → 飛ばせない
  let s = await toIntermission(page, 0);
  expect(s.intermission.total).toBe(0); // クリア表示が終わったステップで演出に入る
  s = await step(page, 29);
  await page.keyboard.press('Enter');
  s = await step(page, 1);
  expect(s.state).toBe('intermission');
  expect(s.intermission.total).toBe(30);
  s = await step(page, 29);
  await page.keyboard.press('Enter');
  s = await step(page, 1);
  expect(s.intermission.total).toBe(60);
  expect(s.state).toBe('intermission');
  // 61 ステップ目に ENTER → 飛ばせる
  await page.keyboard.press('Enter');
  s = await step(page, 1);
  expect(s.state).toBe('ready');
  expect(s.intermission).toBe(null);
  for (const k of ['stageId', 'message', 'score', 'lives', 'round', 'bonus']) expect(s[k], k).toEqual(full[k]);
  // 飛ばしたあとも普通に遊べる(READY → プレイ中、通常の BGM)
  for (let i = 0; i < 200 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  expect(await page.evaluate(() => window.__dp.music())).toBe('main');
  // 3 → 4 面も同じく飛ばせる。4 面はピンが初期状態
  s = await toIntermission(page, 2);
  s = await step(page, 100);
  await page.keyboard.press('Enter');
  s = await step(page, 1);
  expect(s.state).toBe('ready');
  expect(s.stageId).toBe('rivets');
  expect(s.pins.filter((p) => p.pulled)).toEqual([]);
});

test('I7. 演出中に ENTER 以外のキー(矢印・スペース・M 以外)を押しても進行は変わらない(何も押さないときと段階・段数が同じ)', async ({ page }) => {
  test.setTimeout(120000);
  await toIntermission(page, 0);
  const quiet = (await recordIntermission(page)).rec.map((r) => [r.phase, r.tiers]);
  await toIntermission(page, 0);
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
  const noisy = [];
  let s = await snap(page);
  noisy.push([s.intermission.phase, s.intermission.tiers]);
  for (let i = 0; i < 600 && s.state === 'intermission'; i++) {
    if (i % 5 === 0) await page.keyboard.down(keys[i % keys.length]);
    if (i % 5 === 3) await page.keyboard.up(keys[(i - 3) % keys.length]);
    s = await step(page, 1);
    noisy.push(s.intermission ? [s.intermission.phase, s.intermission.tiers] : [null, null]);
  }
  for (const k of keys) await page.keyboard.up(k);
  expect(noisy).toEqual(quiet);
});

test('I8. 4 面のクリア後(次の周回の 1 面へ)は面間演出に入らず、エンディングと ROUND CLEAR のあと自動で次の周回の 1 面の READY になる', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./?test&dev');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => { window.__dp.setManual(true); window.__dp.startStage(3); });
  let s = await step(page, 100);
  await page.keyboard.press('KeyC');
  for (let i = 0; i < 3000 && s.state !== 'clear'; i++) {
    s = await step(page, 1);
    expect(s.state).not.toBe('intermission');
  }
  expect(s.message).toBe('ROUND CLEAR');
  for (let i = 0; i < 1000 && s.state === 'clear'; i++) {
    s = await step(page, 1);
    expect(s.state).not.toBe('intermission');
  }
  expect(s.state).toBe('ready');
  expect(s.stageId).toBe('girders');
  expect(s.round).toBe(2);
  expect(s.intermission).toBe(null);
});

test('I9. 怒ったポリスマンのドット絵(4 面の雑魚敵でも使う): 歩く 2 枚・かつぐ 2 枚・敬礼・万歳がすべて同じ大きさ(14×18)で、紺の制服・金のバッジ・赤い頬・太い眉。演出の画面は背景が暗く、警察官の紺が描かれている', async ({ page }) => {
  test.setTimeout(120000);
  await toIntermission(page, 0);
  const sprites = await page.evaluate(() => {
    const D = window.DP.sprites.DATA;
    return ['copWalkA', 'copWalkB', 'copCarryA', 'copCarryB', 'copSalute', 'copCheer'].map((n) => ({ n, w: D[n] && D[n].w, h: D[n] && D[n].h, rows: D[n] && D[n].rows.join('') }));
  });
  for (const sp of sprites) {
    expect([sp.w, sp.h], sp.n).toEqual([14, 18]);
    for (const ch of ['N', 'Y', 'P', 'K', 'S']) expect(sp.rows, `${sp.n} の ${ch}`).toContain(ch);
  }
  // 運んでいる途中の画面: 背景は暗く、警察官の位置に紺(制服)のドットがある
  await step(page, 150);
  await page.waitForTimeout(80);
  const px = await page.evaluate(() => {
    const s = window.__dp.snapshot();
    const ctx = document.querySelector('canvas').getContext('2d');
    const dark = Array.from(ctx.getImageData(240, 300, 1, 1).data.slice(0, 3));
    const c = s.intermission.cops[1];
    const img = ctx.getImageData(Math.round(c.x) - 14, 520 - 36, 28, 36).data;
    let navy = 0;
    for (let i = 0; i < img.length; i += 4) if (img[i] === 0x1d && img[i + 1] === 0x2c && img[i + 2] === 0x74) navy++;
    return { dark, navy };
  });
  expect(Math.max(...px.dark)).toBeLessThan(70);
  expect(px.navy).toBeGreaterThan(20);
});

// ---------------------------------------------------------------- にぎやかしの警察官(群衆)

test('I10. 警察官は 1→2 が 10 人・2→3 が 15 人・3→4 が 20 人(主役を含む)。鉄骨を運ぶ・走る・右往左往する・敬礼する・サボる・やぐらの上で働く、といういろいろな動きがあり、人数は演出の最後まで減らない', async ({ page }) => {
  test.setTimeout(180000);
  for (const [index, total] of [[0, 10], [1, 15], [2, 20]]) {
    const s = await toIntermission(page, index);
    expect(s.intermission.cops.length + s.intermission.crowd.length, `${index + 1}→${index + 2}`).toBe(total);
    const kinds = new Set(s.intermission.crowd.map((o) => o.kind));
    for (const k of ['haul', 'run', 'wander', 'salute', 'slack', 'tower']) expect(kinds.has(k), `${index + 1}→${index + 2} の ${k}`).toBe(true);
    const { rec } = await recordIntermission(page);
    for (const r of rec.slice(0, -1)) expect(r.cops.length + r.crowd.length).toBe(total);
  }
});

test('I11. にぎやかしの警察官の動き: 運ぶ人は短い鉄骨をかついで歩き続け、走る人は運ぶ人より速く行ったり来たりし、右往左往する人は止まると「?」。サボっている人は「Zzz」で、ゴリラが怒鳴ると飛び起きて敬礼(「!」)。鉄骨が積まれると敬礼、3→4 の完成では全員で万歳。どの人も画面の外へ行きっぱなしにならない', async ({ page }) => {
  test.setTimeout(180000);
  await toIntermission(page, 1);
  const { rec } = await recordIntermission(page);
  const rows = rec.slice(0, -1);
  const byIdx = (i) => rows.map((r) => r.crowd[i]);
  const crowd0 = rows[0].crowd;
  const idxOf = (k) => crowd0.map((o, i) => (o.kind === k ? i : -1)).filter((i) => i >= 0);
  // 運ぶ人: ずっとかついで歩き、進む
  for (const i of idxOf('haul')) {
    const xs = byIdx(i);
    expect(xs.every((o) => o.pose === 'carry')).toBe(true);
    expect(new Set(xs.map((o) => Math.round(o.x))).size).toBeGreaterThan(100);
  }
  // 走る人は運ぶ人より速い(1 ステップあたりの移動量の最大)
  // (運ぶ人が画面の端から反対の端へ入り直すときの大きな跳びは除く)
  const speed = (i) => Math.max(...byIdx(i).slice(1).map((o, k) => Math.abs(o.x - byIdx(i)[k].x)).filter((v) => v < 20));
  const runMax = Math.max(...idxOf('run').map(speed));
  const haulMax = Math.max(...idxOf('haul').map(speed));
  expect(runMax).toBeGreaterThan(haulMax);
  // 走る人は左右どちらも向く(行ったり来たり)
  for (const i of idxOf('run')) expect(new Set(byIdx(i).map((o) => o.facing))).toEqual(new Set([1, -1]));
  // 右往左往する人は、止まっている間「?」
  for (const i of idxOf('wander')) expect(byIdx(i).some((o) => o.label === '?')).toBe(true);
  // サボる人: 「Zzz」と、ゴリラが怒鳴っている間の「!」と敬礼
  for (const i of idxOf('slack')) {
    const os = byIdx(i);
    expect(os.some((o) => o.label === 'Zzz')).toBe(true);
    const shoutRows = rows.map((r, k) => (r.bubble ? k : -1)).filter((k) => k >= 0 && rows[k].phase !== 'place' && rows[k].phase !== 'title');
    expect(shoutRows.length).toBeGreaterThan(0);
    for (const k of shoutRows) expect([os[k].label, os[k].pose]).toEqual(['!', 'salute']);
  }
  // 鉄骨が積まれたあと(次の面の表示)は、右往左往・サボる・やぐらの上の人が敬礼
  const last = rows[rows.length - 1].crowd;
  for (const o of last) if (['wander', 'slack', 'tower', 'salute'].includes(o.kind)) expect(o.pose, o.kind).toBe('salute');
  // 画面の外へ行きっぱなしにならない(運ぶ人は端から出ても反対から入り直す)
  for (const r of rows) for (const o of r.crowd) expect(o.x).toBeGreaterThanOrEqual(-40), expect(o.x).toBeLessThanOrEqual(520);
  // 3→4: 完成(done)では全員で万歳
  await toIntermission(page, 2);
  const fin = (await recordIntermission(page)).rec.filter((r) => r.phase === 'done');
  const end = fin[fin.length - 1];
  expect(end.crowd.length).toBe(16);
  expect(end.crowd.every((o) => o.pose === 'cheer')).toBe(true);
  expect(end.cops.every((c) => c.pose === 'cheer')).toBe(true);
});

test('I12. 20 人いても描画は軽い(3→4 の演出の画面を 300 回描いても、1 回あたり平均 4ms 未満)', async ({ page }) => {
  test.setTimeout(120000);
  await toIntermission(page, 2);
  await step(page, 200);
  // 描画は requestAnimationFrame で行われるので、そのあいだの 1 フレームの間隔の代わりに、描画関数を直接 300 回呼んで測る
  const ms = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 560;
    const r = window.DP.createRenderer(canvas);
    const game = window.__dp.gameForRender();
    r.render(game); // 1 回目はドット絵の焼き付けを含むので除く
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) r.render(game);
    return (performance.now() - t0) / 300;
  });
  console.log(`I12 1 回の描画: ${ms.toFixed(2)}ms`);
  expect(ms).toBeGreaterThanOrEqual(0);
  expect(ms).toBeLessThan(4);
});

// ---------------------------------------------------------------- クリア後は ENTER なしで自動進行

test('I13. 1〜3 面のクリア表示(Oi! Oi! Oi!)は ENTER を押さなくても 180 ステップ(3 秒)で自動的に面間演出へ進む。表示中に ENTER を押しても早まらない。得点・残機・周回はそのまま引き継ぐ', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./?test&dev');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => { window.__dp.setManual(true); window.__dp.startStage(0, 2); window.__dp.setLives(2); });
  let s = await step(page, 100);
  await page.keyboard.press('KeyC');
  for (let i = 0; i < 3000 && s.state !== 'clear'; i++) s = await step(page, 1);
  expect(s.message).toBe('Oi! Oi! Oi!');
  const kept = { score: s.score, lives: s.lives, round: s.round };
  let n = 0;
  for (; n < 1000 && s.state === 'clear'; n++) {
    if (n % 15 === 0) await page.keyboard.press('Enter'); // 押しても早まらない
    s = await step(page, 1);
  }
  expect(n).toBe(180);
  expect(s.state).toBe('intermission');
  expect([s.score, s.lives, s.round]).toEqual([kept.score, kept.lives, kept.round]);
  // 面間演出も自動で進み、2 面の READY → プレイ中(得点・残機・周回はそのまま)
  for (let i = 0; i < 1000 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.stageId).toBe('livehouse');
  expect([s.score, s.lives, s.round]).toEqual([kept.score, kept.lives, kept.round]);
});

test('I14. 4 面: 崩壊 → 乱射 → 落下 → 救出 → 教会・花火・ROUND CLEAR(エンディングは今までどおりの長さ)のあと、ENTER なしで 300 ステップ(5 秒)たつと自動的に次の周回の 1 面へ。得点・残機を引き継ぎ、周回は +1', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./?test&dev');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => { window.__dp.setManual(true); window.__dp.startStage(3); window.__dp.setLives(2); });
  let s = await step(page, 100);
  await page.keyboard.press('KeyC');
  s = await step(page, 1);
  expect(s.state).toBe('collapse');
  // エンディングの長さ(崩壊の始まりから ROUND CLEAR まで)は変わらない
  let n = 0;
  for (; n < 3000 && s.state === 'collapse'; n++) s = await step(page, 1);
  expect(s.message).toBe('ROUND CLEAR');
  const endingSteps = n;
  const kept = { score: s.score, lives: s.lives, round: s.round };
  let m = 0;
  for (; m < 1000 && s.state === 'clear'; m++) {
    s = await step(page, 1);
    if (s.state === 'clear') expect(s.collapse.heart).toBe(true); // 表示中も花火・お祝いが続く
  }
  expect(m).toBe(300);
  expect(s.state).toBe('ready');
  expect(s.stageId).toBe('girders');
  expect(s.round).toBe(kept.round + 1);
  expect([s.score, s.lives]).toEqual([kept.score, kept.lives]);
  console.log(`I14 エンディング ${endingSteps} ステップ + ROUND CLEAR ${m} ステップ`);
  expect(endingSteps).toBeGreaterThan(800);
});
