import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Product } from '../types/marketplace';
import { SafeAssetImage } from './SafeAssetImage';

interface InstantSearchBarProps {
  variant?: 'navbar' | 'mobile-nav' | 'hero';
  placeholder?: string;
  initialValue?: string;
  onSubmitSearch: (query: string) => void;
  onSelectProduct: (productId: number) => void;
}

export function InstantSearchBar({
  variant = 'hero',
  placeholder = 'Search products, brands, sellers, sizes, or colors...',
  initialValue = '',
  onSubmitSearch,
  onSelectProduct,
}: InstantSearchBarProps) {
  const [query, setQuery] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutsideClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutsideClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setProducts([]);
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const reqId = ++requestIdRef.current;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiRequest<{
          products: Product[];
          suggestions?: Product[];
        }>(`/api/marketplace/products?q=${encodeURIComponent(trimmed)}&limit=6`);
        if (requestIdRef.current !== reqId) return;
        setProducts(res.products || []);
        setSuggestions(res.suggestions || []);
      } catch {
        if (requestIdRef.current !== reqId) return;
        setProducts([]);
        setSuggestions([]);
      } finally {
        if (requestIdRef.current === reqId) {
          setLoading(false);
        }
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    setOpen(false);
    onSubmitSearch(trimmed);
  };

  const trimmed = query.trim();
  const showDropdown = open && trimmed.length >= 2;

  const isNavbar = variant === 'navbar';
  const isMobileNav = variant === 'mobile-nav';

  return (
    <div
      ref={containerRef}
      className={`relative ${isNavbar ? 'w-56 xl:w-72' : isMobileNav ? 'w-full' : 'w-full max-w-2xl mx-auto'}`}
    >
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search
            className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 pointer-events-none ${
              isNavbar ? 'text-slate-300 left-2.5' : 'text-slate-400 left-3.5'
            }`}
          />
          <input
            type="search"
            value={query}
            onFocus={() => {
              if (query.trim().length >= 2) setOpen(true);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder={placeholder}
            aria-label="Search AIDOOMART products"
            className={
              isNavbar
                ? 'w-full pl-8 pr-7 py-1.5 rounded-lg bg-white/10 border border-white/15 text-xs text-white placeholder:text-slate-300 focus:outline-none focus:bg-white focus:text-slate-900 focus:placeholder:text-slate-400 transition-colors'
                : isMobileNav
                  ? 'w-full pl-9 pr-8 py-2 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]'
                  : 'w-full min-h-[44px] pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F97316]'
            }
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setProducts([]);
                setSuggestions([]);
                setOpen(false);
              }}
              aria-label="Clear search text"
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded ${
                isNavbar ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {!isNavbar && (
          <button
            type="submit"
            className={
              isMobileNav
                ? 'px-3.5 py-2 rounded-lg bg-[#F97316] text-white text-xs font-semibold shrink-0'
                : 'min-h-[44px] px-5 rounded-lg bg-[#0B1F3A] hover:bg-[#F97316] text-white text-xs sm:text-sm font-semibold transition-colors shrink-0'
            }
          >
            Search
          </button>
        )}
      </form>

      {showDropdown && (
        <div
          className={
            isNavbar
              ? 'fixed inset-x-3 top-[66px] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[420px] bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50'
              : 'absolute left-0 right-0 top-full mt-2 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50'
          }
        >
          {loading ? (
            <div className="p-4 text-xs text-slate-500">Searching published inventory...</div>
          ) : products.length > 0 ? (
            <div className="divide-y divide-slate-100">
              <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[#0B1F3A]">
                  Matching Products ({products.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSubmitSearch(trimmed);
                  }}
                  className="inline-flex items-center gap-1 font-semibold text-[#F97316] hover:underline"
                >
                  <span>View all results</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {products.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSelectProduct(p.id);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-orange-50/50 transition-colors flex items-center gap-3 min-w-0"
                  >
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                      <SafeAssetImage
                        src={p.images?.[0] || ''}
                        alt={p.title}
                        compact
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#0B1F3A] truncate">{p.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {p.categoryName} · {p.seller?.businessName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs font-bold text-[#F97316] tabular-nums">
                        GHS {p.price.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {p.stock > 0 ? `${p.stock} left` : 'Out of stock'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              <div className="px-4 py-3.5 bg-slate-50 space-y-1">
                <p className="text-xs font-bold text-[#0B1F3A]">
                  Sorry, no products found for "{trimmed}".
                </p>
                <p className="text-[11px] text-slate-600">
                  No approved sellers currently have an exact match for this search.
                </p>
              </div>

              {suggestions.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-orange-50/70 border-b border-orange-100">
                    <p className="text-[11px] font-bold text-[#0B1F3A]">
                      Alternative products you may be interested in
                    </p>
                    <p className="text-[10px] text-slate-600">
                      Related available items (not exact matches for "{trimmed}")
                    </p>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {suggestions.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          onSelectProduct(p.id);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-3 min-w-0"
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                          <SafeAssetImage
                            src={p.images?.[0] || ''}
                            alt={p.title}
                            compact
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[#0B1F3A] truncate">{p.title}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {p.categoryName} · {p.seller?.businessName}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-bold text-[#F97316] tabular-nums shrink-0">
                          GHS {p.price.toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="px-4 py-2.5 bg-white flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSubmitSearch(trimmed);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3A] hover:text-[#F97316]"
                >
                  <span>Open full search page</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
