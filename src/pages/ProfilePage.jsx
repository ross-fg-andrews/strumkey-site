import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateUser } from '../db/mutations';
import { db } from '../db/schema';
import { searchCities, getPlaceDetails, createSessionToken } from '../utils/location-autocomplete';

export default function ProfilePage() {
  const { user: authUser } = useAuth();
  
  // Query the full user object to get firstName and lastName
  const { data: userData } = db.useQuery({
    $users: {
      $: {
        where: authUser?.id ? { id: authUser.id } : { id: '' },
      },
    },
  });
  
  const user = userData?.$users?.[0] || authUser;
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [sessionToken, setSessionToken] = useState(null);
  
  const cityInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceTimeoutRef = useRef(null);
  const isSelectingRef = useRef(false); // Track when user is selecting a city

  // Create session token when component mounts
  useEffect(() => {
    setSessionToken(createSessionToken());
  }, []);

  // Initialize form fields from user data
  useEffect(() => {
    if (user) {
      console.log('User object:', user);
      console.log('User firstName:', user.firstName, 'lastName:', user.lastName);
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      
      // Set city display
      if (user.locationCity) {
        const cityDisplay = user.locationCountry 
          ? `${user.locationCity}, ${user.locationCountry}`
          : user.locationCity;
        setCityQuery(cityDisplay);
        setSelectedCity({
          city: user.locationCity,
          country: user.locationCountry || '',
          countryCode: user.locationCountry || '',
          lat: user.locationLat,
          lng: user.locationLng,
        });
      }
    }
  }, [user]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      if (!authUser?.id) {
        setMessage('You must be logged in to update your profile.');
        setSaving(false);
        return;
      }

      const updateData = {
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      };

      // Include location data if city is selected
      if (selectedCity) {
        updateData.locationCity = selectedCity.city;
        updateData.locationCountry = selectedCity.countryCode || selectedCity.country;
        updateData.locationLat = selectedCity.lat;
        updateData.locationLng = selectedCity.lng;
      }

      console.log('Submitting profile update with:', updateData);
      await updateUser(authUser.id, updateData);

      console.log('Update completed');
      setMessage('Profile updated successfully!');
      // Clear message after 3 seconds
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage('Error updating profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="heading-alice">Profile</h1>
      
      <div className="card max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <p className="text-gray-900">{user?.email || 'Not provided'}</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="input"
              placeholder="Enter your first name"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="input"
              placeholder="Enter your last name"
            />
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City or Town
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
                }}
                onFocus={() => {
                  // Only show suggestions if we have them, no city is selected, and we're not selecting
                  if (suggestions.length > 0 && !selectedCity && !isSelectingRef.current) {
                    setShowSuggestions(true);
                  }
                }}
                className="input w-full"
                placeholder="Start typing your city or town..."
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

            {/* Privacy notice */}
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              We use your location to show you groups and events near you. We only store your city or town, not your precise address.
            </p>
          </div>

          {message && (
            <p className={`text-sm ${message.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </p>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving || loading}
              className="btn btn-primary"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



