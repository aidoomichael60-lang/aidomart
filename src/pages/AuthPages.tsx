import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Mail, Phone, Plus, ShieldAlert, Store, User } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { AuthUser, MarketplaceCategory } from '../types/marketplace';
import { PhoneInput } from '../components/PhoneInput';

const FALLBACK_CATEGORY_NAMES = [
  'Accessories',
  'Clothing',
  'Electronics',
  'Shoes',
  'Sneakers',
  'Watches',
  'Jewelry & Fine Jewellery',
  'Bags & Luggage',
  'Beauty & Cosmetics',
  'Phones & Tablets',
  'Computers & Laptops',
  'Home & Kitchen',
  'Furniture',
  'Health & Wellness',
  'Sports & Outdoors',
  'Books & Stationery',
  'Food & Beverages',
  'Auto & Motorcycle Parts',
  'Baby & Kids',
  'Arts, Crafts & Handmade',
  'Musical Instruments',
  'Tools & Hardware',
  'Pet Supplies',
  'Other / General Merchandise',
];

interface AuthPagesProps {
  mode: 'login' | 'register' | 'verify-email' | 'reset-password';
  initialQuery?: URLSearchParams;
  onNavigate: (path: string) => void;
}

function getPasswordChecks(pw: string) {
  return [
    { label: 'At least 8 characters', ok: pw.length >= 8 },
    { label: 'Uppercase letter (A–Z)', ok: /[A-Z]/.test(pw) },
    { label: 'Lowercase letter (a–z)', ok: /[a-z]/.test(pw) },
    { label: 'Number (0–9)', ok: /[0-9]/.test(pw) },
    { label: 'Special character (!@#$...)', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

export function AuthPages({ mode, initialQuery, onNavigate }: AuthPagesProps) {
  const { setAuthenticatedUser, refreshUser } = useAuth();

  // Common state
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState(initialQuery?.get('email') || '');
  const [loginPhone, setLoginPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState(false);

  // Login OTP state
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpTargetEmail, setOtpTargetEmail] = useState('');
  const [unverifiedEmailPrompt, setUnverifiedEmailPrompt] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendingCode, setResendingCode] = useState(false);

  // Verify email state
  const [verifyCode, setVerifyCode] = useState(initialQuery?.get('code') || '');
  const [emailVerifiedDone, setEmailVerifiedDone] = useState(false);

  // Password reset state
  const [resetToken, setResetToken] = useState(initialQuery?.get('token') || '');
  const [newPassword, setNewPassword] = useState('');

  // Registration state
  const initialRole = initialQuery?.get('role') === 'seller' ? 'seller' : 'buyer';
  const [regRole, setRegRole] = useState<'buyer' | 'seller'>(initialRole);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [deliveryPickupNotes, setDeliveryPickupNotes] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>(FALLBACK_CATEGORY_NAMES);
  const [customCategoryInput, setCustomCategoryInput] = useState('');

  useEffect(() => {
    apiRequest<{ categories: MarketplaceCategory[] }>('/api/marketplace/categories')
      .then((d) => {
        if (d.categories?.length) {
          const names = d.categories.map((c) => c.name);
          setAvailableCategories((prev) => Array.from(new Set([...names, ...prev])));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setTimeout(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    const qEmail = initialQuery?.get('email');
    const qCode = initialQuery?.get('code');
    const qToken = initialQuery?.get('token');
    const qRole = initialQuery?.get('role');
    if (qEmail) setEmail(qEmail);
    if (qCode) setVerifyCode(qCode);
    if (qToken) setResetToken(qToken);
    if (qRole === 'seller' || qRole === 'buyer') setRegRole(qRole);
  }, [mode, initialQuery]);

  const pwChecks = useMemo(
    () => getPasswordChecks(mode === 'reset-password' ? newPassword : password),
    [mode, password, newPassword]
  );

  const redirectAfterLogin = (u: AuthUser) => {
    if (u.role === 'admin') onNavigate('/admin');
    else if (u.role === 'seller') onNavigate('/seller-dashboard');
    else onNavigate('/buyer-dashboard');
  };

  useEffect(() => {
    apiRequest<{ google: boolean }>('/api/auth/oauth/providers')
      .then((res) => setGoogleConfigured(Boolean(res.google)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleOAuthMessage = async (event: MessageEvent) => {
      const origin = event.origin || '';
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        try {
          const me = await apiRequest<{ user: AuthUser | null; csrfToken: string | null }>(
            '/api/auth/me'
          );
          if (me.user) {
            setAuthenticatedUser(me.user, me.csrfToken);
            redirectAfterLogin(me.user);
          } else {
            await refreshUser();
          }
        } catch {
          await refreshUser();
        } finally {
          setOauthLoading(null);
        }
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setOauthLoading(null);
        setError(event.data?.error || 'Social sign-in could not be completed.');
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const handleGoogleSignIn = async () => {
    setError('');
    setInfo('');
    setOauthLoading('google');
    try {
      const roleParam = mode === 'register' ? `?role=${regRole}` : '';
      const data = await apiRequest<{ url: string }>(
        `/api/auth/oauth/google/url${roleParam}`
      );
      const popup = window.open(
        data.url,
        'aidomart_oauth_popup',
        'width=560,height=680,scrollbars=yes,resizable=yes'
      );
      if (!popup) {
        setOauthLoading(null);
        setError('Popup was blocked by your browser. Please allow popups for this site and try again.');
        return;
      }
      const closeWatcher = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(closeWatcher);
          setOauthLoading(null);
        }
      }, 500);
    } catch (err: any) {
      setOauthLoading(null);
      setError(err.message || 'Unable to start Google Sign-In.');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setUnverifiedEmailPrompt('');
    setSubmitting(true);
    try {
      const payload =
        loginMethod === 'phone'
          ? { phone: loginPhone, password }
          : { email, password };

      const data = await apiRequest<{
        requiresLoginOtp: boolean;
        email?: string;
        message?: string;
        user?: AuthUser;
        csrfToken?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: payload,
      });

      if (data.requiresLoginOtp) {
        setOtpTargetEmail(data.email || email);
        setOtpRequired(true);
        setInfo(data.message || 'Enter the 6-digit login code sent to your email.');
        return;
      }

      if (data.user) {
        setAuthenticatedUser(data.user, data.csrfToken || null);
        redirectAfterLogin(data.user);
      }
    } catch (err: any) {
      if (err?.data?.requiresEmailVerification) {
        setUnverifiedEmailPrompt(err.data.email || email);
      }
      setError(err.message || 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await apiRequest<{ user: AuthUser; csrfToken: string }>(
        '/api/auth/verify-login-code',
        {
          method: 'POST',
          body: { email: otpTargetEmail || email, code: otpCode },
        }
      );
      setAuthenticatedUser(data.user, data.csrfToken);
      redirectAfterLogin(data.user);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendLoginOtp = async () => {
    const targetEmail = (otpTargetEmail || email).trim();
    if (!targetEmail || resendCooldown > 0) return;
    setError('');
    setInfo('');
    setResendingCode(true);
    try {
      const data = await apiRequest<{ message: string; emailDelivered: boolean }>(
        '/api/auth/resend-login-code',
        {
          method: 'POST',
          body: { email: targetEmail },
        }
      );
      setResendCooldown(30);
      if (data.emailDelivered) {
        setInfo(data.message);
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || 'Could not resend login verification code.');
    } finally {
      setResendingCode(false);
    }
  };

  const handleRegister = async (saveAsDraft: boolean) => {
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      const data = await apiRequest<{
        message: string;
        email: string;
        emailDelivered: boolean;
        emailError?: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: {
          role: regRole,
          fullName,
          email,
          phone,
          password,
          businessName,
          businessDescription,
          physicalAddress,
          locationCity,
          deliveryPickupNotes,
          categories: selectedCategories,
          saveAsDraft,
        },
      });
      await refreshUser();
      if (data.emailDelivered) {
        setInfo(data.message);
      } else {
        setError(data.message);
      }
      onNavigate(`/verify-email?email=${encodeURIComponent(data.email)}`);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setEmailVerifiedDone(false);
    setSubmitting(true);
    try {
      const data = await apiRequest<{ message: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: { email, code: verifyCode },
      });
      setEmailVerifiedDone(true);
      setInfo(data.message);
    } catch (err: any) {
      setError(err.message || 'Email verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setInfo('');
    setEmailVerifiedDone(false);
    setResendingCode(true);
    try {
      const data = await apiRequest<{ message: string; emailDelivered: boolean; emailError?: string }>(
        '/api/auth/resend-verification',
        { method: 'POST', body: { email: unverifiedEmailPrompt || email } }
      );
      setResendCooldown(30);
      if (data.emailDelivered) {
        setInfo(data.message);
      } else {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err.message || 'Could not resend verification email.');
    } finally {
      setResendingCode(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      const data = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setInfo(data.message);
    } catch (err: any) {
      setError(err.message || 'Unable to process password reset.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      const data = await apiRequest<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: { email, token: resetToken, newPassword },
      });
      setInfo(data.message);
    } catch (err: any) {
      setError(err.message || 'Unable to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 sm:py-12">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 shadow-sm space-y-6">
        {mode === 'login' && (
          <>
            <div>
              <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
                Sign in to AIDOMART
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Access your Buyer or Seller account securely.
              </p>
            </div>

            {!otpRequired ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('email');
                      setError('');
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                      loginMethod === 'email'
                        ? 'bg-white text-[#0B1F3A] shadow-sm'
                        : 'text-slate-600 hover:text-[#0B1F3A]'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Sign in with Email</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('phone');
                      setError('');
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                      loginMethod === 'phone'
                        ? 'bg-white text-[#0B1F3A] shadow-sm'
                        : 'text-slate-600 hover:text-[#0B1F3A]'
                    }`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Sign in with Phone</span>
                  </button>
                </div>

                {loginMethod === 'email' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Telephone Number (with Country Code)
                    </label>
                    <PhoneInput
                      required
                      value={loginPhone}
                      onChange={setLoginPhone}
                      placeholder="20 000 0000"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 space-y-2">
                    <p>{error}</p>
                    {unverifiedEmailPrompt && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={resendingCode || resendCooldown > 0}
                          onClick={handleResendVerification}
                          className="font-semibold underline text-[#0B1F3A] disabled:opacity-50"
                        >
                          {resendingCode
                            ? 'Sending...'
                            : resendCooldown > 0
                              ? `Resend in ${resendCooldown}s`
                              : 'Resend Verification Code'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate(`/verify-email?email=${encodeURIComponent(unverifiedEmailPrompt)}`)
                          }
                          className="font-semibold underline text-[#F97316]"
                        >
                          Enter Verification Code
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {info && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    {info}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                >
                  {submitting ? 'Signing in...' : 'Sign In'}
                </button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-3 text-slate-400 font-semibold">
                      Or continue with
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={oauthLoading !== null}
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition-colors disabled:opacity-60"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.22 1.18-3.25 0-6-2.19-6.98-5.14H1.01v3.14C3.05 21.2 7.23 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.02 14.03c-.25-.74-.39-1.54-.39-2.36s.14-1.62.39-2.36V6.17H1.01A11.98 11.98 0 0 0 0 11.67c0 1.93.46 3.76 1.01 5.5l4.01-3.14z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.51-3.51C18.07 1.19 15.3 0 12 0 7.23 0 3.05 2.8 1.01 6.83l4.01 3.14C6 6.94 8.75 4.75 12 4.75z"
                    />
                  </svg>
                  <span>
                    {oauthLoading === 'google' ? 'Connecting to Google...' : 'Continue with Google (Gmail)'}
                  </span>
                </button>

                {!googleConfigured && (
                  <p className="text-[11px] text-slate-400 text-center">
                    Google Sign-In connects once Google OAuth keys are added to server environment settings.
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-600">
                  <button
                    type="button"
                    onClick={() => onNavigate('/reset-password')}
                    className="hover:text-[#F97316] font-medium"
                  >
                    Forgot password?
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/register')}
                    className="hover:text-[#F97316] font-semibold text-[#0B1F3A]"
                  >
                    Create Buyer or Seller account
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyLoginOtp} className="space-y-4">
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
                  <KeyRound className="w-4 h-4 text-[#F97316] shrink-0 mt-0.5" />
                  <span>
                    We sent a 6-digit login verification code to <strong>{otpTargetEmail || email}</strong>. Enter it below to complete sign-in.
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="123456"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg font-mono text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                  />
                </div>
                {error && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">
                    {error}
                  </p>
                )}
                {info && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
                    {info}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 min-h-[42px] py-2.5 px-4 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-sm font-semibold"
                  >
                    {submitting ? 'Verifying...' : 'Verify & Sign In'}
                  </button>
                  <button
                    type="button"
                    disabled={resendingCode || resendCooldown > 0}
                    onClick={handleResendLoginOtp}
                    className="min-h-[42px] px-4 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50 disabled:opacity-50"
                  >
                    {resendingCode
                      ? 'Sending...'
                      : resendCooldown > 0
                        ? `Resend (${resendCooldown}s)`
                        : 'Resend Code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpRequired(false);
                      setOtpCode('');
                      setError('');
                      setInfo('');
                    }}
                    className="min-h-[42px] px-4 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                  >
                    Back
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {mode === 'register' && (
          <>
            <div>
              <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
                Create Your AIDOMART Account
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Select whether you are registering to shop as a Buyer or to apply as an independent Seller.
              </p>
            </div>

            {/* Distinct Buyer vs Seller Account Type Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRegRole('buyer')}
                className={`p-4 rounded-xl border-2 text-left transition-colors ${
                  regRole === 'buyer'
                    ? 'border-[#F97316] bg-orange-50/50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 font-display font-bold text-sm text-[#0B1F3A]">
                  <User className="w-4 h-4 text-[#F97316]" />
                  <span>Buyer Account</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Browse products, visit seller storefronts, place orders, report manual payments, and leave verified reviews.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setRegRole('seller')}
                className={`p-4 rounded-xl border-2 text-left transition-colors ${
                  regRole === 'seller'
                    ? 'border-[#F97316] bg-orange-50/50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 font-display font-bold text-sm text-[#0B1F3A]">
                  <Store className="w-4 h-4 text-[#F97316]" />
                  <span>Seller Account</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Submit business verification for admin approval, manage your private storefront, publish products, and verify payments.
                </p>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRegister(false);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Legal Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Telephone Number {regRole === 'seller' ? '*' : '(Optional)'}
                  </label>
                  <PhoneInput
                    required={regRole === 'seller'}
                    value={phone}
                    onChange={setPhone}
                    placeholder="20 000 0000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {pwChecks.map((c) => (
                    <div
                      key={c.label}
                      className={`flex items-center gap-1.5 text-[11px] ${
                        c.ok ? 'text-emerald-700 font-medium' : 'text-slate-500'
                      }`}
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${c.ok ? 'text-emerald-600' : 'text-slate-300'}`} />
                      <span>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {regRole === 'seller' && (
                <div className="pt-4 border-t border-slate-200 space-y-4">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-[#F97316] shrink-0 mt-0.5" />
                    <span>
                      Seller accounts require administrator approval before publishing products. After registering and verifying your email, you can upload supporting verification documents and business photos in your Seller Dashboard.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Business / Trading Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        City / Region
                      </label>
                      <input
                        type="text"
                        value={locationCity}
                        onChange={(e) => setLocationCity(e.target.value)}
                        placeholder="e.g. Accra, Kumasi, Takoradi"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Physical Business Address & Location Details *
                    </label>
                    <input
                      type="text"
                      required
                      value={physicalAddress}
                      onChange={(e) => setPhysicalAddress(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Business Description *
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={businessDescription}
                      onChange={(e) => setBusinessDescription(e.target.value)}
                      placeholder="Describe your business and the authentic products you intend to sell..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Product Categories (Select all that apply or add your own)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set([...availableCategories, ...selectedCategories])).map((catName) => {
                        const checked = selectedCategories.includes(catName);
                        return (
                          <button
                            key={catName}
                            type="button"
                            onClick={() =>
                              setSelectedCategories((prev) =>
                                checked ? prev.filter((x) => x !== catName) : [...prev, catName]
                              )
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              checked
                                ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                                : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                            }`}
                          >
                            {catName}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2.5 flex gap-2">
                      <input
                        type="text"
                        value={customCategoryInput}
                        onChange={(e) => setCustomCategoryInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const trimmed = customCategoryInput.trim();
                            if (trimmed && !selectedCategories.includes(trimmed)) {
                              setSelectedCategories((prev) => [...prev, trimmed]);
                              setAvailableCategories((prev) =>
                                prev.includes(trimmed) ? prev : [...prev, trimmed]
                              );
                            }
                            setCustomCategoryInput('');
                          }
                        }}
                        placeholder="Other business type (e.g. Bridal Wear, Solar Gear)..."
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = customCategoryInput.trim();
                          if (trimmed && !selectedCategories.includes(trimmed)) {
                            setSelectedCategories((prev) => [...prev, trimmed]);
                            setAvailableCategories((prev) =>
                              prev.includes(trimmed) ? prev : [...prev, trimmed]
                            );
                          }
                          setCustomCategoryInput('');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-[#0B1F3A]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Delivery & Pickup Arrangements
                    </label>
                    <input
                      type="text"
                      value={deliveryPickupNotes}
                      onChange={(e) => setDeliveryPickupNotes(e.target.value)}
                      placeholder="e.g. Same-day courier in Accra or storefront pickup"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 px-4 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                >
                  {submitting
                    ? 'Creating Account...'
                    : regRole === 'seller'
                      ? 'Register & Submit Seller Application'
                      : 'Create Buyer Account'}
                </button>
                {regRole === 'seller' && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleRegister(true)}
                    className="py-3 px-4 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold"
                  >
                    Save Application as Draft
                  </button>
                )}
              </div>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-3 text-slate-400 font-semibold">
                    Or register as {regRole === 'seller' ? 'Seller' : 'Buyer'} with
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={oauthLoading !== null}
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition-colors disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.22 1.18-3.25 0-6-2.19-6.98-5.14H1.01v3.14C3.05 21.2 7.23 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.02 14.03c-.25-.74-.39-1.54-.39-2.36s.14-1.62.39-2.36V6.17H1.01A11.98 11.98 0 0 0 0 11.67c0 1.93.46 3.76 1.01 5.5l4.01-3.14z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.51-3.51C18.07 1.19 15.3 0 12 0 7.23 0 3.05 2.8 1.01 6.83l4.01 3.14C6 6.94 8.75 4.75 12 4.75z"
                  />
                </svg>
                <span>
                  {oauthLoading === 'google' ? 'Connecting to Google...' : 'Continue with Google (Gmail)'}
                </span>
              </button>

              <p className="text-xs text-center text-slate-600 pt-2">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('/login')}
                  className="font-semibold text-[#0B1F3A] hover:text-[#F97316]"
                >
                  Sign in here
                </button>
              </p>
            </form>
          </>
        )}

        {mode === 'verify-email' && (
          <>
            <div>
              <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
                Verify Your Email Address
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Enter the 6-digit verification code sent to your email address.
              </p>
            </div>

            <form onSubmit={handleVerifyEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Verification Code
                </label>
                <input
                  type="text"
                  required
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="6-digit code"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg font-mono text-base tracking-widest"
                />
              </div>
              {error && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">
                  {error}
                </p>
              )}
              {info && (
                <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-3 rounded-lg space-y-2">
                  <p>{info}</p>
                  {emailVerifiedDone && (
                    <button
                      type="button"
                      onClick={() => onNavigate('/login')}
                      className="font-semibold underline text-[#0B1F3A]"
                    >
                      Proceed to Sign In
                    </button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-[#0B1F3A] text-white text-sm font-semibold hover:bg-[#122E53]"
                >
                  {submitting ? 'Verifying...' : 'Verify Email'}
                </button>
                <button
                  type="button"
                  disabled={submitting || resendingCode || !email || resendCooldown > 0}
                  onClick={handleResendVerification}
                  className="min-h-[42px] py-2.5 px-4 rounded-lg border border-slate-300 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50 disabled:opacity-50"
                >
                  {resendingCode
                    ? 'Sending...'
                    : resendCooldown > 0
                      ? `Resend (${resendCooldown}s)`
                      : 'Resend Code'}
                </button>
              </div>
            </form>
          </>
        )}

        {mode === 'reset-password' && (
          <>
            <div>
              <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
                {resetToken ? 'Set a New Password' : 'Reset Your Password'}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {resetToken
                  ? 'Enter your new password below. All active sessions will be cleared.'
                  : 'Enter your registered email address to receive a secure single-use password reset link.'}
              </p>
            </div>

            {!resetToken ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registered Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                {error && <p className="text-xs text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
                {info && <p className="text-xs text-emerald-800 bg-emerald-50 p-3 rounded-lg">{info}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-lg bg-[#0B1F3A] text-white text-sm font-semibold"
                >
                  {submitting ? 'Sending...' : 'Send Password Reset Link'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
                  />
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {pwChecks.map((c) => (
                      <div
                        key={c.label}
                        className={`flex items-center gap-1.5 text-[11px] ${
                          c.ok ? 'text-emerald-700 font-medium' : 'text-slate-500'
                        }`}
                      >
                        <CheckCircle2 className={`w-3.5 h-3.5 ${c.ok ? 'text-emerald-600' : 'text-slate-300'}`} />
                        <span>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {error && <p className="text-xs text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
                {info && (
                  <div className="text-xs text-emerald-800 bg-emerald-50 p-3 rounded-lg space-y-2">
                    <p>{info}</p>
                    <button
                      type="button"
                      onClick={() => onNavigate('/login')}
                      className="font-semibold underline text-[#0B1F3A]"
                    >
                      Sign In Now
                    </button>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-lg bg-[#F97316] text-white text-sm font-semibold"
                >
                  {submitting ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
