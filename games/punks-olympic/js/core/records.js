// 記録(自己ベスト)の管理。種目ごとに localStorage に保存する(全種目で共通)
// 保存形式: { dash100: { value: 10.53, char: 'red', date: '2026-11-18' }, ... }
PO.records = (function () {
  const KEY = PO.config.RECORDS_KEY;

  function loadAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveAll(all) {
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) {
      /* 保存できない環境(プライベートモードなど)でも遊べるようにする */
    }
  }

  function eventInfo(eventId) {
    return PO.EVENT_LIST.find((e) => e.id === eventId);
  }

  // その種目の自己ベスト(なければ null)
  function get(eventId) {
    return loadAll()[eventId] || null;
  }

  // 有効な記録か: 記録なし(null)・数でない値・0 以下(玉入れの 0 個・缶蹴りの 0m・0 秒)は自己ベストにしない
  function valid(value) {
    return value != null && typeof value === 'number' && isFinite(value) && value > 0;
  }

  // 記録を出したら呼ぶ。自己ベストを更新したら保存して true(無効な記録は登録しない = NEW RECORD!! も出ない)
  function submit(eventId, value, charId) {
    if (!valid(value)) return false;
    const all = loadAll();
    const cur = all[eventId];
    const lowerIsBetter = eventInfo(eventId).record === 'time';
    const better = !cur || (lowerIsBetter ? value < cur.value : value > cur.value);
    if (!better) return false;
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    all[eventId] = { value, char: charId, date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) };
    saveAll(all);
    return true;
  }

  // 表示用の文字列(時間は 10.53、距離は 7.25m、個数は 23)
  function format(eventId, value) {
    const kind = eventInfo(eventId).record;
    if (value == null) return kind === 'count' ? '--' : '--.--';
    if (kind === 'count') return String(value);
    return kind === 'time' ? value.toFixed(2) : value.toFixed(2) + 'm';
  }

  return { get, submit, format, loadAll, valid };
})();
