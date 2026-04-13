
import { parentPort, workerData } from 'worker_threads';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';

async function run() {
  const { inputPath, outputPath, libreofficePath, outputFormat = 'pdf' } = workerData;

  try {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.ensureDir(outputDir);

    // Verify if libreofficePath exists if it's an absolute path
    if (path.isAbsolute(libreofficePath)) {
      if (!await fs.pathExists(libreofficePath)) {
        throw new Error(`LibreOffice binary not found at: ${libreofficePath}. Please check your installation.`);
      }
    }

    // Use system temp directory for the profile to ensure it's absolute and writable
    const userProfileDir = path.join(os.tmpdir(), `pdf_toolkit_lo_profile_${Date.now()}`);
    await fs.ensureDir(userProfileDir);

    // Format as file:/// URL with forward slashes.
    let profileUrl = userProfileDir.replace(/\\/g, '/');
    if (!profileUrl.startsWith('/')) profileUrl = '/' + profileUrl;
    const userProfileParam = `-env:UserInstallation=file://${profileUrl}`;

    // Convert outputDir and inputPath to absolute paths to be safe
    const absOutputDir = path.resolve(outputDir);
    const absInputPath = path.resolve(inputPath);

    // Build the command string for cmd.exe
    const cmd = `"${libreofficePath}" --headless --nologo --nofirststartwizard --norestore "${userProfileParam}" --convert-to ${outputFormat} --outdir "${absOutputDir}" "${absInputPath}"`;

    console.log(`🚀 Executing LibreOffice (execSync): ${cmd}`);

    try {
      const stdout = execSync(cmd, {
        timeout: 120000, // 2 minute timeout
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.dirname(libreofficePath) // Run from LibreOffice's own directory
      });
      console.log(`✅ LibreOffice stdout: ${stdout.toString().trim()}`);
    } catch (execError: any) {
      const exitCode = execError.status;
      const stderr = execError.stderr ? execError.stderr.toString() : '';
      const stdout = execError.stdout ? execError.stdout.toString() : '';
      console.error(`❌ LibreOffice execSync failed. Exit: ${exitCode}, stderr: ${stderr}, stdout: ${stdout}`);

      // Cleanup profile dir
      try { await fs.remove(userProfileDir); } catch (e) { /* ignore */ }

      const errorMsg = exitCode === 1 && stderr.includes('is not recognized')
        ? `LibreOffice binary ('${libreofficePath}') was not found or is not in the system path.`
        : `LibreOffice exited with code ${exitCode}. Error: ${stderr} Stdout: ${stdout}`;

      if (parentPort) parentPort.postMessage({ success: false, error: errorMsg });
      return;
    }

    // Cleanup profile dir
    try { await fs.remove(userProfileDir); } catch (e) { /* ignore */ }

    // LibreOffice names the output file same as input but with .pdf extension
    const inputBaseName = path.basename(absInputPath, path.extname(absInputPath));
    const expectedPdfPath = path.join(absOutputDir, inputBaseName + '.pdf');

    console.log(`📂 Looking for output at: ${expectedPdfPath}`);

    // Give filesystem a moment to flush (sometimes needed on Windows)
    await new Promise(resolve => setTimeout(resolve, 500));

    if (await fs.pathExists(expectedPdfPath)) {
      console.log(`✅ Output PDF found at: ${expectedPdfPath}`);
      // Rename to the requested outputPath if different
      if (path.resolve(expectedPdfPath) !== path.resolve(outputPath)) {
        await fs.move(expectedPdfPath, outputPath, { overwrite: true });
      }
      if (parentPort) parentPort.postMessage({ success: true });
    } else {
      // List what's actually in the output directory for debugging
      const dirContents = await fs.readdir(absOutputDir);
      console.error(`❌ Output not found. Directory contents: ${dirContents.join(', ')}`);
      if (parentPort) parentPort.postMessage({ success: false, error: `Output file not found at ${expectedPdfPath}. Dir contents: [${dirContents.join(', ')}]` });
    }

  } catch (error: any) {
    console.error(`❌ Conversion worker error: ${error.message}`);
    if (parentPort) {
      parentPort.postMessage({
        success: false,
        error: error.message || 'Unknown conversion error'
      });
    }
  }
}

run();

