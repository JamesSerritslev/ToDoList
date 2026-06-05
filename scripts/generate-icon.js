const fs = require("fs");
const path = require("path");
const toIco = require("to-ico");

const buildDir = path.join(__dirname, "..", "build");
fs.mkdirSync(buildDir, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="56" fill="#6366f1"/>
  <rect x="52" y="68" width="152" height="18" rx="5" fill="#ffffff" opacity="0.95"/>
  <rect x="52" y="108" width="120" height="18" rx="5" fill="#ffffff" opacity="0.75"/>
  <rect x="52" y="148" width="136" height="18" rx="5" fill="#ffffff" opacity="0.55"/>
  <circle cx="188" cy="178" r="28" fill="#22c55e"/>
  <path d="M176 178 l8 8 l16-16" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

fs.writeFileSync(path.join(buildDir, "icon.svg"), svg);

async function main() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.log("sharp not installed — skipping icon generation");
    return;
  }

  const pngPath = path.join(buildDir, "icon.png");
  const icoPath = path.join(buildDir, "icon.ico");

  await sharp(Buffer.from(svg)).resize(256, 256).png().toFile(pngPath);
  await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(path.join(buildDir, "icon-512.png"));

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(
    sizes.map((size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer())
  );

  const icoBuffer = await toIco(pngBuffers);
  fs.writeFileSync(icoPath, icoBuffer);

  console.log("Created", pngPath);
  console.log("Created", icoPath);
}

main().catch(console.error);
