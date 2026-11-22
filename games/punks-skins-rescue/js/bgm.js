// PUNKS & SKINS RESCUE: ゲーム中の BGM(2026-11-22。オリジナル曲。Web Audio で合成し、音源ファイルは使わない)
//
// 曲: 「NEON STREET PANIC」(仮題) — 騒がしい夜の繁華街をイメージした、ポップでコミカルな 8 ビット風の曲。
//     C メジャー・BPM 160・4/4 拍子・16 小節(A 8 小節 + B 8 小節)で約 24 秒のループ。
// 音色(1980 年代の家庭用ゲーム機の 4 チャンネルを真似る):
//   メロディ = 矩形波(デューティ 25%)/ 裏打ち = 矩形波(12.5%)/ ベース = 三角波 / ドラム = ノイズ(+ キックは三角波)
//
// 再生の仕組み: メインループ(requestAnimationFrame)から毎フレーム update(状態) を呼ぶ。
//   - playing / stageclear のあいだ鳴らす(ステージが替わっても続ける)。title・gameover では止める
//   - club(キャバクラ演出)のあいだは本編の曲を一時停止し、専用のビープ音のフレーズ(JINGLE)を鳴らす。
//     次のステージ(playing)になったら、本編の曲を止めた位置から再開する
//   - 先読みスケジューラ: AudioContext の時刻で LOOKAHEAD 秒先までの音符を予約する(ループのつなぎ目で途切れない)
//   - タブが裏に回って予約が遅れたら、今の時刻から続ける(まとめて鳴らさない)
//   - 音の ON / OFF(M キー)は効果音と共通の PSR.audio.isOn()。OFF のあいだも曲の位置は進め、音だけ出さない
// ゲームの状態は読むだけで、書き込まない(ルール・進行には影響しない)。
window.PSR = window.PSR || {};

PSR.bgm = (function () {
  const BPM = 160;
  const STEP = 60 / BPM / 2; // 1 ステップ = 8 分音符(0.1875 秒)
  const LOOKAHEAD = 0.2; // 何秒先まで予約するか
  const START_DELAY = 0.35; // ENTER で始めてから鳴り出すまで(スタートの効果音と重ねない)
  // BGM 全体の音量(効果音が聞こえるよう控えめ。効果音は直接 destination へ出る)。
  // 実測(RMS): BGM 平均 約 0.02 に対し、効果音のピークは 救助 0.031・STAGE CLEAR 0.036・受け止め 0.061・MISS 0.10
  const MASTER = 0.2;

  // ---- 曲のデータ(1 小節 = 8 分音符 8 個。'-' = 前の音をのばす、'.' = 休み) ----
  // メロディ(矩形波 25%)
  const MELODY = [
    // A: 跳ねるような明るいメロディ
    'E5 . G5 E5 C5 . D5 E5',
    'G5 - E5 . C6 - G5 .',
    'A5 . F5 A5 C6 . A5 F5',
    'G5 - - . B4 C5 D5 F5',
    'E5 . G5 E5 C5 . D5 E5',
    'A5 - G5 . E5 - C5 .',
    'F5 A5 C6 A5 G5 B5 D6 B5',
    'C6 . G5 . C6 - - .',
    // B: 裏から入る、少しパンクなフレーズ
    '. C5 . F5 . A5 G5 F5',
    '. D5 . G5 . B5 A5 G5',
    'E5 - G5 - B5 - G5 E5',
    'A5 - - . C6 B5 A5 G5',
    'F5 F5 . F5 A5 . C6 .',
    'G5 G5 . G5 B5 . D6 .',
    'E6 - D6 C6 G5 - E5 .',
    'D5 . F5 . G5 . B5 .',
  ];
  // コード(小節ごと。2 つ書いた小節は半小節ずつ)。ベースと裏打ちはここから作る
  const CHORDS = [
    ['C'], ['C'], ['F'], ['G'], ['C'], ['Am'], ['F', 'G'], ['C'],
    ['F'], ['G'], ['Em'], ['Am'], ['F'], ['G'], ['C'], ['G7'],
  ];
  // コード → [ベースの音, 裏打ちの 2 音]
  const CHORD_NOTES = {
    C: ['C3', 'E4', 'G4'],
    F: ['F2', 'F4', 'A4'],
    G: ['G2', 'G4', 'B4'],
    G7: ['G2', 'F4', 'B4'],
    Am: ['A2', 'E4', 'A4'],
    Em: ['E2', 'E4', 'G4'],
  };
  // ドラム(1 小節 = 16 分音符 16 個。k = キック、s = スネア、h = ハイハット、o = オープンハイハット、'.' = なし)
  const DRUM_A = 'k.h.s.h.k.hkS.h.'; // S = スネア + ハイハット
  const DRUM_B = 'k.hok.h.s.hok.s.'; // B は少し走り気味
  const DRUM_FILL = 'k.h.s.h.s.sssSss'; // 16 小節目(ループの前)のフィル

  // 音名 → 周波数('C4' = ド、'F#4'・'Bb4' も可)
  const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(name) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    if (!m) return 0;
    const midi = NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // メロディを [{ step, f, len }] に直す(len = 何ステップのばすか)
  const MELODY_NOTES = (function () {
    const out = [];
    MELODY.forEach((bar, b) => {
      bar.split(/\s+/).forEach((tok, i) => {
        const step = b * 8 + i;
        if (tok === '-') {
          if (out.length && out[out.length - 1].step + out[out.length - 1].len === step) out[out.length - 1].len++;
        } else if (tok !== '.') out.push({ step, f: freq(tok), len: 1 });
      });
    });
    return out;
  })();
  const SONG_STEPS = MELODY.length * 8; // 128 ステップ

  // ステップ n のコード
  function chordAt(n) {
    const bar = Math.floor(n / 8);
    const c = CHORDS[bar];
    return CHORD_NOTES[c.length === 1 ? c[0] : c[Math.floor((n % 8) / 4)]];
  }

  // ---- 音色 ----
  let ac = null;
  let waves = null; // 矩形波(デューティ違い)
  let noiseBuf = null;

  // デューティ d の矩形波(フーリエ級数で作る)
  function pulseWave(d) {
    const N = 48;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
    return ac.createPeriodicWave(re, im);
  }

  function prepare() {
    if (waves) return;
    waves = { p25: pulseWave(0.25), p125: pulseWave(0.125) };
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }

  // 1 音(音量の包絡: 立ち上がりすぐ・最後に少し減衰。ファミコンらしく硬めの音)
  function note(out, wave, f, t, dur, vol) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    if (typeof wave === 'string') o.type = wave;
    else o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  // ノイズの打楽器(hp = ハイパスの周波数)
  function noise(out, t, dur, vol, hp) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.01);
  }

  // キック(三角波の音程を急に下げる)
  function kick(out, t) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.13);
  }

  // ステップ n(8 分音符)の音を時刻 t に予約する
  function scheduleStep(out, n, t) {
    const s = n % SONG_STEPS;
    const bar = Math.floor(s / 8);
    // メロディ
    for (const m of MELODY_NOTES) if (m.step === s) note(out, waves.p25, m.f, t, m.len * STEP * 0.92, 0.075);
    // ベース(三角波。ルートとオクターブ上を 8 分で交互に。パンクらしく刻む)
    const cn = chordAt(s);
    const bf = freq(cn[0]) * (s % 2 === 1 ? 2 : 1);
    note(out, 'triangle', bf, t, STEP * 0.85, 0.2);
    // 裏打ち(拍の裏に 2 音の短いコード。夜の街のにぎやかさ)
    if (s % 2 === 1) {
      note(out, waves.p125, freq(cn[1]), t, STEP * 0.4, 0.028);
      note(out, waves.p125, freq(cn[2]), t, STEP * 0.4, 0.028);
    }
    // ドラム(16 分音符 2 つぶん)
    const pat = bar === 15 ? DRUM_FILL : bar >= 8 ? DRUM_B : DRUM_A;
    for (let k = 0; k < 2; k++) {
      const c = pat[(s % 8) * 2 + k];
      const tt = t + (k * STEP) / 2;
      if (c === 'k') kick(out, tt);
      if (c === 's' || c === 'S') noise(out, tt, 0.11, 0.16, 1200);
      if (c === 'S' || c === 'h') noise(out, tt, 0.03, 0.06, 7000);
      if (c === 'o') noise(out, tt, 0.12, 0.05, 6000);
    }
  }

  // ---- キャバクラ演出の効果音(2026-11-22。オリジナルの短いフレーズ) ----
  // 昔の携帯ゲーム機の圧電ブザーのような、矩形波(デューティ 50%)1 音だけのビープ音。
  // 「ピピピ♪ ピピピ♪ ピー・ピー・ピー♪」: 短い 3 連を 2 回(音の高さを上げて)→ 長めの 3 音で締める。
  // 1 マス = 0.1 秒。'-' = 前の音をのばす、'.' = 休み。24 マス(2.4 秒)で、店内(約 5 秒)のあいだ繰り返す
  const JINGLE_TICK = 0.1;
  const JINGLE = [
    'C6 E6 G6 . .', // ピピピ♪
    'D6 F6 A6 . .', // ピピピ♪(少し高く)
    'G6 - . C7 - . E7 - - - . . . .', // ピー・ピー・ピー♪
  ].join(' ');
  const JINGLE_VOL = 0.05; // 音量(効果音の「移動」「出現」と同じくらい。BGM は止めているので埋もれない)
  const JINGLE_DELAY = 0.15; // 店内に切り替わってから鳴り出すまで
  // [{ tick, f, len }] に直す
  const JINGLE_NOTES = (function () {
    const out = [];
    JINGLE.split(/\s+/).forEach((tok, i) => {
      if (tok === '-') {
        if (out.length && out[out.length - 1].tick + out[out.length - 1].len === i) out[out.length - 1].len++;
      } else if (tok !== '.') out.push({ tick: i, f: freq(tok), len: 1 });
    });
    return out;
  })();
  const JINGLE_TICKS = JINGLE.split(/\s+/).length; // 24 マス

  // ---- 再生の管理 ----
  let playing = false;
  let paused = false; // キャバクラ演出で一時停止中(次のステージで nextStep から再開する)
  let master = null; // 再生 1 回ごとの音量ノード(止めるときはこれを絞って切り離す)
  let nextStep = 0; // 次に予約するステップ(曲の頭から数える。ループしても増え続ける)
  let nextTime = 0; // そのステップの時刻(AudioContext の時刻)
  let lastOn = true;
  // キャバクラの効果音
  let jPlaying = false;
  let jMaster = null;
  let jTick = 0;
  let jTime = 0;

  // 音量ノードを作る(M キーの OFF のときは 0)
  function makeMaster(vol) {
    const m = ac.createGain();
    m.gain.value = PSR.audio.isOn() ? vol : 0;
    m.connect(ac.destination);
    return m;
  }

  // 予約済みの音もすぐ消えるよう、音量を絞ってから切り離す
  function fadeOut(m) {
    const t = ac.currentTime;
    m.gain.cancelScheduledValues(t);
    m.gain.setValueAtTime(m.gain.value, t);
    m.gain.linearRampToValueAtTime(0, t + 0.05);
    setTimeout(() => m.disconnect(), 400);
  }

  // 頭から(resume = true なら一時停止した位置から)鳴らし始める
  function start(resume) {
    ac = PSR.audio.context();
    if (!ac) return false;
    prepare();
    master = makeMaster(MASTER);
    lastOn = PSR.audio.isOn();
    if (!resume) nextStep = 0;
    nextTime = ac.currentTime + (resume ? 0.05 : START_DELAY);
    playing = true;
    paused = false;
    return true;
  }

  // 止める(pause = true なら位置を覚えておく)
  function stop(pause) {
    if (playing) {
      playing = false;
      fadeOut(master);
      master = null;
    }
    paused = !!pause && (paused || nextStep > 0);
  }

  function startJingle() {
    ac = PSR.audio.context();
    if (!ac) return false;
    prepare();
    jMaster = makeMaster(1);
    jTick = 0;
    jTime = ac.currentTime + JINGLE_DELAY;
    jPlaying = true;
    return true;
  }

  function stopJingle() {
    if (!jPlaying) return;
    jPlaying = false;
    fadeOut(jMaster);
    jMaster = null;
  }

  // M キーの ON / OFF に合わせて音量ノードを動かす
  function applyMute(m, vol, on) {
    if (!m) return;
    const t = ac.currentTime;
    m.gain.cancelScheduledValues(t);
    m.gain.setValueAtTime(m.gain.value, t);
    m.gain.linearRampToValueAtTime(on ? vol : 0, t + 0.03);
  }

  // キャバクラの効果音を先読みで予約する
  function updateJingle(on) {
    if (jTime < ac.currentTime) jTime = ac.currentTime + 0.02;
    while (jTime < ac.currentTime + LOOKAHEAD) {
      const k = jTick % JINGLE_TICKS;
      if (on) {
        for (const n of JINGLE_NOTES) {
          // 短い音は「ピッ」と切り、のばす音は少しだけ隙間をあける(ゲームウォッチ風の硬いビープ)
          if (n.tick === k) note(jMaster, 'square', n.f, jTime, n.len === 1 ? 0.06 : n.len * JINGLE_TICK - 0.04, JINGLE_VOL);
        }
      }
      jTick++;
      jTime += JINGLE_TICK;
    }
  }

  // 毎フレーム呼ぶ。state = ゲームの状態(PSR.state.state)
  function update(state) {
    const on = PSR.audio.isOn();
    const changed = on !== lastOn;
    lastOn = on;
    // キャバクラ演出: 本編の曲を一時停止し、専用の効果音を鳴らす
    if (state === 'club') {
      stop(true);
      if (!jPlaying && !startJingle()) return;
      if (changed) applyMute(jMaster, 1, on);
      updateJingle(on);
      return;
    }
    stopJingle();
    const want = state === 'playing' || state === 'stageclear';
    if (!want) {
      stop(false); // title・gameover: 次は頭から
      return;
    }
    if (!playing && !start(paused)) return;
    // M キーの ON / OFF(効果音と共通)
    if (changed) applyMute(master, MASTER, on);
    // 予約が遅れていたら(タブが裏に回っていたなど)、今の時刻から続ける
    if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.02;
    while (nextTime < ac.currentTime + LOOKAHEAD) {
      if (on) scheduleStep(master, nextStep, nextTime); // OFF のあいだは曲の位置だけ進める
      nextStep++;
      nextTime += STEP;
    }
  }

  // 確認用(テスト・デバッグ)
  function snapshot() {
    return {
      playing,
      paused,
      step: nextStep,
      bar: Math.floor((nextStep % SONG_STEPS) / 8) + 1,
      loops: Math.floor(nextStep / SONG_STEPS),
      songSteps: SONG_STEPS,
      seconds: SONG_STEPS * STEP,
      volume: master ? master.gain.value : 0,
      jingle: jPlaying, // キャバクラの効果音を鳴らしているか
      jingleTick: jTick, // 予約したマスの数(0.1 秒ごとに増える)
      jingleSeconds: JINGLE_TICKS * JINGLE_TICK,
      jingleVolume: jMaster ? jMaster.gain.value : 0,
    };
  }

  return { update, stop: () => (stop(false), stopJingle()), snapshot, BPM };
})();
