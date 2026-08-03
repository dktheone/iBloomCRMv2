'use client';

import { useCallback, useState } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';

/**
 * Clipboard helper shared by the surfaces that expose "copy" affordances:
 * writes the value, raises the standard toast and flags the copied entry for a
 * short window so the caller can swap its icon.
 */
export function useCopyToClipboard(resetDelayMs: number = 2000) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = useCallback(
    (value: string, id: string, message?: string) => {
      navigator.clipboard.writeText(value);
      setCopiedId(id);
      toast.success(message || `Copied ${value} to clipboard!`, {
        icon: <Icon icon="solar:copy-bold-duotone" className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />,
      });
      setTimeout(() => setCopiedId(null), resetDelayMs);
    },
    [resetDelayMs]
  );

  const copyJson = useCallback(
    (payload: unknown, id: string, message: string = 'JSON response copied to clipboard!') => {
      copy(JSON.stringify(payload, null, 2), id, message);
    },
    [copy]
  );

  const isCopied = useCallback((id: string) => copiedId === id, [copiedId]);

  return { copiedId, copy, copyJson, isCopied };
}
