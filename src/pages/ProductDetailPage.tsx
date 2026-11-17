import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, MapPin, MessageSquare, Send, ShoppingCart, Star, Store } from 'lucide-react';
import { apiRequest, subscribeDataChanged } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import type { Product, ProductReview } from '../types/marketplace';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { WhatsAppIcon, buildWhatsAppUrl } from '../components/WhatsAppIcon';

interface ProductDetailPageProps {
  productId: number;
  onNavigate: (path: string) => void;
}

export function ProductDetailPage({ productId, onNavigate }: ProductDetailPageProps) {
  const { user } = useAuth();
  const { addToCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [eligibleOrderId, setEligibleOrderId] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariation, setSelectedVariation] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Review submission state (for eligible verified purchases)
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewMsg, setReviewMsg] = useState('');
  const [reviewErr, setReviewErr] = useState('');

  // Quick Buyer -> Seller message state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatFeedback, setChatFeedback] = useState('');
  const [chatErr, setChatErr] = useState('');

  const loadProduct = useCallback(async () => {
    setLoading((prev) => (product ? prev : true));
    setError('');
    try {
      const data = await apiRequest<{
        product: Product;
        reviews: ProductReview[];
        eligibleOrderId: number | null;
      }>(`/api/marketplace/products/${productId}`);
      setProduct(data.product);
      setReviews(data.reviews || []);
      setEligibleOrderId(data.eligibleOrderId);
      setSelectedVariation((curr) =>
        curr && data.product.variations.includes(curr)
          ? curr
          : data.product.variations[0] || ''
      );
    } catch (err: any) {
      setError(err.message || 'Product not found.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    setLoading(true);
    loadProduct();
  }, [loadProduct, user?.id]);

  useEffect(() => {
    return subscribeDataChanged(() => {
      loadProduct();
    });
  }, [loadProduct]);

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eligibleOrderId || !product) return;
    setReviewMsg('');
    setReviewErr('');
    try {
      const res = await apiRequest<{ message: string }>('/api/buyer/reviews', {
        method: 'POST',
        body: { orderId: eligibleOrderId, productId: product.id, rating, comment },
      });
      setReviewMsg(res.message);
      setComment('');
      await loadProduct();
    } catch (err: any) {
      setReviewErr(err.message || 'Could not submit review.');
    }
  };

  const handleSendQuickMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product?.seller || !chatText.trim()) return;
    setChatSending(true);
    setChatErr('');
    setChatFeedback('');
    try {
      await apiRequest('/api/buyer/messages', {
        method: 'POST',
        body: {
          sellerId: product.seller.userId,
          productId: product.id,
          message: chatText.trim(),
        },
      });
      setChatText('');
      setChatFeedback('Message sent to seller! You can continue chatting in Buyer Dashboard → Messages.');
    } catch (err: any) {
      setChatErr(err.message || 'Could not send message.');
    } finally {
      setChatSending(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="h-96 bg-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">Product Unavailable</h1>
        <p className="text-sm text-slate-600">{error}</p>
        <button
          type="button"
          onClick={() => onNavigate('/shop')}
          className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-sm font-semibold"
        >
          Return to Shop
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-8 sm:space-y-12">
      <button
        type="button"
        onClick={() => onNavigate('/shop')}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0B1F3A]"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Shop</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
        {/* Product Gallery */}
        <div className="lg:col-span-7 min-w-0 space-y-2.5 sm:space-y-3">
          <div className="h-56 sm:h-80 lg:h-[420px] w-full bg-white border border-slate-200 rounded-xl overflow-hidden">
            <SafeAssetImage
              src={product.images[selectedImage] || ''}
              alt={product.title}
              fallbackTitle={product.title}
              fallbackSubtitle={product.categoryName}
              className="w-full h-full object-cover"
            />
          </div>
          {product.images.length > 1 && (
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {product.images.map((img, i) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => setSelectedImage(i)}
                  className={`h-14 sm:h-16 rounded-lg overflow-hidden border-2 ${
                    i === selectedImage ? 'border-[#F97316]' : 'border-slate-200'
                  }`}
                >
                  <SafeAssetImage src={img} alt={`${product.title} ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Purchase & Seller Module */}
        <div className="lg:col-span-5 min-w-0 space-y-5 sm:space-y-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{product.categoryName}</span>
              <span aria-hidden="true">·</span>
              <span>{product.stock > 0 ? `${product.stock} available` : 'Out of stock'}</span>
              {product.reviewCount ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {product.ratingAvg} / 5 ({product.reviewCount} reviews)
                  </span>
                </>
              ) : null}
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0B1F3A] mt-2 break-words">
              {product.title}
            </h1>
            <p className="text-xl sm:text-2xl font-mono font-bold text-[#0B1F3A] tabular-nums mt-2.5 sm:mt-3">
              GHS {product.price.toFixed(2)}
            </p>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {product.description}
          </p>

          {product.variations.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Select Option / Variation
              </label>
              <div className="flex flex-wrap gap-2">
                {product.variations.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSelectedVariation(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      selectedVariation === v
                        ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-end gap-3 min-w-0">
            <div className="shrink-0">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                max={Math.max(1, product.stock)}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(product.stock || 1, Number(e.target.value) || 1)))}
                className="w-20 min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm font-mono tabular-nums"
              />
            </div>

            <button
              type="button"
              disabled={product.stock <= 0}
              onClick={() => addToCart(product, quantity, selectedVariation)}
              className="flex-1 min-w-0 min-h-[44px] py-3 px-4 sm:px-5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <ShoppingCart className="w-4 h-4 shrink-0" />
              <span>{product.stock > 0 ? 'Add to Cart' : 'Out of Stock'}</span>
            </button>
          </div>

          {/* Seller Profile Box */}
          {product.seller && (
            <div className="pt-5 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500">Sold By</span>
                {product.seller.verifiedBadge && <VerifiedBadge />}
              </div>
              <button
                type="button"
                onClick={() => onNavigate(`/seller/${product.seller!.userId}`)}
                className="flex items-center gap-2.5 text-left group w-full"
              >
                {product.seller.storefrontImage ? (
                  <SafeAssetImage
                    src={product.seller.storefrontImage}
                    alt={product.seller.businessName}
                    compact
                    className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#0B1F3A] text-white flex items-center justify-center shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-sm font-bold text-[#0B1F3A] group-hover:text-[#F97316] transition-colors truncate">
                    {product.seller.businessName}
                  </h2>
                  {product.seller.locationCity && (
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{product.seller.locationCity}</span>
                    </p>
                  )}
                </div>
              </button>
              {product.seller.description && (
                <p className="text-xs text-slate-600 line-clamp-2">{product.seller.description}</p>
              )}
              {product.seller.deliveryPickupNotes && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <strong className="text-slate-800">Delivery & Pickup:</strong>{' '}
                  {product.seller.deliveryPickupNotes}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      onNavigate('/login');
                      return;
                    }
                    if (user.role === 'buyer') {
                      setChatOpen((o) => !o);
                    } else {
                      onNavigate(`/seller/${product.seller!.userId}`);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[42px] py-2 px-3 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{user?.role === 'buyer' ? 'Message Seller' : 'Sign In to Chat Seller'}</span>
                </button>

                {buildWhatsAppUrl(
                  product.seller.phone,
                  `Hello ${product.seller.businessName}, I am interested in "${product.title}" on AIDOMART.`
                ) && (
                  <a
                    href={
                      buildWhatsAppUrl(
                        product.seller.phone,
                        `Hello ${product.seller.businessName}, I am interested in "${product.title}" on AIDOMART.`
                      )!
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 min-h-[42px] py-2 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors"
                  >
                    <WhatsAppIcon className="w-4 h-4 shrink-0" />
                    <span>WhatsApp Seller</span>
                  </a>
                )}
              </div>

              {chatOpen && user?.role === 'buyer' && (
                <form
                  onSubmit={handleSendQuickMessage}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5"
                >
                  <label className="block text-[11px] font-semibold text-[#0B1F3A]">
                    Ask {product.seller.businessName} about {product.title}
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Ask about size, stock, delivery, or pickup..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                  {chatErr && <p className="text-[11px] text-red-600">{chatErr}</p>}
                  {chatFeedback && (
                    <div className="text-[11px] text-emerald-700 space-y-1">
                      <p>{chatFeedback}</p>
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate(`/buyer-dashboard?tab=messages&sellerId=${product.seller!.userId}`)
                        }
                        className="font-semibold underline text-[#0B1F3A]"
                      >
                        Open Full Chat Thread
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate(`/buyer-dashboard?tab=messages&sellerId=${product.seller!.userId}`)
                      }
                      className="text-[11px] font-semibold text-[#0B1F3A] hover:text-[#F97316]"
                    >
                      View all messages
                    </button>
                    <button
                      type="submit"
                      disabled={chatSending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold disabled:opacity-60"
                    >
                      <Send className="w-3 h-3" />
                      <span>{chatSending ? 'Sending...' : 'Send'}</span>
                    </button>
                  </div>
                </form>
              )}

              <button
                type="button"
                onClick={() => onNavigate(`/seller/${product.seller!.userId}`)}
                className="w-full min-h-[40px] py-2 px-4 rounded-lg border border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white text-xs font-semibold transition-colors"
              >
                Visit Seller Storefront & View All Products
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Verified-Purchase Customer Reviews */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-[#0B1F3A]">
            Verified Customer Reviews
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Only buyers with a completed order for this item can submit a review.
          </p>
        </div>

        {eligibleOrderId && (
          <form onSubmit={submitReview} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#0B1F3A]">
              Leave a Verified Purchase Review
            </h3>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-700">Rating:</label>
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} Star{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              required
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your genuine experience with this product..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            />
            {reviewErr && <p className="text-xs text-red-600">{reviewErr}</p>}
            {reviewMsg && <p className="text-xs text-emerald-700">{reviewMsg}</p>}
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold hover:bg-[#122E53]"
            >
              Submit Verified Review
            </button>
          </form>
        )}

        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">
            No verified customer reviews have been submitted for this product yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-200">
            {reviews.map((rev) => (
              <div key={rev.id} className="py-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold text-slate-900">{rev.buyerName}</span>
                    <span className="text-xs text-slate-500">· Verified Purchase</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#F97316]">
                    {Array.from({ length: rev.rating }).map((_, idx) => (
                      <Star key={idx} className="w-3.5 h-3.5 fill-current" />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-700">{rev.comment}</p>
                {rev.sellerResponse && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700">
                    <strong className="text-[#0B1F3A]">Seller Reply:</strong> {rev.sellerResponse}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
