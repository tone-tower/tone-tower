import { withFileLock } from '../lib/lock.mjs';
import { audioPaths } from './paths.mjs';
export function withAudioLock(task, root = process.cwd()) {
  return withFileLock(task, audioPaths(root).lock, {
    label: 'audio',
    inheritanceKey: 'TONE_TOWER_AUDIO_LOCK',
  });
}
