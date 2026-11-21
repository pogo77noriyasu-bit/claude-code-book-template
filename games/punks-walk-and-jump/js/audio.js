// 効果音と BGM(Web Audio で合成したオリジナルの 8 ビット風。音源ファイル・既存の曲は使わない)
PW.audio = (function () {
  let ctx = null;
  let enabled = true;
  const log = []; // 鳴らした効果音の履歴(テスト用)
  try {
    enabled = localStorage.getItem(PW.config.SOUND_KEY) !== 'off';
  } catch (e) {
    /* 保存できない環境では ON のまま */
  }

  // 最初のキー入力・タッチで AudioContext を作る(ブラウザの自動再生の制限)
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().then(() => setMusic(musicWanted));
  }

  // 1 音: 波形・開始/終了の周波数・長さ(秒)・音量・開始の遅れ(秒)・出力先
  function tone(type, f0, f1, dur, vol, delay, out) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out || ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // 雑音(ドラム・衝突・水しぶき)。filter: 'lowpass' | 'highpass' | 'bandpass'、freq: フィルターの周波数
  let noiseBuf = null;
  function noise(t, dur, vol, filter, freq, out, freqTo) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out || ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const SOUNDS = {
    // ジャンプ「ピョッ」
    hop: () => tone('square', 520, 980, 0.06, 0.06),
    // ゴール「ピロリロリーン」(明るい長調の駆け上がり)
    goal: () => [784, 988, 1175, 1568, 1976].forEach((f, i) => tone('square', f, f, i === 4 ? 0.2 : 0.07, 0.08, i * 0.06)),
    // 車とぶつかった「ガシャン」
    crash: () => {
      const t = ctx.currentTime;
      noise(t, 0.35, 0.35, 'lowpass', 2500, null, 300);
      tone('square', 220, 50, 0.35, 0.1);
    },
    // 水に落ちた「ボチャン」
    splash: () => {
      const t = ctx.currentTime;
      tone('sine', 900, 150, 0.25, 0.15);
      noise(t + 0.05, 0.45, 0.2, 'bandpass', 1800, null, 400);
    },
    // ステージクリアのファンファーレ
    clear: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone('square', f, f, i === 6 ? 0.4 : 0.12, 0.09, i * 0.11)),
    // ゲームオーバー
    over: () => [494, 466, 440, 330].forEach((f, i) => tone('triangle', f, f * 0.97, i === 3 ? 0.6 : 0.25, 0.16, i * 0.25)),
    // 開始
    start: () => [330, 415, 494, 659].forEach((f, i) => tone('square', f, f, 0.08, 0.07, i * 0.07)),
    // 1UP: 明るい長調の駆け上がりを 2 回(PUNKS QIX の 1UP の音と同じ形)
    oneUp: () => {
      [1047, 1319, 1568, 2093].forEach((f, i) => tone('square', f, f, 0.06, 0.08, i * 0.05));
      [1319, 1568, 2093, 2637].forEach((f, i) => tone('square', f, f, 0.07, 0.08, 0.24 + i * 0.05));
    },
  };

  // ---- BGM ----
  // 軽快で少しコミカルな 8 ビットのパンクロック風ループ(オリジナル)。テンポ 176・16 分音符 × 16 ステップ × 4 小節(約 5.5 秒)。
  //  - ベース: 8 分音符で根音を刻み続ける(パンクの「ダダダダ」)。矩形波 + 三角波
  //  - パワーコード: 根音と 5 度を、小節の頭と裏で短く鳴らす
  //  - メロディ: 長調のペンタトニックを中心に、跳ねるように動く
  //  - ドラム: 1・3 拍目にキック、2・4 拍目にスネア、8 分のハイハット
  const BGM = {
    bpm: 176,
    steps: 64,
    // 小節ごとの根音(MIDI 番号): E2 → A2 → D2 → B1
    roots: [40, 45, 38, 35],
    // パワーコードを鳴らすステップ(1 小節 16 ステップ中)
    chordSteps: [0, 6, 10],
    // メロディ(小節ごと・ステップごとの MIDI 番号。null は休み)
    melody: [
      [76, null, 76, 79, null, 76, 74, null, 71, null, 74, 76, null, null, 71, null],
      [81, null, 79, 76, null, 74, 76, null, 81, null, 83, 81, null, 79, null, null],
      [78, null, 76, 74, null, 71, 74, null, 78, null, 74, null, 76, null, 78, null],
      [83, null, 81, 79, null, 78, 76, null, 75, null, 78, null, 71, null, null, null],
    ],
  };
  const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);
  let music = null; // 再生中の BGM { gain, step, next, timer }
  let musicWanted = false;

  // 予約して鳴らす 1 音(BGM 用)
  function mtone(out, type, f, t, dur, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // 1 ステップ(16 分音符)分を予約する
  function scheduleStep(out, step, t) {
    const sd = 60 / BGM.bpm / 4;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const root = BGM.roots[bar];
    // ベース: 8 分音符で刻む
    if (s % 2 === 0) {
      mtone(out, 'square', midiHz(root + 12), t, sd * 1.5, s % 8 === 0 ? 0.08 : 0.055);
      mtone(out, 'triangle', midiHz(root), t, sd * 1.8, 0.16);
    }
    // パワーコード(根音 + 5 度 + オクターブ)
    if (BGM.chordSteps.includes(s)) {
      for (const iv of [12, 19, 24]) mtone(out, 'square', midiHz(root + iv), t, sd * 1.4, 0.025);
    }
    // メロディ
    const m = BGM.melody[bar][s];
    if (m !== null) mtone(out, 'square', midiHz(m), t, sd * 1.7, 0.045);
    // ドラム
    if (s === 0 || s === 8) {
      mtone(out, 'sine', 150, t, 0.12, 0.35); // キック
      noise(t, 0.05, 0.15, 'lowpass', 400, out);
    }
    if (s === 4 || s === 12) noise(t, 0.12, 0.22, 'bandpass', 1800, out); // スネア
    if (s % 2 === 0) noise(t, 0.025, 0.05, 'highpass', 7000, out); // ハイハット
  }

  function startMusic() {
    if (music || !ctx || ctx.state !== 'running') return;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    gain.connect(ctx.destination);
    music = { gain, step: 0, next: ctx.currentTime + 0.05, timer: null };
    const sd = 60 / BGM.bpm / 4;
    const pump = () => {
      if (!music) return;
      if (music.next < ctx.currentTime - 0.1) music.next = ctx.currentTime + 0.02; // 遅れた分はまとめて鳴らさない
      while (music.next < ctx.currentTime + 0.15) {
        scheduleStep(music.gain, music.step, music.next);
        music.step = (music.step + 1) % BGM.steps;
        music.next += sd;
      }
    };
    pump();
    music.timer = setInterval(pump, 30);
  }

  function stopMusic() {
    if (!music) return;
    clearInterval(music.timer);
    const g = music.gain;
    try {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => g.disconnect(), 120);
    } catch (e) {
      g.disconnect();
    }
    music = null;
  }

  // BGM を流すか(game.js が毎ステップ呼ぶ)。音 OFF の間は流さない
  function setMusic(on) {
    musicWanted = !!on;
    if (musicWanted && enabled) startMusic();
    else stopMusic();
  }

  function play(name) {
    if (!enabled) return;
    log.push(name);
    if (log.length > 200) log.shift();
    if (!ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
    SOUNDS[name]();
  }

  function toggle() {
    enabled = !enabled;
    setMusic(musicWanted);
    try {
      localStorage.setItem(PW.config.SOUND_KEY, enabled ? 'on' : 'off');
    } catch (e) {
      /* 保存できなくても続ける */
    }
    return enabled;
  }

  return {
    unlock,
    play,
    toggle,
    setMusic,
    isOn: () => enabled,
    musicWanted: () => musicWanted,
    musicPlaying: () => !!music,
    log,
    BGM,
    SOUNDS,
  };
})();
