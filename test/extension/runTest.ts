import path from 'node:path';
import { runTests } from '@vscode/test-electron';

void runTests({
  version: '1.100.0',
  extensionDevelopmentPath: path.resolve(__dirname, '../../'),
  extensionTestsPath: path.resolve(__dirname, 'suite/index.js'),
  launchArgs: [path.resolve(__dirname, '../../test/fixtures'), '--disable-extensions']
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
