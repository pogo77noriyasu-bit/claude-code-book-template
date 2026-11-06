npx --yes playwright install-deps chromium

# Claude Code をインストールする
# コンテナーを作ったとき(作り直したとき)だけ動く
npm install -g @anthropic-ai/claude-code

# ~/.claude(ログイン情報・メモリー・履歴)は devcontainer.json の mounts でボリュームに保存している
# 新しく作られたボリュームは root の持ち物になることがあるので、vscode ユーザーが書き込めるようにする
sudo chown -R "$(id -un):$(id -gn)" /home/vscode/.claude

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
