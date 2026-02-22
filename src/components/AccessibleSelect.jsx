import { useState, useRef, useEffect } from 'react';
import { CaretDown } from '@phosphor-icons/react';

/**
 * Accessible custom select component
 * Follows WAI-ARIA Listbox pattern: https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
 * Use a <label htmlFor={id}> in the parent to associate an accessible name.
 *
 * @param {Object} props
 * @param {string} props.id - ID for the trigger (used for label association via htmlFor)
 * @param {Array<{value: string, label: string}>} props.options - Options to display
 * @param {string} props.value - Currently selected value
 * @param {function} props.onChange - Called with (value) when selection changes
 * @param {string} [props.className] - Additional classes for the trigger button
 */
export default function AccessibleSelect({
  id,
  options = [],
  value,
  onChange,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const triggerRef = useRef(null);
  const listboxRef = useRef(null);

  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const displayValue = options.find((opt) => opt.value === value)?.label ?? value;

  const wasOpenRef = useRef(false);

  // Focus management: when opening, focus listbox; when closing, return focus to trigger
  useEffect(() => {
    if (isOpen) {
      const idx = selectedIndex >= 0 ? selectedIndex : 0;
      setFocusedIndex(idx);
      listboxRef.current?.focus?.();
    } else if (wasOpenRef.current) {
      triggerRef.current?.focus?.();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, selectedIndex]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (
        listboxRef.current &&
        !listboxRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  const handleListboxKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (options[focusedIndex]) {
          onChange?.(options[focusedIndex].value);
          setIsOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const handleOptionClick = (opt) => {
    onChange?.(opt.value);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        className={`input flex w-full items-center justify-between text-left ${className}`}
      >
        <span>{displayValue}</span>
        <CaretDown
          weight="bold"
          size={16}
          className={`flex-shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <ul
          ref={listboxRef}
          role="listbox"
          aria-labelledby={id}
          aria-activedescendant={options[focusedIndex] ? `${id}-option-${focusedIndex}` : undefined}
          tabIndex={0}
          onKeyDown={handleListboxKeyDown}
          className="absolute top-full left-0 z-10 mt-1 w-full min-w-full max-h-60 overflow-auto rounded-lg border border-gray-300 bg-white py-1 shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {options.map((opt, idx) => (
            <li
              key={opt.value}
              id={`${id}-option-${idx}`}
              role="option"
              aria-selected={opt.value === value}
              tabIndex={-1}
              className={`cursor-pointer px-3 py-2 text-left text-gray-900 transition-colors ${
                opt.value === value ? 'bg-primary-100 text-primary-800 font-medium' : ''
              } ${idx === focusedIndex ? 'bg-primary-50' : ''} hover:bg-primary-50`}
              onClick={() => handleOptionClick(opt)}
              onMouseEnter={() => setFocusedIndex(idx)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
