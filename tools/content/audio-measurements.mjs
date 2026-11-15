import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readJSON } from '../lib/json.mjs';
import { writeCurationJSON } from './curation-json.mjs';
import { withCurationLock } from './curation-lock.mjs';
import { listeningItemsUnlocked } from './listening-workflow.mjs';
import { measurementPath, validateMeasurements } from './audio-coverage.mjs';
import { digest } from './listening-state.mjs';

const run = promisify(execFile);
const db = (amplitude) => (amplitude > 0 ? 20 * Math.log10(amplitude) : null);

export function measureWave(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE')
    throw Error('Expected decoded float WAV.');
  let sampleRate, channels;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (name === 'data')
      return measurePCM(
        bytes.subarray(start, length === 0xffffffff ? undefined : start + length),
        sampleRate,
        channels,
      );
    if (start + length > bytes.length) throw Error('Truncated decoded WAV.');
    if (name === 'fmt ') {
      if (
        length < 16 ||
        bytes.readUInt16LE(start + 14) !== 32 ||
        !(
          bytes.readUInt16LE(start) === 3 ||
          (length >= 40 &&
            bytes.readUInt16LE(start) === 0xfffe &&
            bytes.readUInt32LE(start + 24) === 3)
        )
      )
        throw Error('Expected float32 PCM.');
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
    }
    offset = start + length + (length % 2);
  }
  throw Error('Missing decoded WAV samples.');
}

export function measurePCM(bytes, sampleRate, channels) {
  if (
    !Buffer.isBuffer(bytes) ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 1 ||
    !Number.isInteger(channels) ||
    channels < 1 ||
    channels > 32 ||
    !bytes.length ||
    bytes.length % (4 * channels)
  )
    throw Error('Invalid decoded PCM.');
  let peak = 0,
    sumSquares = 0,
    clipped = 0,
    leading = 0,
    trailing = 0,
    heard = false;
  const samples = bytes.length / 4;
  const frames = samples / channels;
  const silenceThreshold = 10 ** (-45 / 20);
  for (let frame = 0; frame < frames; frame++) {
    let framePeak = 0;
    for (let channel = 0; channel < channels; channel++) {
      const value = Math.abs(bytes.readFloatLE((frame * channels + channel) * 4));
      if (!Number.isFinite(value)) throw Error('Non-finite decoded sample.');
      peak = Math.max(peak, value);
      framePeak = Math.max(framePeak, value);
      sumSquares += value * value;
      if (value >= 1) clipped++;
    }
    if (framePeak <= silenceThreshold) {
      if (!heard) leading++;
      trailing++;
    } else {
      heard = true;
      trailing = 0;
    }
  }
  const result = {
    measurementVersion: 1,
    duration: frames / sampleRate,
    sampleRate,
    channels,
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(sumSquares / samples)),
    fullScaleSampleFraction: clipped / samples,
    leadingSilenceSeconds: leading / sampleRate,
    trailingSilenceSeconds: trailing / sampleRate,
  };
  result.flags = [
    ...(clipped ? ['full-scale-samples'] : []),
    ...(result.rmsDb === null || result.rmsDb < -35 ? ['quiet'] : []),
    ...(leading / sampleRate > 0.5 ? ['leading-silence'] : []),
    ...(trailing / sampleRate > 0.5 ? ['trailing-silence'] : []),
  ];
  return result;
}

export async function measureRecording(root, item) {
  const file = path.join(root, item.audio);
  if (digest(await readFile(file)) !== item.recordingSha256)
    throw Error('Audio changed before measurement: ' + item.recordingId);
  // WAV carries the original channel count/sample rate, avoiding a second decoder process.
  const decoded = await run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-threads',
      '1',
      '-i',
      file,
      '-map',
      '0:a:0',
      '-f',
      'wav',
      '-acodec',
      'pcm_f32le',
      '-threads',
      '1',
      'pipe:1',
    ],
    { windowsHide: true, timeout: 30000, encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 },
  );
  if (digest(await readFile(file)) !== item.recordingSha256)
    throw Error('Audio changed during measurement: ' + item.recordingId);
  return {
    recordingSha256: item.recordingSha256,
    measuredAt: new Date().toISOString(),
    ...measureWave(decoded.stdout),
  };
}

export function analyzeAudio(root, language, { limit = Infinity, progress = () => {} } = {}) {
  if (!(limit === Infinity || (Number.isInteger(limit) && limit > 0)))
    throw Error('Analysis limit must be a positive integer.');
  return withCurationLock(root, language, async () => {
    const items = await listeningItemsUnlocked(root, language);
    const file = measurementPath(root, language);
    const saved = await readJSON(file, { version: 1, language, recordings: {} });
    validateMeasurements(saved, language);
    const pending = items
      .filter(
        (i) =>
          i.audioAvailable &&
          (saved.recordings[i.recordingId]?.recordingSha256 !== i.recordingSha256 ||
            saved.recordings[i.recordingId]?.measurementVersion !== 1),
      )
      .slice(0, limit);
    let completed = 0,
      checkpoint = 0;
    // Bound decoder processes and threads; checkpoint at least every 56 clips.
    for (let start = 0; start < pending.length; start += 8) {
      const batch = pending.slice(start, start + 8);
      const measured = await Promise.all(batch.map((item) => measureRecording(root, item)));
      batch.forEach((item, i) => {
        saved.recordings[item.recordingId] = measured[i];
      });
      completed += batch.length;
      if (completed - checkpoint >= 50 || completed === pending.length) {
        await writeCurationJSON(file, saved);
        checkpoint = completed;
      }
      progress({ language, completed, pending: pending.length });
    }
    return {
      language,
      measured: completed,
      unavailable: items.filter((i) => !i.audioAvailable).length,
      file,
    };
  });
}
