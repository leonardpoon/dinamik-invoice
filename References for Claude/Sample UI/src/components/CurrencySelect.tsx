import { useState } from 'react';

const PRESET_CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'MYR', 'JPY', 'CNY'];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function CurrencySelect({ value, onChange }: Props) {
  const isCustom = !PRESET_CURRENCIES.includes(value);
  const [custom, setCustom] = useState(isCustom ? value : '');
  const [showCustom, setShowCustom] = useState(isCustom);

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === '__custom__') {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      onChange(e.target.value);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <select value={showCustom ? '__custom__' : value} onChange={handleSelect}>
        <option value="SGD">SGD — Singapore Dollar</option>
        <option value="USD">USD — US Dollar</option>
        <option value="EUR">EUR — Euro</option>
        <option value="GBP">GBP — British Pound</option>
        <option value="MYR">MYR — Malaysian Ringgit</option>
        <option value="JPY">JPY — Japanese Yen</option>
        <option value="CNY">CNY — Chinese Yuan</option>
        <option value="__custom__">Other / Custom…</option>
      </select>
      {showCustom && (
        <input
          value={custom}
          onChange={e => { setCustom(e.target.value.toUpperCase()); onChange(e.target.value.toUpperCase()); }}
          placeholder="e.g. AUD"
          maxLength={10}
          style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12 }}
        />
      )}
    </div>
  );
}
