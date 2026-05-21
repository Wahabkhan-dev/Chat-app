
"use client";

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
  description?: string;
  className?: string;
}

const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  icon: Icon,
  color = 'text-primary',
  description,
  className,
}) => {
  // Extract color name to generate background class safely
  const colorName = color.split('-')[1] || 'primary';
  
  return (
    <div className={cn('bg-card p-6 rounded-2xl shadow-sm border border-border transition-all hover:shadow-md', className)}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
          <h3 className={cn('text-3xl font-bold mt-2', color)}>{value}</h3>
          {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        </div>
        <div className={cn('p-3 rounded-xl flex items-center justify-center bg-muted/50')}>
          <Icon className={cn('h-6 w-6', color)} />
        </div>
      </div>
    </div>
  );
};

export default KPICard;
