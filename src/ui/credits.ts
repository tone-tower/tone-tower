import type { LanguageProfile, ExerciseRow } from '../types.ts';
export function filterCredits<T extends Partial<ExerciseRow>>(rows: T[], query = '') {
  const needle = query.trim().toLocaleLowerCase();
  return needle
    ? rows.filter((row) =>
        [row.text, row.transcription, row.gloss, row.author, row.license].some((value) =>
          String(value ?? '')
            .toLocaleLowerCase()
            .includes(needle),
        ),
      )
    : rows;
}
export function creditsPage<T>(rows: T[], index = 0) {
  const pages = Math.max(1, Math.ceil(rows.length / 20)),
    page = Math.max(0, Math.min(pages - 1, Number.isFinite(index) ? Math.floor(index) : 0));
  return { page, pages, rows: rows.slice(page * 20, page * 20 + 20) };
}

export function orderCredits(
  rows: readonly ExerciseRow[],
  profile: LanguageProfile,
): ExerciseRow[] {
  const creatorOrder = new Intl.Collator('en', { sensitivity: 'base' });
  const compareCreator = (a: ExerciseRow, b: ExerciseRow) =>
    creatorOrder.compare(a.author ?? '', b.author ?? '') ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  if (profile.id === 'vi') {
    const vietnamese = new Intl.Collator('vi');
    return [...rows].sort((a, b) => vietnamese.compare(a.text, b.text) || compareCreator(a, b));
  }

  const readingOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  return rows
    .map((row) => {
      const reading = row.transcription || row.text;
      return { row, reading, spelling: profile.withoutTones(reading) || reading };
    })
    .sort(
      (a, b) =>
        readingOrder.compare(a.spelling, b.spelling) ||
        readingOrder.compare(a.reading, b.reading) ||
        compareCreator(a.row, b.row),
    )
    .map(({ row }) => row);
}
