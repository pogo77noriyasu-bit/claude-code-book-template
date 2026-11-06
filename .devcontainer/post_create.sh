npx --yes playwright install-deps chromium

# データベース(MariaDB: MySQL 互換)をインストールする
# コンテナーを作ったとき(作り直したとき)だけ動く。起動は devcontainer.json の postStartCommand で行う
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client

# Claude Code をインストールする
# コンテナーを作ったとき(作り直したとき)だけ動く
npm install -g @anthropic-ai/claude-code

# ~/.claude(ログイン情報・メモリー・履歴)は devcontainer.json の mounts でボリュームに保存している
# 新しく作られたボリュームは root の持ち物になることがあるので、vscode ユーザーが書き込めるようにする
sudo chown -R "$(id -un):$(id -gn)" /home/vscode/.claude
