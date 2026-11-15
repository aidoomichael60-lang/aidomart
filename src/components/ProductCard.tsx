import React from 'react';
import { ShoppingCart, Store } from 'lucide-react';
import type { Product } from '../types/marketplace';
import { useCart } from '../context/CartContext';
import { SafeAssetImage } from './SafeAssetImage';
import { VerifiedBadge } from './VerifiedBadge';

interface ProductCardProps {
  product: Product;
  onNavigate: (path: string) => void;
}

export function ProductCard({ product, onNavigate }: ProductCardProps) {
  const { addToCart } = useCart();

  return (
    <article className="group bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        onClick={() => onNavigate(`/product/${product.id}`)}
        className="block h-32 sm:h-44 lg:h-48 w-full bg-slate-100 overflow-hidden text-left shrink-0"
      >
        <SafeAssetImage
          src={product.images[0] || ''}
          alt={product.title}
          fallbackTitle={product.title}
          fallbackSubtitle={product.categoryName}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </button>

      <div className="p-2.5 sm:p-4 flex-1 flex flex-col justify-between gap-2 sm:gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-500 truncate">
            <span className="truncate">{product.categoryName}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{product.stock > 0 ? `${product.stock} left` : 'Sold out'}</span>
          </div>

          <button
            type="button"
            onClick={() => onNavigate(`/product/${product.id}`)}
            className="mt-1 text-left block w-full"
          >
            <h3 className="font-display text-xs sm:text-base font-semibold text-slate-900 group-hover:text-[#F97316] transition-colors line-clamp-1">
              {product.title}
            </h3>
          </button>

          <p className="hidden sm:line-clamp-2 mt-1 text-xs text-slate-600">{product.description}</p>
        </div>

        {/* Mandatory Seller Profile Link & Identification */}
        {product.seller && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => onNavigate(`/seller/${product.seller!.userId}`)}
              className="flex items-center gap-1.5 sm:gap-2 min-w-0 text-left hover:text-[#F97316] transition-colors"
            >
              {product.seller.storefrontImage ? (
                <SafeAssetImage
                  src={product.seller.storefrontImage}
                  alt={product.seller.businessName}
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#0B1F3A] text-white flex items-center justify-center shrink-0">
                  <Store className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </div>
              )}
              <span className="text-[11px] sm:text-xs font-medium text-slate-700 truncate">
                {product.seller.businessName}
              </span>
            </button>
            {product.seller.verifiedBadge && <VerifiedBadge />}
          </div>
        )}

        <div className="pt-1 sm:pt-2 flex items-center justify-between gap-2">
          <span className="text-xs sm:text-base font-mono font-bold text-[#0B1F3A] tabular-nums truncate">
            GHS {product.price.toFixed(2)}
          </span>
          <button
            type="button"
            disabled={product.stock <= 0}
            onClick={() => addToCart(product, 1, product.variations[0] || '')}
            className="inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 min-h-[38px] sm:min-h-[40px] rounded-lg bg-[#0B1F3A] hover:bg-[#F97316] disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span className="sm:hidden">{product.stock > 0 ? 'Add' : 'Out'}</span>
            <span className="hidden sm:inline">{product.stock > 0 ? 'Add to Cart' : 'Sold Out'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
