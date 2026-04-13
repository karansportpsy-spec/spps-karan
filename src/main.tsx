import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { AthleteProvider } from '@/contexts/AthleteContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import ErrorBoundary from '@/components/ErrorBoundary'
import AppRouter from '@/router'
// @ts-ignore: allow CSS side-effect import without type declarations
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            1000 * 60 * 5,   // FIX: 5 min (was 2 min — caused constant refetches)
      retry:                1,
      refetchOnWindowFocus: false,            // FIX: stop "reload" when switching tabs
      refetchOnReconnect:   true,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider>
            <AuthProvider>
              <AthleteProvider>
                <AppRouter />
              </AthleteProvider>
            </AuthProvider>
          </LanguageProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
