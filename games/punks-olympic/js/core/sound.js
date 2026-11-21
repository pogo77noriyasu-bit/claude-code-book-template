// 効果音(Web Audio で合成したオリジナルの 8 ビット風。音源ファイル・既存の曲は使わない。既存ゲームと同じ方針)
PO.sound = (function () {
  let ctx = null;
  let enabled = true;
  const log = []; // 鳴らした効果音の履歴(テスト用)
  try {
    enabled = localStorage.getItem(PO.config.SOUND_KEY) !== 'off';
  } catch (e) {
    /* 保存できない環境では ON のまま */
  }

  // 音量の倍率(config.js の PO.SOUND_VOLUME。1.0 = 標準)
  const vol = (k) => {
    const V = PO.SOUND_VOLUME || {};
    return V[k] == null ? 1 : V[k];
  };

  // 最初のキー入力・タッチで AudioContext を作る(ブラウザの自動再生の制限。スマホでもタッチで解除される)
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      ctx.onstatechange = () => syncCrowd();
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      const p = ctx.resume();
      if (p && p.then) p.then(() => syncCrowd()).catch(() => {});
    }
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

  // 白色雑音のバッファ(AudioContext ごとに 1 つ作って使い回す)
  const noiseBufs = new WeakMap();
  function noiseBuffer(ac, sec) {
    const key = noiseBufs.get(ac) || {};
    if (!key[sec]) {
      const b = ac.createBuffer(1, Math.round(ac.sampleRate * sec), ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      key[sec] = b;
      noiseBufs.set(ac, key);
    }
    return key[sec];
  }

  // 雑音(号砲・足音)。ac / dest を渡すと別の AudioContext(テストの音量測定用)に鳴らす
  function noise(dur, vol, filter, freq, freqTo, delay, ac, dest) {
    ac = ac || ctx;
    const t = ac.currentTime + (delay || 0);
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.6);
    const f = ac.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || ac.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ピストル「バン!」: 鋭い破裂(高い雑音)+ 響き(低くなっていく雑音)+ 胴鳴り(下がるサイン波)
  function pistol(ac, dest) {
    ac = ac || ctx;
    dest = dest || ac.destination;
    const v = vol('pistol');
    noise(0.07, 0.55 * v, 'highpass', 1200, null, 0, ac, dest);
    noise(0.45, 0.45 * v, 'lowpass', 5000, 250, 0, ac, dest);
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    g.gain.setValueAtTime(0.5 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.22);
  }

  // ---- 観客の歓声「わーーーー!!」(雑音を「あ」の母音の 2 つの帯域に通し、ゆっくり波打たせる) ----
  // 状態: off(なし)/ on(競技中)/ up(1 位のゴール後、一段大きく)/ fade(全員ゴール後、だんだん小さく)
  // 標準の音量。足音(1 回の RMS 約 0.0077)が埋もれないよう、1 位のゴール後の大きい歓声でも足音より小さく(RMS 約 0.0055)、
  // 帯域も足音(1.8kHz)より低く寄せる。全体の大きさは SOUND_VOLUME.crowd で調整する
  const CROWD_BASE = 0.01;
  const CROWD_UP = 1.7; // 1 位のゴール後の倍率
  const CROWD_ATTACK = 0.35; // 立ち上がり(秒)
  const CROWD_FADE = 3.0; // 全員ゴール後のフェードアウト(秒)
  let crowdState = 'off';
  let crowdFadeSec = CROWD_FADE; // いまのフェードアウトの長さ(秒。crowd('fade', 秒) で変えられる)
  let crowdNodes = null;
  let fadingNodes = []; // フェードアウト中の歓声(リトライ・画面遷移ですぐ止められるように持っておく)
  function crowdLevel(state) {
    return state === 'up' ? CROWD_BASE * CROWD_UP * vol('crowd') : CROWD_BASE * vol('crowd');
  }
  // 歓声の音のつながりを作る。out(GainNode)の gain を上げ下げして鳴らす
  function buildCrowd(ac, dest) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 2.0);
    src.loop = true;
    const out = ac.createGain();
    out.gain.value = 0;
    const swell = ac.createGain(); // 波打ち(0.75〜1.25 倍)
    swell.gain.value = 1;
    const lfos = [];
    [
      [0.23, 0.15],
      [0.61, 0.1],
    ].forEach(([hz, depth]) => {
      const o = ac.createOscillator();
      const d = ac.createGain();
      o.frequency.value = hz;
      d.gain.value = depth;
      o.connect(d).connect(swell.gain);
      o.start();
      lfos.push(o);
    });
    // 「あ」の母音に近い 2 つの帯域(700Hz・1150Hz)と、こもった低い声(350Hz)
    [
      [700, 1.4, 1.0],
      [1150, 1.8, 0.7],
      [350, 1.0, 0.6],
    ].forEach(([f, q, g]) => {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const gg = ac.createGain();
      gg.gain.value = g;
      src.connect(bp).connect(gg).connect(swell);
    });
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    swell.connect(lp).connect(out).connect(dest || ac.destination);
    src.start();
    return {
      out,
      stop(at) {
        [src, ...lfos].forEach((n) => {
          try {
            n.stop(at);
          } catch (e) {
            /* 止まっている */
          }
        });
      },
    };
  }
  function killCrowd() {
    (crowdNodes ? [crowdNodes] : []).concat(fadingNodes).forEach((n) => {
      n.stop(0);
      n.out.disconnect();
    });
    crowdNodes = null;
    fadingNodes = [];
  }
  // 状態に合わせて実際の音を合わせる(音を出せないときは何もしない。出せるようになったら追いつく)
  function syncCrowd(changed) {
    if (!enabled || !ctx || ctx.state !== 'running') {
      if (!enabled) killCrowd();
      return;
    }
    const t = ctx.currentTime;
    if (crowdState === 'off') return killCrowd();
    if (crowdState === 'fade') {
      if (!crowdNodes) return;
      if (changed) {
        const g = crowdNodes.out.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(Math.max(0.0001, g.value), t);
        g.exponentialRampToValueAtTime(0.0001, t + crowdFadeSec);
        const n = crowdNodes;
        n.stop(t + crowdFadeSec + 0.05);
        fadingNodes.push(n);
        setTimeout(() => (fadingNodes = fadingNodes.filter((x) => x !== n)), (crowdFadeSec + 0.3) * 1000);
        crowdNodes = null; // 止まるまで鳴らし切る(次の歓声とは別のつながり)
      }
      return;
    }
    if (!crowdNodes) {
      crowdNodes = buildCrowd(ctx);
      changed = true;
    }
    if (changed) {
      const g = crowdNodes.out.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(crowdLevel(crowdState), t + (crowdState === 'up' ? 0.15 : CROWD_ATTACK));
    }
  }
  // 歓声の操作: 'start'(競技開始)/ 'up'(1 位のゴール)/ 'fade'(全員ゴール)/ 'stop'(すぐ止める: リトライ・画面遷移)
  // fadeSec: 'fade' のときのフェードアウトの長さ(秒。省略時は CROWD_FADE = 3 秒。表彰式の終わりは短く)
  function crowd(cmd, fadeSec) {
    if (cmd === 'fade') crowdFadeSec = fadeSec || CROWD_FADE;
    const next = { start: 'on', up: 'up', fade: 'fade', stop: 'off' }[cmd];
    if (cmd === 'up' && crowdState !== 'on') return;
    if (cmd === 'fade' && (crowdState === 'off' || crowdState === 'fade')) return;
    if (cmd === 'stop' && crowdState === 'off' && !crowdNodes && !fadingNodes.length) return;
    log.push('crowd:' + cmd);
    if (log.length > 200) log.shift();
    crowdState = next;
    if (cmd === 'stop') killCrowd();
    syncCrowd(true);
  }

  // 画面が裏に回ったら音を止め、戻ったら再開する(スマホでアプリを切り替えたときに鳴り続けない)
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (enabled) ctx.resume().catch(() => {});
  });

  const SOUNDS = {
    // カーソル移動「ピッ」
    select: () => tone('square', 880, 880, 0.04, 0.05),
    // 決定「ピロッ」
    decide: () => [660, 990].forEach((f, i) => tone('square', f, f, 0.06, 0.07, i * 0.05)),
    // 選べない「ブッ」
    deny: () => tone('square', 140, 120, 0.15, 0.08),
    // ON YOUR MARKS / GET SET の合図「ポーン」
    ready: () => tone('square', 523, 523, 0.18, 0.07),
    // GO!! のピストル「バン!」(ピッ・ピッ のあとの 3 回目)
    start: () => pistol(),
    // 1 位の走者のゴールのピストル「バン!」(スタートと同じ音)
    finish: () => pistol(),
    // 走行音(足音)「タッ」。音量は SOUND_VOLUME.step 倍(1.0 = 従来のまま)
    step: () => noise(0.04, 0.12 * vol('step'), 'bandpass', 1800),
    // ジャンプ「ピョン!」(あんパン食い競争)
    jump: () => {
      tone('square', 330, 990, 0.12, 0.07);
      tone('triangle', 660, 1320, 0.1, 0.06, 0.02);
    },
    // あんパンを食べた「パクッ!」
    eat: () => {
      tone('square', 700, 350, 0.05, 0.09);
      noise(0.04, 0.25, 'bandpass', 1400, null, 0.05);
      tone('square', 1050, 1050, 0.05, 0.07, 0.07);
    },
    // 食べ損ねた「ボヨン!」(あんパンが顔に当たって揺れる)
    miss: () => {
      tone('triangle', 330, 110, 0.32, 0.2);
      tone('sine', 220, 70, 0.36, 0.16, 0.04);
    },
    // 綱を引く「グイッ」(綱がこすれる音と低い力み)
    tugpull: () => {
      noise(0.12, 0.3, 'bandpass', 700, 300);
      tone('sawtooth', 160, 90, 0.12, 0.06);
    },
    // 靴で地面を踏ん張る「ザッ」
    stomp: () => {
      noise(0.07, 0.4, 'lowpass', 900, 200);
      tone('sine', 110, 50, 0.08, 0.15);
    },
    // PERFECT「キラーン」
    perfect: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone('square', f, f, i === 3 ? 0.2 : 0.06, 0.06, i * 0.045)),
    // 綱引きの MISS「ピュ〜ン」(すべる笛のように下がる)
    tugmiss: () => {
      tone('sine', 900, 250, 0.35, 0.12);
      tone('triangle', 450, 125, 0.35, 0.06, 0.02);
    },
    // 玉入れ: 玉を拾う「ポッ」
    pick: () => tone('square', 520, 780, 0.05, 0.07),
    // 玉入れ: 玉を投げる「シュッ」(風を切る音)
    toss: () => noise(0.12, 0.3, 'bandpass', 2400, 900),
    // 玉入れ: プレイヤーの玉がカゴに入った「スポッ・ピン!」
    basket: () => {
      noise(0.05, 0.3, 'lowpass', 1200, 400);
      tone('square', 1319, 1319, 0.05, 0.06, 0.04);
      tone('square', 1760, 1760, 0.08, 0.05, 0.08);
    },
    // 玉入れ: CPU の玉がカゴに入った(小さく「スッ」)
    basketcpu: () => noise(0.04, 0.12, 'lowpass', 1000, 400),
    // 玉入れ: 操作ミス「ブブッ」
    fumble: () => [0, 0.09].forEach((d) => tone('square', 150, 130, 0.07, 0.08, d)),
    // 玉入れ: 残り 5 秒からのカウントダウン「ピッ」
    count: () => tone('square', 988, 988, 0.1, 0.08),
    // 缶蹴り: 缶を蹴る「カコーン!」(靴が当たる低い音 + 缶の高い響き)
    cankick: () => {
      noise(0.05, 0.45, 'lowpass', 900, 200);
      tone('square', 1480, 1200, 0.12, 0.07, 0.01);
      tone('triangle', 2960, 2400, 0.18, 0.05, 0.01);
    },
    // 缶蹴り: 缶が地面に着いた金属音「カン!」(バウンドは小さく)
    canland: () => {
      tone('square', 2100, 1800, 0.06, 0.07);
      tone('triangle', 3150, 2900, 0.1, 0.05);
      noise(0.03, 0.2, 'highpass', 3000);
    },
    canbounce: () => {
      tone('square', 2300, 2000, 0.04, 0.035);
      noise(0.02, 0.1, 'highpass', 3500);
    },
    // 缶蹴り: 缶が転がる「カランカラン」
    canroll: () => [0, 0.12, 0.22, 0.31, 0.39].forEach((d, i) => tone('triangle', 2500 - i * 120, 2200 - i * 120, 0.05, 0.04 - i * 0.006, d)),
    // リレー: バトン交換 GOOD「パシッ」(PERFECT は perfect、MISS は tugmiss を使う)
    pass: () => {
      noise(0.03, 0.3, 'bandpass', 2000);
      tone('square', 784, 1047, 0.08, 0.07, 0.02);
    },
    // 勝利確定(プレイヤーのチームの勝ち)のファンファーレ
    victory: () =>
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('square', f, f, i === 5 ? 0.4 : 0.1, 0.08, i * 0.1)),
    // 決着(プレイヤーのチームの負け)
    defeat: () => [392, 349, 311, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 0.22, 0.12, i * 0.18)),
    // フライングのブザー
    foul: () => [0, 0.2].forEach((d) => tone('sawtooth', 220, 200, 0.16, 0.08, d)),
    // 時間切れ
    timeup: () => [392, 330, 262].forEach((f, i) => tone('triangle', f, f, 0.22, 0.12, i * 0.2)),
    // 累積スコアのカウントアップ「ピピピ」(1 回は短い電子音)
    tick: () => tone('square', 1568, 1568, 0.025, 0.035),
    // 表彰式: トロフィーが光る「キラキラ」(高い音の速い上がり + きらめく雑音)
    kira: () => {
      [2093, 2637, 3136, 4186].forEach((f, i) => tone('square', f, f * 1.01, 0.07, 0.03, i * 0.04));
      noise(0.18, 0.06, 'highpass', 6000, null, 0.02);
    },
    // 表彰台の登場の華やかなファンファーレ(パッパカパーン + 3 度上のハモり + 締めの和音と打楽器)
    podium: () => {
      const mel = [
        [523, 0, 0.11], [523, 0.13, 0.11], [523, 0.26, 0.11], [784, 0.39, 0.42],
        [698, 0.86, 0.11], [784, 0.99, 0.11], [880, 1.12, 0.11], [1047, 1.25, 0.8],
      ];
      mel.forEach(([f, d, len]) => {
        tone('square', f, f, len, 0.075, d);
        tone('square', f * 1.26, f * 1.26, len, 0.035, d); // ハモり(長 3 度上)
      });
      [262, 330, 392, 523].forEach((f) => tone('triangle', f, f, 0.9, 0.06, 1.25));
      [0.39, 1.25].forEach((d) => noise(0.25, 0.25, 'lowpass', 3000, 400, d)); // シンバルのような打楽器
    },
    // 表彰式のファンファーレ(ROUND CLEAR。パッパカパーン + 和音で締める)。2026-11-19 以降の表彰式では podium を使う
    ceremony: () => {
      const mel = [
        [523, 0, 0.12], [523, 0.14, 0.12], [523, 0.28, 0.12], [698, 0.42, 0.5],
        [659, 0.98, 0.12], [698, 1.12, 0.12], [784, 1.26, 0.12], [1047, 1.4, 0.9],
      ];
      mel.forEach(([f, d, len]) => tone('square', f, f, len, 0.08, d));
      [262, 330, 392].forEach((f) => tone('triangle', f, f, 0.9, 0.06, 1.4)); // 最後の和音
    },
    // 自己ベスト更新のファンファーレ
    record: () =>
      [523, 659, 784, 1047, 0, 784, 1047, 1319].forEach((f, i) => {
        if (f) tone('square', f, f, i === 7 ? 0.45 : 0.1, 0.08, i * 0.1);
      }),
  };

  // ---- BGM(オリジナルの 8 ビット風。音源ファイル・既存の曲は使わない) ----
  // 曲は「何秒目にどの音」の並び(BGMS)で持ち、始めるときに全部を予約して鳴らす。すべての音を 1 つの GainNode(bgmOut)に
  // つないでおき、フェードアウト(bgm('fade', 秒))・すぐ止める(bgm('stop'))はそのノードで行う。
  // 画面が変わるとき(PO.main.go)に必ず止めるので、次の画面に残らない
  const BPM = 150;
  const BEAT = 60 / BPM; // 4 分音符(秒)
  const N = (name) => {
    // 'C5' などの音名 → 周波数
    const m = /^([A-G])(#?)(\d)$/.exec(name);
    const k = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
    return 440 * Math.pow(2, k / 12);
  };
  // 表彰式の BGM(約 10 秒。明るく達成感のある 1980 年代アーケード風): C → F → G → C → F・G → C の 6 小節 + 締めの和音。
  // メロディ(矩形波・8 分音符)、ベース(三角波・4 分音符)、ドラム(1・3 拍目にキック、8 分でハイハット)
  function ceremonyScore() {
    const notes = [];
    const E8 = BEAT / 2;
    const mel = [
      'E5 G5 C6 G5 E5 G5 C6 E6',
      'F5 A5 C6 A5 F5 A5 C6 F6',
      'G5 B5 D6 B5 G5 B5 D6 G6',
      'E6 - D6 C6 G5 - E5 G5',
      'A5 C6 F6 C6 B5 D6 G6 F6',
    ];
    mel.forEach((bar, b) =>
      bar.split(' ').forEach((n, i) => {
        if (n !== '-') notes.push({ t: (b * 8 + i) * E8, f: N(n), len: E8 * 0.9, type: 'square', v: 0.05 });
      })
    );
    // 6 小節目: E6(2 拍)→ C6(2 拍)、最後に C の和音を長く
    notes.push({ t: 40 * E8, f: N('E6'), len: BEAT * 1.9, type: 'square', v: 0.05 });
    notes.push({ t: 44 * E8, f: N('C6'), len: BEAT * 1.9, type: 'square', v: 0.05 });
    ['C5', 'E5', 'G5', 'C6'].forEach((n) => notes.push({ t: 48 * E8, f: N(n), len: BEAT * 3, type: 'square', v: 0.03 }));
    // ベース(小節ごとの根音と 5 度を 4 分音符で)
    const bass = [['C3', 'G3'], ['F3', 'C4'], ['G3', 'D4'], ['C3', 'G3'], ['F3', 'G3'], ['C3', 'G3']];
    bass.forEach((pair, b) => {
      for (let q = 0; q < 4; q++) {
        const name = b === 4 ? (q < 2 ? 'F3' : 'G3') : pair[q % 2];
        notes.push({ t: (b * 4 + q) * BEAT, f: N(name), len: BEAT * 0.85, type: 'triangle', v: 0.09 });
      }
    });
    notes.push({ t: 24 * BEAT, f: N('C3'), len: BEAT * 3, type: 'triangle', v: 0.09 });
    // ドラム
    for (let e = 0; e < 48; e++) {
      notes.push({ t: e * E8, drum: 'hat' });
      if (e % 4 === 0) notes.push({ t: e * E8, drum: 'kick' });
      if (e % 8 === 4) notes.push({ t: e * E8, drum: 'snare' });
    }
    notes.push({ t: 48 * E8, drum: 'crash' });
    return { notes, length: 48 * E8 + BEAT * 3 };
  }
  const BGMS = { ceremony: ceremonyScore };
  let bgmState = 'off'; // off / play / fade
  let bgmName = null;
  let bgmOut = null;
  let bgmSrc = []; // 予約した音(止めるときにまとめて止める)
  function bgmNote(ac, out, t0, n) {
    const t = t0 + n.t;
    if (n.drum) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac, 0.6);
      const f = ac.createBiquadFilter();
      const g = ac.createGain();
      const D = { hat: ['highpass', 7000, 0.035, 0.03], snare: ['bandpass', 1800, 0.12, 0.12], crash: ['highpass', 4000, 0.09, 0.9], kick: ['lowpass', 180, 0.22, 0.12] }[n.drum];
      f.type = D[0];
      f.frequency.value = D[1];
      g.gain.setValueAtTime(D[2], t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + D[3]);
      src.connect(f).connect(g).connect(out);
      src.start(t);
      src.stop(t + D[3] + 0.02);
      bgmSrc.push(src);
      return;
    }
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = n.type;
    o.frequency.setValueAtTime(n.f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(n.v, t + 0.008);
    g.gain.setValueAtTime(n.v, t + n.len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + n.len + 0.02);
    bgmSrc.push(o);
  }
  function killBgm() {
    bgmSrc.forEach((n) => {
      try {
        n.stop(0);
      } catch (e) {
        /* 止まっている */
      }
    });
    bgmSrc = [];
    if (bgmOut) bgmOut.disconnect();
    bgmOut = null;
  }
  // BGM の操作: bgm('start', 'ceremony') / bgm('fade', 秒) / bgm('stop')(すぐ止める。画面遷移)
  function bgm(cmd, arg) {
    if (cmd === 'stop' && bgmState === 'off' && !bgmOut) return;
    log.push('bgm:' + cmd);
    if (log.length > 200) log.shift();
    if (cmd === 'start') {
      killBgm();
      bgmState = 'play';
      bgmName = arg;
      if (!enabled || !ctx || ctx.state !== 'running' || !BGMS[arg]) return; // 音を出せないときは鳴らさない(状態だけ)
      const score = BGMS[arg]();
      bgmOut = ctx.createGain();
      bgmOut.gain.value = vol('bgm');
      bgmOut.connect(ctx.destination);
      const t0 = ctx.currentTime + 0.05;
      score.notes.forEach((n) => bgmNote(ctx, bgmOut, t0, n));
    } else if (cmd === 'fade') {
      if (bgmState === 'off') return;
      bgmState = 'fade';
      if (bgmOut && ctx) {
        const t = ctx.currentTime;
        const g = bgmOut.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(Math.max(0.0001, g.value), t);
        g.exponentialRampToValueAtTime(0.0001, t + (arg || 1.5));
      }
    } else if (cmd === 'stop') {
      bgmState = 'off';
      bgmName = null;
      killBgm();
    }
  }

  function play(name) {
    log.push(name);
    if (log.length > 200) log.shift();
    if (!enabled || !ctx || ctx.state !== 'running') return;
    SOUNDS[name]();
  }

  function setEnabled(on) {
    enabled = on;
    try {
      localStorage.setItem(PO.config.SOUND_KEY, on ? 'on' : 'off');
    } catch (e) {
      /* 保存できなくても続ける */
    }
    document.body.classList.toggle('muted', !on);
    syncCrowd(true); // OFF にしたら歓声も止め、ON に戻したら競技中なら再開する
    if (!on) killBgm(); // OFF にしたら BGM も止める(ON に戻しても途中からは鳴らさない)
  }

  // テスト用: 歓声(競技中の標準・1 位のゴール後)と足音 1 回・ピストルを別々に録音して、音の大きさ(RMS)を比べる
  function measure() {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const sr = 22050;
    const rec = (len, build) => {
      const ac = new OAC(1, Math.round(sr * len), sr);
      build(ac);
      return ac.startRendering().then((buf) => buf.getChannelData(0));
    };
    const rms = (d, a, b) => {
      let s = 0;
      for (let i = a; i < b; i++) s += d[i] * d[i];
      return Math.sqrt(s / (b - a));
    };
    return Promise.all([
      rec(2, (ac) => (buildCrowd(ac).out.gain.value = crowdLevel('up'))),
      rec(0.2, (ac) => noise(0.04, 0.12 * vol('step'), 'bandpass', 1800, null, 0, ac)),
      rec(0.5, (ac) => pistol(ac)),
      rec(2, (ac) => (buildCrowd(ac).out.gain.value = crowdLevel('on'))),
    ]).then(([c, s, p, cb]) => ({
      crowd: rms(c, Math.round(sr * 0.5), c.length),
      crowdBase: rms(cb, Math.round(sr * 0.5), cb.length),
      step: rms(s, 0, Math.round(sr * 0.04)),
      pistol: rms(p, 0, Math.round(sr * 0.1)),
    }));
  }

  return {
    unlock,
    play,
    toggle: () => setEnabled(!enabled),
    setEnabled,
    crowd,
    bgm,
    get bgmState() {
      return bgmState;
    },
    get bgmName() {
      return bgmName;
    },
    get bgmPlaying() {
      return !!bgmOut;
    },
    bgmLength: (name) => (BGMS[name] ? BGMS[name]().length : 0),
    get crowdState() {
      return crowdState;
    },
    get crowdPlaying() {
      return !!crowdNodes;
    },
    get crowdFading() {
      return fadingNodes.length;
    },
    measure,
    // AudioContext の状態(なし = null / suspended / running / interrupted。テスト・実機確認用)
    get audioState() {
      return ctx ? ctx.state : null;
    },
    get enabled() {
      return enabled;
    },
    log,
  };
})();
