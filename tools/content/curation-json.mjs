import { format } from 'prettier';
import { atomicText } from '../lib/json.mjs';

// These versioned registries also participate in the repository's format check.
export async function writeCurationJSON(file, value) {
  await atomicText(file, await format(JSON.stringify(value), { parser: 'json', printWidth: 100 }));
}
