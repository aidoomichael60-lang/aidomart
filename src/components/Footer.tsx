import React from 'react';
import { Phone, Mail } from 'lucide-react';
import { AIDOMART_CONTACT } from '../constants/assets';
import { WhatsAppIcon } from './WhatsAppIcon';

interface FooterProps {
  onNavigate: (path: string) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  return (
    <footer id="contact" className="w-full max-w-full overflow-x-hidden bg-[#0B1F3A] text-slate-200 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <span className="font-display text-xl font-extrabold tracking-tight text-white">
            AIDOO<span className="text-[#F97316]">MART</span>
          </span>
          <p className="text-sm text-slate-300 mt-3 leading-relaxed max-w-sm">
            A multi-vendor marketplace connecting buyers directly with verified independent sellers through transparent storefronts and manual payment verification.
          </p>
        </div>

        <div>
          <h3 className="font-display text-sm font-bold text-white mb-4">Marketplace</h3>
          <ul className="space-y-2.5 text-sm text-slate-300">
            <li>
              <button type="button" onClick={() => onNavigate('/')} className="hover:text-white transition-colors">
                Homepage
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('/shop')} className="hover:text-white transition-colors">
                Shop Products
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('/sellers')} className="hover:text-white transition-colors">
                Approved Sellers
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('/categories')} className="hover:text-white transition-colors">
                Browse Categories
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('/track-order')} className="hover:text-white transition-colors">
                Track Order
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('/register?role=seller')} className="hover:text-white transition-colors">
                Become a Verified Seller
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate('/login')} className="hover:text-white transition-colors">
                Account Sign In
              </button>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-display text-sm font-bold text-white mb-4">
            {AIDOMART_CONTACT.adminTitle}
          </h3>
          <div className="space-y-2.5 text-sm text-slate-300">
            <p className="font-medium text-white">{AIDOMART_CONTACT.contactName}</p>
            <p className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#F97316] shrink-0" />
              <a href={`tel:${AIDOMART_CONTACT.phone}`} className="hover:text-white tabular-nums">
                {AIDOMART_CONTACT.phone}
              </a>
            </p>
            <p className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#F97316] shrink-0" />
              <a href={`mailto:${AIDOMART_CONTACT.email}`} className="hover:text-white break-all">
                {AIDOMART_CONTACT.email}
              </a>
            </p>
            <div className="pt-2">
              <a
                href={AIDOMART_CONTACT.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp Me directly"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2B4E] hover:bg-[#183C6B] border border-white/15 text-white text-xs font-semibold transition-colors"
              >
                <WhatsAppIcon className="w-5 h-5 shrink-0" />
                <span>WhatsApp Me</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} AIDOOMART Marketplace. All rights reserved.</p>
          <p>Independent sellers · Direct manual payment verification</p>
        </div>
      </div>
    </footer>
  );
}
