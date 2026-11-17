import React from 'react';

interface WhatsAppIconProps {
  className?: string;
}

export function WhatsAppIcon({ className = 'w-4 h-4 shrink-0' }: WhatsAppIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 2.667C8.649 2.667 2.667 8.649 2.667 16c0 2.357.62 4.657 1.797 6.678L2.667 29.333l6.835-1.79A13.28 13.28 0 0 0 16 29.333c7.351 0 13.333-5.982 13.333-13.333S23.351 2.667 16 2.667Z"
        fill="#25D366"
      />
      <path
        d="M22.25 18.876c-.342-.171-2.023-.998-2.337-1.112-.314-.114-.542-.171-.77.171-.228.343-.884 1.112-1.084 1.34-.2.228-.399.257-.741.086-.342-.171-1.445-.533-2.752-1.698-1.018-.907-1.705-2.028-1.904-2.37-.2-.343-.021-.528.15-.698.154-.154.342-.4.513-.6.171-.2.228-.342.342-.57.114-.229.057-.428-.028-.6-.086-.171-.77-1.855-1.055-2.54-.278-.667-.56-.576-.77-.587l-.656-.011c-.228 0-.599.085-.913.428-.314.342-1.198 1.17-1.198 2.852 0 1.683 1.226 3.31 1.397 3.538.171.229 2.412 3.684 5.844 5.166.816.353 1.454.563 1.951.721.82.26 1.566.224 2.156.136.658-.098 2.023-.827 2.308-1.625.285-.799.285-1.483.2-1.625-.086-.143-.314-.229-.656-.4Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function buildWhatsAppUrl(rawPhone?: string | null, prefillText?: string): string | null {
  if (!rawPhone) return null;
  let digits = rawPhone.replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) {
    digits = `233${digits.slice(1)}`;
  } else if (digits.startsWith('2330') && digits.length >= 12) {
    digits = `233${digits.slice(4)}`;
  }
  const base = `https://wa.me/${digits}`;
  return prefillText ? `${base}?text=${encodeURIComponent(prefillText)}` : base;
}
