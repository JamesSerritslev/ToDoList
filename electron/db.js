const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

let db;

function getDbPath() {
  return path.join(app.getPath("userData"), "tasks.db");
}

function migrateFromLegacyStore() {
  const newPath = getDbPath();
  const legacyPath = path.join(app.getPath("appData"), "todo-project", "tasks.db");

  if (newPath === legacyPath || !fs.existsSync(legacyPath)) return;

  if (fs.existsSync(newPath)) {
    const existing = new Database(newPath, { readonly: true });
    const count = existing.prepare("SELECT COUNT(*) AS c FROM projects").get().c;
    existing.close();
    if (count > 0) return;
  }

  fs.mkdirSync(path.dirname(newPath), { recursive: true });
  fs.copyFileSync(legacyPath, newPath);
}

function initDb() {
  migrateFromLegacyStore();
  db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      is_done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  const columns = db.prepare("PRAGMA table_info(projects)").all();
  if (!columns.some((col) => col.name === "notes")) {
    db.exec("ALTER TABLE projects ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }
  if (!columns.some((col) => col.name === "last_opened_at")) {
    db.exec("ALTER TABLE projects ADD COLUMN last_opened_at TEXT");
  }

  migrateLegacyNotes();
}

function listProjects() {
  return db
    .prepare(
      `SELECT id, name, created_at, last_opened_at
       FROM projects
       ORDER BY COALESCE(last_opened_at, created_at) DESC, id DESC`
    )
    .all();
}

function touchProject(id) {
  db.prepare(
    "UPDATE projects SET last_opened_at = datetime('now') WHERE id = ?"
  ).run(id);
}

function createProject(name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name cannot be empty");
  const result = db
    .prepare(
      "INSERT INTO projects (name, last_opened_at) VALUES (?, datetime('now'))"
    )
    .run(trimmed);
  return result.lastInsertRowid;
}

function deleteProject(id) {
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
}

function listTasks(projectId, done) {
  return db
    .prepare(
      `SELECT id, text, is_done, position, created_at
       FROM tasks
       WHERE project_id = ? AND is_done = ?
       ORDER BY position ASC, id ASC`
    )
    .all(projectId, done ? 1 : 0);
}

function addTask(projectId, text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Task text cannot be empty");

  const row = db
    .prepare(
      `SELECT COALESCE(MAX(position), -1) AS max_pos
       FROM tasks WHERE project_id = ? AND is_done = 0`
    )
    .get(projectId);

  const result = db
    .prepare(
      "INSERT INTO tasks (project_id, text, is_done, position) VALUES (?, ?, 0, ?)"
    )
    .run(projectId, trimmed, row.max_pos + 1);

  return result.lastInsertRowid;
}

function markTaskDone(taskId) {
  const task = db.prepare("SELECT project_id FROM tasks WHERE id = ?").get(taskId);
  if (!task) return;

  const row = db
    .prepare(
      `SELECT COALESCE(MAX(position), -1) AS max_pos
       FROM tasks WHERE project_id = ? AND is_done = 1`
    )
    .get(task.project_id);

  db.prepare("UPDATE tasks SET is_done = 1, position = ? WHERE id = ?").run(
    row.max_pos + 1,
    taskId
  );
}

function markTaskUndone(taskId) {
  const task = db.prepare("SELECT project_id FROM tasks WHERE id = ?").get(taskId);
  if (!task) return;

  const shift = db.prepare(
    `UPDATE tasks SET position = position + 1
     WHERE project_id = ? AND is_done = 0`
  );
  const mark = db.prepare(
    "UPDATE tasks SET is_done = 0, position = 0 WHERE id = ?"
  );

  const undo = db.transaction(() => {
    shift.run(task.project_id);
    mark.run(taskId);
  });
  undo();
}

function deleteTask(taskId) {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
}

function updateTask(taskId, text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Task text cannot be empty");
  db.prepare("UPDATE tasks SET text = ? WHERE id = ?").run(trimmed, taskId);
}

function reorderTasks(projectId, orderedIds) {
  const update = db.prepare(
    "UPDATE tasks SET position = ? WHERE id = ? AND project_id = ? AND is_done = 0"
  );
  const reorder = db.transaction((ids) => {
    ids.forEach((id, index) => {
      update.run(index, id, projectId);
    });
  });
  reorder(orderedIds);
}

function listProjectNotes(projectId) {
  return db
    .prepare(
      `SELECT id, text, position, created_at
       FROM project_notes
       WHERE project_id = ?
       ORDER BY position ASC, id ASC`
    )
    .all(projectId);
}

function addProjectNote(projectId, text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Note text cannot be empty");

  const row = db
    .prepare(
      `SELECT COALESCE(MAX(position), -1) AS max_pos
       FROM project_notes WHERE project_id = ?`
    )
    .get(projectId);

  const result = db
    .prepare(
      "INSERT INTO project_notes (project_id, text, position) VALUES (?, ?, ?)"
    )
    .run(projectId, trimmed, row.max_pos + 1);

  return result.lastInsertRowid;
}

function deleteProjectNote(noteId) {
  db.prepare("DELETE FROM project_notes WHERE id = ?").run(noteId);
}

function updateProjectNote(noteId, text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Note text cannot be empty");
  db.prepare("UPDATE project_notes SET text = ? WHERE id = ?").run(trimmed, noteId);
}

const TUTORIAL_PROJECT_NAME = "Tutorial Project";

function resetTutorialProject() {
  const existing = db
    .prepare("SELECT id FROM projects WHERE name = ?")
    .get(TUTORIAL_PROJECT_NAME);
  if (existing) {
    db.prepare("DELETE FROM projects WHERE id = ?").run(existing.id);
  }

  const projectId = createProject(TUTORIAL_PROJECT_NAME);

  db.prepare(
    "INSERT INTO tasks (project_id, text, is_done, position) VALUES (?, ?, 1, 0)"
  ).run(projectId, "Example completed task");

  db.prepare(
    "INSERT INTO tasks (project_id, text, is_done, position) VALUES (?, ?, 0, 0)"
  ).run(projectId, "Sample task — safe to remove");

  db.prepare(
    "INSERT INTO tasks (project_id, text, is_done, position) VALUES (?, ?, 0, 1)"
  ).run(projectId, "Drag me to reorder");

  db.prepare(
    "INSERT INTO project_notes (project_id, text, position) VALUES (?, ?, 0)"
  ).run(projectId, "Example saved note — env vars, snippets, or scratch text");

  return { id: projectId, name: TUTORIAL_PROJECT_NAME };
}

function deleteTutorialProject() {
  const existing = db
    .prepare("SELECT id FROM projects WHERE name = ?")
    .get(TUTORIAL_PROJECT_NAME);
  if (existing) {
    db.prepare("DELETE FROM projects WHERE id = ?").run(existing.id);
  }
}

function migrateLegacyNotes() {
  const projects = db
    .prepare("SELECT id, notes FROM projects WHERE notes != ''")
    .all();

  for (const project of projects) {
    const count = db
      .prepare("SELECT COUNT(*) AS count FROM project_notes WHERE project_id = ?")
      .get(project.id).count;

    if (count === 0) {
      db.prepare(
        "INSERT INTO project_notes (project_id, text, position) VALUES (?, ?, 0)"
      ).run(project.id, project.notes);
      db.prepare("UPDATE projects SET notes = '' WHERE id = ?").run(project.id);
    }
  }
}

module.exports = {
  initDb,
  listProjects,
  createProject,
  deleteProject,
  touchProject,
  listTasks,
  addTask,
  markTaskDone,
  markTaskUndone,
  deleteTask,
  updateTask,
  reorderTasks,
  listProjectNotes,
  addProjectNote,
  deleteProjectNote,
  updateProjectNote,
  resetTutorialProject,
  deleteTutorialProject,
  migrateLegacyNotes,
};
