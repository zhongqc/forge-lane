import { expect, type APIRequestContext } from '@playwright/test';
// Production deliberately limits auth attempts per IP. Only a confirmed 429 is safe to retry.
export async function register(
  request: APIRequestContext,
  data: { email: string; password: string; name: string },
) {
  const deadline = Date.now() + 65000;
  for (;;) {
    const response = await request.post('/api/auth/register', { data });
    if (response.status() !== 429 || Date.now() >= deadline) {
      expect(response.status(), 'Test account registration must succeed before using its session').toBe(201);
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
