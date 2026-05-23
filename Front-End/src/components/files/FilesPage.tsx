"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { useSharedFilesLoader } from '@/hooks/useSharedFiles';
import { downloadFile } from '@/services/fileUrl';
import { FileText, FileSpreadsheet, FileImage, Download, Search, ExternalLink, File, MessageSquare, Loader2, Video, Music, Link as LinkIcon, Globe } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const FilesPage: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const sharedFiles = useSharedFilesLoader();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'docs' | 'media' | 'link'>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const filteredFiles = sharedFiles.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesFilter = false;
    if (activeFilter === 'all') {
      matchesFilter = true;
    } else if (activeFilter === 'docs') {
      matchesFilter = ['pdf', 'xlsx', 'pptx', 'docx', 'document', 'txt'].includes(file.type);
    } else if (activeFilter === 'media') {
      matchesFilter = ['image', 'video'].includes(file.type);
    } else if (activeFilter === 'link') {
      matchesFilter = file.type === 'link';
    }
    
    return matchesSearch && matchesFilter;
  });

  const getConversationDisplayName = (file: any) => {
    // Always prefer the backend-provided conversation name
    if (file?.conversationName) return file.conversationName;
    return file.conversationId;
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText className="h-5 w-5 text-red-500" />;
      case 'xlsx': return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
      case 'pptx': return <File className="h-5 w-5 text-orange-500" />;
      case 'image': return <FileImage className="h-5 w-5 text-accent" />;
      case 'video': return <Video className="h-5 w-5 text-primary" />;
      case 'audio': return <Music className="h-5 w-5 text-cyan-500" />;
      case 'link': return <LinkIcon className="h-5 w-5 text-blue-500" />;
      default: return <FileText className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const handleDownload = async (file: any) => {
    if (file.type === 'link') {
      window.open(file.previewUrl || file.url || file.name, '_blank');
      return;
    }

    setDownloadingId(file.id);
    try {
      if (file.key) {
        await downloadFile(file.key, file.name);
      } else if (file.url) {
        const anchor = document.createElement('a');
        anchor.href = file.url;
        anchor.download = file.name;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      } else {
        throw new Error('Download source unavailable');
      }
    } catch (error) {
      console.error('[FilesPage] download failed', error);
      dispatch({ type: 'ADD_TOAST', payload: { message: `Download failed for ${file.name}`, type: 'error' } });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleGoToConversation = (conversationId: string, focusMessageId?: number | null, file?: any) => {
    // Prefer backend-provided conversation name
    const conversationName = file?.conversationName || conversationId;

    const group = state.groups.find(g => g.id === conversationId);
    if (group) {
      dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'chat' });
      dispatch({
          type: 'SET_ACTIVE_CONVERSATION',
          payload: { type: 'group', id: group.id, name: group.name, avatar: group.avatar }
        });
      if (focusMessageId) {
        // persist focus across reloads via URL param
        try { router.replace(`${window.location.pathname}?focusMessageId=${focusMessageId}`); } catch (e) {}
        attemptScrollToMessage(focusMessageId);
      }
      return;
    }

    const [, a, b] = conversationId.split('_');
    const otherUserId = String(state.currentUser?.id) === a ? b : a;
    const user = state.users.find(u => u.id === otherUserId);

    if (user) {
      dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'chat' });
      dispatch({
        type: 'SET_ACTIVE_CONVERSATION',
        payload: { type: 'dm', id: conversationId, name: (user.displayName || user.name), avatar: user.avatar }
      });
      if (focusMessageId) {
        try { router.replace(`${window.location.pathname}?focusMessageId=${focusMessageId}`); } catch (e) {}
        attemptScrollToMessage(focusMessageId);
      }
      return;
    }

    // Fallback: use backend-provided name or conversation ID
    dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'chat' });
    dispatch({
      type: 'SET_ACTIVE_CONVERSATION',
      payload: {
        type: conversationId.startsWith('dm_') ? 'dm' : 'group',
        id: conversationId,
        name: conversationName,
        avatar: null,
      },
    });
    if (focusMessageId) attemptScrollToMessage(focusMessageId);
  };

  const attemptScrollToMessage = (messageId: number) => {
    let attempts = 0;
    const maxAttempts = 25; // ~5 seconds total
    const interval = 200;
    const tryScroll = () => {
      attempts += 1;
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-4','ring-primary/40','rounded-2xl');
        setTimeout(() => el.classList.remove('ring-4','ring-primary/40','rounded-2xl'), 2000);
        return;
      }
      if (attempts < maxAttempts) setTimeout(tryScroll, interval);
    };
    setTimeout(tryScroll, 300);
  };

  return (
    <div className="flex-1 bg-background p-8 overflow-y-auto scrollbar-hide animate-in fade-in duration-500">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-headline text-foreground tracking-tight">Shared Content Repository</h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">Browse and manage all documents, media, and links shared across your workspace.</p>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search shared assets..." 
              className="pl-10 border-none bg-muted/50 dark:bg-muted/20 rounded-xl h-11"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-1 w-full md:w-auto scrollbar-hide">
            <Button 
              variant={activeFilter === 'all' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setActiveFilter('all')}
              className={cn("text-xs font-bold rounded-lg px-4 h-9", activeFilter === 'all' ? "bg-primary text-white" : "text-muted-foreground")}
            >
              All Assets
            </Button>
            <Button 
              variant={activeFilter === 'docs' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setActiveFilter('docs')}
              className={cn("text-xs font-bold rounded-lg px-4 h-9", activeFilter === 'docs' ? "bg-primary text-white" : "text-muted-foreground")}
            >
              Documents
            </Button>
            <Button 
              variant={activeFilter === 'media' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setActiveFilter('media')}
              className={cn("text-xs font-bold rounded-lg px-4 h-9", activeFilter === 'media' ? "bg-primary text-white" : "text-muted-foreground")}
            >
              Media
            </Button>
            <Button 
              variant={activeFilter === 'link' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setActiveFilter('link')}
              className={cn("text-xs font-bold rounded-lg px-4 h-9", activeFilter === 'link' ? "bg-primary text-white" : "text-muted-foreground")}
            >
              Links
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredFiles.map(file => (
            <div key={file.id} className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-xl hover:border-primary/30 transition-all group flex flex-col shadow-sm">
              {file.type === 'image' && file.previewUrl ? (
                <div className="h-40 bg-muted relative overflow-hidden cursor-pointer" onClick={() => dispatch({ type: 'OPEN_LIGHTBOX', payload: { items: [{ id: file.id, url: file.previewUrl, fileName: file.name, timestamp: file.timestamp, senderId: file.uploadedBy }], index: 0 } })}>
                  <img src={file.previewUrl} alt={file.name} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button variant="secondary" size="icon" className="rounded-full shadow-lg h-10 w-10"><ExternalLink className="h-5 w-5" /></Button>
                  </div>
                </div>
              ) : file.type === 'video' && file.previewUrl ? (
                <div className="h-40 bg-black relative overflow-hidden cursor-pointer group" onClick={() => dispatch({ type: 'OPEN_GALLERY', payload: { items: [{ url: file.previewUrl, name: file.name, type: 'video', size: file.size }], index: 0 } })}>
                  <video src={file.previewUrl} className="w-full h-full object-cover opacity-60" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 group-hover:scale-110 transition-transform">
                      <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1" />
                    </div>
                  </div>
                </div>
              ) : file.type === 'link' ? (
                <div className="h-40 bg-blue-50 dark:bg-blue-900/10 flex items-center justify-center relative">
                   <div className="scale-[2.5] text-blue-500"><Globe className="h-5 w-5" /></div>
                   <div className="absolute top-3 right-3">
                    <Badge variant="outline" className="text-[10px] uppercase font-bold bg-white/80 dark:bg-black/20 backdrop-blur-sm border-blue-200 text-blue-600">LINK</Badge>
                  </div>
                </div>
              ) : (
                <div className={cn(
                  "h-40 flex items-center justify-center transition-colors relative",
                  file.type === 'pdf' ? 'bg-red-500/5' : file.type === 'xlsx' ? 'bg-green-500/5' : 'bg-muted/30'
                )}>
                  <div className="scale-[2.5]">{getFileIcon(file.type)}</div>
                  <div className="absolute top-3 right-3">
                    <Badge variant="outline" className="text-[10px] uppercase font-bold bg-white/80 dark:bg-black/20 backdrop-blur-sm border-border">{file.type}</Badge>
                  </div>
                </div>
              )}
              
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground leading-tight line-clamp-2 pr-2">{file.name}</h3>
                    <p className="text-[11px] text-muted-foreground truncate mt-1">{getConversationDisplayName(file)}</p>
                  </div>
                </div>
                
                <div className="space-y-3 mt-auto">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    <span>{file.size}</span>
                    <span>{format(new Date(file.timestamp), 'MMM d, yyyy')}</span>
                  </div>
                  
                  <div className="flex gap-2 pt-3 border-t border-border/50">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 text-[10px] h-9 gap-2 uppercase tracking-wider font-bold border-border rounded-xl hover:bg-primary/5 hover:text-primary transition-all"
                      onClick={() => handleGoToConversation(file.conversationId, file.originMessageId || file.messageId, file)}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      View Chat
                    </Button>
                    <Button 
                      variant="default" 
                      size="sm" 
                      disabled={downloadingId === file.id}
                      className={cn(
                        "h-9 w-9 p-0 rounded-xl shadow-lg transition-all",
                        file.type === 'link' ? "bg-blue-500 hover:bg-blue-600 shadow-blue-500/20" : "bg-primary hover:bg-primary/90 shadow-primary/20"
                      )}
                      onClick={() => handleDownload(file)}
                    >
                      {downloadingId === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : file.type === 'link' ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filteredFiles.length === 0 && (
            <div className="col-span-full py-32 text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-48 h-48 bg-muted rounded-full flex items-center justify-center mb-8 shadow-inner">
                 <Search className="h-20 w-20 text-muted-foreground opacity-20" />
              </div>
              <h3 className="text-2xl font-bold font-headline text-foreground">No matching {activeFilter === 'all' ? 'assets' : activeFilter} found</h3>
              <p className="text-muted-foreground max-w-sm mt-3 font-medium">We couldn't find any content matching your search or filter. Try a different term or clear filters.</p>
              <Button variant="outline" className="mt-8 border-border h-11 px-8 rounded-xl font-bold" onClick={() => { setSearchQuery(''); setActiveFilter('all'); }}>Clear All Filters</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilesPage;
