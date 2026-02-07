import { useRef, useEffect, useState } from 'react';
import { findChord } from '../utils/chord-library';
import { useChordAutocomplete } from '../hooks/useChordAutocomplete';
import { normalizeQuery } from '../utils/chord-autocomplete-helpers';
import { getDisplayChordName } from '../utils/enharmonic';
import ChordInsertionModal from './ChordInsertionModal';
import CustomChordModal from './CustomChordModal';
import { createPersonalChord } from '../db/mutations';

export default function ChordAutocomplete({ 
  value, 
  onChange, 
  placeholder, 
  className, 
  rows, 
  required,
  instrument = 'ukulele',
  tuning = 'ukulele_standard',
  userId = null
}) {
  const textareaRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const insertPositionRef = useRef(0);

  // Use shared autocomplete hook
  const {
    showDropdown,
    setShowDropdown,
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    showCustomChordModal,
    setShowCustomChordModal,
    selectedPositions,
    setSelectedPositions,
    dbChords,
    personalChordNames,
    usedChordNames,
    getChordData,
    filteredElements,
    usedFiltered,
    libraryFiltered,
    libraryFilteredCommon,
    libraryFilteredAllForDisplay,
    handleChordPositionSelect,
  } = useChordAutocomplete({ value, instrument, tuning, userId });

  // Handle modal close
  const handleModalClose = () => {
    setShowDropdown(false);
    setQuery('');
    // Restore focus to textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  // Handle insert action from modal
  const handleModalInsert = () => {
    const createCustomIndex = filteredElements.length + usedFiltered.length + libraryFiltered.length;
    
    if (selectedIndex === createCustomIndex) {
      // "Create custom chord" is selected
      setShowCustomChordModal(true);
      setShowDropdown(false);
    } else {
      // Chord selected - use display name (e.g. F#m7) not DB name (e.g. Gbm7) when user searched sharp
      const chordIndex = selectedIndex - filteredElements.length;
      const allFiltered = [...usedFiltered, ...libraryFiltered];
      if (allFiltered[chordIndex]) {
        const selectedChord = allFiltered[chordIndex];
        const dbName = selectedChord.name || selectedChord;
        const displayName = selectedChord.displayName ?? getDisplayChordName(dbName, query, normalizeQuery);
        const chordPosition = selectedChord.position;
        const chordId = selectedChord.id || null;
        if (chordPosition) {
          handleChordPositionSelect(displayName, chordPosition);
        }
        insertChord(displayName, chordPosition || null, chordId);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (showDropdown) {
      // Modal is open - keyboard navigation is handled by the modal component
      // We don't need to handle anything here
    } else if (e.key === '/') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        // CRITICAL: Read cursor position IMMEDIATELY, before any state updates or focus changes
        const cursorStart = textarea.selectionStart;
        const cursorEnd = textarea.selectionEnd;
        const cursorPos = Math.min(cursorStart, cursorEnd);
        
        // Store immediately - this must happen synchronously
        insertPositionRef.current = cursorPos;
        
        // Debug logging
        const text = textarea.value || '';
        console.log('[ChordAutocomplete] / pressed - captured position:', cursorPos, 'text length:', text.length,
          'text around pos:', JSON.stringify(text.substring(Math.max(0, cursorPos - 3), Math.min(text.length, cursorPos + 3))));
        
        // Now update UI state
        setQuery('');
        setSelectedIndex(0);
        setShowDropdown(true);
      }
    }
  };

  const handleChange = (e) => {
    onChange(e);
    
    // Note: For modal, we don't need to check cursor movement
    // The modal stays open until user explicitly closes it or inserts
  };

  const insertChord = (chordName, explicitPosition = null, explicitChordId = null) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Use current textarea value instead of potentially stale prop value
    // This ensures we're using the actual current text when inserting, matching the cursor position that was captured
    const text = textarea.value || '';
    let insertPos = insertPositionRef.current;
    
    // CRITICAL FIX: Always prefer current cursor position if textarea has focus
    // The stored position might be stale or incorrect, especially if text changed
    if (document.activeElement === textarea) {
      const currentPos = textarea.selectionStart;
      // Use current position if it's different from stored (stored might be wrong)
      // Only trust stored position if current position is at 0 (might be after modal opened)
      if (currentPos > 0 || insertPos === 0) {
        console.log('[ChordAutocomplete] insertChord - using current cursor position. stored:', insertPos, 'current:', currentPos);
        insertPos = currentPos;
      }
    }
    
    // Clamp to valid range
    const validPos = Math.max(0, Math.min(insertPos, text.length));
    
    // Debug logging
    console.log('[ChordAutocomplete] insertChord - final position:', validPos, 'text length:', text.length, 
      'text around pos:', JSON.stringify(text.substring(Math.max(0, validPos - 3), Math.min(text.length, validPos + 3))));
    
    const before = text.substring(0, validPos);
    const after = text.substring(validPos);

    // Get characters around insertion point to determine spacing
    const charBefore = before.length > 0 ? before[before.length - 1] : null;
    const charAfter = after.length > 0 ? after[0] : null;
    
    // Check if we're within a word (both sides are alphanumeric)
    const isAlphanumeric = (char) => char && /[a-zA-Z0-9]/.test(char);
    const isWithinWord = isAlphanumeric(charBefore) && isAlphanumeric(charAfter);
    
    // Determine spacing
    let spaceBefore = '';
    let spaceAfter = '';
    
    if (!isWithinWord) {
      // At word boundary - add spaces if needed
      // Add space before if: previous char is alphanumeric (inserting after a word)
      // This means we're inserting after a word, so add space before chord
      if (isAlphanumeric(charBefore)) {
        spaceBefore = ' ';
      }
      // Add space after if: next char is alphanumeric (inserting before a word)
      // This means we're inserting before a word, so add space after chord
      if (isAlphanumeric(charAfter)) {
        spaceAfter = ' ';
      }
    }
    // If within word, no spaces are added (both remain empty)

    // Get the selected position for this chord
    // Priority: explicitPosition (passed directly) > storedPosition > chordData position > default 1
    const storedPosition = selectedPositions.get(chordName);
    const chordData = getChordData(chordName);
    let chordPosition = explicitPosition !== null ? explicitPosition : (storedPosition || chordData?.position || 1);
    
    // Get chordId: explicitChordId > chordData.id > null
    const chordId = explicitChordId || chordData?.id || null;
    
    // Ensure position is stored
    if (chordPosition && chordPosition > 1) {
      setSelectedPositions(prev => {
        const newMap = new Map(prev);
        newMap.set(chordName, chordPosition);
        return newMap;
      });
    }

    // Format chord with position suffix if position > 1: [C:2], otherwise just [C]
    // Include chordId in format if available: [C:2:abc123] or [C::abc123]
    // This allows the ID to be parsed and stored when saving, but we keep text readable
    let chordText = chordPosition > 1 ? `${chordName}:${chordPosition}` : chordName;
    if (chordId) {
      // Include ID in format: [C:2:abc123] or [C::abc123] (if position is 1)
      chordText = chordPosition > 1 ? `${chordName}:${chordPosition}:${chordId}` : `${chordName}::${chordId}`;
    }
    const newText = before + spaceBefore + `[${chordText}]` + spaceAfter + after;
    onChange({ target: { value: newText } });

    // Set cursor position after inserted chord (account for added spaces)
    setTimeout(() => {
      const newCursorPos = validPos + spaceBefore.length + chordText.length + 2 + spaceAfter.length; // +2 for "["
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);

    setShowDropdown(false);
    setQuery('');
  };

  const handleChordClick = (chordName, chordPosition = null, chordId = null) => {
    // If position is provided, use it; otherwise get from chord data
    if (chordPosition !== null && chordPosition !== undefined) {
      // Store the position for this chord
      handleChordPositionSelect(chordName, chordPosition);
      // Pass position and ID directly to insertChord to avoid state timing issues
      insertChord(chordName, chordPosition, chordId);
    } else {
      insertChord(chordName, null, chordId);
    }
  };

  const insertElement = (elementType) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Get text directly from textarea.value to ensure we have the most current value
    // This is more reliable than using the value prop which might be stale
    const text = textarea.value || '';
    let insertPos = insertPositionRef.current;
    
    // Debug: log what we're about to insert
    console.log('[ChordAutocomplete] insertElement - stored insertPos:', insertPos, 'text.length:', text.length, 
      'textarea.value.length:', textarea.value?.length, 'value prop length:', (value || '').length,
      'elementType:', elementType);
    
    // IMPORTANT: If the stored position is at the end of text, this might be wrong for empty lines
    // Try to verify by checking if we're actually at the end of a line
    // If textarea still has focus, we can also try reading the current position
    if (insertPos >= text.length && text.length > 0) {
      console.warn('[ChordAutocomplete] insertElement - WARNING: stored position is at end of text, this might be wrong!');
      // If textarea has focus, try reading current position as fallback
      if (document.activeElement === textarea) {
        const currentPos = textarea.selectionStart;
        console.log('[ChordAutocomplete] insertElement - textarea has focus, current selectionStart:', currentPos);
        // Only use current position if it's significantly different and makes more sense
        if (currentPos < text.length && currentPos !== insertPos) {
          console.log('[ChordAutocomplete] insertElement - using current position instead of stored');
          insertPos = currentPos;
        }
      }
    }
    
    // Clamp to valid range
    const validPos = Math.max(0, Math.min(insertPos, text.length));
    
    console.log('[ChordAutocomplete] insertElement - final validPos:', validPos, 
      'text around pos:', JSON.stringify(text.substring(Math.max(0, validPos - 5), Math.min(text.length, validPos + 5))));
    
    const before = text.substring(0, validPos);
    const after = text.substring(validPos);
    
    // Check if we're at the start of a line (or empty line)
    const isAtLineStart = before === '' || before.endsWith('\n');
    const isAtLineEnd = after === '' || after.startsWith('\n');
    
    // Determine what to insert
    let marker = '';
    if (elementType === 'heading') {
      marker = '{heading:}';
    } else if (elementType === 'instruction') {
      marker = '{instruction:}';
    }
    
    // Add newline before if not at start and not already on new line
    let newlineBefore = '';
    if (!isAtLineStart && !before.endsWith('\n')) {
      newlineBefore = '\n';
    }
    
    // Add newline after if not at end
    let newlineAfter = '';
    if (!isAtLineEnd && !after.startsWith('\n')) {
      newlineAfter = '\n';
    }
    
    const newText = before + newlineBefore + marker + newlineAfter + after;
    onChange({ target: { value: newText } });
    
    // Set cursor position inside the marker (after the colon)
    setTimeout(() => {
      const newCursorPos = validPos + newlineBefore.length + marker.length - 1; // -1 to position before closing brace
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);
    
    setShowDropdown(false);
    setQuery('');
  };

  // Handle custom chord save
  const handleCustomChordSave = async (chordData) => {
    try {
      // Always save to personal library - requires userId
      if (!userId) {
        alert('You must be logged in to save custom chords.');
        return;
      }
      await createPersonalChord(chordData, userId);
      
      // Insert chord name into song
      insertChord(chordData.name);
      setShowCustomChordModal(false);
    } catch (error) {
      console.error('Error saving custom chord:', error);
      console.error('Error details:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
      });
      alert(`Error saving chord: ${error?.message || 'Unknown error'}. Please try again.`);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        rows={rows}
        required={required}
      />
      
      {/* Chord Insertion Modal */}
      <ChordInsertionModal
        isOpen={showDropdown}
        query={query}
        setQuery={setQuery}
        selectedIndex={selectedIndex}
        setSelectedIndex={setSelectedIndex}
        filteredElements={filteredElements}
        usedFiltered={usedFiltered}
        libraryFiltered={libraryFiltered}
        libraryFilteredCommon={libraryFilteredCommon}
        libraryFilteredAllForDisplay={libraryFilteredAllForDisplay}
        personalChordNames={personalChordNames}
        instrument={instrument}
        tuning={tuning}
        onSelectElement={insertElement}
        onSelectChord={handleChordClick}
        onCreateCustom={() => {
          setShowCustomChordModal(true);
          setShowDropdown(false);
        }}
        onClose={handleModalClose}
        onInsert={handleModalInsert}
        modalRef={modalRef}
        searchInputRef={searchInputRef}
      />
      
      {/* Custom Chord Modal */}
      <CustomChordModal
        isOpen={showCustomChordModal}
        onClose={() => setShowCustomChordModal(false)}
        onSave={handleCustomChordSave}
        instrument={instrument}
        tuning={tuning}
        userId={userId}
        databaseChords={dbChords}
      />
    </div>
  );
}
