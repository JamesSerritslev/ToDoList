const Database = require("better-sqlite3");
const path = require("path");
const os = require("os");

const DB_PATH =
  process.env.TODO_DB_PATH ||
  path.join(os.homedir(), "AppData", "Roaming", "Projects", "tasks.db");

const PROJECTS = ["Analogue Room", "Standing Sun", "Portfolio"];

function main() {
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  const find = db.prepare("SELECT id FROM projects WHERE name = ?");
  const insert = db.prepare("INSERT INTO projects (name) VALUES (?)");

  const seed = db.transaction(() => {
    for (const name of PROJECTS) {
      if (find.get(name)) {
        console.log(`Skipped (exists): ${name}`);
      } else {
        insert.run(name);
        console.log(`Created: ${name}`);
      }
    }
  });

  seed();
  db.close();
  process.exit(0);
}

main();
