import { useEffect, useRef } from 'react';
import { useAllDatabaseChords } from '../db/queries';
import { chordMatchesQuery } from '../utils/chord-autocomplete-helpers';

/**
 * Loads the full chord library when the user has typed a search query, then filters
 * by chordMatchesQuery and exclude-used, and passes the result to onResults.
 * Only mount when modal is open and query is non-empty so we don't load on modal open.
 */
export default function ChordSearchFullResults({
  query,
  userId,
  instrument,
  tuning,
  usedChordNames,
  onResults,
}) {
  const { data } = useAllDatabaseChords(userId, instrument, tuning);
  const onResultsRef = useRef(onResults);
  onResultsRef.current = onResults;
  const allChords = data?.chords || [];

  const tuningMatch = (c) =>
    (c.tuning === 'ukulele_standard' || c.tuning === 'standard') &&
    (tuning === 'ukulele_standard' || tuning === 'standard')
      ? true
      : c.tuning === tuning;

  useEffect(() => {
    if (!query || !query.trim()) {
      onResultsRef.current(null);
      return;
    }
    const usedSet = new Set(usedChordNames || []);
    const withSource = (arr, src) =>
      (arr || [])
        .filter((c) => c.instrument === instrument && tuningMatch(c))
        .map((c) => ({
          ...c,
          position: c.position ?? 1,
          source: typeof src === 'function' ? src(c) : (c.libraryType === 'personal' ? 'personal' : 'main'),
        }));
    const mainChords = allChords.filter((c) => c.libraryType === 'main');
    const personalChords = allChords.filter((c) => c.libraryType === 'personal');
    const withSourceList = [
      ...withSource(mainChords, 'main'),
      ...withSource(personalChords, 'personal'),
    ];
    const filteredBySmartMatch = withSourceList.filter((c) => chordMatchesQuery(c.name, query));
    const excludeUsed = filteredBySmartMatch.filter((v) => {
      const pos = v.position ?? 1;
      const key = pos > 1 ? `${v.name}:${v.position}` : v.name;
      return !usedSet.has(key);
    });
    onResultsRef.current(excludeUsed);
  }, [query, usedChordNames, allChords, instrument, tuning]);

  return null;
}
