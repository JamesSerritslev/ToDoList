const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const os = require("os");

const oldPath = path.join(os.homedir(), "AppData", "Roaming", "todo-project", "tasks.db");
const newPath = path.join(os.homedir(), "AppData", "Roaming", "Projects", "tasks.db");

function summary(label, dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`${label}: missing`);
    return null;
  }
  const db = new Database(dbPath, { readonly: true });
  const projects = db.prepare("SELECT id, name FROM projects ORDER BY id").all();
  const tasks = db.prepare("SELECT COUNT(*) AS c FROM tasks").get().c;
  const notes = db.prepare("SELECT COUNT(*) AS c FROM project_notes").get().c;
  db.close();
  console.log(`${label}: ${projects.length} projects, ${tasks} tasks, ${notes} notes`);
  projects.forEach((p) => console.log(`  - ${p.name}`));
  return { projects: projects.length, tasks, notes };
}

console.log("Before migration:");
const oldStats = summary("OLD (todo-project)", oldPath);
summary("NEW (Projects)", newPath);

if (!fs.existsSync(oldPath)) {
  console.log("\nNo old database to migrate.");
  process.exit(0);
}

const newDir = path.dirname(newPath);
fs.mkdirSync(newDir, { recursive: true });

if (fs.existsSync(newPath)) {
  fs.copyFileSync(newPath, `${newPath}.backup-${Date.now()}`);
}

fs.copyFileSync(oldPath, newPath);

// Apply any schema migrations on the copied db
const db = new Database(newPath);
db.pragma("foreign_keys = ON");

const columns = db.prepare("PRAGMA table_info(projects)").all();
if (!columns.some((col) => col.name === "last_opened_at")) {
  db.exec("ALTER TABLE projects ADD COLUMN last_opened_at TEXT");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS project_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

db.close();

console.log("\nAfter migration:");
summary("NEW (Projects)", newPath);
console.log("\nMigration complete.");
process.exit(0);
