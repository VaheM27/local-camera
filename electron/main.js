// Приложение для macOS: запускает сервер, показывает страницу вещания в окне,
// живёт в строке меню (закрытие окна не останавливает вещание).
const path = require("path");
const fs = require("fs");
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  clipboard,
  session,
  shell,
  desktopCapturer,
  systemPreferences,
  powerSaveBlocker,
} = require("electron");

// Сертификат, PIN и настройки лежат в папке данных приложения (сам пакет только для чтения).
process.env.DATA_DIR = app.getPath("userData");
const { start } = require("../server.js");

const SETTINGS_FILE = path.join(app.getPath("userData"), "settings.json");
const loadSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return {};
  }
};
const saveSettings = (s) => {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s));
};

let settings = {};
let info = null;
let win = null;
let tray = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit(); // второй экземпляр не нужен: порт и камера уже заняты первым
}
app.on("second-instance", () => showWindow());

const pageUrl = () =>
  info.localUrl + (settings.autostartStream ? "?autostart=1" : "");

function createWindow(show) {
  win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 480,
    minHeight: 560,
    title: "Камера MacBook",
    backgroundColor: "#0b0d12",
    show,
    webPreferences: {
      backgroundThrottling: false, // скрытое окно продолжает вещать
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.loadURL(pageUrl());
  // Внешние ссылки — в браузере, внутри окна только наш сервер.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(info.localUrl)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function setupSession() {
  const ses = session.defaultSession;
  // Свой самоподписанный сертификат на localhost принимаем без предупреждений.
  ses.setCertificateVerifyProc((req, cb) => {
    cb(req.hostname === "localhost" || req.hostname === "127.0.0.1" ? 0 : -3);
  });
  const allowed = ["media", "display-capture", "clipboard-sanitized-write"];
  ses.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(allowed.includes(permission)),
  );
  ses.setPermissionCheckHandler((_wc, permission) =>
    allowed.includes(permission),
  );
  // «Экран Mac»: системный выбор (macOS 15+), иначе — основной экран.
  ses.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) => callback(sources[0] ? { video: sources[0] } : {}))
        .catch(() => callback({}));
    },
    { useSystemPicker: true },
  );
}

function buildTrayMenu() {
  const link = info.hostUrl || info.watchUrls[0] || "";
  return Menu.buildFromTemplate([
    { label: "Открыть окно", click: showWindow },
    { type: "separator" },
    {
      label: info.pin ? `PIN для телефона: ${info.pin}` : "PIN отключён",
      enabled: false,
    },
    {
      label: "Скопировать ссылку для телефона",
      enabled: !!link,
      click: () => clipboard.writeText(link),
    },
    { type: "separator" },
    {
      label: "Запускать при входе в систему",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    {
      label: "Начинать вещание автоматически",
      type: "checkbox",
      checked: !!settings.autostartStream,
      click: (item) => {
        settings.autostartStream = item.checked;
        saveSettings(settings);
        if (win) win.loadURL(pageUrl());
      },
    },
    { type: "separator" },
    { label: "Выйти", role: "quit" },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "trayTemplate.png"),
  );
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Камера MacBook");
  tray.on("click", showWindow);
  tray.setContextMenu(buildTrayMenu());
  // Меню пересобираем при открытии, чтобы галочки отражали актуальное состояние.
  tray.on("right-click", () => tray.setContextMenu(buildTrayMenu()));
  tray.on("mouse-enter", () => tray.setContextMenu(buildTrayMenu()));
}

app.whenReady().then(async () => {
  settings = loadSettings();
  setupSession();
  if (process.platform === "darwin") {
    // Запрос доступа сразу при старте: системный диалог macOS появится один раз.
    systemPreferences.askForMediaAccess("camera").catch(() => {});
    systemPreferences.askForMediaAccess("microphone").catch(() => {});
  }
  try {
    info = await start({ fallbackPorts: 10 });
  } catch (err) {
    const { dialog } = require("electron");
    dialog.showErrorBox(
      "Не удалось запустить сервер",
      String(err && err.message ? err.message : err),
    );
    app.quit();
    return;
  }
  powerSaveBlocker.start("prevent-app-suspension");
  const login = app.getLoginItemSettings();
  // Запуск при входе в систему: окно не показываем, приложение сидит в строке меню.
  createWindow(!login.wasOpenedAtLogin);
  createTray();
});

app.on("activate", showWindow); // клик по значку в Dock
app.on("before-quit", () => {
  quitting = true;
});
// Окно скрыто, но приложение живёт в строке меню — не выходим.
app.on("window-all-closed", () => {});
