/**
 * Ensures Electron's Windows binary is extracted when npm install scripts
 * leave an incomplete dist/ (common on some locked-down / OneDrive setups).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

if (process.env.CI || process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
  process.exit(0);
}

const root = path.join(__dirname, "..");
const electronDir = path.join(root, "node_modules", "electron");
const exe = path.join(electronDir, "dist", "electron.exe");
const pathTxt = path.join(electronDir, "path.txt");

function ok() {
  return fs.existsSync(exe);
}

if (ok()) {
  fs.writeFileSync(pathTxt, "electron.exe");
  process.exit(0);
}

console.log("Stormforge: Electron binary missing — running electron/install.js …");
try {
  execSync("node install.js", { cwd: electronDir, stdio: "inherit", env: { ...process.env, force_no_cache: "true" } });
} catch {
  // fall through to Expand-Archive fallback
}

if (ok()) {
  fs.writeFileSync(pathTxt, "electron.exe");
  process.exit(0);
}

// Fallback: unpack from electron cache via PowerShell Expand-Archive
const cacheRoot = path.join(process.env.LOCALAPPDATA || "", "electron", "Cache");
if (fs.existsSync(cacheRoot)) {
  const zips = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/electron-v.*-win32-x64\.zip$/i.test(ent.name)) zips.push(p);
    }
  };
  walk(cacheRoot);
  zips.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (zips[0]) {
    const dist = path.join(electronDir, "dist");
    fs.mkdirSync(dist, { recursive: true });
    console.log("Stormforge: extracting", zips[0]);
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zips[0].replace(/'/g, "''")}' -DestinationPath '${dist.replace(/'/g, "''")}' -Force"`,
      { stdio: "inherit" },
    );
    fs.writeFileSync(pathTxt, "electron.exe");
    fs.writeFileSync(path.join(dist, "version"), require(path.join(electronDir, "package.json")).version);
  }
}

if (!ok()) {
  console.warn("Stormforge: could not install Electron binary. Try: npm start after manual electron install.");
  process.exit(0);
}
console.log("Stormforge: Electron ready.");
