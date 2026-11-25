import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Eye,
  MapPin,
  MessageCircle,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  Send,
  ShoppingBag,
  Star,
  Store,
  Tag,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { AIDOMART_ASSETS } from '../constants/assets';
import { apiRequest } from '../lib/api';
import {
  chunkUploadBatches,
  prepareDocumentFiles,
  prepareImageFiles,
} from '../lib/imageUpload';
import { useAuth } from '../context/AuthContext';
import type {
  MarketplaceCategory,
  Order,
  Product,
  SellerConversation,
  SellerProfile,
} from '../types/marketplace';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { SafeAssetImage } from '../components/SafeAssetImage';
import { PhoneInput } from '../components/PhoneInput';
import { PromoManagerPanel } from '../components/PromoManagerPanel';
import { WhatsAppIcon, buildWhatsAppUrl } from '../components/WhatsAppIcon';
import { useLoginGreeting } from '../utils/greeting';

interface SellerDashboardProps {
  initialQuery?: URLSearchParams;
  onNavigate: (path: string) => void;
}

type SellerTab =
  | 'overview'
  | 'profile'
  | 'products'
  | 'promotions'
  | 'orders'
  | 'messages'
  | 'payments'
  | 'feedback';

function normalizeSellerTab(rawTab: string | null | undefined): SellerTab {
  if (!rawTab) return 'overview';
  if (rawTab === 'application' || rawTab === 'profile') return 'profile';
  if (rawTab === 'payment-settings' || rawTab === 'payments') return 'payments';
  if (rawTab === 'promos' || rawTab === 'promotions') return 'promotions';
  if (
    rawTab === 'overview' ||
    rawTab === 'products' ||
    rawTab === 'orders' ||
    rawTab === 'messages' ||
    rawTab === 'feedback'
  ) {
    return rawTab;
  }
  return 'overview';
}

const TRACKING_STAGE_PRESETS = [
  'Order Placed',
  'Confirmed & Preparing',
  'Packed & Ready',
  'Dispatched / In Transit',
  'Out for Delivery',
  'Ready for Pickup',
  'Delivered / Completed',
];

export function SellerDashboard({ initialQuery, onNavigate }: SellerDashboardProps) {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState<SellerTab>(() => normalizeSellerTab(initialQuery?.get('tab')));

  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const { greeting } = useLoginGreeting(
    user ? { ...user, sellerProfile: profile ?? user.sellerProfile } : null
  );
  const [documents, setDocuments] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Focused action loading & inline feedback states
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingApp, setSavingApp] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadingProductImages, setUploadingProductImages] = useState(false);
  const [savingPaymentSettings, setSavingPaymentSettings] = useState(false);
  const [verifyingOrderId, setVerifyingOrderId] = useState<number | null>(null);
  const [busyProductId, setBusyProductId] = useState<number | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [replyingKey, setReplyingKey] = useState<string | null>(null);

  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [photoFeedback, setPhotoFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [docFeedback, setDocFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [profileFeedback, setProfileFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [paymentFeedback, setPaymentFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [customCategoryInput, setCustomCategoryInput] = useState('');

  // Business & Verification form state
  const [appForm, setAppForm] = useState({
    legalName: '',
    businessName: '',
    phone: '',
    description: '',
    physicalAddress: '',
    locationCity: '',
    deliveryPickupNotes: '',
    categories: [] as string[],
  });

  // Payment settings state
  const [payForm, setPayForm] = useState({
    momoEnabled: false,
    momoProvider: 'MTN Mobile Money',
    momoAccountName: '',
    momoNumber: '',
    momoInstructions: '',
    bankEnabled: false,
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankBranch: '',
    bankInstructions: '',
  });

  // Product editor & preview state
  const productEditorRef = useRef<HTMLDivElement | null>(null);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [prodForm, setProdForm] = useState({
    title: '',
    categoryId: '',
    price: '',
    stock: '',
    description: '',
    sizesText: '',
    colorsText: '',
    variationsText: '',
    images: [] as string[],
    published: true,
  });
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [viewingImageIdx, setViewingImageIdx] = useState(0);
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [draftPreviewImageIdx, setDraftPreviewImageIdx] = useState(0);
  const [imageLightbox, setImageLightbox] = useState<{
    images: string[];
    index: number;
    context: 'product' | 'business';
  } | null>(null);

  // Payment verification note & replies
  const [verifyNotes, setVerifyNotes] = useState<Record<number, string>>({});
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  // Order tracking editor state
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [trackingForm, setTrackingForm] = useState({
    trackingStage: 'Confirmed & Preparing',
    trackingLocation: '',
    estimatedDelivery: '',
    courierContact: '',
    trackingNote: '',
    orderStatus: '',
  });
  const [savingTracking, setSavingTracking] = useState(false);

  // Seller <-> Buyer Messages state
  const [conversations, setConversations] = useState<SellerConversation[]>([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(() => {
    const q = initialQuery?.get('buyerId');
    return q ? Number(q) : null;
  });
  const [buyerReplyDraft, setBuyerReplyDraft] = useState('');
  const [sendingBuyerReply, setSendingBuyerReply] = useState(false);

  const syncFormFromProfile = (p: SellerProfile) => {
    setProfile(p);
    setAppForm({
      legalName: p.legalName || '',
      businessName: p.businessName || '',
      phone: p.phone || '',
      description: p.description || '',
      physicalAddress: p.physicalAddress || '',
      locationCity: p.locationCity || '',
      deliveryPickupNotes: p.deliveryPickupNotes || '',
      categories: p.categories || [],
    });
    if (p.paymentSettings) {
      setPayForm({
        momoEnabled: Boolean(p.paymentSettings.momoEnabled),
        momoProvider: p.paymentSettings.momoProvider || 'MTN Mobile Money',
        momoAccountName: p.paymentSettings.momoAccountName || '',
        momoNumber: p.paymentSettings.momoNumber || '',
        momoInstructions: p.paymentSettings.momoInstructions || '',
        bankEnabled: Boolean(p.paymentSettings.bankEnabled),
        bankName: p.paymentSettings.bankName || '',
        bankAccountName: p.paymentSettings.bankAccountName || '',
        bankAccountNumber: p.paymentSettings.bankAccountNumber || '',
        bankBranch: p.paymentSettings.bankBranch || '',
        bankInstructions: p.paymentSettings.bankInstructions || '',
      });
    }
  };

  const loadAll = async () => {
    try {
      const [dash, cats, prods, ords, fb, msgs] = await Promise.all([
        apiRequest<{ profile: SellerProfile; documents: any[]; analytics: any }>(
          '/api/seller/dashboard'
        ),
        apiRequest<{ categories: MarketplaceCategory[] }>('/api/marketplace/categories'),
        apiRequest<{ products: Product[] }>('/api/seller/products'),
        apiRequest<{ orders: Order[] }>('/api/seller/orders'),
        apiRequest<{ complaints: any[]; reviews: any[] }>('/api/seller/complaints'),
        apiRequest<{ conversations: SellerConversation[] }>('/api/seller/messages'),
      ]);

      syncFormFromProfile(dash.profile);
      setDocuments(dash.documents || []);
      setAnalytics(dash.analytics);

      const catList = cats.categories || [];
      setCategories(catList);
      if (catList.length > 0 && !prodForm.categoryId) {
        setProdForm((p) => ({ ...p, categoryId: String(catList[0].id) }));
      }
      setProducts(prods.products || []);
      setOrders(ords.orders || []);
      setComplaints(fb.complaints || []);
      setReviews(fb.reviews || []);
      const convList = msgs.conversations || [];
      setConversations(convList);
      if (convList.length > 0 && !selectedBuyerId) {
        setSelectedBuyerId(convList[0].buyerId);
      }
    } catch {
      // ignore transient load failures
    }
  };

  const togglePresetOption = (field: 'sizesText' | 'colorsText', option: string) => {
    setProdForm((prev) => {
      const list = prev[field]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const exists = list.some((x) => x.toLowerCase() === option.toLowerCase());
      const nextList = exists
        ? list.filter((x) => x.toLowerCase() !== option.toLowerCase())
        : [...list, option];
      return { ...prev, [field]: nextList.join(', ') };
    });
  };

  const startEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setProdForm({
      title: p.title,
      categoryId: String(p.categoryId),
      price: String(p.price),
      stock: String(p.stock),
      description: p.description,
      sizesText: (p.sizes || []).join(', '),
      colorsText: (p.colors || []).join(', '),
      variationsText: p.variations.join(', '),
      images: p.images,
      published: p.published,
    });
    setViewingProduct(null);
    setTab('products');
    setTimeout(() => {
      productEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  useEffect(() => {
    const qTab = initialQuery?.get('tab');
    const qBuyerId = initialQuery?.get('buyerId');
    if (qTab) {
      setTab(normalizeSellerTab(qTab));
    }
    if (qBuyerId) {
      setSelectedBuyerId(Number(qBuyerId));
    }
  }, [initialQuery?.toString()]);

  useEffect(() => {
    const editIdParam = Number(initialQuery?.get('editProduct'));
    if (Number.isFinite(editIdParam) && editIdParam > 0 && products.length > 0) {
      const target = products.find((p) => p.id === editIdParam);
      if (target) {
        startEditProduct(target);
      }
    }
  }, [initialQuery?.get('editProduct'), products.length]);

  useEffect(() => {
    if (user?.role === 'seller') {
      loadAll();
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  if (!user || user.role !== 'seller') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">Seller Dashboard</h1>
        <p className="text-sm text-slate-600">
          Please sign in with a Seller account to manage your business and storefront.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/login')}
          className="px-5 py-2.5 rounded-lg bg-[#0B1F3A] text-white text-sm font-semibold"
        >
          Sign In
        </button>
      </div>
    );
  }

  const isApproved = profile?.applicationStatus === 'Approved';

  const notifyResult = (msg: string, isErr = false) => {
    if (isErr) {
      setErrorMsg(msg);
      setStatusMsg('');
    } else {
      setStatusMsg(msg);
      setErrorMsg('');
    }
  };

  // Compute missing required info for Admin Approval
  const requiredApprovalChecks = [
    { key: 'legalName', label: 'Legal Name', done: Boolean(appForm.legalName.trim()) },
    { key: 'businessName', label: 'Business Name', done: Boolean(appForm.businessName.trim()) },
    { key: 'phone', label: 'Telephone Number', done: Boolean(appForm.phone.trim()) },
    { key: 'locationCity', label: 'City / Region', done: Boolean(appForm.locationCity.trim()) },
    { key: 'physicalAddress', label: 'Physical Business Address', done: Boolean(appForm.physicalAddress.trim()) },
    { key: 'description', label: 'Business Description', done: Boolean(appForm.description.trim()) },
  ];
  const missingRequiredFields = requiredApprovalChecks.filter((c) => !c.done).map((c) => c.label);

  const recommendedChecks = [
    { label: 'Storefront Profile Picture', done: Boolean(profile?.storefrontImage || avatarPreviewUrl) },
    { label: 'Product Categories', done: appForm.categories.length > 0 },
    { label: 'Payment Receiving Method', done: Boolean(payForm.momoEnabled || payForm.bankEnabled) },
  ];

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);
    if (!appForm.businessName.trim() || !appForm.phone.trim()) {
      const msg = 'Business Name and Contact Telephone Number are required.';
      setProfileFeedback({ ok: false, text: msg });
      notifyResult(msg, true);
      return;
    }

    setSavingProfile(true);
    try {
      const res = await apiRequest<{ message: string; profile?: SellerProfile }>('/api/seller/profile', {
        method: 'PUT',
        body: {
          legalName: appForm.legalName.trim(),
          businessName: appForm.businessName.trim(),
          description: appForm.description.trim(),
          phone: appForm.phone.trim(),
          physicalAddress: appForm.physicalAddress.trim(),
          locationCity: appForm.locationCity.trim(),
          deliveryPickupNotes: appForm.deliveryPickupNotes.trim(),
          categories: appForm.categories,
        },
      });
      if (res.profile) {
        syncFormFromProfile(res.profile);
      }
      setProfileFeedback({ ok: true, text: res.message || 'Business profile updated.' });
      notifyResult(res.message || 'Business profile updated.');
      await Promise.all([loadAll(), refreshUser()]);
    } catch (err: any) {
      const msg = err?.message || 'Could not update profile.';
      setProfileFeedback({ ok: false, text: msg });
      notifyResult(msg, true);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveApplication = async (submitForReview: boolean) => {
    setProfileFeedback(null);
    if (submitForReview && missingRequiredFields.length > 0) {
      const msg = `Please fill in all required information before submitting for admin approval: ${missingRequiredFields.join(', ')}.`;
      setProfileFeedback({ ok: false, text: msg });
      notifyResult(msg, true);
      return;
    }

    if (submitForReview) setSavingApp(true);
    else setSavingDraft(true);

    try {
      const res = await apiRequest<{
        message: string;
        applicationStatus?: string;
        profile?: SellerProfile;
      }>('/api/seller/application', {
        method: 'PUT',
        body: {
          legalName: appForm.legalName.trim(),
          businessName: appForm.businessName.trim(),
          phone: appForm.phone.trim(),
          description: appForm.description.trim(),
          physicalAddress: appForm.physicalAddress.trim(),
          locationCity: appForm.locationCity.trim(),
          deliveryPickupNotes: appForm.deliveryPickupNotes.trim(),
          categories: appForm.categories,
          submitForReview,
        },
      });
      if (res.profile) {
        syncFormFromProfile(res.profile);
      }
      setProfileFeedback({ ok: true, text: res.message });
      notifyResult(res.message);
      await Promise.all([loadAll(), refreshUser()]);
    } catch (err: any) {
      const msg = err?.message || 'Could not save seller application.';
      setProfileFeedback({ ok: false, text: msg });
      notifyResult(msg, true);
    } finally {
      setSavingApp(false);
      setSavingDraft(false);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setDocFeedback(null);
    setUploadingDocs(true);
    try {
      const prepared = await prepareDocumentFiles(files);
      const batches = chunkUploadBatches(prepared);
      let lastMessage = '';
      for (const batch of batches) {
        const res = await apiRequest<{ message: string }>('/api/seller/application/documents', {
          method: 'POST',
          body: {
            files: batch.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
          },
        });
        lastMessage = res.message;
      }
      const msg =
        prepared.length > 1
          ? `${prepared.length} verification document(s) uploaded for administrator review.`
          : lastMessage || 'Verification document uploaded.';
      setDocFeedback({ ok: true, text: msg });
      notifyResult(msg);
      await loadAll();
    } catch (err: any) {
      const msg = err?.message || 'Could not upload verification document.';
      setDocFeedback({ ok: false, text: msg });
      notifyResult(msg, true);
    } finally {
      setUploadingDocs(false);
      e.target.value = '';
    }
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'storefront' | 'business'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setPhotoFeedback(null);

    if (kind === 'storefront') {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      const localObjUrl = URL.createObjectURL(files[0]);
      setAvatarPreviewUrl(localObjUrl);
      setUploadingAvatar(true);
    } else {
      setUploadingGallery(true);
    }

    try {
      const prepared = await prepareImageFiles(kind === 'storefront' ? [files[0]] : files);
      const batches = chunkUploadBatches(prepared);
      let lastRes: {
        message: string;
        storefrontImage?: string;
        profile?: SellerProfile;
      } | null = null;

      for (const batch of batches) {
        lastRes = await apiRequest<{
          message: string;
          storefrontImage?: string;
          profile?: SellerProfile;
        }>('/api/seller/profile/photos', {
          method: 'POST',
          body: {
            kind,
            files: batch.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
          },
        });
      }

      if (lastRes?.profile) {
        syncFormFromProfile(lastRes.profile);
      } else if (kind === 'storefront' && lastRes?.storefrontImage && profile) {
        setProfile({ ...profile, storefrontImage: lastRes.storefrontImage });
      }
      const msg = lastRes?.message || 'Photo updated.';
      setPhotoFeedback({ ok: true, text: msg });
      notifyResult(msg);
      await Promise.all([loadAll(), refreshUser()]);
      if (kind === 'storefront') {
        setAvatarPreviewUrl(null);
      }
    } catch (err: any) {
      if (kind === 'storefront') {
        setAvatarPreviewUrl(null);
      }
      const msg = err?.message || 'Could not upload image. Please select a JPG, PNG, or WebP photo.';
      setPhotoFeedback({ ok: false, text: msg });
      notifyResult(msg, true);
    } finally {
      setUploadingAvatar(false);
      setUploadingGallery(false);
      e.target.value = '';
    }
  };

  const handleSetBusinessPhotoAsAvatar = async (photoUrl: string) => {
    setPhotoFeedback(null);
    setUploadingAvatar(true);
    try {
      const res = await apiRequest<{ message: string; profile?: SellerProfile }>(
        '/api/seller/profile/photos',
        {
          method: 'POST',
          body: { kind: 'storefront', existingUrl: photoUrl },
        }
      );
      if (res.profile) {
        syncFormFromProfile(res.profile);
      }
      setPhotoFeedback({ ok: true, text: res.message || 'Storefront profile picture updated.' });
      notifyResult(res.message || 'Storefront profile picture updated.');
      await Promise.all([loadAll(), refreshUser()]);
    } catch (err: any) {
      setPhotoFeedback({ ok: false, text: err?.message || 'Could not set storefront picture.' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDeleteBusinessPhoto = async (photoUrl: string) => {
    setPhotoFeedback(null);
    try {
      const res = await apiRequest<{ message: string; profile?: SellerProfile }>(
        '/api/seller/profile/photos',
        {
          method: 'DELETE',
          body: { url: photoUrl },
        }
      );
      if (res.profile) {
        syncFormFromProfile(res.profile);
      }
      setPhotoFeedback({ ok: true, text: res.message });
      await loadAll();
    } catch (err: any) {
      setPhotoFeedback({ ok: false, text: err?.message || 'Could not remove photo.' });
    }
  };

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentFeedback(null);
    setSavingPaymentSettings(true);
    try {
      const res = await apiRequest<{ message: string; profile?: SellerProfile }>(
        '/api/seller/payment-settings',
        {
          method: 'PUT',
          body: payForm,
        }
      );
      if (res.profile) {
        syncFormFromProfile(res.profile);
      }
      setPaymentFeedback({ ok: true, text: res.message });
      notifyResult(res.message);
      await Promise.all([loadAll(), refreshUser()]);
    } catch (err: any) {
      const msg = err?.message || 'Could not save payment settings.';
      setPaymentFeedback({ ok: false, text: msg });
      notifyResult(msg, true);
    } finally {
      setSavingPaymentSettings(false);
    }
  };

  const handleProductImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingProductImages(true);
    try {
      const remainingSlots = Math.max(0, 5 - prodForm.images.length);
      if (remainingSlots === 0) {
        notifyResult('Maximum of 5 product images reached. Remove one to upload another.', true);
        return;
      }
      const selected = Array.from(files).slice(0, remainingSlots);
      const prepared = await prepareImageFiles(selected);
      const batches = chunkUploadBatches(prepared);
      const uploadedUrls: string[] = [];

      for (const batch of batches) {
        const res = await apiRequest<{ images: string[] }>('/api/seller/products/upload-images', {
          method: 'POST',
          body: {
            files: batch.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
          },
        });
        if (Array.isArray(res.images)) {
          uploadedUrls.push(...res.images);
        }
      }

      if (uploadedUrls.length > 0) {
        setProdForm((p) => ({ ...p, images: [...p.images, ...uploadedUrls].slice(0, 5) }));
        notifyResult(
          `${uploadedUrls.length} product image${uploadedUrls.length === 1 ? '' : 's'} uploaded. Preview them or pick your cover photo below before publishing.`
        );
      }
    } catch (err: any) {
      notifyResult(err?.message || 'Could not upload product images.', true);
    } finally {
      setUploadingProductImages(false);
      e.target.value = '';
    }
  };

  const handleSetProductCover = (coverUrl: string) => {
    setProdForm((p) => {
      if (!p.images.includes(coverUrl)) return p;
      const reordered = [coverUrl, ...p.images.filter((img) => img !== coverUrl)];
      return { ...p, images: reordered };
    });
    notifyResult('Cover image updated. Save or Publish when ready.');
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const parseCommaList = (raw: string) =>
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const sizes = parseCommaList(prodForm.sizesText);
    const colors = parseCommaList(prodForm.colorsText);
    const variations = parseCommaList(prodForm.variationsText);
    const payload = {
      title: prodForm.title,
      categoryId: Number(prodForm.categoryId),
      price: Number(prodForm.price),
      stock: Number(prodForm.stock),
      description: prodForm.description,
      sizes,
      colors,
      variations,
      images: prodForm.images,
      published: prodForm.published,
    };

    setSavingProduct(true);
    try {
      if (editingProductId) {
        const res = await apiRequest<{ message: string }>(`/api/seller/products/${editingProductId}`, {
          method: 'PUT',
          body: payload,
        });
        notifyResult(res.message);
      } else {
        const res = await apiRequest<{ message: string }>('/api/seller/products', {
          method: 'POST',
          body: payload,
        });
        notifyResult(res.message);
      }
      setEditingProductId(null);
      setProdForm({
        title: '',
        categoryId: categories[0] ? String(categories[0].id) : '',
        price: '',
        stock: '',
        description: '',
        sizesText: '',
        colorsText: '',
        variationsText: '',
        images: [],
        published: true,
      });
      await loadAll();
    } catch (err: any) {
      notifyResult(err?.message || 'Could not save product.', true);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: number, orderStatus: string) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/seller/orders/${orderId}/status`, {
        method: 'PATCH',
        body: { orderStatus },
      });
      notifyResult(res.message);
      await loadAll();
    } catch (err: any) {
      notifyResult(err?.message || 'Could not update order status.', true);
    }
  };

  const openTrackingEditor = (ord: Order) => {
    if (trackingOrderId === ord.id) {
      setTrackingOrderId(null);
      return;
    }
    setTrackingOrderId(ord.id);
    setTrackingForm({
      trackingStage: ord.trackingStage || 'Confirmed & Preparing',
      trackingLocation: ord.trackingLocation || '',
      estimatedDelivery: ord.estimatedDelivery || '',
      courierContact: ord.courierContact || '',
      trackingNote: ord.trackingNote || '',
      orderStatus: ord.orderStatus,
    });
  };

  const handleSaveOrderTracking = async (e: React.FormEvent, orderId: number) => {
    e.preventDefault();
    setSavingTracking(true);
    try {
      const res = await apiRequest<{ message: string }>(`/api/seller/orders/${orderId}/tracking`, {
        method: 'POST',
        body: trackingForm,
      });
      notifyResult(res.message);
      setTrackingOrderId(null);
      await loadAll();
    } catch (err: any) {
      notifyResult(err?.message || 'Could not update tracking.', true);
    } finally {
      setSavingTracking(false);
    }
  };

  const handleSendBuyerReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBuyerConversation || !buyerReplyDraft.trim()) return;
    setSendingBuyerReply(true);
    try {
      await apiRequest(`/api/seller/messages/${activeBuyerConversation.buyerId}`, {
        method: 'POST',
        body: { message: buyerReplyDraft.trim() },
      });
      setBuyerReplyDraft('');
      await loadAll();
    } catch (err: any) {
      notifyResult(err?.message || 'Could not send reply.', true);
    } finally {
      setSendingBuyerReply(false);
    }
  };

  const handleVerifyPayment = async (orderId: number, decision: string, amountDue: number) => {
    setVerifyingOrderId(orderId);
    try {
      const res = await apiRequest<{ message: string }>(`/api/seller/payments/${orderId}/verify`, {
        method: 'POST',
        body: {
          decision,
          amountConfirmed: decision === 'confirm' ? amountDue : undefined,
          sellerNotes: verifyNotes[orderId] || '',
        },
      });
      notifyResult(res.message);
      await loadAll();
    } catch (err: any) {
      notifyResult(err?.message || 'Could not update payment status.', true);
    } finally {
      setVerifyingOrderId(null);
    }
  };

  const totalUnreadMessages = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const activeBuyerConversation =
    conversations.find((c) => c.buyerId === selectedBuyerId) || conversations[0] || null;
  const displayAvatar = avatarPreviewUrl || profile?.storefrontImage || '';

  const tabs: Array<{ id: SellerTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'profile', label: 'Profile & Verification', icon: <Store className="w-4 h-4" /> },
    { id: 'products', label: 'Products', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'promotions', label: 'Promotions', icon: <Tag className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders & Tracking', icon: <Package className="w-4 h-4" /> },
    {
      id: 'messages',
      label: totalUnreadMessages > 0 ? `Messages (${totalUnreadMessages})` : 'Messages',
      icon: <MessageCircle className="w-4 h-4" />,
    },
    { id: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'feedback', label: 'Reviews & Complaints', icon: <MessageSquare className="w-4 h-4" /> },
  ];

  const allCategoryChoices = Array.from(
    new Set([
      ...categories.map((c) => c.name),
      ...AIDOMART_ASSETS.categories.map((c) => c.name),
      ...appForm.categories,
    ])
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            {displayAvatar ? (
              <SafeAssetImage
                src={displayAvatar}
                alt={profile?.businessName || 'Storefront'}
                compact
                className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-[#0B1F3A] text-white flex items-center justify-center shrink-0">
                <Store className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0B1F3A]">
                  {profile?.businessName || 'Seller Dashboard'}
                </h1>
                {profile?.verifiedBadge && <VerifiedBadge size="md" />}
              </div>
              <p className="text-sm font-semibold text-[#F97316] mt-0.5">{greeting}</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-1.5">
            Account Status:{' '}
            <strong className={isApproved ? 'text-emerald-700' : 'text-[#F97316]'}>
              {profile?.applicationStatus || 'Loading...'}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {!isApproved && (
            <button
              type="button"
              onClick={() => setTab('profile')}
              className="px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold whitespace-nowrap"
            >
              Complete Verification &rarr;
            </button>
          )}
          {isApproved && (
            <button
              type="button"
              onClick={() => onNavigate(`/seller/${user.id}`)}
              className="px-4 py-2 rounded-lg border border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              View Public Storefront
            </button>
          )}
        </div>
      </div>

      {!isApproved && profile && (
        <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-xs text-slate-800 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="font-bold text-[#0B1F3A]">
              Verification Status: {profile.applicationStatus}
            </p>
            <button
              type="button"
              onClick={() => setTab('profile')}
              className="self-start sm:self-auto font-semibold text-[#F97316] hover:underline"
            >
              Open Profile &amp; Verification Form &rarr;
            </button>
          </div>
          <p>
            Only administrator-approved sellers can publish products to the Shop.{' '}
            {missingRequiredFields.length > 0
              ? `Please fill in these required fields to get approved: ${missingRequiredFields.join(', ')}.`
              : 'All required business fields are filled in! Submit or save your profile while awaiting admin approval.'}
          </p>
          {profile.adminFeedback && (
            <p className="pt-1 font-medium text-red-700">
              Administrator Note: {profile.adminFeedback}
            </p>
          )}
        </div>
      )}

      {statusMsg && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              tab === t.id
                ? 'bg-[#0B1F3A] text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && analytics && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs text-slate-500">Published Products</p>
              <p className="text-lg sm:text-2xl font-mono font-bold text-[#0B1F3A] tabular-nums mt-1">
                {analytics.publishedProducts} / {analytics.totalProducts}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs text-slate-500">Orders Received</p>
              <p className="text-lg sm:text-2xl font-mono font-bold text-[#0B1F3A] tabular-nums mt-1">
                {analytics.totalOrders}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs text-slate-500">Awaiting Payment Check</p>
              <p className="text-lg sm:text-2xl font-mono font-bold text-[#F97316] tabular-nums mt-1">
                {analytics.pendingPaymentVerifications}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
              <p className="text-[11px] sm:text-xs text-slate-500">Confirmed Sales</p>
              <p className="text-lg sm:text-2xl font-mono font-bold text-emerald-700 tabular-nums mt-1 break-words">
                GHS {Number(analytics.confirmedSalesTotal || 0).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-3">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">Order Summary</h2>
            {analytics.ordersByStatus?.length === 0 ? (
              <p className="text-sm text-slate-500">No orders received yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {analytics.ordersByStatus.map((row: any) => (
                  <div
                    key={row.status}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between text-xs"
                  >
                    <span className="text-slate-700">{row.status}</span>
                    <span className="font-mono font-bold tabular-nums text-[#0B1F3A]">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* UNIFIED BUSINESS PROFILE & ADMIN VERIFICATION */}
      {tab === 'profile' && (
        <div className="space-y-6">
          {/* Admin Approval Readiness Checklist */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                Admin Approval Readiness Checklist
              </h2>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                  missingRequiredFields.length === 0
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-orange-50 text-[#F97316] border border-orange-200'
                }`}
              >
                {requiredApprovalChecks.filter((c) => c.done).length} / {requiredApprovalChecks.length}{' '}
                Required Details Complete
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              {[...requiredApprovalChecks, ...recommendedChecks].map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    item.done
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-[#F97316] shrink-0" />
                  )}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Business Information & Verification Form */}
            <form
              onSubmit={handleSaveProfile}
              className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4"
            >
              <div>
                <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                  Business Profile &amp; Verification Information
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Keep your contact and business details accurate. Complete all required (*) fields to submit for Admin approval.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Legal Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={appForm.legalName}
                    onChange={(e) => setAppForm({ ...appForm, legalName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Business / Storefront Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={appForm.businessName}
                    onChange={(e) => setAppForm({ ...appForm, businessName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Telephone / WhatsApp Number *
                  </label>
                  <PhoneInput
                    required
                    value={appForm.phone}
                    onChange={(val) => setAppForm({ ...appForm, phone: val })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City / Region *
                  </label>
                  <input
                    type="text"
                    value={appForm.locationCity}
                    onChange={(e) => setAppForm({ ...appForm, locationCity: e.target.value })}
                    placeholder="e.g. Accra, Kumasi, Takoradi"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Physical Business Address *
                </label>
                <input
                  type="text"
                  value={appForm.physicalAddress}
                  onChange={(e) => setAppForm({ ...appForm, physicalAddress: e.target.value })}
                  placeholder="Street address, shop number, or landmark..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business Description *
                </label>
                <textarea
                  rows={3}
                  value={appForm.description}
                  onChange={(e) => setAppForm({ ...appForm, description: e.target.value })}
                  placeholder="Describe your products, brands, and customer guarantee..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Delivery &amp; Pickup Arrangements
                </label>
                <input
                  type="text"
                  value={appForm.deliveryPickupNotes}
                  onChange={(e) => setAppForm({ ...appForm, deliveryPickupNotes: e.target.value })}
                  placeholder="e.g. Same-day courier in Accra or storefront pickup"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Product Categories
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {allCategoryChoices.map((catName) => {
                    const selected = appForm.categories.includes(catName);
                    return (
                      <button
                        key={catName}
                        type="button"
                        onClick={() =>
                          setAppForm((f) => ({
                            ...f,
                            categories: selected
                              ? f.categories.filter((c) => c !== catName)
                              : [...f.categories, catName],
                          }))
                        }
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                          selected
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
                        if (trimmed && !appForm.categories.includes(trimmed)) {
                          setAppForm((f) => ({ ...f, categories: [...f.categories, trimmed] }));
                        }
                        setCustomCategoryInput('');
                      }
                    }}
                    placeholder="Add custom category..."
                    className="flex-1 min-w-0 px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = customCategoryInput.trim();
                      if (trimmed && !appForm.categories.includes(trimmed)) {
                        setAppForm((f) => ({ ...f, categories: [...f.categories, trimmed] }));
                      }
                      setCustomCategoryInput('');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-[#0B1F3A] shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {profileFeedback && (
                <div
                  className={`flex items-start gap-2 p-3 rounded-lg border text-xs font-semibold ${
                    profileFeedback.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {profileFeedback.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <span>{profileFeedback.text}</span>
                </div>
              )}

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={savingProfile || savingApp || savingDraft}
                  className="min-h-[42px] px-4 py-2.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] disabled:opacity-60 text-white text-xs font-semibold"
                >
                  {savingProfile ? 'Updating Profile...' : 'Update Business Profile'}
                </button>
                {!isApproved && (
                  <>
                    <button
                      type="button"
                      disabled={savingApp || savingProfile || savingDraft}
                      onClick={() => handleSaveApplication(true)}
                      className="min-h-[42px] px-4 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 text-white text-xs font-semibold"
                    >
                      {savingApp ? 'Submitting...' : 'Save & Submit for Admin Approval'}
                    </button>
                    <button
                      type="button"
                      disabled={savingDraft || savingProfile || savingApp}
                      onClick={() => handleSaveApplication(false)}
                      className="min-h-[42px] px-4 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-xs font-semibold text-slate-700"
                    >
                      {savingDraft ? 'Saving Draft...' : 'Save Draft'}
                    </button>
                  </>
                )}
              </div>
            </form>

            {/* Right Column: Profile Picture, Gallery Photos & Verification Docs */}
            <div className="lg:col-span-5 space-y-5">
              {/* Storefront Profile Picture & Gallery */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5">
                <div>
                  <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                    Storefront Profile Picture
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Updates your seller avatar across the marketplace, navigation bar, and admin panel immediately.
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  {displayAvatar ? (
                    <SafeAssetImage
                      src={displayAvatar}
                      alt={profile?.businessName || 'Storefront'}
                      compact
                      className="w-20 h-20 rounded-full object-cover border-2 border-[#0B1F3A]/15 shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                      <Store className="w-7 h-7" />
                    </div>
                  )}

                  <div className="space-y-1.5 min-w-0">
                    <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold cursor-pointer">
                      <Upload className="w-4 h-4 shrink-0" />
                      <span>
                        {uploadingAvatar
                          ? 'Uploading Picture...'
                          : displayAvatar
                            ? 'Change Profile Picture'
                            : 'Upload Profile Picture'}
                      </span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.gif"
                        disabled={uploadingAvatar}
                        onChange={(e) => handlePhotoUpload(e, 'storefront')}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[11px] text-slate-500">JPG, PNG, or WebP (up to 10 MB).</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#0B1F3A]">Business Showcase Photos</span>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingGallery ? 'Uploading...' : 'Add Photos'}</span>
                      <input
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp,.gif"
                        disabled={uploadingGallery}
                        onChange={(e) => handlePhotoUpload(e, 'business')}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {profile?.businessPhotos && profile.businessPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {profile.businessPhotos.map((p, idx) => {
                        const isCurrentAvatar = profile.storefrontImage === p;
                        return (
                          <div
                            key={p}
                            className="relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setImageLightbox({
                                  images: profile.businessPhotos || [],
                                  index: idx,
                                  context: 'business',
                                })
                              }
                              className="block w-full aspect-square overflow-hidden"
                              title="Click to preview photo"
                            >
                              <SafeAssetImage
                                src={p}
                                alt="Business"
                                className="w-full h-full object-cover hover:scale-105 transition-transform"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBusinessPhoto(p)}
                              aria-label="Remove business photo"
                              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-600/90 hover:bg-red-700 text-white flex items-center justify-center shadow-sm"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetBusinessPhotoAsAvatar(p)}
                              disabled={isCurrentAvatar || uploadingAvatar}
                              className={`w-full py-1 px-1.5 text-[10px] font-semibold transition-colors ${
                                isCurrentAvatar
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white hover:bg-orange-50 text-[#0B1F3A] border-t border-slate-200'
                              }`}
                            >
                              {isCurrentAvatar ? 'Profile Picture' : 'Set as Profile Pic'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No business showcase photos uploaded yet.</p>
                  )}
                </div>

                {photoFeedback && (
                  <p
                    className={`text-xs font-semibold p-2.5 rounded-lg border ${
                      photoFeedback.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    {photoFeedback.text}
                  </p>
                )}
              </div>

              {/* Private Verification Documents */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
                <div>
                  <h3 className="font-display text-base font-bold text-[#0B1F3A]">
                    Private Verification Documents
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Upload business registration, national ID, or supporting documents (JPG, PNG, WebP, PDF up to 10 MB). Stored privately for Admin inspection only.
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>{uploadingDocs ? 'Uploading Documents...' : 'Upload Verification Documents'}</span>
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    disabled={uploadingDocs}
                    onChange={handleDocUpload}
                    className="hidden"
                  />
                </label>

                {docFeedback && (
                  <p
                    className={`text-xs font-semibold p-2.5 rounded-lg border ${
                      docFeedback.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    {docFeedback.text}
                  </p>
                )}

                {documents.length > 0 && (
                  <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg text-xs">
                    {documents.map((doc) => (
                      <li key={doc.id} className="px-3 py-2 flex justify-between gap-2">
                        <span className="truncate font-medium text-slate-800">{doc.originalName}</span>
                        <span className="text-slate-400 shrink-0 tabular-nums">
                          {Math.round(doc.sizeBytes / 1024)} KB
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT MANAGEMENT */}
      {tab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div
            ref={productEditorRef}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              {editingProductId ? 'Edit Product' : 'Add New Product'}
            </h2>
            {!isApproved ? (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3.5 rounded-lg space-y-2">
                <p>
                  Your seller account must be Approved by an administrator before you can publish products.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('profile')}
                  className="font-semibold underline text-[#0B1F3A]"
                >
                  Complete Profile &amp; Verification &rarr;
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveProduct} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={prodForm.title}
                    onChange={(e) => setProdForm({ ...prodForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
                    <select
                      value={prodForm.categoryId}
                      onChange={(e) => setProdForm({ ...prodForm, categoryId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Price (GHS) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={prodForm.price}
                      onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={prodForm.stock}
                    onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                  />
                </div>

                {/* Separate Sizes Field */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-[#0B1F3A]">
                      Product Sizes (separate from colors)
                    </label>
                    <span className="text-[11px] text-slate-500">Tap presets or type custom</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['XS', 'S', 'M', 'L', 'XL', 'XXL', '38', '39', '40', '41', '42', '43', '44'].map((sz) => {
                      const active = prodForm.sizesText
                        .split(',')
                        .map((x) => x.trim().toLowerCase())
                        .includes(sz.toLowerCase());
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => togglePresetOption('sizesText', sz)}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                            active
                              ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                          }`}
                        >
                          {sz}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={prodForm.sizesText}
                    onChange={(e) => setProdForm({ ...prodForm, sizesText: e.target.value })}
                    placeholder="e.g. S, M, L, XL or 40, 41, 42"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                {/* Separate Colors Field */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-[#0B1F3A]">
                      Product Colors (separate from sizes)
                    </label>
                    <span className="text-[11px] text-slate-500">Tap presets or type custom</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { name: 'Black', dot: 'bg-slate-900' },
                      { name: 'White', dot: 'bg-white border border-slate-300' },
                      { name: 'Navy', dot: 'bg-blue-950' },
                      { name: 'Blue', dot: 'bg-blue-600' },
                      { name: 'Red', dot: 'bg-red-600' },
                      { name: 'Green', dot: 'bg-emerald-600' },
                      { name: 'Brown', dot: 'bg-amber-800' },
                      { name: 'Beige', dot: 'bg-amber-100 border border-amber-300' },
                      { name: 'Grey', dot: 'bg-slate-400' },
                      { name: 'Gold', dot: 'bg-yellow-500' },
                      { name: 'Pink', dot: 'bg-pink-500' },
                    ].map((clr) => {
                      const active = prodForm.colorsText
                        .split(',')
                        .map((x) => x.trim().toLowerCase())
                        .includes(clr.name.toLowerCase());
                      return (
                        <button
                          key={clr.name}
                          type="button"
                          onClick={() => togglePresetOption('colorsText', clr.name)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                            active
                              ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${clr.dot}`} />
                          <span>{clr.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={prodForm.colorsText}
                    onChange={(e) => setProdForm({ ...prodForm, colorsText: e.target.value })}
                    placeholder="e.g. Black, White, Navy Blue"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                {/* Optional Other Variations (e.g. Capacity, Material, Style) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Other Options / Variations (optional, e.g. Storage or Edition)
                  </label>
                  <input
                    type="text"
                    value={prodForm.variationsText}
                    onChange={(e) => setProdForm({ ...prodForm, variationsText: e.target.value })}
                    placeholder="e.g. 128GB, 256GB or Cotton, Silk (leave blank if only Sizes/Colors)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
                  <textarea
                    rows={3}
                    required
                    value={prodForm.description}
                    onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Product Images ({prodForm.images.length}/5)
                    </label>
                    {prodForm.images.length > 0 && (
                      <span className="text-[11px] text-slate-500">
                        Click a photo to preview or pick your Cover image
                      </span>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                    <Plus className="w-3.5 h-3.5" />
                    <span>{uploadingProductImages ? 'Uploading...' : 'Upload Images'}</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                      disabled={uploadingProductImages || prodForm.images.length >= 5}
                      onChange={handleProductImages}
                      className="hidden"
                    />
                  </label>
                  {prodForm.images.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
                      {prodForm.images.map((img, idx) => {
                        const isCover = idx === 0;
                        return (
                          <div
                            key={img}
                            className={`relative rounded-xl overflow-hidden border-2 bg-slate-50 ${
                              isCover ? 'border-[#F97316]' : 'border-slate-200'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setImageLightbox({
                                  images: prodForm.images,
                                  index: idx,
                                  context: 'product',
                                })
                              }
                              className="block w-full aspect-square overflow-hidden text-left"
                              title="Click to inspect full image"
                            >
                              <SafeAssetImage
                                src={img}
                                alt={`Product preview ${idx + 1}`}
                                className="w-full h-full object-cover hover:scale-105 transition-transform"
                              />
                            </button>

                            {isCover && (
                              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F97316] text-white text-[10px] font-bold shadow-sm">
                                <Star className="w-2.5 h-2.5 fill-current" />
                                <span>Cover</span>
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setProdForm((p) => ({
                                  ...p,
                                  images: p.images.filter((x) => x !== img),
                                }))
                              }
                              aria-label="Remove image"
                              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-600/90 hover:bg-red-700 text-white flex items-center justify-center shadow-sm"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>

                            <div className="p-1.5 bg-white border-t border-slate-200 flex items-center justify-between gap-1">
                              {isCover ? (
                                <span className="text-[10px] font-bold text-[#F97316] truncate">
                                  Main Cover Photo
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSetProductCover(img)}
                                  className="text-[10px] font-semibold text-[#0B1F3A] hover:text-[#F97316] truncate"
                                >
                                  Set as Cover
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setImageLightbox({
                                    images: prodForm.images,
                                    index: idx,
                                    context: 'product',
                                  })
                                }
                                aria-label="View full image"
                                className="text-slate-500 hover:text-[#0B1F3A] shrink-0"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={prodForm.published}
                    onChange={(e) => setProdForm({ ...prodForm, published: e.target.checked })}
                  />
                  <span>Publish immediately in Shop</span>
                </label>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={savingProduct}
                    className="px-4 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 text-white text-xs font-semibold"
                  >
                    {savingProduct
                      ? 'Saving...'
                      : editingProductId
                      ? 'Update Product'
                      : prodForm.published
                        ? 'Publish Product'
                        : 'Save Draft'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftPreviewImageIdx(0);
                      setShowDraftPreview(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-[#0B1F3A] text-[#0B1F3A] hover:bg-slate-50 text-xs font-semibold"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Before Publishing</span>
                  </button>
                  {editingProductId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProductId(null);
                        setProdForm({
                          title: '',
                          categoryId: categories[0] ? String(categories[0].id) : '',
                          price: '',
                          stock: '',
                          description: '',
                          sizesText: '',
                          colorsText: '',
                          variationsText: '',
                          images: [],
                          published: true,
                        });
                      }}
                      className="px-3 py-2 text-xs text-slate-600"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                Your Product Listings ({products.length})
              </h2>
            </div>
            {products.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                You have not added any products yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setViewingImageIdx(0);
                        setViewingProduct(p);
                      }}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left group"
                    >
                      <SafeAssetImage
                        src={p.images[0] || ''}
                        alt={p.title}
                        className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0 group-hover:border-[#F97316] transition-colors"
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-[#0B1F3A] group-hover:text-[#F97316] transition-colors truncate">
                          {p.title}
                        </h3>
                        <p className="text-xs text-slate-500 tabular-nums">
                          {p.categoryName} · GHS {p.price.toFixed(2)} · Stock: {p.stock} ·{' '}
                          <span className={p.published ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                            {p.published ? 'Published' : 'Unpublished'}
                          </span>
                        </p>
                        <p className="text-[11px] text-[#F97316] font-medium mt-0.5">
                          Click to preview images &amp; make changes
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditProduct(p)}
                        className="px-2.5 py-1.5 rounded border border-slate-300 hover:border-[#0B1F3A] text-xs font-semibold text-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyProductId === p.id}
                        onClick={async () => {
                          setBusyProductId(p.id);
                          try {
                            const res = await apiRequest<{ message: string }>(`/api/seller/products/${p.id}`, {
                              method: 'PUT',
                              body: { published: !p.published },
                            });
                            notifyResult(res.message || `Updated ${p.title}.`);
                            await loadAll();
                          } catch (err: any) {
                            notifyResult(err?.message || 'Could not update product visibility.', true);
                          } finally {
                            setBusyProductId(null);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      >
                        {busyProductId === p.id ? 'Updating...' : p.published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        type="button"
                        disabled={busyProductId === p.id}
                        onClick={async () => {
                          setBusyProductId(p.id);
                          try {
                            const res = await apiRequest<{ message: string }>(`/api/seller/products/${p.id}`, {
                              method: 'DELETE',
                            });
                            if (editingProductId === p.id) {
                              setEditingProductId(null);
                            }
                            if (viewingProduct?.id === p.id) {
                              setViewingProduct(null);
                            }
                            notifyResult(res.message || `Deleted ${p.title}.`);
                            await loadAll();
                          } catch (err: any) {
                            notifyResult(err?.message || 'Could not delete product.', true);
                          } finally {
                            setBusyProductId(null);
                          }
                        }}
                        aria-label="Delete product"
                        className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ORDERS & BUYER TRACKING */}
      {tab === 'orders' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Seller Orders &amp; Tracking ({orders.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Update order workflow or post live tracking milestones so buyers can track delivery progress.
            </p>
          </div>
          {orders.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No orders received yet.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {orders.map((ord) => {
                const buyerWa = buildWhatsAppUrl(
                  ord.buyerPhone,
                  `Hello ${ord.buyerName}, update on your AIDOOMART order ${ord.orderReference}.`
                );
                return (
                  <div key={ord.id} className="p-4 sm:p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="font-mono text-sm font-bold text-[#0B1F3A]">
                          {ord.orderReference}
                        </span>
                        <span className="text-xs text-slate-500 block sm:inline sm:ml-3">
                          Buyer: {ord.buyerName} ({ord.buyerPhone}) · {ord.fulfillmentMethod}
                          {ord.deliveryAddress ? ` — ${ord.deliveryAddress}` : ''}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-bold text-[#F97316] tabular-nums">
                        GHS {ord.totalAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 space-y-1">
                      {ord.items.map((it) => (
                        <div key={it.id}>
                          • {it.productTitle} {it.selectedVariation ? `(${it.selectedVariation})` : ''} &times;{' '}
                          {it.quantity}
                        </div>
                      ))}
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-[#0B1F3A] flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-[#F97316]" />
                          <span>Tracking Stage: {ord.trackingStage || 'Order Placed'}</span>
                        </p>
                        {(ord.trackingLocation || ord.estimatedDelivery || ord.courierContact) && (
                          <p className="text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                            {ord.trackingLocation && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-[#F97316]" />
                                {ord.trackingLocation}
                              </span>
                            )}
                            {ord.estimatedDelivery && <span>ETA: {ord.estimatedDelivery}</span>}
                            {ord.courierContact && <span>Courier: {ord.courierContact}</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openTrackingEditor(ord)}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white text-xs font-semibold"
                        >
                          {trackingOrderId === ord.id ? 'Close Tracking Form' : 'Update Tracking'}
                        </button>
                        {buyerWa && (
                          <a
                            href={buyerWa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold"
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {trackingOrderId === ord.id && (
                      <form
                        onSubmit={(e) => handleSaveOrderTracking(e, ord.id)}
                        className="p-4 rounded-xl bg-orange-50/50 border border-orange-200 space-y-3 text-xs"
                      >
                        <h3 className="font-display text-sm font-bold text-[#0B1F3A]">
                          Post Tracking Update for {ord.orderReference}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Tracking Milestone Stage *
                            </label>
                            <select
                              value={trackingForm.trackingStage}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, trackingStage: e.target.value })
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold"
                            >
                              {TRACKING_STAGE_PRESETS.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Update Order Status (Optional)
                            </label>
                            <select
                              value={trackingForm.orderStatus}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, orderStatus: e.target.value })
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                            >
                              <option value="Pending Seller Confirmation">Pending Seller Confirmation</option>
                              <option value="Confirmed">Confirmed</option>
                              <option value="Processing">Processing</option>
                              <option value="Ready for Pickup / Dispatch">Ready for Pickup / Dispatch</option>
                              <option value="Completed">Completed</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Current Location / Checkpoint
                            </label>
                            <input
                              type="text"
                              value={trackingForm.trackingLocation}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, trackingLocation: e.target.value })
                              }
                              placeholder="e.g. Circle Dispatch Hub, Accra"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Estimated Delivery / Pickup Time
                            </label>
                            <input
                              type="text"
                              value={trackingForm.estimatedDelivery}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, estimatedDelivery: e.target.value })
                              }
                              placeholder="e.g. Today 4:00 PM"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Courier / Rider Contact
                            </label>
                            <input
                              type="text"
                              value={trackingForm.courierContact}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, courierContact: e.target.value })
                              }
                              placeholder="e.g. Kwame (0240000000)"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Progress Note for Buyer
                            </label>
                            <input
                              type="text"
                              value={trackingForm.trackingNote}
                              onChange={(e) =>
                                setTrackingForm({ ...trackingForm, trackingNote: e.target.value })
                              }
                              placeholder="Parcel handed over to dispatch rider..."
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs"
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={savingTracking}
                            className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold disabled:opacity-60"
                          >
                            {savingTracking ? 'Saving...' : 'Save & Notify Buyer'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTrackingOrderId(null)}
                            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <span className="text-xs text-slate-600">
                        Payment: <strong>{ord.payment?.status}</strong>
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs text-slate-600">Order Workflow:</label>
                        <select
                          value={ord.orderStatus}
                          onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value)}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                        >
                          <option value="Pending Seller Confirmation">Pending Seller Confirmation</option>
                          <option value="Confirmed">Confirmed</option>
                          <option value="Processing">Processing</option>
                          <option value="Ready for Pickup / Dispatch">Ready for Pickup / Dispatch</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* BUYER MESSAGES */}
      {tab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50">
              <h2 className="font-display text-sm font-bold text-[#0B1F3A]">
                Buyer Inquiries ({conversations.length})
              </h2>
            </div>
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No messages from buyers yet. When buyers contact you from your storefront or product pages, conversations appear here.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                {conversations.map((conv) => (
                  <button
                    key={conv.buyerId}
                    type="button"
                    onClick={async () => {
                      setSelectedBuyerId(conv.buyerId);
                      if (conv.unreadCount > 0) {
                        await apiRequest(`/api/seller/messages/${conv.buyerId}/read`, {
                          method: 'POST',
                        }).catch(() => {});
                        await loadAll();
                      }
                    }}
                    className={`w-full text-left p-3.5 hover:bg-slate-50 transition-colors space-y-1 ${
                      activeBuyerConversation?.buyerId === conv.buyerId ? 'bg-orange-50/70' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0B1F3A]">{conv.buyerName}</span>
                      {conv.unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#F97316] text-white text-[10px] font-bold tabular-nums">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{conv.lastMessage}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            {activeBuyerConversation ? (
              <>
                <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm font-bold text-[#0B1F3A]">
                      Chat with {activeBuyerConversation.buyerName}
                    </h3>
                    {activeBuyerConversation.buyerPhone && (
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {activeBuyerConversation.buyerPhone}
                      </p>
                    )}
                  </div>
                  {buildWhatsAppUrl(
                    activeBuyerConversation.buyerPhone,
                    `Hello ${activeBuyerConversation.buyerName}, replying from ${profile?.businessName || 'AIDOOMART'}.`
                  ) && (
                    <a
                      href={
                        buildWhatsAppUrl(
                          activeBuyerConversation.buyerPhone,
                          `Hello ${activeBuyerConversation.buyerName}, replying from ${profile?.businessName || 'AIDOOMART'}.`
                        )!
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800"
                    >
                      <WhatsAppIcon className="w-4 h-4 shrink-0" />
                      <span>WhatsApp Buyer</span>
                    </a>
                  )}
                </div>

                <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto bg-slate-50/50">
                  {activeBuyerConversation.messages.map((m) => {
                    const isMine = m.senderId === user.id;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-3.5 py-2.5 text-xs space-y-1 ${
                            isMine
                              ? 'bg-[#0B1F3A] text-white'
                              : 'bg-white border border-slate-200 text-slate-800'
                          }`}
                        >
                          {m.productTitle && (
                            <p
                              className={`text-[10px] font-semibold ${
                                isMine ? 'text-orange-300' : 'text-[#F97316]'
                              }`}
                            >
                              Product: {m.productTitle}
                            </p>
                          )}
                          {m.orderReference && (
                            <p
                              className={`text-[10px] font-mono ${
                                isMine ? 'text-orange-300' : 'text-[#F97316]'
                              }`}
                            >
                              Order: {m.orderReference}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap">{m.message}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 px-1 tabular-nums">
                          {new Date(m.createdAt).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <form
                  onSubmit={handleSendBuyerReply}
                  className="p-3 sm:p-4 border-t border-slate-200 bg-white flex gap-2"
                >
                  <input
                    type="text"
                    required
                    value={buyerReplyDraft}
                    onChange={(e) => setBuyerReplyDraft(e.target.value)}
                    placeholder={`Reply to ${activeBuyerConversation.buyerName}...`}
                    className="flex-1 min-w-0 min-h-[42px] px-3.5 py-2 border border-slate-300 rounded-lg text-base sm:text-sm"
                  />
                  <button
                    type="submit"
                    disabled={sendingBuyerReply}
                    className="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold disabled:opacity-60 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingBuyerReply ? 'Sending...' : 'Reply'}</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="p-10 text-center text-xs text-slate-500">
                Select a buyer conversation on the left to read and reply.
              </div>
            )}
          </div>
        </div>
      )}

      {/* UNIFIED PAYMENTS: RECEIVING SETTINGS + ORDER VERIFICATION */}
      {tab === 'payments' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSavePaymentSettings}
            className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5"
          >
            <div>
              <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                Payment Receiving Settings
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Configure your Mobile Money and/or Bank Transfer accounts. Only enabled methods are displayed to buyers during checkout.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                <label className="flex items-center gap-2 font-display text-sm font-bold text-[#0B1F3A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payForm.momoEnabled}
                    onChange={(e) => setPayForm({ ...payForm, momoEnabled: e.target.checked })}
                  />
                  <span>Enable Mobile Money</span>
                </label>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Provider</label>
                  <select
                    value={payForm.momoProvider}
                    onChange={(e) => setPayForm({ ...payForm, momoProvider: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="MTN Mobile Money">MTN Mobile Money</option>
                    <option value="Telecel Cash">Telecel Cash</option>
                    <option value="AT Money">AT Money</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registered Account Holder Name
                  </label>
                  <input
                    type="text"
                    value={payForm.momoAccountName}
                    onChange={(e) => setPayForm({ ...payForm, momoAccountName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile Money Number
                  </label>
                  <input
                    type="tel"
                    value={payForm.momoNumber}
                    onChange={(e) => setPayForm({ ...payForm, momoNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Instructions</label>
                  <input
                    type="text"
                    value={payForm.momoInstructions}
                    onChange={(e) => setPayForm({ ...payForm, momoInstructions: e.target.value })}
                    placeholder="Include your Order Reference in the MoMo reference field"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                <label className="flex items-center gap-2 font-display text-sm font-bold text-[#0B1F3A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payForm.bankEnabled}
                    onChange={(e) => setPayForm({ ...payForm, bankEnabled: e.target.checked })}
                  />
                  <span>Enable Bank Transfer</span>
                </label>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={payForm.bankName}
                    onChange={(e) => setPayForm({ ...payForm, bankName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Account Holder Name
                  </label>
                  <input
                    type="text"
                    value={payForm.bankAccountName}
                    onChange={(e) => setPayForm({ ...payForm, bankAccountName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
                    <input
                      type="text"
                      value={payForm.bankAccountNumber}
                      onChange={(e) => setPayForm({ ...payForm, bankAccountNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Branch</label>
                    <input
                      type="text"
                      value={payForm.bankBranch}
                      onChange={(e) => setPayForm({ ...payForm, bankBranch: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Instructions</label>
                  <input
                    type="text"
                    value={payForm.bankInstructions}
                    onChange={(e) => setPayForm({ ...payForm, bankInstructions: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>

            {paymentFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs font-semibold ${
                  paymentFeedback.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {paymentFeedback.text}
              </div>
            )}

            <button
              type="submit"
              disabled={savingPaymentSettings}
              className="min-h-[42px] px-5 py-2.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] disabled:opacity-60 text-white text-xs font-semibold"
            >
              {savingPaymentSettings ? 'Saving Payment Settings...' : 'Save Payment Receiving Details'}
            </button>
          </form>

          {/* Order Payment Verification */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                Customer Payment Verification ({orders.length})
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Always verify incoming transfers in your Mobile Money wallet or bank statement before confirming payment.
              </p>
            </div>
            {orders.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No payment records yet.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {orders.map((ord) => {
                  const isBusy = verifyingOrderId === ord.id;
                  return (
                    <div key={ord.id} className="p-4 sm:p-5 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono text-sm font-bold text-[#0B1F3A]">
                            {ord.orderReference}
                          </span>
                          <span className="text-slate-500 ml-2">· Buyer: {ord.buyerName}</span>
                        </div>
                        <span className="font-semibold text-[#F97316]">{ord.payment?.status}</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <div>
                          <span className="text-slate-500 block">Amount Due</span>
                          <strong className="font-mono tabular-nums">GHS {ord.totalAmount.toFixed(2)}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Reported Paid</span>
                          <strong className="font-mono tabular-nums">
                            {ord.payment?.amountReported !== null && ord.payment?.amountReported !== undefined
                              ? `GHS ${ord.payment.amountReported.toFixed(2)}`
                              : '—'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Method</span>
                          <strong>{ord.payment?.paymentMethod || '—'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Tx Ref</span>
                          <strong className="font-mono">{ord.payment?.transactionReference || '—'}</strong>
                        </div>
                      </div>

                      {ord.payment?.buyerNotes && (
                        <div
                          className={`rounded-lg px-3 py-2 text-xs border ${
                            ord.payment.status === 'Refund Pending'
                              ? 'bg-amber-50 border-amber-300 text-amber-950'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <strong>Buyer Note / Refund Info:</strong> {ord.payment.buyerNotes}
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={verifyNotes[ord.id] || ''}
                          onChange={(e) => setVerifyNotes({ ...verifyNotes, [ord.id]: e.target.value })}
                          placeholder="Verification or refund notes (optional)..."
                          className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleVerifyPayment(ord.id, 'confirm', ord.totalAmount)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold"
                          >
                            {isBusy ? 'Updating...' : 'Confirm Payment Received'}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleVerifyPayment(ord.id, 'not_received', ord.totalAmount)}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-red-300 text-red-700 font-semibold disabled:opacity-60"
                          >
                            Not Received
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleVerifyPayment(ord.id, 'amount_mismatch', ord.totalAmount)}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-800 font-semibold disabled:opacity-60"
                          >
                            Amount Mismatch
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleVerifyPayment(ord.id, 'under_review', ord.totalAmount)}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold disabled:opacity-60"
                          >
                            Flag / Review
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleVerifyPayment(ord.id, 'refund_pending', ord.totalAmount)}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-orange-300 bg-orange-50 text-orange-800 font-semibold disabled:opacity-60"
                          >
                            Refund Pending
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleVerifyPayment(ord.id, 'refunded', ord.totalAmount)}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#0B1F3A] hover:bg-[#122E53] text-white font-semibold disabled:opacity-60"
                          >
                            Mark Refunded
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PROMOTIONS */}
      {tab === 'promotions' && <PromoManagerPanel sellerProducts={products} />}

      {/* COMPLAINTS & REVIEWS */}
      {tab === 'feedback' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Buyer Complaints ({complaints.length})
            </h2>
            {complaints.length === 0 ? (
              <p className="text-sm text-slate-500">No complaints against your store.</p>
            ) : (
              complaints.map((c) => {
                const key = `c_${c.id}`;
                return (
                  <div key={c.id} className="p-4 border border-slate-200 rounded-lg text-xs space-y-2">
                    <div className="flex justify-between gap-2">
                      <strong className="text-[#0B1F3A]">{c.subject}</strong>
                      <span className="text-[#F97316] font-semibold shrink-0">{c.status}</span>
                    </div>
                    <p className="text-slate-700">{c.message}</p>
                    {c.sellerResponse ? (
                      <p className="bg-slate-50 p-2 rounded">
                        <strong>Your Response:</strong> {c.sellerResponse}
                      </p>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={replyTexts[key] || ''}
                          onChange={(e) => setReplyTexts({ ...replyTexts, [key]: e.target.value })}
                          placeholder="Write response..."
                          className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-300 rounded"
                        />
                        <button
                          type="button"
                          disabled={replyingKey === key}
                          onClick={async () => {
                            const text = (replyTexts[key] || '').trim();
                            if (!text) {
                              notifyResult('Please write a response before sending.', true);
                              return;
                            }
                            setReplyingKey(key);
                            try {
                              const res = await apiRequest<{ message: string }>(
                                `/api/seller/complaints/${c.id}/respond`,
                                {
                                  method: 'POST',
                                  body: { response: text },
                                }
                              );
                              notifyResult(res.message || 'Response saved.');
                              await loadAll();
                            } catch (err: any) {
                              notifyResult(err?.message || 'Could not send response.', true);
                            } finally {
                              setReplyingKey(null);
                            }
                          }}
                          className="px-3 py-1.5 rounded bg-[#0B1F3A] disabled:opacity-60 text-white font-semibold shrink-0"
                        >
                          {replyingKey === key ? 'Sending...' : 'Reply'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              Product Reviews ({reviews.length})
            </h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-slate-500">No product reviews yet.</p>
            ) : (
              reviews.map((r) => {
                const key = `r_${r.id}`;
                return (
                  <div key={r.id} className="p-4 border border-slate-200 rounded-lg text-xs space-y-2">
                    <div className="flex justify-between gap-2">
                      <strong className="text-[#0B1F3A]">{r.productTitle}</strong>
                      <span className="text-[#F97316] font-bold shrink-0">{r.rating}/5</span>
                    </div>
                    <p className="text-slate-700">{r.comment}</p>
                    {r.sellerResponse ? (
                      <p className="bg-slate-50 p-2 rounded">
                        <strong>Your Reply:</strong> {r.sellerResponse}
                      </p>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={replyTexts[key] || ''}
                          onChange={(e) => setReplyTexts({ ...replyTexts, [key]: e.target.value })}
                          placeholder="Reply to customer..."
                          className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-300 rounded"
                        />
                        <button
                          type="button"
                          disabled={replyingKey === key}
                          onClick={async () => {
                            const text = (replyTexts[key] || '').trim();
                            if (!text) {
                              notifyResult('Please write a reply before publishing.', true);
                              return;
                            }
                            setReplyingKey(key);
                            try {
                              const res = await apiRequest<{ message: string }>(
                                `/api/seller/reviews/${r.id}/respond`,
                                {
                                  method: 'POST',
                                  body: { response: text },
                                }
                              );
                              notifyResult(res.message || 'Reply published.');
                              await loadAll();
                            } catch (err: any) {
                              notifyResult(err?.message || 'Could not publish reply.', true);
                            } finally {
                              setReplyingKey(null);
                            }
                          }}
                          className="px-3 py-1.5 rounded bg-[#0B1F3A] disabled:opacity-60 text-white font-semibold shrink-0"
                        >
                          {replyingKey === key ? 'Sending...' : 'Reply'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Full-Size Uploaded Image Preview & Cover Selection Modal */}
      {imageLightbox && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6"
          onClick={() => setImageLightbox(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-[#0B1F3A] text-white flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">
                  Image Preview ({imageLightbox.index + 1} of {imageLightbox.images.length})
                </p>
                {imageLightbox.context === 'product' && imageLightbox.index === 0 && (
                  <p className="text-[11px] text-orange-300 font-semibold">
                    Current Main Cover Photo
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setImageLightbox(null)}
                aria-label="Close preview"
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative bg-slate-100 flex items-center justify-center h-[52vh] sm:h-[420px]">
              <SafeAssetImage
                src={imageLightbox.images[imageLightbox.index] || ''}
                alt="Uploaded image preview"
                className="max-h-full max-w-full object-contain"
              />
              {imageLightbox.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setImageLightbox((prev) =>
                        prev
                          ? {
                              ...prev,
                              index: (prev.index - 1 + prev.images.length) % prev.images.length,
                            }
                          : null
                      )
                    }
                    aria-label="Previous image"
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-950/65 text-white flex items-center justify-center hover:bg-slate-950"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setImageLightbox((prev) =>
                        prev ? { ...prev, index: (prev.index + 1) % prev.images.length } : null
                      )
                    }
                    aria-label="Next image"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-950/65 text-white flex items-center justify-center hover:bg-slate-950"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              {imageLightbox.context === 'product' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={imageLightbox.index === 0}
                    onClick={() => {
                      const chosenUrl = imageLightbox.images[imageLightbox.index];
                      handleSetProductCover(chosenUrl);
                      const reordered = [
                        chosenUrl,
                        ...imageLightbox.images.filter((u) => u !== chosenUrl),
                      ];
                      setImageLightbox({ images: reordered, index: 0, context: 'product' });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] disabled:bg-emerald-600 text-white text-xs font-semibold"
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>
                      {imageLightbox.index === 0 ? 'Selected as Cover Photo' : 'Set as Cover Photo'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetUrl = imageLightbox.images[imageLightbox.index];
                      const nextImgs = imageLightbox.images.filter((u) => u !== targetUrl);
                      setProdForm((p) => ({ ...p, images: nextImgs }));
                      if (nextImgs.length === 0) {
                        setImageLightbox(null);
                      } else {
                        setImageLightbox({
                          images: nextImgs,
                          index: Math.min(imageLightbox.index, nextImgs.length - 1),
                          context: 'product',
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const chosenUrl = imageLightbox.images[imageLightbox.index];
                    handleSetBusinessPhotoAsAvatar(chosenUrl);
                    setImageLightbox(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Set as Storefront Profile Picture</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setImageLightbox(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Publish Product Listing Preview Modal */}
      {showDraftPreview && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setShowDraftPreview(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-[#0B1F3A] text-white flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold">Pre-Publish Product Preview</h3>
                <p className="text-[11px] text-slate-300">
                  Review how buyers will see your Cover Image and product listing before publishing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDraftPreview(false)}
                aria-label="Close preview"
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
                <div className="space-y-2.5">
                  <div className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                    <SafeAssetImage
                      src={prodForm.images[draftPreviewImageIdx] || ''}
                      alt={prodForm.title || 'Product preview'}
                      fallbackTitle={prodForm.title || 'Your Product'}
                      fallbackSubtitle="Cover Photo Preview"
                      className="w-full h-full object-cover"
                    />
                    {draftPreviewImageIdx === 0 && prodForm.images.length > 0 && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#F97316] text-white text-[10px] font-bold">
                        Cover Photo
                      </span>
                    )}
                  </div>

                  {prodForm.images.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {prodForm.images.map((img, i) => (
                        <div key={img} className="space-y-1">
                          <button
                            type="button"
                            onClick={() => setDraftPreviewImageIdx(i)}
                            className={`w-14 h-14 rounded-lg overflow-hidden border-2 block ${
                              i === draftPreviewImageIdx ? 'border-[#F97316]' : 'border-slate-200'
                            }`}
                          >
                            <SafeAssetImage
                              src={img}
                              alt={`Thumb ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                          {i !== 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                handleSetProductCover(img);
                                setDraftPreviewImageIdx(0);
                              }}
                              className="block w-full text-[10px] font-semibold text-[#F97316] hover:underline"
                            >
                              Make Cover
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="text-xs text-slate-500">
                    {categories.find((c) => String(c.id) === prodForm.categoryId)?.name || 'Category'} ·{' '}
                    {prodForm.stock ? `${prodForm.stock} in stock` : 'Stock not set'}
                  </div>
                  <h4 className="font-display text-lg font-bold text-[#0B1F3A] break-words">
                    {prodForm.title || 'Untitled Product'}
                  </h4>
                  <p className="text-xl font-mono font-bold text-[#0B1F3A] tabular-nums">
                    GHS {Number(prodForm.price || 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                    {prodForm.description || 'No description entered yet.'}
                  </p>
                  {prodForm.sizesText.trim() && (
                    <div className="space-y-1 pt-1">
                      <span className="block text-[11px] font-semibold text-slate-700">Available Sizes:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {prodForm.sizesText
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean)
                          .map((v) => (
                            <span
                              key={v}
                              className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-semibold text-[#0B1F3A]"
                            >
                              {v}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {prodForm.colorsText.trim() && (
                    <div className="space-y-1 pt-1">
                      <span className="block text-[11px] font-semibold text-slate-700">Available Colors:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {prodForm.colorsText
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean)
                          .map((v) => (
                            <span
                              key={v}
                              className="px-2 py-0.5 rounded bg-orange-50 border border-orange-200 text-[11px] font-semibold text-slate-800"
                            >
                              {v}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {prodForm.variationsText.trim() && (
                    <div className="space-y-1 pt-1">
                      <span className="block text-[11px] font-semibold text-slate-700">Other Options:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {prodForm.variationsText
                          .split(',')
                          .map((v) => v.trim())
                          .filter(Boolean)
                          .map((v) => (
                            <span
                              key={v}
                              className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700"
                            >
                              {v}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDraftPreview(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={savingProduct}
                onClick={async () => {
                  setShowDraftPreview(false);
                  await handleSaveProduct({ preventDefault: () => {} } as React.FormEvent);
                }}
                className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold"
              >
                {editingProductId
                  ? 'Save Changes Now'
                  : prodForm.published
                    ? 'Publish Now'
                    : 'Save Draft Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click-to-Inspect & Manage Published / Draft Product Modal */}
      {viewingProduct && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setViewingProduct(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-[#0B1F3A] text-white flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold truncate">{viewingProduct.title}</h3>
                <p className="text-[11px] text-slate-300">
                  {viewingProduct.published ? 'Published in Shop' : 'Unpublished Draft'} ·{' '}
                  {viewingProduct.categoryName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingProduct(null)}
                aria-label="Close product details"
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
                <div className="space-y-2.5">
                  <div className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                    <SafeAssetImage
                      src={viewingProduct.images[viewingImageIdx] || ''}
                      alt={viewingProduct.title}
                      fallbackTitle={viewingProduct.title}
                      fallbackSubtitle={viewingProduct.categoryName}
                      className="w-full h-full object-cover"
                    />
                    {viewingImageIdx === 0 && viewingProduct.images.length > 0 && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#F97316] text-white text-[10px] font-bold">
                        Cover Photo
                      </span>
                    )}
                  </div>

                  {viewingProduct.images.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {viewingProduct.images.map((img, i) => (
                        <button
                          key={img}
                          type="button"
                          onClick={() => setViewingImageIdx(i)}
                          className={`w-12 h-12 rounded-lg overflow-hidden border-2 ${
                            i === viewingImageIdx ? 'border-[#F97316]' : 'border-slate-200'
                          }`}
                        >
                          <SafeAssetImage
                            src={img}
                            alt={`${viewingProduct.title} ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-xl font-mono font-bold text-[#0B1F3A] tabular-nums">
                    GHS {viewingProduct.price.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-600">
                    <strong>Stock:</strong> {viewingProduct.stock} available
                  </p>
                  <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                    {viewingProduct.description}
                  </p>
                  {viewingProduct.sizes && viewingProduct.sizes.length > 0 && (
                    <div className="space-y-1">
                      <span className="block text-[11px] font-semibold text-slate-700">Sizes:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {viewingProduct.sizes.map((s) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-semibold text-[#0B1F3A]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {viewingProduct.colors && viewingProduct.colors.length > 0 && (
                    <div className="space-y-1">
                      <span className="block text-[11px] font-semibold text-slate-700">Colors:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {viewingProduct.colors.map((c) => (
                          <span
                            key={c}
                            className="px-2 py-0.5 rounded bg-orange-50 border border-orange-200 text-[11px] font-semibold text-slate-800"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {viewingProduct.variations.length > 0 && (
                    <div className="space-y-1">
                      <span className="block text-[11px] font-semibold text-slate-700">Other Options:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {viewingProduct.variations.map((v) => (
                          <span
                            key={v}
                            className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => startEditProduct(viewingProduct)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Product / Change Cover</span>
                </button>
                <button
                  type="button"
                  disabled={busyProductId === viewingProduct.id}
                  onClick={async () => {
                    const target = viewingProduct;
                    setBusyProductId(target.id);
                    try {
                      const nextPublished = !target.published;
                      const res = await apiRequest<{ message: string }>(
                        `/api/seller/products/${target.id}`,
                        {
                          method: 'PUT',
                          body: { published: nextPublished },
                        }
                      );
                      notifyResult(res.message || `Updated ${target.title}.`);
                      setViewingProduct({ ...target, published: nextPublished });
                      await loadAll();
                    } catch (err: any) {
                      notifyResult(err?.message || 'Could not update product visibility.', true);
                    } finally {
                      setBusyProductId(null);
                    }
                  }}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700"
                >
                  {viewingProduct.published ? 'Unpublish' : 'Publish'}
                </button>
              </div>

              {viewingProduct.published && (
                <button
                  type="button"
                  onClick={() => {
                    const id = viewingProduct.id;
                    setViewingProduct(null);
                    onNavigate(`/product/${id}`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white text-xs font-semibold transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>View Live in Shop</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
