const fs = require("fs");
const path = require("path");

/**
 * Embed the app icon into Projects.exe after pack, before NSIS/portable targets
 * are built so the installed app gets the correct taskbar icon.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const { rcedit } = await import("rcedit");
  const iconPath = path.join(context.packager.projectDir, "build", "icon.ico");
  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  );

  if (!fs.existsSync(iconPath)) {
    console.warn("after-pack: build/icon.ico not found, skipping icon embed");
    return;
  }

  console.log("after-pack: embedding icon in", path.basename(exePath));
  await rcedit(exePath, { icon: iconPath });
};
