import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { AIDOMART_ASSETS } from '../constants/assets';
import { apiRequest, subscribeDataChanged } from '../lib/api';
import type { MarketplaceCategory } from '../types/marketplace';
import { SafeAssetImage } from '../components/SafeAssetImage';

interface CategoriesPageProps {
  onNavigate: (path: string) => void;
}

export function CategoriesPage({ onNavigate }: CategoriesPageProps) {
  const [dbCategories, setDbCategories] = useState<MarketplaceCategory[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>(AIDOMART_ASSETS.categories[0].slug);

  const loadCategories = useCallback(() => {
    apiRequest<{ categories: MarketplaceCategory[] }>('/api/marketplace/categories')
      .then((d) => setDbCategories(d.categories || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadCategories();
    return subscribeDataChanged(loadCategories);
  }, [loadCategories]);

  const currentAssetCat =
    AIDOMART_ASSETS.categories.find((c) => c.slug === activeSlug) ||
    AIDOMART_ASSETS.categories[0];

  const dbMatch = dbCategories.find((c) => c.slug === currentAssetCat.slug);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
          Marketplace Categories
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl">
          These category visual galleries represent each AIDOOMART shopping department. Click "Shop Published Listings" in any category to browse genuine items currently listed by approved sellers.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {AIDOMART_ASSETS.categories.map((cat) => (
          <button
            key={cat.slug}
            type="button"
            onClick={() => setActiveSlug(cat.slug)}
            className={`px-3.5 sm:px-4 min-h-[38px] py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeSlug === cat.slug
                ? 'bg-[#0B1F3A] text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#0B1F3A]">
              {currentAssetCat.name} Visual Showcase
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              {currentAssetCat.description} ·{' '}
              <span className="font-semibold text-[#0B1F3A] tabular-nums">
                {dbMatch?.productCount ?? 0} published seller listings
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate(`/shop?category=${currentAssetCat.slug}`)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <span>Shop Published {currentAssetCat.name}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {currentAssetCat.images.map((imgPath, i) => (
            <button
              key={imgPath}
              type="button"
              onClick={() => onNavigate(`/shop?category=${currentAssetCat.slug}`)}
              title={`Shop ${currentAssetCat.name}`}
              className="group h-24 sm:h-36 rounded-lg overflow-hidden border border-slate-200 hover:border-[#F97316] bg-slate-100 text-left transition-colors"
            >
              <SafeAssetImage
                src={imgPath}
                alt={`${currentAssetCat.name} category visual ${i + 1}`}
                fallbackTitle={`${currentAssetCat.name} #${i + 1}`}
                fallbackSubtitle={imgPath.split('/').pop()}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </button>
          ))}
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => onNavigate(`/shop?category=${currentAssetCat.slug}`)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#F97316] text-white text-xs font-semibold transition-colors"
          >
            <span>Browse All {currentAssetCat.name} in Shop</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {dbCategories.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              All Marketplace Departments
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Select any department to browse published listings from verified sellers.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {dbCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => onNavigate(`/shop?category=${cat.slug}`)}
                className="p-3 sm:p-4 rounded-xl border border-slate-200 hover:border-[#F97316] bg-slate-50/50 hover:bg-white text-left transition-colors space-y-1"
              >
                <p className="font-display font-bold text-sm text-[#0B1F3A]">{cat.name}</p>
                {cat.description && (
                  <p className="text-xs text-slate-600 line-clamp-2">{cat.description}</p>
                )}
                <p className="text-[11px] font-semibold text-[#F97316] pt-1 tabular-nums">
                  {cat.productCount ?? 0} published listings →
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
