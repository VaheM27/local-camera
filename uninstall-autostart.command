#!/bin/bash
# Двойной клик в Finder: отключает автозапуск сервера.
LABEL="com.local-camera.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "Автозапуск отключён, сервер остановлен."
read -n 1 -r -p "Нажмите любую клавишу, чтобы закрыть…"
