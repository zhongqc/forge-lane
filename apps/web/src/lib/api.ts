const pendingKeys = new Map<string, string>();
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> {
  const signature = method + path + JSON.stringify(body);
  if (method !== 'GET') {
    key = pendingKeys.get(signature) ?? key ?? crypto.randomUUID();
    pendingKeys.set(signature, key);
  }
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({ message: '服务返回了无效响应' }));
  if (response.status === 401 && path !== '/me' && !path.startsWith('/auth/'))
    window.dispatchEvent(new Event('forge:auth-expired'));
  if (!response.ok)
    throw new ApiError(
      response.status,
      Array.isArray(data.message) ? data.message.join('；') : (data.message ?? '操作失败'),
      data.code,
    );
  pendingKeys.delete(signature);
  return data;
}
