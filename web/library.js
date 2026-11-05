/** Display groups share the SGS asset collection without counting samples as games. */
export function libraryEntries(catalog, tab) {
  if (tab === 'firmwares') return catalog.firmwares;
  return catalog.games.filter(
    (entry) => (entry.applicationType === 'sample') === (tab === 'samples'),
  );
}

export function libraryCounts(catalog) {
  return Object.fromEntries(
    ['games', 'samples', 'firmwares'].map((tab) => {
      const entries = libraryEntries(catalog, tab);
      return [
        tab,
        { available: entries.filter((entry) => entry.available).length, total: entries.length },
      ];
    }),
  );
}
