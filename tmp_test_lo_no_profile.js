const { spawnSync } = require('child_process');
const loPath = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
console.log("Testing version WITHOUT profile...");
const res = spawnSync(loPath, ['--headless', '--version'], { encoding: 'utf-8' });
console.log("Status:", res.status);
console.log("Stderr:", res.stderr);
