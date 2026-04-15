// src/router.tsx
import React from 'react'
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom'

import { Spinner } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { getAthleteAccessToken } from '@/lib/apiClient'
import { getStoredAthleteProfile } from '@/services/athletePortalApi'

import LandingPage from '@/pages/Landing'
import NotFoundPage from '@/pages/NotFoundPage'
import { LoginPage, SignupPage } from '@/pages/auth/AuthPages'
import { HIPAAPage, UserAgreementPage, TermsPage, DataPrivacyPage } from '@/pages/compliance/CompliancePages'
import ProfileSetupPage from '@/pages/auth/ProfileSetupPage'

const DashboardPage = React.lazy(() => import('@/pages/Dashboard'))
const AthletesPage = React.lazy(() => import('@/pages/athletes/AthletesPage'))
const IOCMentalHealthPage = React.lazy(() => import('@/pages/assessments/IOCMentalHealthPage'))
const PsychophysiologyPage = React.lazy(() => import('@/pages/assessments/PsychophysiologyPage'))
const NeurocognitivePage = React.lazy(() => import('@/pages/assessments/NeurocognitivePage'))
const CaseFormulationPage = React.lazy(() => import('@/pages/athletes/CaseFormulation'))
const CustomAssessmentPage = React.lazy(() => import('@/pages/assessments/CustomAssessmentPage'))
const ConsentFormsPage = React.lazy(() => import('@/pages/consent/ConsentFormsPage'))
const InjuryPsychologyPage = React.lazy(() => import('@/pages/injury/InjuryPsychologyPage'))
const MentalPerformanceLabPage = React.lazy(() => import('@/pages/lab/MentalPerformanceLabPage'))
const ProgramBuilderPage = React.lazy(() => import('@/pages/programs/ProgramBuilderPage'))
const ConversationsPage = React.lazy(() => import('@/pages/conversations/ConversationsPage'))
const SessionsPage = React.lazy(() => import('@/pages/sessions/SessionsPage'))
const CheckInsPage = React.lazy(() => import('@/pages/checkins/CheckInsPage'))
const AssessmentsPage = React.lazy(() => import('@/pages/assessments/AssessmentsPage'))
const InterventionsPage = React.lazy(() => import('@/pages/interventions/InterventionsPage'))
const AIAssistantPage = React.lazy(() => import('@/pages/ai/AIAssistantPage'))
const ReportsPage = React.lazy(() => import('@/pages/reports/ReportsPage'))
const SettingsPage = React.lazy(() => import('@/pages/settings/SettingsPage'))
const ChatPage = React.lazy(() => import('@/pages/chat/ChatPage'))
const AthleteLoginPage = React.lazy(() => import('@/pages/athlete/AthleteLoginPage'))
const AthletePortalPage = React.lazy(() => import('@/pages/athlete/AthletePortalPage'))
const AcceptInvitePage = React.lazy(() => import('@/pages/athletes/AcceptInvitePage'))
const AthleteDashboard = React.lazy(() => import('@/pages/athletes/AthleteDashboard'))
const AthleteMessagesPage = React.lazy(() => import('@/pages/athletes/AthleteMessagesPage'))
const AthleteProgramPage = React.lazy(() => import('@/pages/athletes/AthleteProgramPage'))
const AthleteProgramsListPage = React.lazy(() => import('@/pages/athletes/AthleteProgramsListPage'))
const AthleteProgressPage = React.lazy(() => import('@/pages/athletes/AthleteProgressPage'))
const AthleteDailyLogPage = React.lazy(() => import('@/pages/athletes/AthleteDailyLogPage'))
const AthleteRequestsPage = React.lazy(() => import('@/pages/athletes/AthleteRequestsPage'))
const AthleteJournalPage = React.lazy(() => import('@/pages/athletes/AthleteJournalPage'))
const AthleteCompetitionPage = React.lazy(() => import('@/pages/athletes/AthleteCompetitionPage'))

function LoadingScreen({ message = 'Loading SPPS...' }: { message?: string }) {
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

function routeElement(page: React.ReactElement, message = 'Loading page...') {
  return (
    <React.Suspense fallback={<LoadingScreen message={message} />}>
      {page}
    </React.Suspense>
  )
}

function RequireAuth() {
  const { user, loading, practitioner, profileLoading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />
  if (user.user_metadata?.role === 'athlete') return <Navigate to="/athlete/dashboard" replace />
  if (profileLoading) return <LoadingScreen message="Loading your profile..." />
  if (practitioner === null) return <Navigate to="/auth/login" state={{ from: location }} replace />
  if (!practitioner.compliance_completed) return <Navigate to="/compliance/hipaa" replace />

  return <Outlet />
}

function ComplianceGuard() {
  const { user, loading, practitioner, profileLoading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth/login" replace />
  if (profileLoading) return <LoadingScreen message="Loading your profile..." />
  if (practitioner === null) return <Navigate to="/auth/login" replace />
  if (practitioner.compliance_completed) return <Navigate to="/profile/setup" replace />

  return <Outlet />
}

function ProfileSetupGuard() {
  const { user, loading, practitioner, profileLoading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth/login" replace />
  if (profileLoading) return <LoadingScreen message="Loading your profile..." />
  if (practitioner === null) return <Navigate to="/auth/login" replace />
  if (!practitioner.compliance_completed) return <Navigate to="/compliance/hipaa" replace />
  if (practitioner.profile_completed) return <Navigate to="/dashboard" replace />

  return <Outlet />
}

function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, practitioner, profileLoading } = useAuth()

  if (loading) return <LoadingScreen />
  if (user) {
    if (user.user_metadata?.role === 'athlete') return <Navigate to="/athlete/dashboard" replace />
    if (profileLoading) return <LoadingScreen />
    if (practitioner === null) return <>{children}</>
    if (!practitioner.compliance_completed) return <Navigate to="/compliance/hipaa" replace />
    if (!practitioner.profile_completed) return <Navigate to="/profile/setup" replace />
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function RequireAthlete() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen message="Loading Athlete Portal..." />
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />
  if (user.user_metadata?.role !== 'athlete') return <Navigate to="/dashboard" replace />

  return <Outlet />
}

function RequireAthletePortalAuth() {
  const token = getAthleteAccessToken()
  const profile = getStoredAthleteProfile()

  if (!token || !profile) return <Navigate to="/athlete/login" replace />
  return <Outlet />
}

function RedirectIfAthletePortalAuth({ children }: { children: React.ReactNode }) {
  const token = getAthleteAccessToken()
  const profile = getStoredAthleteProfile()

  if (token && profile) return <Navigate to="/athlete/portal" replace />
  return <>{children}</>
}

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/auth/login', element: <RedirectIfAuth><LoginPage /></RedirectIfAuth> },
  { path: '/auth/signup', element: <RedirectIfAuth><SignupPage /></RedirectIfAuth> },
  { path: '/athlete/accept-invite', element: routeElement(<AcceptInvitePage />, 'Loading invite page...') },
  {
    path: '/athlete/login',
    element: (
      <RedirectIfAthletePortalAuth>
        {routeElement(<AthleteLoginPage />, 'Loading athlete login...')}
      </RedirectIfAthletePortalAuth>
    ),
  },
  {
    path: '/athlete',
    element: <RequireAthletePortalAuth />,
    children: [
      { path: 'portal', element: routeElement(<AthletePortalPage />, 'Loading athlete portal...') },
    ],
  },
  {
    path: '/compliance',
    element: <ComplianceGuard />,
    children: [
      { index: true, element: <Navigate to="hipaa" replace /> },
      { path: 'hipaa', element: <HIPAAPage /> },
      { path: 'user-agreement', element: <UserAgreementPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: 'data-privacy', element: <DataPrivacyPage /> },
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
      { path: '/dashboard', element: routeElement(<DashboardPage />, 'Loading dashboard...') },
      { path: '/athletes', element: routeElement(<AthletesPage />, 'Loading athletes...') },
      { path: '/athletes/:athleteId/case', element: routeElement(<CaseFormulationPage />, 'Loading case formulation...') },
      { path: '/sessions', element: routeElement(<SessionsPage />, 'Loading sessions...') },
      { path: '/checkins', element: routeElement(<CheckInsPage />, 'Loading check-ins...') },
      { path: '/assessments', element: routeElement(<AssessmentsPage />, 'Loading assessments...') },
      { path: '/assessments/ioc', element: routeElement(<IOCMentalHealthPage />, 'Loading mental health...') },
      { path: '/assessments/physio', element: routeElement(<PsychophysiologyPage />, 'Loading psychophysiology...') },
      { path: '/assessments/neuro', element: routeElement(<NeurocognitivePage />, 'Loading neurocognitive...') },
      { path: '/assessments/custom', element: routeElement(<CustomAssessmentPage />, 'Loading custom assessment...') },
      { path: '/interventions', element: routeElement(<InterventionsPage />, 'Loading interventions...') },
      { path: '/programs', element: routeElement(<ProgramBuilderPage />, 'Loading programs...') },
      { path: '/chat', element: routeElement(<ChatPage />, 'Loading chat...') },
      { path: '/consent', element: routeElement(<ConsentFormsPage />, 'Loading consent forms...') },
      { path: '/injury', element: routeElement(<InjuryPsychologyPage />, 'Loading injury psychology...') },
      { path: '/lab', element: routeElement(<MentalPerformanceLabPage />, 'Loading lab tools...') },
      { path: '/ai-assistant', element: routeElement(<AIAssistantPage />, 'Loading AI assistant...') },
      { path: '/reports', element: routeElement(<ReportsPage />, 'Loading reports...') },
      { path: '/settings', element: routeElement(<SettingsPage />, 'Loading settings...') },
      { path: '/conversations', element: routeElement(<ConversationsPage />, 'Loading conversations...') },
    ],
  },
  {
    element: <RequireAthlete />,
    children: [
      { path: '/athlete/dashboard', element: routeElement(<AthleteDashboard />, 'Loading athlete dashboard...') },
      { path: '/athlete/daily-log', element: routeElement(<AthleteDailyLogPage />, 'Loading daily log...') },
      { path: '/athlete/programs', element: routeElement(<AthleteProgramsListPage />, 'Loading athlete programs...') },
      { path: '/athlete/programs/:programId', element: routeElement(<AthleteProgramPage />, 'Loading program details...') },
      { path: '/athlete/progress', element: routeElement(<AthleteProgressPage />, 'Loading progress...') },
      { path: '/athlete/messages', element: routeElement(<AthleteMessagesPage />, 'Loading messages...') },
      { path: '/athlete/ai-chat', element: routeElement(<AthleteMessagesPage />, 'Loading AI chat...') },
      { path: '/athlete/requests', element: routeElement(<AthleteRequestsPage />, 'Loading requests...') },
      { path: '/athlete/journal', element: routeElement(<AthleteJournalPage />, 'Loading journal...') },
      { path: '/athlete/competitions', element: routeElement(<AthleteCompetitionPage />, 'Loading competitions...') },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
