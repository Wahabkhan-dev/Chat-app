"use client";

import React from 'react';
import { Download, Clock, Loader2 } from 'lucide-react';
import { MessageFile } from '@/mock/messages';
import { Button } from '@/components/ui/button';
import { startDownload, useIsDownloading } from '@/services/downloadManager';

function getFileIconPath(filename: string): string {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return '/icons/pdf.png';
  if (ext === 'csv') return '/icons/csv.png';
  if (['exe', 'msi', 'bat', 'cmd'].includes(ext)) return '/icons/exe.png';
  if (['ppt', 'pptx'].includes(ext)) return '/icons/ppt.png';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return '/icons/word.png';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst'].includes(ext)) return '/icons/zip.png';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'mpeg', 'mpg', '3gp', 'ogv', 'm4v', 'wmv', 'flv',
    'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma', 'opus'].includes(ext)) return '/icons/media.png';
  return '/icons/file.png';
}

function formatExpiry(expiresAt?: string): string {
  if (!expiresAt) return '';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours >= 24) return `Expires in ${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `Expires in ${hours}h`;
  return `Expires in ${Math.max(1, Math.floor(ms / (1000 * 60)))}m`;
}

const TempFileCard: React.FC<{ file: MessageFile }> = ({ file }) => {
  const isDownloading = useIsDownloading({ tempCode: file.tempCode });

  const handleDownload = () => {
    if (!file.tempCode) return;
    startDownload({ name: file.name, tempCode: file.tempCode });
  };

  return (
    <div className="bg-card text-card-foreground border border-border rounded-2xl overflow-hidden shadow-sm max-w-[320px] transition-all group">
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <div className="shrink-0 p-2.5 bg-card border border-border/40 rounded-xl shadow-sm transition-transform group-hover:scale-105">
            <img src={getFileIconPath(file.name)} alt="" className="h-8 w-8 object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate text-foreground leading-tight">{file.name}</p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-0.5">{file.size}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
          {file.expiresAt && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatExpiry(file.expiresAt)}
            </span>
          )}
          <Button
            variant="default"
            size="sm"
            className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest rounded-lg gap-1.5 bg-primary hover:bg-primary/90 text-white shadow-sm"
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TempFileCard;
