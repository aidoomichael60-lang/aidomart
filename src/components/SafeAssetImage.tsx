import React, { useEffect, useState } from 'react';
import { ImageOff, Store } from 'lucide-react';

interface SafeAssetImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  fallbackSubtitle?: string;
  darkFallback?: boolean;
  compact?: boolean;
}

export function SafeAssetImage({
  src,
  alt,
  className = '',
  fallbackTitle,
  fallbackSubtitle,
  darkFallback = false,
  compact = false,
}: SafeAssetImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed || !src) {
    if (compact) {
      return (
        <div
          role="img"
          aria-label={alt}
          className={`flex items-center justify-center select-none ${
            darkFallback ? 'bg-[#0B1F3A] text-white' : 'bg-slate-100 text-slate-500'
          } ${className}`}
        >
          <Store className="w-3.5 h-3.5" />
        </div>
      );
    }

    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center text-center p-4 select-none ${
          darkFallback
            ? 'bg-gradient-to-br from-[#0B1F3A] via-[#122E53] to-[#1A3F6F] text-white'
            : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700'
        } ${className}`}
      >
        <ImageOff className={`w-6 h-6 mb-2 ${darkFallback ? 'text-orange-400' : 'text-slate-400'}`} />
        <span className="text-xs font-semibold tracking-tight leading-snug max-w-[90%]">
          {fallbackTitle || alt}
        </span>
        {fallbackSubtitle && (
          <span className={`text-[11px] mt-1 font-mono ${darkFallback ? 'text-slate-300' : 'text-slate-500'}`}>
            {fallbackSubtitle}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
