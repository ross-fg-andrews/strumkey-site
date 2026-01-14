import { useState, useEffect, useMemo, useRef } from 'react';
import ChordDiagram from './ChordDiagram';

/**
 * Normalize query to convert "sharp"/"flat" text patterns to #/b notation
 */
function normalizeQuery(query) {
  if (!query) return query;
  
  const trimmed = query.trim();
  
  const flatPatternFull = /^([A-Ga-g][#b]?)\s*(flat|fla|fl)$/i;
  const flatPatternSingle = /^([A-Ga-g][#b]?)\s*f$/i;
  const sharpPatternFull = /^([A-Ga-g][#b]?)\s*(sharp|shar|sha|sh)$/i;
  const sharpPatternSingle = /^([A-Ga-g][#b]?)\s*s$/i;
  
  let match = trimmed.match(flatPatternFull) || trimmed.match(flatPatternSingle);
  if (match) {
    const note = match[1].toUpperCase();
    return note + 'b';
  }
  
  match = trimmed.match(sharpPatternFull) || trimmed.match(sharpPatternSingle);
  if (match) {
    const note = match[1].toUpperCase();
    return note + '#';
  }
  
  return trimmed;
}

/**
 * Filter chords by query (case-insensitive, matches anywhere)
 */
function filterChords(chords, query) {
  if (!query) return chords;
  
  const normalizedQuery = normalizeQuery(query);
  const lowerQuery = normalizedQuery.toLowerCase();
  
  return chords.filter(chord => {
    const chordName = chord.name || chord;
    return chordName.toLowerCase().includes(lowerQuery);
  });
}

/**
 * Chord Variations Modal Component
 * Shows all chord variations (common + uncommon) with search capabilities
 */
export default function ChordVariationsModal({
  isOpen,
  onClose,
  onSelectChord,
  chords = [],
  initialQuery = '',
  instrument = 'ukulele',
  tuning = 'ukulele_standard',
  usedChordNames = [],
  personalChordNames = new Set()
}) {
  const [query, setQuery] = useState(initialQuery);
  const searchInputRef = useRef(null);
  
  // Reset query when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      // Focus search input after modal opens
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, initialQuery]);
  
  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  // Get all unique chord names from all variations
  const allChordNames = useMemo(() => {
    const names = new Set(chords.map(c => c.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [chords]);
  
  // Get variations for a chord name
  const getVariationsForName = useMemo(() => {
    return (chordName) => {
      return chords.filter(c => c.name === chordName);
    };
  }, [chords]);
  
  // Separate used and available chord names
  const usedNames = useMemo(() => {
    const usedSet = new Set(usedChordNames);
    return allChordNames.filter(name => usedSet.has(name));
  }, [allChordNames, usedChordNames]);
  
  const availableNames = useMemo(() => {
    const usedSet = new Set(usedChordNames);
    return allChordNames.filter(name => !usedSet.has(name));
  }, [allChordNames, usedChordNames]);
  
  // Filter chord names based on query
  const usedFilteredNames = useMemo(() => {
    return filterChords(usedNames.map(name => ({ name })), query).map(c => c.name);
  }, [usedNames, query]);
  
  const availableFilteredNames = useMemo(() => {
    return filterChords(availableNames.map(name => ({ name })), query).map(c => c.name);
  }, [availableNames, query]);
  
  // Expand filtered names into chord entries (one per variation)
  const usedFiltered = useMemo(() => {
    return usedFilteredNames.flatMap(chordName => {
      const variations = getVariationsForName(chordName);
      return variations.length > 0 ? variations : [{ name: chordName, frets: null }];
    });
  }, [usedFilteredNames, getVariationsForName]);
  
  const availableFiltered = useMemo(() => {
    return availableFilteredNames.flatMap(chordName => {
      const variations = getVariationsForName(chordName);
      return variations.length > 0 ? variations : [{ name: chordName, frets: null }];
    });
  }, [availableFilteredNames, getVariationsForName]);
  
  const handleChordClick = (chordName, chordPosition = null) => {
    onSelectChord(chordName, chordPosition);
    onClose();
  };
  
  if (!isOpen) return null;
  
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold">All Chord Variations</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        
        {/* Search Input */}
        <div className="p-4 border-b border-gray-200">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chords..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            autoFocus
          />
          {query && normalizeQuery(query) !== query.trim() && (
            <div className="mt-1 text-xs text-gray-500">
              Searching: "{query}" → {normalizeQuery(query)}
            </div>
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {usedFiltered.length === 0 && availableFiltered.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No chords found
            </div>
          ) : (
            <>
              {usedFiltered.length > 0 && (
                <>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 sticky top-0">
                    Used in song
                  </div>
                  {usedFiltered.map((chordObj, index) => {
                    const chordName = chordObj.name || chordObj;
                    const chordFrets = chordObj.frets;
                    const isPersonal = chordObj.source === 'personal' || personalChordNames.has(chordName);
                    
                    return (
                      <button
                        key={`used-${chordName}-${chordFrets || 'no-frets'}-${index}`}
                        type="button"
                        onClick={() => handleChordClick(chordName, chordObj.position)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3"
                      >
                        {chordFrets && (
                          <div className="flex-shrink-0">
                            <ChordDiagram
                              frets={chordFrets}
                              baseFret={chordObj.baseFret}
                              chordName=""
                              instrument={instrument}
                              tuning={tuning}
                            />
                          </div>
                        )}
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <span className="font-medium">{chordName}</span>
                          {chordObj.position > 1 && (
                            <span className="inline-flex items-center justify-center rounded-full bg-gray-900 text-white text-xs font-medium leading-[1em] min-w-[1em] px-1">
                              {chordObj.position}
                            </span>
                          )}
                          {isPersonal && (
                            <span className="text-xs text-yellow-600 flex-shrink-0" title="Personal library">
                              ⭐
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
              
              {availableFiltered.length > 0 && (
                <>
                  {usedFiltered.length > 0 && (
                    <div className="border-t border-gray-200"></div>
                  )}
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 sticky top-0">
                    Available chords
                  </div>
                  {availableFiltered.map((chordObj, index) => {
                    const chordName = chordObj.name || chordObj;
                    const chordFrets = chordObj.frets;
                    const isPersonal = chordObj.source === 'personal';
                    
                    return (
                      <button
                        key={`available-${chordName}-${chordFrets || 'no-frets'}-${index}-${chordObj.source || 'unknown'}`}
                        type="button"
                        onClick={() => handleChordClick(chordName, chordObj.position)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3"
                      >
                        {chordFrets && (
                          <div className="flex-shrink-0">
                            <ChordDiagram
                              frets={chordFrets}
                              baseFret={chordObj.baseFret}
                              chordName=""
                              instrument={instrument}
                              tuning={tuning}
                            />
                          </div>
                        )}
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <span className="font-medium">{chordName}</span>
                          {chordObj.position > 1 && (
                            <span className="inline-flex items-center justify-center rounded-full bg-gray-900 text-white text-xs font-medium leading-[1em] min-w-[1em] px-1">
                              {chordObj.position}
                            </span>
                          )}
                          {isPersonal && (
                            <span className="text-xs text-yellow-600 flex-shrink-0" title="Personal library">
                              ⭐
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
