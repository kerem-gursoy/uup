import { Info, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
    const navigate = useNavigate();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
                <p className="text-slate-500">App preferences and information.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-900">About</h3>
                </div>
                <div className="p-4 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold">
                            U
                        </div>
                        <div>
                            <p className="font-medium text-slate-900">UUP</p>
                            <p className="text-xs text-slate-500">v0.1.0 (Mock)</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2 bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                        <Info size={16} className="mt-0.5 shrink-0" />
                        <p>
                            Environment: <strong>Mock / Local only</strong>. Data changes are temporary and will reset on refresh.
                        </p>
                    </div>
                </div>
            </div>

            {/* <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-900">Preferences</h3>
                </div>
                <div className="divide-y divide-slate-100">
                    <div className="p-4 flex items-center justify-between opacity-60 cursor-not-allowed">
                        <div className="flex items-center gap-3">
                            <Moon size={20} className="text-slate-500" />
                            <div>
                                <p className="font-medium text-slate-900">Dark Mode</p>
                                <p className="text-xs text-slate-500">Coming soon</p>
                            </div>
                        </div>
                        <div className="w-11 h-6 bg-slate-200 rounded-full relative">
                            <div className="absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full shadow-sm"></div>
                        </div>
                    </div>

                    <div className="p-4 flex items-center justify-between opacity-60 cursor-not-allowed">
                        <div className="flex items-center gap-3">
                            <WifiOff size={20} className="text-slate-500" />
                            <div>
                                <p className="font-medium text-slate-900">Offline Mode</p>
                                <p className="text-xs text-slate-500">Coming soon</p>
                            </div>
                        </div>
                        <div className="w-11 h-6 bg-slate-200 rounded-full relative">
                            <div className="absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full shadow-sm"></div>
                        </div>
                    </div>
                </div>
            </div> */}

            <button
                onClick={() => navigate('/login')}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
                <LogOut size={20} />
                Sign Out
            </button>

            <p className="text-center text-xs text-slate-400">
                Internal Tool • Authorized Personnel Only
            </p>
        </div>
    );
}
