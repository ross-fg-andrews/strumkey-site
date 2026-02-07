import { useState, useEffect, useMemo, useRef } from 'react';
import { useMainLibraryChords } from '../db/queries';
import { updateChordPosition, updateChordPositions, createMainLibraryChord } from '../db/mutations';
import ChordDiagram from './ChordDiagram';
import AddVoicingModal from './AddVoicingModal';
import { formatFretsForDisplay } from '../utils/chord-autocomplete-helpers';

const KEYS = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];

export default function ChordVoicingManager() {
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedSuffix, setSelectedSuffix] = useState(''); // Default to empty string (major)
  const [lookupKey, setLookupKey] = useState(''); // Key used for actual query
  const [lookupSuffix, setLookupSuffix] = useState(''); // Suffix used for actual query
  const [newVoicings, setNewVoicings] = useState([]); // Temporary voicings not yet saved
  const [localVoicingOrder, setLocalVoicingOrder] = useState(null); // Local reordering (array of IDs)
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  
  // Track previous key+suffix to detect changes
  const prevChordRef = useRef({ key: '', suffix: '' });

  const instrument = 'ukulele';
  const tuning = 'ukulele_standard';

  // Query all main library chords (simple query like ChordsPage does)
  const { data: allChordsData } = useMainLibraryChords(instrument, tuning);
  const allChords = allChordsData?.chords || [];

  // Get unique suffixes for selected key (filter in JavaScript)
  const availableSuffixes = useMemo(() => {
    if (!selectedKey || selectedKey.trim() === '') return [];
    
    const chordsForKey = allChords.filter(c => c.key === selectedKey);
    const suffixSet = new Set();
    
    chordsForKey.forEach(chord => {
      // Normalize: treat empty string and 'major' as the same
      const suffix = chord.suffix || '';
      if (suffix === 'major') {
        suffixSet.add(''); // Use empty string for major chords
      } else if (suffix) {
        suffixSet.add(suffix);
      } else {
        suffixSet.add(''); // Empty suffix
      }
    });
    
    // Convert to sorted array
    const suffixes = Array.from(suffixSet).sort((a, b) => {
      // Sort empty/major first, then alphabetically
      if (!a || a === '') return -1;
      if (!b || b === '') return 1;
      return a.localeCompare(b);
    });
    
    return suffixes;
  }, [allChords, selectedKey]);

  // Get voicings for lookup key+suffix (filter in JavaScript)
  const dbVoicings = useMemo(() => {
    if (!lookupKey || lookupSuffix === undefined || lookupSuffix === null) return [];
    
    return allChords.filter(chord => {
      if (chord.key !== lookupKey) return false;
      
      // Normalize suffix matching
      const chordSuffix = chord.suffix || '';
      const normalizedChordSuffix = chordSuffix === 'major' ? '' : chordSuffix;
      const normalizedQuerySuffix = lookupSuffix === 'major' ? '' : (lookupSuffix || '');
      
      return normalizedChordSuffix === normalizedQuerySuffix;
    }).sort((a, b) => (a.position || 0) - (b.position || 0));
  }, [allChords, lookupKey, lookupSuffix]);

  // Reset unsaved changes when lookup key or suffix changes
  useEffect(() => {
    const currentChord = { key: lookupKey, suffix: lookupSuffix };
    const prevChord = prevChordRef.current;
    
    // If chord changed, discard local changes for the previous chord
    if (prevChord.key !== currentChord.key || prevChord.suffix !== currentChord.suffix) {
      // Filter out new voicings that don't match current key+suffix
      setNewVoicings(prev => prev.filter(v => 
        v.key === currentChord.key && v.suffix === currentChord.suffix
      ));
      setLocalVoicingOrder(null);
      setSaveMessage('');
    }
    
    prevChordRef.current = currentChord;
  }, [lookupKey, lookupSuffix]);

  // Filter new voicings for current chord
  const matchingNewVoicings = useMemo(() => {
    if (!lookupKey || lookupSuffix === undefined || lookupSuffix === null) return [];
    return newVoicings.filter(v => 
      v.key === lookupKey && v.suffix === lookupSuffix
    );
  }, [newVoicings, lookupKey, lookupSuffix]);

  // Clear stale local ordering when database voicings change
  useEffect(() => {
    if (localVoicingOrder && localVoicingOrder.length > 0 && selectedKey && selectedSuffix) {
      const sortedDbVoicings = [...dbVoicings].sort((a, b) => (a.position || 0) - (b.position || 0));
      const combined = [...sortedDbVoicings, ...matchingNewVoicings];
      const combinedIds = new Set(combined.map(v => v.id));
      
      // Check if all IDs in order exist in combined, and lengths match
      const allIdsMatch = localVoicingOrder.every(id => combinedIds.has(id)) &&
                         localVoicingOrder.length === combined.length;
      
      if (!allIdsMatch) {
        // Order is stale (database changed), clear it
        setLocalVoicingOrder(null);
      }
    }
  }, [dbVoicings, matchingNewVoicings, localVoicingOrder, selectedKey, selectedSuffix]);

  // Combine and sort voicings
  const voicings = useMemo(() => {
    if (!lookupKey || lookupSuffix === undefined || lookupSuffix === null) return [];
    
    // Sort database voicings by position
    const sortedDbVoicings = [...dbVoicings].sort((a, b) => (a.position || 0) - (b.position || 0));
    
    // Combine: existing DB voicings + new unsaved voicings
    const combined = [...sortedDbVoicings, ...matchingNewVoicings];
    
    // Apply local reordering if it exists and matches current voicings
    if (localVoicingOrder && localVoicingOrder.length > 0) {
      const combinedIds = new Set(combined.map(v => v.id));
      
      // Check if all IDs in order exist in combined, and lengths match
      const allIdsMatch = localVoicingOrder.every(id => combinedIds.has(id)) &&
                         localVoicingOrder.length === combined.length;
      
      if (allIdsMatch) {
        const ordered = localVoicingOrder.map(id => 
          combined.find(v => v.id === id)
        ).filter(Boolean);
        return ordered;
      }
    }
    
    return combined;
  }, [dbVoicings, matchingNewVoicings, localVoicingOrder, lookupKey, lookupSuffix]);

  // Compute hasUnsavedChanges
  const hasUnsavedChanges = useMemo(() => {
    return matchingNewVoicings.length > 0 || localVoicingOrder !== null;
  }, [matchingNewVoicings.length, localVoicingOrder]);

  // Get chord name for display
  const chordName = useMemo(() => {
    if (!lookupKey) return '';
    if (!lookupSuffix || lookupSuffix === 'major' || lookupSuffix === '') {
      return lookupKey;
    }
    return `${lookupKey}${lookupSuffix}`;
  }, [lookupKey, lookupSuffix]);

  // Handle key selection
  const handleKeyChange = (key) => {
    setSelectedKey(key);
    // Default suffix to empty string (major) when key changes
    setSelectedSuffix('');
  };

  // Handle suffix selection
  const handleSuffixChange = (suffix) => {
    setSelectedSuffix(suffix);
  };

  // Handle lookup button click
  const handleLookup = () => {
    if (!selectedKey) {
      setSaveMessage('Please select a key');
      return;
    }
    // Use empty string as default suffix if none selected (represents major chords)
    const suffixToUse = selectedSuffix || '';
    setLookupKey(selectedKey);
    setLookupSuffix(suffixToUse);
    setSaveMessage('');
  };

  // Handle adding new voicing
  const handleAddVoicing = (chordData) => {
    const newVoicing = {
      ...chordData,
      position: 1, // Will be set when saving based on list order
      id: `temp-${Date.now()}-${Math.random()}`, // Temporary ID for new voicings
    };
    
    setNewVoicings(prev => [...prev, newVoicing]);
    setSaveMessage('');
  };

  // Check if lookup button should be enabled
  const canLookup = selectedKey && selectedKey.trim() !== '';

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    // Store the new order as array of IDs
    const newOrder = [...voicings];
    const draggedVoicing = newOrder[draggedIndex];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, draggedVoicing);
    
    setLocalVoicingOrder(newOrder.map(v => v.id));
    setSaveMessage('');
    setDraggedIndex(null);
  };

  // Handle save
  const handleSave = async () => {
    if (!hasUnsavedChanges || !lookupKey || lookupSuffix === undefined || lookupSuffix === null) {
      return;
    }

    setSaving(true);
    setSaveMessage('');

    try {
      const updates = [];
      const chordsToCreate = [];

      // Process voicings in current order
      for (let i = 0; i < voicings.length; i++) {
        const voicing = voicings[i];
        const newPosition = i + 1;

        // Check if this is a new voicing (temporary ID)
        if (voicing.id && voicing.id.startsWith('temp-')) {
          // Create new chord in database
          chordsToCreate.push({
            ...voicing,
            position: newPosition,
          });
        } else if (voicing.id) {
          // Update existing chord position
          // Only update if position actually changed and chord is from main library
          // (dbVoicings are already filtered to main library, but double-check for safety)
          const isMainLibrary = !voicing.libraryType || voicing.libraryType === 'main';
          if (isMainLibrary && voicing.position !== newPosition) {
            updates.push({
              chordId: voicing.id,
              position: newPosition,
              libraryType: voicing.libraryType || 'main', // Include libraryType for permission check
            });
          }
        }
      }

      // Create new chords first
      if (chordsToCreate.length > 0) {
        await Promise.all(
          chordsToCreate.map(chordData => createMainLibraryChord(chordData))
        );
      }

      // Update positions - do this one at a time to identify which one fails
      if (updates.length > 0) {
        for (const update of updates) {
          try {
            await updateChordPosition(update.chordId, update.position, update.libraryType);
          } catch (error) {
            console.error(`Error updating chord ${update.chordId} to position ${update.position}:`, error);
            // Continue with other updates even if one fails
          }
        }
      }

      // Clear new voicings for this chord
      setNewVoicings(prev => prev.filter(v => 
        !(v.key === lookupKey && v.suffix === lookupSuffix)
      ));
      setLocalVoicingOrder(null);
      setSaveMessage('Changes saved successfully!');
      
      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving chord voicings:', error);
      setSaveMessage('Error saving changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Chord Selector */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-4">Select Chord</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Key
            </label>
            <select
              value={selectedKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              className="input"
            >
              <option value="">Select key...</option>
              {KEYS.map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Suffix
            </label>
            <select
              value={selectedSuffix}
              onChange={(e) => handleSuffixChange(e.target.value)}
              disabled={!selectedKey || availableSuffixes.length === 0}
              className="input"
            >
              <option value="">major (default)</option>
              {availableSuffixes.filter(s => s !== '').map(suffix => (
                <option key={suffix} value={suffix}>
                  {suffix}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={handleLookup}
            disabled={!canLookup}
            className={`btn ${
              canLookup ? 'btn-primary' : 'btn-disabled'
            }`}
          >
            Lookup
          </button>
          {lookupKey && (
            <p className="text-lg font-medium text-gray-900">
              Viewing: <span className="text-primary-600">{chordName}</span>
            </p>
          )}
        </div>
      </div>

      {/* Voicing List */}
      {lookupKey && lookupSuffix !== undefined && lookupSuffix !== null && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Voicings</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary"
            >
              Add new voicing
            </button>
          </div>

          {voicings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No voicings found. Click 'Add new voicing' to create one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {voicings.map((voicing, index) => (
                <div
                  key={voicing.id || `voicing-${index}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`flex items-center gap-4 p-4 border rounded transition-colors ${
                    draggedIndex === index ? 'opacity-50' : ''
                  } ${
                    dragOverIndex === index 
                      ? 'border-primary-500 bg-primary-50' 
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="cursor-move text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                  </div>
                  <div className="text-sm text-gray-500 min-w-[3rem]">
                    Position {index + 1}
                  </div>
                  <div className="text-sm font-mono text-gray-700 min-w-[4rem]">
                    {formatFretsForDisplay(voicing.frets, voicing.baseFret)}
                  </div>
                  <div className="flex-shrink-0">
                    <ChordDiagram
                      frets={voicing.frets}
                      chordName=""
                      instrument={instrument}
                      tuning={tuning}
                      baseFret={voicing.baseFret}
                      position={voicing.position}
                    />
                  </div>
                  {voicing.id && voicing.id.startsWith('temp-') && (
                    <span className="text-xs text-gray-500 italic">(new, not saved)</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Save Button */}
          <div className="mt-6 flex items-center justify-between">
            <div>
              {saveMessage && (
                <p className={`text-sm ${
                  saveMessage.includes('Error') 
                    ? 'text-red-600' 
                    : 'text-green-600'
                }`}>
                  {saveMessage}
                </p>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || saving}
              className={`btn ${
                hasUnsavedChanges && !saving
                  ? 'btn-primary'
                  : 'btn-disabled'
              }`}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* Add Voicing Modal */}
      {showAddModal && lookupKey && lookupSuffix !== undefined && lookupSuffix !== null && (
        <AddVoicingModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddVoicing}
          chordKey={lookupKey}
          chordSuffix={lookupSuffix}
          instrument={instrument}
          tuning={tuning}
        />
      )}
    </div>
  );
}
