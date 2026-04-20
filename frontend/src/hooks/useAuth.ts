/**
 * useAuth.ts
 *
 * Central auth context provider that manages current user session state and role helpers.
 */
import React, { useState, createContext, useContext, useEffect, useCallback } from 'react';
import { User } from '../types';
import { authApi } from '../services/api';
import i18n, { normalizeInterfaceLanguage } from '../i18n';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (userData: any) => Promise<User>;
  logout: () => Promise<boolean>; // Returns true if logout was performed, false if blocked
  // Reloads /users/me into context after profile updates or external changes.
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isTeacher: boolean;
  isStudent: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const currentUser = await authApi.getCurrentUser();
          setUser(currentUser);
        } catch (error) {
          console.error('Failed to get current user:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  // Re-fetches the current user from the API when local state may be stale.
  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, []);

  // Keeps app-wide interface language aligned with the locale persisted on the authenticated user.
  useEffect(() => {
    if (!user?.locale) {
      return;
    }
    // Converts backend/user locale into a language code that is supported by i18next resources.
    const normalizedLocale = normalizeInterfaceLanguage(user.locale);
    if (normalizedLocale !== i18n.language) {
      i18n.changeLanguage(normalizedLocale).catch((error) => {
        console.error('Failed to change interface language:', error);
      });
    }
  }, [user?.locale]);

  const login = async (email: string, password: string) => {
    try {
      console.log('Attempting login with:', email);
      const response = await authApi.login({ email, password });
      console.log('Login response:', response);
      localStorage.setItem('token', response.access_token);
      if (response.refresh_token) {
        localStorage.setItem('refresh_token', response.refresh_token);
      }
      const currentUser = await authApi.getCurrentUser();
      console.log('Current user:', currentUser);
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const register = async (userData: any) => {
    try {
      await authApi.register(userData);
      // Automatically log in the user after registration
      const response = await authApi.login({ 
        email: userData.email, 
        password: userData.password 
      });
      localStorage.setItem('token', response.access_token);
      if (response.refresh_token) {
        localStorage.setItem('refresh_token', response.refresh_token);
      }
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const logout = async (): Promise<boolean> => {
    // Check if a test is active
    const testActive = sessionStorage.getItem('test_active');
    if (testActive === 'true') {
      // Dispatch custom event to trigger test submission confirmation
      const event = new CustomEvent('logout-attempt');
      window.dispatchEvent(event);
      return false; // Don't logout yet, wait for confirmation
    }
    
    // Call logout API endpoint BEFORE clearing tokens (non-blocking - logout should work even if it fails)
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await authApi.logout();
      } catch (error) {
        // Continue with logout even if API call fails (token might be expired/invalid)
        console.error('Logout API call failed:', error);
      }
    }
    
    // Normal logout if no test is active
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    return true; // Logout was performed
  };

  // Listen for confirmed logout after test submission
  React.useEffect(() => {
    const handlePerformLogout = async () => {
      // Call logout API endpoint (non-blocking)
      authApi.logout().catch((error) => {
        console.error('Logout API call failed:', error);
      });
      
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      setUser(null);
      // Clear test state
      sessionStorage.removeItem('test_active');
      sessionStorage.removeItem('test_id');
      // Navigate to login page
      window.location.href = '/login';
    };

    window.addEventListener('perform-logout', handlePerformLogout);
    return () => {
      window.removeEventListener('perform-logout', handlePerformLogout);
    };
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    refreshUser,
    isAuthenticated: !!user,
    isTeacher: user?.role === 'teacher',
    isStudent: user?.role === 'student',
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
