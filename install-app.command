#!/bin/bash
# Двойной клик в Finder: собирает приложение «Local Camera» из исходников и ставит его в «Программы».
# Нужен Node.js (https://nodejs.org или: brew install node). Первая сборка занимает пару минут.
set -e
cd "$(dirname "$0")"

pause() { read -n 1 -r -p "Нажмите любую клавишу, чтобы закрыть…"; echo; }
trap 'echo; echo "Сборка не удалась. Скопируйте текст ошибки выше."; pause' ERR

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установите его: https://nodejs.org (или: brew install node)"
  pause
  exit 1
fi

case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  *) ARCH=x64 ;;
esac

# Сборщику (electron-builder) нужен Node 22.12+ или 20.19+. Если Node старше, берём временный
# Node 22 из npm только для этой сборки — в системе ничего не меняется.
node_ok() {
  local v major minor
  v="$(node -v | sed 's/^v//')"
  major="${v%%.*}"
  minor="${v#*.}"
  minor="${minor%%.*}"
  [ "$major" -gt 22 ] && return 0
  [ "$major" -eq 22 ] && [ "$minor" -ge 12 ] && return 0
  [ "$major" -eq 20 ] && [ "$minor" -ge 19 ] && return 0
  return 1
}

echo "→ Устанавливаю зависимости…"
npm install
echo "→ Собираю приложение ($ARCH)…"
rm -rf dist
if node_ok; then
  npx electron-builder --mac dir "--$ARCH" --publish never
else
  echo "  Ваш Node $(node -v) староват для сборщика — использую временный Node 22 (один раз скачается)."
  npx -y -p node@22 -c "node node_modules/.bin/electron-builder --mac dir --$ARCH --publish never"
fi

APP="$(find dist -maxdepth 2 -name 'Local Camera.app' -type d | head -n 1)"
if [ -z "$APP" ]; then
  echo "Не нашёл собранное приложение в dist/."
  pause
  exit 1
fi

echo "→ Копирую в /Applications…"
osascript -e 'tell application "Local Camera" to quit' 2>/dev/null || true
rm -rf "/Applications/Local Camera.app"
ditto "$APP" "/Applications/Local Camera.app"
xattr -cr "/Applications/Local Camera.app" 2>/dev/null || true

echo
echo "Готово: «Local Camera» установлена в «Программы». Запускаю…"
open "/Applications/Local Camera.app"
pause
