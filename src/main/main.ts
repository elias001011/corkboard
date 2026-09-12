import { app, BrowserWindow, Menu, session } from "electron";
import path from "node:path";

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    title: "Corkboard",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.webContents.on("before-input-event", (_e, input) => {
    if (input.key === "F11" && input.type === "keyDown") {
      win.setFullScreen(!win.isFullScreen());
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const allowed = details.url.startsWith("file://") || details.url.startsWith("blob:") || details.url.startsWith("data:") || details.url.startsWith("devtools://");
    cb({ cancel: !allowed });
  });
  createWindow();
});

app.on("window-all-closed", () => app.quit());
