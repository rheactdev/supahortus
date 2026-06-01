"use client";

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";

const DropdownContext = createContext<{
  detailsRef: React.RefObject<HTMLDetailsElement | null>;
} | null>(null);

export function Dropdown({
  children,
  className = "dropdown-end",
  open,
  onOpenChange,
}: {
  children: ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;

    function handleClickOutside(event: MouseEvent) {
      if (details?.hasAttribute("open") && !details.contains(event.target as Node)) {
        details.removeAttribute("open");
      }
    }

    function handleToggle() {
      const isOpen = details?.hasAttribute("open") ?? false;
      onOpenChange?.(isOpen);
      
      if (isOpen) {
        setTimeout(() => document.addEventListener("click", handleClickOutside), 0);
      } else {
        document.removeEventListener("click", handleClickOutside);
      }
    }

    details.addEventListener("toggle", handleToggle);
    handleToggle();

    return () => {
      details.removeEventListener("toggle", handleToggle);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [onOpenChange]);

  return (
    <DropdownContext.Provider value={{ detailsRef }}>
      <details 
        ref={detailsRef}
        className={`dropdown ${className}`}
        open={open}
      >
        {children}
      </details>
    </DropdownContext.Provider>
  );
}

export function DropdownTrigger({
  children,
  className = "btn-ghost btn-sm",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <summary className={`btn ${className}`} title={title}>
      {children}
    </summary>
  );
}

export function DropdownContent({
  children,
  className = "w-56 z-[100]",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul className={`dropdown-content menu bg-base-100 rounded-box p-2 shadow-2xl border border-base-content/10 mt-1 ${className}`}>
      {children}
    </ul>
  );
}
