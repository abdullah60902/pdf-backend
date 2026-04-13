const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const loPath = "C:\\Program Files\\LibreOffice\\program\\soffice.com";
const loDir = path.dirname(loPath);

const userProfileDir = path.join(os.tmpdir(), `test_lo_profile_${Date.now()}`);
fs.mkdirSync(userProfileDir, { recursive: true });

let profileUrl = userProfileDir.replace(/\\/g, '/');
if (!profileUrl.startsWith('/')) profileUrl = '/' + profileUrl;
const userProfileParam = `-env:UserInstallation=file://${profileUrl}`;

const args = [
  '--headless',
  '--nologo',
  userProfileParam,
  '--version'
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
  fs.rmSync(userProfileDir, { recursive: true });
});
