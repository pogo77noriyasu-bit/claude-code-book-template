import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tasksApi from './server/tasksApi.js';

// タスクの保存先。どのブラウザから開いても、このファイルを読み書きする。
const TASKS_FILE = fileURLToPath(new URL('./data/tasks.json', import.meta.url));

// localStorage はオリジン(ポート番号を含む)ごとに分かれて保存される。
// サーバーに届かないときの控えとして使うので、ポートは 5173 に固定する。
// 5173 が使用中なら別のポートに逃げずにエラーで止める(strictPort)。
export default defineConfig({
  plugins: [react(), tasksApi({ file: TASKS_FILE })],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // 保存ファイルが書き換わってもページを再読み込みしない
      ignored: ['**/data/**'],
      // Windows のフォルダーを共有した Dev Container(WSL の 9p マウント)では
      // ファイル変更の通知が届かないので、定期的に見に行って変更を検知する
      usePolling: true,
      interval: 300,
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
