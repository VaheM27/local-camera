#!/bin/bash
# Двойной клик в Finder: запускает сервер и открывает страницу вещания.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установите его: https://nodejs.org (или: brew install node)"
  read -n 1 -r -p "Нажмите любую клавишу, чтобы закрыть…"
  exit 1
fi

[ -d node_modules ] || npm install

( sleep 2 && open "https://localhost:${PORT:-3000}/" ) &
exec node server.js
