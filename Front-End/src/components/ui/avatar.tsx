"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { cn } from "@/lib/utils"
import { useSignedUrl } from "@/hooks/useSignedUrl"

export type UserStatus = 'online' | 'away' | 'offline' | 'dnd'

interface AvatarProps {
  name: string
  src?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  status?: UserStatus
  showStatus?: boolean
  className?: string
}

const sizeClasses = {
  xs: 'h-6 w-6 text-[9px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
}

const statusDotSize = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-3.5 w-3.5',
}

const statusColors: Record<UserStatus, string> = {
  online: 'bg-green-500',
  away: 'bg-yellow-400',
  dnd: 'bg-red-500',
  offline: 'bg-gray-400',
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ name, src, size = 'md', status, showStatus, className }: AvatarProps) {
  const isR2Key = typeof src === 'string' && (
    src.startsWith('user-avatars/') || src.startsWith('group-avatars/') || src.startsWith('chats/')
  );
  const { url: resolvedUrl } = useSignedUrl(isR2Key ? src : undefined);
  const validSrc = isR2Key
    ? (resolvedUrl || undefined)
    : (src && src.trim() !== '' ? src : undefined);

  return (
    <span className={cn('relative inline-flex shrink-0', sizeClasses[size], className)}>
      <AvatarPrimitive.Root className={cn('flex h-full w-full shrink-0 overflow-hidden rounded-full')}>
        {validSrc && (
          <AvatarPrimitive.Image
            src={validSrc}
            alt={name}
            className="aspect-square h-full w-full object-cover"
          />
        )}
        <AvatarPrimitive.Fallback className="flex h-full w-full items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground">
          {getInitials(name)}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>

      {showStatus && status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-background',
            statusDotSize[size],
            statusColors[status]
          )}
        />
      )}
    </span>
  )
}

// Keep Radix primitives exported for any direct use
const AvatarRoot = AvatarPrimitive.Root
const AvatarImage = AvatarPrimitive.Image
const AvatarFallback = AvatarPrimitive.Fallback
export { AvatarRoot, AvatarImage, AvatarFallback }
