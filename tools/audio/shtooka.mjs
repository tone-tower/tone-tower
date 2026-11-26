import path from 'node:path';
import { readJSON } from '../lib/json.mjs';
import { validateInventory } from './inventory.mjs';

export const shtookaInventory = (root) => path.join(root, 'data/audio/mandarin-shtooka.json');

export function loadShtooka(root) {
  return readJSON(shtookaInventory(root), {
    version: 1,
    collectionId: 'cmn',
    language: 'cmn',
    recordings: [],
  }).then((inventory) => validateInventory(inventory, 'cmn', 'cmn', { shtooka: true }));
}
