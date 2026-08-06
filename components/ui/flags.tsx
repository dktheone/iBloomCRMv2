// components/ui/flags.tsx
// Hand-authored SVG national flags, shared by PhoneInput and CountrySelect.
//
// These are inline SVG rather than emoji flags (🇮🇳 🇳🇵 🇺🇸) on purpose: Windows
// ships no regional-indicator glyphs, so emoji flags render as two grey letter
// boxes there. Inline SVG renders crisply on Windows, macOS and Linux alike.

import React from 'react';

/** Shared frame so every flag lines up at the same size inside an input row. */
const FLAG_CLASS =
  'w-5 h-3.5 rounded-xs shadow-xs object-cover border border-slate-200/80 dark:border-slate-700/80 shrink-0';

export const IndiaFlagSvg = () => (
  <svg className={FLAG_CLASS} viewBox="0 0 640 480">
    <path fill="#f93" d="M0 0h640v160H0z" />
    <path fill="#fff" d="M0 160h640v160H0z" />
    <path fill="#128807" d="M0 320h640v160H0z" />
    <g transform="matrix(3.2 0 0 3.2 320 240)">
      <circle r="20" fill="none" stroke="#008" strokeWidth="2" />
      <circle r="3" fill="#008" />
      <g id="in-d">
        <g id="in-c">
          <g id="in-b">
            <line y2="-20" stroke="#008" strokeWidth="1" />
            <circle y="-17.5" r=".8" fill="#008" />
          </g>
          <use href="#in-b" transform="rotate(15)" />
        </g>
        <use href="#in-c" transform="rotate(30)" />
      </g>
      <use href="#in-d" transform="rotate(60)" />
      <use href="#in-d" transform="rotate(120)" />
    </g>
  </svg>
);

export const UsFlagSvg = () => (
  <svg className={FLAG_CLASS} viewBox="0 0 640 480">
    <path fill="#bd3d44" d="M0 0h640v480H0z" />
    <path
      stroke="#fff"
      strokeWidth="37"
      d="M0 55.5h640M0 129.5h640M0 203.5h640M0 277.5h640M0 351.5h640M0 425.5h640"
    />
    <path fill="#192f5d" d="M0 0h288v258.5H0z" />
    <g fill="#fff">
      <g id="us-s">
        <g id="us-f">
          <polygon points="12,0 15,9 24,9 17,14 19,23 12,18 5,23 7,14 0,9 9,9" />
        </g>
        <use href="#us-f" x="48" />
        <use href="#us-f" x="96" />
        <use href="#us-f" x="144" />
        <use href="#us-f" x="192" />
        <use href="#us-f" x="240" />
      </g>
      <use href="#us-s" y="48" />
      <use href="#us-s" y="96" />
      <use href="#us-s" y="144" />
      <use href="#us-s" y="192" />
    </g>
  </svg>
);

/**
 * Nepal — the only non-rectangular national flag: two stacked pennants.
 * Because the silhouette is not a rectangle, the surrounding field is left
 * transparent and the shared border class is suppressed, so the pennant shape
 * itself is what the user sees. Crimson field with a blue border (drawn as a
 * stroke on the same path), a crescent moon on the upper pennant and a
 * twelve-rayed sun on the lower one.
 */
export const NepalFlagSvg = () => (
  <svg className={`${FLAG_CLASS} border-transparent dark:border-transparent`} viewBox="0 0 640 480">
    <path
      d="M220 115 L420 220 L280 245 L404 357 L220 365 Z"
      fill="#dc143c"
      stroke="#003893"
      strokeWidth="22"
      strokeLinejoin="miter"
    />

    {/* Upper pennant — crescent moon with rays */}
    <g fill="#fff">
      {Array.from({ length: 8 }).map((_, i) => (
        <polygon
          key={`np-moon-ray-${i}`}
          points="285,150 292,178 278,178"
          transform={`rotate(${i * 22.5 - 79} 285 192)`}
        />
      ))}
      <circle cx="285" cy="192" r="27" />
      <circle cx="285" cy="181" r="23" fill="#dc143c" />
    </g>

    {/* Lower pennant — twelve-rayed sun */}
    <g fill="#fff">
      {Array.from({ length: 12 }).map((_, i) => (
        <polygon
          key={`np-sun-ray-${i}`}
          points="286,272 293,300 279,300"
          transform={`rotate(${i * 30} 286 312)`}
        />
      ))}
      <circle cx="286" cy="312" r="24" />
    </g>
  </svg>
);
