"use client";

import { Moon, Sun, Palette } from "@/components/icons/liquid-glass";
import { useTheme } from "./theme-provider";
import { useEffect, useState, useRef } from "react";

const ThemeSwitcher = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const dropdownRef = useRef<HTMLDetailsElement>(null);

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const ICON_SIZE = 18;

  const currentIcon = () => {
    if (theme === "light") return <Sun size={ICON_SIZE} />;
    if (theme === "dark" || theme === "dim" || theme === "synthwave") return <Moon size={ICON_SIZE} />;
    return <Palette size={ICON_SIZE} />;
  }

  const handleSelect = (newTheme: string) => {
    setTheme(newTheme as any);
    if (dropdownRef.current) {
        dropdownRef.current.removeAttribute("open");
    }
  };

  return (
    <details ref={dropdownRef} className="dropdown dropdown-end">
      <summary className="btn btn-ghost btn-circle h-10 w-10 hover:bg-base-200 m-1">
        {currentIcon()}
      </summary>
      <ul className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-[1] border border-base-content/10">
        <li><span className="text-xs font-semibold text-base-content/50 uppercase tracking-wider px-2 py-1 pointer-events-none">Themes</span></li>
        <li>
            <button onClick={() => handleSelect("system")} className={`flex gap-3 ${theme === 'system' ? 'active' : ''}`}>
                <Palette size={ICON_SIZE} /> System
            </button>
        </li>
        <div className="divider my-1 h-1"></div>
        <li>
            <button onClick={() => handleSelect("light")} className={`flex gap-3 ${theme === 'light' ? 'active' : ''}`}>
                <Sun size={ICON_SIZE} /> Light
            </button>
        </li>
        <li>
            <button onClick={() => handleSelect("dark")} className={`flex gap-3 ${theme === 'dark' ? 'active' : ''}`}>
                <Moon size={ICON_SIZE} /> Dark
            </button>
        </li>
        <li>
            <button onClick={() => handleSelect("retro")} className={`flex gap-3 ${theme === 'retro' ? 'active' : ''}`}>
                <Palette size={ICON_SIZE} /> Retro
            </button>
        </li>
        <li>
            <button onClick={() => handleSelect("synthwave")} className={`flex gap-3 ${theme === 'synthwave' ? 'active' : ''}`}>
                <Palette size={ICON_SIZE} /> Synthwave
            </button>
        </li>
        <li>
            <button onClick={() => handleSelect("cyberpunk")} className={`flex gap-3 ${theme === 'cyberpunk' ? 'active' : ''}`}>
                <Palette size={ICON_SIZE} /> Cyberpunk
            </button>
        </li>
        <li>
            <button onClick={() => handleSelect("dim")} className={`flex gap-3 ${theme === 'dim' ? 'active' : ''}`}>
                <Moon size={ICON_SIZE} /> Dim
            </button>
        </li>
      </ul>
    </details>
  );
};

export { ThemeSwitcher };
