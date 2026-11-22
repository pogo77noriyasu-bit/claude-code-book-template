// PUNKS & SKINS RESCUE: 効果音(Web Audio で合成したオリジナル。音源ファイルは使わない)
window.PSR = window.PSR || {};

PSR.audio = (function () {
  let ac = null;
  let on = true;
  try {
    on = localStorage.getItem('psr.sound') !== 'off';
  } catch (e) {
    /* 保存できない環境では ON のまま */
  }

  // 最初のキー入力で AudioContext を作る(ブラウザの自動再生の制限)
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume();
  }

  // 矩形波などの短い音。freq は開始と終了(音程を滑らせる)
  function tone(type, f0, f1, dur, vol, delay) {
    if (!ac || !on) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    const gn = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const SOUNDS = {
    move: () => tone('square', 660, 660, 0.04, 0.05),
    appear: () => {
      tone('square', 1200, 1200, 0.06, 0.05);
      tone('square', 1200, 1200, 0.06, 0.05, 0.12);
    },
    jump: () => tone('square', 900, 300, 0.25, 0.06),
    catch: () => tone('square', 220, 880, 0.18, 0.12), // ボヨーン
    rescue: () => [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.09, 0.08, i * 0.08)),
    miss: () => {
      tone('square', 400, 60, 0.4, 0.12);
      tone('triangle', 120, 40, 0.3, 0.2);
    },
    stageclear: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('square', f, f, 0.12, 0.08, i * 0.11)), // STAGE CLEAR!
    safe: () => tone('triangle', 520, 260, 0.15, 0.08), // 敵を見逃した(セーフ)
    gameover: () => [392, 330, 262, 196].forEach((f, i) => tone('square', f, f * 0.98, 0.22, 0.09, i * 0.22)),
    start: () => [262, 392, 523].forEach((f, i) => tone('square', f, f, 0.08, 0.07, i * 0.07)),
  };

  function play(name) {
    if (SOUNDS[name]) SOUNDS[name]();
  }

  function toggle() {
    on = !on;
    try {
      localStorage.setItem('psr.sound', on ? 'on' : 'off');
    } catch (e) {
      /* 無視 */
    }
    return on;
  }

  // BGM(js/bgm.js)も同じ AudioContext と ON / OFF を使う
  return { unlock, play, toggle, isOn: () => on, context: () => ac };
})();
