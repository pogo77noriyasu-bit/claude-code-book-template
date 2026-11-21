// キャラクターの共通処理(ポーズ→コマの選び方と描画)。全種目で共通に使う
PO.chars = (function () {
  const D = PO.SPRITE_DATA;

  function byId(id) {
    return PO.CHARACTERS.find((c) => c.id === id);
  }
  function hasFrame(id, name) {
    return D.chars[id].frames.indexOf(name) >= 0;
  }

  // ポーズとアニメーションの時間から、使うコマの名前を返す。
  // 支給画像にポーズがないキャラクターは、走りのコマで代用する(独自に描き足さない)
  //   idle: 待機 / marks: スタートの構え / set: 腰を上げた構え / run: 走行(t はコマ数の累計)
  //   win: 勝利ポーズ(t は秒)
  function frameName(id, pose, t) {
    switch (pose) {
      case 'run':
        return 'run' + (Math.floor(t) % 4);
      case 'marks':
        return hasFrame(id, 'set0') ? 'set0' : 'run0';
      case 'set':
        return hasFrame(id, 'set2') ? 'set2' : 'run0';
      case 'win':
        if (hasFrame(id, 'win0')) {
          // 0→1→2→3 と腕を上げ、あとは 2 と 3 をくり返す
          const k = Math.floor(t * 6);
          return 'win' + (k < 4 ? k : 2 + (k % 2));
        }
        return 'run0';
      default:
        return 'run0';
    }
  }

  // 勝利ポーズを持たないキャラクターは、その場で跳ねて喜ぶ(上へのずれ px)
  function winHop(id, t) {
    if (hasFrame(id, 'win0')) return 0;
    return Math.round(Math.abs(Math.sin(t * 7)) * 16);
  }

  // 足元 (x, footY) に合わせて描く。scale は最近傍で拡大縮小(imageSmoothingEnabled = false)
  function draw(ctx, id, frame, x, footY, scale) {
    const s = scale || 1;
    const im = PO.assets.get('char_' + id);
    const i = Math.max(0, D.chars[id].frames.indexOf(frame));
    const { w, h, footY: fy } = D.cell;
    ctx.drawImage(im, i * w, 0, w, h, Math.round(x - (w * s) / 2), Math.round(footY - (fy + 1) * s), Math.round(w * s), Math.round(h * s));
  }

  // 顔(キャラクター選択・リザルト用)を、(x, y, w, h) の枠に縦横比を保って収める
  function drawFace(ctx, id, x, y, w, h) {
    const im = PO.assets.get('face_' + id);
    const s = Math.min(w / im.width, h / im.height);
    const dw = Math.round(im.width * s);
    const dh = Math.round(im.height * s);
    ctx.drawImage(im, Math.round(x + (w - dw) / 2), Math.round(y + h - dh), dw, dh);
  }

  // ---- 走りの連番画像(PO.RUN_STRIPS)があるキャラクターの競技中の走行 ----
  function runStrip(id) {
    return PO.RUN_STRIPS[id] || null;
  }
  // 連番画像の n コマ目を、足元 (x, footY) に合わせて描く。コマの中の位置は画像のまま(浮いたコマは浮いて見える)
  function drawRunStrip(ctx, id, n, x, footY) {
    const R = PO.RUN_STRIPS[id];
    const im = PO.assets.get('runstrip_' + id);
    const s = R.scale;
    const f = ((n % R.frames) + R.frames) % R.frames;
    ctx.drawImage(im, f * R.w, 0, R.w, R.h, Math.round(x - (R.w * s) / 2), Math.round(footY - PO.RUN_STRIP_FOOT_LIFT - R.footRow * s), Math.round(R.w * s), Math.round(R.h * s));
  }

  // 走りの連番画像の n コマ目の手の位置(drawRunStrip で (x, footY) に描いたときの画面の座標)とバトンの角度(ラジアン)。なければ null
  function runHand(id, n, x, footY) {
    const R = PO.RUN_STRIPS[id];
    if (!R || !R.hands) return null;
    const f = ((n % R.frames) + R.frames) % R.frames;
    const [hx, hy, deg] = R.hands[f];
    const s = R.scale;
    return {
      x: Math.round(x - (R.w * s) / 2) + hx * s,
      y: Math.round(footY - PO.RUN_STRIP_FOOT_LIFT - R.footRow * s) + hy * s,
      angle: (deg * Math.PI) / 180,
    };
  }

  // 連番画像と同じ大きさのポーズ画像(start / stop / goal)を持つか
  function hasStripPoses(id) {
    const R = PO.RUN_STRIPS[id];
    return !!(R && R.poses);
  }
  // ポーズ画像を足元 (x, footY) に合わせて描く(走行コマと同じ位置合わせ・同じ倍率)
  function drawStripPose(ctx, id, name, x, footY) {
    const R = PO.RUN_STRIPS[id];
    const P = R.poses;
    const im = PO.assets.get('runposes_' + id);
    const s = R.scale;
    const f = P.index[name];
    ctx.drawImage(im, f * P.w, 0, P.w, P.h, Math.round(x - (P.w * s) / 2), Math.round(footY - PO.RUN_STRIP_FOOT_LIFT - P.footRow * s), Math.round(P.w * s), Math.round(P.h * s));
  }

  // ジャンプのコマ(0 踏み切り・1 空中・2 着地)を足元 (x, footY) に合わせて描く。高さは呼ぶ側で footY をずらす
  function drawJump(ctx, id, f, x, footY) {
    const R = PO.RUN_STRIPS[id];
    const J = R.jump;
    const im = PO.assets.get('runjump_' + id);
    const s = R.scale;
    ctx.drawImage(im, f * J.w, 0, J.w, J.h, Math.round(x - (J.w * s) / 2), Math.round(footY - PO.RUN_STRIP_FOOT_LIFT - J.footRow * s), Math.round(J.w * s), Math.round(J.h * s));
  }

  // 綱引きのコマ(0 構え・1 引く・2 踏ん張り)を足元 (x, footY) に合わせて描く。flip = true で左右反転(右チーム)。
  // 綱引きの画像がないキャラクターは、スタートの構えのポーズで代用する
  function drawPull(ctx, id, f, x, footY, flip) {
    const R = PO.RUN_STRIPS[id];
    const s = R.scale;
    ctx.save();
    ctx.translate(Math.round(x), 0);
    if (flip) ctx.scale(-1, 1);
    if (R.pull) {
      const Pl = R.pull;
      ctx.drawImage(PO.assets.get('runpull_' + id), f * Pl.w, 0, Pl.w, Pl.h, Math.round(-(Pl.w * s) / 2), Math.round(footY - PO.RUN_STRIP_FOOT_LIFT - Pl.footRow * s), Math.round(Pl.w * s), Math.round(Pl.h * s));
    } else drawStripPose(ctx, id, 'start', 0, footY);
    ctx.restore();
  }
  // 綱引きのコマ f の綱の端(足元・左右中央からの画面の px。dx は右向きのとき、dy は上が正)
  function pullRope(id, f) {
    const R = PO.RUN_STRIPS[id];
    const r = R.pull ? R.pull.rope[f] : [22, 30]; // 画像がないときの手のおおよその位置
    return { dx: r[0] * R.scale, dy: r[1] * R.scale };
  }
  // ポーズ画像を左右反転できる版(綱引きの右チームの勝敗ポーズ)
  function drawStripPoseFlip(ctx, id, name, x, footY, flip) {
    ctx.save();
    ctx.translate(Math.round(x), 0);
    if (flip) ctx.scale(-1, 1);
    drawStripPose(ctx, id, name, 0, footY);
    ctx.restore();
  }

  // 玉入れのコマ(0 拾う・1 振りかぶる・2 投げる)を足元 (x, footY) に合わせて描く。flip = true で左右反転(右側の選手)。
  // 玉入れの画像がないキャラクターは、停止時の直立のポーズで代用する
  function drawThrow(ctx, id, f, x, footY, flip) {
    const R = PO.RUN_STRIPS[id];
    const s = R.scale;
    ctx.save();
    ctx.translate(Math.round(x), 0);
    if (flip) ctx.scale(-1, 1);
    if (R.throw) {
      const T = R.throw;
      ctx.drawImage(PO.assets.get('runthrow_' + id), f * T.w, 0, T.w, T.h, Math.round(-(T.w * s) / 2), Math.round(footY - PO.RUN_STRIP_FOOT_LIFT - T.footRow * s), Math.round(T.w * s), Math.round(T.h * s));
    } else drawStripPose(ctx, id, 'stop', 0, footY);
    ctx.restore();
  }
  // 投げるコマの玉を放す位置(足元・左右中央からの画面の px。dx は右向きのとき、dy は上が正)
  function throwRelease(id) {
    const R = PO.RUN_STRIPS[id];
    const r = R.throw ? R.throw.release : [30, 50]; // 画像がないときの手のおおよその位置
    return { dx: r[0] * R.scale, dy: r[1] * R.scale + PO.RUN_STRIP_FOOT_LIFT };
  }

  // 走る速さ v(m/s)のときの、連番画像 1 周の速さ(周/秒)。説明は config.js の PO.RUN_STRIPS
  // tapRate(任意): 直近の連打ペース(回/秒)。高速域だけ、連打を頑張るほど足の回転を上乗せする(見た目だけ)
  function stripCycles(R, v, tapRate) {
    let c = R.base + R.perMps * v;
    if (R.hiGain && v > R.hiFrom) c += R.hiGain * Math.pow(Math.min(1, (v - R.hiFrom) / (R.hiTo - R.hiFrom)), R.hiPow);
    if (R.maxCycles) c = Math.min(R.maxCycles, c);
    // 低速・中速(v <= hiFrom)では hi = 0 なので今までと同じ
    if (R.rushGain && tapRate > R.rushFrom && v > R.hiFrom) {
      const hi = Math.min(1, (v - R.hiFrom) / (R.hiTo - R.hiFrom));
      c = Math.max(c, Math.min(R.rushMax, c + R.rushGain * (tapRate - R.rushFrom) * hi));
    }
    return c;
  }

  return { byId, frameName, winHop, draw, drawFace, hasFrame, runStrip, drawRunStrip, stripCycles, hasStripPoses, drawStripPose, drawJump, drawPull, pullRope, drawStripPoseFlip, drawThrow, throwRelease, runHand };
})();
