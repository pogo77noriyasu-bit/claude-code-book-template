// 開発用のプレビュー: 全 6 種目を遊ばなくても、表彰式・任意の ROUND の種目選択と難易度を確認できる
// - 開発環境だけで動く: ホストが localhost / 127.0.0.1 / [::1](ローカルの静的配信)のときだけ。GitHub Pages などの公開先では何もしない
// - プレビューから始めた進行の間は自己ベストを保存しない(PO.progress.previewMode。GAME OVER → タイトルで元に戻る)
// 使い方(リポジトリのルートを静的配信して /games/punks-olympic/ に付ける。char = キャラクターの id。省略時は赤モヒカン):
//   ?preview=ceremony&rank=2&round=3&char=pink
//       表彰式(プレイヤーが総合 rank 位(1〜4)、ROUND round)。開いた直後は「クリック・タップ・スペースキーで開始」の画面
//       (ブラウザは操作の前に音を出せないので、その操作で音を出せるようにしてから始める)。仮の記録・仮の総合順位で表示する。
//       終わったら 1〜3 位は ROUND round+1・0 / 6 CLEAR の種目選択(次の ROUND への遷移)、4 位は GAME OVER の画面
//   ?preview=round&round=5&char=green
//       ROUND round の種目選択(TARGET・CPU の強さはその ROUND の値)。そのまま種目を遊んで、その ROUND の難易度を確かめられる
//   ?preview=round&round=5&event=relay
//       ROUND round のその種目の競技前の表示(ROUND・TARGET)から始める(操作説明のデモ → 競技。判定の範囲もその ROUND の値)
PO.devPreview = (function () {
  const LOCAL = ['localhost', '127.0.0.1', '[::1]', '::1'];
  // host: 調べるホスト名(省略時はいまのページ。テストで公開先のホスト名を渡して無効になることを確かめる)
  function enabled(host) {
    return LOCAL.includes(host == null ? location.hostname : host);
  }
  const int = (v, lo, hi, def) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
  };
  // 最初の画面(プレビューでなければ null = ふだんどおりタイトルから)
  function initial(search) {
    const q = new URLSearchParams(search == null ? location.search : search);
    const mode = q.get('preview');
    if (!enabled() || !mode) return null;
    const ch = PO.CHARACTERS.find((c) => c.id === q.get('char'));
    const player = ch ? ch.id : PO.CHARACTERS[0].id;
    const round = int(q.get('round'), 1, 99, 1);
    if (mode === 'ceremony') {
      // waitStart: 音を出すため最初の操作を待つ
      return { scene: 'ceremony', params: { preview: true, waitStart: true, player, round, rank: int(q.get('rank'), 1, 4, 1) } };
    }
    if (mode === 'round') {
      PO.progress.startPreview(player, round);
      const ev = PO.EVENT_LIST.find((e) => e.id === q.get('event'));
      if (ev) return { scene: 'roundIntro', params: { eventId: ev.id, player, cpus: PO.progress.cpus } };
      return { scene: 'eventSelect', params: { eventId: PO.EVENT_LIST[0].id } };
    }
    return null;
  }
  return { enabled, initial };
})();
