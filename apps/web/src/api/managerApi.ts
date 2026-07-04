import axios, { AxiosError } from 'axios';
import type {
  CallLogEntry,
  ClientApiKey,
  ErrorResponse,
  InternalModel,
  ManagerConfigResponse,
  PanelSession,
  PayloadConfig,
  Provider,
  SetupRequest,
  SimpleApiConfig,
  UsageItem,
  ValidationResult
} from '@/types';

function trimRight(value: string, char: string) {
  let out = value.trim();
  while (out.endsWith(char)) out = out.slice(0, -1);
  return out;
}

function ensureLeftSlash(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function normalizePanelBase(value: string) {
  return trimRight(value || '', '/');
}

export function normalizeSession(session: PanelSession): PanelSession {
  return {
    panelBase: normalizePanelBase(session.panelBase),
    adminKey: session.adminKey.trim()
  };
}

export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ErrorResponse | ValidationResult>;
    const data = axiosError.response?.data;
    if (data && 'error' in data) {
      const err = data.error;
      if (typeof err === 'string') return err;
      if (err?.message) return err.message;
    }
    if (data && 'valid' in data && data.errors?.length) {
      return data.errors.map((item) => `${item.path}: ${item.message}`).join('\n');
    }
    if (axiosError.message) return axiosError.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function client(session: PanelSession) {
  const normalized = normalizeSession(session);
  return axios.create({
    baseURL: normalized.panelBase || undefined,
    headers: normalized.adminKey
      ? {
          Authorization: `Bearer ${normalized.adminKey}`
        }
      : undefined,
    timeout: 30_000
  });
}

export async function getInfo(panelBase = '') {
  const { data } = await axios.get<{
    service: string;
    mode: string;
    startedAt: number;
    adminReady: boolean;
    configured: boolean;
    setupRequired: boolean;
  }>(`${normalizePanelBase(panelBase)}/api/info`);
  return data;
}

export async function setupSimpleAPI(session: PanelSession, request: SetupRequest) {
  const { data } = await client(session).post<{ ok: boolean; upstream: string }>(
    '/api/setup',
    request
  );
  return data;
}

export async function getManagerConfig(session: PanelSession) {
  const { data } = await client(session).get<ManagerConfigResponse>('/api/manager-config');
  return data;
}

export async function putManagerConfig(session: PanelSession, request: SetupRequest) {
  const { data } = await client(session).put<ManagerConfigResponse>('/api/manager-config', {
    config: {
      simpleApiConnection: request
    }
  });
  return data;
}

function simpleApiClient(session: PanelSession) {
  const normalized = normalizeSession(session);
  return axios.create({
    baseURL: `${normalized.panelBase || ''}/simpleapi/api`,
    headers: {
      Authorization: `Bearer ${normalized.adminKey}`
    },
    timeout: 30_000
  });
}

export async function getConfig(session: PanelSession) {
  const { data } = await simpleApiClient(session).get<SimpleApiConfig>('/config');
  return data;
}

export async function putConfigYaml(session: PanelSession, yamlText: string) {
  const { data } = await simpleApiClient(session).put<ValidationResult>('/config', yamlText, {
    headers: { 'Content-Type': 'application/yaml' }
  });
  return data;
}

export async function validateConfigYaml(session: PanelSession, yamlText: string) {
  const { data } = await simpleApiClient(session).post<ValidationResult>('/validate', yamlText, {
    headers: { 'Content-Type': 'application/yaml' }
  });
  return data;
}

export async function reloadConfig(session: PanelSession) {
  const { data } = await simpleApiClient(session).post<ValidationResult>('/reload');
  return data;
}

export async function getPayload(session: PanelSession) {
  const { data } = await simpleApiClient(session).get<PayloadConfig>('/payload');
  return data;
}

export async function putPayloadYaml(session: PanelSession, yamlText: string) {
  const { data } = await simpleApiClient(session).put<ValidationResult>('/payload', yamlText, {
    headers: { 'Content-Type': 'application/yaml' }
  });
  return data;
}

export async function listProviders(session: PanelSession) {
  const { data } = await simpleApiClient(session).get<{ providers: Provider[] }>('/providers');
  return data.providers ?? [];
}

export async function createProvider(session: PanelSession, provider: Provider) {
  const { data } = await simpleApiClient(session).post<ValidationResult>('/providers', provider);
  return data;
}

export async function updateProvider(session: PanelSession, originalName: string, provider: Provider) {
  const { data } = await simpleApiClient(session).put<ValidationResult>(
    `/providers/${encodeURIComponent(originalName)}`,
    provider
  );
  return data;
}

export async function deleteProvider(session: PanelSession, name: string) {
  await simpleApiClient(session).delete(`/providers/${encodeURIComponent(name)}`);
}

export async function listApiKeys(session: PanelSession) {
  const { data } = await simpleApiClient(session).get<{ api_keys: ClientApiKey[] }>('/api-keys');
  return data.api_keys ?? [];
}

export async function createApiKey(session: PanelSession, item: ClientApiKey) {
  const { data } = await simpleApiClient(session).post<ValidationResult>('/api-keys', item);
  return data;
}

export async function updateApiKey(session: PanelSession, originalName: string, item: ClientApiKey) {
  const { data } = await simpleApiClient(session).put<ValidationResult>(
    `/api-keys/${encodeURIComponent(originalName)}`,
    item
  );
  return data;
}

export async function deleteApiKey(session: PanelSession, name: string) {
  await simpleApiClient(session).delete(`/api-keys/${encodeURIComponent(name)}`);
}

export async function listModels(session: PanelSession) {
  const { data } = await simpleApiClient(session).get<{ models: InternalModel[] }>('/models');
  return data.models ?? [];
}

export async function getUsage(session: PanelSession) {
  const { data } = await simpleApiClient(session).get<{ items: UsageItem[] }>('/usage');
  return data.items ?? [];
}

export async function getCallLog(session: PanelSession, limit = 300) {
  const { data } = await simpleApiClient(session).get<{ items: CallLogEntry[] | null }>(
    '/call-log',
    {
      params: { limit }
    }
  );
  return data.items ?? [];
}

export function fieldPath(path: string) {
  return ensureLeftSlash(path);
}
