import React, { useEffect, useState } from 'react';
import { ArrowLeft, MapPin, Phone, Mail, MessageSquare, Send, Store } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Product } from '../types/marketplace';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { ProductCard } from '../components/ProductCard';
import { WhatsAppIcon, buildWhatsAppUrl } from '../components/WhatsAppIcon';

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
  const { user } = useAuth();
  const [seller, setSeller] = useState<PublicSeller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatFeedback, setChatFeedback] = useState('');
  const [chatErr, setChatErr] = useState('');

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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seller || !chatText.trim()) return;
    setChatSending(true);
    setChatErr('');
    setChatFeedback('');
    try {
      await apiRequest('/api/buyer/messages', {
        method: 'POST',
        body: {
          sellerId: seller.userId,
          message: chatText.trim(),
        },
      });
      setChatText('');
      setChatFeedback('Message delivered! View all replies in Buyer Dashboard → Messages.');
    } catch (err: any) {
      setChatErr(err.message || 'Could not send message.');
    } finally {
      setChatSending(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-8 sm:py-12">
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

  const whatsappUrl = buildWhatsAppUrl(
    seller.phone,
    `Hello ${seller.businessName}, I am visiting your storefront on AIDOMART.`
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-10">
      <button
        type="button"
        onClick={() => onNavigate('/shop')}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0B1F3A]"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Shop</span>
      </button>

      {/* Public Storefront Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-8 flex flex-col md:flex-row gap-4 sm:gap-6 items-start">
        {seller.storefrontImage ? (
          <SafeAssetImage
            src={seller.storefrontImage}
            alt={seller.businessName}
            className="w-16 h-16 sm:w-24 sm:h-24 rounded-xl object-cover border border-slate-200 shrink-0"
          />
        ) : (
          <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-xl bg-[#0B1F3A] text-white flex items-center justify-center shrink-0">
            <Store className="w-8 h-8 sm:w-10 sm:h-10 text-[#F97316]" />
          </div>
        )}

        <div className="flex-1 space-y-3 w-full">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <h1 className="font-display text-xl sm:text-3xl font-bold text-[#0B1F3A]">
              {seller.businessName}
            </h1>
            {seller.verifiedBadge && <VerifiedBadge size="md" />}
          </div>

          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed max-w-3xl">
            {seller.description || 'Independent merchant storefront on AIDOMART.'}
          </p>

          <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs text-slate-600 pt-1">
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
              <span className="inline-flex items-center gap-1.5 break-all">
                <Mail className="w-3.5 h-3.5 text-[#F97316]" />
                <span>{seller.email}</span>
              </span>
            )}
          </div>

          <div className="pt-1 flex flex-wrap gap-2 text-xs text-slate-600">
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

          <div className="pt-2 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onNavigate('/login');
                  return;
                }
                if (user.role === 'buyer') {
                  setChatOpen((o) => !o);
                }
              }}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              <span>{user?.role === 'buyer' ? 'Message Seller' : 'Sign In as Buyer to Message'}</span>
            </button>

            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors"
              >
                <WhatsAppIcon className="w-4 h-4 shrink-0" />
                <span>WhatsApp Seller</span>
              </a>
            )}
          </div>

          {chatOpen && user?.role === 'buyer' && (
            <form
              onSubmit={handleSendMessage}
              className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 max-w-xl"
            >
              <label className="block text-xs font-semibold text-[#0B1F3A]">
                Send a direct message to {seller.businessName}
              </label>
              <textarea
                rows={2}
                required
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Ask about availability, custom requests, or delivery..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              />
              {chatErr && <p className="text-xs text-red-600">{chatErr}</p>}
              {chatFeedback && (
                <div className="text-xs text-emerald-700 space-y-1">
                  <p>{chatFeedback}</p>
                  <button
                    type="button"
                    onClick={() => onNavigate(`/buyer-dashboard?tab=messages&sellerId=${seller.userId}`)}
                    className="font-semibold underline text-[#0B1F3A]"
                  >
                    Open Messages Tab
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onNavigate(`/buyer-dashboard?tab=messages&sellerId=${seller.userId}`)}
                  className="text-xs font-semibold text-[#0B1F3A] hover:text-[#F97316]"
                >
                  Open full conversation
                </button>
                <button
                  type="submit"
                  disabled={chatSending}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{chatSending ? 'Sending...' : 'Send Message'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Storefront Published Products */}
      <section className="space-y-4 sm:space-y-6">
        <h2 className="font-display text-lg sm:text-xl font-bold text-[#0B1F3A]">
          Published Products by {seller.businessName} ({products.length})
        </h2>

        {products.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-600">
            This seller has not published any available products yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
