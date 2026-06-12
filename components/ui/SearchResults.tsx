"use client";

import React, { useState } from "react";
import Link from "next/link";
import { DocumentIcon, Folder } from "@/components/icons/liquid-glass";
import { GlobalSearchResult } from "@/lib/data";
import { FileCard } from "./FileCard";
import { useRouter } from "next/navigation";

export function SearchResults({ 
  results, 
  thumbnailUrls, 
  userId 
}: { 
  results: GlobalSearchResult[];
  thumbnailUrls: Record<string, string>;
  userId: string;
}) {
  const [view, setView] = useState<"table" | "grid">("grid");
  const router = useRouter();

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center opacity-70">
        <DocumentIcon size={64} className="opacity-20 mb-4" />
        <h3 className="font-semibold text-xl">No results found</h3>
        <p className="text-sm mt-1">Try adjusting your search query.</p>
      </div>
    );
  }

  const sortedFolders = results.filter((item) => item.type === "folder");
  const sortedFiles = results.filter((item) => item.type === "file");

  const viewConfig = { cardSize: 200, imageFit: "contain" as const, aspectRatio: 1 };

  return (
    <div className="space-y-4">
      <div className="flex justify-end px-1">
        <div className="join bg-base-200 p-1 rounded-lg">
          <button 
            className={`join-item btn btn-sm border-none shadow-none ${view === 'table' ? 'btn-neutral' : 'btn-ghost'}`}
            onClick={() => setView("table")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            Table
          </button>
          <button 
            className={`join-item btn btn-sm border-none shadow-none ${view === 'grid' ? 'btn-neutral' : 'btn-ghost'}`}
            onClick={() => setView("grid")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            Grid
          </button>
        </div>
      </div>

      {view === "table" ? (
        <div className="overflow-x-auto w-full bg-base-100 border border-base-200 rounded-xl shadow-sm">
          <table className="table">
            <thead>
              <tr className="bg-base-200/50">
                <th>Name</th>
                <th>Garden</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item) => {
                const isFolder = item.type === "folder";
                const targetPath = item.parent_id ? `/${item.parent_id}` : '';
                const linkPath = isFolder 
                  ? `/my-gardens/${item.gardens.slug}/${item.id}`
                  : `/my-gardens/${item.gardens.slug}${targetPath}`;

                return (
                  <tr key={item.id} className="hover group">
                    <td>
                      <Link href={linkPath} className="flex items-center gap-3">
                        {isFolder ? <Folder size={24} /> : <DocumentIcon size={24} />}
                        <span className="font-medium group-hover:text-primary transition-colors">{item.name}</span>
                      </Link>
                    </td>
                    <td>
                      <Link href={`/my-gardens/${item.gardens.slug}`} className="badge badge-neutral hover:badge-primary transition-colors">
                        {item.gardens.name}
                      </Link>
                    </td>
                    <td className="text-sm opacity-70">
                      {isFolder ? "Folder" : (item.mime_type || "File")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sortedFolders.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-base-content/60 px-1">Folders</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {sortedFolders.map((folder) => (
                  <Link
                    key={folder.id}
                    href={`/my-gardens/${folder.gardens.slug}/${folder.id}`}
                    className="flex items-center gap-3 p-3 bg-base-100 hover:bg-base-200 border border-base-content/10 hover:border-primary/30 rounded-xl transition-colors group relative"
                  >
                    <div className="text-secondary opacity-80 group-hover:opacity-100 transition-opacity">
                      <Folder size={24} />
                    </div>
                    <span className="font-medium truncate text-sm flex-1 group-hover:text-primary transition-colors" title={folder.name}>
                      {folder.name}
                    </span>
                    <span className="badge badge-neutral badge-sm absolute -top-2 -right-2 opacity-90 shadow-sm">{folder.gardens.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {sortedFiles.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-base-content/60 px-1">Files</h3>
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${viewConfig.cardSize}px, 1fr))`,
                }}
              >
                {sortedFiles.map((file) => (
                  <div 
                    key={file.id} 
                    className="relative h-full cursor-pointer"
                    onDoubleClick={() => {
                      const targetPath = file.parent_id ? `/${file.parent_id}` : '';
                      router.push(`/my-gardens/${file.gardens.slug}${targetPath}?preview=${file.id}`);
                    }}
                  >
                    <FileCard
                      item={file}
                      thumbnailUrl={thumbnailUrls[file.id]}
                      gardenId={file.garden_id}
                      userId={userId}
                      folderId={file.parent_id}
                      canUpload={file.permissions.can_upload}
                      canDelete={file.permissions.can_delete}
                      allowShareLinks={true}
                      selectionEnabled={false}
                      onRefresh={() => router.refresh()}
                      viewConfig={viewConfig}
                    />
                    <div className="absolute top-[52px] right-2 z-10 pointer-events-none">
                      <span className="badge badge-neutral badge-sm shadow-sm opacity-90">{file.gardens.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
