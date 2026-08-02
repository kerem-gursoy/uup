import { createContext, useContext } from 'react';

export interface User {
    id: number;
    username: string;
}

export interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (user: User) => void;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
}

/**
 * The context and its hook live apart from the provider component so the
 * provider file exports nothing but a component, which is what React Fast
 * Refresh needs to reload it without losing state.
 */
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
