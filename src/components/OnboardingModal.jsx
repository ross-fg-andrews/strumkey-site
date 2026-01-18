import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateUser } from '../db/mutations';
import { searchCities, getPlaceDetails, createSessionToken } from '../utils/location-autocomplete';

/**
 * OnboardingModal Component
 * Blocking modal that appears on first login, requiring users to complete their profile
 * before they can access the site.
 */
export default function OnboardingModal() {
  const { user: authUser } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sessionToken, setSessionToken] = useState(null);
  
  const cityInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceTimeoutRef = useRef(null);
  const isSelectingRef = useRef(false); // Track when user is selecting a city

  // Create session token when component mounts
  useEffect(() => {
    setSessionToken(createSessionToken());
  }, []);

  // Debounced city search
  useEffect(() => {
    // Don't search if we're in the middle of selecting a city
    if (isSelectingRef.current) {
      return;
    }

    if (!cityQuery || cityQuery.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Don't search if we have a selected city and the query matches it
    // This prevents reopening the dropdown after selection
    if (selectedCity) {
      const selectedDisplayName = selectedCity.displayName || 
        (selectedCity.city && selectedCity.country 
          ? `${selectedCity.city}, ${selectedCity.country}`
          : selectedCity.city);
      
      if (cityQuery.trim() === selectedDisplayName) {
        // Query matches selected city, don't search
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
    }

    // Clear previous timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set loading state
    setLoading(true);

    // Debounce the API call
    debounceTimeoutRef.current = setTimeout(async () => {
      // Double-check we're not selecting (race condition protection)
      if (isSelectingRef.current) {
        setLoading(false);
        return;
      }

      try {
        const results = await searchCities(cityQuery.trim(), sessionToken);
        setSuggestions(results);
        // Only show suggestions if we're not selecting and don't have a selected city
        if (!isSelectingRef.current && !selectedCity) {
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error('Error fetching city suggestions:', err);
        setError('Unable to load city suggestions. Please try again.');
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setLoading(false);
      }
    }, 400); // 400ms debounce

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [cityQuery, sessionToken, selectedCity]);

  // Handle city selection
  const handleCitySelect = async (suggestion) => {
    // Set flag to prevent search from running
    isSelectingRef.current = true;
    
    // Close suggestions immediately
    setShowSuggestions(false);
    setSelectedCity(suggestion);
    setError('');

    // Update city query with the suggestion's display name (preserve what user saw)
    // This is what the user selected, so we should keep it
    const selectedDisplayName = suggestion.displayName;
    setCityQuery(selectedDisplayName);

    // Fetch full place details to get coordinates
    try {
      setLoading(true);
      const details = await getPlaceDetails(suggestion.placeId, sessionToken);
      
      // Merge details but preserve the original display name from suggestion
      // The suggestion's displayName is what the user saw and selected
      setSelectedCity({
        ...details,
        displayName: selectedDisplayName, // Keep the original display name user saw
      });
      
      // Don't update cityQuery - keep what user selected
    } catch (err) {
      console.error('Error fetching place details:', err);
      // Continue with basic suggestion data if details fail
      // Keep the original display name
    } finally {
      setLoading(false);
      // Clear the flag after a short delay to allow normal typing again
      setTimeout(() => {
        isSelectingRef.current = false;
      }, 500);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!firstName.trim()) {
      setError('Please enter your first name.');
      return;
    }

    if (!lastName.trim()) {
      setError('Please enter your last name.');
      return;
    }

    if (!selectedCity) {
      setError('Please select a city from the suggestions.');
      cityInputRef.current?.focus();
      return;
    }

    if (!authUser?.id) {
      setError('You must be logged in to complete onboarding.');
      return;
    }

    setSaving(true);

    try {
      await updateUser(authUser.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        hasCompletedOnboarding: true,
        locationCity: selectedCity.city,
        locationCountry: selectedCity.countryCode || selectedCity.country,
        locationLat: selectedCity.lat,
        locationLng: selectedCity.lng,
      });

      // Success - the modal will disappear when user data updates
      // The Layout component will detect hasCompletedOnboarding = true
    } catch (err) {
      console.error('Error saving onboarding data:', err);
      setError('Error saving your information. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Handle clicks outside suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target) &&
        cityInputRef.current &&
        !cityInputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Prevent closing modal (no close button, no backdrop click)
  // This is intentional - users must complete onboarding

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to Strumkey!
          </h2>
          <p className="text-gray-600">
            Let's get you set up. Please provide a few details to complete your profile.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setError('');
              }}
              className="input w-full"
              placeholder="Enter your first name"
              required
              autoFocus
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setError('');
              }}
              className="input w-full"
              placeholder="Enter your last name"
              required
            />
          </div>

          {/* City/Town */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City or Town <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                ref={cityInputRef}
                type="text"
                value={cityQuery}
                onChange={(e) => {
                  // Clear selecting flag when user manually types
                  isSelectingRef.current = false;
                  setCityQuery(e.target.value);
                  // Clear selected city when user types (unless it matches)
                  if (selectedCity) {
                    const selectedDisplayName = selectedCity.displayName || 
                      (selectedCity.city && selectedCity.country 
                        ? `${selectedCity.city}, ${selectedCity.country}`
                        : selectedCity.city);
                    if (e.target.value.trim() !== selectedDisplayName) {
                      setSelectedCity(null);
                    }
                  }
                  setError('');
                }}
                onFocus={() => {
                  // Only show suggestions if we have them, no city is selected, and we're not selecting
                  if (suggestions.length > 0 && !selectedCity && !isSelectingRef.current) {
                    setShowSuggestions(true);
                  }
                }}
                className="input w-full"
                placeholder="Start typing your city or town..."
                required
              />
              {loading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                </div>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
              >
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleCitySelect(suggestion)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                  >
                    <div className="font-medium text-gray-900">{suggestion.city}</div>
                    {suggestion.displayName !== suggestion.city && (
                      <div className="text-sm text-gray-500">{suggestion.displayName}</div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {showSuggestions && suggestions.length === 0 && cityQuery.length >= 2 && !loading && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-4 text-sm text-gray-500">
                No cities found. Please try a different search term.
              </div>
            )}
            
            {/* Privacy notice */}
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              We use your location to show you groups and events near you. We only store your city or town, not your precise address.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={saving || loading}
              className="btn btn-primary w-full"
            >
              {saving ? 'Saving...' : 'Complete Setup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
