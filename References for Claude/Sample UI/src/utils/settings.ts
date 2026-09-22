const KEY = 'maritime_settings';

export interface AppSettings {
  defaultUnitConversionFactor: number;
  defaultFixedRate: number;
  defaultCurrency: string;
}

const DEFAULTS: AppSettings = {
  defaultUnitConversionFactor: 1.26,
  defaultFixedRate: 54,
  defaultCurrency: 'SGD',
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
