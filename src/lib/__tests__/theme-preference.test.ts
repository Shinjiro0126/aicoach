import { resolveColorScheme } from '../theme-preference';

describe('resolveColorScheme', () => {
  test('system + OSダーク → dark', () => {
    expect(resolveColorScheme('system', 'dark')).toBe('dark');
  });

  test('system + OSライト → light', () => {
    expect(resolveColorScheme('system', 'light')).toBe('light');
  });

  test('system + unspecified/null/undefined → light(既定はライト)', () => {
    expect(resolveColorScheme('system', 'unspecified')).toBe('light');
    expect(resolveColorScheme('system', null)).toBe('light');
    expect(resolveColorScheme('system', undefined)).toBe('light');
  });

  test('light固定 → OS設定に関わらず light', () => {
    expect(resolveColorScheme('light', 'dark')).toBe('light');
    expect(resolveColorScheme('light', 'light')).toBe('light');
  });

  test('dark固定 → OS設定に関わらず dark', () => {
    expect(resolveColorScheme('dark', 'light')).toBe('dark');
    expect(resolveColorScheme('dark', undefined)).toBe('dark');
  });
});
