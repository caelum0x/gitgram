'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import api from '@/services/api';
import { useToast } from '@/components/ui/toast';
import { getErrorMessage } from '@/utils/error';

export default function TwoFactorPage() {
    const { user } = useAuthStore();
    const { showToast } = useToast();
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [showSetup, setShowSetup] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [secret, setSecret] = useState('');
    const [verifyToken, setVerifyToken] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState('');

    useEffect(() => {
        check2FAStatus();
    }, []);

    const check2FAStatus = async () => {
        try {
            const response = await api.get('/auth/2fa/status');
            setTwoFactorEnabled(response.data.enabled);
        } catch (error) {
            console.error('Failed to check 2FA status:', error);
        }
    };

    const handleSetup2FA = async () => {
        setLoading(true);
        try {
            const response = await api.post('/auth/2fa/setup');
            setQrCode(response.data.qrCode);
            setSecret(response.data.secret);
            setShowSetup(true);
            showToast('Scan the QR code with your authenticator app', 'success');
        } catch (error: unknown) {
            showToast(getErrorMessage(error), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify2FA = async () => {
        if (!verifyToken) {
            showToast('Please enter the verification code', 'error');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/auth/2fa/verify', { token: verifyToken });
            setBackupCodes(response.data.backupCodes);
            setTwoFactorEnabled(true);
            setShowSetup(false);
            showToast('2FA enabled successfully!', 'success');
        } catch (error: unknown) {
            showToast(getErrorMessage(error), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDisable2FA = async () => {
        if (!password) {
            showToast('Please enter your password', 'error');
            return;
        }

        setLoading(true);
        try {
            await api.post('/auth/2fa/disable', { password });
            setTwoFactorEnabled(false);
            setPassword('');
            showToast('2FA disabled successfully', 'success');
        } catch (error: unknown) {
            showToast(getErrorMessage(error), 'error');
        } finally {
            setLoading(false);
        }
    };

    const copyBackupCodes = () => {
        navigator.clipboard.writeText(backupCodes.join('\n'));
        showToast('Backup codes copied to clipboard', 'success');
    };

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold mb-6">Two-Factor Authentication</h1>

                {/* 2FA Status Card */}
                <div className="bg-card rounded-lg border border-border p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-semibold">Authentication Status</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Add an extra layer of security to your account
                            </p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${twoFactorEnabled
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                            }`}>
                            {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                        </div>
                    </div>

                    {!twoFactorEnabled && !showSetup && (
                        <button
                            onClick={handleSetup2FA}
                            disabled={loading}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                        >
                            {loading ? 'Setting up...' : 'Enable 2FA'}
                        </button>
                    )}

                    {twoFactorEnabled && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Your account is protected with two-factor authentication
                            </p>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium">
                                    Enter your password to disable 2FA
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                                <button
                                    onClick={handleDisable2FA}
                                    disabled={loading}
                                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                                >
                                    {loading ? 'Disabling...' : 'Disable 2FA'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Setup Modal */}
                {showSetup && (
                    <div className="bg-card rounded-lg border border-border p-6">
                        <h3 className="text-lg font-semibold mb-4">Setup Two-Factor Authentication</h3>

                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-muted-foreground mb-4">
                                    1. Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                                </p>
                                {qrCode && (
                                    <div className="flex justify-center mb-4">
                                        <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                                    </div>
                                )}
                                <p className="text-sm text-muted-foreground mb-2">
                                    Or enter this code manually:
                                </p>
                                <code className="block p-2 bg-secondary rounded text-sm font-mono break-all">
                                    {secret}
                                </code>
                            </div>

                            <div>
                                <p className="text-sm text-muted-foreground mb-2">
                                    2. Enter the 6-digit code from your authenticator app
                                </p>
                                <input
                                    type="text"
                                    value={verifyToken}
                                    onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-center text-2xl tracking-widest"
                                    maxLength={6}
                                />
                            </div>

                            <div className="flex space-x-2">
                                <button
                                    onClick={handleVerify2FA}
                                    disabled={loading || verifyToken.length !== 6}
                                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {loading ? 'Verifying...' : 'Verify & Enable'}
                                </button>
                                <button
                                    onClick={() => setShowSetup(false)}
                                    className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Backup Codes */}
                {backupCodes.length > 0 && (
                    <div className="bg-card rounded-lg border border-border p-6 mt-6">
                        <h3 className="text-lg font-semibold mb-2">Backup Codes</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Save these codes in a safe place. Each code can be used once if you lose access to your authenticator app.
                        </p>
                        <div className="bg-secondary p-4 rounded-lg mb-4">
                            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                                {backupCodes.map((code, index) => (
                                    <div key={index}>{code}</div>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={copyBackupCodes}
                            className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80"
                        >
                            Copy Codes
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
