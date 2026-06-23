'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/services/api';

interface Account {
  id: string;
  type: 'USER' | 'REPOSITORY' | 'ORGANIZATION';
  username: string;
  displayName?: string;
  avatar?: string;
}

export default function AccountSwitcher() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/v1/switch/accounts');
      const data = res.data;
      setAccounts(data.accounts || []);
      if (data.accounts?.length > 0) {
        setCurrentAccount(data.accounts[0]);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  const switchAccount = async (account: Account) => {
    try {
      await api.post('/v1/switch/account', { accountId: account.id });
      setCurrentAccount(account);
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Failed to switch account:', error);
    }
  };

  if (!currentAccount) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
          {currentAccount.username[0].toUpperCase()}
        </div>
        <div className="text-left">
          <div className="text-sm font-medium">@{currentAccount.username}</div>
          <div className="text-xs text-gray-500">{currentAccount.type}</div>
        </div>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 w-64 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          <div className="p-2">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => switchAccount(account)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 ${
                  currentAccount.id === account.id ? 'bg-gray-100 dark:bg-gray-800' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                  {account.username[0].toUpperCase()}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium">@{account.username}</div>
                  <div className="text-xs text-gray-500">{account.type}</div>
                </div>
                {currentAccount.id === account.id && (
                  <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 p-2">
            <button
              onClick={() => router.push('/claim')}
              className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-blue-600 dark:text-blue-400 font-medium"
            >
              + Claim Repository
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
