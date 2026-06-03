
"use client";

import React, { useState } from 'react';
import { Download, Eye, Loader2 } from 'lucide-react';
import { FileType } from '@/mock/messages';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppContext';
import { downloadFile } from '@/services/fileUrl';

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

interface FileCardProps {
  name: string;
  type: string;
  size: string;
  previewUrl?: string;
  fileKey?: string;
  className?: string;
  showActionsInBubble?: boolean;
  messageId?: string;
  onView?: () => void;
}

const FileCard: React.FC<FileCardProps> = ({ name, type, size, previewUrl, fileKey, className, showActionsInBubble, messageId, onView }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const { dispatch } = useAppContext();

  const getIcon = () => (
    <img src={getFileIconPath(name)} alt="" className="h-8 w-8 object-contain" />
  );

  const getThemeColor = () => {
    switch (type) {
      case 'archive': return 'border-purple-500/20 bg-purple-500/5';
      case 'image':   return 'border-cyan-500/20 bg-cyan-500/5';
      case 'audio':   return 'border-cyan-500/20 bg-cyan-500/5';
      default:        return 'border-border bg-muted/5';
    }
  };

  const handleDownload = async () => {
    if (!fileKey && !previewUrl) {
      toast({ title: 'Download unavailable', variant: 'destructive' });
      return;
    }
    setIsDownloading(true);
    try {
      if (fileKey) {
        await downloadFile(fileKey, name);
      } else {
        const a = document.createElement('a');
        a.href = previewUrl!;
        a.download = name;
        a.click();
      }
    } catch {
      toast({ title: 'Download failed', variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePreview = () => {
    if (onView) {
      onView();
      return;
    }
    dispatch({ 
      type: 'OPEN_GALLERY', 
      payload: { 
        items: [{ url: previewUrl || '', name, type, size }], 
        index: 0 
      } 
    });
  };

  return (
    <div className={cn(
      'bg-card text-card-foreground border rounded-2xl overflow-hidden shadow-sm max-w-[320px] transition-all group',
      getThemeColor(),
      className
    )}>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <div className="shrink-0 p-2.5 bg-card border border-border/40 rounded-xl shadow-sm transition-transform group-hover:scale-105">
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate text-foreground leading-tight">{name}</p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-0.5">{size}</p>
          </div>
        </div>

        {showActionsInBubble && (
          <div className="flex gap-2 pt-3 border-t border-border/50">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest rounded-lg gap-1.5 border-border hover:bg-card hover:text-primary transition-all"
              onClick={handlePreview}
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </Button>
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
        )}
      </div>
    </div>
  );
};

export default FileCard;
