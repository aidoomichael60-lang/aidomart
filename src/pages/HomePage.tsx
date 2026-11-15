import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, ShieldCheck, Store, Truck, Wallet } from 'lucide-react';
import { AIDOMART_ASSETS } from '../constants/assets';
import { apiRequest } from '../lib/api';
import type { MarketplaceCategory, Product, SellerPromotion } from '../types/marketplace';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { ProductCard } from '../components/ProductCard';
import { VerifiedBadge } from '../components/VerifiedBadge';

interface HomePageProps {
  onNavigate: (path: string) => void;
}

interface ApprovedSellerSummary {
  id: number;
  userId: number;
  businessName: string;
  description: string;
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

  useEffect(() => {
    apiRequest<{
      categories: MarketplaceCategory[];
      featuredProducts: Product[];
      approvedSellers: ApprovedSellerSummary[];
      promotions: SellerPromotion[];
    }>('/api/marketplace/home')
      .then((data) => {
        setCategories(data.categories || []);
        setFeaturedProducts(data.featuredProducts || []);
        setApprovedSellers(data.approvedSellers || []);
        setPromotions(data.promotions || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    <div>
      {/* 1. Full-width Homepage Carousel directly beneath Navigation */}
      <section
        aria-label="AIDOMART Highlights"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full overflow-hidden bg-[#0B1F3A]"
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${slideIndex * 100}%)` }}
        >
          {slides.map((slide, idx) => (
            <div key={slide.src} className="w-full shrink-0 relative h-[360px] sm:h-[460px] lg:h-[520px]">
              <SafeAssetImage
                src={slide.src}
                alt={slide.title}
                darkFallback
                fallbackTitle={slide.title}
                fallbackSubtitle={`Carousel Slide 0${idx + 1} · ${slide.src}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#061325]/90 via-[#0B1F3A]/65 to-transparent" />
              <div className="absolute inset-0 max-w-7xl mx-auto px-4 sm:px-6 flex items-center">
                <div className="max-w-xl text-white space-y-4">
                  <p className="text-xs font-medium text-orange-300 tracking-wide">
                    AIDOMART Multi-Vendor Marketplace · Slide 0{idx + 1} of 0{slides.length}
                  </p>
                  <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl font-extrabold leading-tight [text-wrap:balance]">
                    {slide.title}
                  </h1>
                  <p className="text-sm sm:text-base text-slate-200 leading-relaxed max-w-lg">
                    {slide.subtitle}
                  </p>
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (slide.ctaTarget.startsWith('/#')) {
                          document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                        } else {
                          onNavigate(slide.ctaTarget);
                        }
                      }}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold transition-colors"
                    >
                      <span>{slide.ctaLabel}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Manual Navigation Controls */}
        <button
          type="button"
          onClick={prevSlide}
          aria-label="Previous slide"
          className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-950/60 hover:bg-slate-950/85 text-white flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={nextSlide}
          aria-label="Next slide"
          className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-950/60 hover:bg-slate-950/85 text-white flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Slide Indicators */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {slides.map((s, idx) => (
            <button
              key={s.src}
              type="button"
              onClick={() => setSlideIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-2 rounded-full transition-all ${
                idx === slideIndex ? 'w-7 bg-[#F97316]' : 'w-2 bg-white/50 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      </section>

      {/* 2. Marketplace Introduction with Homepage Background */}
      <section id="how-it-works" className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-0 pointer-events-none">
          <SafeAssetImage
            src={AIDOMART_ASSETS.homepage.background}
            alt="AIDOMART Marketplace Background"
            className="w-full h-full object-cover opacity-15"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/90 via-white/85 to-slate-50/95" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <div className="max-w-3xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A] [text-wrap:balance]">
              One marketplace connecting verified independent sellers and buyers
            </h2>
            <p className="mt-3 text-base text-slate-700 leading-relaxed">
              AIDOMART gives independent businesses their own private dashboards and public storefronts while giving buyers a central Shop to discover authentic listings, inspect seller profiles, pay sellers directly via verified manual payment instructions, and track every order with confidence.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/95 border border-slate-200 rounded-xl p-6 space-y-2.5">
              <ShieldCheck className="w-6 h-6 text-[#F97316]" />
              <h3 className="font-display text-base font-bold text-[#0B1F3A]">
                Admin-Vetted Sellers
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Every seller application undergoes review and verification by an AIDOMART administrator before publishing products.
              </p>
            </div>

            <div className="bg-white/95 border border-slate-200 rounded-xl p-6 space-y-2.5">
              <Wallet className="w-6 h-6 text-[#F97316]" />
              <h3 className="font-display text-base font-bold text-[#0B1F3A]">
                Direct Manual Payments
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Buyers pay sellers directly via Mobile Money or Bank Transfer using each order's unique reference, then sellers manually confirm receipt.
              </p>
            </div>

            <div className="bg-white/95 border border-slate-200 rounded-xl p-6 space-y-2.5">
              <Truck className="w-6 h-6 text-[#F97316]" />
              <h3 className="font-display text-base font-bold text-[#0B1F3A]">
                Clear Order & Review Workflow
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Receive instant email order updates, track seller order confirmation, and share verified-purchase reviews after completion.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Product Categories (using existing category visuals) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
              Explore Marketplace Categories
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Category visuals showcase what approved sellers can list in each department.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/categories')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] hover:text-[#F97316] transition-colors whitespace-nowrap"
          >
            <span>View all category galleries</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {AIDOMART_ASSETS.categories.map((cat) => {
            const count = countBySlug.get(cat.slug) ?? 0;
            return (
              <button
                key={cat.slug}
                type="button"
                onClick={() => onNavigate(`/shop?category=${cat.slug}`)}
                className="group text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:-translate-y-0.5 hover:shadow-md transition-all"
              >
                <div className="aspect-[4/3] w-full bg-slate-100 overflow-hidden">
                  <SafeAssetImage
                    src={cat.images[0]}
                    alt={`${cat.name} category visual`}
                    fallbackTitle={cat.name}
                    fallbackSubtitle={`${cat.images.length} category visuals`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-[#0B1F3A] group-hover:text-[#F97316] transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {count} published {count === 1 ? 'listing' : 'listings'}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#F97316] shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Existing Promotional Banners */}
      <section className="bg-slate-100 border-y border-slate-200 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#0B1F3A]">
              Marketplace Highlights
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Official AIDOMART announcements and approved seller showcases.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {AIDOMART_ASSETS.homepage.promotionalBanners.map((banner) => (
              <div
                key={banner.src}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
              >
                <div className="aspect-[16/9] w-full bg-[#0B1F3A]">
                  <SafeAssetImage
                    src={banner.src}
                    alt={banner.alt}
                    darkFallback
                    fallbackTitle={banner.title}
                    fallbackSubtitle={banner.src}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-display text-base font-bold text-[#0B1F3A]">{banner.title}</h3>
                  <p className="text-sm text-slate-600 mt-1">{banner.caption}</p>
                </div>
              </div>
            ))}
          </div>

          {promotions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              {promotions.map((promo) => (
                <div key={promo.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <p className="text-xs text-slate-500">{promo.sellerBusinessName}</p>
                  <h3 className="font-display text-base font-bold text-[#0B1F3A]">{promo.title}</h3>
                  <p className="text-sm text-slate-600">{promo.description}</p>
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

      {/* 5. Genuine Published Products & Approved Sellers (from DB only) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14 space-y-12">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
                Published Marketplace Products
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Genuine inventory listed directly by admin-approved sellers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/shop')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <span>Open Full Shop</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-80 rounded-xl bg-slate-200 animate-pulse" />
              ))}
            </div>
          ) : featuredProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
              <Store className="w-9 h-9 text-slate-300 mx-auto" />
              <h3 className="font-display text-base font-bold text-[#0B1F3A]">
                No seller products published yet
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                AIDOMART displays only authentic products uploaded by admin-approved sellers. Once sellers complete verification and publish their inventory, listings will appear here automatically.
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('/register?role=seller')}
                  className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors"
                >
                  Apply as a Seller
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/register?role=buyer')}
                  className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors"
                >
                  Register as a Buyer
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} onNavigate={onNavigate} />
              ))}
            </div>
          )}
        </div>

        {/* Approved Sellers Directory */}
        {approvedSellers.length > 0 && (
          <div>
            <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mb-6">
              Approved Independent Sellers
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {approvedSellers.map((seller) => (
                <button
                  key={seller.id}
                  type="button"
                  onClick={() => onNavigate(`/seller/${seller.userId}`)}
                  className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-[#F97316] transition-colors space-y-3"
                >
                  <div className="flex items-center gap-3">
                    {seller.storefrontImage ? (
                      <SafeAssetImage
                        src={seller.storefrontImage}
                        alt={seller.businessName}
                        className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-[#0B1F3A] text-white flex items-center justify-center shrink-0">
                        <Store className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-display text-sm font-bold text-[#0B1F3A] truncate">
                        {seller.businessName}
                      </h3>
                      <p className="text-xs text-slate-500 truncate">
                        {seller.locationCity || 'Independent Storefront'}
                      </p>
                    </div>
                  </div>
                  {seller.verifiedBadge && <VerifiedBadge />}
                  <p className="text-xs text-slate-600 line-clamp-2">
                    {seller.description || 'Visit storefront to browse published products.'}
                  </p>
                  <p className="text-xs font-semibold text-[#F97316] tabular-nums">
                    {seller.productCount} published {seller.productCount === 1 ? 'item' : 'items'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
