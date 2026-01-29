import { createContext, useContext, useState, useCallback } from 'react';

const EditingSongContext = createContext(null);

export function EditingSongProvider({ children }) {
  const [isEditingSong, setIsEditingSong] = useState(false);

  const setEditingSong = useCallback((value) => {
    setIsEditingSong(!!value);
  }, []);

  return (
    <EditingSongContext.Provider value={{ isEditingSong, setEditingSong }}>
      {children}
    </EditingSongContext.Provider>
  );
}

export function useEditingSong() {
  const context = useContext(EditingSongContext);
  return context;
}
