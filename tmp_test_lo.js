const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const loPath = "C:\\Program Files\\LibreOffice\\program\\soffice.com";
const profileDir = "D:\\lo_profiles\\test_job";
if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

const profileUrl = "file:///" + profileDir.replace(/\\/g, '/').replace(/^\//, '');
const profileParam = `-env:UserInstallation=${profileUrl}`;

console.log("Testing REAL conversion...");
console.log("Profile Param:", profileParam);

const res = spawnSync(loPath, [
  '--headless', 
  '--invisible',
  '--nodefault',
  '--nofirststartwizard',
  '--nologo',
  '--norestore',
  profileParam,
  '--convert-to', 'pdf',
  '--outdir', '.',
  'test.docx'
], { encoding: 'utf-8' });

console.log("Status:", res.status);
console.log("Stdout:", res.stdout);
console.log("Stderr:", res.stderr);
console.log("Error:", res.error);
