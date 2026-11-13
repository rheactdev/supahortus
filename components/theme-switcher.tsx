"use client";

import { useEffect, useRef, useState } from "react";
import { Palette } from "@/components/icons/liquid-glass";
import { THEMES, useTheme } from "./theme-provider";

const ThemeSwitcher = () => {
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="dropdown">
      <div role="button" tabIndex={0} className="btn btn-xs">
        Theme
        <span>
          <Palette size={18} />
        </span>
      </div>
      <ul
        tabIndex={-1}
        className="dropdown-content bg-base-300"
        ref={dropdownRef}
        popover="auto"
        aria-label="Theme"
      >
        {THEMES.map(({ value, label }) => (
          <li key={value} role="none">
            <input
              type="radio"
              name="topbar-theme"
              className="theme-controller w-full btn btn-sm btn-block btn-ghost"
              aria-label={label}
              value={value}
              checked={mounted && theme === value}
              onChange={() => {
                setTheme(value);
                dropdownRef.current?.hidePopover();
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
};

export { ThemeSwitcher };
