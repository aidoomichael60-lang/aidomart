import React, { useEffect, useState } from 'react';
import { ArrowLeft, MapPin, Phone, Mail, Store } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Product } from '../types/marketplace';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { ProductCard } from '../components/ProductCard';

interface SellerStorefrontPageProps {
  sellerUserId: number;
  onNavigate: (path: string) => void;
}

interface PublicSeller {
  id: number;
  userId: number;
  businessName: string;
  email: string;
  phone: string;
  description: string;
  categories: string[];
  locationCity: string;
  deliveryPickupNotes: string;
  storefrontImage: string | null;
  businessPhotos: string[];
  verifiedBadge: boolean;
  momoEnabled: boolean;
  bankEnabled: boolean;
}

export function SellerStorefrontPage({ sellerUserId, onNavigate }: SellerStorefrontPageProps) {
  const [seller, setSeller] = useState<PublicSeller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiRequest<{ seller: PublicSeller; products: Product[] }>(
      `/api/marketplace/sellers/${sellerUserId}`
    )
      .then((d) => {
        setSeller(d.seller);
        setProducts(d.products || []);
      })
      .catch((err) => setError(err.message || 'Seller storefront unavailable.'))
      .finally(() => setLoading(false));
  }, [sellerUserId]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !seller) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">Storefront Not Found</h1>
        <p className="text-sm text-slate-600">{error}</p>
        <button
          type="button"
          onClick={() => onNavigate('/shop')}
          className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-sm font-semibold"
        >
          Browse Shop
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <button
        type="button"
        onClick={() => onNavigate('/shop')}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0B1F3A]"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Shop</span>
      </button>

      {/* Public Storefront Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row gap-6 items-start">
        {seller.storefrontImage ? (
          <SafeAssetImage
            src={seller.storefrontImage}
            alt={seller.businessName}
            className="w-24 h-24 rounded-xl object-cover border border-slate-200 shrink-0"
          />
        ) : (
          <div className="w-24 h-24 rounded-xl bg-[#0B1F3A] text-white flex items-center justify-center shrink-0">
            <Store className="w-10 h-10 text-[#F97316]" />
          </div>
        )}

        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
              {seller.businessName}
            </h1>
            {seller.verifiedBadge && <VerifiedBadge size="md" />}
          </div>

          <p className="text-sm text-slate-700 leading-relaxed max-w-3xl">
            {seller.description || 'Independent merchant storefront on AIDOMART.'}
          </p>

          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-600 pt-1">
            {seller.locationCity && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#F97316]" />
                <span>{seller.locationCity}</span>
              </span>
            )}
            {seller.phone && (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Phone className="w-3.5 h-3.5 text-[#F97316]" />
                <span>{seller.phone}</span>
              </span>
            )}
            {seller.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#F97316]" />
                <span>{seller.email}</span>
              </span>
            )}
          </div>

          <div className="pt-2 flex flex-wrap gap-3 text-xs text-slate-600">
            {seller.deliveryPickupNotes && (
              <span className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                <strong className="text-slate-800">Fulfilment:</strong> {seller.deliveryPickupNotes}
              </span>
            )}
            <span className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <strong className="text-slate-800">Accepted Manual Payments:</strong>{' '}
              {[
                seller.momoEnabled ? 'Mobile Money' : '',
                seller.bankEnabled ? 'Bank Transfer' : '',
              ]
                .filter(Boolean)
                .join(' · ') || 'Contact seller / awaiting setup'}
            </span>
          </div>
        </div>
      </section>

      {/* Storefront Published Products */}
      <section className="space-y-6">
        <h2 className="font-display text-xl font-bold text-[#0B1F3A]">
          Published Products by {seller.businessName} ({products.length})
        </h2>

        {products.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-600">
            This seller has not published any available products yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
