import React, { useEffect } from 'react';
import { AlertTriangle, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { SafeAssetImage } from './SafeAssetImage';

interface CartDrawerProps {
  onNavigate: (path: string) => void;
}

export function CartDrawer({ onNavigate }: CartDrawerProps) {
  const {
    items,
    drawerOpen,
    setDrawerOpen,
    updateQuantity,
    removeItem,
    removeUnavailableItems,
    cartNotice,
    unavailableCount,
    subtotal,
  } = useCart();

  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  if (!drawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
        onClick={() => setDrawerOpen(false)}
      />
      <aside className="relative z-10 w-full max-w-md bg-white h-full flex flex-col shadow-2xl border-l border-slate-200 overflow-x-hidden">
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#0B1F3A] text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingBag className="w-5 h-5 text-[#F97316] shrink-0" />
            <h2 className="font-display text-base font-bold truncate">Your Shopping Cart</h2>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close cart"
            className="min-w-[38px] min-h-[38px] inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-white/10 text-slate-200 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {items.length > 0 && (unavailableCount > 0 || cartNotice) && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="leading-snug font-medium">
                {cartNotice ||
                  'One or more items in your cart are sold out or no longer available.'}
              </p>
            </div>
            {unavailableCount > 0 && (
              <button
                type="button"
                onClick={removeUnavailableItems}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold"
              >
                Remove {unavailableCount} Unavailable {unavailableCount === 1 ? 'Item' : 'Items'}
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-4">
          {items.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">Your cart is empty</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Browse genuine listings from approved AIDOMART sellers and add items to your cart.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onNavigate('/shop');
                }}
                className="inline-flex px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold hover:bg-[#122E53]"
              >
                Explore the Shop
              </button>
            </div>
          ) : (
            items.map((item) => {
              const isUnavailable = Boolean(item.unavailableReason) || item.product.stock <= 0;
              return (
                <div
                  key={`${item.product.id}-${item.selectedVariation}`}
                  className={`flex gap-4 pb-4 border-b border-slate-200 ${
                    isUnavailable ? 'opacity-80 bg-red-50/40 -mx-2 px-2 py-2 rounded-lg' : ''
                  }`}
                >
                  <SafeAssetImage
                    src={item.product.images[0] || ''}
                    alt={item.product.title}
                    fallbackTitle={item.product.title}
                    className="w-20 h-20 rounded-lg object-cover shrink-0 border border-slate-200"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 truncate">
                      {item.product.seller?.businessName || 'Seller'}
                      {item.selectedVariation ? ` · ${item.selectedVariation}` : ''}
                    </p>
                    <h3 className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                      {item.product.title}
                    </h3>

                    {isUnavailable ? (
                      <p className="mt-1 inline-block px-2 py-0.5 rounded bg-red-100 text-red-800 text-[11px] font-semibold">
                        {item.unavailableReason || 'Sold out — no longer available'}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm font-mono font-semibold text-[#0B1F3A] tabular-nums mt-1">
                          GHS {(item.product.price * item.quantity).toFixed(2)}
                        </p>
                        {item.stockAdjustedNote && (
                          <p className="mt-1 text-[11px] font-medium text-amber-800">
                            {item.stockAdjustedNote}
                          </p>
                        )}
                      </>
                    )}

                    <div className="flex items-center justify-between mt-2">
                      {!isUnavailable ? (
                        <div className="inline-flex items-center border border-slate-200 rounded-lg">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.product.id,
                                item.selectedVariation,
                                item.quantity - 1
                              )
                            }
                            aria-label="Decrease quantity"
                            className="p-1.5 hover:bg-slate-100 text-slate-700"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2.5 text-xs font-mono font-semibold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={item.quantity >= item.product.stock}
                            onClick={() =>
                              updateQuantity(
                                item.product.id,
                                item.selectedVariation,
                                item.quantity + 1
                              )
                            }
                            aria-label="Increase quantity"
                            className="p-1.5 hover:bg-slate-100 disabled:opacity-40 text-slate-700"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDrawerOpen(false);
                            onNavigate('/shop');
                          }}
                          className="text-[11px] font-semibold text-[#0B1F3A] hover:text-[#F97316] underline"
                        >
                          Find similar items
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id, item.selectedVariation)}
                        aria-label="Remove item"
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 sm:p-6 border-t border-slate-200 bg-slate-50 space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Subtotal</span>
              <span className="text-lg font-mono font-bold text-[#0B1F3A] tabular-nums">
                GHS {subtotal.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {unavailableCount > 0
                ? 'Remove unavailable items above before proceeding to checkout.'
                : 'Multi-seller orders are separated per seller so you pay each seller directly via their verified payment details.'}
            </p>
            <button
              type="button"
              disabled={unavailableCount > 0 || subtotal <= 0}
              onClick={() => {
                setDrawerOpen(false);
                onNavigate('/checkout');
              }}
              className="w-full min-h-[44px] py-3 px-4 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:bg-slate-300 disabled:text-slate-500 text-white text-sm font-semibold transition-colors"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
