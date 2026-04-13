
import fs from 'fs';
import path from 'path';
import { Logger } from './Logger';

const logger = new Logger('LibreOfficePath');

export function getLibreOfficePath(): string {
  // 1. Check environment variable
  if (process.env.LIBREOFFICE_PATH) {
    if (fs.existsSync(process.env.LIBREOFFICE_PATH)) {
      return process.env.LIBREOFFICE_PATH;
    }
    logger.warn(`LIBREOFFICE_PATH is set to "${process.env.LIBREOFFICE_PATH}" but the file does not exist.`);
  }

  // 2. Default paths for Windows
  if (process.platform === 'win32') {
    const commonPaths = [
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.com'),
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'LibreOffice', 'program', 'soffice.com'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'LibreOffice', 'program', 'soffice.exe'),
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        logger.info(`Found LibreOffice at: ${p}`);
        return p;
      }
    }
  }

  // 3. Linux/macOS common paths
  if (process.platform === 'linux' || process.platform === 'darwin') {
    const commonPaths = [
      '/usr/bin/libreoffice',
      '/usr/bin/soffice',
      '/usr/local/bin/libreoffice',
      '/usr/local/bin/soffice',
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }

  // 4. Fallback to 'soffice' and hope it's in PATH
  logger.warn('LibreOffice binary not found in common paths. Falling back to "soffice" command.');
  return 'soffice';
}

export function verifyLibreOffice(): boolean {
  const binaryPath = getLibreOfficePath();
  if (binaryPath === 'soffice') {
    // We can't easily check if 'soffice' exists in PATH without running a command,
    // but we can assume it might work.
    return true;
  }
  return fs.existsSync(binaryPath);
}
