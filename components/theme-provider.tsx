"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "nord" | "business";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = "business",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>("business");

  useEffect(() => {
    const savedTheme = localStorage.getItem("daisyui-theme") as Theme | null;
    if (savedTheme) {
      setThemeState(savedTheme);
      applyTheme(savedTheme);
    } else {
      setThemeState(defaultTheme);
      applyTheme(defaultTheme);
    }
  }, [defaultTheme]);

  const applyTheme = (newTheme: Theme) => {
    let resolvedTheme = newTheme;

    if (newTheme === "business") {
      resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "business"
        : "nord";
    }

    document.documentElement.setAttribute("data-theme", resolvedTheme);
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    localStorage.setItem("daisyui-theme", newTheme);
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
