# CLAUDE.md

このファイルは、タスク管理アプリ(`apps/task-manager/`)専用のガイドです。リポジトリ全体の共通ルールはルートの `CLAUDE.md` を参照。

## 概要

タスクの追加・編集・削除・完了マークができるシンプルなタスク管理アプリ。React 19 + Vite で作っている(JavaScript / JSX、TypeScript なし)。画面の文字とコードコメントは日本語なので、新しく追加するユーザー向けの文言も日本語にすること。テストとリンターはまだない。

## 実行方法

このディレクトリ(`apps/task-manager/`)で実行する。

- `npm install` — 依存パッケージのインストール(初回のみ)
- `npm run dev` — 開発サーバー起動(http://localhost:5173/ に固定。使用中なら別ポートに逃げずエラーで止まる)
- `npm run build` — `dist/` に本番用ビルドを出力
- `npm run preview` — ビルド結果をローカルで確認(タスク保存 API も動く)

`dist/` を静的ファイルとして単体で配信した場合は保存 API がないので、各ブラウザの `localStorage` にだけ保存される。

## 構成

- `index.html` — Vite のエントリ。`#root` に React をマウントする。
- `src/main.jsx` — `createRoot` で `App` を描画し、`App.css` を読み込む。
- `src/App.jsx` — アプリ本体。状態・操作・画面をすべてこの1ファイルに持つ。
- `server/tasksApi.js` — タスク保存 API(`GET` / `PUT /api/tasks`)を開発サーバーと preview サーバーに追加する Vite プラグイン。`vite.config.js` で読み込む。
- `data/tasks.json` — タスクの保存先(実行時に作られる。git 管理外)。
- `src/App.css` — スタイル。色は `:root` の CSS 変数で定義し、`prefers-color-scheme: dark` でダークモードの色に切り替える。

設計上の要点:

- **状態**: タスクは `App` の `useState` で配列として持つ。1件は `{ id, title, done }`。`id` は `crypto.randomUUID()` で作る。状態は直接書き換えず、`map` / `filter` / スプレッドで新しい配列を作って `setTasks` に渡す。
- **保存**: タスクはサーバー側のファイル `data/tasks.json` に保存し、どのブラウザから開いても同じデータを使う。`PUT /api/tasks` で配列を丸ごと送る(最後に保存した内容が勝つ)。サーバーは `{ id, title, done }` の形を検査し、一時ファイルに書いてから置き換える。`App` は起動時と、タブが再び表示されたとき(`visibilitychange`)に `GET` で最新を読み込む。サーバーにまだデータがない(404)ときは、そのブラウザの `localStorage` の控えをサーバーへ引き継ぐ。サーバーとつながる前は `PUT` しない(古い控えで上書きしないため)。保存は1件ずつ順番に送る。
- **控え**: `localStorage` のキー `task-manager.tasks` にも毎回保存し、サーバーに届かないときはこちらだけで動く(画面に警告を出す)。読み書きは `try/catch` で囲む。タスクのデータ形式を変えるときは、`loadLocalTasks()` と `server/tasksApi.js` の検査の両方で古いデータも読めるようにすること。
- **入力**: 前後の空白を取り除いて空になる文字列は追加しない(追加ボタンも無効になる)。
- **編集**: 「編集」ボタンで、その行が入力欄に切り替わる。編集中のタスクは `editingId` と `editText` の state で持ち、同時に編集できるのは1件だけ。Enter か「保存」で確定し、Esc か「キャンセル」で破棄する。空のタイトルは保存できない(追加と同じルール)。完了状態と `id` は変えない。
- **ファイル監視**: このリポジトリは Windows のフォルダーを WSL の 9p で共有しているので、ファイル変更の通知が届かない。そのため `vite.config.js` で `server.watch.usePolling` を有効にしている。外すとコードを変えても画面が更新されなくなる。
- **ポート固定**: `localStorage` の控えはオリジン(ポート番号を含む)ごとに分かれるので、`vite.config.js` で `port: 5173` / `strictPort: true` にし、`.devcontainer/devcontainer.json` でも VS Code のポート転送を 5173 に固定(`requireLocalPort`)している。
- **ネットワーク**: `--host 0.0.0.0` で起動すると、同じネットワークの誰でもタスクを読み書きできる(認証はない)。
