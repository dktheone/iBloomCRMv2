'use client';

import React from 'react';
import { Icon } from '@iconify/react';
import type { Message, MessageStatus } from '@/lib/types/inbox';

interface Props {
  message: Message;
  isOwn: boolean; // outbound = right side
}

// ── Source tag config ──────────────────────────────────────────────────────────
const SOURCE_TAGS: Record<string, { label: string; icon: string; color: string }> = {
  agent:     { label: 'Agent',     icon: 'solar:user-bold',              color: 'text-slate-500 dark:text-slate-400' },
  ai_agent:  { label: 'AI',        icon: 'solar:magic-stick-3-bold',     color: 'text-violet-500 dark:text-violet-400' },
  broadcast: { label: 'Broadcast', icon: 'solar:megaphone-bold',         color: 'text-orange-500 dark:text-orange-400' },
  flow:      { label: 'Flow',      icon: 'solar:routing-2-bold',         color: 'text-blue-500 dark:text-blue-400' },
  sequence:  { label: 'Sequence',  icon: 'solar:reorder-bold',           color: 'text-emerald-500 dark:text-emerald-400' },
  api:       { label: 'API',       icon: 'solar:code-bold',              color: 'text-slate-500 dark:text-slate-400' },
};

// ── Status tick ────────────────────────────────────────────────────────────────
function StatusTick({ status }: { status?: MessageStatus }) {
  if (!status) return null;
  const map: Record<MessageStatus, { icon: string; color: string; label: string }> = {
    queued:    { icon: 'solar:clock-circle-bold',        color: 'text-slate-400', label: 'Queued' },
    sent:      { icon: 'solar:check-square-bold',        color: 'text-slate-400', label: 'Sent' },
    delivered: { icon: 'solar:check-read-bold',          color: 'text-slate-400', label: 'Delivered' },
    read:      { icon: 'solar:check-read-bold',          color: 'text-cyan-400',  label: 'Read' },
    failed:    { icon: 'solar:danger-triangle-bold',     color: 'text-rose-500',  label: 'Failed' },
  };
  const t = map[status];
  return (
    <span className={`inline-flex items-center gap-0.5 ${t.color}`} title={t.label}>
      <Icon icon={t.icon} className="w-3.5 h-3.5" />
    </span>
  );
}

// ── Content renderers ──────────────────────────────────────────────────────────
function TextContent({ content }: { content: any }) {
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
      {content?.body ?? ''}
    </p>
  );
}

function TemplateContent({ content }: { content: any }) {
  const components: any[] = content?.components ?? [];
  const header = components.find((c: any) => c.type === 'HEADER' || c.type === 'header');
  const body = components.find((c: any) => c.type === 'BODY' || c.type === 'body');
  const footer = components.find((c: any) => c.type === 'FOOTER' || c.type === 'footer');
  const buttons = components.filter((c: any) => c.type === 'BUTTONS' || c.type === 'button');

  // Look for resolved body text in content.body?.text, content.resolved_body, or fallback
  const bodyText =
    content?.body?.text ||
    content?.resolved_body ||
    body?.text ||
    (content?.raw_params?.[0]?.parameters ? content.raw_params[0].parameters.map((p: any) => p.text).join(' ') : null);

  return (
    <div className="space-y-1.5 min-w-[220px] max-w-sm">
      {/* Template badge */}
      <div className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-white/20 dark:border-slate-600/40">
        <div className="flex items-center gap-1.5">
          <Icon icon="solar:document-text-bold-duotone" className="w-3.5 h-3.5 opacity-70" />
          <span className="text-[10px] font-mono font-bold opacity-70 uppercase tracking-wider">
            {content?.template_name ?? 'Template'}
          </span>
        </div>
        {content?.language && (
          <span className="text-[9px] font-mono opacity-50 uppercase">{content.language}</span>
        )}
      </div>

      {/* Header */}
      {header && (
        <div className="font-bold text-sm">
          {header.format === 'IMAGE' ? (
            <div className="h-28 rounded-xl bg-white/10 dark:bg-slate-700/50 flex items-center justify-center overflow-hidden">
              {header.media_url ? (
                <img src={header.media_url} alt="Template header" className="w-full h-full object-cover" />
              ) : (
                <Icon icon="solar:gallery-bold-duotone" className="w-8 h-8 opacity-40" />
              )}
            </div>
          ) : header.format === 'VIDEO' ? (
            <div className="h-28 rounded-xl bg-white/10 dark:bg-slate-700/50 flex items-center justify-center">
              <Icon icon="solar:play-circle-bold-duotone" className="w-8 h-8 opacity-40" />
            </div>
          ) : header.format === 'DOCUMENT' ? (
            <div className="flex items-center gap-2 bg-white/10 dark:bg-slate-700/50 rounded-xl px-3 py-2">
              <Icon icon="solar:file-text-bold-duotone" className="w-5 h-5 opacity-70" />
              <span className="text-xs">Document Header</span>
            </div>
          ) : (
            <span className="text-sm font-semibold">{header.text ?? ''}</span>
          )}
        </div>
      )}

      {/* Body */}
      {bodyText ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {bodyText}
        </p>
      ) : (
        <p className="text-xs opacity-70 italic">Template message sent.</p>
      )}

      {/* Footer */}
      {footer?.text && (
        <p className="text-[11px] opacity-60 mt-1">{footer.text}</p>
      )}

      {/* Buttons */}
      {buttons.length > 0 && (
        <div className="pt-1.5 border-t border-white/20 dark:border-slate-600/40 space-y-1">
          {buttons.map((btn: any, i: number) => (
            <div
              key={i}
              className="text-center text-xs font-bold py-1.5 rounded-lg bg-white/15 dark:bg-slate-600/40 hover:bg-white/25 cursor-default transition-colors"
            >
              {btn.text ?? btn.title ?? 'Button'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function applyBindings(text: string, bindings?: Record<string, string>): string {
  if (!bindings) return text;
  return text.replace(/\{\{(\d+)\}\}/g, (_, k) => bindings[k] ?? `{{${k}}}`);
}

function MediaContent({ content, type }: { content: any; type: string }) {
  const mediaUrl = content?.media_url || (content?.meta_media_id ? `/api/media/${content.meta_media_id}` : null);

  if (type === 'image') {
    return (
      <div className="space-y-1.5 max-w-xs">
        {mediaUrl ? (
          <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl group relative">
            <img
              src={mediaUrl}
              alt={content?.caption || 'WhatsApp Image'}
              className="max-h-72 w-full object-cover rounded-xl transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Icon icon="solar:magnifer-zoom-in-bold" className="w-6 h-6 text-white drop-shadow" />
            </div>
          </a>
        ) : (
          <div className="h-28 w-52 rounded-xl bg-white/10 dark:bg-slate-700/50 flex flex-col items-center justify-center gap-1">
            <Icon icon="solar:gallery-bold-duotone" className="w-8 h-8 opacity-50" />
            <span className="text-[10px] opacity-60">Image</span>
          </div>
        )}
        {content?.caption && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content.caption}</p>
        )}
      </div>
    );
  }

  if (type === 'audio') {
    return (
      <div className="space-y-1 py-1">
        {mediaUrl ? (
          <audio controls src={mediaUrl} className="max-w-[240px] h-10" />
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 dark:bg-slate-700/50">
            <Icon icon="solar:microphone-3-bold-duotone" className="w-5 h-5 text-cyan-400" />
            <span className="text-xs">Voice Note</span>
          </div>
        )}
      </div>
    );
  }

  if (type === 'video') {
    return (
      <div className="space-y-1.5 max-w-xs">
        {mediaUrl ? (
          <video controls src={mediaUrl} className="max-h-72 w-full rounded-xl" />
        ) : (
          <div className="h-28 w-52 rounded-xl bg-white/10 dark:bg-slate-700/50 flex flex-col items-center justify-center gap-1">
            <Icon icon="solar:play-circle-bold-duotone" className="w-8 h-8 opacity-50" />
            <span className="text-[10px] opacity-60">Video</span>
          </div>
        )}
        {content?.caption && (
          <p className="text-sm leading-relaxed">{content.caption}</p>
        )}
      </div>
    );
  }

  if (type === 'document') {
    return (
      <div className="space-y-1">
        <a
          href={mediaUrl || '#'}
          target={mediaUrl ? '_blank' : undefined}
          rel="noopener noreferrer"
          className="flex items-center gap-3 bg-white/10 dark:bg-slate-700/50 hover:bg-white/20 transition-colors rounded-xl px-3.5 py-2.5 max-w-xs"
        >
          <div className="w-9 h-9 rounded-lg bg-red-500/20 grid place-items-center shrink-0">
            <Icon icon="solar:file-text-bold-duotone" className="w-5 h-5 text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">{content?.filename || 'Document'}</p>
            <p className="text-[10px] opacity-60 uppercase">{content?.mime_type?.split('/')[1] || 'FILE'}</p>
          </div>
          {mediaUrl && (
            <Icon icon="solar:download-minimalistic-bold" className="w-4 h-4 opacity-70 shrink-0" />
          )}
        </a>
        {content?.caption && (
          <p className="text-sm leading-relaxed">{content.caption}</p>
        )}
      </div>
    );
  }

  // Sticker or Fallback
  return (
    <div className="space-y-1">
      {mediaUrl ? (
        <img src={mediaUrl} alt="Sticker" className="w-28 h-28 object-contain" />
      ) : (
        <div className="h-20 w-20 rounded-xl bg-white/10 dark:bg-slate-700/50 grid place-items-center">
          <Icon icon="solar:emoji-funny-square-bold-duotone" className="w-8 h-8 opacity-50" />
        </div>
      )}
    </div>
  );
}

function LocationContent({ content }: { content: any }) {
  return (
    <div className="flex items-start gap-2 min-w-[180px]">
      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 grid place-items-center shrink-0">
        <Icon icon="solar:map-point-bold-duotone" className="w-5 h-5 text-emerald-500" />
      </div>
      <div>
        {content?.name && <p className="text-sm font-bold">{content.name}</p>}
        {content?.address && <p className="text-xs opacity-70">{content.address}</p>}
        <p className="text-[10px] font-mono opacity-50 mt-0.5">
          {content?.latitude?.toFixed(4)}, {content?.longitude?.toFixed(4)}
        </p>
      </div>
    </div>
  );
}

function SystemMessage({ content }: { content: any }) {
  const labels: Record<string, string> = {
    assigned:   'Conversation assigned',
    reassigned: 'Conversation reassigned',
    resolved:   'Conversation resolved',
    reopened:   'Conversation reopened',
    note:       '',
    bot_on:     'Bot mode activated',
    bot_off:    'Agent mode activated',
  };
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 italic py-1">
      <Icon icon="solar:info-circle-bold" className="w-3.5 h-3.5 shrink-0" />
      <span>{content?.note ?? labels[content?.event] ?? content?.event}</span>
    </div>
  );
}

function InteractiveContent({ content }: { content: any }) {
  const buttons = content?.action?.buttons ?? [];
  return (
    <div className="space-y-1.5 min-w-[180px]">
      {content?.body?.text && (
        <p className="text-sm leading-relaxed">{content.body.text}</p>
      )}
      {buttons.map((btn: any, i: number) => (
        <div
          key={i}
          className="text-center text-xs font-bold py-1.5 px-3 rounded-xl border border-white/30 dark:border-slate-600"
        >
          {btn.title ?? btn.id}
        </div>
      ))}
    </div>
  );
}

// ── Timestamp formatter ────────────────────────────────────────────────────────
function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Main MessageBubble ─────────────────────────────────────────────────────────
export default function MessageBubble({ message, isOwn }: Props) {
  const { message_type, content, direction, source_type, status } = message;

  // System messages render inline (no bubble)
  if (message_type === 'system') {
    return <SystemMessage content={content} />;
  }

  const isDeleted = message.is_deleted;

  return (
    <div className={`flex items-end gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>

      {/* Bubble */}
      <div className={`
        relative max-w-[75%] sm:max-w-[65%]
        rounded-2xl px-3.5 py-2.5 shadow-sm
        ${isOwn
          ? 'bg-gradient-to-br from-cyan-600 to-teal-600 text-white rounded-br-sm'
          : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm border border-slate-200/80 dark:border-slate-700/50'
        }
        ${isDeleted ? 'opacity-50' : ''}
      `}>

        {/* Source tag (outbound, non-agent) */}
        {isOwn && source_type && source_type !== 'agent' && SOURCE_TAGS[source_type] && (
          <div className={`flex items-center gap-1 mb-1 ${SOURCE_TAGS[source_type].color} opacity-80`}>
            <Icon icon={SOURCE_TAGS[source_type].icon} className="w-3 h-3" />
            <span className="text-[10px] font-bold">{SOURCE_TAGS[source_type].label}</span>
          </div>
        )}

        {/* Message content */}
        {isDeleted ? (
          <p className="text-sm italic opacity-60 flex items-center gap-1">
            <Icon icon="solar:trash-bin-trash-bold" className="w-3.5 h-3.5" />
            This message was deleted
          </p>
        ) : (
          <>
            {message_type === 'text'        && <TextContent content={content} />}
            {message_type === 'template'    && <TemplateContent content={content} />}
            {message_type === 'location'    && <LocationContent content={content} />}
            {message_type === 'interactive' && <InteractiveContent content={content} />}
            {['image','video','audio','document','sticker'].includes(message_type) && (
              <MediaContent content={content} type={message_type} />
            )}
            {message_type === 'reaction' && (
              <span className="text-2xl">{(content as any)?.emoji ?? '👍'}</span>
            )}
          </>
        )}

        {/* Footer: time + status */}
        <div className={`flex items-center gap-1 mt-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[10px] ${isOwn ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
            {formatTime(message.created_at)}
          </span>
          {isOwn && <StatusTick status={status} />}
        </div>
      </div>
    </div>
  );
}
