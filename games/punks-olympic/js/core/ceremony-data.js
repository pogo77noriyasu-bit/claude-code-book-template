// 表彰式の画像の寸法(tools/build-ceremony.js が自動生成。手で直さない)
//   podium.steps: 各段(1 位・2 位・3 位)の中心 x・上面の幅 w・選手の足元を置く高さ surface(表彰台の画像の左上から)
//   trophy: 4 コマの 1 コマの幅 w・高さ h、baseRow = 台座の下端の行(コマの上端から)
PO.CEREMONY_ART = {
  "podium": {
    "src": "assets/ceremony/podium.png",
    "w": 480,
    "h": 138,
    "steps": [
      {
        "rank": 1,
        "x": 239,
        "w": 145,
        "surface": 14
      },
      {
        "rank": 2,
        "x": 93,
        "w": 130,
        "surface": 51
      },
      {
        "rank": 3,
        "x": 388,
        "w": 136,
        "surface": 63
      }
    ]
  },
  "trophy": {
    "src": "assets/ceremony/trophy.png",
    "frames": 4,
    "w": 83,
    "h": 96,
    "baseRow": 92
  }
};
