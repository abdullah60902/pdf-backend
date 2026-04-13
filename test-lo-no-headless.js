const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const loPath = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";

// Create a temp file to convert
const testDoc = path.join(os.tmpdir(), "test-no-headless.txt");
require('fs').writeFileSync(testDoc, "Hello World");

console.log("Testing without headless...");
const result = spawnSync(loPath, ['--convert-to', 'pdf', '--outdir', os.tmpdir(), testDoc]);
console.log("Exit code:", result.status);
