
"use client";

import React, { useState } from 'react';
import { FileIcon, FileText, FileSpreadsheet, FileImage, Download, FilePieChart, Eye, Loader2, Search, Archive, Video, Music } from 'lucide-react';
import { FileType } from '@/mock/messages';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppContext';
import { downloadFile } from '@/services/fileUrl';

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

  const getIcon = () => {
    switch (type) {
      case 'pdf': return <FileText className="h-8 w-8 text-red-500" />;
      case 'xlsx': return <FileSpreadsheet className="h-8 w-8 text-green-600" />;
      case 'docx': return <FileText className="h-8 w-8 text-blue-600" />;
      case 'pptx': return <FilePieChart className="h-8 w-8 text-orange-500" />;
      case 'image': return <FileImage className="h-8 w-8 text-cyan-500" />;
      case 'archive': return <Archive className="h-8 w-8 text-purple-500" />;
      case 'video': return <Video className="h-8 w-8 text-foreground" />;
      case 'audio': return <Music className="h-8 w-8 text-cyan-500" />;
      default: return <FileIcon className="h-8 w-8 text-gray-400" />;
    }
  };

  const getThemeColor = () => {
    switch (type) {
      case 'pdf': return 'border-red-500/20 bg-red-500/5';
      case 'xlsx': return 'border-green-500/20 bg-green-500/5';
      case 'docx': return 'border-blue-500/20 bg-blue-500/5';
      case 'pptx': return 'border-orange-500/20 bg-orange-500/5';
      case 'archive': return 'border-purple-500/20 bg-purple-500/5';
      case 'image': return 'border-cyan-500/20 bg-cyan-500/5';
      case 'audio': return 'border-cyan-500/20 bg-cyan-500/5';
      default: return 'border-border bg-muted/5';
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
