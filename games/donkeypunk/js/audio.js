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

  // ブラウザの音声再生の制限への対応: 多くのブラウザは、ユーザーがキーやボタンを押すまで音を出させない。
  // 最初のキー入力・クリック・タッチのときに AudioContext を作って(止まっていれば)再開しておく。
  // それより前に BGM の再生を指示されていた場合も、ここで再開した時点から鳴り始める
  function unlock() {
    try {
      const ac = ensure();
      if (ac && ac.state === 'suspended') ac.resume();
    } catch (e) {
      /* 音が使えなくてもゲームは続ける */
    }
  }
  for (const type of ['keydown', 'pointerdown', 'touchstart']) {
    window.addEventListener(type, unlock, { passive: true });
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
    // 4 面の安全ピンを抜いた音: 金属の「キン」(高い矩形波)から「ポン」と抜ける上昇音。
    // 小さなスピーカーでも聞こえるよう、高めの音だけで作る
    pin: () => tone([[1568, 0.03], [2093, 0.04], [1047, 0.03], [1397, 0.03], [1760, 0.06]], 'square', 0.05),
    throw: () => tone([[160, 0.06], [120, 0.08]], 'sawtooth', 0.05),
    // 1 面のゴミ箱が角で倒れて「ガタン」(金属の短い音 + 低い音の急降下 + 鈍い響き。小さなスピーカーでも聞こえる高めの成分から始める)
    trashThud: () => {
      tone([[880, 0.02]], 'square', 0.03);
      sweep(240, 80, 0.09, 'square', 0.05);
      thump(0.1, 0.06);
    },
    // 4 面のクリア演出(すべてオリジナル)
    // 「ガキン!」: 8 本目の安全ピンを抜いた金属音(高い矩形波 2 つ + 短い雑音)
    clank: () => {
      tone([[2637, 0.04], [1976, 0.12]], 'square', 0.07);
      thump(0.06, 0.08);
    },
    // 「ガラガラガッシャーン!」: 崩れる音(低い音のガラガラを並べ、最後に長い雑音)
    collapse: () => {
      tone([[220, 0.05], [165, 0.05], [247, 0.05], [147, 0.05], [196, 0.05], [131, 0.05], [175, 0.05], [110, 0.05]], 'sawtooth', 0.06);
      thump(0.25, 0.08);
      setTimeout(() => {
        if (!enabled) return;
        sweep(600, 60, 0.7, 'square', 0.06);
        thump(0.9, 0.12);
      }, 420);
    },
    // 「バン!」: 8bit 風の銃声(高い音から急に下がる矩形波 + 短い雑音)
    gun: () => {
      sweep(1400, 200, 0.06, 'square', 0.06);
      thump(0.08, 0.12);
    },
    // 「ドッカーン!」: ゴリラ警官が地面に落ちた衝撃音(高めから急降下する音 + 長い雑音)
    boom: () => {
      sweep(500, 40, 0.6, 'square', 0.09);
      thump(0.7, 0.16);
    },
    // 鉄骨がガタガタ揺れる「ガタガタ」: 高い金属のきしみ(短い矩形波を不規則に)+ 短い雑音
    rattle: () => {
      tone([[1175, 0.025], [0, 0.015], [1480, 0.02], [0, 0.02], [988, 0.03]], 'square', 0.035);
      thump(0.05, 0.05);
    },
    // 鉄骨が外れて落ち始める「ギギーッ」: のこぎり波をうならせながら下げる(金属が曲がる音)
    creak: () => sweep(900, 320, 0.22, 'sawtooth', 0.04, { rate: 30, depth: 40 }),
    // 崩れた鉄骨が地面にぶつかる「ガシャン!」: 金属を打つ高い音 + 低めの衝撃の雑音
    debrisHit: () => {
      tone([[1760, 0.03], [1319, 0.05]], 'square', 0.05);
      sweep(260, 70, 0.14, 'square', 0.06);
      thump(0.18, 0.1);
    },
    // ガールが落ちてくる「ヒューン」: 高い音からゆっくり下がる三角波(約 0.8 秒)
    girlFall: () => sweep(1800, 600, 0.8, 'triangle', 0.06, { rate: 9, depth: 25 }),
    // ガールが着地する「ポン」: やわらかく跳ねる 2 音 + ごく小さな雑音
    girlLand: () => {
      tone([[523, 0.05], [784, 0.09]], 'triangle', 0.08);
      thump(0.04, 0.04);
    },
    // ---- 面間演出(やぐらを積み上げる。すべてオリジナル) ----
    // 警察官の足踏み「ザッ」: 短い雑音 + 低めの短い矩形波(小さなスピーカーでも聞こえる高さから)
    copStep: () => {
      thump(0.04, 0.05);
      tone([[220, 0.03]], 'square', 0.025);
    },
    // ゴリラ警官の指示「ウホッ!」: 短く上がってから下がる、うなるような矩形波
    bossBark: () => {
      sweep(260, 420, 0.07, 'square', 0.06, { rate: 40, depth: 30 });
      setTimeout(() => {
        if (enabled) sweep(400, 180, 0.12, 'square', 0.06, { rate: 40, depth: 30 });
      }, 80);
    },
    // クレーンの巻き上げ「カリカリ」: ごく短い高い音
    winch: () => tone([[1568, 0.015], [0, 0.01], [1319, 0.015]], 'square', 0.025),
    // 鉄骨を積んだ「ガキーン!」: 金属を打つ高い音を響かせ、衝撃の雑音を重ねる
    beamClang: () => {
      tone([[2093, 0.03], [1568, 0.25]], 'square', 0.06);
      tone([[1046, 0.3]], 'triangle', 0.06);
      sweep(300, 80, 0.15, 'square', 0.05);
      thump(0.12, 0.1);
    },
    // やぐら完成のファンファーレ(3 面のあと。上がっていく明るいフレーズ)
    towerDone: () => tone([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.2], [0, 0.05], [784, 0.1], [1047, 0.4]], 'square', 0.06),
    // ---- 4 面のボーナスアイテム ----
    // 「チャリーン♪」: 上がっていく 3 音 + きらめき。高いアイテムほど少し高く(score: 300 / 500 / 800)
    prize: (score) => {
      const k = score >= 800 ? 1.26 : score >= 500 ? 1.12 : 1;
      tone([[1047 * k, 0.05], [1319 * k, 0.05], [1568 * k, 0.05], [2093 * k, 0.12]], 'square', 0.05);
      setTimeout(() => {
        if (enabled) tone([[2637 * k, 0.03], [0, 0.03], [3136 * k, 0.05]], 'triangle', 0.035);
      }, 220);
    },
    // ---- 4 面の怒ったポリスマン ----
    // ゴリラ警官の笛「ピーッ」(出現の合図): 高い音を細かくふるわせる
    whistle: () => sweep(2400, 2600, 0.3, 'square', 0.035, { rate: 30, depth: 120 }),
    // 穴から落ちて気絶「ヒュ~ ゴン! ピヨピヨ」
    copStun: () => {
      sweep(900, 300, 0.18, 'square', 0.04);
      setTimeout(() => {
        if (!enabled) return;
        sweep(240, 80, 0.12, 'square', 0.06);
        thump(0.1, 0.08);
        tone([[1760, 0.05], [2093, 0.05], [1760, 0.05], [2093, 0.08]], 'triangle', 0.04);
      }, 180);
    },
    // 2 人がそろってハートが出たときの小さなチャイム
    heart: () => tone([[784, 0.08], [988, 0.08], [1319, 0.16]], 'triangle', 0.07),
    // 花火「ヒュ~~~ ドーン パラパラ」: 打ち上げの上昇音 → 開く音(雑音)→ はじける細かい音
    firework: () => {
      sweep(500, 1600, 0.3, 'square', 0.025);
      setTimeout(() => {
        if (!enabled) return;
        sweep(400, 90, 0.25, 'square', 0.05);
        thump(0.35, 0.09);
        tone([[2093, 0.02], [0, 0.04], [2637, 0.02], [0, 0.05], [1760, 0.02], [0, 0.04], [2349, 0.02]], 'square', 0.02);
      }, 300);
    },
    miss: () => tone([[523, 0.1], [440, 0.1], [349, 0.1], [262, 0.3]], 'triangle', 0.1),
    // パンク風の「オイ!オイ!オイ!」ジングル(自作フレーズ)
    // (4 面では幸せな BGM が流れているので、ジングルの間だけ BGM を下げる。ほかの面では BGM がないので何もしない)
    clear: () => {
      duckMusic(1.2);
      tone([[330, 0.12], [0, 0.06], [330, 0.12], [0, 0.06], [330, 0.12], [0, 0.06], [494, 0.12], [440, 0.12], [659, 0.36]], 'square', 0.07);
    },
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

  // ---- BGM ----
  // 'main': 通常プレイの BGM(全ステージ共通。曲データは js/music.js)
  // 'bat' : 釘バット使用中に流すループ曲(オリジナルのフレーズ。使用中はこちらが優先。どちらを流すかは game.js が決める)
  // どちらも Web Audio で合成する(音源ファイルは使わない)
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
  // active: 鳴らしている BGM の数(テスト用。重複して流れていないか = 0 か 1 であること)
  const music = { name: null, bus: null, out: null, timer: null, nextTime: 0, step: 0, active: 0 };
  let onMusicStep = null; // テスト用の通知先(BGM の 1 ステップを予約するたびに呼ぶ)

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

  // 釘バットの BGM: 8 分音符 1 つ分を予約する
  function scheduleBatStep(ac, i, t) {
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

  // ---- 通常プレイの BGM(ファミコン風: 矩形波 2 つ・三角波・雑音) ----

  // デューティ比 duty の矩形波(パルス波)の波形。Web Audio の 'square' は 50% 固定なので、
  // フーリエ級数で 25% / 12.5% などの細い矩形波を作る(AudioContext ごとに 1 回だけ作って使い回す)
  const pulseWaves = {};
  function pulseWave(ac, duty) {
    if (pulseWaves[duty]) return pulseWaves[duty];
    const n = 64;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = Math.sin(2 * Math.PI * k * duty) / (Math.PI * k);
      imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (Math.PI * k);
    }
    pulseWaves[duty] = ac.createPeriodicWave(real, imag);
    return pulseWaves[duty];
  }

  // 雑音の波形(1 秒分。毎回作らずに使い回す)。粗さ hold: 何サンプル同じ値を続けるか(大きいほど低く濁る)
  const noiseBufs = {};
  function noiseBuffer(ac, hold) {
    if (noiseBufs[hold]) return noiseBufs[hold];
    const len = ac.sampleRate;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) {
      if (i % hold === 0) v = Math.random() * 2 - 1;
      data[i] = v;
    }
    noiseBufs[hold] = buf;
    return buf;
  }

  // DP.music.events が返す 1 音を、時刻 t に鳴らす予約をする
  function playMusicEvent(ac, e, t) {
    const gain = ac.createGain();
    gain.connect(music.bus);
    if (e.ch === 'noise') {
      // スネアは粗めの雑音、ハイハット・クラッシュは細かい雑音
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac, e.kind === 'snare' ? 3 : 1);
      gain.gain.setValueAtTime(e.vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + e.dur);
      src.connect(gain);
      src.start(t, Math.random() * 0.5);
      src.stop(t + e.dur + 0.01);
      return;
    }
    const osc = ac.createOscillator();
    if (e.ch === 'tri') osc.type = 'triangle';
    else osc.setPeriodicWave(pulseWave(ac, e.duty || 0.5));
    osc.frequency.setValueAtTime(e.freq, t);
    if (e.freqEnd) osc.frequency.exponentialRampToValueAtTime(e.freqEnd, t + e.dur); // キック: 音程を一瞬で下げる
    if (e.ch === 'tri') {
      // 三角波は(ファミコンと同じく)音量の変化なし。鳴らす長さだけで区切る
      gain.gain.setValueAtTime(e.vol, t);
      gain.gain.setValueAtTime(0, t + e.dur);
    } else {
      // 矩形波は鳴り始めの音量を少し保ってから減衰させる
      gain.gain.setValueAtTime(e.vol, t);
      gain.gain.setValueAtTime(e.vol, t + e.dur * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, t + e.dur);
    }
    if (e.vibrato) {
      // のばす音は、鳴り始めから少し遅れて揺らす
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      lfo.frequency.value = 6;
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(e.freq * 0.012, t + 0.15);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + e.dur + 0.01);
    }
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + e.dur + 0.01);
  }

  // BGM ごとの進み方。stepSec: 1 ステップの長さ / steps: ループのステップ数 /
  // startDelay: 流し始めるまでの待ち(釘バットは取得音のファンファーレのあと) /
  // gain: BGM 全体の音量(通常の BGM は効果音より控えめにする)
  const SONGS = {
    // 4 面のクリア演出(ハートのあと)の幸せな曲。曲データは js/music.js の SONGS.happy
    happy: {
      stepSec: () => DP.music.songInfo('happy').stepSec,
      steps: () => DP.music.songInfo('happy').steps,
      startDelay: 0.05,
      gain: 0.85,
      schedule: (ac, i, t) => {
        for (const e of DP.music.songEvents('happy', i)) playMusicEvent(ac, e, t);
      },
    },
    bat: {
      stepSec: () => 60 / BAT_SONG.bpm / 2,
      steps: () => BAT_SONG.lead.length * 8,
      startDelay: 0.3,
      gain: 1,
      schedule: scheduleBatStep,
    },
    // 曲データは js/music.js(DP.music.MAIN_SONG の曲)。曲を差し替えてもここは変えなくてよい
    main: {
      stepSec: () => DP.music.STEP_SEC,
      steps: () => DP.music.TOTAL_STEPS,
      startDelay: 0.05,
      gain: 0.75,
      schedule: (ac, i, t) => {
        for (const e of DP.music.events(i)) playMusicEvent(ac, e, t);
      },
    },
  };

  // 少し先(0.15 秒)までの音を予約しておく。40ms ごとに呼んで続きを足す
  function pump() {
    const ac = ctx;
    if (!ac || !music.name) return;
    const song = SONGS[music.name];
    const dt = song.stepSec();
    // タブが裏に回ってタイマーが遅れたときは、過ぎてしまった音をまとめて鳴らさず、今の時刻から続ける
    if (music.nextTime < ac.currentTime - 0.05) {
      const behind = Math.ceil((ac.currentTime - music.nextTime) / dt);
      music.nextTime += behind * dt;
      music.step = (music.step + behind) % song.steps();
    }
    while (music.nextTime < ac.currentTime + 0.15) {
      if (onMusicStep) onMusicStep(music.name, music.step, music.nextTime);
      song.schedule(ac, music.step, music.nextTime);
      music.nextTime += dt;
      music.step = (music.step + 1) % song.steps();
    }
  }

  function startMusic(name) {
    const ac = ensure();
    if (!ac || !SONGS[name]) return;
    if (ac.state === 'suspended') ac.resume();
    music.name = name;
    // music.bus(ダッキング用)→ music.out(曲ごとの音量)→ スピーカー
    music.out = ac.createGain();
    music.out.gain.value = SONGS[name].gain;
    music.out.connect(ac.destination);
    music.bus = ac.createGain();
    music.bus.connect(music.out);
    music.active++;
    music.step = 0;
    music.duckUntil = 0;
    music.nextTime = ac.currentTime + SONGS[name].startDelay;
    pump();
    music.timer = setInterval(pump, 40);
  }

  function stopMusic() {
    if (!music.name) return;
    clearInterval(music.timer);
    music.timer = null;
    // 予約済みの音も含めて、BGM 用の出力ごと切り離して即座に消す
    try {
      music.out.disconnect();
    } catch (e) {
      /* 切り離し済み */
    }
    music.bus = null;
    music.out = null;
    music.name = null;
    music.active--;
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
      SOUNDS[name](arg);
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
    // テスト用: 鳴らしている BGM の数 / AudioContext の状態 / BGM の 1 ステップごとの通知
    activeMusicCount: () => music.active,
    contextState: () => (ctx ? ctx.state : 'none'),
    _setOnMusicStep: (fn) => { onMusicStep = fn; },
    _seekMusic: (step) => { music.step = step; }, // テスト用: 流れている BGM の次に予約するステップを変える
    _setOnPlay: (fn) => { onPlay = fn; },
  };
})();
