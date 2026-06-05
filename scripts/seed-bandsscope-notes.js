const Database = require("better-sqlite3");
const path = require("path");
const os = require("os");

const DB_PATH =
  process.env.TODO_DB_PATH ||
  path.join(os.homedir(), "AppData", "Roaming", "Projects", "tasks.db");

const PROJECT_NAME = "BandsScope";

const NOTES = [
  `Team ID: 247WWYUYW8
Service ID: com.bandscope.net.auth
Key ID: 54Z3FP7MW5
Private Key File .p8:`,
  `be5d2d

3229ae`,
  `privacy@bandscope.net = r=BJn5eJTanh8mP>
delete@bandscope.net = RU3LF46Z7Wjy4mG<`,
];

function main() {
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  const project = db.prepare("SELECT id FROM projects WHERE name = ?").get(PROJECT_NAME);

  if (!project) {
    console.error(`Project "${PROJECT_NAME}" not found. Run npm run seed:bandsscope first.`);
    db.close();
    process.exit(1);
  }

  db.prepare("DELETE FROM project_notes WHERE project_id = ?").run(project.id);

  const insert = db.prepare(
    "INSERT INTO project_notes (project_id, text, position) VALUES (?, ?, ?)"
  );

  const seed = db.transaction(() => {
    NOTES.forEach((text, i) => {
      insert.run(project.id, text, i);
    });
  });

  seed();

  console.log(`Seeded ${NOTES.length} notes into "${PROJECT_NAME}" (id ${project.id}).`);
  db.close();
  process.exit(0);
}

main();
