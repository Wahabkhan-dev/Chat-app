
"use client";

import React, { useEffect, useCallback, useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { MessageFile } from '@/mock/messages';
import Modal from '../ui/Modal';
import { Button } from '@/components/ui/button';
import {
  FileText, FileSpreadsheet, FilePieChart, Download, X,
  File as FileIcon, Video, Archive, Search, AlertCircle,
  ChevronLeft, ChevronRight, Loader2, Music,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { downloadFile } from '@/services/fileUrl';

// ─── Inner component: resolves the signed URL for the current item ────────────
const GalleryItemView: React.FC<{ file: MessageFile }> = ({ file }) => {
  const { url: signedUrl, loading } = useSignedUrl(file.key || undefined);
  // Prefer signed URL (R2 key), then fall back to url (blob / direct URL)
  const displayUrl = signedUrl || file.url || '';

  if (loading && !file.url) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!displayUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6">
          <AlertCircle className="h-10 w-10 text-muted-foreground opacity-30" />
        </div>
        <h3 className="text-xl font-bold font-headline">Preview not available</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
          This file cannot be previewed because the secure URL is unavailable or expired.
          Please download the file to view it.
        </p>
      </div>
    );
  }

  switch (file.type) {
    case 'image':
      return (
        <div className="flex items-center justify-center h-full p-4">
          <img
            src={displayUrl}
            alt={file.name}
            className="max-h-full max-w-full object-contain rounded-lg shadow-2xl transition-all duration-300 animate-in fade-in zoom-in-95"
          />
        </div>
      );
    case 'video':
      return (
        <div className="flex items-center justify-center h-full bg-black">
          <video key={displayUrl} src={displayUrl} controls autoPlay className="max-h-full max-w-full" />
        </div>
      );
    case 'audio':
      return (
        <div className="flex items-center justify-center h-full p-8 bg-muted">
          <audio src={displayUrl} controls className="w-full max-w-2xl" />
        </div>
      );
    case 'pdf':
      return (
        <div className="h-full w-full">
          <embed src={displayUrl} type="application/pdf" className="h-full w-full" />
        </div>
      );
    case 'document':
    case 'xlsx':
    case 'pptx':
    case 'docx':
    case 'txt':
      return (
        <div className="h-full w-full bg-card flex flex-col">
          <iframe src={displayUrl} className="flex-1 w-full border-none" title={file.name} />
        </div>
      );
    default:
      return (
        <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6">
            <AlertCircle className="h-10 w-10 text-muted-foreground opacity-30" />
          </div>
          <h3 className="text-xl font-bold font-headline">Preview not available</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
            This file type ({file.type?.toUpperCase()}) cannot be previewed directly.
            Please download the file to view it.
          </p>
        </div>
      );
  }
};

// ─── Thumbnail that resolves its own signed URL ───────────────────────────────
const GalleryThumb: React.FC<{ file: MessageFile; active: boolean; onClick: () => void }> = ({ file, active, onClick }) => {
  const { url: signedUrl } = useSignedUrl(file.key || undefined);
  const src = signedUrl || file.url || '';
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-12 h-12 rounded-lg border-2 overflow-hidden shrink-0 transition-all',
        active ? 'border-primary scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'
      )}
    >
      {file.type === 'image' && src ? (
        <img src={src} className="w-full h-full object-cover" alt="" />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <FileIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
    </button>
  );
};

// ─── Main modal ───────────────────────────────────────────────────────────────
const FilePreviewModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { open, items, currentIndex } = state.mediaGallery;
  const [downloading, setDownloading] = useState(false);

  const currentFile = items[currentIndex];

  const handleClose = useCallback(() => {
    dispatch({ type: 'CLOSE_GALLERY' });
  }, [dispatch]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    dispatch({ type: 'NAVIGATE_GALLERY', payload: -1 });
  }, [dispatch]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    dispatch({ type: 'NAVIGATE_GALLERY', payload: 1 });
  }, [dispatch]);

  const handleDownload = async () => {
    if (!currentFile) return;
    if (currentFile.key) {
      setDownloading(true);
      try {
        await downloadFile(currentFile.key, currentFile.name);
      } catch {
        dispatch({ type: 'ADD_TOAST', payload: { message: 'Download failed', type: 'error' } });
      } finally {
        setDownloading(false);
      }
    } else if (currentFile.url) {
      // Blob URL (pre-upload preview) — use anchor download
      const a = document.createElement('a');
      a.href = currentFile.url;
      a.download = currentFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handlePrev, handleNext, handleClose]);

  if (!open || !currentFile) return null;

  const getIcon = () => {
    switch (currentFile.type) {
      case 'pdf': return <FileText className="h-5 w-5 text-red-500" />;
      case 'xlsx': return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
      case 'pptx': return <FilePieChart className="h-5 w-5 text-orange-500" />;
      case 'audio': return <Music className="h-5 w-5 text-cyan-500" />;
      case 'video': return <Video className="h-5 w-5 text-primary" />;
      case 'archive': return <Archive className="h-5 w-5 text-purple-500" />;
      case 'image': return <Search className="h-5 w-5 text-cyan-500" />;
      default: return <FileIcon className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <Modal isOpen={true} onClose={handleClose} maxWidth="max-w-6xl">
      <div className="h-[90vh] flex flex-col bg-card overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b bg-card/50 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-xl border border-border/40 shadow-sm">{getIcon()}</div>
            <div>
              <h3 className="text-sm font-bold truncate max-w-[200px] md:max-w-md">{currentFile.name}</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{currentIndex + 1} of {items.length}</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                <span className="text-[10px] text-primary font-bold uppercase tracking-widest">{currentFile.type}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-xl border-border hidden sm:flex font-bold"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download
            </Button>
            <button onClick={handleClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content & Navigation */}
        <div className="flex-1 overflow-hidden relative bg-muted/20 flex items-center">
          {items.length > 1 && (
            <>
              <button
                onClick={handlePrev}
                className="absolute left-4 z-20 p-3 bg-card/80 hover:bg-card border shadow-xl rounded-full transition-all text-muted-foreground hover:text-primary hover:scale-110 active:scale-95"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={handleNext}
                className="absolute right-4 z-20 p-3 bg-card/80 hover:bg-card border shadow-xl rounded-full transition-all text-muted-foreground hover:text-primary hover:scale-110 active:scale-95"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <div className="flex-1 h-full">
            <GalleryItemView file={currentFile} />
          </div>
        </div>

        {/* Gallery Thumbnails */}
        {items.length > 1 && (
          <div className="p-4 border-t bg-card/50 flex justify-center gap-2 overflow-x-auto scrollbar-hide">
            {items.map((item, idx) => (
              <GalleryThumb
                key={idx}
                file={item}
                active={currentIndex === idx}
                onClick={() => dispatch({ type: 'OPEN_GALLERY', payload: { items, index: idx } })}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default FilePreviewModal;
