'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: any;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, icon, error, helperText, fullWidth = true, className = '', id, required, ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

    const IconComp = icon;

    return (
      <div className={`space-y-1.5 ${fullWidth ? 'w-full' : ''}`}>
        {/* Label Header */}
        <div className="flex items-center justify-between">
          <label
            htmlFor={inputId}
            className={`block text-xs font-semibold tracking-tight transition-colors ${
              error ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-[#CBD5E1]'
            }`}
          >
            {label}
            {required && <span className="text-red-400/70 ml-1 font-normal">*</span>}
          </label>
        </div>

        {/* Input Box Wrapper — Seamless Floating Icon */}
        <div className="relative flex items-center w-full">
          {icon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10">
              {React.isValidElement(icon) ? (
                icon
              ) : typeof IconComp === 'function' ? (
                <IconComp
                  className={`w-4 h-4 transition-colors ${
                    error ? 'text-rose-500' : 'text-slate-400 dark:text-slate-500'
                  }`}
                />
              ) : null}
            </div>
          )}

          {/* Text Input Field */}
          <input
            id={inputId}
            ref={ref}
            aria-invalid={Boolean(error)}
            className={`w-full h-11 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl border focus:outline-none transition-all duration-200 ${
              icon ? 'pl-10 pr-9' : 'px-3.5 pr-9'
            } ${
              error
                ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-500 text-rose-900 dark:text-rose-100 focus:border-rose-600 focus:ring-4 focus:ring-rose-500/15'
                : 'bg-white dark:bg-[#0F172A] border-slate-300 dark:border-slate-700 focus:border-cyan-600 dark:focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/10'
            } ${className}`}
            {...props}
          />

          {/* Right Error Warning Icon */}
          {error && (
            <AlertCircle className="w-4 h-4 text-rose-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
          )}
        </div>

        {/* Small Red Subtext Error Remark directly below input */}
        {error ? (
          <p className="text-[11px] text-rose-600 dark:text-rose-400 font-mono font-medium flex items-center gap-1.5 mt-1 leading-tight animate-fadeIn">
            <span>↳ {error}</span>
          </p>
        ) : helperText ? (
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans mt-1">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

FormField.displayName = 'FormField';
