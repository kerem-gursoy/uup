import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Package, ScanLine, FileText, Settings, User } from 'lucide-react';
import clsx from 'clsx';

export default function Layout() {
    const location = useLocation();
    const isLoginPage = location.pathname === '/login';

    if (isLoginPage) {
        return <Outlet />;
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 md:pb-0">
            {/* Top Bar */}
            <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 shadow-sm z-50 flex items-center justify-between px-4 md:px-8">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                        U
                    </div>
                    <h1 className="text-lg font-bold text-slate-900">UUP</h1>
                </div>
                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                    <User size={20} />
                </div>
            </header>

            {/* Main Content */}
            <main className="pt-24 min-h-screen max-w-5xl mx-auto px-4 md:px-8 pb-6">
                <Outlet />
            </main>

            {/* Bottom Navigation (Mobile) */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 md:hidden z-50 safe-area-bottom">
                <div className="flex justify-around items-center h-16">
                    <NavItem to="/" icon={<Home size={24} />} label="Home" />
                    <NavItem to="/products" icon={<Package size={24} />} label="Products" />
                    <NavItem to="/scan" icon={<ScanLine size={24} />} label="Scan" />
                    <NavItem to="/invoices/upload" icon={<FileText size={24} />} label="Invoices" />
                    <NavItem to="/settings" icon={<Settings size={24} />} label="Settings" />
                </div>
            </nav>
        </div>
    );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                clsx(
                    "flex flex-col items-center justify-center w-full h-full gap-1 text-xs font-medium transition-colors",
                    isActive ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
                )
            }
        >
            {icon}
            <span>{label}</span>
        </NavLink>
    );
}
