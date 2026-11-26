import { describe, expect, it } from 'vitest';
import { commandSchema, defaultSettings } from '../../packages/contracts/src/index';

describe('desktop write boundary', () => {
  it('rejects empty names, unknown methods and arbitrary settings keys', () => {
    expect(
      commandSchema.safeParse({
        method: 'project.import',
        requestId: crypto.randomUUID(),
        name: '  ',
        path: '/tmp/repo',
      }).success,
    ).toBe(false);
    expect(commandSchema.safeParse({ method: 'shell.exec', command: 'echo unsafe' }).success).toBe(false);
    expect(
      commandSchema.safeParse({
        method: 'settings.save',
        requestId: crypto.randomUUID(),
        expectedVersion: 1,
        values: { ...defaultSettings, token: 'secret' },
      }).success,
    ).toBe(false);
  });
  it('validates settings before persistence and trims a valid project name', () => {
    expect(
      commandSchema.parse({
        method: 'project.import',
        requestId: crypto.randomUUID(),
        name: ' 项目 ',
        path: '/tmp/repo',
      }),
    ).toMatchObject({ name: '项目' });
    for (const fontSize of [0, 11, 25, 12.5]) {
      expect(
        commandSchema.safeParse({
          method: 'settings.save',
          requestId: crypto.randomUUID(),
          expectedVersion: 1,
          values: { ...defaultSettings, fontSize },
        }).success,
      ).toBe(false);
    }
    expect(
      commandSchema.safeParse({
        method: 'settings.save',
        requestId: crypto.randomUUID(),
        expectedVersion: 1,
        values: defaultSettings,
      }).success,
    ).toBe(true);
  });
});
