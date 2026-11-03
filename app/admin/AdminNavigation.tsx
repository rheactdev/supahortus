"use client";

import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";

const sections = [
  { segment: "gardens", label: "Gardens" },
  { segment: "users", label: "Users" },
  { segment: "actions", label: "Actions" },
];

export function AdminNavigation() {
  const segments = useSelectedLayoutSegments();
  const currentSection = segments[0];
  const activeSection = currentSection === "create-garden" ? "gardens" : currentSection;

  return (
    <nav aria-label="Admin" className="shrink-0 border-b border-base-content/10 bg-base-200 lg:w-52 lg:border-r lg:border-b-0">
      <ul className="menu menu-horizontal w-full lg:menu-vertical">
        {sections.map(({ segment, label }) => (
          <li key={segment}>
            <Link
              href={`/admin/${segment}`}
              className={activeSection === segment ? "menu-active" : undefined}
              aria-current={currentSection === segment && segments.length === 1 ? "page" : undefined}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
