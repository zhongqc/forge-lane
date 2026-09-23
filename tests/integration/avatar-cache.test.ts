import { afterEach, expect, it, vi } from 'vitest';
import { AvatarCache } from '../../apps/server/src/modules/storage/avatar-cache.service';
afterEach(() => vi.restoreAllMocks());
it('coalesces concurrent reads, expires entries and retries failed reads', async () => {
  const cache = new AvatarCache();
  const loader = vi.fn(async () => Buffer.from('avatar'));
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const [one, two] = await Promise.all([cache.get('a', loader), cache.get('a', loader)]);
  expect(one).toBe(two);
  expect(loader).toHaveBeenCalledTimes(1);
  await cache.get('a', loader);
  expect(loader).toHaveBeenCalledTimes(1);
  clock.mockReturnValue(601001);
  await cache.get('a', loader);
  expect(loader).toHaveBeenCalledTimes(2);
  loader.mockRejectedValueOnce(new Error('offline'));
  await expect(cache.get('b', loader)).rejects.toThrow('offline');
  await cache.get('b', loader);
  expect(loader).toHaveBeenCalledTimes(4);
});
it('evicts the least recently read image when its entry bound is reached', async () => {
  const cache = new AvatarCache();
  const loader = vi.fn(async () => Buffer.from('avatar'));
  for (let index = 0; index < 256; index++) await cache.get(String(index), loader);
  await cache.get('0', loader);
  await cache.get('256', loader);
  await cache.get('0', loader);
  expect(loader).toHaveBeenCalledTimes(257);
  await cache.get('1', loader);
  expect(loader).toHaveBeenCalledTimes(258);
});
it('bounds total cached bytes independently of entry count', async () => {
  const cache = new AvatarCache();
  const loader = vi.fn(async () => Buffer.alloc(17 * 1024 * 1024));
  await cache.get('a', loader);
  await cache.get('b', loader);
  await cache.get('a', loader);
  expect(loader).toHaveBeenCalledTimes(3);
});
