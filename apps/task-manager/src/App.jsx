import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'task-manager.tasks';
const API_URL = '/api/tasks';

// このブラウザに保存済みのタスクを読み込む。読めないときは空のリストから始める。
// サーバーに届かないときの控えとして使う。
function loadLocalTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveLocalTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // 保存できない環境(プライベートモードなど)では何もしない
  }
}

// サーバーに保存されたタスクを取得する。まだ一度も保存されていなければ null。
async function fetchServerTasks() {
  const res = await fetch(API_URL, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${API_URL} failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function putServerTasks(tasks) {
  const res = await fetch(API_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tasks),
  });
  if (!res.ok) throw new Error(`PUT ${API_URL} failed: ${res.status}`);
}

export default function App() {
  const [tasks, setTasks] = useState(loadLocalTasks);
  const [text, setText] = useState('');
  // 編集中のタスクの id(編集していないときは null)と、編集中の文字列
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  // 'loading' … サーバーから読み込み中 / 'synced' … サーバーと同期中 / 'offline' … このブラウザにだけ保存中
  const [syncStatus, setSyncStatus] = useState('loading');

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  // サーバーとつながってから保存を始める(古い控えでサーバーのデータを上書きしないため)
  const connectedRef = useRef(false);
  // サーバーから受け取った変更は、サーバーへ送り返さない
  const fromServerRef = useRef(false);
  // 保存を1件ずつ順番に送る(古い内容が後から届いて上書きしないため)
  const saveQueueRef = useRef(Promise.resolve());

  // サーバーのタスクを読み込んで画面に反映する。
  // サーバーにまだデータがなく、このブラウザに控えがあれば、それをサーバーへ引き継ぐ。
  const syncFromServer = useCallback(async () => {
    try {
      const serverTasks = await fetchServerTasks();
      if (serverTasks) {
        fromServerRef.current = true;
        setTasks(serverTasks);
      } else if (tasksRef.current.length > 0) {
        await putServerTasks(tasksRef.current);
      }
      connectedRef.current = true;
      setSyncStatus('synced');
    } catch {
      connectedRef.current = false;
      setSyncStatus('offline');
    }
  }, []);

  // 起動時と、ほかのタブやブラウザから戻ってきたときに、サーバーの最新データを読み込む
  useEffect(() => {
    syncFromServer();
    function handleVisible() {
      if (document.visibilityState === 'visible') syncFromServer();
    }
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [syncFromServer]);

  // タスクが変わるたびに、このブラウザとサーバーへ保存する
  useEffect(() => {
    saveLocalTasks(tasks);
    if (fromServerRef.current) {
      fromServerRef.current = false;
      return;
    }
    if (!connectedRef.current) return;
    saveQueueRef.current = saveQueueRef.current
      .then(() => putServerTasks(tasks))
      .then(
        () => setSyncStatus('synced'),
        () => {
          connectedRef.current = false;
          setSyncStatus('offline');
        },
      );
  }, [tasks]);

  function addTask(e) {
    e.preventDefault();
    const title = text.trim();
    if (!title) return;
    setTasks([...tasks, { id: crypto.randomUUID(), title, done: false }]);
    setText('');
  }

  function toggleTask(id) {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function deleteTask(id) {
    setTasks(tasks.filter((t) => t.id !== id));
    if (id === editingId) cancelEdit();
  }

  // 編集を始める。入力欄には今のタイトルを入れておく。
  function startEdit(task) {
    setEditingId(task.id);
    setEditText(task.title);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  // 編集内容を保存する。前後の空白を取り除いて空になるときは保存しない。
  function saveEdit(e) {
    e.preventDefault();
    const title = editText.trim();
    if (!title) return;
    setTasks(tasks.map((t) => (t.id === editingId ? { ...t, title } : t)));
    cancelEdit();
  }

  const remaining = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.length - remaining; // 完了した件数

  return (
    <main className="app">
      <h1>タスク管理</h1>

      {syncStatus === 'offline' && (
        <p className="sync-warning" role="status">
          サーバーに保存できません。いまはこのブラウザにだけ保存しています。
        </p>
      )}

      <form className="add-form" onSubmit={addTask}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="新しいタスクを入力"
          aria-label="新しいタスク"
        />
        <button type="submit" disabled={!text.trim()}>
          追加
        </button>
      </form>

      {tasks.length === 0 ? (
        <p className="empty">タスクはまだありません</p>
      ) : (
        <>
          <ul className="task-list">
            {tasks.map((task) =>
              task.id === editingId ? (
                <li key={task.id} className="task editing">
                  <form className="edit-form" onSubmit={saveEdit}>
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      aria-label={`「${task.title}」の新しいタイトル`}
                      autoFocus
                    />
                    <button type="submit" className="save" disabled={!editText.trim()}>
                      保存
                    </button>
                    <button type="button" className="cancel" onClick={cancelEdit}>
                      キャンセル
                    </button>
                  </form>
                </li>
              ) : (
                <li key={task.id} className={task.done ? 'task done' : 'task'}>
                  <label>
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => toggleTask(task.id)}
                    />
                    <span className="title">{task.title}</span>
                  </label>
                  <button
                    className="edit"
                    onClick={() => startEdit(task)}
                    aria-label={`「${task.title}」を編集`}
                  >
                    編集
                  </button>
                  <button
                    className="delete"
                    onClick={() => deleteTask(task.id)}
                    aria-label={`「${task.title}」を削除`}
                  >
                    削除
                  </button>
                </li>
              ),
            )}
          </ul>
          <p className="summary">
            残り {remaining} 件 / 完了 {doneCount} 件 / 全 {tasks.length} 件
          </p>
        </>
      )}
    </main>
  );
}
