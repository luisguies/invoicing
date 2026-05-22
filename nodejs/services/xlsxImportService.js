const path = require('path');
const { execFile } = require('child_process');

function pythonExecutable() {
  if (process.env.PYTHON || process.env.PYTHON_BIN) {
    return process.env.PYTHON || process.env.PYTHON_BIN;
  }
  // Linux/macOS often ship only `python3`; Windows installers usually add `python`.
  return process.platform === 'win32' ? 'python' : 'python3';
}

function runPythonScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    execFile(pythonExecutable(), [scriptPath, ...args], { timeout: 120000, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        let msg = stderr || error.message || 'Python XLSX parser failed';
        if (error.code === 'ENOENT') {
          msg = `Python not found (tried "${pythonExecutable()}"). Install Python 3 or set PYTHON to the interpreter path.`;
        }
        reject(new Error(msg));
        return;
      }
      resolve(stdout);
    });
  });
}

async function parseOldLoadsWorkbook(workbookPath) {
  const scriptPath = path.join(__dirname, '../scripts/parse_old_loads_xlsx.py');
  const stdout = await runPythonScript(scriptPath, [workbookPath]);
  try {
    const parsed = JSON.parse(stdout);
    if (!parsed || !Array.isArray(parsed.rows)) {
      throw new Error('Workbook parser returned invalid data');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse workbook JSON: ${error.message}`);
  }
}

module.exports = {
  parseOldLoadsWorkbook
};
