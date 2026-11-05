import fs from 'node:fs/promises';
import path from 'node:path';

const API_PATH = '/api/tasks';
const MAX_BODY_BYTES = 1024 * 1024;

// タスクの形 { id, title, done } になっているかを確かめる
function isValidTasks(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (t) =>
        t &&
        typeof t.id === 'string' &&
        typeof t.title === 'string' &&
        typeof t.done === 'boolean',
    )
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body === undefined ? '' : JSON.stringify(body));
}

// タスクを JSON ファイルに保存する API を開発サーバー(dev / preview)に追加する。
//   GET /api/tasks … 保存済みのタスク配列を返す。まだ保存したことがなければ 404。
//   PUT /api/tasks … タスク配列を丸ごと受け取って保存する。
export default function tasksApi({ file }) {
  const tmpFile = `${file}.tmp`;

  async function handle(req, res, next) {
    const url = req.url.split('?')[0];
    if (url !== API_PATH) return next();

    try {
      if (req.method === 'GET') {
        let text;
        try {
          text = await fs.readFile(file, 'utf8');
        } catch (err) {
          if (err.code === 'ENOENT') return send(res, 404, { error: 'not found' });
          throw err;
        }
        const tasks = JSON.parse(text);
        return send(res, 200, isValidTasks(tasks) ? tasks : []);
      }

      if (req.method === 'PUT') {
        const tasks = JSON.parse(await readBody(req));
        if (!isValidTasks(tasks)) return send(res, 400, { error: 'invalid tasks' });
        await fs.mkdir(path.dirname(file), { recursive: true });
        // 書き込み途中で止まってもファイルが壊れないよう、一時ファイルに書いてから置き換える
        await fs.writeFile(tmpFile, JSON.stringify(tasks, null, 2) + '\n');
        await fs.rename(tmpFile, file);
        return send(res, 204);
      }

      res.setHeader('Allow', 'GET, PUT');
      return send(res, 405, { error: 'method not allowed' });
    } catch {
      return send(res, 500, { error: 'server error' });
    }
  }

  return {
    name: 'tasks-api',
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}
