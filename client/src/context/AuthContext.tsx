import { useState, useEffect, type ReactNode } from 'react';
import { AuthContext, type User } from './auth-context';
import { AUTH_EXPIRED_EVENT, getMe, signOut } from '../services/api';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = async () => {
        try {
            setUser(await getMe());
        } catch (error) {
            console.error('Auth check failed:', error);
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []);

    // If any request comes back unauthenticated, drop the session so the app
    // returns to the sign-in screen instead of leaving the user on a page whose
    // every action quietly fails.
    useEffect(() => {
        const handleExpired = () => setUser(null);
        window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
        return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    }, []);

    const login = (userData: User) => {
        setUser(userData);
    };

    const logout = async () => {
        try {
            await signOut();
        } catch (error) {
            // Even if the server cannot be reached, forget the session locally.
            console.error('Logout failed:', error);
        } finally {
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
}
