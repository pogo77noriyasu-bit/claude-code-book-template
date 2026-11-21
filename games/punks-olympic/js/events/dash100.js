// 種目: 100m 走(RUN の連打で加速する)。中身はトラック種目の共通部品(track-race.js)をそのまま使う
PO.events.register({
  id: 'dash100',
  // 調整値はいまの ROUND の値(PO.difficulty。R1 は PO.DASH100 のまま)
  create: (setup) => PO.trackRace.create(setup, { id: 'dash100', title: '100m DASH', P: PO.difficulty.params('dash100', PO.DASH100) }),
});
