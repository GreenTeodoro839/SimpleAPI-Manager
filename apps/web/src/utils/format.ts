export function compactNumber(value: number) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value || 0
  );
}

export function integer(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value || 0);
}

export function tokenNumber(value: number) {
  const normalized = Number(value) || 0;
  const absolute = Math.abs(normalized);
  const compactFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  const plainFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  if (absolute >= 1_000_000) return `${compactFormatter.format(normalized / 1_000_000)}M`;
  if (absolute >= 1_000) return `${compactFormatter.format(normalized / 1_000)}K`;
  return plainFormatter.format(normalized);
}

export function percent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`;
}

export function statusTone(status: number) {
  if (status >= 200 && status < 300) return 'success';
  if (status >= 400 && status < 500) return 'warning';
  if (status >= 500) return 'danger';
  return 'neutral';
}

export function protocolLabel(value?: string) {
  if (value === 'openai_completion') return 'OpenAI Completion';
  if (value === 'anthropic') return 'Anthropic';
  if (value === 'codex') return 'Codex';
  return value || '未知';
}

export function maskSecret(value?: string) {
  if (!value) return '未设置';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
