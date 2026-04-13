const { spawn, execSync } = require('child_process');
const path = require('path');

const loPath = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
const loDir = path.dirname(loPath);

const args = [
  '--headless',
  '--version'
];

console.log("Starting...");
const env = Object.assign({}, process.env, {
  SAL_USE_VCLPLUGIN: 'gen'
});

try {
  const out = execSync(`"${loPath}" --headless --version`, {
    env,
    cwd: loDir,
    stdio: 'pipe'
  });
  console.log("SUCCESS:", out.toString());
} catch (e) {
  console.error("FAILED exit:", e.status);
}
