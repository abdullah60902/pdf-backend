const { spawnSync } = require('child_process');
const path = require('path');

const loPath = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";

console.log("Testing --headless --version...");
let r1 = spawnSync(loPath, ['--headless', '--version']);
console.log("Exit code 1:", r1.status);

console.log("Testing --version only...");
let r2 = spawnSync(loPath, ['--version']);
console.log("Exit code 2:", r2.status);
