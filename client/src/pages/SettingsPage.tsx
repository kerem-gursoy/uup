import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, ChevronRight, LogOut, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { checkBackend } from '../services/api';
import { useAuth } from '../context/auth-context';
import { Button, Card } from '../components/ui';
import { useT, useLocale } from '../i18n';
import { LANGUAGES, LANGUAGE_NAMES, setLang } from '../i18n/locale';

type Connection = 'checking' | 'online' | 'offline';

export default function SettingsPage() {
    const t = useT();
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
                <h1 className="text-2xl font-bold text-slate-900">{t('settings.title')}</h1>
                <p className="text-slate-500 mt-0.5">{t('settings.subtitle')}</p>
            </div>

            <Card className="overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-900">{t('settings.signedInAs')}</h2>
                </div>
                <div className="p-4 flex items-center gap-3">
                    <div className="w-11 h-11 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-lg">
                        {/* Folded with the Turkish rules, not the interface language's:
                            a username is the shop's own data, and "ismail" has to give
                            İ rather than I. */}
                        {(user?.username ?? '?').charAt(0).toLocaleUpperCase('tr')}
                    </div>
                    <div>
                        <p className="font-medium text-slate-900">
                            {user?.username ?? t('settings.notSignedIn')}
                        </p>
                        <p className="text-sm text-slate-500">{t('settings.appName')}</p>
                    </div>
                </div>
            </Card>

            <LanguageCard />

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
                            <span className="block font-medium text-slate-900">
                                {t('settings.suppliers')}
                            </span>
                            <span className="block text-sm text-slate-500">
                                {t('settings.suppliersHint')}
                            </span>
                        </span>
                    </span>
                    <ChevronRight size={20} className="text-slate-400 shrink-0" />
                </button>
            </Card>

            <Card className="overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-900">{t('settings.connection')}</h2>
                </div>
                <div className="p-4">
                    {connection === 'checking' ? (
                        <p className="text-slate-500">{t('settings.checking')}</p>
                    ) : connection === 'online' ? (
                        <div className="flex items-start gap-3">
                            <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-slate-900">
                                    {t('settings.connected')}
                                </p>
                                <p className="text-sm text-slate-500">
                                    {t('settings.connectedHint')}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start gap-3">
                            <XCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-slate-900">
                                    {t('settings.notConnected')}
                                </p>
                                <p className="text-sm text-slate-500">
                                    {t('settings.notConnectedHint')}
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
                {t('settings.signOut')}
            </Button>

            <p className="text-center text-xs text-slate-400">{t('settings.footer')}</p>
        </div>
    );
}

/**
 * Two buttons rather than a row leading to its own screen: there are only two
 * languages, and someone who has landed in the one they cannot read needs the way
 * back in a single tap, not two.
 *
 * Both names are written in their own language and are never translated, for the
 * same reason - "Türkçe" has to be recognisable from an English screen and
 * "English" from a Turkish one.
 */
function LanguageCard() {
    const t = useT();
    const current = useLocale();

    return (
        <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">{t('settings.language')}</h2>
            </div>
            <div className="p-4">
                <div role="group" aria-label={t('settings.language')} className="flex gap-2">
                    {LANGUAGES.map((lang) => {
                        const active = lang === current;
                        return (
                            <button
                                key={lang}
                                type="button"
                                lang={lang}
                                onClick={() => setLang(lang)}
                                aria-pressed={active}
                                className={clsx(
                                    'flex-1 min-h-[52px] px-4 rounded-xl border text-base font-semibold transition',
                                    'active:scale-[0.98]',
                                    active
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                        : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                                )}
                            >
                                {LANGUAGE_NAMES[lang]}
                            </button>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}
