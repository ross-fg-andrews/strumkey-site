/**
 * Location Autocomplete Utility
 * Abstraction layer for city/town autocomplete using Google Places API
 * 
 * This provides a standardized interface that can be swapped for other providers
 * (PlaceKit, Geoapify, etc.) by changing only this file.
 */

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
const DEBOUNCE_DELAY = 400; // milliseconds

// Cache for recent searches (simple in-memory cache)
const searchCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Debounce function to limit API calls
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate a session token for Google Places API
 * Session tokens allow cost optimization when used with Place Details
 */
export function createSessionToken() {
  // Generate a random token (Google expects a string)
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Search for cities/towns using Google Places API
 * @param {string} query - Search query (city/town name)
 * @param {string} sessionToken - Optional session token for cost optimization
 * @returns {Promise<Array>} Array of city suggestions in standardized format
 */
export async function searchCities(query, sessionToken = null) {
  if (!API_KEY) {
    throw new Error('Google Places API key is not configured. Please add VITE_GOOGLE_PLACES_API_KEY to your .env file.');
  }

  if (!query || query.trim().length < 2) {
    return [];
  }

  const trimmedQuery = query.trim();

  // Check cache first
  const cacheKey = `${trimmedQuery}_${sessionToken || 'no-session'}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Use Google Places API (New) Autocomplete endpoint
    const url = 'https://places.googleapis.com/v1/places:autocomplete';
    
    const requestBody = {
      input: trimmedQuery,
      includedRegionCodes: [], // Empty = all countries
      includedPrimaryTypes: ['locality', 'administrative_area_level_2'], // Cities and towns
      languageCode: 'en', // Can be made dynamic based on user locale
    };

    // Add session token if provided (for cost optimization)
    if (sessionToken) {
      requestBody.sessionToken = sessionToken;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || 
        `Google Places API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    
    // Transform Google Places response to standardized format
    const suggestions = (data.suggestions || []).map(suggestion => {
      const placePrediction = suggestion.placePrediction;
      if (!placePrediction) return null;

      // Extract city name and location details
      const placeId = placePrediction.placeId;
      const structuredFormat = placePrediction.structuredFormat;
      const mainText = structuredFormat?.mainText?.text || '';
      const secondaryText = structuredFormat?.secondaryText?.text || '';

      // Parse secondary text to extract country/region
      // Format is usually: "City, State, Country" or "City, Country"
      const parts = secondaryText.split(',').map(s => s.trim());
      const country = parts[parts.length - 1] || '';
      const region = parts.length > 1 ? parts[parts.length - 2] : '';

      return {
        city: mainText,
        country: country, // Full country name
        countryCode: '', // Will be filled by Place Details if needed
        region: region,
        lat: null, // Will be filled by Place Details
        lng: null, // Will be filled by Place Details
        displayName: secondaryText ? `${mainText}, ${secondaryText}` : mainText,
        placeId: placeId,
      };
    }).filter(Boolean); // Remove null entries

    // Cache the results
    searchCache.set(cacheKey, {
      data: suggestions,
      timestamp: Date.now(),
    });

    return suggestions;
  } catch (error) {
    console.error('Error searching cities:', error);
    throw error;
  }
}

/**
 * Get place details for a selected place
 * This terminates the session and provides full location data including coordinates
 * @param {string} placeId - Google Place ID
 * @param {string} sessionToken - Session token (must match the one used in autocomplete)
 * @returns {Promise<Object>} Place details in standardized format
 */
export async function getPlaceDetails(placeId, sessionToken = null) {
  if (!API_KEY) {
    throw new Error('Google Places API key is not configured.');
  }

  if (!placeId) {
    throw new Error('Place ID is required.');
  }

  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    
    const params = new URLSearchParams({
      languageCode: 'en',
    });

    if (sessionToken) {
      params.append('sessionToken', sessionToken);
    }

    const fullUrl = `${url}?${params.toString()}`;

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': API_KEY,
        // Request only Essentials fields to keep costs low
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || 
        `Google Places API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    // Extract location data
    const location = data.location;
    const addressComponents = data.addressComponents || [];
    
    // Extract city, country, region from address components
    let city = '';
    let country = '';
    let countryCode = '';
    let region = '';

    for (const component of addressComponents) {
      const types = component.types || [];
      if (types.includes('locality')) {
        city = component.longText || component.shortText || '';
      }
      if (types.includes('country')) {
        country = component.longText || '';
        countryCode = component.shortText || '';
      }
      if (types.includes('administrative_area_level_1')) {
        region = component.longText || component.shortText || '';
      }
    }

    return {
      city: city || data.displayName?.text || '',
      country: country,
      countryCode: countryCode,
      region: region,
      lat: location?.latitude || null,
      lng: location?.longitude || null,
      displayName: data.displayName?.text || data.formattedAddress || '',
      placeId: placeId,
    };
  } catch (error) {
    console.error('Error getting place details:', error);
    throw error;
  }
}

/**
 * Debounced version of searchCities for use in React components
 * Use this in useEffect or event handlers to avoid excessive API calls
 */
export const debouncedSearchCities = debounce(async (query, sessionToken, callback) => {
  try {
    const results = await searchCities(query, sessionToken);
    callback(results);
  } catch (error) {
    callback([]);
    console.error('Autocomplete error:', error);
  }
}, DEBOUNCE_DELAY);
