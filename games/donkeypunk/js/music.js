// 通常プレイの BGM(全ステージ共通)の曲データと、曲データから「鳴らす音」を作る処理
//
// ファミコンと同じく 4 つのチャンネルで鳴らす:
//   pulse1  矩形波(デューティ比 50%)… メロディー
//   pulse2  矩形波(デューティ比 25%)… ギター(パワーコードを 16 分の分散和音で刻む / 8 分で短く刻む)
//   tri     三角波 … ベース(8 分刻み)と、キック(音程を一瞬で下げる)。同時に 1 音だけ
//   noise   雑音 … スネア・ハイハット・クラッシュ
//
// このファイルは音を鳴らさない。DP.music.events(step) が「その 16 分音符で鳴らす音」の一覧を返し、
// audio.js がそれを Web Audio で鳴らす(テストからも同じ一覧を調べられる)。
//
// ■ 曲の差し替え方
//   SONGS に同じ形の曲データを足し、MAIN_SONG をその名前に変えるだけ。前の曲も SONGS に残しているので、
//   MAIN_SONG を戻せば元の曲に戻る。
//   曲データ: { title, bpm, key(スケールの音名。テスト用), chords(コード名 → ギターとベースの音), bars: [...] }
//   1 小節 = 16 分音符 16 個。小節ごとに:
//     chords: [コード, ...]      … 小節を等分して順に使う(['B', 'F#'] なら 2 拍ずつ)
//     lead:   音名の並び。8 個なら 8 分音符、16 個なら 16 分音符 … '.' は休符、'-' は前の音をのばす
//             (小節をまたいではのばさない)
//     leadDuty: メロディーの矩形波のデューティ比(書かなければ曲の leadDuty、それもなければ 0.5)
//     guitar: 'arp'(16 分の分散和音)/ 'chug'(8 分で短く刻む)/ 'stab'(裏拍で短く鳴らす。オイパンクのカッティング風)
//     bass:   'root'(8 分でルート)/ 'oct'(ルートとオクターブ上を交互)/ 'gallop'(タッ・タタ のギャロップ)
//     drums:  DRUMS の型の名前
window.DP = window.DP || {};

DP.music = (function () {
  // 音名 → 周波数(Hz)。A4 = 440 の平均律
  const NAMES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function freq(name) {
    const m = /^([A-G]#?)(\d)$/.exec(name);
    if (!m) return 0;
    const midi = NAMES[m[1]] + (Number(m[2]) + 1) * 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ドラムの型(16 分音符 16 個): k = キック、s = スネア、h = ハイハット、c = クラッシュ(+キック)、. = なし
  const DRUMS = {
    // 8 ビート(キック 1・3 拍、スネア 2・4 拍、ハイハット 8 分)
    beat: 'k.h.s.h.k.h.s.h.',
    beatCrash: 'c.h.s.h.k.h.s.h.',
    // 少し詰めた 8 ビート(盛り上げる前の押し)
    push: 'k.h.s.hkk.h.s.hk',
    // 2 ビート(キックとスネアを 8 分で交互に。パンクの疾走感)
    two: 'k.s.k.s.k.s.k.s.',
    twoCrash: 'c.s.k.s.k.s.k.s.',
    // ループの最後のフィル(後半をスネアの 16 分連打で頭へつなぐ)
    fill: 'k.s.k.s.ssssssss',
    // ↓ oneTwo 用
    // イントロ: クラッシュ → 間をあけたキメ
    hookA: 'c...s...k.k.s...',
    hookB: 'k...s...k.k.s.ss',
    // 16 分のハイハットで前へ転がる 8 ビート
    drive: 'k.hhs.hhk.hhs.hh',
    driveEnd: 'k.hhs.hhk.hhsss.',
    // 頭打ちの 4 つ打ち + 裏のスネア(サビ)
    stomp: 'c.s.k.sks.s.k.sk',
    stomp2: 'k.s.k.sks.s.k.sk',
  };

  const SONGS = {
    // ── 採用候補: 「1,2, Song」のコード進行を使ったオリジナル曲 ──
    // 原曲から使ったのはコード進行だけ(メロディー・リズム・ベースライン・構成は新しく作ったもの)。
    // コード進行は MP3 の音の成分から推定したもの(正確な採譜ではない):
    //   原曲のキーは B。歌の部分は B → F#(2 拍ずつ交互)、盛り上がる部分は E → C#m → E → F#、最後は B で終わる。
    // 前の試作版(proto)と聞き分けられるよう、構成・リズム・音色をすべて変えている:
    //   イントロは細い矩形波(12.5%)の 16 分のピコピコ分散和音、ギターは裏拍のカッティング、ベースはギャロップ、
    //   サビは「ワン・ツー!」と 2 回たたく合いの手、最後は 16 分の下降リフ。
    oneTwo: {
      title: '1,2, Song (8bit arrange)',
      bpm: 150,
      key: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'], // B メジャー
      leadDuty: 0.25,
      chords: {
        B: { arp: ['B3', 'F#4', 'B4', 'F#4'], bass: 'B2', bassHi: 'B3' },
        'F#': { arp: ['F#3', 'C#4', 'F#4', 'C#4'], bass: 'F#2', bassHi: 'F#3' },
        E: { arp: ['E3', 'B3', 'E4', 'B3'], bass: 'E2', bassHi: 'E3' },
        'C#m': { arp: ['C#4', 'G#4', 'C#5', 'G#4'], bass: 'C#3', bassHi: 'C#4' },
      },
      bars: [
        // イントロ(2 小節): 16 分のピコピコ分散和音(B → F#)
        { chords: ['B', 'F#'], guitar: 'stab', bass: 'oct', drums: 'hookA', leadDuty: 0.125,
          lead: ['B5', 'F#5', 'D#5', 'F#5', 'B5', 'F#5', 'D#5', 'F#5', 'A#5', 'F#5', 'C#5', 'F#5', 'A#5', 'F#5', 'C#5', 'F#5'] },
        { chords: ['B', 'F#'], guitar: 'stab', bass: 'oct', drums: 'hookB', leadDuty: 0.125,
          lead: ['B5', 'F#5', 'D#5', 'F#5', 'B5', 'F#5', 'D#5', 'F#5', 'C#6', 'A#5', 'F#5', 'C#5', 'A#4', 'C#5', 'F#5', 'A#5'] },
        // A メロ(4 小節): 裏拍のカッティング + ギャロップのベースに、跳ねるメロディー
        { chords: ['B', 'F#'], guitar: 'stab', bass: 'gallop', drums: 'drive', lead: ['D#5', '.', 'D#5', 'E5', 'F#5', '.', 'C#5', '.'] },
        { chords: ['B', 'F#'], guitar: 'stab', bass: 'gallop', drums: 'drive', lead: ['D#5', '.', 'D#5', 'E5', 'F#5', 'G#5', 'F#5', '.'] },
        { chords: ['B', 'F#'], guitar: 'stab', bass: 'gallop', drums: 'drive', lead: ['D#5', '.', 'D#5', 'E5', 'F#5', '.', 'A#5', '.'] },
        { chords: ['E', 'F#'], guitar: 'chug', bass: 'gallop', drums: 'driveEnd', lead: ['B5', '-', 'G#5', 'E5', 'F#5', '-', '.', '.'] },
        // サビ(4 小節): E → C#m → E → F#。「ワン・ツー!」と 2 回たたいてから答えるメロディー
        { chords: ['E'], guitar: 'arp', bass: 'oct', drums: 'stomp', leadDuty: 0.5, lead: ['B5', '.', 'B5', '.', 'G#5', 'B5', '-', '.'] },
        { chords: ['C#m'], guitar: 'arp', bass: 'oct', drums: 'stomp2', leadDuty: 0.5, lead: ['C#6', '.', 'C#6', '.', 'B5', 'G#5', '-', '.'] },
        { chords: ['E'], guitar: 'arp', bass: 'oct', drums: 'stomp2', leadDuty: 0.5, lead: ['B5', '.', 'B5', '.', 'G#5', 'E5', 'F#5', 'G#5'] },
        { chords: ['F#'], guitar: 'arp', bass: 'oct', drums: 'stomp2', leadDuty: 0.5, lead: ['A#5', '-', '-', '.', 'F#5', '-', 'C#5', '.'] },
        // ブレイク(2 小節): 16 分の下降リフ → 16 分の刻みで駆け上がり、スネアの連打で頭のイントロへ
        { chords: ['B', 'F#'], guitar: 'chug', bass: 'root', drums: 'drive', leadDuty: 0.125,
          lead: ['B5', 'A#5', 'F#5', 'D#5', 'B4', 'D#5', 'F#5', 'B5', 'A#5', 'F#5', 'C#5', 'A#4', 'F#4', 'A#4', 'C#5', 'F#5'] },
        { chords: ['E', 'F#'], guitar: 'chug', bass: 'root', drums: 'fill', leadDuty: 0.125,
          lead: ['G#5', '.', 'G#5', '.', 'E5', '.', 'B4', '.', 'A#4', '.', 'C#5', '.', 'F#5', '.', 'A#5', '.'] },
      ],
    },

    // ── 前の試作版(E のキー。メロディー・コードとも仮のオリジナル)。MAIN_SONG を 'proto' にすると戻る ──
    proto: {
      title: 'prototype (E)',
      bpm: 150,
      key: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'], // E メジャー
      chords: {
        E: { arp: ['E3', 'B3', 'E4', 'B3'], bass: 'E2', bassHi: 'E3' },
        A: { arp: ['A3', 'E4', 'A4', 'E4'], bass: 'A2', bassHi: 'A3' },
        B: { arp: ['B3', 'F#4', 'B4', 'F#4'], bass: 'B2', bassHi: 'B3' },
        'C#m': { arp: ['C#4', 'G#4', 'C#5', 'G#4'], bass: 'C#3', bassHi: 'C#4' },
      },
      bars: [
        { chords: ['E'], guitar: 'arp', bass: 'root', drums: 'beatCrash', lead: ['E5', '-', 'E5', 'B4', 'E5', '-', 'F#5', 'G#5'] },
        { chords: ['E'], guitar: 'arp', bass: 'root', drums: 'beat', lead: ['B5', '-', 'G#5', '-', 'F#5', 'E5', 'F#5', '-'] },
        { chords: ['A'], guitar: 'arp', bass: 'root', drums: 'beat', lead: ['A5', '-', 'G#5', 'F#5', 'E5', '-', 'C#5', 'E5'] },
        { chords: ['B'], guitar: 'arp', bass: 'root', drums: 'push', lead: ['F#5', '-', '-', '.', 'D#5', 'E5', 'F#5', 'B4'] },
        { chords: ['C#m'], guitar: 'chug', bass: 'root', drums: 'beat', lead: ['C#5', '.', 'C#5', '.', 'E5', '.', 'C#5', 'B4'] },
        { chords: ['A'], guitar: 'chug', bass: 'root', drums: 'beat', lead: ['A4', '.', 'A4', '.', 'C#5', '.', 'E5', '.'] },
        { chords: ['E'], guitar: 'chug', bass: 'root', drums: 'beat', lead: ['B4', '.', 'B4', '.', 'E5', '.', 'G#5', '.'] },
        { chords: ['B'], guitar: 'arp', bass: 'oct', drums: 'push', lead: ['F#5', 'F#5', 'F#5', 'F#5', 'A5', '-', 'B5', '-'] },
        { chords: ['E'], guitar: 'arp', bass: 'oct', drums: 'twoCrash', lead: ['B5', '-', 'G#5', 'E5', 'B5', '-', 'G#5', 'E5'] },
        { chords: ['B'], guitar: 'arp', bass: 'oct', drums: 'two', lead: ['F#5', '-', 'D#5', 'B4', 'F#5', '-', 'A5', 'G#5'] },
        { chords: ['C#m'], guitar: 'arp', bass: 'oct', drums: 'two', lead: ['G#5', '-', 'E5', 'C#5', 'G#5', '-', 'B5', 'A5'] },
        { chords: ['A'], guitar: 'arp', bass: 'oct', drums: 'fill', lead: ['A5', '-', 'F#5', '-', 'B5', '-', '.', '.'] },
      ],
    },
  };

  // ── 4 面のクリア演出(主人公とガールが並んでハートが出たあと)に流す幸せな曲(オリジナル) ──
  // C メジャー・132 BPM・8 小節ループ。C → F → G → C / Am → F → G → C の明るい進行に、
  // 跳ねるように上がるメロディー(細めの矩形波 25%)、16 分の分散和音のギター、オクターブのベース、軽い 8 ビート。
  // 通常プレイの BGM(MAIN_SONG)とは別に、audio.js の SONGS.happy が DP.music.songEvents('happy', step) で鳴らす
  SONGS.happy = {
    title: 'Happy Rescue (original)',
    bpm: 132,
    key: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], // C メジャー
    leadDuty: 0.25,
    chords: {
      C: { arp: ['C4', 'G4', 'C5', 'E5'], bass: 'C3', bassHi: 'C4' },
      F: { arp: ['F4', 'A4', 'C5', 'F5'], bass: 'F2', bassHi: 'F3' },
      G: { arp: ['G4', 'B4', 'D5', 'G5'], bass: 'G2', bassHi: 'G3' },
      Am: { arp: ['A4', 'C5', 'E5', 'A5'], bass: 'A2', bassHi: 'A3' },
    },
    bars: [
      { chords: ['C'], guitar: 'arp', bass: 'oct', drums: 'beatCrash', lead: ['E5', 'G5', 'C6', '-', 'B5', 'C6', 'D6', '-'] },
      { chords: ['F'], guitar: 'arp', bass: 'oct', drums: 'beat', lead: ['C6', 'A5', 'F5', 'A5', 'C6', '-', '.', '.'] },
      { chords: ['G'], guitar: 'arp', bass: 'oct', drums: 'beat', lead: ['B5', 'D6', 'G5', 'B5', 'D6', '-', 'C6', 'B5'] },
      { chords: ['C'], guitar: 'arp', bass: 'oct', drums: 'push', lead: ['C6', '-', 'G5', 'E5', 'C5', '-', '.', '.'] },
      { chords: ['Am'], guitar: 'arp', bass: 'oct', drums: 'beatCrash', lead: ['A5', '-', 'C6', 'A5', 'E5', '-', 'A5', 'B5'] },
      { chords: ['F'], guitar: 'arp', bass: 'oct', drums: 'beat', lead: ['C6', '-', 'A5', 'C6', 'F6', '-', 'E6', 'D6'] },
      { chords: ['G'], guitar: 'arp', bass: 'oct', drums: 'beat', lead: ['D6', '-', 'B5', 'G5', 'D6', 'C6', 'B5', 'A5'] },
      { chords: ['C'], guitar: 'arp', bass: 'oct', drums: 'push', lead: ['C6', '-', '-', '-', 'G5', 'E5', 'C6', '.'] },
    ],
  };

  // 通常プレイで流す曲(全ステージ・全周回で共通)
  const MAIN_SONG = 'oneTwo';

  const STEPS_PER_BAR = 16;
  const stepSec = (song) => 60 / song.bpm / 4; // 16 分音符 1 個の長さ(150 BPM で 0.1 秒 = 6 フレーム)
  const totalSteps = (song) => song.bars.length * STEPS_PER_BAR;

  // 曲 song の 16 分音符 step で鳴らす音の一覧(step はループの長さで折り返す)。
  // 1 音 = { ch: 'pulse1' | 'pulse2' | 'tri' | 'noise', kind, freq?, freqEnd?, dur(秒), vol, duty?, vibrato? }
  function songEvents(song, step) {
    const total = totalSteps(song);
    const s = ((step % total) + total) % total;
    const bar = song.bars[Math.floor(s / STEPS_PER_BAR)];
    const pos = s % STEPS_PER_BAR;
    const sec = stepSec(song);
    const chordName = bar.chords[Math.floor((pos * bar.chords.length) / STEPS_PER_BAR)];
    const chord = song.chords[chordName];
    const drums = DRUMS[bar.drums];
    const out = [];

    // メロディー(8 個なら 8 分音符 = 16 分 2 個ごと、16 個なら 16 分音符ごと)。'-' の数だけのばす
    const res = STEPS_PER_BAR / bar.lead.length; // 1 音が 16 分音符いくつ分か
    if (pos % res === 0) {
      const i = pos / res;
      const name = bar.lead[i];
      if (name !== '.' && name !== '-') {
        let hold = 1;
        while (i + hold < bar.lead.length && bar.lead[i + hold] === '-') hold++;
        const steps = res * hold;
        const duty = bar.leadDuty || song.leadDuty || 0.5;
        // 16 分の速いフレーズは短く切ってピコピコさせる。のばす音(8 分 2 つ分以上)には軽いビブラート
        out.push({ ch: 'pulse1', kind: 'lead', freq: freq(name), dur: sec * steps * (res === 1 ? 0.8 : 0.92), vol: duty < 0.2 ? 0.02 : 0.022, duty, vibrato: steps >= 4 });
      }
    }

    // ギター
    if (bar.guitar === 'arp') {
      out.push({ ch: 'pulse2', kind: 'guitar', freq: freq(chord.arp[pos % 4]), dur: sec * 0.9, vol: 0.012, duty: 0.25 });
    } else if (bar.guitar === 'stab') {
      // 裏拍(各拍の 8 分裏)でオクターブ上を短く鳴らす(カッティング風)
      if (pos % 4 === 2) out.push({ ch: 'pulse2', kind: 'guitar', freq: freq(chord.arp[2]), dur: sec * 1.2, vol: 0.014, duty: 0.5 });
    } else if (pos % 2 === 0) {
      // 短く刻む(ブリッジミュート風)。ルートと 5 度を交互に
      out.push({ ch: 'pulse2', kind: 'guitar', freq: freq(chord.arp[(pos / 2) % 2]), dur: sec * 0.6, vol: 0.013, duty: 0.25 });
    }

    // ドラム(キックは三角波で鳴らすので、その 16 分ではベースを休む)
    const d = drums[pos];
    const kick = d === 'k' || d === 'c';
    if (kick) out.push({ ch: 'tri', kind: 'kick', freq: 160, freqEnd: 45, dur: 0.07, vol: 0.09 });
    if (d === 'c') out.push({ ch: 'noise', kind: 'crash', dur: 0.4, vol: 0.022 });
    if (d === 's') out.push({ ch: 'noise', kind: 'snare', dur: 0.08, vol: 0.035 });
    if (d === 'h') out.push({ ch: 'noise', kind: 'hat', dur: 0.025, vol: 0.012 });

    // ベース(三角波。キックのある 16 分では休む)
    if (bassAt(bar, pos) && !kick) {
      const hi = bar.bass === 'oct' && (pos / 2) % 2 === 1;
      // 三角波は 1 音ずつなので、次に三角波を鳴らす(キックかベース)までに鳴り終わるよう長さを決める
      let gap = Math.min(2, STEPS_PER_BAR - pos); // 小節の最後は次の小節の頭までに切る
      for (let k = 1; k <= 2 && pos + k < STEPS_PER_BAR; k++) {
        if ('kc'.includes(drums[pos + k]) || bassAt(bar, pos + k)) { gap = k; break; }
      }
      out.push({ ch: 'tri', kind: 'bass', freq: freq(hi ? chord.bassHi : chord.bass), dur: sec * Math.min(1.7, gap - 0.1), vol: 0.06 });
    }
    return out;
  }

  // その 16 分でベースを鳴らす型か('root' / 'oct' は 8 分ごと、'gallop' は 1 拍の中で タッ・タタ)
  function bassAt(bar, pos) {
    if (bar.bass === 'gallop') return pos % 4 !== 1;
    return pos % 2 === 0;
  }

  const main = () => SONGS[MAIN_SONG];

  return {
    SONGS,
    MAIN_SONG,
    STEPS_PER_BAR,
    // ↓ 通常プレイの曲(MAIN_SONG)について
    get BPM() { return main().bpm; },
    get STEP_SEC() { return stepSec(main()); },
    get TOTAL_STEPS() { return totalSteps(main()); },
    get BARS() { return main().bars.length; },
    get LOOP_SEC() { return totalSteps(main()) * stepSec(main()); },
    events: (step) => songEvents(main(), step),
    // 任意の曲について(テスト・聴き比べ用)
    songEvents: (name, step) => songEvents(SONGS[name], step),
    songInfo: (name) => {
      const s = SONGS[name];
      return { title: s.title, bpm: s.bpm, key: s.key, bars: s.bars.length, steps: totalSteps(s), stepSec: stepSec(s), loopSec: totalSteps(s) * stepSec(s) };
    },
    freq,
  };
})();
