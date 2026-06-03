"use client";

import React, { useState } from 'react';
import { MessageFile } from '@/mock/messages';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Download, Play, FileIcon, Eye, Loader2, AlertCircle } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { downloadFile } from '@/services/fileUrl';
import { toast } from '@/hooks/use-toast';
import FileCard from '../ui/FileCard';

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

interface FileRendererProps {
  files: MessageFile[];
  messageId: string;
  senderId: string;
  timestamp: string;
}

// ── Single file components ────────────────────────────────────────────────────

const SecureImage: React.FC<{ file: MessageFile; onView: () => void }> = ({ file, onView }) => {
  const { url, loading, error } = useSignedUrl(file.key);
  const [downloading, setDownloading] = useState(false);
  const src = file.key ? url : file.url;

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!file.key) {
      if (src) {
        const a = document.createElement('a');
        a.href = src;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      return;
    }

    setDownloading(true);
    try {
      await downloadFile(file.key, file.name);
    } catch (error) {
      console.error('[FileRenderer] download failed', error);
      toast({ title: 'Download failed', description: `Could not download ${file.name}.`, variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return (
    <div className="w-[220px] h-[160px] rounded-xl bg-muted flex items-center justify-center border border-border">
      <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
    </div>
  );
  if (!src) return (
    <div className="w-[220px] h-[100px] rounded-xl bg-muted flex flex-col items-center justify-center gap-1 border border-border text-muted-foreground text-xs">
      <AlertCircle className="h-5 w-5" />
      <span>Image unavailable</span>
    </div>
  );
  if (error) return (
    <div className="w-[220px] h-[100px] rounded-xl bg-muted flex flex-col items-center justify-center gap-1 border border-border text-muted-foreground text-xs">
      <AlertCircle className="h-5 w-5" />
      <span>Image unavailable</span>
    </div>
  );

  return (
    <div
      className="relative max-w-[320px] rounded-xl overflow-hidden group cursor-pointer border border-border shadow-sm"
      onClick={onView}
    >
      <img
        src={src!}
        alt={file.name}
        loading="lazy"
        className="w-full h-auto object-contain max-h-[400px] transition-transform group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <Button variant="secondary" size="sm" className="h-8 w-8 p-0 rounded-full shadow-lg" onClick={(e) => { e.stopPropagation(); onView(); }}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" className="h-8 w-8 p-0 rounded-full shadow-lg" disabled={downloading} onClick={handleDownload}>
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

const SecureVideo: React.FC<{ file: MessageFile; onView: () => void }> = ({ file, onView }) => {
  const { url, loading, error } = useSignedUrl(file.key);
  const src = file.key ? url : file.url;

  if (loading) return (
    <div className="w-[280px] aspect-video rounded-xl bg-muted flex items-center justify-center border border-border">
      <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
    </div>
  );
  if (!src) return (
    <div className="w-[280px] aspect-video rounded-xl bg-muted flex flex-col items-center justify-center gap-1 border border-border text-muted-foreground text-xs">
      <AlertCircle className="h-5 w-5" />
      <span>Video unavailable</span>
    </div>
  );
  if (error) return (
    <div className="w-[280px] aspect-video rounded-xl bg-muted flex flex-col items-center justify-center gap-1 border border-border text-muted-foreground text-xs">
      <AlertCircle className="h-5 w-5" />
      <span>Video unavailable</span>
    </div>
  );

  return (
    <div
      className="relative max-w-[320px] aspect-video bg-black rounded-xl overflow-hidden group cursor-pointer border border-border shadow-lg"
      onClick={onView}
    >
      <video src={src!} preload="metadata" className="w-full h-full object-cover opacity-80" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center transition-transform group-hover:scale-110 group-hover:bg-white/30 border border-white/30">
          <Play className="h-7 w-7 text-white fill-white ml-1" />
        </div>
      </div>
      <div className="absolute bottom-2 left-3 text-[10px] text-white font-bold bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm truncate max-w-[80%]">
        {file.name}
      </div>
    </div>
  );
};

const SecureDoc: React.FC<{ file: MessageFile; messageId: string; onView: () => void }> = ({ file, messageId, onView }) => {
  const { url } = useSignedUrl(file.key);
  const src = file.key ? url : file.url;
  return (
    <FileCard
      name={file.name}
      type={file.type}
      size={file.size}
      previewUrl={src || ''}
      fileKey={file.key}
      messageId={messageId}
      showActionsInBubble
      onView={onView}
    />
  );
};

// ── Grid thumbnail (multi-file) ───────────────────────────────────────────────

const GridThumb: React.FC<{ file: MessageFile; idx: number; remainingCount: number; onView: () => void }> = ({ file, idx, remainingCount, onView }) => {
  const { url, loading } = useSignedUrl(file.key);
  const src = file.key ? url : file.url;

  return (
    <div
      className="relative aspect-square bg-muted group overflow-hidden cursor-pointer rounded-xl flex items-center justify-center border border-border"
      onClick={onView}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      ) : file.type === 'image' && src ? (
        <img src={src} alt={file.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
      ) : file.type === 'video' && src ? (
        <div className="relative w-full h-full">
          <video src={src} className="w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="h-8 w-8 text-white fill-white opacity-80" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 px-2">
          <img src={getFileIconPath(file.name)} alt="" className="h-10 w-10 object-contain" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase text-center truncate w-full">{file.name}</span>
        </div>
      )}

      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
          <Eye className="h-4 w-4 text-white" />
        </div>
      </div>

      {idx === 3 && remainingCount > 0 && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-lg font-bold backdrop-blur-[2px]">
          +{remainingCount}
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const FileRenderer: React.FC<FileRendererProps> = ({ files, messageId, senderId, timestamp }) => {
  const { dispatch } = useAppContext();

  if (!files || files.length === 0) return null;

  const openGallery = (idx: number) => {
    dispatch({ type: 'OPEN_GALLERY', payload: { items: files, index: idx } });
  };

  if (files.length === 1) {
    const file = files[0];
    if (file.type === 'image') return <SecureImage file={file} onView={() => openGallery(0)} />;
    if (file.type === 'video') return <SecureVideo file={file} onView={() => openGallery(0)} />;
    return <SecureDoc file={file} messageId={messageId} onView={() => openGallery(0)} />;
  }

  const visibleFiles = files.slice(0, 4);
  const remainingCount = files.length - 4;

  return (
    <div className="grid grid-cols-2 gap-2 max-w-[400px]">
      {visibleFiles.map((file, idx) => (
        <GridThumb key={idx} file={file} idx={idx} remainingCount={remainingCount} onView={() => openGallery(idx)} />
      ))}
    </div>
  );
};

export default FileRenderer;
