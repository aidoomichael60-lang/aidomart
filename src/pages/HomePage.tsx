import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, ShieldCheck, Store, Truck, Wallet } from 'lucide-react';
import { AIDOMART_ASSETS } from '../constants/assets';
import { apiRequest, subscribeDataChanged } from '../lib/api';
import type { MarketplaceCategory, Product, SellerPromotion } from '../types/marketplace';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { ProductCard } from '../components/ProductCard';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { InstantSearchBar } from '../components/InstantSearchBar';

interface HomePageProps {
  onNavigate: (path: string) => void;
}

interface ApprovedSellerSummary {
  id: number;
  userId: number;
  businessName: string;
  description: string;
  categories?: string[];
  storefrontImage: string | null;
  verifiedBadge: boolean;
  locationCity: string;
  productCount: number;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const slides = AIDOMART_ASSETS.homepage.carousel;
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [approvedSellers, setApprovedSellers] = useState<ApprovedSellerSummary[]>([]);
  const [promotions, setPromotions] = useState<SellerPromotion[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHome = useCallback(async () => {
    try {
      const data = await apiRequest<{
        categories: MarketplaceCategory[];
        featuredProducts: Product[];
        approvedSellers: ApprovedSellerSummary[];
        promotions: SellerPromotion[];
      }>('/api/marketplace/home');
      setCategories(data.categories || []);
      setFeaturedProducts(data.featuredProducts || []);
      setApprovedSellers(data.approvedSellers || []);
      setPromotions(data.promotions || []);
    } catch {
      // ignore transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHome();
    return subscribeDataChanged(() => {
      loadHome();
    });
  }, [loadHome]);

  useEffect(() => {
    if (paused) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % slides.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [paused, slides.length]);

  const prevSlide = () => setSlideIndex((prev) => (prev - 1 + slides.length) % slides.length);
  const nextSlide = () => setSlideIndex((prev) => (prev + 1) % slides.length);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) nextSlide();
      else prevSlide();
    }
    touchStartX.current = null;
  };

  const countBySlug = new Map(categories.map((c) => [c.slug, c.productCount ?? 0]));

  return (
    <div className="w-full max-w-full overflow-x-clip">
      {/* 1. Full-width Homepage Carousel directly beneath Navigation */}
      <section
        aria-label="AIDOOMART Highlights"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-full h-[220px] sm:h-[360px] lg:h-[440px] overflow-hidden bg-[#0B1F3A]"
      >
        {slides.map((slide, idx) => {
          const active = idx === slideIndex;
          return (
            <div
              key={slide.src}
              aria-hidden={!active}
              className={`absolute inset-0 w-full h-full transition-opacity duration-500 ease-out ${
                active ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
              }`}
            >
              <SafeAssetImage
                src={slide.src}
                alt={slide.title}
                darkFallback
                fallbackTitle={slide.title}
                fallbackSubtitle={`Carousel Slide 0${idx + 1} · ${slide.src}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#061325]/92 via-[#0B1F3A]/72 to-[#061325]/25" />
              <div className="absolute inset-0 max-w-7xl mx-auto px-11 sm:px-6 flex items-center min-w-0">
                <div className="w-full max-w-xl min-w-0 text-white space-y-1.5 sm:space-y-4">
                  <p className="text-[10px] sm:text-xs font-medium text-orange-300 tracking-wide truncate">
                    AIDOOMART Multi-Vendor Marketplace · Slide 0{idx + 1} of 0{slides.length}
                  </p>
                  <h1 className="font-display text-base sm:text-4xl lg:text-5xl font-extrabold leading-tight [text-wrap:balance] line-clamp-2">
                    {slide.title}
                  </h1>
                  <p className="text-[11px] sm:text-base text-slate-200 leading-snug sm:leading-relaxed max-w-lg line-clamp-2 sm:line-clamp-none">
                    {slide.subtitle}
                  </p>
                  <div className="pt-1 sm:pt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (slide.ctaTarget.startsWith('/#')) {
                          document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                        } else {
                          onNavigate(slide.ctaTarget);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 sm:px-5 sm:py-3 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs sm:text-sm font-semibold transition-colors"
                    >
                      <span>{slide.ctaLabel}</span>
                      <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Manual Navigation Controls */}
        <button
          type="button"
          onClick={prevSlide}
          aria-label="Previous slide"
          className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-950/60 hover:bg-slate-950/85 text-white flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <button
          type="button"
          onClick={nextSlide}
          aria-label="Next slide"
          className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-950/60 hover:bg-slate-950/85 text-white flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Slide Indicators */}
        <div className="absolute bottom-2.5 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          {slides.map((s, idx) => (
            <button
              key={s.src}
              type="button"
              onClick={() => setSlideIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-1.5 sm:h-2 rounded-full transition-all ${
                idx === slideIndex ? 'w-6 sm:w-7 bg-[#F97316]' : 'w-1.5 sm:w-2 bg-white/50 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      </section>

      {/* Quick Marketplace Search Bar */}
      <section className="relative z-30 bg-white border-b border-slate-200 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <InstantSearchBar
            variant="hero"
            placeholder="Search products, sellers, sizes, or colors..."
            onSubmitSearch={(q) => onNavigate(q ? `/shop?q=${encodeURIComponent(q)}` : '/shop')}
            onSelectProduct={(id) => onNavigate(`/product/${id}`)}
          />
        </div>
      </section>

      {/* 2. Marketplace Trust Cards (fully visible grid, no horizontal scroll) */}
      <section id="how-it-works" className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-0 pointer-events-none">
          <SafeAssetImage
            src={AIDOMART_ASSETS.homepage.background}
            alt="AIDOOMART Marketplace Background"
            className="w-full h-full object-cover opacity-15"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/92 via-white/88 to-slate-50/95" />
        </div>

        <div className="relative max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-10 min-w-0">
          <div className="max-w-3xl min-w-0">
            <h2 className="font-display text-base sm:text-2xl lg:text-3xl font-bold text-[#0B1F3A] [text-wrap:balance]">
              Verified independent sellers, direct manual payments
            </h2>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-slate-600 leading-snug sm:leading-relaxed">
              Discover authentic listings, pay sellers directly via Mobile Money or Bank Transfer, and track every order with confidence.
            </p>
          </div>

          <div className="mt-4 sm:mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-5">
            <div className="min-w-0 bg-white/95 border border-slate-200 rounded-xl p-3.5 sm:p-5 space-y-1.5 sm:space-y-2">
              <div className="flex items-center gap-2 md:block">
                <ShieldCheck className="w-4 h-4 sm:w-6 sm:h-6 text-[#F97316] shrink-0" />
                <h3 className="font-display text-xs sm:text-base font-bold text-[#0B1F3A] md:mt-2">
                  Admin-Vetted Sellers
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 leading-snug sm:leading-relaxed">
                Every seller undergoes administrator review before publishing products.
              </p>
            </div>

            <div className="min-w-0 bg-white/95 border border-slate-200 rounded-xl p-3.5 sm:p-5 space-y-1.5 sm:space-y-2">
              <div className="flex items-center gap-2 md:block">
                <Wallet className="w-4 h-4 sm:w-6 sm:h-6 text-[#F97316] shrink-0" />
                <h3 className="font-display text-xs sm:text-base font-bold text-[#0B1F3A] md:mt-2">
                  Direct Manual Payments
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 leading-snug sm:leading-relaxed">
                Pay sellers directly via MoMo or Bank Transfer with your short order code.
              </p>
            </div>

            <div className="min-w-0 bg-white/95 border border-slate-200 rounded-xl p-3.5 sm:p-5 space-y-1.5 sm:space-y-2">
              <div className="flex items-center gap-2 md:block">
                <Truck className="w-4 h-4 sm:w-6 sm:h-6 text-[#F97316] shrink-0" />
                <h3 className="font-display text-xs sm:text-base font-bold text-[#0B1F3A] md:mt-2">
                  Clear Order & Review Workflow
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 leading-snug sm:leading-relaxed">
                Live tracking milestones, instant email updates, and verified buyer reviews.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Product Categories */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-12 min-w-0">
        <div className="flex items-end justify-between gap-3 mb-3.5 sm:mb-6 min-w-0">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg sm:text-3xl font-bold text-[#0B1F3A]">
              Explore Categories
            </h2>
            <p className="text-[11px] sm:text-sm text-slate-600 mt-0.5 hidden sm:block">
              Category visuals showcase what approved sellers can list in each department.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/categories')}
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-[#0B1F3A] hover:text-[#F97316] transition-colors whitespace-nowrap shrink-0"
          >
            <span>All galleries</span>
            <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-5">
          {AIDOMART_ASSETS.categories.map((cat) => {
            const count = countBySlug.get(cat.slug) ?? 0;
            return (
              <button
                key={cat.slug}
                type="button"
                onClick={() => onNavigate(`/shop?category=${cat.slug}`)}
                className="min-w-0 w-full group text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:-translate-y-0.5 hover:shadow-md transition-all"
              >
                <div className="h-20 sm:h-40 w-full bg-slate-100 overflow-hidden">
                  <SafeAssetImage
                    src={cat.images[0]}
                    alt={`${cat.name} category visual`}
                    fallbackTitle={cat.name}
                    fallbackSubtitle={`${cat.images.length} category visuals`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-2.5 sm:p-4 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-xs sm:text-base font-bold text-[#0B1F3A] group-hover:text-[#F97316] transition-colors truncate">
                      {cat.name}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 tabular-nums">
                      {count} {count === 1 ? 'listing' : 'listings'}
                    </p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-[#F97316] shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Genuine Published Products & Approved Sellers (Prioritized before secondary banners) */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 pb-6 sm:pb-12 space-y-8 sm:space-y-12">
        <div>
          <div className="flex items-end justify-between gap-3 mb-4 sm:mb-6">
            <div>
              <h2 className="font-display text-lg sm:text-3xl font-bold text-[#0B1F3A]">
                Published Marketplace Products
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Genuine inventory listed directly by admin-approved sellers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/shop')}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 min-h-[36px] py-1.5 sm:py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <span>Full Shop</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-5">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-56 sm:h-80 rounded-xl bg-slate-200 animate-pulse" />
              ))}
            </div>
          ) : featuredProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-10 text-center space-y-3">
              <Store className="w-8 h-8 text-slate-300 mx-auto" />
              <h3 className="font-display text-base font-bold text-[#0B1F3A]">
                No seller products published yet
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
                AIDOOMART displays only authentic products uploaded by admin-approved sellers. Once sellers complete verification and publish their inventory, listings will appear here automatically.
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onNavigate('/register?role=seller')}
                  className="min-h-[38px] px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors"
                >
                  Apply as a Seller
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/register?role=buyer')}
                  className="min-h-[38px] px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors"
                >
                  Register as a Buyer
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-5">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </div>

        {/* Approved Sellers Directory */}
        {approvedSellers.length > 0 && (
          <div className="min-w-0">
            <div className="flex items-end justify-between gap-3 mb-3.5 sm:mb-6 min-w-0">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg sm:text-2xl font-bold text-[#0B1F3A]">
                  Approved Independent Sellers
                </h2>
                <p className="text-[11px] sm:text-sm text-slate-600 mt-0.5">
                  Click any seller profile to learn about their business and browse everything they sell.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/sellers')}
                className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-[#0B1F3A] hover:text-[#F97316] transition-colors whitespace-nowrap shrink-0"
              >
                <span>All Sellers</span>
                <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-5">
              {approvedSellers.map((seller) => (
                <button
                  key={seller.id}
                  type="button"
                  onClick={() => onNavigate(`/seller/${seller.userId}`)}
                  className="min-w-0 w-full text-left bg-white border border-slate-200 rounded-xl p-3 sm:p-4 hover:border-[#F97316] transition-colors flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {seller.storefrontImage ? (
                        <SafeAssetImage
                          src={seller.storefrontImage}
                          alt={seller.businessName}
                          compact
                          className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#0B1F3A] text-white flex items-center justify-center shrink-0">
                          <Store className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-xs sm:text-sm font-bold text-[#0B1F3A] truncate">
                          {seller.businessName}
                        </h3>
                        <p className="text-[11px] text-slate-500 truncate">
                          {seller.locationCity || 'Independent Storefront'}
                        </p>
                      </div>
                    </div>
                    {seller.verifiedBadge && <VerifiedBadge />}
                    <p className="text-[11px] sm:text-xs text-slate-600 line-clamp-2">
                      {seller.description || 'Visit storefront to browse published products.'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100 text-[11px] sm:text-xs font-semibold text-[#F97316] tabular-nums">
                    <span>
                      {seller.productCount} {seller.productCount === 1 ? 'item' : 'items'}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[#0B1F3A] shrink-0">
                      <span>Visit</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 5. Marketplace Highlights (stacked on mobile, 2-col on desktop — no horizontal scroll) */}
      <section className="bg-slate-100 border-t border-slate-200 py-6 sm:py-12 overflow-hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 space-y-4 sm:space-y-6 min-w-0">
          <div className="min-w-0">
            <h2 className="font-display text-lg sm:text-2xl font-bold text-[#0B1F3A]">
              Marketplace Highlights
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Official AIDOOMART announcements and approved seller showcases.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-6">
            {AIDOMART_ASSETS.homepage.promotionalBanners.map((banner) => (
              <div
                key={banner.src}
                className="min-w-0 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
              >
                <div className="aspect-[16/9] w-full bg-[#0B1F3A] overflow-hidden">
                  <SafeAssetImage
                    src={banner.src}
                    alt={banner.alt}
                    darkFallback
                    fallbackTitle={banner.title}
                    fallbackSubtitle={banner.src}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3.5 sm:p-4">
                  <h3 className="font-display text-sm sm:text-base font-bold text-[#0B1F3A]">
                    {banner.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    {banner.caption}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {promotions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 pt-1">
              {promotions.map((promo) => (
                <div key={promo.id} className="min-w-0 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-2">
                  <p className="text-xs text-slate-500">{promo.sellerBusinessName}</p>
                  <h3 className="font-display text-sm sm:text-base font-bold text-[#0B1F3A]">
                    {promo.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600">{promo.description}</p>
                  {promo.productId && (
                    <button
                      type="button"
                      onClick={() => onNavigate(`/product/${promo.productId}`)}
                      className="text-xs font-semibold text-[#F97316] hover:underline pt-1 inline-flex items-center gap-1"
                    >
                      <span>View featured product</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
