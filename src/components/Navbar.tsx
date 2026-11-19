import React, { useState } from 'react';
import { Bell, CheckCheck, Menu, Search, ShoppingBag, Volume2, VolumeX, X, LogOut, User } from 'lucide-react';
import { AIDOMART_ASSETS } from '../constants/assets';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useNotifications } from '../context/NotificationsContext';
import { apiRequest } from '../lib/api';
import { getAccountDisplayName } from '../utils/greeting';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

function formatNotifTimestamp(raw: string): string {
  if (!raw) return '';
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(ms).toLocaleDateString();
}

export function Navbar({ currentPath, onNavigate }: NavbarProps) {
  const { user, logout, refreshUser } = useAuth();
  const { totalItems, setDrawerOpen } = useCart();
  const {
    notifications,
    unreadCount,
    readCount,
    desktopPermission,
    requestDesktopPermission,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [navSearch, setNavSearch] = useState('');

  const handleNavSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = navSearch.trim();
    setMobileMenuOpen(false);
    setNotifOpen(false);
    onNavigate(q ? `/shop?q=${encodeURIComponent(q)}` : '/shop');
  };

  const profileAvatarUrl =
    user?.role === 'seller' && user.sellerProfile?.storefrontImage
      ? user.sellerProfile.storefrontImage
      : null;

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'Shop', path: '/shop' },
    { label: 'Sellers', path: '/sellers' },
    { label: 'Categories', path: '/categories' },
    { label: 'Track Order', path: '/track-order' },
    { label: 'Contact', path: '/#contact' },
  ];

  const handleLinkClick = (path: string) => {
    setMobileMenuOpen(false);
    setNotifOpen(false);
    if (path === '/#contact') {
      if (currentPath !== '/') {
        onNavigate('/');
        setTimeout(() => {
          document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
        }, 120);
      } else {
        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
    onNavigate(path);
  };

  const dashboardPath =
    user?.role === 'admin'
      ? '/admin'
      : user?.role === 'seller'
        ? '/seller-dashboard'
        : '/buyer-dashboard';

  const toggleSound = async () => {
    if (!user) return;
    await apiRequest('/api/auth/preferences', {
      method: 'PATCH',
      body: { soundEnabled: !user.soundEnabled },
    });
    await refreshUser();
  };

  return (
    <header className="sticky top-0 z-40 w-full max-w-full overflow-x-clip bg-[#0B1F3A] text-white border-b border-white/10">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-8 min-w-0">
        {/* Zone 1: Brand Logo */}
        <button
          type="button"
          onClick={() => handleLinkClick('/')}
          className="flex items-center gap-2 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-md py-1"
        >
          {!logoFailed ? (
            <img
              src={AIDOMART_ASSETS.branding.logo}
              alt="AIDOMART Logo"
              onError={() => setLogoFailed(true)}
              className="h-8 sm:h-9 w-auto object-contain"
            />
          ) : (
            <span className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-white">
              AIDO<span className="text-[#F97316]">MART</span>
            </span>
          )}
        </button>

        {/* Zone 2: Public Navigation Links & Search */}
        <div className="hidden md:flex items-center gap-5 lg:gap-6 text-sm font-medium text-slate-200 min-w-0">
          <nav className="flex items-center gap-5 lg:gap-6">
            {navLinks.map((link) => {
              const active = currentPath === link.path;
              return (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => handleLinkClick(link.path)}
                  className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                    active
                      ? 'border-[#F97316] text-white'
                      : 'border-transparent hover:text-white hover:border-white/30'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          <form onSubmit={handleNavSearchSubmit} className="hidden lg:flex items-center relative w-52 xl:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="search"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              placeholder="Search products, size, color..."
              aria-label="Search AIDOMART"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-xs text-white placeholder:text-slate-300 focus:outline-none focus:bg-white focus:text-slate-900 focus:placeholder:text-slate-400 transition-colors"
            />
          </form>
        </div>

        {/* Zone 3: Functional Cart & Account Controls */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setNotifOpen(false);
              setDrawerOpen(true);
            }}
            aria-label="Open shopping cart"
            className="relative flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 min-h-[40px] rounded-lg text-sm font-medium text-slate-100 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-4 h-4 text-[#F97316]" />
            <span className="hidden sm:inline">Cart</span>
            <span className="tabular-nums text-xs font-mono font-semibold bg-[#F97316] text-white px-1.5 py-0.5 rounded">
              {totalItems}
            </span>
          </button>

          {user ? (
            <div className="relative flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setNotifOpen((o) => !o);
                }}
                aria-label="Notifications"
                aria-expanded={notifOpen}
                className="relative p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#F97316] text-white text-[10px] font-mono font-bold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-slate-950/25 sm:bg-transparent"
                    onClick={() => setNotifOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="fixed inset-x-3 top-[68px] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50">
                    {/* Clean two-row mobile-friendly header */}
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-[#0B1F3A] block leading-tight">
                            Notifications
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                            {unreadCount} unread · {readCount} read
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={toggleSound}
                            title={user.soundEnabled ? 'Mute notification sound' : 'Unmute notification sound'}
                            aria-label={user.soundEnabled ? 'Mute sound' : 'Unmute sound'}
                            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-600 flex items-center justify-center"
                          >
                            {user.soundEnabled ? (
                              <Volume2 className="w-4 h-4 text-[#F97316]" />
                            ) : (
                              <VolumeX className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setNotifOpen(false)}
                            aria-label="Close notifications"
                            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllAsRead}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-[#F97316] text-xs font-semibold text-[#0B1F3A] hover:text-[#F97316] transition-colors"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Mark all notifications as read</span>
                        </button>
                      )}
                    </div>

                    {desktopPermission === 'default' && (
                      <div className="px-4 py-2.5 bg-orange-50 border-b border-orange-100 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-700 leading-snug">
                          Enable device alert popups for new activity
                        </span>
                        <button
                          type="button"
                          onClick={requestDesktopPermission}
                          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-[#F97316] hover:bg-[#EA580C] text-white shrink-0"
                        >
                          Enable
                        </button>
                      </div>
                    )}

                    <div className="max-h-[60vh] sm:max-h-96 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          No notifications yet. Activity on your orders and account will appear here.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={async () => {
                              if (!n.isRead) await markAsRead(n.id);
                              setNotifOpen(false);
                              if (n.link) onNavigate(n.link);
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-2.5 ${
                              !n.isRead ? 'bg-orange-50/55' : ''
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                                !n.isRead ? 'bg-[#F97316]' : 'bg-slate-300'
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <span
                                  className={`text-xs leading-snug break-words ${
                                    !n.isRead ? 'font-bold text-[#0B1F3A]' : 'font-semibold text-slate-700'
                                  }`}
                                >
                                  {n.title}
                                </span>
                                <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0 mt-0.5">
                                  {formatNotifTimestamp(n.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words line-clamp-3">
                                {n.message}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => handleLinkClick(dashboardPath)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {profileAvatarUrl && !avatarFailed ? (
                  <img
                    src={profileAvatarUrl}
                    alt={getAccountDisplayName(user)}
                    onError={() => setAvatarFailed(true)}
                    className="w-5 h-5 rounded-full object-cover border border-white/40 shrink-0"
                  />
                ) : (
                  <User className="w-3.5 h-3.5" />
                )}
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  await logout();
                  onNavigate('/');
                }}
                aria-label="Sign out"
                title="Sign out"
                className="hidden sm:inline-flex p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleLinkClick('/login')}
                className="px-3 py-2 text-xs font-semibold text-slate-100 hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => handleLinkClick('/register')}
                className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                Register
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setNotifOpen(false);
              setMobileMenuOpen((o) => !o);
            }}
            aria-label="Toggle mobile menu"
            className="md:hidden p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-200 hover:bg-white/10"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#122E53] border-t border-white/10 px-4 py-4 space-y-2">
          <form onSubmit={handleNavSearchSubmit} className="flex gap-2 pb-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                placeholder="Search products or sellers..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 rounded-lg bg-[#F97316] text-white text-xs font-semibold shrink-0"
            >
              Search
            </button>
          </form>
          {navLinks.map((link) => {
            const active = currentPath === link.path;
            return (
              <button
                key={link.path}
                type="button"
                onClick={() => handleLinkClick(link.path)}
                className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-white/15 text-white font-semibold' : 'text-slate-100 hover:bg-white/10'
                }`}
              >
                {link.label}
              </button>
            );
          })}
          <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => handleLinkClick(dashboardPath)}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#F97316] text-white text-sm font-semibold text-center inline-flex items-center justify-center gap-2"
                >
                  {profileAvatarUrl && !avatarFailed ? (
                    <img
                      src={profileAvatarUrl}
                      alt={getAccountDisplayName(user)}
                      onError={() => setAvatarFailed(true)}
                      className="w-5 h-5 rounded-full object-cover border border-white/40 shrink-0"
                    />
                  ) : (
                    <User className="w-4 h-4 shrink-0" />
                  )}
                  <span>Open Dashboard ({getAccountDisplayName(user)})</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    setMobileMenuOpen(false);
                    onNavigate('/');
                  }}
                  className="w-full py-2.5 px-4 rounded-lg bg-white/10 text-slate-100 text-sm font-medium"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleLinkClick('/login')}
                  className="py-2.5 px-4 rounded-lg bg-white/10 text-white text-sm font-semibold"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => handleLinkClick('/register')}
                  className="py-2.5 px-4 rounded-lg bg-[#F97316] text-white text-sm font-semibold"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
