// 画像の読み込み(切り出し済みの assets/ を読むだけ)
PO.assets = (function () {
  const images = {};
  const list = { title: 'assets/title.png', stands: 'assets/stands.png', track: 'assets/track.png', startline: 'assets/startline.png', text100m: 'assets/text100m.png' };
  PO.CHARACTERS.forEach((c) => {
    list['char_' + c.id] = 'assets/chars/' + c.id + '.png';
    list['face_' + c.id] = 'assets/faces/' + c.id + '.png';
  });
  // 表彰式の表彰台・トロフィー(tools/build-ceremony.js で支給画像から切り出したもの)
  if (PO.CEREMONY_ART) {
    list.podium = PO.CEREMONY_ART.podium.src;
    list.trophy = PO.CEREMONY_ART.trophy.src;
  }
  Object.keys(PO.RUN_STRIPS).forEach((id) => {
    list['runstrip_' + id] = PO.RUN_STRIPS[id].src;
    if (PO.RUN_STRIPS[id].poses) list['runposes_' + id] = PO.RUN_STRIPS[id].poses.src;
    if (PO.RUN_STRIPS[id].jump) list['runjump_' + id] = PO.RUN_STRIPS[id].jump.src;
    if (PO.RUN_STRIPS[id].pull) list['runpull_' + id] = PO.RUN_STRIPS[id].pull.src;
    if (PO.RUN_STRIPS[id].throw) list['runthrow_' + id] = PO.RUN_STRIPS[id].throw.src;
  });

  function load() {
    const jobs = Object.keys(list).map(
      (key) =>
        new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => {
            images[key] = im;
            resolve();
          };
          im.onerror = () => reject(new Error('画像を読み込めません: ' + list[key]));
          im.src = list[key];
        })
    );
    return Promise.all(jobs);
  }

  return { load, get: (key) => images[key], images };
})();
