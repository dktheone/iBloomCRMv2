'use client';

import React from 'react';
import { Icon } from '@iconify/react';
import { WhatsAppTemplate, VariableExample } from '../../../../lib/types/template-types';

interface PhoneSimulatorProps {
  template: Partial<WhatsAppTemplate>;
  variables?: VariableExample[];
}

export default function PhoneSimulator({ template, variables = [] }: PhoneSimulatorProps) {
  // SECURITY: the result of this function is injected via dangerouslySetInnerHTML,
  // so all user/template-derived text (body text and variable example values) must
  // be HTML-escaped BEFORE any markup is added. Otherwise a template body such as
  // `<img src=x onerror=alert(1)>` would execute as stored XSS in the preview.
  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Parse Markdown formatting (*bold*, _italic_, ~strikethrough~, `code`)
  function formatWhatsAppText(text: string) {
    if (!text) return '';

    // Escape first so no raw HTML from the template ever reaches the DOM.
    const escaped = escapeHtml(text);

    // Replace {{1}}, {{2}}, or {{parameter_name}} with variable examples or fallbacks
    let substituted = escaped.replace(/\{\{([^}]+)\}\}/g, (match, p1) => {
      const rawKey = p1.trim();
      const numericIdx = parseInt(rawKey, 10);
      const matchedVar = variables.find((v) => 
        (v.key && v.key === rawKey) || 
        (v.index !== undefined && !isNaN(numericIdx) && v.index === numericIdx) ||
        (v.index !== undefined && v.index.toString() === rawKey)
      );
      return matchedVar && matchedVar.exampleValue && matchedVar.exampleValue.trim()
        ? escapeHtml(matchedVar.exampleValue)
        : `[${match}]`;
    });

    // Formatting regexes (operate on already-escaped, safe text)
    substituted = substituted
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/~(.*?)~/g, '<del>$1</del>')
      .replace(/`(.*?)`/g, '<code class="bg-slate-200 dark:bg-slate-800 px-1 rounded">$1</code>');

    return substituted;
  }

  const category = template.category || 'MARKETING';
  const marketingSubtype = template.marketingSubtype || 'STANDARD';
  const isLimitedOffer = category === 'MARKETING' && marketingSubtype === 'LIMITED_TIME_OFFER';
  const isAuth = category === 'AUTHENTICATION';

  return (
    <div className="w-full max-w-[340px] mx-auto bg-slate-950 rounded-[40px] p-3 shadow-2xl border-4 border-slate-800 relative select-none font-sans">
      {/* Smartphone Notch & Speaker */}
      <div className="w-32 h-4 bg-slate-900 rounded-full mx-auto mb-2 flex items-center justify-center gap-2">
        <div className="w-3 h-3 rounded-full bg-slate-950 border border-slate-800"></div>
        <div className="w-10 h-1 rounded-full bg-slate-800"></div>
      </div>

      {/* Screen Frame Container */}
      <div className="bg-[#0B141A] rounded-[30px] overflow-hidden border border-slate-800 min-h-[520px] flex flex-col justify-between relative shadow-inner">
        {/* WhatsApp App Top Header Bar */}
        <div className="bg-[#1F2C34] px-3 py-2.5 flex items-center justify-between border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              <Icon icon="logos:whatsapp-icon" className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-100 flex items-center gap-1">
                <span>iBloom Business</span>
                <Icon icon="solar:verified-check-bold" className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-[9px] text-slate-400 font-mono">Official Business Account</div>
            </div>
          </div>
          <Icon icon="solar:menu-dots-bold" className="w-4 h-4 text-slate-400" />
        </div>

        {/* Chat Wallpaper Area */}
        <div className="p-3 flex-1 flex flex-col justify-end space-y-2 bg-[radial-gradient(#111B21_1px,transparent_1px)] [background-size:12px_12px]">
          {/* WhatsApp Message Bubble Wrapper */}
          <div className="bg-[#202C33] text-slate-100 rounded-2xl rounded-tl-xs p-3 space-y-2.5 shadow-lg border border-slate-700/40 text-xs max-w-[92%] relative">
            {/* 1. Header Rendering */}
            {template.header && template.header.type !== 'NONE' && (
              <div className="rounded-xl overflow-hidden bg-[#111B21] border border-slate-700/60 p-2 text-xs">
                {template.header.type === 'TEXT' && (
                  <div className="font-extrabold text-slate-100">
                    {template.header.textValue || 'Header Text'}
                  </div>
                )}

                {template.header.type === 'IMAGE' && (
                  <div className="space-y-1 text-center py-4 bg-slate-900/80 rounded-lg border border-slate-800">
                    <Icon icon="solar:gallery-wide-bold-duotone" className="w-8 h-8 text-cyan-400 mx-auto" />
                    <div className="text-[10px] text-slate-400 font-mono">
                      {template.header.mediaFileName || 'Image Banner Header'}
                    </div>
                  </div>
                )}

                {template.header.type === 'VIDEO' && (
                  <div className="space-y-1 text-center py-4 bg-slate-900/80 rounded-lg border border-slate-800">
                    <Icon icon="solar:videocamera-record-bold-duotone" className="w-8 h-8 text-teal-400 mx-auto" />
                    <div className="text-[10px] text-slate-400 font-mono">Video Header Stream</div>
                  </div>
                )}

                {template.header.type === 'DOCUMENT' && (
                  <div className="flex items-center gap-2 p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <Icon icon="solar:file-text-bold-duotone" className="w-6 h-6 text-amber-400" />
                    <div className="truncate text-[10px] font-mono text-slate-300">
                      {template.header.mediaFileName || 'Document.pdf'}
                    </div>
                  </div>
                )}

                {template.header.type === 'LOCATION' && (
                  <div className="flex items-center gap-2 p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <Icon icon="solar:map-point-bold-duotone" className="w-6 h-6 text-rose-400" />
                    <div className="text-[10px] font-mono text-slate-300">Location Map Card</div>
                  </div>
                )}
              </div>
            )}

            {/* Limited Time Offer Countdown Header */}
            {isLimitedOffer && (
              <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-[10px] text-amber-300 font-mono">
                <div className="flex items-center gap-1.5 font-bold">
                  <Icon icon="solar:stopwatch-bold" className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span>{template.offerText || 'Limited Time Offer'}</span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200">23:59:59</span>
              </div>
            )}

            {/* 2. Body Text Rendering */}
            <div
              className="leading-relaxed text-[11px] text-slate-200 whitespace-pre-wrap break-words"
              dangerouslySetInnerHTML={{
                __html: formatWhatsAppText(template.body?.text || 'Your message text will appear here...'),
              }}
            />

            {/* Authentication OTP Box */}
            {isAuth && (
              <div className="p-2.5 bg-slate-900/90 border border-teal-500/40 rounded-xl text-center space-y-1 font-mono">
                <div className="text-[10px] text-slate-400">Security Verification Code</div>
                <div className="text-sm font-extrabold text-teal-400 tracking-widest">
                  {variables[0]?.exampleValue || '849 201'}
                </div>
                <div className="text-[9px] text-slate-500">
                  Expires in {template.authConfig?.codeExpiryMinutes || 10} mins
                </div>
              </div>
            )}

            {/* 3. Footer Rendering */}
            {template.footer?.text && (
              <div className="text-[9.5px] text-slate-400 border-t border-slate-700/50 pt-1.5 font-mono">
                {template.footer.text}
              </div>
            )}

            {/* Timestamp & Status Icon */}
            <div className="flex items-center justify-end gap-1 text-[9px] text-slate-400 font-mono pt-1">
              <span>12:45 PM</span>
              <Icon icon="solar:double-alt-arrow-right-bold" className="w-3 h-3 text-cyan-400" />
            </div>

            {/* 4. Action Buttons Container */}
            {template.buttons && template.buttons.length > 0 && (
              <div className="border-t border-slate-700/60 pt-2 space-y-1.5">
                {template.buttons.map((btn, bIdx) => (
                  <div
                    key={btn.id || bIdx}
                    className="w-full py-1.5 px-3 bg-[#111B21] hover:bg-slate-800 border border-slate-700/60 rounded-xl text-center text-[11px] font-bold text-cyan-400 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    {btn.type === 'URL' && <Icon icon="solar:link-bold" className="w-3.5 h-3.5" />}
                    {btn.type === 'PHONE_NUMBER' && <Icon icon="solar:phone-calling-bold" className="w-3.5 h-3.5" />}
                    {btn.type === 'QUICK_REPLY' && <Icon icon="solar:chat-round-dots-bold" className="w-3.5 h-3.5" />}
                    <span>{btn.text || 'Action Button'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Navigation Bar */}
        <div className="bg-[#1F2C34] px-4 py-2 flex items-center justify-between border-t border-slate-800">
          <div className="w-16 h-1 rounded-full bg-slate-700 mx-auto"></div>
        </div>
      </div>
    </div>
  );
}
