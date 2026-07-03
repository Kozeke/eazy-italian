import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Toaster } from 'react-hot-toast'
import './i18n'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './hooks/useAuth'
import { TeacherClassroomTransitionProvider } from './contexts/TeacherClassroomTransitionContext'
import RouteChangeTracker from './components/analytics/RouteChangeTracker'
import CookieConsent from './components/analytics/CookieConsent'
import { initAnalytics } from './utils/analytics'
import GoogleAuthProvider from './components/auth/GoogleAuthProvider'

// Initialize GA4 before the React tree mounts when VITE_GA_MEASUREMENT_ID is set
initAnalytics()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RouteChangeTracker />
        <AuthProvider>
          <GoogleAuthProvider>
            <TeacherClassroomTransitionProvider>
              <App />
            </TeacherClassroomTransitionProvider>
          </GoogleAuthProvider>
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
            }}
          />
        </AuthProvider>
        <CookieConsent />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
