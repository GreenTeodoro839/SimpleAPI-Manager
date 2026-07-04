import { Inbox } from 'lucide-react';

export function EmptyState({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <div className={`empty-state ${compact ? 'compact' : ''}`}>
      <Inbox size={24} />
      <span>{title}</span>
    </div>
  );
}
