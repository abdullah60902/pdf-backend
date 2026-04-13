const { spawn } = require('child_process');
const path = require('path');

const loPath = "C:\\Program Files\\LibreOffice\\program\\soffice.com";
const loDir = path.dirname(loPath);

const args = [
  '--headless',
  '--version'
];

console.log("Starting...");
const child = spawn(path.basename(loPath), args, {
  cwd: loDir,
  shell: false
});
child.stdout.on('data', d => console.log("STDOUT:", d.toString().trim()));
child.stderr.on('data', d => console.error("STDERR:", d.toString().trim()));
child.on('close', code => { console.log("Exit code:", code); });
