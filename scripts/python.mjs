// Runs a Python script with whichever interpreter this machine has.
// Windows usually has `py` or `python`, macOS and Linux have `python3`.
import { spawnSync } from 'node:child_process';

const candidates = ['python3', 'python', 'py'];

// Actually run some Python and check the answer. On Windows, `python` and
// `python3` can be Microsoft Store placeholders that exist but aren't Python.
const works = (cmd) => {
  const r = spawnSync(cmd, ['-c', 'import sys; print(sys.version_info >= (3, 10))'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return r.status === 0 && r.stdout?.trim() === 'True';
};
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
