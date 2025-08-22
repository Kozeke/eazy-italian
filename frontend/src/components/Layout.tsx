import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { Link, useLocation } from 'react-router-dom';
import { Home, BookOpen, ClipboardList, FileText, User, Menu, X } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navigation = [
    { name: t('nav.dashboard'), href: '/dashboard', icon: Home },
    { name: t('nav.units'), href: '/units', icon: BookOpen },
    { name: t('nav.tasks'), href: '/tasks', icon: ClipboardList },
    { name: t('nav.tests'), href: '/tests', icon: FileText },
    { name: t('nav.profile'), href: '/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-semibold text-gray-900">
                Eazy Italian
              </h1>
              
              {/* Navigation Menu */}
              {user && (
                <div className="hidden md:flex items-center space-x-1">
                  {navigation.map((item) => {
                    const isActive = location.pathname === item.href;
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                          isActive
                            ? 'bg-primary-100 text-primary-700'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <item.icon className="h-4 w-4 mr-2" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            
            {user && (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-700">
                  {user.first_name} {user.last_name}
                </span>
                <button
                  onClick={logout}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  {t('nav.logout')}
                </button>
                
                {/* Mobile menu button */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                >
                  {mobileMenuOpen ? (
                    <X className="h-6 w-6" />
                  ) : (
                    <Menu className="h-6 w-6" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Mobile menu */}
        {user && mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 text-base font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center">
                      <item.icon className="h-5 w-5 mr-3" />
                      {item.name}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
