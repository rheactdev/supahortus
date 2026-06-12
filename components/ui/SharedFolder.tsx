import Link from "next/link";
import {
  Download,
  FileIcon,
  Folder,
} from "@/components/icons/liquid-glass";
import type { SharedFolderView } from "@/lib/item-share";

export function SharedFolder({
  code,
  view,
}: {
  code: string;
  view: SharedFolderView;
}) {
  const folders = view.items.filter((item) => item.type === "folder");
  const files = view.items.filter((item) => item.type === "file");

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <header className="border-b border-base-content/10 bg-base-200/40 px-4 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
              Shared folder
            </p>
            <h1 className="truncate text-xl font-bold">{view.root.name}</h1>
          </div>
          <span className="badge badge-ghost">View only</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-6 md:px-8">
        <nav className="flex min-w-0 items-center gap-2 overflow-x-auto text-sm">
          {view.breadcrumbs.map((crumb, index) => {
            const isLast = index === view.breadcrumbs.length - 1;
            return (
              <span key={crumb.id} className="flex shrink-0 items-center gap-2">
                {index > 0 ? (
                  <span className="text-base-content/30">/</span>
                ) : null}
                {isLast ? (
                  <span className="font-semibold">{crumb.name}</span>
                ) : (
                  <Link
                    className="link-hover text-base-content/60"
                    href={
                      crumb.id === view.root.id
                        ? `/s/${code}`
                        : `/s/${code}/${crumb.id}`
                    }
                  >
                    {crumb.name}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>

        {folders.length === 0 && files.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-base-content/45">
            <Folder size={56} className="opacity-30" />
            <p className="font-medium">This folder is empty</p>
          </div>
        ) : (
          <>
            {folders.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-base-content/55">
                  Folders
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {folders.map((folder) => (
                    <Link
                      key={folder.id}
                      href={`/s/${code}/${folder.id}`}
                      className="flex items-center gap-3 rounded-xl border border-base-content/10 bg-base-200/40 p-4 transition-colors hover:border-primary/30 hover:bg-base-200"
                    >
                      <Folder size={22} className="text-secondary" />
                      <span className="min-w-0 truncate font-medium">
                        {folder.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {files.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-base-content/55">
                  Files
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {files.map((file) => {
                    const thumbnailUrl = view.thumbnailUrls[file.id];
                    return (
                      <a
                        key={file.id}
                        href={`/api/share/${code}/download?id=${encodeURIComponent(file.id)}`}
                        className="group overflow-hidden rounded-xl border border-base-content/10 bg-base-100 transition-colors hover:border-primary/30"
                      >
                        <div className="flex aspect-video items-center justify-center overflow-hidden bg-base-200/50">
                          {thumbnailUrl ? (
                            // Signed object URLs should bypass image optimization.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumbnailUrl}
                              alt=""
                              className="size-full object-contain transition-transform group-hover:scale-[1.02]"
                            />
                          ) : (
                            <FileIcon
                              size={42}
                              className="text-base-content/35"
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-3 p-3">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {file.name}
                          </span>
                          <Download
                            size={17}
                            className="shrink-0 text-base-content/50"
                          />
                        </div>
                      </a>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
