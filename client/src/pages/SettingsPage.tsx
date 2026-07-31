import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, ChevronRight, LogOut, XCircle } from 'lucide-react';
import { checkBackend } from '../services/api';
import { useAuth } from '../context/auth-context';
import { Button, Card } from '../components/ui';

type Connection = 'checking' | 'online' | 'offline';

export default function SettingsPage() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [connection, setConnection] = useState<Connection>('checking');

    useEffect(() => {
        let cancelled = false;

        checkBackend()
            .then(() => !cancelled && setConnection('online'))
            .catch(() => !cancelled && setConnection('offline'));

        return () => {
            cancelled = true;
        };
    }, []);

    const handleSignOut = async () => {
        await logout();
        navigate('/login', { replace: true });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
                <p className="text-slate-500 mt-0.5">Your account and app information.</p>
            </div>

            <Card className="overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-900">Signed in as</h2>
                </div>
                <div className="p-4 flex items-center gap-3">
                    <div className="w-11 h-11 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-lg">
                        {(user?.username ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="font-medium text-slate-900">{user?.username ?? 'Not signed in'}</p>
                        <p className="text-sm text-slate-500">UUP inventory</p>
                    </div>
                </div>
            </Card>

            {/* Supplier management lives here rather than in the bottom bar: it
                is occasional housekeeping, and a sixth nav item would crowd the
                five things staff use every day. */}
            <Card className="overflow-hidden">
                <button
                    type="button"
                    onClick={() => navigate('/suppliers')}
                    className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors min-h-[64px]"
                >
                    <span className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                            <Building2 size={20} />
                        </span>
                        <span>
                            <span className="block font-medium text-slate-900">Suppliers</span>
                            <span className="block text-sm text-slate-500">
                                Add, rename or remove who you buy from
                            </span>
                        </span>
                    </span>
                    <ChevronRight size={20} className="text-slate-400 shrink-0" />
                </button>
            </Card>

            <Card className="overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-900">Connection</h2>
                </div>
                <div className="p-4">
                    {connection === 'checking' ? (
                        <p className="text-slate-500">Checking…</p>
                    ) : connection === 'online' ? (
                        <div className="flex items-start gap-3">
                            <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-slate-900">Connected</p>
                                <p className="text-sm text-slate-500">
                                    Your changes are saved and shared with everyone using this shop.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start gap-3">
                            <XCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-slate-900">Not connected</p>
                                <p className="text-sm text-slate-500">
                                    The app cannot reach the server, so changes will not save. Check your
                                    internet connection and try again.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            <Button
                variant="secondary"
                onClick={handleSignOut}
                icon={<LogOut size={20} />}
                className="w-full"
            >
                Sign out
            </Button>

            <p className="text-center text-xs text-slate-400">Internal tool • Authorised staff only</p>
        </div>
    );
}
