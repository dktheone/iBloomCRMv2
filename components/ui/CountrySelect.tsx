'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, Check, Globe } from 'lucide-react';
import { COUNTRY_OPTIONS } from '@/lib/contacts/constants';

interface CountrySelectProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (countryCode: string) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * Three-country select (India · Nepal · United States) with inline SVG flags.
 *
 * Shares its error styling and subtext treatment with `FormField`, and its
 * popover mechanics with `PhoneInput`, so it lines up with the rest of a form
 * row without any per-form CSS.
 */
export const CountrySelect: React.FC<CountrySelectProps> = ({
  id,
  label = 'Country',
  value,
  onChange,
  error,
  helperText,
  required = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = COUNTRY_OPTIONS.find((c) => c.code === value) || COUNTRY_OPTIONS[0];
  const SelectedFlag = selected.flagSvg;

  // Close the popover when clicking anywhere outside it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(code: string) {
    onChange(code);
    setIsOpen(false);
  }

  return (
    <div className="space-y-1.5 w-full relative" ref={dropdownRef}>
      {/* Label Header */}
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className={`block text-xs font-semibold tracking-tight transition-colors ${
            error ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-[#CBD5E1]'
          }`}
        >
          {label}
          {required && <span className="text-red-400/70 ml-1 font-normal">*</span>}
        </label>
      </div>

      {/* Trigger — styled to match FormField's input box exactly */}
      <div className="relative flex items-center w-full">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10">
          <Globe
            className={`w-4 h-4 transition-colors ${
              error ? 'text-rose-500' : 'text-slate-400 dark:text-slate-500'
            }`}
          />
        </div>

        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          aria-invalid={Boolean(error)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={`w-full h-11 pl-10 pr-9 py-2.5 text-xs text-left rounded-xl border focus:outline-none transition-all duration-200 flex items-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed ${
            error
              ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-500 text-rose-900 dark:text-rose-100 focus:border-rose-600 focus:ring-4 focus:ring-rose-500/15'
              : 'bg-white dark:bg-[#0F172A] border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:border-cyan-600 dark:focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/10'
          }`}
        >
          <SelectedFlag />
          <span className="font-semibold">{selected.name}</span>
          <span className="font-mono text-slate-400 text-[11px]">({selected.code})</span>
        </button>

        {error ? (
          <AlertCircle className="w-4 h-4 text-rose-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
        ) : (
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </div>

      {/* Popover */}
      {isOpen && !disabled && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-50 w-full bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100 dark:border-slate-700/60 mb-1">
            Select Country
          </div>

          <div className="space-y-1">
            {COUNTRY_OPTIONS.map((item) => {
              const isSelected = item.code === selected.code;
              const FlagSvg = item.flagSvg;
              return (
                <button
                  key={item.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(item.code)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 font-bold border border-cyan-200 dark:border-cyan-800'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FlagSvg />
                    <span className="font-semibold">{item.name}</span>
                    <span className="font-mono text-slate-400 text-[11px]">({item.dialCode})</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Subtext */}
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

CountrySelect.displayName = 'CountrySelect';
