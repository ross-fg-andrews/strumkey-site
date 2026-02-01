import { useRef, useEffect } from 'react';
import ChordDiagram from './ChordDiagram';
import { normalizeQuery } from '../utils/chord-autocomplete-helpers';
import { formatChordNameForDisplay } from '../utils/chord-formatting';

/**
 * Shared dropdown component for chord autocomplete
 */
export default function ChordAutocompleteDropdown({
  isOpen,
  position,
  query,
  selectedIndex,
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
  dropdownRef,
}) {
  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const selectedElement = dropdownRef.current.querySelector('[data-selected="true"]');
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, isOpen, dropdownRef]);

  if (!isOpen) return null;

  const showMoreIndex = filteredElements.length + usedFiltered.length + libraryFiltered.length;
  const createCustomIndex = showMoreIndex + 1;

  return (
    <div
      ref={dropdownRef}
      style={position}
      className="bg-white border border-gray-300 rounded-lg shadow-lg max-h-[450px] overflow-y-auto flex flex-col min-w-[280px]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex-1 overflow-y-auto">
        {query && (
          <div className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-50 border-b border-gray-200 sticky top-0">
            Searching: "{query}"
            {normalizeQuery(query) !== query.trim() && (
              <span className="text-gray-500"> → {normalizeQuery(query)}</span>
            )}
          </div>
        )}
        {filteredElements.length === 0 && usedFiltered.length === 0 && libraryFiltered.length === 0 ? (
          <div className="px-4 py-2 text-gray-500 text-sm">
            No results found
          </div>
        ) : (
          <>
            {usedFiltered.length > 0 && (
              <>
                <div className={`px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 ${query ? '' : 'sticky top-0'}`}>
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
                      className={`w-full text-left px-3 py-1 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 ${
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
                {usedFiltered.length > 0 && (
                  <div className="border-t border-gray-200"></div>
                )}
                <div className={`px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 ${query ? '' : 'sticky top-0'}`}>
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
                      className={`w-full text-left px-3 py-1 text-sm hover:bg-gray-100 transition-colors flex items-center gap-3 ${
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
      
      {/* Show more variations and Create custom chord options - ALWAYS show at bottom, sticky */}
      <div className="border-t border-gray-200 bg-white sticky bottom-0">
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
    </div>
  );
}
