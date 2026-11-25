declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA4_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;
export const DEFAULT_GA_MEASUREMENT_ID = 'G-SDH8TNSES3';

let activeMeasurementId: string | null = null;
let lastTrackedPage: string | null = null;

export function normalizeGaMeasurementId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase();
}

export function isValidGaMeasurementId(id: string): boolean {
  return GA4_ID_PATTERN.test(id);
}

function injectGtagScript(measurementId: string) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
  }

  const scriptId = 'aidomart-ga4-gtag';
  const expectedSrc = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  const preloadedScript = document.querySelector<HTMLScriptElement>(
    `script[src="${expectedSrc}"]`
  );
  const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

  if (preloadedScript) {
    window.gtag('config', measurementId, { send_page_view: false });
    return;
  }

  if (!existingScript) {
    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = expectedSrc;
    document.head.appendChild(script);
    window.gtag('js', new Date());
  } else if (existingScript.src !== expectedSrc) {
    existingScript.remove();
    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = expectedSrc;
    document.head.appendChild(script);
  }

  window.gtag('config', measurementId, {
    send_page_view: false,
  });
}

export function configureAnalytics(rawId?: string | null): string | null {
  const envId = normalizeGaMeasurementId(import.meta.env.VITE_GA_MEASUREMENT_ID);
  const candidate = normalizeGaMeasurementId(rawId) || envId || DEFAULT_GA_MEASUREMENT_ID;

  if (!candidate || !isValidGaMeasurementId(candidate)) {
    activeMeasurementId = null;
    return null;
  }

  if (activeMeasurementId !== candidate) {
    activeMeasurementId = candidate;
    lastTrackedPage = null;
    injectGtagScript(candidate);
  }

  return activeMeasurementId;
}

export function getActiveMeasurementId(): string | null {
  return activeMeasurementId;
}

function emitEvent(eventName: string, params?: Record<string, unknown>) {
  if (!activeMeasurementId || typeof window === 'undefined' || typeof window.gtag !== 'function') {
    return;
  }
  window.gtag('event', eventName, params || {});
}

export function trackPageView(pathAndQuery: string) {
  if (!activeMeasurementId || typeof window === 'undefined') return;
  const cleanPath = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  if (lastTrackedPage === cleanPath) return;
  lastTrackedPage = cleanPath;

  emitEvent('page_view', {
    page_title: typeof document !== 'undefined' ? document.title : 'AIDOOMART',
    page_path: cleanPath,
    page_location: window.location.href,
  });
}

export function trackSearch(searchTerm: string) {
  const cleaned = searchTerm.trim();
  if (!cleaned) return;
  emitEvent('search', { search_term: cleaned.slice(0, 100) });
}

export function trackViewItem(product: {
  id: number;
  title: string;
  price: number;
  category?: string;
}) {
  emitEvent('view_item', {
    currency: 'GHS',
    value: Number(product.price || 0),
    items: [
      {
        item_id: String(product.id),
        item_name: product.title,
        item_category: product.category || undefined,
        price: Number(product.price || 0),
        quantity: 1,
      },
    ],
  });
}

export function trackAddToCart(
  product: { id: number; title: string; price: number; category?: string },
  quantity: number
) {
  emitEvent('add_to_cart', {
    currency: 'GHS',
    value: Number((Number(product.price || 0) * quantity).toFixed(2)),
    items: [
      {
        item_id: String(product.id),
        item_name: product.title,
        item_category: product.category || undefined,
        price: Number(product.price || 0),
        quantity,
      },
    ],
  });
}

export function trackBeginCheckout(
  items: Array<{ product: { id: number; title: string; price: number; category?: string }; quantity: number }>,
  totalValue: number
) {
  if (!items.length) return;
  emitEvent('begin_checkout', {
    currency: 'GHS',
    value: Number(totalValue.toFixed(2)),
    items: items.map((it) => ({
      item_id: String(it.product.id),
      item_name: it.product.title,
      item_category: it.product.category || undefined,
      price: Number(it.product.price || 0),
      quantity: it.quantity,
    })),
  });
}

export function trackPurchase(params: {
  transactionId: string;
  value: number;
  coupon?: string;
  items: Array<{ id: number; title: string; price: number; quantity: number }>;
}) {
  emitEvent('purchase', {
    transaction_id: params.transactionId,
    currency: 'GHS',
    value: Number(params.value.toFixed(2)),
    coupon: params.coupon || undefined,
    items: params.items.map((it) => ({
      item_id: String(it.id),
      item_name: it.title,
      price: Number(it.price || 0),
      quantity: it.quantity,
    })),
  });
}
