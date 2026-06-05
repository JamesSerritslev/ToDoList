const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const iconPath = path.join(projectRoot, "build", "icon.ico");

// Only patch the portable wrapper here. Projects.exe is handled in after-pack.js.
// Do NOT patch the NSIS Setup exe — rcedit breaks NSIS integrity checks.
const exePaths = [path.join(projectRoot, "dist", "Projects-Portable.exe")];

async function main() {
  if (process.platform !== "win32") {
    console.log("embed-icon: skipping (Windows only)");
    return;
  }

  const { rcedit } = await import("rcedit");

  if (!fs.existsSync(iconPath)) {
    console.error("Missing build/icon.ico — run npm run generate-icon first");
    process.exit(1);
  }

  const targets = exePaths.filter((exePath) => fs.existsSync(exePath));
  if (targets.length === 0) {
    console.log("No portable exe to patch — skipping embed-icon");
    return;
  }

  for (const exePath of targets) {
    console.log("Embedding icon in", path.relative(projectRoot, exePath));
    await rcedit(exePath, { icon: iconPath });
  }

  console.log("Done — icon embedded in", targets.length, "executable(s)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
