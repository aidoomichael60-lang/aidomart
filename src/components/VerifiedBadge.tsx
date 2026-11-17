import React from 'react';
import { ShieldCheck } from 'lucide-react';

export function VerifiedBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      title="Verified Seller — Approved by AIDOMART Administration"
      className={`inline-flex items-center gap-1 font-semibold text-[#0B1F3A] bg-orange-50 border border-orange-200 rounded ${
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[11px]'
      }`}
    >
      <ShieldCheck className={size === 'md' ? 'w-3.5 h-3.5 text-[#F97316]' : 'w-3 h-3 text-[#F97316]'} />
      <span>Verified Seller</span>
    </span>
  );
}
