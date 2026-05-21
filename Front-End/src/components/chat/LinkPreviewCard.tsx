"use client";

import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LinkMetadata {
  url: string;
  title: string;
  description?: string;
  domain: string;
}

interface LinkPreviewCardProps {
  metadata: LinkMetadata;
  className?: string;
}

const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ metadata, className }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(metadata.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div 
      onClick={handleClick}
      className={cn(
        "mt-3 bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/30 hover:shadow-lg transition-all group max-w-[420px] animate-in fade-in slide-in-from-top-1",
        className
      )}
    >
      <div className="p-4 space-y-2">
        <h4 className="text-sm font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors leading-tight">
          {metadata.title}
        </h4>
        
        {metadata.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed italic opacity-80">
            {metadata.description}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-muted rounded-md shrink-0 ring-1 ring-border/50">
              <Globe className="h-3 w-3 text-muted-foreground" />
            </div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
              {metadata.domain}
            </p>
          </div>
          
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-primary uppercase tracking-widest px-2 py-1 bg-primary/5 rounded-full border border-primary/10 opacity-0 group-hover:opacity-100 transition-opacity">
            <span>Visit</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinkPreviewCard;
