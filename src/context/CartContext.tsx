import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, subscribeDataChanged } from '../lib/api';
import type { CartItem, Product } from '../types/marketplace';

interface CartCheckResultItem {
  id: number;
  exists: boolean;
  available: boolean;
  published: boolean;
  stock: number;
  price: number;
  title: string;
  image: string;
  reason: string;
}

interface CartContextValue {
  items: CartItem[];
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  addToCart: (product: Product, quantity?: number, selectedVariation?: string) => void;
  updateQuantity: (productId: number, selectedVariation: string, quantity: number) => void;
  removeItem: (productId: number, selectedVariation: string) => void;
  removeUnavailableItems: () => void;
  clearCart: () => void;
  refreshAvailability: () => Promise<void>;
  checkingAvailability: boolean;
  cartNotice: string;
  clearCartNotice: () => void;
  unavailableCount: number;
  totalItems: number;
  subtotal: number;
}

const STORAGE_KEY = 'aidomart_cart_v1';
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [cartNotice, setCartNotice] = useState('');
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage quota errors
    }
  }, [items]);

  const refreshAvailability = useCallback(async () => {
    const current = itemsRef.current;
    if (current.length === 0) {
      setCartNotice('');
      return;
    }

    const productIds = Array.from(new Set(current.map((it) => it.product.id)));
    setCheckingAvailability(true);
    try {
      const res = await apiRequest<{ items: CartCheckResultItem[] }>('/api/marketplace/cart-check', {
        method: 'POST',
        body: { productIds },
      });
      const checkMap = new Map<number, CartCheckResultItem>();
      for (const entry of res.items || []) {
        checkMap.set(entry.id, entry);
      }

      const alerts: string[] = [];
      setItems((prev) =>
        prev.map((it) => {
          const live = checkMap.get(it.product.id);
          if (!live) return it;

          if (!live.available || live.stock <= 0) {
            const title = live.title || it.product.title;
            alerts.push(`${title} (${live.reason || 'No longer available'})`);
            return {
              ...it,
              product: {
                ...it.product,
                title: live.title || it.product.title,
                price: live.price > 0 ? live.price : it.product.price,
                stock: live.stock,
                published: live.published,
              },
              unavailableReason: live.reason || 'This item is no longer available.',
              stockAdjustedNote: undefined,
            };
          }

          let nextQty = it.quantity;
          let adjustedNote: string | undefined;
          if (it.quantity > live.stock) {
            nextQty = live.stock;
            adjustedNote = `Only ${live.stock} left in stock (adjusted from ${it.quantity}).`;
            alerts.push(`${live.title || it.product.title}: only ${live.stock} left`);
          }

          return {
            ...it,
            quantity: Math.max(1, nextQty),
            product: {
              ...it.product,
              title: live.title || it.product.title,
              price: live.price > 0 ? live.price : it.product.price,
              stock: live.stock,
              published: live.published,
            },
            unavailableReason: undefined,
            stockAdjustedNote: adjustedNote,
          };
        })
      );

      if (alerts.length > 0) {
        setCartNotice(
          `Cart stock alert: ${alerts.join(' · ')}. Please review your cart before checkout.`
        );
      } else {
        setCartNotice('');
      }
    } catch {
      // ignore offline or transient check error
    } finally {
      setCheckingAvailability(false);
    }
  }, []);

  useEffect(() => {
    if (drawerOpen) {
      refreshAvailability();
    }
  }, [drawerOpen, refreshAvailability]);

  useEffect(() => {
    if (items.length > 0) {
      refreshAvailability();
    }
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible' && itemsRef.current.length > 0) {
        refreshAvailability();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    const unsub = subscribeDataChanged(() => {
      if (itemsRef.current.length > 0) {
        refreshAvailability();
      }
    });
    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      unsub();
    };
  }, [refreshAvailability]);

  const addToCart = (product: Product, quantity = 1, selectedVariation = '') => {
    if (product.stock <= 0) return;
    setItems((prev) => {
      const idx = prev.findIndex(
        (it) => it.product.id === product.id && it.selectedVariation === selectedVariation
      );
      if (idx >= 0) {
        const copy = [...prev];
        const nextQty = Math.min(product.stock, copy[idx].quantity + quantity);
        copy[idx] = {
          ...copy[idx],
          product,
          quantity: Math.max(1, nextQty),
          unavailableReason: undefined,
          stockAdjustedNote: undefined,
        };
        return copy;
      }
      return [
        ...prev,
        {
          product,
          quantity: Math.min(product.stock, Math.max(1, quantity)),
          selectedVariation,
        },
      ];
    });
    setDrawerOpen(true);
  };

  const updateQuantity = (productId: number, selectedVariation: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId, selectedVariation);
      return;
    }
    setItems((prev) =>
      prev.map((it) =>
        it.product.id === productId && it.selectedVariation === selectedVariation
          ? {
              ...it,
              quantity: it.product.stock > 0 ? Math.min(it.product.stock, quantity) : it.quantity,
              stockAdjustedNote: undefined,
            }
          : it
      )
    );
  };

  const removeItem = (productId: number, selectedVariation: string) => {
    setItems((prev) =>
      prev.filter((it) => !(it.product.id === productId && it.selectedVariation === selectedVariation))
    );
  };

  const removeUnavailableItems = () => {
    setItems((prev) => prev.filter((it) => !it.unavailableReason && it.product.stock > 0));
    setCartNotice('');
  };

  const clearCart = () => {
    setItems([]);
    setCartNotice('');
  };

  const clearCartNotice = () => setCartNotice('');

  const unavailableCount = useMemo(
    () => items.filter((it) => Boolean(it.unavailableReason) || it.product.stock <= 0).length,
    [items]
  );

  const totalItems = useMemo(
    () => items.reduce((sum, it) => sum + (it.unavailableReason ? 0 : it.quantity), 0),
    [items]
  );
  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, it) => sum + (it.unavailableReason ? 0 : it.product.price * it.quantity),
        0
      ),
    [items]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        drawerOpen,
        setDrawerOpen,
        addToCart,
        updateQuantity,
        removeItem,
        removeUnavailableItems,
        clearCart,
        refreshAvailability,
        checkingAvailability,
        cartNotice,
        clearCartNotice,
        unavailableCount,
        totalItems,
        subtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
