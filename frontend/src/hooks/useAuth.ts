import React, { useState, createContext, useContext, useEffect } from 'react';
import { User } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (userData: any) => Promise<User>;
  logout: () => boolean; // Returns true if logout was performed, false if blocked
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
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      console.log('Attempting login with:', email);
      const response = await authApi.login({ email, password });
      console.log('Login response:', response);
      localStorage.setItem('token', response.access_token);
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
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const logout = (): boolean => {
    // Check if a test is active
    const testActive = sessionStorage.getItem('test_active');
    if (testActive === 'true') {
      // Dispatch custom event to trigger test submission confirmation
      const event = new CustomEvent('logout-attempt');
      window.dispatchEvent(event);
      return false; // Don't logout yet, wait for confirmation
    }
    
    // Normal logout if no test is active
    localStorage.removeItem('token');
    setUser(null);
    return true; // Logout was performed
  };

  // Listen for confirmed logout after test submission
  React.useEffect(() => {
    const handlePerformLogout = () => {
      localStorage.removeItem('token');
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
