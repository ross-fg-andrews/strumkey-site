import { useState, useEffect, useRef } from 'react';
import ChordDiagram from './ChordDiagram';
import { suggestChordNames } from '../utils/chord-detection';

/**
 * Custom Chord Modal Component
 * Allows users to create custom chords by entering frets and selecting/entering a name
 */
export default function CustomChordModal({ 
  isOpen, 
  onClose, 
  onSave, 
  instrument = 'ukulele',
  tuning = 'ukulele_standard',
  userId,
  databaseChords = []
}) {
  const [fretInputs, setFretInputs] = useState(['0', '0', '0', '0']);
  const [suggestedNames, setSuggestedNames] = useState([]);
  const [chordName, setChordName] = useState('');
  const [errors, setErrors] = useState({});
  
  const firstInputRef = useRef(null);
  const nameInputRef = useRef(null);

  // Get string labels for the instrument/tuning
  const stringLabels = tuning === 'ukulele_standard' 
    ? ['G', 'C', 'E', 'A'] 
    : tuning === 'ukulele_baritone'
    ? ['D', 'G', 'B', 'E']
    : ['G', 'C', 'E', 'A'];

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFretInputs(['0', '0', '0', '0']);
      setSuggestedNames([]);
      setChordName('');
      setErrors({});
      // Focus first input after a brief delay
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Suggest chord names when frets change
  useEffect(() => {
    if (!isOpen) return;
    
    const fretsString = getFretsString();
    const isValid = validateFrets();
    
    if (isValid && fretsString.length === 4) {
      const suggested = suggestChordNames(fretsString, instrument, tuning, { databaseChords });
      setSuggestedNames(suggested);
      
      // Auto-fill first suggested name if available and name is empty
      // Only auto-fill if the name hasn't been manually edited
      setChordName(prevName => {
        if (suggested.length > 0 && !prevName.trim()) {
          return suggested[0];
        }
        return prevName;
      });
    } else {
      setSuggestedNames([]);
    }
  }, [fretInputs, instrument, tuning, isOpen]);

  // Validate fret inputs
  const validateFrets = () => {
    const newErrors = {};
    let hasUnmuted = false;
    
    fretInputs.forEach((fret, index) => {
      const normalized = fret.toLowerCase().trim();
      
      if (normalized === '' || normalized === 'x') {
        if (normalized === 'x') {
          // Muted string is valid
        }
      } else {
        const num = parseInt(normalized, 10);
        if (isNaN(num) || num < 0 || num > 12) {
          newErrors[`fret${index}`] = 'Frets must be 0-12 or x';
        } else {
          hasUnmuted = true;
        }
      }
    });
    
    if (!hasUnmuted && fretInputs.some(f => f.toLowerCase().trim() !== 'x' && f.trim() !== '')) {
      // Check if at least one string is unmuted
      const hasValidUnmuted = fretInputs.some(f => {
        const normalized = f.toLowerCase().trim();
        return normalized !== '' && normalized !== 'x' && !isNaN(parseInt(normalized, 10));
      });
      if (!hasValidUnmuted) {
        newErrors.general = 'At least one string must be unmuted';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle fret input change
  const handleFretChange = (index, value) => {
    const newInputs = [...fretInputs];
    // Normalize input: allow x/X, 0-12, or empty
    const normalized = value.toLowerCase();
    
    // Allow empty string for backspace, or valid characters
    if (value === '' || normalized === 'x' || /^[0-9]$/.test(value) || /^1[0-2]$/.test(value)) {
      newInputs[index] = value;
      setFretInputs(newInputs);
    }
  };

  // Handle fret input blur - normalize the value
  const handleFretBlur = (index) => {
    const newInputs = [...fretInputs];
    const value = newInputs[index].toLowerCase().trim();
    
    // Normalize: empty becomes '0', 'x' stays 'x', numbers stay as is
    if (value === '') {
      newInputs[index] = '0';
    } else if (value === 'x') {
      newInputs[index] = 'x';
    } else {
      const num = parseInt(value, 10);
      if (!isNaN(num) && num >= 0 && num <= 12) {
        newInputs[index] = num.toString();
      } else {
        newInputs[index] = '0';
      }
    }
    
    setFretInputs(newInputs);
    validateFrets();
  };

  // Get frets string for display
  const getFretsString = () => {
    return fretInputs.map(f => {
      const normalized = f.toLowerCase().trim();
      if (normalized === '' || normalized === 'x') {
        return normalized === 'x' ? 'x' : '0';
      }
      return normalized;
    }).join('');
  };

  // Extract key and suffix from chord name
  // Examples: "C" -> {key: "C", suffix: "custom"}, "Cmaj7" -> {key: "C", suffix: "maj7"}
  const extractKeyAndSuffix = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return { key: trimmed, suffix: 'custom' };
    
    // Match pattern: letter(s) for key, then optional suffix
    // Handle sharps/flats: A#, Bb, etc.
    const match = trimmed.match(/^([A-G][#b]?)(.*)$/i);
    if (match) {
      const key = match[1].toUpperCase();
      const suffix = match[2] || 'custom';
      return { key, suffix };
    }
    
    // Fallback: use whole name as key, "custom" as suffix
    return { key: trimmed, suffix: 'custom' };
  };

  // Convert frets string to array format
  const convertFretsToArray = (fretsString) => {
    return fretsString.split('').map(f => {
      const lower = f.toLowerCase();
      if (lower === 'x') return null; // muted strings as null
      const num = parseInt(f, 10);
      return isNaN(num) ? null : num;
    });
  };

  // Handle save
  const handleSave = () => {
    if (!validateFrets()) {
      return;
    }
    
    const fretsString = getFretsString();
    
    // Check if all strings are muted
    if (fretsString.split('').every(f => f === 'x')) {
      setErrors({ general: 'At least one string must be unmuted' });
      return;
    }
    
    // Validate chord name
    if (!chordName.trim()) {
      setErrors({ chordName: 'Please enter a chord name' });
      nameInputRef.current?.focus();
      return;
    }
    
    // Convert frets to array format
    const fretsArray = convertFretsToArray(fretsString);
    
    // Extract key and suffix from chord name
    const { key, suffix } = extractKeyAndSuffix(chordName);
    
    // Call onSave with chord data - always save to personal library
    onSave({
      name: chordName.trim(),
      key,
      suffix,
      frets: fretsArray, // Now array format
      fingers: [...fretsArray], // Copy frets as fingers (user positions their own fingers)
      baseFret: 1, // Default baseFret for custom chords
      barres: [], // Empty by default
      position: 1, // Custom chords don't have positions
      instrument,
      tuning,
    });
    
    // Reset and close
    onClose();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e, index) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (index < 3) {
        // Move to next input
        const nextInput = document.querySelector(`input[data-fret-index="${index + 1}"]`);
        nextInput?.focus();
      } else {
        // Last input, move to name input
        nameInputRef.current?.focus();
      }
    } else if (e.key === 'ArrowDown' && index === 3) {
      // From last fret input, move to name input
      e.preventDefault();
      nameInputRef.current?.focus();
    }
  };

  // Handle name input keyboard
  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  const fretsString = getFretsString();
  const isValid = Object.keys(errors).length === 0 && fretsString.length === 4;
  const canSave = isValid && 
    chordName.trim() &&
    !fretInputs.every(f => f.toLowerCase().trim() === 'x');

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Create Custom Chord</h2>
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

        {/* Fret Input Section */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fret Positions
          </label>
          <div className="grid grid-cols-4 gap-3">
            {stringLabels.map((label, index) => (
              <div key={index}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {label}
                </label>
                <input
                  ref={index === 0 ? firstInputRef : null}
                  type="text"
                  data-fret-index={index}
                  value={fretInputs[index]}
                  onChange={(e) => handleFretChange(index, e.target.value)}
                  onBlur={() => handleFretBlur(index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className={`w-full px-3 py-2 border rounded-md text-center text-lg font-mono ${
                    errors[`fret${index}`] 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500'
                  } focus:outline-none focus:ring-1`}
                  placeholder="0"
                  maxLength={2}
                />
              </div>
            ))}
          </div>
          {errors.general && (
            <p className="mt-2 text-sm text-red-600">{errors.general}</p>
          )}
          {Object.keys(errors).filter(k => k.startsWith('fret')).map(key => (
            <p key={key} className="mt-1 text-sm text-red-600">{errors[key]}</p>
          ))}
        </div>

        {/* Live Preview */}
        {isValid && fretsString.length === 4 && (
          <div className="mb-6 flex justify-center">
            <ChordDiagram
              frets={fretsString}
              chordName=""
              instrument={instrument}
              tuning={tuning}
              baseFret={1}
            />
          </div>
        )}

        {/* Chord Name Input */}
        {isValid && fretsString.length === 4 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Chord Name *
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={chordName}
              onChange={(e) => setChordName(e.target.value)}
              onKeyDown={handleNameKeyDown}
              placeholder={suggestedNames.length > 0 ? `e.g., ${suggestedNames[0]}` : 'Enter chord name'}
              className={`w-full px-3 py-2 border rounded-md ${
                errors.chordName
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500'
              } focus:outline-none focus:ring-1`}
            />
            {errors.chordName && (
              <p className="mt-1 text-sm text-red-600">{errors.chordName}</p>
            )}
            {suggestedNames.length > 0 && (
              <div className="mt-2">
                <p className="text-sm text-gray-600 mb-2">Suggestions:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedNames.map((name, index) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setChordName(name);
                        nameInputRef.current?.focus();
                      }}
                      className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors border border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
                      aria-label={`Use suggestion: ${name}`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-2 text-sm text-blue-600">
              This chord will be saved to your personal library only.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`px-4 py-2 rounded-md transition-colors ${
              canSave
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Save Chord
          </button>
        </div>
      </div>
    </div>
  );
}

