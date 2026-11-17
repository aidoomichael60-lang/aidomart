export type UserRole = 'buyer' | 'seller' | 'admin';

export type SellerApplicationStatus =
  | 'Draft'
  | 'Pending Review'
  | 'Additional Information Required'
  | 'Approved'
  | 'Rejected'
  | 'Suspended';

export type OrderStatus =
  | 'Pending Seller Confirmation'
  | 'Confirmed'
  | 'Processing'
  | 'Ready for Pickup / Dispatch'
  | 'Completed'
  | 'Cancelled';

export type PaymentStatus =
  | 'Not Reported'
  | 'Payment Reported — Awaiting Seller Verification'
  | 'Payment Confirmed'
  | 'Payment Not Received'
  | 'Payment Amount Mismatch'
  | 'Payment Under Review'
  | 'Payment Cancelled'
  | 'Refund Pending'
  | 'Refunded';

export type PromotionStatus =
  | 'Draft'
  | 'Pending Review'
  | 'Published'
  | 'Rejected'
  | 'Expired'
  | 'Unpublished';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  emailVerified: boolean;
  login2faEnabled: boolean;
  soundEnabled: boolean;
  accountStatus: 'Active' | 'Restricted' | 'Suspended';
  sessionCreatedAt?: string;
  sellerProfile?: SellerProfile | null;
}

export interface SellerPaymentSettings {
  momoEnabled: boolean;
  momoProvider: string;
  momoAccountName: string;
  momoNumber: string;
  momoInstructions: string;
  bankEnabled: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
  bankInstructions: string;
}

export interface SellerProfile {
  id: number;
  userId: number;
  legalName: string;
  businessName: string;
  email: string;
  phone: string;
  description: string;
  categories: string[];
  physicalAddress: string;
  locationCity: string;
  deliveryPickupNotes: string;
  storefrontImage: string | null;
  businessPhotos: string[];
  applicationStatus: SellerApplicationStatus;
  verifiedBadge: boolean;
  adminFeedback: string | null;
  physicalInspectionConducted: boolean;
  physicalInspectionDate: string | null;
  physicalInspectionNotes: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  paymentSettings: SellerPaymentSettings;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  productCount?: number;
}

export interface Product {
  id: number;
  sellerId: number;
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  title: string;
  description: string;
  price: number;
  stock: number;
  variations: string[];
  images: string[];
  published: boolean;
  moderatedReason: string | null;
  createdAt: string;
  updatedAt: string;
  seller?: {
    id: number;
    userId: number;
    businessName: string;
    description: string;
    storefrontImage: string | null;
    verifiedBadge: boolean;
    locationCity: string;
    deliveryPickupNotes: string;
    phone?: string;
  };
  ratingAvg?: number | null;
  reviewCount?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedVariation: string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  productTitle: string;
  productImage: string | null;
  selectedVariation: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PaymentHistoryEntry {
  id: number;
  action: string;
  status: PaymentStatus;
  actorName: string;
  actorRole: string;
  notes: string | null;
  createdAt: string;
}

export interface OrderPayment {
  id: number;
  orderId: number;
  orderReference: string;
  amountDue: number;
  amountReported: number | null;
  amountConfirmed: number | null;
  paymentMethod: string | null;
  transactionReference: string | null;
  reportedPaidAt: string | null;
  buyerNotes: string | null;
  status: PaymentStatus;
  verifiedByName: string | null;
  verifiedAt: string | null;
  sellerNotes: string | null;
  history: PaymentHistoryEntry[];
}

export interface OrderTrackingEvent {
  id: number;
  stage: string;
  location: string;
  note: string;
  actorRole: string;
  createdAt: string;
}

export interface Order {
  id: number;
  orderReference: string;
  checkoutBatchRef: string;
  buyerId: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  sellerId: number;
  sellerBusinessName: string;
  sellerVerifiedBadge: boolean;
  sellerPhone?: string;
  sellerPaymentSettings?: SellerPaymentSettings;
  fulfillmentMethod: 'Delivery' | 'Pickup';
  deliveryAddress: string;
  deliveryNotes: string;
  promoCodeUsed: string | null;
  discountPercent: number;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  orderStatus: OrderStatus;
  trackingStage?: string;
  trackingLocation?: string;
  trackingNote?: string;
  estimatedDelivery?: string;
  courierContact?: string;
  trackingEvents?: OrderTrackingEvent[];
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  payment: OrderPayment;
}

export interface ChatMessage {
  id: number;
  buyerId: number;
  sellerId: number;
  senderId: number;
  productId: number | null;
  productTitle: string | null;
  orderId: number | null;
  orderReference: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface BuyerConversation {
  sellerId: number;
  sellerBusinessName: string;
  sellerVerifiedBadge: boolean;
  sellerPhone: string;
  storefrontImage: string | null;
  unreadCount: number;
  lastMessage: string;
  lastAt: string | null;
  messages: ChatMessage[];
}

export interface SellerConversation {
  buyerId: number;
  buyerName: string;
  buyerPhone: string;
  unreadCount: number;
  lastMessage: string;
  lastAt: string | null;
  messages: ChatMessage[];
}

export interface ProductReview {
  id: number;
  productId: number;
  productTitle?: string;
  orderId: number;
  buyerId: number;
  buyerName: string;
  rating: number;
  comment: string;
  sellerResponse: string | null;
  createdAt: string;
}

export interface PromoCode {
  id: number;
  code: string;
  discountPercent: number;
  startsAt: string;
  expiresAt: string;
  manuallyEnded: boolean;
  effectiveStatus: 'Active' | 'Scheduled' | 'Expired' | 'Ended';
  createdByUserId: number;
  createdByName: string;
  createdByRole: UserRole;
  extensionCount: number;
  createdAt: string;
}

export interface SellerPromotion {
  id: number;
  sellerId: number;
  sellerBusinessName: string;
  productId: number | null;
  productTitle: string | null;
  title: string;
  description: string;
  bannerImage: string | null;
  status: PromotionStatus;
  startsAt: string | null;
  expiresAt: string | null;
  adminNote: string | null;
  createdAt: string;
}

export interface Complaint {
  id: number;
  orderId: number | null;
  orderReference: string | null;
  reporterId: number;
  reporterName: string;
  reporterRole: UserRole;
  targetSellerId: number | null;
  targetSellerName: string | null;
  subject: string;
  message: string;
  status: 'Open' | 'Under Review' | 'Resolved' | 'Closed';
  sellerResponse: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: number;
  userId: number;
  title: string;
  message: string;
  link: string | null;
  type: string;
  isRead: boolean;
  createdAt: string;
}
