import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Search, Store } from 'lucide-react';
import { apiRequest, subscribeDataChanged } from '../lib/api';
import type { MarketplaceCategory, Product } from '../types/marketplace';
import { ProductCard } from '../components/ProductCard';
import { SafeAssetImage } from '../components/SafeAssetImage';

interface ShopPageProps {
  initialCategory?: string;
  initialQuery?: string;
  onNavigate: (path: string) => void;
}

interface ShopSellerChip {
  id: number;
  userId: number;
  businessName: string;
  storefrontImage: string | null;
  verifiedBadge: boolean;
  productCount: number;
}

export function ShopPage({ initialCategory = '', initialQuery = '', onNavigate }: ShopPageProps) {
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<ShopSellerChip[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    setSelectedCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    setSearchQuery(initialQuery);
    setDebouncedQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 180);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const loadCategoriesAndSellers = useCallback(async () => {
    try {
      const [catRes, selRes] = await Promise.all([
        apiRequest<{ categories: MarketplaceCategory[] }>('/api/marketplace/categories'),
        apiRequest<{ sellers: ShopSellerChip[] }>('/api/marketplace/sellers'),
      ]);
      setCategories(catRes.categories || []);
      setSellers(selRes.sellers || []);
    } catch {
      // ignore transient error
    }
  }, []);

  const loadProducts = useCallback(async () => {
    if (!hasLoadedOnce.current) {
      setLoading(true);
    }
    const params = new URLSearchParams();
    if (selectedCategory) params.set('category', selectedCategory);
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    if (sort) params.set('sort', sort);

    try {
      const d = await apiRequest<{ products: Product[] }>(
        `/api/marketplace/products?${params.toString()}`
      );
      setProducts(d.products || []);
    } catch {
      setProducts([]);
    } finally {
      hasLoadedOnce.current = true;
      setLoading(false);
    }
  }, [selectedCategory, debouncedQuery, sort]);

  useEffect(() => {
    loadCategoriesAndSellers();
  }, [loadCategoriesAndSellers]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    return subscribeDataChanged(() => {
      loadCategoriesAndSellers();
      loadProducts();
    });
  }, [loadCategoriesAndSellers, loadProducts]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(searchQuery);
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-5 sm:space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
            AIDOMART Shop
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Browse authentic products published by approved sellers. Click any seller profile below or on a product card to visit their storefront.
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, size, color, seller..."
                className="pl-9 pr-4 py-2 w-full sm:w-64 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#F97316] text-white text-xs font-semibold transition-colors shrink-0"
            >
              Search
            </button>
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort products"
            className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F97316]"
          >
            <option value="newest">Newest Arrivals</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </form>
      </div>

      {/* Direct Seller Profiles Strip */}
      {sellers.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#0B1F3A]">
              Approved Sellers ({sellers.length})
            </span>
            <button
              type="button"
              onClick={() => onNavigate('/sellers')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#F97316] hover:underline shrink-0"
            >
              <span>Browse all sellers</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sellers.map((seller) => (
              <button
                key={seller.id}
                type="button"
                onClick={() => onNavigate(`/seller/${seller.userId}`)}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-[#F97316] bg-slate-50/70 hover:bg-white transition-colors max-w-full"
              >
                {seller.storefrontImage ? (
                  <SafeAssetImage
                    src={seller.storefrontImage}
                    alt={seller.businessName}
                    compact
                    className="w-5 h-5 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[#0B1F3A] text-white flex items-center justify-center shrink-0">
                    <Store className="w-3 h-3" />
                  </div>
                )}
                <span className="text-xs font-semibold text-[#0B1F3A] truncate">
                  {seller.businessName}
                </span>
                <span className="text-[10px] font-mono text-slate-500 tabular-nums shrink-0">
                  ({seller.productCount})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category Filter Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedCategory('')}
          className={`px-3.5 min-h-[38px] py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            selectedCategory === ''
              ? 'bg-[#0B1F3A] text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
          }`}
        >
          All Categories
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.slug)}
            className={`px-3.5 min-h-[38px] py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              selectedCategory === cat.slug
                ? 'bg-[#0B1F3A] text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {debouncedQuery.trim() && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3.5 py-2 text-xs text-slate-800">
          <span>
            Showing results for <strong>"{debouncedQuery.trim()}"</strong> ({products.length}{' '}
            {products.length === 1 ? 'product' : 'products'})
          </span>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setDebouncedQuery('');
            }}
            className="font-semibold text-[#F97316] hover:underline"
          >
            Clear search
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-60 sm:h-80 rounded-xl bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <Store className="w-10 h-10 text-slate-300 mx-auto" />
          <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
            No matching products found
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {selectedCategory || searchQuery
              ? 'No approved sellers currently have published listings matching your current filter.'
              : 'No products have been published by approved sellers yet.'}
          </p>
          {(selectedCategory || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('');
                setSearchQuery('');
                setDebouncedQuery('');
              }}
              className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
