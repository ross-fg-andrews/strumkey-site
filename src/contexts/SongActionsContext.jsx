import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const SongActionsContext = createContext(null);
const SongActionsRegisterContext = createContext(null);

export function SongActionsProvider({ children }) {
  const [songActionsValue, setSongActionsValue] = useState(null);

  const registerSongActions = useCallback((value) => {
    setSongActionsValue(value);
  }, []);

  return (
    <SongActionsContext.Provider value={songActionsValue}>
      <SongActionsRegisterContext.Provider value={registerSongActions}>
        {children}
      </SongActionsRegisterContext.Provider>
    </SongActionsContext.Provider>
  );
}

export function useSongActions() {
  const context = useContext(SongActionsContext);
  return context;
}

export function useRegisterSongActions() {
  const register = useContext(SongActionsRegisterContext);
  return register;
}