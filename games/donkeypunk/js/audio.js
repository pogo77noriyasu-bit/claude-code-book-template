// 効果音(Web Audio API で合成。音源ファイルは使わない)
// 鳴らすときは必ず DP.audio.play(name) を使う。M キーで ON/OFF。
window.DP = window.DP || {};

DP.audio = (function () {
  let ctx = null;
  let enabled = true;

  try {
    enabled = localStorage.getItem(DP.config.storageKeys.sound) !== 'off';
  } catch (e) {
    /* localStorage が使えない環境では既定値のまま */
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  // 短い音を並べて鳴らす。notes: [[周波数Hz, 長さ秒], ...]
  function tone(notes, type, volume) {
    const ac = ensure();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    let t = ac.currentTime;
    for (const [freq, dur] of notes) {
      if (freq > 0) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(volume || 0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start(t);
        osc.stop(t + dur);
      }
      t += dur;
    }
  }

  // 「ビュイ～～ン!」: 高い音から低い音へ滑らかに下がる電子音(釘バットの破壊音・オリジナル)。
  // 矩形波の周波数を指数カーブで下げながら、速いビブラートで「イ～～」とうならせる。
  // 1 オクターブ下の三角波を重ねて厚みを出す
  function zap(f0, f1, dur, volume) {
    const ac = ensure();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime;
    const out = ac.createGain();
    // 前半は同じ大きさのまま、後半でフェードアウト(少し長めに聞かせる)
    out.gain.setValueAtTime(volume, t);
    out.gain.setValueAtTime(volume, t + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.001, t + dur);
    out.connect(ac.destination);

    // ビブラート用の揺れ(LFO)。揺れ幅ははじめ大きく、だんだん小さく
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.setValueAtTime(22, t);
    depth.gain.setValueAtTime(f0 * 0.06, t);
    depth.gain.exponentialRampToValueAtTime(f1 * 0.08, t + dur);
    lfo.connect(depth);

    const voices = [
      { type: 'square', mul: 1, vol: 1 },
      { type: 'triangle', mul: 0.5, vol: 0.8 },
    ];
    for (const v of voices) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(f0 * v.mul, t);
      osc.frequency.exponentialRampToValueAtTime(f1 * v.mul, t + dur);
      depth.connect(osc.frequency);
      g.gain.value = v.vol;
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
  }

  // 周波数を f0 → f1 へ動かす 1 音(ピッチが動く効果音用)。ビブラートは任意
  function sweep(f0, f1, dur, type, volume, vib) {
    const ac = ensure();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.setValueAtTime(volume, t + dur * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(ac.destination);
    if (vib) {
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      lfo.frequency.setValueAtTime(vib.rate, t);
      depth.gain.setValueAtTime(vib.depth, t);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // 短い雑音(足音の「ザッ」)。8bit 機風に数サンプルずつ同じ値を続けて粗くする
  function thump(dur, volume) {
    const ac = ensure();
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) {
      if (i % 8 === 0) v = Math.random() * 2 - 1;
      data[i] = v;
    }
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(volume, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.connect(gain).connect(ac.destination);
    src.start();
  }

  const SMASH_DUR = 0.5;

  const SOUNDS = {
    start: () => tone([[392, 0.08], [523, 0.08], [659, 0.08], [784, 0.16]]),
    jump: () => tone([[300, 0.04], [450, 0.05]], 'square', 0.04),
    score: () => tone([[880, 0.05], [1175, 0.08]], 'square', 0.04),
    throw: () => tone([[160, 0.06], [120, 0.08]], 'sawtooth', 0.05),
    miss: () => tone([[523, 0.1], [440, 0.1], [349, 0.1], [262, 0.3]], 'triangle', 0.1),
    // パンク風の「オイ!オイ!オイ!」ジングル(自作フレーズ)
    clear: () => tone([[330, 0.12], [0, 0.06], [330, 0.12], [0, 0.06], [330, 0.12], [0, 0.06], [494, 0.12], [440, 0.12], [659, 0.36]], 'square', 0.07),
    gameover: () => tone([[294, 0.2], [277, 0.2], [262, 0.2], [196, 0.5]], 'triangle', 0.1),
    // 足音「ピコ」「ポコ」。歩いている間、交互に鳴らす。
    // 連続で鳴ってもうるさくないよう、ごく短く・音量も他の効果音より小さくしている
    stepA: () => tone([[988, 0.03]], 'square', 0.018), // ピコ(高め)
    stepB: () => tone([[659, 0.035]], 'square', 0.018), // ポコ(低め)
    // 釘バット: 取得(上がるファンファーレ)/ 破壊(ガシャッ)/ 残りわずかの警告 / 終了
    batGet: () => tone([[523, 0.05], [659, 0.05], [784, 0.05], [1047, 0.12]], 'square', 0.05),
    // ビュイ～～ン!(約 0.5 秒)。BGM 中でもはっきり聞こえるよう大きめに鳴らし、その間 BGM を下げる
    smash: () => {
      zap(1760, 140, SMASH_DUR, 0.07);
      duckMusic(SMASH_DUR);
    },
    batTick: () => tone([[1319, 0.025]], 'square', 0.02),
    // ---- クリア後の逃走演出 ----
    // ゴリラの足音「ドスン」: 倍音の多い矩形波を 180Hz → 60Hz へ急降下させ、雑音を重ねる。
    // (低い音だけだとノート PC などの小さなスピーカーでは聞こえないので、高めの成分から始める)
    // 左右の足で少し高さを変える
    bossStep: () => {
      sweep(180, 60, 0.09, 'square', 0.07);
      thump(0.05, 0.05);
    },
    bossStep2: () => {
      sweep(150, 50, 0.09, 'square', 0.07);
      thump(0.05, 0.05);
    },
    // ガールの悲鳴「キャーッ」: 高い音へ上がってから下がり、速いビブラートでうならせる(約 0.45 秒)
    scream: () => {
      sweep(1100, 1700, 0.18, 'square', 0.05, { rate: 28, depth: 90 });
      setTimeout(() => {
        if (enabled) sweep(1700, 900, 0.27, 'square', 0.05, { rate: 28, depth: 90 });
      }, 170);
    },
    batEnd: () => tone([[784, 0.06], [523, 0.06], [392, 0.12]], 'triangle', 0.07),
  };

  // ---- BGM(釘バット使用中に流すループ曲。オリジナルのフレーズ) ----
  // 1 文字列 = 1 小節 = 8 分音符 8 個。'.' は休符、'-' は前の音をのばす
  const N = { B3: 247, C4: 262, D4: 294, E4: 330, 'F#4': 370, G4: 392, A4: 440, B4: 494,
    C5: 523, D5: 587, 'D#5': 622, E5: 659, 'F#5': 740, G5: 784, A5: 880, B5: 988,
    E2: 82, B2: 123, C3: 131, D3: 147, A2: 110 };
  const BAT_SONG = {
    bpm: 168,
    // メロディー(矩形波): 跳ねるように上がって、最後の小節で盛り上げて頭に戻る
    lead: [
      ['B4', 'E5', '.', 'E5', 'G5', 'E5', 'B4', 'E5'],
      ['C5', 'E5', '.', 'E5', 'G5', 'A5', 'G5', 'E5'],
      ['D5', 'F#5', '.', 'F#5', 'A5', 'F#5', 'D5', 'A5'],
      ['B5', '-', 'A5', 'F#5', 'D#5', 'F#5', 'B4', 'D#5'],
    ],
    // ベース(三角波): パンクらしく 8 分でルート音を刻む。Em → C → D → B
    bass: ['E2', 'C3', 'D3', 'B2'],
  };
  const music = { name: null, bus: null, timer: null, nextTime: 0, step: 0 };

  // BGM 用の 1 音(music.bus につなぐので、止めるときはまとめて消せる)
  function musicNote(ac, freq, t, dur, type, vol) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(music.bus);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  // スネア(短い雑音)
  function musicSnare(ac, t) {
    const len = Math.floor(ac.sampleRate * 0.06);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(0.025, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(gain).connect(music.bus);
    src.start(t);
  }

  // 8 分音符 1 つ分を予約する
  function scheduleStep(ac, i, t) {
    const song = BAT_SONG;
    const eighth = 60 / song.bpm / 2;
    const bar = Math.floor(i / 8);
    const pos = i % 8;
    const name = song.lead[bar][pos];
    if (name !== '.' && name !== '-') {
      // 次が '-' なら 2 つ分のばす
      const hold = song.lead[bar][pos + 1] === '-' ? 2 : 1;
      musicNote(ac, N[name], t, eighth * hold * 0.9, 'square', 0.028);
    }
    musicNote(ac, N[song.bass[bar]], t, eighth * 0.8, 'triangle', 0.06);
    if (pos === 2 || pos === 6) musicSnare(ac, t); // 2 拍目・4 拍目の裏打ち
  }

  // 少し先(0.15 秒)までの音を予約しておく。40ms ごとに呼んで続きを足す
  function pump() {
    const ac = ctx;
    if (!ac || !music.name) return;
    const eighth = 60 / BAT_SONG.bpm / 2;
    while (music.nextTime < ac.currentTime + 0.15) {
      scheduleStep(ac, music.step, music.nextTime);
      music.nextTime += eighth;
      music.step = (music.step + 1) % (BAT_SONG.lead.length * 8);
    }
  }

  function startMusic(name) {
    const ac = ensure();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    music.name = name;
    music.bus = ac.createGain();
    music.bus.connect(ac.destination);
    music.step = 0;
    music.duckUntil = 0;
    music.nextTime = ac.currentTime + 0.3; // 取得音のファンファーレが終わってから始める
    pump();
    music.timer = setInterval(pump, 40);
  }

  function stopMusic() {
    if (!music.name) return;
    clearInterval(music.timer);
    music.timer = null;
    // 予約済みの音も含めて、BGM 用の出力ごと切り離して即座に消す
    try {
      music.bus.disconnect();
    } catch (e) {
      /* 切り離し済み */
    }
    music.bus = null;
    music.name = null;
  }

  // 効果音を目立たせるため、dur 秒だけ BGM の音量を下げてから元に戻す(ダッキング)
  const DUCK_LEVEL = 0.3;
  function duckMusic(dur) {
    if (!music.bus || !ctx) return;
    const t = ctx.currentTime;
    const g = music.bus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(DUCK_LEVEL, t + 0.02);
    g.setValueAtTime(DUCK_LEVEL, t + dur);
    g.linearRampToValueAtTime(1, t + dur + 0.15);
    music.duckUntil = t + dur;
  }

  // 流したい BGM を毎ステップ指定する(null で停止)。音 OFF のときは流さない
  function setMusic(name) {
    const want = enabled ? name : null;
    if (want === music.name) return;
    stopMusic();
    if (want) {
      try {
        startMusic(want);
      } catch (e) {
        music.name = null; /* 鳴らせなくてもゲームは続ける */
      }
    }
  }

  // テスト用の通知先(?test のときだけ test-hooks.js が設定する。通常は null)
  let onPlay = null;

  // ハシゴを登る音「ピュッ」: 一段ごとに短く上がる音。level(登った段数)が増えるほど高くなる
  function climbSound(level) {
    const base = 330 * Math.pow(2, Math.min(level, 24) / 12); // 半音ずつ上がる(2 オクターブまで)
    sweep(base, base * 1.5, 0.07, 'square', 0.045);
  }

  // name: 効果音の名前。arg はその音に渡す値(今は climb の段数だけ)
  function play(name, arg) {
    if (!enabled) return;
    if (name === 'climb') {
      if (onPlay) onPlay(name);
      try {
        climbSound(arg || 0);
      } catch (e) {
        /* 音が鳴らせなくてもゲームは続ける */
      }
      return;
    }
    if (!SOUNDS[name]) return;
    if (onPlay) onPlay(name);
    try {
      SOUNDS[name]();
    } catch (e) {
      /* 音が鳴らせなくてもゲームは続ける */
    }
  }

  function toggle() {
    enabled = !enabled;
    if (!enabled) stopMusic(); // OFF にしたら BGM もすぐ止める(ON に戻すと game.js が再開を指示する)
    try {
      localStorage.setItem(DP.config.storageKeys.sound, enabled ? 'on' : 'off');
    } catch (e) {
      /* 保存できなくても切り替えは有効 */
    }
    return enabled;
  }

  return {
    play,
    toggle,
    isEnabled: () => enabled,
    setMusic,
    currentMusic: () => music.name,
    // BGM を下げている最中か(テスト用)
    isMusicDucked: () => !!(music.name && ctx && ctx.currentTime < music.duckUntil),
    _setOnPlay: (fn) => { onPlay = fn; },
  };
})();
