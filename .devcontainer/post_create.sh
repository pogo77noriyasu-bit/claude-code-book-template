npx --yes playwright install-deps chromium

# Claude Code をインストールする
# コンテナーを作ったとき(作り直したとき)だけ動く
npm install -g @anthropic-ai/claude-code

# ~/.claude(ログイン情報・メモリー・履歴)は devcontainer.json の mounts でボリュームに保存している
# 新しく作られたボリュームは root の持ち物になることがあるので、vscode ユーザーが書き込めるようにする
sudo chown -R "$(id -un):$(id -gn)" /home/vscode/.claude

# Claude Code の設定ファイル(.claude.json)もボリュームに保存する
# devcontainer.json の containerEnv で CLAUDE_CONFIG_DIR=/home/vscode/.claude を指定しているので、
# Claude Code は ~/.claude.json ではなく ~/.claude/.claude.json を読み書きする
CLAUDE_DIR=/home/vscode/.claude
CLAUDE_JSON="$CLAUDE_DIR/.claude.json"

# JSON として読めて、初期設定が終わっている(hasCompletedOnboarding が true)ファイルかを調べる
is_valid_claude_json() {
  node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(j.hasCompletedOnboarding===true?0:1)' "$1" 2>/dev/null
}

if [ -e "$CLAUDE_JSON" ]; then
  # すでにあるファイルは絶対に上書きしない
  echo "[claude] $CLAUDE_JSON があるので、そのまま使います"
else
  # ボリュームにない場合だけ、バックアップから新しい順に探して、使えるものを1つ復元する
  #   backups/        : Claude Code が自動で作るバックアップ(新しい5つだけ残る)
  #   manual-backups/ : 手動で取ったバックアップ(Claude Code は消さない)
  RESTORED=""
  for f in $(ls -t "$CLAUDE_DIR"/backups/.claude.json.backup.* "$CLAUDE_DIR"/manual-backups/.claude.json.* 2>/dev/null); do
    if is_valid_claude_json "$f"; then
      cp -p "$f" "$CLAUDE_JSON"
      chmod 600 "$CLAUDE_JSON"
      RESTORED="$f"
      break
    fi
  done
  if [ -n "$RESTORED" ]; then
    echo "[claude] バックアップから復元しました: $RESTORED"
  else
    echo "[claude] 使えるバックアップがありません。Claude Code の初回起動時に初期設定を行ってください"
  fi
fi

# Git の作者情報(コミットに記録される名前とメールアドレス)を設定する
# ホームディレクトリの ~/.gitconfig はリビルドで消えるので、コンテナーを作るたびに設定し直す
git config --global user.name "pogo77noriyasu-bit"
git config --global user.email "pogo77noriyasu@gmail.com"
echo "[git] user.name=$(git config --global user.name) / user.email=$(git config --global user.email)"

# データベース(MariaDB: MySQL 互換)をインストールする
# コンテナーを作ったとき(作り直したとき)だけ動く。起動は devcontainer.json の postStartCommand で行う
# データ(/var/lib/mysql)は devcontainer.json の mounts で名前付きボリューム mariadb-data に保存している
MARIADB_DATADIR=/var/lib/mysql

# apt を実行する前のボリュームの状態を記録しておく(ログで確認するため)
if sudo test -d "$MARIADB_DATADIR/mysql"; then
  echo "[mariadb] ボリュームに既存のデータがあります。初期化はせず、そのまま使います"
else
  echo "[mariadb] ボリュームは空です。初回の初期化を行います"
fi

# 注意: mariadb-server の apt インストール処理(postinst)は、毎回 mysql_install_db を実行する
#   - ボリュームが空なら、ここでボリュームの中に初期データが作られる
#   - データがある場合は既存のテーブルを見つけて何もせずに終わるので、上書きはされない
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client

# 新しく作られたボリュームは root の持ち物になる。また、作り直しで mysql ユーザーの UID が変わることもある
# postinst は所有者だけを直すので、グループも含めて mysql ユーザーの持ち物にそろえる
sudo chown -R mysql:mysql "$MARIADB_DATADIR"

# apt が初期化に失敗したときだけ、ここで初期化する(初期化を二重に行わないため)
# mysql ディレクトリがない場合に残っているファイルを調べる
# debian-*.flag は postinst が毎回作る目印なので数えない。それ以外のファイルがあれば不完全なデータとみなす
MARIADB_LEFTOVERS=$(sudo find "$MARIADB_DATADIR" -mindepth 1 -maxdepth 1 ! -name 'debian-*.flag')

if sudo test -d "$MARIADB_DATADIR/mysql"; then
  echo "[mariadb] 初期化済みのため、初期化はスキップします"
elif [ -n "$MARIADB_LEFTOVERS" ]; then
  # mysql ディレクトリがないのに他のファイルがある = 壊れているかもしれないデータ
  # 既存のデータを消したり上書きしたりしないことを優先し、ここで処理を中断する
  echo "[mariadb] エラー: $MARIADB_DATADIR に不完全なデータがあります。上書きを避けるため処理を中断します" >&2
  echo "[mariadb] 見つかったファイル:" >&2
  echo "$MARIADB_LEFTOVERS" >&2
  echo "[mariadb] 中身を確認し、必要ならバックアップしてから対応してください(ボリューム名: mariadb-data)" >&2
  exit 1
else
  echo "[mariadb] 初期化されていないため、mariadb-install-db を実行します"
  sudo mariadb-install-db --user=mysql --datadir="$MARIADB_DATADIR" --skip-test-db
fi
