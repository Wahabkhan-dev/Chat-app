"use client";

import React, { useEffect } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Download, RotateCw, X, AlertCircle, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useDownloads,
  cancelDownload,
  retryDownload,
  removeDownload,
  clearFinishedDownloads,
  closeDownloadsPanel,
  toggleDownloadsPanelCollapsed,
  type DownloadItem,
} from '@/services/downloadManager';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIconPath(filename: string): string {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return '/icons/pdf.png';
  if (ext === 'csv') return '/icons/csv.png';
  if (['exe', 'msi', 'bat', 'cmd'].includes(ext)) return '/icons/exe.png';
  if (['ppt', 'pptx'].includes(ext)) return '/icons/ppt.png';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return '/icons/word.png';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst'].includes(ext)) return '/icons/zip.png';
  if (['mp4','webm','mov','avi','mkv','mpeg','mpg','3gp','ogv','m4v','wmv','flv',
       'mp3','wav','ogg','m4a','aac','flac','wma','opus'].includes(ext)) return '/icons/media.png';
  return '/icons/file.png';
}

const DownloadRow: React.FC<{ item: DownloadItem }> = ({ item }) => {
  const pct = item.total ? Math.min(100, Math.round((item.loaded / item.total) * 100)) : null;

  let detail: string;
  if (item.status === 'downloading') {
    detail = item.total
      ? `${formatBytes(item.loaded)} of ${formatBytes(item.total)} · ${pct}%`
      : item.loaded > 0 ? `${formatBytes(item.loaded)} downloaded` : 'Starting…';
  } else if (item.status === 'completed') {
    detail = item.total ? `${formatBytes(item.total)} · Saved to Downloads` : 'Saved to Downloads';
  } else if (item.status === 'cancelled') {
    detail = 'Cancelled';
  } else {
    detail = item.error || 'Download failed';
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 group">
      <img src={getFileIconPath(item.name)} alt="" className="h-8 w-8 object-contain shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate text-foreground" title={item.name}>{item.name}</p>
        <p className={cn(
          'text-[10px] font-medium truncate mt-0.5',
          item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {detail}
        </p>
        {item.status === 'downloading' && (
          <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
            {pct !== null ? (
              <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
            ) : (
              <div className="h-full w-1/3 bg-primary rounded-full animate-pulse" />
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1">
        {item.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-label="Completed" />}
        {item.status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive" aria-label="Failed" />}
        {item.status === 'cancelled' && <Ban className="h-4 w-4 text-muted-foreground" aria-label="Cancelled" />}
        {(item.status === 'failed' || item.status === 'cancelled') && (
          <button
            onClick={() => retryDownload(item.id)}
            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
            title="Retry"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => (item.status === 'downloading' ? cancelDownload(item.id) : removeDownload(item.id))}
          className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={item.status === 'downloading' ? 'Cancel download' : 'Remove from list'}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

const DownloadsPanel: React.FC = () => {
  const { items, panelOpen, panelCollapsed } = useDownloads();
  const activeCount = items.filter((it) => it.status === 'downloading').length;
  const finishedCount = items.length - activeCount;

  // Warn before the tab is closed or reloaded while files are still downloading
  useEffect(() => {
    if (activeCount === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [activeCount]);

  if (!panelOpen || items.length === 0) return null;

  const title = activeCount > 0
    ? `Downloading ${activeCount} file${activeCount === 1 ? '' : 's'}`
    : `Downloads (${items.length})`;

  return (
    <div
      className="fixed z-[55] left-4 right-4 bottom-20 md:bottom-4 md:left-auto md:w-[360px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200"
      role="region"
      aria-label="Downloads"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <Download className="h-4 w-4 text-primary shrink-0" />
        <h3 className="text-xs font-bold flex-1 truncate" aria-live="polite">{title}</h3>
        {finishedCount > 0 && !panelCollapsed && (
          <button
            onClick={clearFinishedDownloads}
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary px-2 py-1 rounded-lg hover:bg-muted transition-colors"
          >
            Clear
          </button>
        )}
        <button
          onClick={toggleDownloadsPanelCollapsed}
          className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={panelCollapsed ? 'Expand' : 'Minimize'}
        >
          {panelCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button
          // While files are still downloading, closing only minimizes so progress stays reachable
          onClick={activeCount > 0 ? (panelCollapsed ? undefined : toggleDownloadsPanelCollapsed) : closeDownloadsPanel}
          disabled={activeCount > 0 && panelCollapsed}
          className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
          title={activeCount > 0 ? 'Downloads in progress' : 'Close'}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!panelCollapsed && (
        <div className="max-h-[50vh] md:max-h-[320px] overflow-y-auto divide-y divide-border">
          {items.map((item) => <DownloadRow key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
};

export default DownloadsPanel;
