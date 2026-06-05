const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const cursor = require("./cursor");

// Must be set before app is ready so Windows taskbar pinning works correctly.
app.setName("Projects");
if (process.platform === "win32") {
  app.setAppUserModelId("com.todo.project");
}

// Use one data folder for both dev and installed builds.
const userDataPath = path.join(app.getPath("appData"), "Projects");
app.setPath("userData", userDataPath);

let mainWindow;

function getIconPath() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, "build", "icon.ico"),
        path.join(process.resourcesPath, "build", "icon.png"),
      ]
    : [
        path.join(__dirname, "..", "build", "icon.ico"),
        path.join(__dirname, "..", "build", "icon.png"),
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[candidates.length - 1];
}

const MIN_WINDOW_WIDTH = 360;
const INITIAL_WINDOW_WIDTH = MIN_WINDOW_WIDTH * 1.5;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();

  const windowOptions = {
    x: workArea.x,
    y: workArea.y,
    width: INITIAL_WINDOW_WIDTH,
    height: workArea.height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: 400,
    backgroundColor: "#0d0d12",
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (process.platform === "darwin") {
    windowOptions.titleBarStyle = "hiddenInset";
  } else {
    windowOptions.titleBarStyle = "hidden";
    if (process.platform === "win32") {
      windowOptions.titleBarOverlay = {
        color: "#0d0d12",
        symbolColor: "#ececf1",
        height: 36,
      };
    }
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, "..", "src", "index.html"));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  db.initDb();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("tutorial:reset", () => db.resetTutorialProject());
ipcMain.handle("tutorial:delete", () => db.deleteTutorialProject());

ipcMain.handle("projects:list", () => db.listProjects());
ipcMain.handle("projects:create", (_e, name) => db.createProject(name));
ipcMain.handle("projects:delete", (_e, id) => db.deleteProject(id));
ipcMain.handle("projects:touch", (_e, id) => db.touchProject(id));

ipcMain.handle("tasks:list", (_e, projectId, done) => db.listTasks(projectId, done));
ipcMain.handle("tasks:add", (_e, projectId, text) => db.addTask(projectId, text));
ipcMain.handle("tasks:done", (_e, taskId) => db.markTaskDone(taskId));
ipcMain.handle("tasks:undone", (_e, taskId) => db.markTaskUndone(taskId));
ipcMain.handle("tasks:delete", (_e, taskId) => db.deleteTask(taskId));
ipcMain.handle("tasks:update", (_e, taskId, text) => db.updateTask(taskId, text));
ipcMain.handle("tasks:reorder", (_e, projectId, orderedIds) =>
  db.reorderTasks(projectId, orderedIds)
);

ipcMain.handle("notes:list", (_e, projectId) => db.listProjectNotes(projectId));
ipcMain.handle("notes:add", (_e, projectId, text) => db.addProjectNote(projectId, text));
ipcMain.handle("notes:delete", (_e, noteId) => db.deleteProjectNote(noteId));
ipcMain.handle("notes:update", (_e, noteId, text) => db.updateProjectNote(noteId, text));

ipcMain.handle("projects:getPath", (_e, projectName) => cursor.getProjectPath(projectName));
ipcMain.handle("projects:openInCursor", (_e, projectName) => {
  const folderPath = cursor.getProjectPath(projectName);
  if (!folderPath) {
    throw new Error(`No Cursor path configured for "${projectName}". Edit project-paths.json.`);
  }
  cursor.openInCursor(folderPath);
  return folderPath;
});
