"use client";

import { Moon, Sun } from "@/components/icons/liquid-glass";
import { useTheme } from "./theme-provider";
import { useEffect, useState } from "react";

const ThemeSwitcher = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const ICON_SIZE = 18;

  const sunOn = theme === "nord" ? "swap-on" : "swap-off";
  const moonOn = theme === "nord" ? "swap-off" : "swap-on";

  return (
    <label className="swap swap-rotate">
      <input type="checkbox" onChange={() => setTheme(theme === "nord" ? "business" : "nord")} checked={theme === "nord"} />
      <Sun size={ICON_SIZE} className={sunOn} />
      <Moon size={ICON_SIZE} className={moonOn} />
    </label>
  )

  // return (
  //   <details ref={dropdownRef} className="dropdown dropdown-end">
  //     <summary className="btn btn-ghost btn-circle h-10 w-10 hover:bg-base-200 m-1">
  //       {currentIcon()}
  //     </summary>
  //     <ul className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-[1] border border-base-content/10">
  //       <li><span className="text-xs font-semibold text-base-content/50 uppercase tracking-wider px-2 py-1 pointer-events-none">Themes</span></li>
  //       <div className="divider my-1 h-1"></div>
  //       <li>
  //         <button onClick={() => handleSelect("nord")} className={`flex gap-3 ${theme === 'nord' ? 'active' : ''}`}>
  //           <Sun size={ICON_SIZE} /> Light
  //         </button>
  //       </li>
  //       <li>
  //         <button onClick={() => handleSelect("business")} className={`flex gap-3 ${theme === 'business' ? 'active' : ''}`}>
  //           <Moon size={ICON_SIZE} /> Dark
  //         </button>
  //       </li>
  //     </ul>
  //   </details>
  // );
};

export { ThemeSwitcher };
