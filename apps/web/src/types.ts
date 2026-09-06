export type Protocol = 'anthropic' | 'openai_completion' | 'codex';

export interface ServerConfig {
  listen?: string;
  request_timeout_seconds?: number;
  stream_idle_timeout_seconds?: number;
}

export interface ProxyConfig {
  max_consecutive_failures?: number;
  failure_reset_seconds?: number;
  rewrite_response_model?: boolean;
  usage_statistics_enabled?: boolean;
  upstream_retry_status_codes?: number[];
  call_log_max_entries?: number;
}

export interface ManagementConfig {
  enabled?: boolean;
  base_path?: string;
  admin_key?: string;
}

export interface WebSearchForward {
  enabled: boolean;
  target_model?: string;
}

export interface ProviderModel {
  model: string;
  aliasA?: string;
  anthropic_web_search_forward?: WebSearchForward;
}

export interface Provider {
  name: string;
  type: Protocol;
  url: string;
  key?: string;
  headers?: Record<string, string>;
  // Max in-flight upstream requests for this provider; 0 (or unset) = unlimited.
  max_concurrency?: number;
  models?: ProviderModel[];
}

export interface ClientModel {
  model: string;
  aliasB?: string;
  priority?: number;
}

export interface ClientApiKey {
  name: string;
  key: string;
  enabled?: boolean;
  allowed_protocols: Protocol[];
  models: ClientModel[];
}

export interface PayloadModelRule {
  name: string;
  protocol?: Protocol;
  'from-protocol'?: Protocol;
  headers?: Record<string, string>;
  match?: Array<Record<string, unknown>>;
  'not-match'?: Array<Record<string, unknown>>;
  exist?: string[];
  'not-exist'?: string[];
}

export interface PayloadRule {
  models: PayloadModelRule[];
  params: Record<string, unknown>;
}

export interface PayloadFilterRule {
  models: PayloadModelRule[];
  params: string[];
}

export interface PayloadConfig {
  default?: PayloadRule[];
  'default-raw'?: PayloadRule[];
  override?: PayloadRule[];
  'override-raw'?: PayloadRule[];
  filter?: PayloadFilterRule[];
}

export interface SimpleApiConfig {
  version?: number;
  server?: ServerConfig;
  proxy?: ProxyConfig;
  management?: ManagementConfig;
  payload?: PayloadConfig;
  providers?: Provider[];
  api_keys?: ClientApiKey[];
}

export interface InternalModel {
  id: string;
  provider: string;
  provider_type: Protocol;
  aliasA: string;
  upstream_model: string;
}

export interface UsageItem {
  provider: string;
  provider_type?: Protocol;
  aliasA: string;
  upstream_model: string;
  internal_model: string;
  source_protocol: Protocol;
  target_provider_type?: Protocol;
  http_status: number;
  requests: number;
  failures: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
}

export interface CallLogTokens {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
}

export interface CallLogEntry {
  request_id: string;
  timestamp: string;
  endpoint: string;
  api_key: string;
  source_protocol: Protocol | string;
  alias: string;
  provider: string;
  provider_type?: Protocol | string;
  model: string;
  internal_model: string;
  http_status: number;
  latency_ms: number;
  failed: boolean;
  error?: string;
  tokens: CallLogTokens;
}

export interface CallLogResponse {
  items: CallLogEntry[];
  persisted?: boolean;
  syncError?: string;
  // Keyset cursor for the next (older) page; empty when nothing older is left.
  nextCursor: string;
}

// A time-based price multiplier for one model. Weekdays is 0-6 (0=Sunday);
// empty means every day. StartHour/EndHour form a half-open [start, end) range
// in 0..24; start>=end wraps across midnight. Multiplier defaults to 1.
export interface RateRule {
  name?: string;
  weekdays?: number[];
  start_hour: number;
  end_hour: number;
  multiplier: number;
}

// Model pricing (credits per 1M tokens) keyed by internal_model (provider/aliasA).
// Each price field maps to one token category; unset/0 contributes nothing.
export interface ModelPrice {
  internal_model: string;
  input_price: number;
  output_price: number;
  cache_read_price: number;
  cache_creation_price: number;
  cached_price: number;
  reasoning_price: number;
  rate_rules?: RateRule[];
  updated_at_ms?: number;
}

// UsageControl is a spend-limit config tied to an api-key. The id is the stable
// identity; api_key_name/api_key_value are editable references. usage_5h/week
// are live computed credits, populated only on list responses.
export interface UsageControl {
  id: string;
  api_key_name: string;
  api_key_value?: string;
  limit_5h: number;
  limit_week: number;
  auto_disabled: boolean;
  disable_reason?: string;
  created_at_ms?: number;
  updated_at_ms?: number;
  usage_5h?: number;
  usage_week?: number;
}

export interface QuotaWindow {
  used: number;
  available: number;
  limit: number;
  tokens: CallLogTokens;
}

export interface QuotaRecentItem {
  model: string;
  protocol: string;
  http_status: number;
  failed: boolean;
  time: string;
  duration_ms: number;
  tokens: CallLogTokens;
}

export interface QuotaResponse {
  configured: boolean;
  api_key_name?: string;
  limit_5h?: number;
  limit_week?: number;
  usage_5h?: QuotaWindow;
  usage_week?: QuotaWindow;
  recent?: QuotaRecentItem[];
}

export interface ValidationError {
  path: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ErrorResponse {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

export interface PanelSession {
  panelBase: string;
  adminKey: string;
}

export interface SetupRequest {
  simpleApiBaseUrl: string;
  basePath?: string;
  managementKey: string;
}

export interface PublicSimpleApiConnection {
  baseUrl: string;
  basePath: string;
  managementKey?: string;
  managementKeySet: boolean;
  updatedAtMs?: number;
}

export interface ManagerConfigResponse {
  config: {
    simpleApiConnection: PublicSimpleApiConnection;
  };
  configured?: boolean;
  source?: string;
}
