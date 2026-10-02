#!/bin/bash
# Двойной клик в Finder: сервер будет запускаться сам при входе в macOS
# и перезапускаться, если упадёт. Отключить: uninstall-autostart.command.
set -e
cd "$(dirname "$0")"
DIR="$(pwd)"

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "Node.js не найден. Установите его: https://nodejs.org (или: brew install node)"
  read -n 1 -r -p "Нажмите любую клавишу, чтобы закрыть…"
  exit 1
fi
[ -d node_modules ] || npm install

LABEL="com.local-camera.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/local-camera.log"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

PORT_NOW="${PORT:-3000}"
sleep 2
echo
echo "Готово: сервер работает в фоне и будет запускаться при входе в систему."
echo "Страница вещания: https://localhost:$PORT_NOW/"
echo "PIN и ссылки для телефона: на странице вещания или в логе: $LOG"
echo
open "https://localhost:$PORT_NOW/" || true
read -n 1 -r -p "Нажмите любую клавишу, чтобы закрыть…"
