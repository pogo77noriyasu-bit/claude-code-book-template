// 効果音と BGM(Web Audio で合成した 8 ビット風の電子音。音源ファイルは再生しない)
// BGM は、ユーザーのバンド TOM AND BOOT BOYS の「GO GO TABB!」のライブ音源を解析して、
// テンポ・キー・リフ・コード進行を参考に、1980 年代のアーケードゲーム風にアレンジしたもの(解析結果は SPEC.md)。
// 原曲の MP3 はゲームでは読み込まない(Git・公開の対象からも外している)。
NP.audio = (function () {
  let ctx = null;
  let enabled = true;
  const log = []; // 鳴らした効果音の履歴(テスト用)
  try {
    enabled = localStorage.getItem(NP.config.SOUND_KEY) !== 'off';
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
    if (ctx.state === 'suspended')
      ctx.resume().then(() => {
        setMusic(musicWanted);
        setVehicle(vehicleWanted);
        setJingle(jingleWanted);
      });
  }

  // 1 音: 波形・開始/終了の周波数・長さ(秒)・音量・開始の遅れ(秒)
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

  // 乱入キャラクターの効果音の出力先(音量 = config.intruder.sound.seVolume)
  let seGain = null;
  function se() {
    if (!seGain) {
      seGain = ctx.createGain();
      seGain.connect(ctx.destination);
    }
    seGain.gain.value = NP.config.intruder.sound.seVolume;
    return seGain;
  }

  // 雑音(ドラム・衝突)。filter: 'lowpass' | 'highpass' | 'bandpass'
  let noiseBuf = null;
  function noise(t, dur, vol, filter, freq, out, freqTo) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
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

  let badgeFlip = false; // 缶バッジの音は 2 つの高さを交互に
  const SOUNDS = {
    // 缶バッジ「ピッ」
    badge: () => {
      badgeFlip = !badgeFlip;
      tone('square', badgeFlip ? 1320 : 1180, badgeFlip ? 1400 : 1250, 0.045, 0.045);
    },
    // 服を取った「ピロリロ・キラーン」(長調の駆け上がり + 高い光の音)
    clothes: () => {
      [659, 831, 988, 1319].forEach((f, i) => tone('square', f, f, 0.07, 0.08, i * 0.05));
      tone('triangle', 2637, 2637, 0.25, 0.08, 0.22);
    },
    // ビールでパワーアップ「ゴクッ・ギュイーン」
    power: () => {
      tone('sine', 300, 120, 0.1, 0.25);
      tone('square', 220, 1760, 0.35, 0.07, 0.1);
      [440, 554, 659, 880].forEach((f, i) => tone('square', f, f, 0.06, 0.06, 0.45 + i * 0.04));
    },
    // 敵を倒した「ボカッ・チーン」
    defeat: () => {
      const t = ctx.currentTime;
      noise(t, 0.12, 0.3, 'lowpass', 1800);
      tone('square', 900, 200, 0.18, 0.09);
      tone('triangle', 1568, 1568, 0.25, 0.1, 0.12);
      tone('triangle', 2093, 2093, 0.3, 0.08, 0.2);
    },
    // ミス: 半音ずつ下がってしょんぼり
    miss: () => {
      [784, 740, 698, 659, 622, 587].forEach((f, i) => tone('square', f, f * 0.97, 0.11, 0.08, i * 0.1));
      tone('triangle', 220, 55, 0.5, 0.15, 0.62);
    },
    // ステージクリアのファンファーレ(E のパワーコードで締める)
    clear: () => {
      [659, 784, 988, 1319, 988, 1319, 1661].forEach((f, i) => tone('square', f, f, i === 6 ? 0.5 : 0.12, 0.08, i * 0.12));
      [82, 123, 165].forEach((f) => tone('square', f, f, 0.9, 0.06, 0.72));
    },
    // ---- 乱入キャラクター(追加修正②・⑦)。音量は config.intruder.sound.seVolume の倍率(se() の出力先を通す) ----
    // 登場: パトカー「ウーウー」(サイレン 2 往復)
    siren: () => {
      for (let i = 0; i < 2; i++) {
        tone('square', 660, 880, 0.3, 0.045, i * 0.6, se());
        tone('square', 880, 660, 0.3, 0.045, i * 0.6 + 0.3, se());
      }
    },
    // 登場: ジープ「ブィーン」(高めの軽いエンジンが吹け上がる)
    enterJeep: () => {
      for (let i = 0; i < 8; i++) tone('square', 150 + i * 12, 130 + i * 12, 0.05, 0.05, i * 0.06, se());
    },
    // 登場: 軽武装戦車「ゴロゴロ・ガチャガチャ」(低いうなりとキャタピラの金属音)
    enterLight: () => {
      tone('triangle', 70, 55, 0.7, 0.18, 0, se());
      for (let i = 0; i < 6; i++) noise(ctx.currentTime + i * 0.11, 0.04, 0.08, 'highpass', 3000, se());
    },
    // 登場: 重戦車「ズォォォン」(とても低く重いエンジンと地響き)
    enterHeavy: () => {
      tone('sawtooth', 48, 36, 1.0, 0.12, 0, se());
      tone('sine', 60, 30, 0.9, 0.3, 0, se());
      noise(ctx.currentTime, 0.9, 0.12, 'lowpass', 300, se(), 80);
    },
    // 攻撃準備(予備動作のあいだくり返す): ジープは高く短い「ピッ」、軽戦車は中くらいの「ピピッ」、重戦車は低く長い「ブーッ」
    chargeJeep: () => tone('square', 1760, 1760, 0.04, 0.05, 0, se()),
    chargeLight: () => {
      tone('square', 1175, 1175, 0.05, 0.05, 0, se());
      tone('square', 1175, 1175, 0.05, 0.05, 0.08, se());
    },
    chargeHeavy: () => tone('square', 523, 494, 0.14, 0.07, 0, se()),
    // 発射: ジープの機関銃「タッ」(1 発ごと。3 発で「タタタッ」)
    gun: () => {
      noise(ctx.currentTime, 0.05, 0.18, 'highpass', 2000, se());
      tone('square', 300, 120, 0.04, 0.05, 0, se());
    },
    // 発射: 軽武装戦車の砲撃「ポンッ」(軽め)
    cannonLight: () => {
      tone('sine', 220, 70, 0.18, 0.25, 0, se());
      noise(ctx.currentTime, 0.14, 0.2, 'lowpass', 1800, se(), 300);
    },
    // 発射: 重戦車の砲撃「ドゴォン」(低く長い・2 段)
    cannonHeavy: () => {
      const t = ctx.currentTime;
      tone('sine', 120, 28, 0.5, 0.4, 0, se());
      tone('square', 90, 30, 0.35, 0.08, 0, se());
      noise(t, 0.45, 0.35, 'lowpass', 1500, se(), 90);
      noise(t + 0.08, 0.3, 0.15, 'lowpass', 600, se(), 60);
    },
    // 着弾: 軽武装戦車の小さな爆発「ボフッ」
    blastSmall: () => {
      noise(ctx.currentTime, 0.3, 0.25, 'lowpass', 1600, se(), 150);
      tone('sine', 110, 45, 0.25, 0.2, 0, se());
    },
    // 着弾: 重戦車の大きな爆発「ドドーン」
    blastBig: () => {
      const t = ctx.currentTime;
      noise(t, 0.8, 0.4, 'lowpass', 2400, se(), 80);
      tone('sine', 80, 25, 0.7, 0.4, 0, se());
      noise(t + 0.15, 0.5, 0.2, 'lowpass', 900, se(), 60);
    },
    // 撃破の爆発(パトカー・ジープ)「ドカーン」
    explode: () => {
      const t = ctx.currentTime;
      noise(t, 0.7, 0.4, 'lowpass', 3000, null, 150);
      tone('square', 400, 40, 0.5, 0.1);
      tone('sine', 120, 30, 0.6, 0.35);
      noise(t + 0.15, 0.4, 0.15, 'bandpass', 900, null, 300); // 破片が散る音
    },
    // 撃破の爆発(戦車)「ズドドーン」: 2 段の爆発と長い余韻でより派手に
    explodeBig: () => {
      const t = ctx.currentTime;
      noise(t, 1.2, 0.5, 'lowpass', 3500, null, 90);
      tone('sine', 100, 25, 1.0, 0.45);
      tone('square', 300, 30, 0.8, 0.1);
      noise(t + 0.25, 0.9, 0.4, 'lowpass', 2500, null, 80);
      tone('sine', 80, 22, 0.9, 0.35, 0.25);
      noise(t + 0.3, 0.6, 0.15, 'bandpass', 700, null, 200);
    },
    // 1UP(追加修正⑨): 明るい長調の駆け上がりを 2 回 +「ピロリン」の締め(パンクスシリーズの 1UP の音と同じ系統)
    oneUp: () => {
      [1047, 1319, 1568, 2093].forEach((f, i) => tone('square', f, f, 0.06, 0.08, i * 0.05));
      [1319, 1568, 2093, 2637].forEach((f, i) => tone('square', f, f, 0.07, 0.08, 0.24 + i * 0.05));
      tone('triangle', 3136, 3136, 0.25, 0.08, 0.48);
    },
    // ゲームオーバー
    over: () => [494, 466, 440, 330].forEach((f, i) => tone('triangle', f, f * 0.97, i === 3 ? 0.7 : 0.25, 0.16, i * 0.28)),
    // 開始「ジャジャッ」
    start: () => {
      [0, 0.16].forEach((d) => [82, 123, 165, 247].forEach((f) => tone('square', f, f, 0.12, 0.04, d)));
    },
  };

  // ---- BGM「GO GO TABB!」のチップチューン・アレンジ ----
  // 解析結果(SPEC.md): テンポ約 185(8 分音符で刻む速いパンク)、キーは E。
  //   メインのリフは「E を 8 分で刻んで小節の終わりに D へ下がる」。A(C# を含む)の部分、
  //   A のベースの上で F#m を鳴らす部分、C → C# → D → D# と半音ずつ上がる部分がある。
  // 1 小節 = 8 分音符 8 つ、16 小節(約 21 秒)でループする。数字は MIDI 番号、null は休み、-1 は前の音をのばす。
  const RIFF_E = [40, 40, 40, 40, 40, 40, 38, 38]; // E を刻んで D へ
  const RIFF_E2 = [40, 40, 40, 40, 40, 40, 38, 43]; // 最後に G で次へつなぐ
  const RIFF_A = [45, 45, 45, 45, 49, 49, 45, 45]; // A と C#
  const RIFF_A2 = [45, 45, 45, 45, 40, 40, 38, 38];
  const PEDAL_A = [45, 45, 45, 45, 45, 45, 45, 45]; // A のベースで F#m
  const RISE_A = [45, 45, 45, 45, 47, 47, 49, 49];
  const LEAD_E1 = [76, -1, -1, 74, 76, -1, 71, -1];
  const LEAD_E2 = [74, -1, 71, -1, 69, -1, 71, -1];
  const LEAD_E4 = [79, -1, 78, -1, 76, -1, 74, -1];
  const CHANT = [78, null, 78, null, 81, 83, -1, null]; // 「GO! GO! TAB-B!」の掛け声の節回しを音にしたもの
  const BGM = {
    bpm: 184,
    stepsPerBar: 8,
    // 小節ごとに { bass, chord(パワーコードの根音。省略するとベースの音), lead, crash(小節の頭でシンバル), fill(後半にドラムのフィル) }
    bars: [
      { bass: RIFF_E, lead: LEAD_E1, crash: true },
      { bass: RIFF_E, lead: LEAD_E2 },
      { bass: RIFF_E, lead: LEAD_E1 },
      { bass: RIFF_E2, lead: LEAD_E4 },
      { bass: RIFF_A, lead: [81, -1, 80, 81, -1, 76, 73, -1], crash: true },
      { bass: RIFF_A2, lead: [76, -1, -1, -1, 74, -1, 71, -1] },
      { bass: RIFF_E, lead: LEAD_E1 },
      { bass: RIFF_E2, lead: LEAD_E4, fill: true },
      { bass: PEDAL_A, chord: 42, lead: CHANT, crash: true },
      { bass: PEDAL_A, chord: 42, lead: [78, null, 78, null, 81, 76, -1, null] },
      { bass: PEDAL_A, chord: 42, lead: CHANT },
      { bass: RISE_A, chord: 42, lead: [85, -1, 83, -1, 81, -1, 80, -1] },
      { bass: [48, 48, 48, 48, 49, 49, 49, 49], lead: [84, -1, -1, -1, 85, -1, -1, -1], crash: true }, // 半音ずつ上がる
      { bass: [50, 50, 50, 50, 51, 51, 51, 51], lead: [86, -1, -1, -1, 87, -1, -1, -1] },
      { bass: RIFF_E, lead: LEAD_E1, crash: true },
      { bass: RIFF_E2, lead: [88, -1, -1, -1, null, null, null, null], fill: true },
    ],
  };
  BGM.steps = BGM.bars.length * BGM.stepsPerBar;
  const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);
  let music = null; // 再生中の BGM { gain, step, next, timer }
  let musicWanted = false;
  let pulse = null; // デューティ比 25% の矩形波(ファミコン風のリード)

  function pulseWave() {
    if (pulse) return pulse;
    const n = 32;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    pulse = ctx.createPeriodicWave(re, im);
    return pulse;
  }

  // 予約して鳴らす 1 音(BGM 用)
  function mtone(out, type, f, t, dur, vol, f1) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (type === 'pulse') o.setPeriodicWave(pulseWave());
    else o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // 8 分音符 1 つ分を予約する
  function scheduleStep(out, step, t) {
    const sd = 60 / BGM.bpm / 2;
    const bar = BGM.bars[Math.floor(step / BGM.stepsPerBar)];
    const s = step % BGM.stepsPerBar;
    const b = bar.bass[s];
    // ベース: 8 分で刻む(矩形波 + 1 オクターブ下の三角波)
    mtone(out, 'square', midiHz(b), t, sd * 0.85, 0.07);
    mtone(out, 'triangle', midiHz(b - 12), t, sd * 0.95, 0.16);
    // ギターの代わりのパワーコード(根音 + 5 度 + オクターブ)を短く刻む
    const root = (bar.chord || b) + 12;
    for (const iv of [0, 7, 12]) mtone(out, 'square', midiHz(root + iv), t, sd * 0.6, 0.018);
    // リード(-1 の間はのばす)
    const m = bar.lead[s];
    if (m !== null && m !== -1) {
      let len = 1;
      for (let k = s + 1; k < BGM.stepsPerBar && bar.lead[k] === -1; k++) len++;
      mtone(out, 'pulse', midiHz(m), t, sd * len * 0.95, 0.05);
    }
    // ドラム: キックとスネアを 8 分で交互に打つ速いパンクのビート
    if (s % 2 === 0) mtone(out, 'sine', 160, t, 0.1, 0.32, 50);
    else noise(t, 0.09, 0.2, 'bandpass', 1900, out);
    noise(t, 0.02, 0.04, 'highpass', 8000, out); // ハイハット
    if (s === 0 && bar.crash) noise(t, 0.6, 0.09, 'highpass', 5000, out);
    // フィル: 小節の後半はスネアを 16 分で連打
    if (bar.fill && s >= 4) noise(t + sd / 2, 0.07, 0.18, 'bandpass', 1500 + (s - 4) * 200, out);
  }

  function startMusic() {
    if (music || !ctx || ctx.state !== 'running') return;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    gain.connect(ctx.destination);
    music = { gain, step: 0, next: ctx.currentTime + 0.05, timer: null };
    const sd = 60 / BGM.bpm / 2;
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

  // ---- ブレイク演出の専用 BGM(最終演出②) ----
  // ドタバタの追いかけっこ風の短いループ(オリジナル。テンポ 200・8 分音符 16 個 = 2 小節 ≒ 2.4 秒)。
  // 半音でにじり寄るメロディ(E → D# → E → G …)と、E・B / D・A を行き来するベース、ドタドタのドラム
  const JINGLE = {
    bpm: 200,
    melody: [76, 75, 76, 79, null, 76, 72, null, 74, 73, 74, 77, null, 74, 71, null],
    bass: [40, 47, 40, 47, 40, 47, 40, 47, 38, 45, 38, 45, 38, 45, 43, 44],
  };
  let jingle = null;
  let jingleWanted = false;

  function startJingle() {
    if (jingle || !ctx || ctx.state !== 'running') return;
    const gain = ctx.createGain();
    gain.gain.value = 0.45;
    gain.connect(ctx.destination);
    jingle = { gain, step: 0, next: ctx.currentTime + 0.05, timer: null };
    const sd = 60 / JINGLE.bpm / 2;
    const pump = () => {
      if (!jingle) return;
      if (jingle.next < ctx.currentTime - 0.1) jingle.next = ctx.currentTime + 0.02;
      while (jingle.next < ctx.currentTime + 0.15) {
        const s = jingle.step;
        const t = jingle.next;
        const m = JINGLE.melody[s];
        if (m !== null) mtone(gain, 'pulse', midiHz(m), t, sd * 0.9, 0.06);
        mtone(gain, 'square', midiHz(JINGLE.bass[s]), t, sd * 0.7, 0.06);
        mtone(gain, 'triangle', midiHz(JINGLE.bass[s] - 12), t, sd * 0.9, 0.14);
        if (s % 4 === 0) mtone(gain, 'sine', 150, t, 0.1, 0.3, 50); // キック
        if (s % 4 === 2) noise(t, 0.08, 0.18, 'bandpass', 2000, gain); // スネア
        noise(t, 0.02, 0.04, 'highpass', 8000, gain); // ハイハット
        jingle.step = (s + 1) % JINGLE.melody.length;
        jingle.next += sd;
      }
    };
    pump();
    jingle.timer = setInterval(pump, 30);
  }

  function stopJingle() {
    if (!jingle) return;
    clearInterval(jingle.timer);
    const g = jingle.gain;
    try {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => g.disconnect(), 120);
    } catch (e) {
      g.disconnect();
    }
    jingle = null;
  }

  // ブレイク演出の BGM を流すか(game.js が毎ステップ呼ぶ)。音 OFF の間は流さない
  function setJingle(on) {
    jingleWanted = !!on;
    if (jingleWanted && enabled) startJingle();
    else stopJingle();
  }

  // ---- 乱入キャラクターの巡回音(追加修正⑦) ----
  // 車両がいるあいだ、車両ごとの短い音の型をくり返す。step: 型の 1 ステップの秒数、steps: 型のステップ数
  //   パトカー: 2 つの高さを行き来するサイレン「ウーウー」
  //   ジープ: 高めの軽いエンジン「ブロロロ」(細かく速い矩形波)
  //   軽武装戦車: 低いうなり + キャタピラの「ガチャガチャ」(高い雑音を短く)
  //   重戦車: とても低いのこぎり波のエンジン + 地響きの「ドッ」
  const LOOPS = {
    patrol: { step: 0.4, steps: 2, play: (out, t, i) => mtone(out, 'square', i ? 660 : 880, t, 0.38, 1, i ? 880 : 660) },
    jeep: { step: 0.07, steps: 4, play: (out, t, i) => mtone(out, 'square', [150, 140, 160, 145][i], t, 0.05, 1) },
    lightTank: {
      step: 0.12,
      steps: 4,
      play: (out, t, i) => {
        mtone(out, 'triangle', i % 2 ? 58 : 62, t, 0.11, 1.4);
        if (i % 2 === 0) noise(t, 0.03, 0.5, 'highpass', 3200, out);
      },
    },
    heavyTank: {
      step: 0.1,
      steps: 6,
      play: (out, t, i) => {
        mtone(out, 'sawtooth', i % 2 ? 40 : 44, t, 0.1, 1);
        if (i === 0) mtone(out, 'sine', 70, t, 0.25, 2.5, 30);
      },
    },
  };
  let vehicle = null; // 鳴らしている巡回音 { type, gain, i, next, timer }
  let vehicleWanted = null;

  function startVehicle(type) {
    if (!ctx || ctx.state !== 'running' || !LOOPS[type]) return;
    const L = LOOPS[type];
    const gain = ctx.createGain();
    gain.gain.value = NP.config.intruder.sound.loopVolume[type];
    gain.connect(ctx.destination);
    vehicle = { type, gain, i: 0, next: ctx.currentTime + 0.05, timer: null };
    const pump = () => {
      if (!vehicle) return;
      if (vehicle.next < ctx.currentTime - 0.1) vehicle.next = ctx.currentTime + 0.02;
      while (vehicle.next < ctx.currentTime + 0.15) {
        L.play(vehicle.gain, vehicle.next, vehicle.i);
        vehicle.i = (vehicle.i + 1) % L.steps;
        vehicle.next += L.step;
      }
    };
    pump();
    vehicle.timer = setInterval(pump, 30);
  }

  function stopVehicle() {
    if (!vehicle) return;
    clearInterval(vehicle.timer);
    const g = vehicle.gain;
    try {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => g.disconnect(), 120);
    } catch (e) {
      g.disconnect();
    }
    vehicle = null;
  }

  // 巡回音を鳴らす車両の種類(null で止める)。game.js が毎ステップ呼ぶ。音 OFF の間は鳴らさない
  function setVehicle(type) {
    vehicleWanted = type || null;
    if (vehicle && vehicle.type !== vehicleWanted) stopVehicle();
    if (vehicleWanted && enabled && !vehicle) startVehicle(vehicleWanted);
    if (!enabled) stopVehicle();
  }

  function play(name) {
    if (!enabled) return;
    log.push(name);
    if (log.length > 300) log.shift();
    if (!ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
    SOUNDS[name]();
  }

  function toggle() {
    enabled = !enabled;
    setMusic(musicWanted);
    setVehicle(vehicleWanted);
    setJingle(jingleWanted);
    try {
      localStorage.setItem(NP.config.SOUND_KEY, enabled ? 'on' : 'off');
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
    setVehicle,
    setJingle,
    jingleWanted: () => jingleWanted,
    jinglePlaying: () => !!jingle,
    JINGLE,
    vehicleWanted: () => vehicleWanted,
    vehiclePlaying: () => (vehicle ? vehicle.type : null),
    LOOPS,
    log,
    BGM,
    SOUNDS,
  };
})();
