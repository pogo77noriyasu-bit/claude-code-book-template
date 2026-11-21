// 効果音(Web Audio で合成。音源ファイルは使わない)
PQ.audio = (function () {
  let ctx = null;
  let enabled = true;
  const log = []; // 鳴らした音の履歴(テスト用)
  try {
    enabled = localStorage.getItem(PQ.config.SOUND_KEY) !== 'off';
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

  // 1 音: 波形・開始/終了の周波数・長さ(秒)・音量・開始の遅れ(秒)
  function tone(type, f0, f1, dur, vol, delay) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const SOUNDS = {
    // 線を引いている間の「ジジッ」
    draw: () => tone('square', 900, 700, 0.03, 0.04),
    // 陣地を獲得「ピロリロリン」
    capture: () => [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.08, 0.08, i * 0.06)),
    // ミス「ピュルルル↓」
    miss: () => {
      tone('square', 880, 80, 0.7, 0.12);
      tone('sawtooth', 440, 60, 0.7, 0.05);
    },
    // ステージクリアのファンファーレ
    clear: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.14, 0.09, i * 0.12)),
    // 開始
    start: () => [392, 523, 659].forEach((f, i) => tone('triangle', f, f, 0.1, 0.15, i * 0.08)),
    // 1UP: 明るい長調の駆け上がりを 2 回(8 ビット風の矩形波)。BGM は不気味なままで、この音だけ明るい
    oneUp: () => {
      [1047, 1319, 1568, 2093].forEach((f, i) => tone('square', f, f, 0.06, 0.08, i * 0.05));
      [1319, 1568, 2093, 2637].forEach((f, i) => tone('square', f, f, 0.07, 0.08, 0.24 + i * 0.05));
    },
    // ゲームオーバー
    over: () => [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.98, 0.25, 0.15, i * 0.22)),
  };

  // ---- BGM ----
  // 1980 年代初期のアーケード風の、不気味で緊張感のある短いループ(オリジナル)。
  // テンポ 104・16 分音符 × 16 ステップ × 4 小節(約 9.2 秒)。
  //  - ベース(矩形波): E と F を行き来する半音の心音のような刻み(群衆が迫ってくる足音)
  //  - 上の音(細い矩形波): 減七の和音をゆっくりなぞる、冷たい電子音
  //  - 高い持続音(三角波): 2 小節ごとに半音ずつずり下がるうなり
  //  - 雑音: 裏拍の小さな「チッ」と、小節の頭の重い「ドッ」
  // 明るい長調の音は使わない(半音と減七だけ)。
  const BGM = {
    bpm: 104,
    steps: 64,
    // 小節ごとの根音(MIDI 番号): E1 → F1 → E1 → D#1
    roots: [28, 29, 28, 27],
    // ベースを鳴らすステップ(1 小節 16 ステップ中。ドッ・ドッ…と心音のように 2 つずつ)
    bassSteps: [0, 2, 6, 8, 10, 14],
    // 上の音: 減七の和音(根音から 0・3・6・9 半音)を 2 ステップごとに上下
    arp: [0, 3, 6, 9, 12, 9, 6, 3],
  };
  const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);
  let noiseBuf = null;
  let music = null; // 再生中の BGM の状態 { gain, step, next, timer }
  let musicWanted = false; // BGM を流したいか(ゲームの状態から決まる)

  // 予約して鳴らす 1 音(BGM 用。BGM の GainNode につなぐ)
  function mtone(out, type, f, t, dur, vol, slideTo) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.linearRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function mnoise(out, t, dur, vol, hp) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = hp ? 'highpass' : 'lowpass';
    f.frequency.value = hp ? 6000 : 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // 1 ステップ(16 分音符)分の音を予約する
  function scheduleStep(out, step, t) {
    const sd = 60 / BGM.bpm / 4; // 1 ステップの長さ(秒)
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const root = BGM.roots[bar];
    // ベース: 低い音は小さなスピーカーで聞こえにくいので、倍音の多い矩形波で 1 オクターブ上も重ねる
    if (BGM.bassSteps.includes(s)) {
      const accent = s % 8 === 0;
      mtone(out, 'square', midiHz(root + 12), t, sd * 1.6, accent ? 0.11 : 0.07);
      mtone(out, 'triangle', midiHz(root), t, sd * 1.8, 0.18);
    }
    // 上の音: 減七の分散和音(2 ステップごと)。小節の後半は 1 オクターブ上でこわさを増す
    if (s % 2 === 0) {
      const n = root + 48 + BGM.arp[s / 2] + (s >= 8 && bar % 2 === 1 ? 12 : 0);
      mtone(out, 'square', midiHz(n), t, sd * 1.2, 0.035);
    }
    // 高い持続音: 2 小節ごとに、半音下へずり下がるうなり
    if (s === 0 && bar % 2 === 0) {
      const top = midiHz(root + 59);
      mtone(out, 'triangle', top, t, sd * 30, 0.05, top * Math.pow(2, -1 / 12));
    }
    // 雑音: 小節の頭の重い音と、裏拍の小さな音
    if (s === 0) mnoise(out, t, 0.18, 0.25, false);
    if (s % 4 === 2) mnoise(out, t, 0.03, 0.05, true);
  }

  function startMusic() {
    if (music || !ctx || ctx.state !== 'running') return;
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    gain.connect(ctx.destination);
    music = { gain, step: 0, next: ctx.currentTime + 0.05, timer: null };
    const sd = 60 / BGM.bpm / 4;
    const pump = () => {
      if (!music) return;
      // 遅れて過ぎてしまった分はまとめて鳴らさず、今の時刻から続ける
      if (music.next < ctx.currentTime - 0.1) music.next = ctx.currentTime + 0.02;
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
    // 予約済みの音ごと切り離す(少しだけ絞ってからにして、プツッと鳴らないように)
    try {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => g.disconnect(), 120);
    } catch (e) {
      g.disconnect();
    }
    music = null;
  }

  // BGM を流すかどうか(game.js が毎ステップ呼ぶ)。音 OFF の間は流さない
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
    setMusic(musicWanted); // OFF にしたら止め、ON に戻したら(流す場面なら)再開
    try {
      localStorage.setItem(PQ.config.SOUND_KEY, enabled ? 'on' : 'off');
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
    musicPlaying: () => !!music, // 実際に鳴らしているか
    log,
    BGM,
  };
})();
