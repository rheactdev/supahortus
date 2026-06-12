"use client";

import React, { useState, useEffect, useTransition, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function NavbarSearchInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [, startTransition] = useTransition();

  useEffect(() => {
    // If we're on the search page, keep input in sync with URL
    setSearchTerm(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const q = searchParams.get("q") || "";
      if (searchTerm !== q) {
        if (searchTerm) {
          startTransition(() => {
            router.push(`/search?q=${encodeURIComponent(searchTerm)}`);
          });
        }
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, searchParams, router]);

  return (
    <label className="input input-sm flex w-full items-center gap-2 border-base-content/20">
      <svg className="h-[1em] opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="2.5" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.3-4.3"></path>
        </g>
      </svg>
      <input 
        type="search" 
        className="grow min-w-0" 
        placeholder="Search all gardens..." 
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </label>
  );
}

export function NavbarSearch() {
  return (
    <Suspense fallback={<div className="h-8 w-full animate-pulse rounded-md bg-base-200" />}>
      <NavbarSearchInner />
    </Suspense>
  );
}
