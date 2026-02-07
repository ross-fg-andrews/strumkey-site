import { useRef, useEffect, useState } from 'react';
import { useFixedStyleWithIOsKeyboard } from 'react-ios-keyboard-viewport';
import ChordDiagram from './ChordDiagram';
import { normalizeQuery, formatFretsForDisplay } from '../utils/chord-autocomplete-helpers';
import { getDisplayChordName } from '../utils/enharmonic';
import { formatChordNameForDisplay } from '../utils/chord-formatting';

const chordLabelClass = 'inline-flex items-center gap-1.5 px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm font-medium';

/** Max library chords to render until user clicks "Show more" (progressive rendering) */
const LIBRARY_RENDER_CAP = 50;

function formatPosition(position) {
  return `Position ${String(position || 1).padStart(2, '0')}`;
}

/**
 * Modal component for chord insertion
 * Converts the dropdown interface to a modal dialog for better mobile/tablet usability
 */
export default function ChordInsertionModal({
  isOpen,
  query,
  setQuery,
  selectedIndex,
  setSelectedIndex,
  filteredElements,
  usedFiltered,
  libraryFiltered,
  libraryFilteredCommon = [],
  libraryFilteredAllForDisplay = [],
  personalChordNames,
  instrument,
  tuning,
  onSelectElement,
  onSelectChord,
  onCreateCustom,
  onClose,
  onInsert,
  modalRef,
  searchInputRef,
}) {
  const { fixedCenter } = useFixedStyleWithIOsKeyboard();
  const [libraryExpanded, setLibraryExpanded] = useState(false);

  const hasMoreLibrary = libraryFilteredAllForDisplay.length > LIBRARY_RENDER_CAP;
  const displayedAllForDisplay = libraryExpanded
    ? libraryFilteredAllForDisplay
    : libraryFilteredAllForDisplay.slice(0, LIBRARY_RENDER_CAP);
  const displayedLibraryCount =
    filteredElements.length + usedFiltered.length + libraryFilteredCommon.length + displayedAllForDisplay.length;

  useEffect(() => {
    if (!isOpen) setLibraryExpanded(false);
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const selectedElement = modalRef.current.querySelector('[data-selected="true"]');
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, isOpen, modalRef]);

  // Handle keyboard navigation in modal (uses displayed count when list is capped)
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e) => {
      const totalItems = displayedLibraryCount + 1;
      const isSearchInputFocused = document.activeElement === searchInputRef.current;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < totalItems - 1 ? prev + 1 : prev
        );
        // Move focus away from search input when navigating
        if (isSearchInputFocused) {
          searchInputRef.current?.blur();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        // Move focus away from search input when navigating
        if (isSearchInputFocused) {
          searchInputRef.current?.blur();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onInsert();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, displayedLibraryCount, setSelectedIndex, onInsert, onClose, searchInputRef]);

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, searchInputRef]);

  if (!isOpen) return null;

  const createCustomIndex = displayedLibraryCount;

  // Handle search input keydown - the global handler takes care of navigation
  const handleSearchKeyDown = (e) => {
    // The global keyboard handler will take care of Arrow keys, Enter, and Escape
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    setQuery(e.target.value);
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      style={fixedCenter} // Override positioning when iOS keyboard is open
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl h-[80vh] w-full max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Insert chord"
      >
        {/* Search Input */}
        <div className="p-4 border-b border-gray-200">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search chords..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            autoFocus
          />
          {query && (
            <div className="mt-2 text-xs font-medium text-gray-700">
              Searching: "{query}"
              {normalizeQuery(query) !== query.trim() && (
                <span className="text-gray-500"> → {normalizeQuery(query)}</span>
              )}
            </div>
          )}
        </div>

        {/* Chord List - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredElements.length === 0 && usedFiltered.length === 0 && libraryFiltered.length === 0 ? (
            <div className="px-4 py-8 text-gray-500 text-sm text-center">
              No results found
            </div>
          ) : (
            <>
              {usedFiltered.length > 0 && (
                <>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 sticky top-0">
                    Used in song
                  </div>
                  {usedFiltered.map((chordObj, index) => {
                    const globalIndex = filteredElements.length + index;
                    const isSelected = globalIndex === selectedIndex;
                    const chordName = chordObj.name || chordObj;
                    const displayName = chordObj.displayName ?? getDisplayChordName(chordName, query, normalizeQuery);
                    const chordFrets = chordObj.frets;
                    const isPersonal = chordObj.source === 'personal' || personalChordNames.has(chordName);
                    
                    return (
                      <button
                        key={`used-${chordName}-${chordFrets || 'no-frets'}-${index}`}
                        type="button"
                        data-selected={isSelected}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectChord(displayName, chordObj.position, chordObj.id ?? null);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center justify-between gap-3 ${
                          isSelected ? 'bg-primary-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-0 min-w-0 flex-shrink">
                          {chordFrets && (
                            <div className="flex-shrink-0 flex items-center">
                              <ChordDiagram
                                frets={chordFrets}
                                baseFret={chordObj.baseFret}
                                chordName=""
                                instrument={instrument}
                                tuning={tuning}
                              />
                            </div>
                          )}
                          <span className={chordLabelClass}>{formatChordNameForDisplay(displayName)}</span>
                        </div>
                        <div className="flex flex-col items-end text-gray-600 text-sm font-normal flex-shrink-0">
                          <span>{formatFretsForDisplay(chordFrets, chordObj.baseFret)}</span>
                          <span className="text-gray-500">{formatPosition(chordObj.position)}</span>
                          {isPersonal && <span className="text-xs">Personal</span>}
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
              
              {libraryFiltered.length > 0 && (
                <>
                  {usedFiltered.length > 0 && (
                    <div className="border-t border-gray-200"></div>
                  )}
                  {libraryFilteredCommon.length > 0 && (
                    <>
                      <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 sticky top-0">
                        Common chords
                      </div>
                      {libraryFilteredCommon.map((chordObj, index) => {
                        const globalIndex = filteredElements.length + usedFiltered.length + index;
                        const isSelected = globalIndex === selectedIndex;
                        const chordName = chordObj.name || chordObj;
                        const displayName = chordObj.displayName ?? getDisplayChordName(chordName, query, normalizeQuery);
                        const chordFrets = chordObj.frets;
                        const isPersonal = chordObj.source === 'personal' || personalChordNames.has(chordName);
                        return (
                          <button
                            key={`common-${chordName}-${chordFrets || 'no-frets'}-${index}-${chordObj.source || 'unknown'}`}
                            type="button"
                            data-selected={isSelected}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSelectChord(displayName, chordObj.position, chordObj.id ?? null);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center justify-between gap-3 ${
                              isSelected ? 'bg-primary-50' : ''
                            }`}
                          >
                            <div className="flex items-center gap-0 min-w-0 flex-shrink">
                              {chordFrets && (
                                <div className="flex-shrink-0 flex items-center">
                                  <ChordDiagram
                                    frets={chordFrets}
                                    baseFret={chordObj.baseFret}
                                    chordName=""
                                    instrument={instrument}
                                    tuning={tuning}
                                  />
                                </div>
                              )}
                              <span className={chordLabelClass}>{formatChordNameForDisplay(displayName)}</span>
                            </div>
                            <div className="flex flex-col items-end text-gray-600 text-sm font-normal flex-shrink-0">
                              <span>{formatFretsForDisplay(chordFrets, chordObj.baseFret)}</span>
                              <span className="text-gray-500">{formatPosition(chordObj.position)}</span>
                              {isPersonal && <span className="text-xs">Personal</span>}
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                  {displayedAllForDisplay.length > 0 && (
                    <>
                      <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 sticky top-0">
                        All chords
                      </div>
                      {displayedAllForDisplay.map((chordObj, index) => {
                        const globalIndex = filteredElements.length + usedFiltered.length + libraryFilteredCommon.length + index;
                        const isSelected = globalIndex === selectedIndex;
                        const chordName = chordObj.name || chordObj;
                        const displayName = chordObj.displayName ?? getDisplayChordName(chordName, query, normalizeQuery);
                        const chordFrets = chordObj.frets;
                        const isPersonal = chordObj.source === 'personal' || personalChordNames.has(chordName);
                        return (
                          <button
                            key={`all-${chordName}-${chordFrets || 'no-frets'}-${index}-${chordObj.source || 'unknown'}`}
                            type="button"
                            data-selected={isSelected}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSelectChord(displayName, chordObj.position, chordObj.id ?? null);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center justify-between gap-3 ${
                              isSelected ? 'bg-primary-50' : ''
                            }`}
                          >
                            <div className="flex items-center gap-0 min-w-0 flex-shrink">
                              {chordFrets && (
                                <div className="flex-shrink-0 flex items-center">
                                  <ChordDiagram
                                    frets={chordFrets}
                                    baseFret={chordObj.baseFret}
                                    chordName=""
                                    instrument={instrument}
                                    tuning={tuning}
                                  />
                                </div>
                              )}
                              <span className={chordLabelClass}>{formatChordNameForDisplay(displayName)}</span>
                            </div>
                            <div className="flex flex-col items-end text-gray-600 text-sm font-normal flex-shrink-0">
                              <span>{formatFretsForDisplay(chordFrets, chordObj.baseFret)}</span>
                              <span className="text-gray-500">{formatPosition(chordObj.position)}</span>
                              {isPersonal && <span className="text-xs">Personal</span>}
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                  {hasMoreLibrary && (
                    <button
                      type="button"
                      onClick={() => setLibraryExpanded(true)}
                      className="w-full text-left px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 font-medium"
                    >
                      Show more ({libraryFilteredAllForDisplay.length - LIBRARY_RENDER_CAP} more)
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
        
        {/* Create custom chord option */}
        <div className="border-t border-gray-200 bg-white">
          <button
            type="button"
            data-selected={selectedIndex === createCustomIndex}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCreateCustom();
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
            style={{
              backgroundColor: selectedIndex === createCustomIndex
                ? '#eff6ff' 
                : 'transparent',
              color: selectedIndex === createCustomIndex
                ? '#1e40af' 
                : '#111827',
              fontWeight: selectedIndex === createCustomIndex
                ? '500' 
                : '400',
            }}
          >
            Create custom chord
          </button>
        </div>
      </div>
    </div>
  );
}
