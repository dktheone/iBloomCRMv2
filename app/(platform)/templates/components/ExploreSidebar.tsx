'use client';

import React, { useState } from 'react';
import { Icon } from '@iconify/react';

interface ExploreSidebarProps {
  selectedSubcategory: string;
  onSelectSubcategory: (sub: string) => void;
}

const SECTOR_TAXONOMY = [
  {
    sector: 'E-Commerce',
    icon: 'solar:shop-bold-duotone',
    subcategories: [
      'Order Summary',
      'Order Tracking',
      'Payment Reminder',
      'Cart Reminder',
      'Delivery Update',
      'Information Request',
      'Return & Refund',
    ],
  },
  {
    sector: 'Finance',
    icon: 'solar:card-bold-duotone',
    subcategories: [
      'KYC Update',
      'Account Alert',
      'Bill Reminder',
      'Loan Application',
      'Security Verification',
    ],
  },
  {
    sector: 'Healthcare',
    icon: 'solar:medical-kit-bold-duotone',
    subcategories: [
      'Appointment Booking',
      'Lab Report Reminder',
      'Prescription Ready',
      'Health Tips',
    ],
  },
  {
    sector: 'Fashion',
    icon: 'solar:t-shirt-bold-duotone',
    subcategories: [
      'New Collection',
      'Sale Offer',
      'Abandoned Cart',
      'Back in Stock',
      'Order Update',
    ],
  },
  {
    sector: 'General',
    icon: 'solar:widget-bold-duotone',
    subcategories: [
      'Customer Feedback',
      'Welcome Message',
      'Promotion',
      'Reminder',
    ],
  },
];

export default function ExploreSidebar({ selectedSubcategory, onSelectSubcategory }: ExploreSidebarProps) {
  const [openSectors, setOpenSectors] = useState<Record<string, boolean>>({
    'E-Commerce': true,
    Finance: true,
  });

  function toggleSector(sector: string) {
    setOpenSectors((prev) => ({ ...prev, [sector]: !prev[sector] }));
  }

  return (
    <div className="bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-4 shadow-lg text-xs font-sans">
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 font-bold text-slate-900 dark:text-white">
        <Icon icon="solar:compass-bold-duotone" className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
        <span>Explore by Sector</span>
      </div>

      <button
        onClick={() => onSelectSubcategory('all')}
        className={`w-full text-left px-3 py-2 rounded-xl font-bold flex items-center justify-between transition-all ${
          selectedSubcategory === 'all'
            ? 'bg-cyan-600 text-white shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
        }`}
      >
        <span>All Prebuilt Templates</span>
        <Icon icon="solar:alt-arrow-right-bold" className="w-3.5 h-3.5" />
      </button>

      <div className="space-y-2">
        {SECTOR_TAXONOMY.map((item) => {
          const isOpen = openSectors[item.sector];
          return (
            <div key={item.sector} className="space-y-1">
              <button
                onClick={() => toggleSector(item.sector)}
                className="w-full text-left px-3 py-2 rounded-xl font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Icon icon={item.icon} className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span>{item.sector}</span>
                </div>
                <Icon
                  icon="solar:alt-arrow-down-bold"
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isOpen && (
                <div className="pl-6 space-y-1 border-l-2 border-slate-100 dark:border-slate-800 ml-3">
                  {item.subcategories.map((sub) => (
                    <button
                      key={sub}
                      onClick={() => onSelectSubcategory(sub)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] transition-all truncate ${
                        selectedSubcategory === sub
                          ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-extrabold border-l-2 border-cyan-500'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
