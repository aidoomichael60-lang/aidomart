import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface CountryDialOption {
  code: string;
  name: string;
  dial: string;
  flag: string;
}

export const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: 'GH', name: 'Ghana', dial: '+233', flag: '🇬🇭' },
  { code: 'NG', name: 'Nigeria', dial: '+234', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya', dial: '+254', flag: '🇰🇪' },
  { code: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦' },
  { code: 'CI', name: "Côte d'Ivoire", dial: '+225', flag: '🇨🇮' },
  { code: 'TG', name: 'Togo', dial: '+228', flag: '🇹🇬' },
  { code: 'BJ', name: 'Benin', dial: '+229', flag: '🇧🇯' },
  { code: 'SN', name: 'Senegal', dial: '+221', flag: '🇸🇳' },
  { code: 'CM', name: 'Cameroon', dial: '+237', flag: '🇨🇲' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { code: 'EG', name: 'Egypt', dial: '+20', flag: '🇪🇬' },
  { code: 'ET', name: 'Ethiopia', dial: '+251', flag: '🇪🇹' },
  { code: 'TZ', name: 'Tanzania', dial: '+255', flag: '🇹🇿' },
  { code: 'UG', name: 'Uganda', dial: '+256', flag: '🇺🇬' },
  { code: 'RW', name: 'Rwanda', dial: '+250', flag: '🇷🇼' },
  { code: 'MA', name: 'Morocco', dial: '+212', flag: '🇲🇦' },
  { code: 'BF', name: 'Burkina Faso', dial: '+226', flag: '🇧🇫' },
  { code: 'ML', name: 'Mali', dial: '+223', flag: '🇲🇱' },
  { code: 'NE', name: 'Niger', dial: '+227', flag: '🇳🇪' },
  { code: 'SL', name: 'Sierra Leone', dial: '+232', flag: '🇸🇱' },
  { code: 'LR', name: 'Liberia', dial: '+231', flag: '🇱🇷' },
  { code: 'GM', name: 'Gambia', dial: '+220', flag: '🇬🇲' },
  { code: 'ZM', name: 'Zambia', dial: '+260', flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe', dial: '+263', flag: '🇿🇼' },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦' },
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { code: 'IT', name: 'Italy', dial: '+39', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands', dial: '+31', flag: '🇳🇱' },
  { code: 'BE', name: 'Belgium', dial: '+32', flag: '🇧🇪' },
  { code: 'CH', name: 'Switzerland', dial: '+41', flag: '🇨🇭' },
  { code: 'TR', name: 'Turkey', dial: '+90', flag: '🇹🇷' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'CN', name: 'China', dial: '+86', flag: '🇨🇳' },
  { code: 'JP', name: 'Japan', dial: '+81', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', dial: '+82', flag: '🇰🇷' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { code: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷' },
  { code: 'JM', name: 'Jamaica', dial: '+1876', flag: '🇯🇲' },
];

// Sort longest dial codes first when auto-detecting prefix from an existing value
const SORTED_BY_DIAL_LENGTH = [...COUNTRY_DIAL_OPTIONS].sort(
  (a, b) => b.dial.length - a.dial.length
);

function parsePhoneValue(value: string): { country: CountryDialOption; local: string } {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return { country: COUNTRY_DIAL_OPTIONS[0], local: '' };
  }
  if (trimmed.startsWith('+')) {
    const matched = SORTED_BY_DIAL_LENGTH.find((c) => trimmed.startsWith(c.dial));
    if (matched) {
      return {
        country: matched,
        local: trimmed.slice(matched.dial.length).trimStart(),
      };
    }
  }
  return { country: COUNTRY_DIAL_OPTIONS[0], local: trimmed };
}

interface PhoneInputProps {
  value: string;
  onChange: (fullNumber: string) => void;
  required?: boolean;
  placeholder?: string;
  id?: string;
}

export function PhoneInput({
  value,
  onChange,
  required = false,
  placeholder = '20 000 0000',
  id,
}: PhoneInputProps) {
  const parsed = useMemo(() => parsePhoneValue(value), [value]);
  const [selectedCountry, setSelectedCountry] = useState<CountryDialOption>(parsed.country);
  const [localNumber, setLocalNumber] = useState<string>(parsed.local);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = parsePhoneValue(value);
    if (!value) {
      setLocalNumber('');
    } else if (next.local !== localNumber && value !== `${selectedCountry.dial}${localNumber}`) {
      setSelectedCountry(next.country);
      setLocalNumber(next.local);
    }
  }, [value]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRY_DIAL_OPTIONS;
    return COUNTRY_DIAL_OPTIONS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [search]);

  const emitCombined = (country: CountryDialOption, rawLocal: string) => {
    const cleaned = rawLocal.replace(/[^\d\s-]/g, '');
    setLocalNumber(cleaned);
    const digitsOnly = cleaned.replace(/[^\d]/g, '');
    if (!digitsOnly) {
      onChange('');
      return;
    }
    const normalizedLocal = digitsOnly.startsWith('0') ? digitsOnly.slice(1) : digitsOnly;
    onChange(`${country.dial}${normalizedLocal || digitsOnly}`);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-stretch rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-[#F97316] focus-within:border-[#F97316]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Select country dialing code"
          className="flex items-center gap-1.5 min-h-[42px] px-3 py-2 bg-slate-50 hover:bg-slate-100 border-r border-slate-300 rounded-l-lg text-sm font-medium text-[#0B1F3A] shrink-0"
        >
          <span className="text-base leading-none">{selectedCountry.flag}</span>
          <span className="font-mono text-xs font-semibold">{selectedCountry.dial}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
        </button>

        <input
          id={id}
          type="tel"
          required={required}
          value={localNumber}
          onChange={(e) => emitCombined(selectedCountry, e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 w-full min-h-[42px] px-3 py-2 rounded-r-lg text-base sm:text-sm text-slate-900 focus:outline-none"
        />
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-[min(18rem,calc(100vw-2.5rem))] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country or +code..."
                className="w-full min-w-0 pl-8 pr-2.5 py-1.5 text-base sm:text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#F97316]"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
            {filteredCountries.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-500 text-center">No matching countries.</p>
            ) : (
              filteredCountries.map((c) => (
                <button
                  key={`${c.code}-${c.dial}`}
                  type="button"
                  onClick={() => {
                    setSelectedCountry(c);
                    setOpen(false);
                    setSearch('');
                    emitCombined(c, localNumber);
                  }}
                  className={`w-full px-3 py-2 flex items-center justify-between text-left text-xs hover:bg-orange-50/70 transition-colors ${
                    selectedCountry.code === c.code ? 'bg-slate-50 font-semibold' : ''
                  }`}
                >
                  <span className="flex items-center gap-2 text-slate-800">
                    <span className="text-base leading-none">{c.flag}</span>
                    <span>{c.name}</span>
                  </span>
                  <span className="font-mono text-slate-600 font-semibold">{c.dial}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
