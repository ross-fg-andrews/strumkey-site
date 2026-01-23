import { useRef, useEffect } from 'react';
import ChordDiagram from './ChordDiagram';
import { normalizeQuery } from '../utils/chord-autocomplete-helpers';
import { formatChordNameForDisplay } from '../utils/chord-formatting';

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
  personalChordNames,
  instrument,
  tuning,
  onSelectElement,
  onSelectChord,
  onShowVariations,
  onCreateCustom,
  onClose,
  onInsert,
  modalRef,
  searchInputRef,
}) {
  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const selectedElement = modalRef.current.querySelector('[data-selected="true"]');
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, isOpen, modalRef]);

  // Handle keyboard navigation in modal
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e) => {
      const totalItems = filteredElements.length + usedFiltered.length + libraryFiltered.length + 2;
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
  }, [isOpen, filteredElements.length, usedFiltered.length, libraryFiltered.length, setSelectedIndex, onInsert, onClose, searchInputRef]);

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, searchInputRef]);

  if (!isOpen) return null;

  const showMoreIndex = filteredElements.length + usedFiltered.length + libraryFiltered.length;
  const createCustomIndex = showMoreIndex + 1;

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
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-h-[80vh] w-full max-w-md flex flex-col"
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
              {filteredElements.length > 0 && (
                <>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 sticky top-0">
                    Elements
                  </div>
                  {filteredElements.map((element, index) => {
                    const isSelected = index === selectedIndex;
                    return (
                      <button
                        key={`element-${element.type}-${index}`}
                        type="button"
                        data-selected={isSelected}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectElement(element.type);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 ${
                          isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                        }`}
                      >
                        <span className="text-lg">{element.icon}</span>
                        <span className="font-medium">{element.label}</span>
                      </button>
                    );
                  })}
                  {(usedFiltered.length > 0 || libraryFiltered.length > 0) && (
                    <div className="border-t border-gray-200"></div>
                  )}
                </>
              )}
              {usedFiltered.length > 0 && (
                <>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 sticky top-0">
                    Used in song
                  </div>
                  {usedFiltered.map((chordObj, index) => {
                    const globalIndex = filteredElements.length + index;
                    const isSelected = globalIndex === selectedIndex;
                    const chordName = chordObj.name || chordObj;
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
                          onSelectChord(chordName, chordObj.position);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 ${
                          isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                        }`}
                      >
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
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <span className="font-medium">{formatChordNameForDisplay(chordName)}</span>
                          {chordObj.position > 1 && (
                            <span className={`inline-flex items-center justify-center rounded-full text-white text-xs font-medium leading-[1em] min-w-[1em] px-1 ${
                              isSelected ? 'bg-primary-700' : 'bg-gray-900'
                            }`}>
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
              
              {libraryFiltered.length > 0 && (
                <>
                  {(filteredElements.length > 0 || usedFiltered.length > 0) && (
                    <div className="border-t border-gray-200"></div>
                  )}
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 sticky top-0">
                    Available chords
                  </div>
                  {libraryFiltered.map((chordObj, index) => {
                    const globalIndex = filteredElements.length + usedFiltered.length + index;
                    const isSelected = globalIndex === selectedIndex;
                    const chordName = chordObj.name || chordObj;
                    const chordFrets = chordObj.frets;
                    const isPersonal = chordObj.source === 'personal';
                    
                    return (
                      <button
                        key={`library-${chordName}-${chordFrets || 'no-frets'}-${index}-${chordObj.source || 'unknown'}`}
                        type="button"
                        data-selected={isSelected}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectChord(chordName, chordObj.position);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 ${
                          isSelected ? 'bg-primary-50 text-primary-700 font-medium' : ''
                        }`}
                      >
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
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <span className="font-medium">{formatChordNameForDisplay(chordName)}</span>
                          {chordObj.position > 1 && (
                            <span className={`inline-flex items-center justify-center rounded-full text-white text-xs font-medium leading-[1em] min-w-[1em] px-1 ${
                              isSelected ? 'bg-primary-700' : 'bg-gray-900'
                            }`}>
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
        
        {/* Show more variations and Create custom chord options */}
        <div className="border-t border-gray-200 bg-white">
          <button
            type="button"
            data-selected={selectedIndex === showMoreIndex}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onShowVariations();
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors border-b border-gray-200"
            style={{
              backgroundColor: selectedIndex === showMoreIndex 
                ? '#eff6ff' 
                : 'transparent',
              color: selectedIndex === showMoreIndex 
                ? '#1e40af' 
                : '#111827',
              fontWeight: selectedIndex === showMoreIndex 
                ? '500' 
                : '400',
            }}
          >
            Show more variations
          </button>
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

        {/* Action Buttons */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onInsert();
            }}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}
