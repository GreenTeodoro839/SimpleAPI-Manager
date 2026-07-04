import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  sublabel?: string;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet';
}

export function StatCard({ label, value, icon, sublabel, tone = 'blue' }: StatCardProps) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <span className="stat-label">{label}</span>
        <strong>{value}</strong>
        {sublabel && <span className="stat-sublabel">{sublabel}</span>}
      </div>
    </div>
  );
}
