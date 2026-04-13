const { spawn } = require('child_process');
const path = require('path');

const loPath = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";

console.log("Starting...");
const child = spawn(loPath, ['--headless', '--version'], {
  stdio: 'ignore',
  detached: true
});

child.on('error', e => console.error("Error:", e));
child.on('close', code => console.log("Exit code:", code));
