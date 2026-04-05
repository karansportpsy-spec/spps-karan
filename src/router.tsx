// src/router.tsx
import React from 'react'
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Spinner } from '@/components/ui'

import LandingPage           from '@/pages/Landing'
import NotFoundPage          from '@/pages/NotFoundPage'
import { LoginPage, SignupPage }                                         from '@/pages/auth/AuthPages'
import { HIPAAPage, UserAgreementPage, TermsPage, DataPrivacyPage }     from '@/pages/compliance/CompliancePages'
import ProfileSetupPage      from '@/pages/auth/ProfileSetupPage'
import DashboardPage         from '@/pages/Dashboard'
import AthletesPage          from '@/pages/athletes/AthletesPage'
import IOCMentalHealthPage   from '@/pages/assessments/IOCMentalHealthPage'
import PsychophysiologyPage  from '@/pages/assessments/PsychophysiologyPage'
import NeurocognitivePage    from '@/pages/assessments/NeurocognitivePage'
import CaseFormulationPage   from '@/pages/athletes/CaseFormulation'
import CustomAssessmentPage  from '@/pages/assessments/CustomAssessmentPage'
import ConsentFormsPage      from '@/pages/consent/ConsentFormsPage'
import InjuryPsychologyPage  from '@/pages/injury/InjuryPsychologyPage'
import MentalPerformanceLabPage from '@/pages/lab/MentalPerformanceLabPage'
import {
  SessionsPage, CheckInsPage, AssessmentsPage,
  InterventionsPage, AIAssistantPage, ReportsPage, SettingsPage,
} from '@/pages/AppPages'

function LoadingScreen({ message = 'Loading SPPS…' }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
      <div className="w-10 h-10 rounded-xl bg-gradient-spps flex items-center justify-center">
        <span className="text-white text-lg font-bold">S</span>
      </div>
      <Spinner size="md" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}

function RequireAuth() {
  const { user, loading, practitioner, profileLoading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />
  // Only block on profileLoading during the INITIAL load (practitioner not yet fetched).
  // If practitioner is already set, a background refresh (tab switch, token refresh)
  // must never replace the current page with a spinner — it just updates silently.
  if (practitioner === null && profileLoading) return <LoadingScreen message="Loading your profile…" />
  if (practitioner === null) return <LoadingScreen message="Loading your profile…" />
  if (!practitioner.compliance_completed) return <Navigate to="/compliance/hipaa" replace />
  return <Outlet />
}

function ComplianceGuard() {
  const { user, loading, practitioner, profileLoading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth/login" replace />
  if (practitioner === null && profileLoading) return <LoadingScreen message="Loading your profile…" />
  if (practitioner === null) return <LoadingScreen message="Loading your profile…" />
  if (practitioner.compliance_completed) return <Navigate to="/profile/setup" replace />
  return <Outlet />
}

function ProfileSetupGuard() {
  const { user, loading, practitioner, profileLoading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth/login" replace />
  if (practitioner === null && profileLoading) return <LoadingScreen message="Loading your profile…" />
  if (practitioner === null) return <LoadingScreen message="Loading your profile…" />
  if (!practitioner.compliance_completed) return <Navigate to="/compliance/hipaa" replace />
  if ((practitioner as any).profile_completed) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, practitioner, profileLoading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user) {
    if (practitioner === null && profileLoading) return <LoadingScreen />
    if (practitioner === null) return <LoadingScreen />
    if (!practitioner.compliance_completed) return <Navigate to="/compliance/hipaa" replace />
    if (!(practitioner as any).profile_completed) return <Navigate to="/profile/setup" replace />
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/auth/login',  element: <RedirectIfAuth><LoginPage  /></RedirectIfAuth> },
  { path: '/auth/signup', element: <RedirectIfAuth><SignupPage /></RedirectIfAuth> },
  {
    path: '/compliance',
    element: <ComplianceGuard />,
    children: [
      { index: true,            element: <Navigate to="hipaa" replace /> },
      { path: 'hipaa',          element: <HIPAAPage /> },
      { path: 'user-agreement', element: <UserAgreementPage /> },
      { path: 'terms',          element: <TermsPage /> },
      { path: 'data-privacy',   element: <DataPrivacyPage /> },
    ],
  },
  {
    path: '/profile',
    element: <ProfileSetupGuard />,
    children: [
      { path: 'setup', element: <ProfileSetupPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/dashboard',                element: <DashboardPage /> },
      { path: '/athletes',                 element: <AthletesPage /> },
      { path: '/athletes/:athleteId/case', element: <CaseFormulationPage /> },
      { path: '/sessions',                 element: <SessionsPage /> },
      { path: '/checkins',                 element: <CheckInsPage /> },
      { path: '/assessments',              element: <AssessmentsPage /> },
      { path: '/assessments/ioc',          element: <IOCMentalHealthPage /> },
      { path: '/assessments/physio',       element: <PsychophysiologyPage /> },
      { path: '/assessments/neuro',        element: <NeurocognitivePage /> },
      { path: '/assessments/custom',       element: <CustomAssessmentPage /> },
      { path: '/interventions',            element: <InterventionsPage /> },
      { path: '/consent',                  element: <ConsentFormsPage /> },
      { path: '/injury',                   element: <InjuryPsychologyPage /> },
      { path: '/lab',                      element: <MentalPerformanceLabPage /> },
      { path: '/ai-assistant',             element: <AIAssistantPage /> },
      { path: '/reports',                  element: <ReportsPage /> },
      { path: '/settings',                 element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
