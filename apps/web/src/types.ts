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
  tokens: CallLogTokens;
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
