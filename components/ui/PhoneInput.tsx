'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Phone, ChevronDown, Check } from 'lucide-react';

interface PhoneInputProps {
  label: string;
  value: string;
  onChange: (fullE164Number: string) => void;
  onBlur?: () => void;
  error?: string;
  helperText?: string;
  required?: boolean;
}

// High-Definition SVG Flag Components to guarantee 100% crisp rendering across Windows, Mac, and Linux
const IndiaFlagSvg = () => (
  <svg className="w-5 h-3.5 rounded-xs shadow-xs object-cover border border-slate-200/80 dark:border-slate-700/80 shrink-0" viewBox="0 0 640 480">
    <path fill="#f93" d="M0 0h640v160H0z"/>
    <path fill="#fff" d="M0 160h640v160H0z"/>
    <path fill="#128807" d="M0 320h640v160H0z"/>
    <g transform="matrix(3.2 0 0 3.2 320 240)">
      <circle r="20" fill="none" stroke="#008" strokeWidth="2"/>
      <circle r="3" fill="#008"/>
      <g id="d">
        <g id="c">
          <g id="b">
            <line y2="-20" stroke="#008" strokeWidth="1"/>
            <circle y="-17.5" r=".8" fill="#008"/>
          </g>
          <use href="#b" transform="rotate(15)"/>
        </g>
        <use href="#c" transform="rotate(30)"/>
      </g>
      <use href="#d" transform="rotate(60)"/>
      <use href="#d" transform="rotate(120)"/>
    </g>
  </svg>
);

const UsFlagSvg = () => (
  <svg className="w-5 h-3.5 rounded-xs shadow-xs object-cover border border-slate-200/80 dark:border-slate-700/80 shrink-0" viewBox="0 0 640 480">
    <path fill="#bd3d44" d="M0 0h640v480H0z"/>
    <path stroke="#fff" strokeWidth="37" d="M0 55.5h640M0 129.5h640M0 203.5h640M0 277.5h640M0 351.5h640M0 425.5h640"/>
    <path fill="#192f5d" d="M0 0h288v258.5H0z"/>
    <g fill="#fff">
      <g id="us-s">
        <g id="us-f">
          <polygon points="12,0 15,9 24,9 17,14 19,23 12,18 5,23 7,14 0,9 9,9"/>
        </g>
        <use href="#us-f" x="48"/>
        <use href="#us-f" x="96"/>
        <use href="#us-f" x="144"/>
        <use href="#us-f" x="192"/>
        <use href="#us-f" x="240"/>
      </g>
      <use href="#us-s" y="48"/>
      <use href="#us-s" y="96"/>
      <use href="#us-s" y="144"/>
      <use href="#us-s" y="192"/>
    </g>
  </svg>
);

export const COUNTRY_CODES = [
  { code: '+91', country: 'IN', flagSvg: IndiaFlagSvg, name: 'India', placeholder: '98765 43210' },
  { code: '+1', country: 'US', flagSvg: UsFlagSvg, name: 'United States', placeholder: '(202) 555-0123' },
];

export const PhoneInput: React.FC<PhoneInputProps> = ({
  label,
  value,
  onChange,
  onBlur,
  error,
  helperText,
  required = false,
}) => {
  const [selectedCountryCode, setSelectedCountryCode] = useState('+91');
  const [nationalNumber, setNationalNumber] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeCountry = COUNTRY_CODES.find((c) => c.code === selectedCountryCode) || COUNTRY_CODES[0];
  const ActiveFlag = activeCountry.flagSvg;

  // Close custom popover menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Synchronize internal state with external full E.164 string value
  useEffect(() => {
    if (!value) {
      setNationalNumber('');
      return;
    }

    if (value.startsWith('+1')) {
      setSelectedCountryCode('+1');
      setNationalNumber(value.slice(2).replace(/\D/g, ''));
    } else if (value.startsWith('+91')) {
      setSelectedCountryCode('+91');
      setNationalNumber(value.slice(3).replace(/\D/g, ''));
    } else {
      const cleanDigits = value.replace(/\D/g, '');
      setNationalNumber(cleanDigits.length > 10 ? cleanDigits.slice(-10) : cleanDigits);
    }
  }, []);

  function handleSelectCountry(code: string) {
    setSelectedCountryCode(code);
    setIsOpen(false);
    const cleanDigits = nationalNumber.replace(/\D/g, '');
    const combined = cleanDigits ? `${code}${cleanDigits}` : code;
    onChange(combined);
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cleanDigits = e.target.value.replace(/\D/g, '');
    setNationalNumber(cleanDigits);
    const combined = cleanDigits ? `${selectedCountryCode}${cleanDigits}` : selectedCountryCode;
    onChange(combined);
  }

  return (
    <div className="space-y-1.5 w-full relative" ref={dropdownRef}>
      {/* Label Header */}
      <div className="flex items-center justify-between">
        <label
          className={`block text-xs font-semibold tracking-tight transition-colors ${
            error ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-[#CBD5E1]'
          }`}
        >
          {label}
          {required && <span className="text-red-400/70 ml-1 font-normal">*</span>}
        </label>
      </div>

      {/* Unified Input Box with High-Definition SVG Flag Trigger */}
      <div className="relative flex items-center w-full rounded-xl shadow-xs transition-all duration-200 group">
        
        {/* Custom Interactive Country Trigger Button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`h-11 px-3 flex items-center gap-2 border-y border-l rounded-l-xl transition-all duration-200 shrink-0 cursor-pointer ${
            error
              ? 'bg-rose-100/80 dark:bg-rose-950/80 border-rose-500 text-rose-900 dark:text-rose-100 border-r-rose-300 dark:border-r-rose-800'
              : 'bg-slate-100/90 dark:bg-[#1E293B] border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 border-r-slate-300 dark:border-r-slate-700 hover:bg-slate-200/80 dark:hover:bg-slate-800'
          }`}
        >
          <Phone
            className={`w-3.5 h-3.5 shrink-0 ${
              error ? 'text-rose-500' : 'text-slate-400 dark:text-slate-500'
            }`}
          />
          <ActiveFlag />
          <span className="text-xs font-mono font-bold">{activeCountry.code}</span>
          <ChevronDown className={`w-3 h-3 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* 10-Digit Mobile Number Input Box */}
        <input
          type="text"
          value={nationalNumber}
          onChange={handleNumberChange}
          onBlur={onBlur}
          maxLength={10}
          placeholder={activeCountry.placeholder}
          aria-invalid={Boolean(error)}
          className={`w-full h-11 pl-3.5 pr-9 py-2.5 text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none rounded-r-xl border-y border-r transition-all duration-200 ${
            error
              ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-500 text-rose-900 dark:text-rose-100 focus:border-rose-600 focus:ring-4 focus:ring-rose-500/15'
              : 'bg-white dark:bg-[#0F172A] border-slate-300 dark:border-slate-700 focus:border-cyan-600 dark:focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/10'
          }`}
        />

        {error && (
          <AlertCircle className="w-4 h-4 text-rose-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
        )}
      </div>

      {/* Floating Custom Country Selection Popover Menu */}
      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-64 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100 dark:border-slate-700/60 mb-1">
            Select Country Code
          </div>

          <div className="space-y-1">
            {COUNTRY_CODES.map((item) => {
              const isSelected = item.code === selectedCountryCode;
              const FlagSvg = item.flagSvg;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => handleSelectCountry(item.code)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 font-bold border border-cyan-200 dark:border-cyan-800'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FlagSvg />
                    <span className="font-semibold">{item.name}</span>
                    <span className="font-mono text-slate-400 text-[11px]">({item.code})</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Small Red Subtext Error Remark */}
      {error ? (
        <p className="text-[11px] text-rose-600 dark:text-rose-400 font-mono font-medium flex items-center gap-1.5 mt-1 leading-tight animate-fadeIn">
          <span>↳ {error}</span>
        </p>
      ) : helperText ? (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans mt-1">{helperText}</p>
      ) : null}
    </div>
  );
};
