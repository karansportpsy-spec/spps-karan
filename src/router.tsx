import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Spinner } from '@/components/ui'

import LandingPage      from '@/pages/Landing'
import NotFoundPage     from '@/pages/NotFoundPage'
import { LoginPage, SignupPage }                                         from '@/pages/auth/AuthPages'
import { HIPAAPage, UserAgreementPage, TermsPage, DataPrivacyPage }     from '@/pages/compliance/CompliancePages'
import DashboardPage    from '@/pages/Dashboard'
import AthletesPage     from '@/pages/athletes/AthletesPage'
import IOCMentalHealthPage   from '@/pages/assessments/IOCMentalHealthPage'
import PsychophysiologyPage  from '@/pages/assessments/PsychophysiologyPage'
import NeurocognitivePage    from '@/pages/assessments/NeurocognitivePage'
import CaseFormulationPage     from '@/pages/athletes/CaseFormulation'
import CustomAssessmentPage    from '@/pages/assessments/CustomAssessmentPage'
import ConsentFormsPage        from '@/pages/consent/ConsentFormsPage'
import InjuryPsychologyPage    from '@/pages/injury/InjuryPsychologyPage'
import ProfileSetupPage        from '@/pages/auth/ProfileSetupPage'
import {
  SessionsPage, CheckInsPage, AssessmentsPage,
  InterventionsPage, AIAssistantPage, ReportsPage, SettingsPage,
} from '@/pages/AppPages'

// ── Auth guard ─────────────────────────────────────────────────
function RequireAuth() {
  const { user, loading, practitioner } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-spps flex items-center justify-center">
          <span className="text-white text-lg font-bold">S</span>
        </div>
        <Spinner size="md" />
        <p className="text-sm text-gray-400">Loading SPPS…</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />

  const complianceDone  = practitioner?.compliance_completed === true
  const onCompliancePage = location.pathname.startsWith('/compliance')

  if (!complianceDone && !onCompliancePage) return <Navigate to="/compliance/hipaa" replace />

  return <Outlet />
}

// ── Redirect if already authed ─────────────────────────────────
function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, practitioner } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  )
  if (user) return <Navigate to={practitioner?.compliance_completed ? '/dashboard' : '/compliance/hipaa'} replace />
  return <>{children}</>
}

const router = createBrowserRouter([
  // Public
  { path: '/',             element: <LandingPage /> },
  { path: '/auth/login',   element: <RedirectIfAuth><LoginPage  /></RedirectIfAuth> },
  { path: '/auth/signup',  element: <RedirectIfAuth><SignupPage /></RedirectIfAuth> },

  // Compliance (authenticated, pre-compliance)
  {
    path: '/compliance',
    element: <RequireAuth />,
    children: [
      { path: 'hipaa',          element: <HIPAAPage /> },
      { path: 'user-agreement', element: <UserAgreementPage /> },
      { path: 'terms',          element: <TermsPage /> },
      { path: 'data-privacy',   element: <DataPrivacyPage /> },
    ],
  },

  // Protected app
  {
    element: <RequireAuth />,
    children: [
      { path: '/dashboard',     element: <DashboardPage /> },
      { path: '/profile/setup',  element: <ProfileSetupPage /> },
      { path: '/athletes',      element: <AthletesPage /> },
      { path: '/athletes/:athleteId/case', element: <CaseFormulationPage /> },
      { path: '/sessions',      element: <SessionsPage /> },
      { path: '/checkins',      element: <CheckInsPage /> },
      { path: '/assessments',        element: <AssessmentsPage /> },
      { path: '/assessments/ioc',    element: <IOCMentalHealthPage /> },
      { path: '/assessments/physio', element: <PsychophysiologyPage /> },
      { path: '/assessments/neuro',  element: <NeurocognitivePage /> },
      { path: '/assessments/custom', element: <CustomAssessmentPage /> },
      { path: '/interventions', element: <InterventionsPage /> },
      { path: '/consent',       element: <ConsentFormsPage /> },
      { path: '/injury',        element: <InjuryPsychologyPage /> },
      { path: '/ai-assistant',  element: <AIAssistantPage /> },
      { path: '/reports',       element: <ReportsPage /> },
      { path: '/settings',      element: <SettingsPage /> },
    ],
  },

  // 404
  { path: '*', element: <NotFoundPage /> },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
