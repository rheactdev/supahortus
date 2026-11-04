import { UppyFile, Meta } from "@uppy/core";
import { FileIcon, Trash, Video, Music, PdfIcon, DocumentIcon } from "@/components/icons/liquid-glass";

interface QueueUploadProps {
    files: UppyFile<Meta, Record<string, never>>[];
    disableRemoval: boolean;
    onRemove: (id: string) => void;
}

const getFileIcon = (type: string, size = 32) => {
    type = type || '';
    if (type.startsWith('video/')) return <Video size={size} />;
    if (type.startsWith('audio/')) return <Music size={size} />;
    if (type.includes('pdf')) return <PdfIcon size={size} />;
    if (type.includes('document') || type.includes('text/')) return <DocumentIcon size={size} />;
    return <FileIcon size={size} />;
};

const formatSize = (bytes: number | null) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024, dm = 2, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const QueueUpload = ({ files, disableRemoval, onRemove }: QueueUploadProps) => {
    return (
        <div className="mt-2 grid grid-cols-2 gap-4 p-1 sm:grid-cols-3 lg:grid-cols-6">
            {files.map((file) => {
                const displayName = typeof file.meta.relativePath === "string" ? file.meta.relativePath : file.name;
                const confirmationError = typeof file.meta.confirmationError === "string" ? file.meta.confirmationError : null;
                return (
                    <div
                        key={file.id}
                        className="card bg-base-100 border border-base-content/10 hover:border-primary/30 group overflow-hidden"
                    >
                        <div className="card-body flex flex-col p-0">
                            {/* Visual Preview Area */}
                            <div className="relative flex h-28 w-full shrink-0 items-center justify-center overflow-hidden border-b border-base-content/5 bg-base-200/30">
                                {file.preview ? (
                                    <img
                                        src={file.preview}
                                        alt={file.name}
                                        className="w-full h-full object-cover transform opacity-100"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="p-3 bg-primary/10 rounded-xl text-primary">
                                        {getFileIcon(file.type || '', 32)}
                                    </div>
                                )}

                                {/* Hover action overlay */}
                                <div className="absolute inset-0 bg-base-300/60 opacity-0 group-hover:opacity-100 flex items-center justify-center backdrop-blur-sm transition-opacity">
                                    {(!file.progress?.uploadComplete || confirmationError) && (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(file.id); }}
                                            className="btn btn-square btn-error shadow-lg"
                                            title="Remove File"
                                            disabled={disableRemoval}
                                        >
                                            <Trash size={20} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Metadata Area */}
                            <div className="p-3 flex flex-col gap-1 mt-auto">
                                <span className="font-medium truncate text-xs" title={displayName}>{displayName}</span>
                                <div className="flex justify-between items-center text-[10px] text-base-content/50">
                                    <span>{formatSize(file.size)}</span>
                                    {file.progress?.uploadComplete && !file.progress.postprocess && !confirmationError && (
                                        <span className="text-success font-medium">Done</span>
                                    )}
                                </div>
                                {confirmationError && <p className="wrap-anywhere text-xs text-error" role="alert">{confirmationError}</p>}
                                {file.error && <p className="wrap-anywhere text-xs text-error">{file.error}</p>}
                                <div className={`transition-opacity mt-1 ${Number(file.progress?.bytesUploaded) > 0 && !file.progress?.uploadComplete ? 'opacity-100' : 'opacity-0'} h-1`}>
                                    <progress className="progress progress-primary w-full h-full" value={file.progress?.percentage || 0} max="100"></progress>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
