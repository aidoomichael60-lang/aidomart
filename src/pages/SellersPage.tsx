import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, MapPin, Search, Store } from 'lucide-react';
import { apiRequest, subscribeDataChanged } from '../lib/api';
import type { MarketplaceCategory } from '../types/marketplace';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { VerifiedBadge } from '../components/VerifiedBadge';

interface SellersPageProps {
  onNavigate: (path: string) => void;
}

interface DirectorySeller {
  id: number;
  userId: number;
  businessName: string;
  description: string;
  categories: string[];
  locationCity: string;
  storefrontImage: string | null;
  businessPhotos: string[];
  verifiedBadge: boolean;
  phone: string;
  momoEnabled: boolean;
  bankEnabled: boolean;
  productCount: number;
  previewProducts: Array<{
    id: number;
    title: string;
    price: number;
    image: string;
  }>;
}

export function SellersPage({ onNavigate }: SellersPageProps) {
  const [sellers, setSellers] = useState<DirectorySeller[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);

  const loadSellers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedCategory) params.set('category', selectedCategory);
      const res = await apiRequest<{ sellers: DirectorySeller[] }>(
        `/api/marketplace/sellers?${params.toString()}`
      );
      setSellers(res.sellers || []);
    } catch {
      setSellers([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    apiRequest<{ categories: MarketplaceCategory[] }>('/api/marketplace/categories')
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  useEffect(() => {
    return subscribeDataChanged(() => {
      loadSellers();
    });
  }, [loadSellers]);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-5 sm:space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
            Approved Marketplace Sellers
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Browse verified independent businesses on AIDOMART. Click any seller profile to view their storefront details and published items.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sellers, city, or items..."
            className="pl-9 pr-4 py-2 w-full bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
          />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedCategory('')}
            className={`px-3.5 min-h-[36px] py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              selectedCategory === ''
                ? 'bg-[#0B1F3A] text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
            }`}
          >
            All Departments
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-3.5 min-h-[36px] py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === cat.name
                  ? 'bg-[#0B1F3A] text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-52 rounded-xl bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : sellers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <Store className="w-8 h-8 text-slate-300 mx-auto" />
          <h2 className="font-display text-lg font-bold text-[#0B1F3A]">No matching sellers found</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {searchQuery || selectedCategory
              ? 'No approved sellers match your current search or department filter.'
              : 'Approved sellers will appear here once their storefronts are reviewed.'}
          </p>
          {(searchQuery || selectedCategory) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('');
              }}
              className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
            >
              Show All Sellers
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {sellers.map((seller) => (
            <button
              key={seller.id}
              type="button"
              onClick={() => onNavigate(`/seller/${seller.userId}`)}
              className="group text-left bg-white border border-slate-200 hover:border-[#F97316] rounded-xl p-4 sm:p-5 transition-all hover:shadow-md flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {seller.storefrontImage ? (
                      <SafeAssetImage
                        src={seller.storefrontImage}
                        alt={seller.businessName}
                        compact
                        className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#0B1F3A] text-white flex items-center justify-center shrink-0">
                        <Store className="w-4 h-4 text-[#F97316]" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="font-display text-sm sm:text-base font-bold text-[#0B1F3A] group-hover:text-[#F97316] transition-colors truncate">
                        {seller.businessName}
                      </h2>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-[#F97316] shrink-0" />
                        <span>{seller.locationCity || 'Verified Marketplace Merchant'}</span>
                      </p>
                    </div>
                  </div>
                  {seller.verifiedBadge && <VerifiedBadge />}
                </div>

                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {seller.description || 'Visit storefront to inspect merchant details and published listings.'}
                </p>

                {seller.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {seller.categories.slice(0, 3).map((cat) => (
                      <span
                        key={cat}
                        className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium"
                      >
                        {cat}
                      </span>
                    ))}
                    {seller.categories.length > 3 && (
                      <span className="px-1.5 py-0.5 text-[11px] text-slate-500">
                        +{seller.categories.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {seller.previewProducts.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500">Published items</p>
                    <div className="grid grid-cols-3 gap-2">
                      {seller.previewProducts.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50"
                        >
                          <div className="h-14 w-full bg-slate-100">
                            <SafeAssetImage
                              src={item.image}
                              alt={item.title}
                              compact
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="px-1.5 py-1 text-[10px] font-medium text-slate-700 truncate">
                            {item.title}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-600 tabular-nums">
                  {seller.productCount} {seller.productCount === 1 ? 'published item' : 'published items'}
                </span>
                <span className="inline-flex items-center gap-1 text-[#F97316]">
                  <span>View Storefront</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
