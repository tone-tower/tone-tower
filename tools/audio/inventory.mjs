// Shared by downloading and publication. Never silently collapse duplicate identities.
const validURL = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
export function validateInventory(inventory, id, language = id, { shtooka = false } = {}) {
  const seen = new Set();
  if (
    !inventory ||
    typeof inventory !== 'object' ||
    Array.isArray(inventory) ||
    inventory.version !== 1 ||
    inventory.collectionId !== id ||
    inventory.language !== language ||
    !Array.isArray(inventory.recordings)
  )
    throw Error('Invalid collection inventory');
  for (const row of inventory.recordings) {
    const validId = shtooka
      ? row?.source?.provider === 'shtooka' && /^shtooka-(?:congcong|tan)-[a-f0-9]{8}$/.test(row.id)
      : /^commons-[1-9]\d*$/.test(row?.id || '');
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      typeof row.id !== 'string' ||
      !validId ||
      seen.has(row.id) ||
      row.language !== language ||
      row.audio?.file !== 'audio/' + id + '/' + row.id + '.mp3' ||
      !/^[a-f0-9]{64}$/.test(row.audio?.sha256 || '') ||
      !/^[a-f0-9]{40}$/.test(row.original?.sha1 || '') ||
      !/^[a-f0-9]{64}$/.test(row.original?.sha256 || '') ||
      !Number.isSafeInteger(row.original.bytes) ||
      row.original.bytes < 1 ||
      !Number.isSafeInteger(row.audio?.bytes) ||
      row.audio.bytes < 1 ||
      typeof row.sourceText !== 'string' ||
      !row.sourceText.trim() ||
      (row.sourcePinyin !== undefined &&
        (typeof row.sourcePinyin !== 'string' || !row.sourcePinyin.trim())) ||
      !row.attribution?.author ||
      !row.attribution?.license ||
      !validURL(row.attribution?.licenseUrl) ||
      !validURL(row.source?.pageUrl) ||
      !row.audio?.processing ||
      !row.source?.fileTimestamp
    )
      throw Error('Invalid or duplicate archived recording ' + row.id);
    seen.add(row.id);
  }

  return inventory;
}
