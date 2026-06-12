"use client";

import { useMemo, useState } from "react";
import { Folder, HardDrive } from "@/components/icons/liquid-glass";
import type { MoveTreeFolder, MoveTreeGarden } from "@/lib/data";

type Destination = {
  gardenId: string;
  parentId: string | null;
  label: string;
};

interface MoveFilesDialogProps {
  gardens: MoveTreeGarden[];
  selectedCount: number;
  currentGardenId: string;
  currentFolderId: string | null;
  loading: boolean;
  onClose: () => void;
  onMove: (destination: Destination) => Promise<void>;
}

function FolderTree({
  folder,
  garden,
  path,
  destination,
  onSelect,
}: {
  folder: MoveTreeFolder;
  garden: MoveTreeGarden;
  path: string[];
  destination: Destination | null;
  onSelect: (destination: Destination) => void;
}) {
  const nextPath = [...path, folder.name];
  const selected =
    destination?.gardenId === garden.id &&
    destination.parentId === folder.id;

  if (folder.children.length === 0) {
    return (
      <li>
        <button
          type="button"
          className={selected ? "menu-active" : ""}
          disabled={!garden.can_upload}
          onClick={() =>
            onSelect({
              gardenId: garden.id,
              parentId: folder.id,
              label: `${garden.name} / ${nextPath.join(" / ")}`,
            })
          }
        >
          <Folder size={16} />
          <span className="truncate">{folder.name}</span>
        </button>
      </li>
    );
  }

  return (
    <li>
      <details>
        <summary
          className={selected ? "menu-active" : ""}
          onClick={() => {
            if (garden.can_upload) {
              onSelect({
                gardenId: garden.id,
                parentId: folder.id,
                label: `${garden.name} / ${nextPath.join(" / ")}`,
              });
            }
          }}
        >
          <Folder size={16} />
          <span className="truncate">{folder.name}</span>
        </summary>
        <ul>
          {folder.children.map((child) => (
            <FolderTree
              key={child.id}
              folder={child}
              garden={garden}
              path={nextPath}
              destination={destination}
              onSelect={onSelect}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}

export function MoveFilesDialog({
  gardens,
  selectedCount,
  currentGardenId,
  currentFolderId,
  loading,
  onClose,
  onMove,
}: MoveFilesDialogProps) {
  const [destination, setDestination] = useState<Destination | null>(null);
  const isCurrentFolder =
    destination?.gardenId === currentGardenId &&
    destination.parentId === currentFolderId;
  const writableGardenCount = useMemo(
    () => gardens.filter((garden) => garden.can_upload).length,
    [gardens],
  );

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-base-content/10">
          <h3 className="font-bold text-lg">
            Move {selectedCount} file{selectedCount === 1 ? "" : "s"}
          </h3>
          <p className="text-sm text-base-content/55 mt-1">
            Choose a garden root or folder.
          </p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-4">
          {writableGardenCount === 0 ? (
            <div className="py-10 text-center text-sm text-base-content/55">
              You do not have upload access to any destination.
            </div>
          ) : (
            <ul className="menu menu-sm bg-base-200 rounded-box w-full">
              {gardens.map((garden) => {
                const rootSelected =
                  destination?.gardenId === garden.id &&
                  destination.parentId === null;

                return (
                  <li
                    key={garden.id}
                    className={garden.can_upload ? "" : "menu-disabled"}
                  >
                    <details open={garden.id === currentGardenId}>
                      <summary>
                        <HardDrive size={16} />
                        <span className="truncate flex-1">{garden.name}</span>
                        {!garden.can_upload && (
                          <span className="badge badge-ghost badge-xs">
                            view only
                          </span>
                        )}
                      </summary>
                      <ul>
                        <li>
                          <details open>
                            <summary
                              className={rootSelected ? "menu-active" : ""}
                              onClick={() => {
                                if (garden.can_upload) {
                                  setDestination({
                                    gardenId: garden.id,
                                    parentId: null,
                                    label: `${garden.name} / Root`,
                                  });
                                }
                              }}
                            >
                              <HardDrive size={15} />
                              Root
                            </summary>
                            <ul>
                              {garden.folders.map((folder) => (
                                <FolderTree
                                  key={folder.id}
                                  folder={folder}
                                  garden={garden}
                                  path={[]}
                                  destination={destination}
                                  onSelect={setDestination}
                                />
                              ))}
                            </ul>
                          </details>
                        </li>
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-4 border-t border-base-content/10">
          <p className="text-xs text-base-content/55 truncate min-h-4">
            {destination
              ? isCurrentFolder
                ? "The selected files are already in this folder."
                : destination.label
              : "No destination selected"}
          </p>
          <div className="modal-action mt-3">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!destination || isCurrentFolder || loading}
              onClick={() => destination && onMove(destination)}
            >
              {loading && (
                <span className="loading loading-spinner loading-sm" />
              )}
              Move
            </button>
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
