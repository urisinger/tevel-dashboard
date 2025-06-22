import { createContext, useContext } from 'react';

export const ThemeContext = createContext({
    theme: 'light' as 'light' | 'dark',
    toggleTheme: () => { },
});

export const useTheme = () => useContext(ThemeContext);
