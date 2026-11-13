"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const THEMES = [
  { value: "nord", label: "Nord" },
  { value: "business", label: "Business" },
  { value: "everforest", label: "Everforest" },
] as const;

type Theme = (typeof THEMES)[number]["value"];

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({
  children,
  defaultTheme = "business",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  useEffect(() => {
    let savedTheme: string | null = null;

    try {
      savedTheme = localStorage.getItem("daisyui-theme");
    } catch {
      // Use the default theme when browser storage is unavailable.
    }

    const initialTheme = THEMES.find(({ value }) => value === savedTheme)?.value
      ?? defaultTheme;

    setThemeState(initialTheme);
    applyTheme(initialTheme);
  }, [defaultTheme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    try {
      localStorage.setItem("daisyui-theme", newTheme);
    } catch {
      // Theme changes still work when browser storage is unavailable.
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
