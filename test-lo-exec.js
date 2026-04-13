const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const execPath = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";

console.log("Testing execSync...");
try {
  execSync(`"${execPath}" --headless --version`);
  console.log("execSync success!");
} catch (e) {
  console.log("execSync failed:", e.status);
}

console.log("Testing exec...");
exec(`"${execPath}" --headless --version`, (err, stdout, stderr) => {
  if (err) {
    console.log("exec failed:", err.code);
  } else {
    console.log("exec success!");
  }
});
