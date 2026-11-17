import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { Navbar } from './components/Navbar';
import { CartDrawer } from './components/CartDrawer';
import { Footer } from './components/Footer';
import { NotificationPopups } from './components/NotificationPopups';
import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { SellerStorefrontPage } from './pages/SellerStorefrontPage';
import { SellersPage } from './pages/SellersPage';
import { AuthPages } from './pages/AuthPages';
import { CheckoutPage } from './pages/CheckoutPage';
import { BuyerDashboard } from './pages/BuyerDashboard';
import { SellerDashboard } from './pages/SellerDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { TrackOrderPage } from './pages/TrackOrderPage';

function AppShell() {
  const [locationUrl, setLocationUrl] = useState(() => window.location.pathname + window.location.search);

  useEffect(() => {
    const onPop = () => {
      setLocationUrl(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    const [pathOnly] = to.split('#');
    window.history.pushState({}, '', to);
    setLocationUrl(pathOnly || '/');
    if (!to.includes('#')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const urlObj = new URL(locationUrl, 'http://localhost');
  const pathname = urlObj.pathname;
  const searchParams = urlObj.searchParams;

  const renderRoute = () => {
    if (pathname === '/' || pathname === '') {
      return <HomePage onNavigate={navigate} />;
    }
    if (pathname === '/shop') {
      return <ShopPage initialCategory={searchParams.get('category') || ''} onNavigate={navigate} />;
    }
    if (pathname === '/categories') {
      return <CategoriesPage onNavigate={navigate} />;
    }
    if (pathname.startsWith('/product/')) {
      const id = Number(pathname.replace('/product/', ''));
      return <ProductDetailPage productId={id} onNavigate={navigate} />;
    }
    if (pathname === '/sellers') {
      return <SellersPage onNavigate={navigate} />;
    }
    if (pathname.startsWith('/seller/')) {
      const id = Number(pathname.replace('/seller/', ''));
      return <SellerStorefrontPage sellerUserId={id} onNavigate={navigate} />;
    }
    if (pathname === '/checkout') {
      return <CheckoutPage onNavigate={navigate} />;
    }
    if (pathname === '/login') {
      return <AuthPages mode="login" initialQuery={searchParams} onNavigate={navigate} />;
    }
    if (pathname === '/register') {
      return <AuthPages mode="register" initialQuery={searchParams} onNavigate={navigate} />;
    }
    if (pathname === '/verify-email') {
      return <AuthPages mode="verify-email" initialQuery={searchParams} onNavigate={navigate} />;
    }
    if (pathname === '/reset-password') {
      return <AuthPages mode="reset-password" initialQuery={searchParams} onNavigate={navigate} />;
    }
    if (pathname === '/track-order' || pathname === '/track') {
      return <TrackOrderPage initialQuery={searchParams} onNavigate={navigate} />;
    }
    if (pathname === '/buyer-dashboard') {
      return <BuyerDashboard initialQuery={searchParams} onNavigate={navigate} />;
    }
    if (pathname === '/seller-dashboard') {
      return <SellerDashboard initialQuery={searchParams} onNavigate={navigate} />;
    }
    if (pathname === '/admin') {
      return <AdminDashboard initialQuery={searchParams} />;
    }

    return <HomePage onNavigate={navigate} />;
  };

  return (
    <div className="min-h-screen w-full min-w-0 flex flex-col bg-slate-50 text-slate-900 overflow-x-clip">
      <Navbar currentPath={pathname} onNavigate={navigate} />
      <NotificationPopups onNavigate={navigate} />
      <CartDrawer onNavigate={navigate} />
      <main className="flex-1 w-full min-w-0 overflow-x-hidden">{renderRoute()}</main>
      <Footer onNavigate={navigate} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <NotificationsProvider>
          <AppShell />
        </NotificationsProvider>
      </CartProvider>
    </AuthProvider>
  );
}
