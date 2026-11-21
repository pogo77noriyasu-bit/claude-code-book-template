// 地形(鉄骨・ハシゴ)の計算
// ステージ定義(データ)から、実行時に使う「レベル」オブジェクトを組み立てる。
window.DP = window.DP || {};

DP.geometry = (function () {
  const T = () => DP.config.GIRDER_THICKNESS;

  // 鉄骨の x 位置での上面の高さ
  function surfaceY(g, x) {
    if (g.x2 === g.x1) return g.y1;
    const t = (x - g.x1) / (g.x2 - g.x1);
    return g.y1 + (g.y2 - g.y1) * t;
  }

  // 鉄骨の下面の高さ
  function bottomY(g, x) {
    return surfaceY(g, x) + T();
  }

  function containsX(g, x) {
    return x >= g.x1 && x <= g.x2;
  }

  // ステージ定義 → レベル(参照しやすいよう ID で引ける形にして、ハシゴの上下端を計算しておく)
  function buildLevel(stage) {
    const girders = stage.girders.map((src, index) => {
      const g = Object.assign({}, src, { index });
      // 低い側へ転がる: 右端のほうが下(y が大きい)なら +1(右へ)
      g.downhill = g.y2 > g.y1 ? 1 : g.y2 < g.y1 ? -1 : 0;
      return g;
    });
    const byId = {};
    girders.forEach((g) => (byId[g.id] = g));

    const ladders = stage.ladders.map((src, index) => {
      const lower = byId[src.lower];
      const upper = byId[src.upper];
      if (!lower || !upper || !containsX(lower, src.x) || !containsX(upper, src.x)) {
        throw new Error('ハシゴの定義が鉄骨と合っていません: index ' + index);
      }
      // 切れたハシゴは、登れる部分が残るだけの長さが必要
      if (src.broken && surfaceY(lower, src.x) - surfaceY(upper, src.x) < DP.config.brokenLadder.headroom + 12) {
        throw new Error('切れたハシゴが短すぎます: index ' + index);
      }
      const topY = surfaceY(upper, src.x); // 上端 = 上の段の上面
      const bottomY = surfaceY(lower, src.x); // 下端 = 下の段の上面
      const broken = !!src.broken;
      const bc = DP.config.brokenLadder;
      return {
        index,
        x: src.x,
        lower,
        upper,
        topY,
        bottomY,
        noHazard: !!src.noHazard,
        // 切れたハシゴ: プレイヤーは climbTopY までしか登れない(上の段へは行けない)。
        // stubBottomY は上の段からぶら下がる切れ端の下端(見た目用)
        broken,
        climbTopY: broken ? topY + bc.headroom : topY,
        stubBottomY: broken ? topY + bc.stub : topY,
      };
    });

    return { stage, girders, byId, ladders };
  }

  // 落下中の物体が、この 1 ステップで鉄骨の上面を上から下へ通過したかを調べる。
  // 通過した鉄骨のうち一番上のものを返す(すり抜け防止のための連続判定)。
  function findLanding(level, prevX, prevFoot, newX, newFoot, ignore) {
    let best = null;
    let bestY = Infinity;
    for (const g of level.girders) {
      if (g === ignore) continue;
      if (!containsX(g, newX)) continue;
      const sPrev = surfaceY(g, Math.min(Math.max(prevX, g.x1), g.x2));
      const sNew = surfaceY(g, newX);
      // 前のステップでは上面より上(少しの誤差は許す)、今回は上面以下
      if (prevFoot <= sPrev + 0.5 && newFoot >= sNew) {
        if (sNew < bestY) {
          bestY = sNew;
          best = g;
        }
      }
    }
    return best;
  }

  // 上昇中の頭が、この 1 ステップで鉄骨の下面を下から上へ通過したかを調べる(天井)。
  function findCeiling(level, prevX, prevHead, newX, newHead, halfW) {
    let best = null;
    let bestY = -Infinity;
    for (const g of level.girders) {
      // 体の幅の範囲で一部でも重なれば天井になる
      if (newX + halfW < g.x1 || newX - halfW > g.x2) continue;
      const cx = Math.min(Math.max(newX, g.x1), g.x2);
      const bPrev = bottomY(g, Math.min(Math.max(prevX, g.x1), g.x2));
      const bNew = bottomY(g, cx);
      if (prevHead >= bPrev - 0.5 && newHead < bNew) {
        if (bNew > bestY) {
          bestY = bNew;
          best = g;
        }
      }
    }
    return best ? { girder: best, y: bestY } : null;
  }

  // 指定位置の真下にある一番近い鉄骨(着地点の予測やテスト用)
  function girderBelow(level, x, y) {
    let best = null;
    let bestY = Infinity;
    for (const g of level.girders) {
      if (!containsX(g, x)) continue;
      const s = surfaceY(g, x);
      if (s >= y - 0.5 && s < bestY) {
        bestY = s;
        best = g;
      }
    }
    return best;
  }

  // 矩形どうしの重なり。矩形は {x(中心), y(足元), w, h}
  function overlaps(a, b) {
    return (
      Math.abs(a.x - b.x) * 2 < a.w + b.w &&
      a.y - a.h < b.y &&
      b.y - b.h < a.y
    );
  }

  return { surfaceY, bottomY, containsX, buildLevel, findLanding, findCeiling, girderBelow, overlaps };
})();
