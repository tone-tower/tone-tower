import { execFileSync } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const mp3Encoding = ['-f', 'mp3', '-codec:a', 'libmp3lame', '-q:a', '4'];

export function convertToMP3(bytes) {
  const mp3 = execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', ...mp3Encoding, 'pipe:1'], {
    input: bytes,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  if (mp3.length < 1000) throw Error('Audio too short');
  return mp3;
}

export async function convertFilesToMP3(files, cwd) {
  const options = { cwd, timeout: 60000, windowsHide: true };
  const inputs = (names) => names.flatMap((name) => ['-threads', '1', '-i', name]);
  const map = (index) => ['-map', index + ':a:0'];
  await run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-xerror',
      '-filter_threads',
      '1',
      ...inputs(files.map(({ original }) => original)),
      ...files.flatMap(({ destination }, index) => [
        ...map(index),
        ...mp3Encoding,
        '-map_metadata',
        '-1',
        '-id3v2_version',
        '0',
        '-threads',
        '1',
        destination,
      ]),
    ],
    options,
  );
  await run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-xerror',
      '-filter_threads',
      '1',
      ...inputs(files.map(({ destination }) => destination)),
      ...files.flatMap((_, index) => map(index)),
      '-threads',
      '1',
      '-f',
      'null',
      '-',
    ],
    options,
  );
}

export async function validateMP3(file, { minDuration = 0.1, maxDuration = 10 } = {}) {
  const { stdout } = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ],
    { encoding: 'utf8', timeout: 30000, windowsHide: true },
  );
  const duration = Number(stdout);
  if (!(duration > minDuration && duration < maxDuration))
    throw Error('Unexpected duration: ' + file);
  await run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], {
    timeout: 30000,
    windowsHide: true,
  });
  return duration;
}
