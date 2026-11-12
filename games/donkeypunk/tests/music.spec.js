// 通常プレイの BGM(全ステージ共通。js/music.js の曲データを audio.js が Web Audio で鳴らす)のテスト
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, startAtStage, hold } = require('./helpers');

watchConsoleErrors(test);

const music = (page) => page.evaluate(() => window.__dp.music());
const active = (page) => page.evaluate(() => window.__dp.musicActive());

// 曲 name のループ 1 周分の音をすべて集める(時刻 t 秒つき)
const songData = (page, name) => page.evaluate((nm) => {
  const m = window.DP.music;
  const info = m.songInfo(nm);
  const list = [];
  for (let i = 0; i < info.steps; i++) for (const e of m.songEvents(nm, i)) list.push(Object.assign({ step: i, t: i * info.stepSec }, e));
  return Object.assign(info, { list, perBar: m.STEPS_PER_BAR, song: m.SONGS[nm] });
}, name);

// 音の周波数 → 音名の番号(C=0 … B=11)
const pitchClass = (f) => ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12;
const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

test('M1. 通常プレイの曲は「1,2, Song」のコード進行のアレンジで、前の試作版も残っていて曲データを切り替えられる', async ({ page }) => {
  await page.goto('./?test');
  const r = await page.evaluate(() => ({ main: window.DP.music.MAIN_SONG, songs: Object.keys(window.DP.music.SONGS), bpm: window.DP.music.BPM, loop: window.DP.music.LOOP_SEC }));
  expect(r.main).toBe('oneTwo');
  expect(r.songs).toEqual(expect.arrayContaining(['oneTwo', 'proto']));
  expect(r.loop).toBeGreaterThanOrEqual(15);
  expect(r.loop).toBeLessThanOrEqual(25);
  // 使うコードは、原曲から推定した B / F# / E / C#m だけ。頭は B、最後は F#(頭の B へ戻る)
  const d = await songData(page, 'oneTwo');
  const used = new Set(d.song.bars.flatMap((b) => b.chords));
  expect([...used].sort()).toEqual(['B', 'C#m', 'E', 'F#']);
  expect(d.song.bars[0].chords[0]).toBe('B');
  expect(d.song.bars[d.bars - 1].chords.slice(-1)[0]).toBe('F#');
});

for (const name of ['oneTwo', 'proto']) {
  test(`M2. 曲データ(${name}): ファミコンと同じ 4 チャンネルだけを使い、各チャンネルは同時に 1 音、全小節にリズムがある`, async ({ page }) => {
    await page.goto('./?test');
    const d = await songData(page, name);
    expect(d.loopSec).toBeGreaterThanOrEqual(15);
    expect(d.loopSec).toBeLessThanOrEqual(25);
    expect([...new Set(d.list.map((e) => e.ch))].sort()).toEqual(['noise', 'pulse1', 'pulse2', 'tri']);
    for (const e of d.list) {
      expect(e.dur).toBeGreaterThan(0);
      expect(e.vol).toBeGreaterThan(0);
      expect(e.vol).toBeLessThanOrEqual(0.09);
      if (e.ch !== 'noise') {
        expect(Number.isFinite(e.freq)).toBe(true);
        expect(e.freq).toBeGreaterThan(30);
        expect(e.freq).toBeLessThan(2000);
      }
      if (e.ch === 'pulse1' || e.ch === 'pulse2') expect([0.125, 0.25, 0.5]).toContain(e.duty);
    }
    // 同じチャンネルの音は、次の音(最後の音はループの頭の音)より前に鳴り終わる
    for (const ch of ['pulse1', 'pulse2', 'tri']) {
      const xs = d.list.filter((e) => e.ch === ch);
      for (let i = 0; i < xs.length; i++) {
        const next = i + 1 < xs.length ? xs[i + 1].t : d.loopSec + xs[0].t;
        expect(xs[i].t + xs[i].dur).toBeLessThanOrEqual(next + 1e-9);
      }
    }
    for (let b = 0; b < d.bars; b++) {
      const inBar = d.list.filter((e) => Math.floor(e.step / d.perBar) === b);
      const kinds = inBar.map((e) => e.kind);
      for (const k of ['kick', 'snare', 'lead', 'guitar']) expect(kinds).toContain(k);
      // 三角波(ベースかキック)が 8 分音符ごとに必ず鳴る
      for (let pos = 0; pos < d.perBar; pos += 2) expect(inBar.some((e) => e.ch === 'tri' && e.step % d.perBar === pos)).toBe(true);
    }
    // メロディー・ギター・ベースの音は、すべて曲のキーのスケールの音
    const scale = d.key.map((k) => PC[k]);
    for (const e of d.list.filter((x) => ['lead', 'bass', 'guitar'].includes(x.kind))) expect(scale).toContain(pitchClass(e.freq));
    // ループの頭の小節にはクラッシュ(つなぎ目で区切りがはっきり聞こえる)、最後の小節はフィル
    expect(d.list.some((e) => e.step === 0 && e.kind === 'crash')).toBe(true);
    expect(d.list.filter((e) => Math.floor(e.step / d.perBar) === d.bars - 1 && e.kind === 'snare').length).toBeGreaterThan(8);
  });
}

test('M3. ゲーム開始(READY)から通常の BGM が流れ、1 面・2 面・2 周目で同じ曲。面の切り替えで 2 曲が重ならない', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  expect(await music(page)).toBe(null); // タイトルでは流さない
  await page.evaluate(() => { window.__dp.setManual(true); window.__dp.setSeed(1); });
  await page.keyboard.press('Enter');
  let s = await step(page, 1);
  expect(s.state).toBe('ready');
  expect(await music(page)).toBe('main'); // ゲーム開始と同時に流れる
  await page.evaluate(() => window.__dp.setBossEnabled(false));
  s = await step(page, 100);
  expect(s.state).toBe('playing');
  expect(s.stageIndex).toBe(0);
  expect(await music(page)).toBe('main');

  // 1 面 → 2 面 → 1 面(2 周目)とクリアしていく。どの時点でも流れている BGM は 1 つ以下
  const seen = [];
  for (const expected of [1, 0]) {
    await page.evaluate(() => { window.__dp.clearHazards(); window.__dp.placePlayer('top', 240); });
    await step(page, 1);
    await page.evaluate(() => window.__dp.placePlayer('top', 205));
    s = await step(page, 1);
    expect(s.state).toBe('escape');
    for (let i = 0; i < 1200 && s.state !== 'playing'; i++) {
      if (s.state === 'clear' && i % 20 === 0) await page.keyboard.press('Enter');
      s = await step(page, 1);
      expect(await active(page)).toBeLessThanOrEqual(1);
      if (s.state === 'escape' || s.state === 'clear') expect(await music(page)).toBe(null);
      if (s.state === 'ready') expect(await music(page)).toBe('main');
    }
    expect(s.state).toBe('playing');
    expect(s.stageIndex).toBe(expected);
    expect(await music(page)).toBe('main');
    expect(await active(page)).toBe(1);
    seen.push([s.stageIndex, s.round]);
    await page.evaluate(() => window.__dp.setBossEnabled(false));
  }
  expect(seen).toEqual([[1, 1], [0, 2]]);
});

test('M4. 釘バット使用中は釘バットの BGM が優先され、切れると通常の BGM に戻る(重ならない)', async ({ page }) => {
  for (const stage of [0, 1]) {
    await startAtStage(page, stage);
    expect(await music(page)).toBe('main');
    await page.evaluate(() => window.__dp.setBat(60));
    await step(page, 1);
    expect(await music(page)).toBe('bat');
    expect(await active(page)).toBe(1);
    const s = await step(page, 70);
    expect(s.player.bat).toBe(0);
    expect(await music(page)).toBe('main');
    expect(await active(page)).toBe(1);
  }
});

test('M5. ミスでは止まり READY から流し直す。GAME OVER で止まり、タイトルに戻っても流れない', async ({ page }) => {
  await startAtStage(page, 0);
  await page.evaluate(() => window.__dp.setLives(2));
  for (const last of [false, true]) {
    await page.evaluate(() => window.__dp.placePlayerAir(330, 100, 0)); // 高いところから落ちる
    let s;
    for (let i = 0; i < 200; i++) {
      s = await step(page, 1);
      if (s.state === 'dying') break;
    }
    expect(s.state).toBe('dying');
    expect(await music(page)).toBe(null);
    for (let i = 0; i < 400 && s.state === 'dying'; i++) s = await step(page, 1);
    if (!last) {
      expect(s.state).toBe('ready');
      expect(await music(page)).toBe('main');
      for (let i = 0; i < 200 && s.state !== 'playing'; i++) s = await step(page, 1);
      await page.evaluate(() => window.__dp.setBossEnabled(false));
    } else {
      expect(s.state).toBe('gameover');
      expect(await music(page)).toBe(null);
      expect(await active(page)).toBe(0);
      s = await step(page, 120);
      expect(await music(page)).toBe(null);
    }
  }
});

test('M6. M キーで音を OFF にすると通常の BGM も止まり、ON に戻すと再開する', async ({ page }) => {
  await startAtStage(page, 0);
  expect(await music(page)).toBe('main');
  await page.keyboard.press('m');
  await step(page, 1);
  expect(await music(page)).toBe(null);
  expect(await active(page)).toBe(0);
  await step(page, 60);
  expect(await music(page)).toBe(null); // OFF の間は流れない
  await page.keyboard.press('m');
  await step(page, 1);
  expect(await music(page)).toBe('main');
  expect(await active(page)).toBe(1);
});

test('M7. ループのつなぎ目: 最後のステップから頭のステップへ、同じ間隔のまま途切れずに続く', async ({ page }) => {
  await startAtStage(page, 0);
  const total = await page.evaluate(() => window.DP.music.TOTAL_STEPS);
  const dt = await page.evaluate(() => window.DP.music.STEP_SEC);
  await page.evaluate((n) => { window.__dp.recordMusicSteps(); window.__dp.seekMusic(n - 6); }, total);
  await page.waitForTimeout(1500); // BGM は実時間で予約していく
  const steps = (await page.evaluate(() => window.__dp.musicSteps())).filter((x) => x.name === 'main');
  const i0 = steps.findIndex((x) => x.step === 0);
  expect(i0).toBeGreaterThan(0);
  expect(steps[i0 - 1].step).toBe(total - 1);
  // 予約の間隔は常に 1 ステップ分(つなぎ目で間が空いたり詰まったりしない)
  for (let i = 1; i < steps.length; i++) {
    expect(steps[i].step).toBe((steps[i - 1].step + 1) % total);
    expect(steps[i].t - steps[i - 1].t).toBeCloseTo(dt, 6);
  }
  // つなぎ目の前後でも音が鳴っている(最後の小節のフィル → 頭のクラッシュ)
  const ev = await page.evaluate((n) => [window.DP.music.events(n - 1), window.DP.music.events(0), window.DP.music.events(n)], total);
  expect(ev[0].length).toBeGreaterThan(0);
  expect(ev[1].map((e) => e.kind)).toContain('crash');
  expect(ev[2]).toEqual(ev[1]); // ループの長さで折り返す
});

test('M8. ブラウザの音声再生の制限: 最初のキー入力で AudioContext を再開して鳴らす。MP3 は読み込まない', async ({ page }) => {
  const audioRequests = [];
  page.on('request', (r) => { if (/\.(mp3|ogg|wav|m4a)(\?|$)/i.test(r.url())) audioRequests.push(r.url()); });
  await page.addInitScript(() => {
    window.__nodes = { osc: 0, buf: 0, wave: 0 };
    const proto = BaseAudioContext.prototype;
    for (const [m, k] of [['createOscillator', 'osc'], ['createBufferSource', 'buf'], ['createPeriodicWave', 'wave']]) {
      const orig = proto[m];
      proto[m] = function (...a) { window.__nodes[k]++; return orig.apply(this, a); };
    }
  });
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  expect(await page.evaluate(() => window.__dp.audioState())).toBe('none'); // キーを押すまでは作らない
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__dp.audioState() === 'running');
  await page.waitForFunction(() => window.__dp.music() === 'main');
  await page.waitForTimeout(1500);
  const n = await page.evaluate(() => window.__nodes);
  expect(n.osc).toBeGreaterThan(10); // 矩形波・三角波
  expect(n.buf).toBeGreaterThanOrEqual(2); // 雑音(イントロはクラッシュとスネアだけ)
  expect(n.wave).toBeGreaterThan(0); // デューティ比 25% の矩形波
  expect(audioRequests).toEqual([]);
  expect(await page.content()).not.toMatch(/\.mp3/i);
});

test('M9. 新しい曲(oneTwo)は前の試作版(proto)と聞き分けられる: リズムの型・伴奏・音色・メロディーのリズムが違う', async ({ page }) => {
  await page.goto('./?test');
  const a = (await songData(page, 'oneTwo')).song;
  const b = (await songData(page, 'proto')).song;
  // 小節ごとのドラム・ギター・ベースの型が同じ小節はほとんどない
  const same = a.bars.filter((x, i) => b.bars[i] && x.drums === b.bars[i].drums && x.guitar === b.bars[i].guitar && x.bass === b.bars[i].bass);
  expect(same.length).toBeLessThanOrEqual(1);
  // ドラムの型の半分以上は、前の曲で使っていない型
  const oldDrums = new Set(b.bars.map((x) => x.drums));
  expect(a.bars.filter((x) => !oldDrums.has(x.drums)).length).toBeGreaterThanOrEqual(a.bars.length / 2);
  // メロディーのリズム(音の出る位置)が同じ小節は少ない
  const rhythm = (bar) => {
    const res = 16 / bar.lead.length;
    return Array.from({ length: 16 }, (_, p) => (p % res === 0 && !['.', '-'].includes(bar.lead[p / res]) ? 'x' : '.')).join('');
  };
  expect(a.bars.filter((x, i) => rhythm(x) === rhythm(b.bars[i])).length).toBeLessThanOrEqual(3);
  // 前の曲にない音色(12.5% の細い矩形波)・16 分のメロディー・ギャロップのベースを使う
  expect(a.bars.some((x) => x.leadDuty === 0.125)).toBe(true);
  expect(a.bars.some((x) => x.lead.length === 16)).toBe(true);
  expect(a.bars.some((x) => x.bass === 'gallop')).toBe(true);
  expect(b.bars.some((x) => x.leadDuty || x.lead.length === 16 || x.bass === 'gallop' || x.guitar === 'stab')).toBe(false);
});
