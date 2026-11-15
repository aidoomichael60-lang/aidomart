import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { CartItem, Product } from '../types/marketplace';

interface CartContextValue {
  items: CartItem[];
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  addToCart: (product: Product, quantity?: number, selectedVariation?: string) => void;
  updateQuantity: (productId: number, selectedVariation: string, quantity: number) => void;
  removeItem: (productId: number, selectedVariation: string) => void;
  clearCart: () => void;
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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage quota errors
    }
  }, [items]);

  const addToCart = (product: Product, quantity = 1, selectedVariation = '') => {
    setItems((prev) => {
      const idx = prev.findIndex(
        (it) => it.product.id === product.id && it.selectedVariation === selectedVariation
      );
      if (idx >= 0) {
        const copy = [...prev];
        const nextQty = Math.min(product.stock, copy[idx].quantity + quantity);
        copy[idx] = { ...copy[idx], product, quantity: Math.max(1, nextQty) };
        return copy;
      }
      return [...prev, { product, quantity: Math.min(product.stock, Math.max(1, quantity)), selectedVariation }];
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
          ? { ...it, quantity: Math.min(it.product.stock, quantity) }
          : it
      )
    );
  };

  const removeItem = (productId: number, selectedVariation: string) => {
    setItems((prev) =>
      prev.filter((it) => !(it.product.id === productId && it.selectedVariation === selectedVariation))
    );
  };

  const clearCart = () => setItems([]);

  const totalItems = useMemo(() => items.reduce((sum, it) => sum + it.quantity, 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + it.product.price * it.quantity, 0),
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
        clearCart,
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
