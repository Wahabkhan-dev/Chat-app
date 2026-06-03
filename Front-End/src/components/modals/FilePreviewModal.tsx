
"use client";

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { MessageFile } from '@/mock/messages';
import { Button } from '@/components/ui/button';
import {
  FileText, FileSpreadsheet, FilePieChart, Download, X, ZoomIn,
  File as FileIcon, Video, Archive, AlertCircle, Plus, Minus,
  ChevronLeft, ChevronRight, Loader2, Music,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { downloadFile } from '@/services/fileUrl';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

// ─── Inner component: resolves the signed URL and renders the file ────────────
interface GalleryItemViewProps {
  file: MessageFile;
  zoomLevel?: number;
  panX?: number;
  panY?: number;
  isDragging?: boolean;
  containerRef?: React.RefObject<HTMLDivElement>;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseUp?: () => void;
}

const GalleryItemView: React.FC<GalleryItemViewProps> = ({
  file,
  zoomLevel = 1,
  panX = 0,
  panY = 0,
  isDragging = false,
  containerRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}) => {
  const { url: signedUrl, loading } = useSignedUrl(file.key || undefined);
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
        <h3 className="text-xl font-bold">Preview not available</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
          This file cannot be previewed. Please download to view it.
        </p>
      </div>
    );
  }

  switch (file.type) {
    case 'image':
      return (
        <div
          ref={containerRef}
          className={cn(
            'relative w-full h-full overflow-hidden select-none',
            zoomLevel > 1
              ? isDragging ? 'cursor-grabbing' : 'cursor-grab'
              : 'cursor-default'
          )}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <img
            src={displayUrl}
            alt={file.name}
            draggable={false}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              maxWidth: '100%',
              maxHeight: '100%',
              transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.12s ease-out',
              willChange: 'transform',
            }}
            className="object-contain rounded-lg shadow-xl select-none animate-in fade-in zoom-in-95"
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
          <h3 className="text-xl font-bold">Preview not available</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
            This file type ({file.type?.toUpperCase()}) cannot be previewed directly.
            Please download the file to view it.
          </p>
        </div>
      );
  }
};

// ─── Thumbnail strip item ─────────────────────────────────────────────────────
const GalleryThumb: React.FC<{ file: MessageFile; active: boolean; onClick: () => void }> = ({ file, active, onClick }) => {
  const { url: signedUrl } = useSignedUrl(file.key || undefined);
  const src = signedUrl || file.url || '';
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-11 h-11 rounded-lg border-2 overflow-hidden shrink-0 transition-all cursor-pointer',
        active ? 'border-primary scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'
      )}
    >
      {file.type === 'image' && src ? (
        <img src={src} className="w-full h-full object-cover" alt="" />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <FileIcon className="h-4 w-4 text-muted-foreground" />
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
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  // Keep latest zoom+pan values accessible inside native event handlers without stale closure
  const stateRef = useRef({ zoomLevel: 1, panX: 0, panY: 0 });
  const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  useEffect(() => {
    stateRef.current = { zoomLevel, panX, panY };
  }, [zoomLevel, panX, panY]);

  const currentFile = items[currentIndex];
  const isImage = currentFile?.type === 'image';

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

  // Zoom from the image center (used by +/- buttons)
  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    const { zoomLevel: sz, panX: tx, panY: ty } = stateRef.current;
    const nz = Math.min(+(sz + ZOOM_STEP).toFixed(2), MAX_ZOOM);
    if (nz === sz) return;
    const ratio = nz / sz;
    setZoomLevel(nz);
    setPanX(tx * ratio);
    setPanY(ty * ratio);
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    const { zoomLevel: sz, panX: tx, panY: ty } = stateRef.current;
    const nz = Math.max(+(sz - ZOOM_STEP).toFixed(2), MIN_ZOOM);
    if (nz === sz) return;
    const ratio = nz / sz;
    setZoomLevel(nz);
    setPanX(tx * ratio);
    setPanY(ty * ratio);
  };

  // Reset zoom + pan whenever the viewed item changes
  useEffect(() => {
    setZoomLevel(1);
    setPanX(0);
    setPanY(0);
  }, [currentIndex]);

  // Mouse-wheel zoom anchored to the cursor position
  useEffect(() => {
    if (!open || !isImage) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      // Cursor position relative to the container's center
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;

      const { zoomLevel: sz, panX: tx, panY: ty } = stateRef.current;
      const nz = e.deltaY < 0
        ? Math.min(+(sz + ZOOM_STEP).toFixed(2), MAX_ZOOM)
        : Math.max(+(sz - ZOOM_STEP).toFixed(2), MIN_ZOOM);
      if (nz === sz) return;

      // Keep the image point under the cursor fixed after zoom
      const ratio = nz / sz;
      setZoomLevel(nz);
      setPanX(tx + (cx - tx) * (1 - ratio));
      setPanY(ty + (cy - ty) * (1 - ratio));
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [open, isImage]);

  // Keyboard navigation
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

  // Pan / drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (stateRef.current.zoomLevel <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: stateRef.current.panX,
      startPanY: stateRef.current.panY,
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setPanX(dragRef.current.startPanX + (e.clientX - dragRef.current.startX));
    setPanY(dragRef.current.startPanY + (e.clientY - dragRef.current.startY));
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragRef.current = null;
  }, []);

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
      const a = document.createElement('a');
      a.href = currentFile.url;
      a.download = currentFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  if (!open || !currentFile) return null;

  const getIcon = () => {
    switch (currentFile.type) {
      case 'pdf':    return <FileText      className="h-4 w-4 text-red-500" />;
      case 'xlsx':   return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
      case 'pptx':   return <FilePieChart  className="h-4 w-4 text-orange-500" />;
      case 'audio':  return <Music         className="h-4 w-4 text-cyan-500" />;
      case 'video':  return <Video         className="h-4 w-4 text-primary" />;
      case 'archive':return <Archive       className="h-4 w-4 text-purple-500" />;
      case 'image':  return <ZoomIn        className="h-4 w-4 text-cyan-500" />;
      default:       return <FileIcon      className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    // Dark backdrop — clicking here (outside the modal card) closes the preview
    <div
      className="fixed inset-0 z-[var(--z-modal)] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-150"
      onClick={handleClose}
    >
      {/* Modal card — centered, leaves visible backdrop on all four sides */}
      <div
        className="relative bg-card rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden w-full max-w-4xl max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-border shrink-0 bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-muted rounded-lg border border-border/40 shadow-sm shrink-0">
              {getIcon()}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate max-w-[160px] md:max-w-sm">{currentFile.name}</h3>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                  {currentIndex + 1} of {items.length}
                </span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                <span className="text-[10px] text-primary font-bold uppercase tracking-widest">
                  {currentFile.type}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-xl border-border hidden sm:flex font-bold text-xs"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download
            </Button>
            <button
              onClick={handleClose}
              title="Close (Esc)"
              className="p-2 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* ── Image / file content ── */}
        <div className="flex-1 overflow-hidden relative flex items-center min-h-0 bg-muted/10">
          {items.length > 1 && (
            <button
              onClick={handlePrev}
              className="absolute left-3 z-20 p-2.5 bg-card/80 hover:bg-card border border-border shadow-xl rounded-full transition-all text-muted-foreground hover:text-primary hover:scale-110 active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {items.length > 1 && (
            <button
              onClick={handleNext}
              className="absolute right-3 z-20 p-2.5 bg-card/80 hover:bg-card border border-border shadow-xl rounded-full transition-all text-muted-foreground hover:text-primary hover:scale-110 active:scale-95"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
          <div className="flex-1 h-full">
            <GalleryItemView
              file={currentFile}
              zoomLevel={zoomLevel}
              panX={panX}
              panY={panY}
              isDragging={isDragging}
              containerRef={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            />
          </div>
        </div>

        {/* ── Footer: zoom controls (images) + thumbnail strip (multi-file) ── */}
        {(isImage || items.length > 1) && (
          <div className="shrink-0 px-4 py-2.5 border-t border-border bg-card/50 flex items-center justify-between gap-3">

            {/* Zoom controls — only shown for images */}
            {isImage ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= MIN_ZOOM}
                  title="Zoom out"
                  className="h-8 w-8 rounded-full flex items-center justify-center border border-border bg-muted hover:bg-accent text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-bold text-muted-foreground min-w-[3.2rem] text-center tabular-nums">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= MAX_ZOOM}
                  title="Zoom in"
                  className="h-8 w-8 rounded-full flex items-center justify-center border border-border bg-muted hover:bg-accent text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div />
            )}

            {/* Thumbnail strip for multi-file galleries */}
            {items.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
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
        )}
      </div>
    </div>
  );
};

export default FilePreviewModal;
