// Runs a Python script with whichever interpreter this machine has.
// Windows usually has `py` or `python`, macOS and Linux have `python3`.
import { spawnSync } from 'node:child_process';

const candidates = ['python3', 'python', 'py'];
const works = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
const python = candidates.find(works);

if (!python) {
  console.error(
    'Python 3.10+ is needed to build the data but was not found.\n' +
      'Install it from https://www.python.org/downloads/ (on Windows, tick "Add python.exe to PATH"),\n' +
      'then run: pip install -r pipeline/requirements.txt',
  );
  process.exit(1);
}

const { status } = spawnSync(python, process.argv.slice(2), { stdio: 'inherit' });
process.exit(status ?? 1);
