import path from 'node:path';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true });
  mocha.addFile(path.resolve(__dirname, 'customEditor.test.js'));
  mocha.addFile(path.resolve(__dirname, 'localDiagramRuntime.test.js'));
  await new Promise<void>((resolve, reject) => mocha.run((failures) => failures === 0 ? resolve() : reject(new Error(`${failures} extension test failures`))));
}
