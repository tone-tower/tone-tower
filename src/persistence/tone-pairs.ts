import type { Tone } from '../types.ts';

export function decodeTonePair(key: string): Tone[] {
  try {
    const pair = key.startsWith('[') ? JSON.parse(key) : key.split('-').map(Number);
    return Array.isArray(pair) ? pair : [];
  } catch {
    return [];
  }
}
