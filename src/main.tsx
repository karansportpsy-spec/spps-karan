import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { PortalProvider } from '@/contexts/PortalContext'
import { PractitionerProvider } from '@/contexts/PractitionerContext'
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
//         AuthProvider             ← user, role, practitioner, athlete
//           PractitionerProvider   ← active/archived links for practitioners
//           PortalProvider         ← active/archived links for athletes
//             AthleteProvider      ← v1→v2 shim (requires useAuth + usePortal)
//               AppRouter
//
// Both Practitioner and Portal providers are siblings under AuthProvider —
// each is a no-op for the wrong role, so it's safe to mount both.
// AthleteProvider stays inside PortalProvider because it depends on it.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider>
            <AuthProvider>
              <PractitionerProvider>
                <PortalProvider>
                  <AthleteProvider>
                    <AppRouter />
                  </AthleteProvider>
                </PortalProvider>
              </PractitionerProvider>
            </AuthProvider>
          </LanguageProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
