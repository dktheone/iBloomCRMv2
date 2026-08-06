// components/contacts/ActivityTimeline.tsx
// Center panel: Contact activity timeline with pre-rendered titles (D-105)

'use client';

import { Icon } from '@iconify/react';
import { useState } from 'react';

interface Activity {
  activity_uid: string;
  activity_type: string;
  title: string;
  occurred_at: string;
  detail?: Record<string, unknown>;
  source_module?: string;
}

interface ActivityTimelineProps {
  activities: Activity[];
  contactUid: string;
  tenantUid: string;
}

const activityIcons: Record<string, string> = {
  'contact.created': 'solar:user-plus-rounded-bold',
  'message.sent': 'solar:paperplane-bold',
  'message.received': 'solar:inbox-line-bold',
  'consent.changed': 'solar:shield-check-bold',
  'label.added': 'solar:tag-bold',
  'label.removed': 'solar:tag-cross-bold',
  'broadcast.included': 'solar:users-group-rounded-bold',
  'sequence.enrolled': 'solar:route-bold',
  'flow.entered': 'solar:graph-new-bold',
  'note.added': 'solar:notes-bold',
  'import.created': 'solar:import-bold',
  'field.updated': 'solar:pen-bold',
};

export default function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);

  if (activities.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 text-center space-y-3">
        <Icon icon="solar:calendar-bold-duotone" className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
        <div className="text-sm font-bold text-slate-700 dark:text-slate-300">No Activity Yet</div>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Activity events will appear here as the contact interacts with your business.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-mono font-bold text-slate-900 dark:text-white uppercase">Activity Timeline</h3>
        <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-3 py-1.5 rounded-xl border border-cyan-200 dark:border-cyan-800">
          {activities.length} Events
        </span>
      </div>

      <div className="space-y-4 max-h-[600px] overflow-y-auto">
        {activities.map((activity, index) => {
          const isExpanded = expandedActivity === activity.activity_uid;
          const hasDetail = activity.detail && Object.keys(activity.detail).length > 0;
          const icon = activityIcons[activity.activity_type] || 'solar:history-bold';

          return (
            <div
              key={activity.activity_uid}
              className="relative pl-8 pb-4 border-l-2 border-slate-200 dark:border-slate-800 last:border-l-0"
            >
              {/* Icon */}
              <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-white dark:bg-[#1A2232] border-2 border-cyan-500 dark:border-cyan-600 grid place-items-center">
                <Icon icon={icon} className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              </div>

              {/* Content */}
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{activity.title}</p>
                  <time className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                    {new Date(activity.occurred_at).toLocaleString()}
                  </time>
                </div>

                {activity.source_module && (
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    via {activity.source_module}
                  </div>
                )}

                {/* Detail expansion */}
                {hasDetail && (
                  <button
                    onClick={() => setExpandedActivity(isExpanded ? null : activity.activity_uid)}
                    className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 mt-1"
                  >
                    <Icon
                      icon={isExpanded ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}
                      className="w-3 h-3"
                    />
                    {isExpanded ? 'Hide' : 'Show'} Details
                  </button>
                )}

                {isExpanded && activity.detail && (
                  <div className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                    <pre className="text-[10px] font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(activity.detail, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
