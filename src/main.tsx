import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { PortalProvider } from '@/contexts/PortalContext'
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
      staleTime:            1000 * 60 * 5,
      retry:                1,
      refetchOnWindowFocus: false,
      refetchOnReconnect:   true,
    },
  },
})

// Provider nesting (outer → inner):
//   ThemeProvider
//     QueryClientProvider
//       LanguageProvider
//         AuthProvider          ← user, role, practitioner, athlete
//           PortalProvider      ← active/archived links (requires useAuth)
//             AthleteProvider   ← v1→v2 shim (requires useAuth + usePortal)
//               AppRouter
//
// AthleteProvider is a transition shim. Once Phases 5–7 rewrite the eight
// v1 athlete pages to use PortalContext directly, this wrapper can go.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider>
            <AuthProvider>
              <PortalProvider>
                <AthleteProvider>
                  <AppRouter />
                </AthleteProvider>
              </PortalProvider>
            </AuthProvider>
          </LanguageProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
