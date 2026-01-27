import { useState, useEffect, useRef } from 'react';
import ChordDiagram from './ChordDiagram';

/**
 * Add Voicing Modal Component
 * Allows admins to add new chord voicings by entering frets
 */
export default function AddVoicingModal({ 
  isOpen, 
  onClose, 
  onAdd, 
  chordKey,
  chordSuffix,
  instrument = 'ukulele',
  tuning = 'ukulele_standard',
}) {
  const [fretInputs, setFretInputs] = useState(['0', '0', '0', '0']);
  const [errors, setErrors] = useState({});
  
  const firstInputRef = useRef(null);

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
      setErrors({});
      // Focus first input after a brief delay
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

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
    
    // Check if at least one string is unmuted
    const hasValidUnmuted = fretInputs.some(f => {
      const normalized = f.toLowerCase().trim();
      return normalized !== '' && normalized !== 'x' && !isNaN(parseInt(normalized, 10));
    });
    if (!hasValidUnmuted) {
      newErrors.general = 'At least one string must be unmuted';
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

  // Convert frets string to array format
  const convertFretsToArray = (fretsString) => {
    return fretsString.split('').map(f => {
      const lower = f.toLowerCase();
      if (lower === 'x') return null; // muted strings as null
      const num = parseInt(f, 10);
      return isNaN(num) ? null : num;
    });
  };

  // Calculate baseFret from frets
  // If maxFret <= 4, use baseFret = 1 (can be shown at nut, no fret number needed)
  // If maxFret > 4, use minimum non-zero fret (chord is higher on neck, needs fret number)
  const calculateBaseFret = (fretsArray) => {
    const numericFrets = fretsArray.filter(f => f !== null && f !== undefined && f > 0);
    if (numericFrets.length === 0) {
      return 1; // Default to 1 if all open/muted
    }
    const maxFret = Math.max(...numericFrets);
    const minFret = Math.min(...numericFrets);
    
    // If chord fits in 0-4 range, use baseFret = 1 (will be displayed at nut)
    // Otherwise, use minFret as baseFret (chord is higher on neck)
    if (maxFret <= 4) {
      return 1;
    }
    return minFret;
  };

  // Handle add
  const handleAdd = () => {
    if (!validateFrets()) {
      return;
    }
    
    const fretsString = getFretsString();
    
    // Check if all strings are muted
    if (fretsString.split('').every(f => f === 'x')) {
      setErrors({ general: 'At least one string must be unmuted' });
      return;
    }
    
    // Convert frets to array format
    const fretsArray = convertFretsToArray(fretsString);
    const baseFret = calculateBaseFret(fretsArray);
    
    // Build chord name from key and suffix
    const chordName = chordSuffix && chordSuffix !== 'major' && chordSuffix !== ''
      ? `${chordKey}${chordSuffix}`
      : chordKey;
    
    // Call onAdd with chord data
    onAdd({
      name: chordName,
      key: chordKey,
      suffix: chordSuffix || 'major',
      frets: fretsArray,
      fingers: [...fretsArray], // Copy frets as fingers
      baseFret,
      barres: [], // Empty by default
      position: 1, // Will be set when saving based on list order
      instrument,
      tuning,
      libraryType: 'main',
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
        // Last input, trigger add
        handleAdd();
      }
    }
  };

  if (!isOpen) return null;

  const fretsString = getFretsString();
  const isValid = Object.keys(errors).length === 0 && fretsString.length === 4;
  const canAdd = isValid && 
    !fretInputs.every(f => f.toLowerCase().trim() === 'x');

  const chordName = chordSuffix && chordSuffix !== 'major' && chordSuffix !== ''
    ? `${chordKey}${chordSuffix}`
    : chordKey;

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
          <h2 className="text-xl font-bold">Add New Voicing: {chordName}</h2>
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
            Fret Positions (G, C, E, A)
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
            />
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
            onClick={handleAdd}
            disabled={!canAdd}
            className={`px-4 py-2 rounded-md transition-colors ${
              canAdd
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Add Voicing
          </button>
        </div>
      </div>
    </div>
  );
}
