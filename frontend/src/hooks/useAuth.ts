import React, { useState, createContext, useContext, useEffect } from 'react';
import { User } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (userData: any) => Promise<void>;
  logout: () => void;
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
      const newUser = await authApi.register(userData);
      setUser(newUser);
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

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
