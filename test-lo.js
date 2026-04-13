const { spawn } = require('child_process');
const path = require('path');

const loPath = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
const loDir = path.dirname(loPath);

// Create a temp profile
const os = require('os');
const userProfileDir = path.join(os.tmpdir(), `test_lo_profile_${Date.now()}`);
const fs = require('fs');
fs.mkdirSync(userProfileDir, { recursive: true });

let profileUrl = userProfileDir.replace(/\\/g, '/');
if (!profileUrl.startsWith('/')) profileUrl = '/' + profileUrl;
const userProfileParam = `-env:UserInstallation=file://${profileUrl}`;

const args = [
  '--headless',
  '--nologo',
  userProfileParam,
  '--version' // just to see if it starts without crashing
];

console.log("Starting from cwd:", loDir);
console.log("Exec:", path.basename(loPath));

const child = spawn(path.basename(loPath), args, {
  cwd: loDir,
  shell: false
});

child.stdout.on('data', d => console.log("STDOUT:", d.toString().trim()));
child.stderr.on('data', d => console.error("STDERR:", d.toString().trim()));

child.on('close', code => {
  console.log("Exit code:", code);
  fs.rmdirSync(userProfileDir, { recursive: true });
});
