'use client';

import { useState } from 'react';

const themes = [
  { id: 'default', name: 'Default', primary: '#3B82F6', secondary: '#8B5CF6' },
  { id: 'sunset', name: 'Sunset', primary: '#F59E0B', secondary: '#EF4444' },
  { id: 'ocean', name: 'Ocean', primary: '#06B6D4', secondary: '#0EA5E9' },
  { id: 'forest', name: 'Forest', primary: '#10B981', secondary: '#059669' },
  { id: 'purple', name: 'Purple', primary: '#8B5CF6', secondary: '#A78BFA' },
  { id: 'pink', name: 'Pink', primary: '#EC4899', secondary: '#F472B6' },
];

export default function ThemeSelector() {
  const [selected, setSelected] = useState('default');

  const handleSelect = (themeId: string) => {
    setSelected(themeId);
    const theme = themes.find(t => t.id === themeId);
    if (theme) {
      document.documentElement.style.setProperty('--color-primary', theme.primary);
      document.documentElement.style.setProperty('--color-secondary', theme.secondary);
      localStorage.setItem('theme', themeId);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      {themes.map(theme => (
        <button
          key={theme.id}
          onClick={() => handleSelect(theme.id)}
          className={`p-4 rounded-lg border-2 ${selected === theme.id ? 'border-blue-500' : 'border-gray-200'}`}
        >
          <div className="flex gap-2 mb-2">
            <div className="w-8 h-8 rounded" style={{ backgroundColor: theme.primary }} />
            <div className="w-8 h-8 rounded" style={{ backgroundColor: theme.secondary }} />
          </div>
          <div className="text-sm font-medium">{theme.name}</div>
        </button>
      ))}
    </div>
  );
}
