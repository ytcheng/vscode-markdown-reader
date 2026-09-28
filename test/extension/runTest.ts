import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const profileDir = await mkdtemp('/tmp/mdr-vscode-test-');
  delete process.env.ELECTRON_RUN_AS_NODE;
  delete process.env.VSCODE_PID;
  delete process.env.VSCODE_CWD;

  try {
    await runTests({
      version: '1.120.0',
      vscodeExecutablePath: process.env.VSCODE_TEST_EXECUTABLE,
      extensionDevelopmentPath: path.resolve(__dirname, '../../'),
      extensionTestsPath: path.resolve(__dirname, 'suite/index.js'),
      launchArgs: [
        path.resolve(__dirname, '../../test/fixtures'),
        '--disable-extensions',
        `--user-data-dir=${path.join(profileDir, 'user-data')}`,
        `--extensions-dir=${path.join(profileDir, 'extensions')}`
      ]
    });
  } finally {
    await rm(profileDir, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
