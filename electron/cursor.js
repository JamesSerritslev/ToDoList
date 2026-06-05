const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PATHS_FILE = path.join(__dirname, "..", "project-paths.json");

function loadProjectPaths() {
  try {
    const raw = fs.readFileSync(PATHS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getProjectPath(projectName) {
  const paths = loadProjectPaths();
  return paths[projectName] || null;
}

function getCursorCommand() {
  if (process.platform === "win32") {
    const cursorExe = path.join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "cursor",
      "Cursor.exe"
    );
    if (fs.existsSync(cursorExe)) {
      return { command: cursorExe, args: (folderPath) => [folderPath], shell: false };
    }
  }

  if (process.platform === "darwin") {
    const macCandidates = [
      "/Applications/Cursor.app/Contents/MacOS/Cursor",
      path.join(process.env.HOME || "", "Applications/Cursor.app/Contents/MacOS/Cursor"),
    ];
    const cursorApp = macCandidates.find((candidate) => fs.existsSync(candidate));
    if (cursorApp) {
      return { command: cursorApp, args: (folderPath) => [folderPath], shell: false };
    }
  }

  return { command: "cursor", args: (folderPath) => [folderPath], shell: true };
}

function openInCursor(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    throw new Error(`Folder not found: ${folderPath}`);
  }

  const { command, args, shell } = getCursorCommand();
  spawn(command, args(folderPath), { detached: true, stdio: "ignore", shell }).unref();
}

module.exports = { loadProjectPaths, getProjectPath, openInCursor };
