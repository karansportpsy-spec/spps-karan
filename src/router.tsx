// src/router.tsx
//
// v2 Phase 2 router.
//
// Changes from v1:
//   • New /athlete/signup route
//   • RequireAuth no longer gates on compliance_completed / profile_completed
//     (Phase 2 is auth only. Compliance flow re-activates in a later phase.)
//   • Drops RequireAthletePortalAuth / legacy accept-invite entirely
//   • Dual-role router based on user_metadata.role
//
// Routes preserved unchanged: all the existing practitioner + athlete pages
// continue to work because the AuthContext still exposes practitioner + user.
// Pages that query the athlete_* tables will adjust in Phase 3 onward.

import React from 'react'
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation, useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'

import { Spinner } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'

import LandingPage from '@/pages/Landing'
import NotFoundPage from '@/pages/NotFoundPage'
import { LoginPage, SignupPage } from '@/pages/auth/AuthPages'
import { HIPAAPage, UserAgreementPage, TermsPage, DataPrivacyPage } from '@/pages/compliance/CompliancePages'
import ProfileSetupPage from '@/pages/auth/ProfileSetupPage'
import AthleteLoginPage from '@/pages/athlete/AthleteLoginPage'
import AthleteSignupPage from '@/pages/athlete/AthleteSignupPage'
import AthletePortalPage from '@/pages/athlete/AthletePortalPage'

const DashboardPage            = React.lazy(() => import('@/pages/Dashboard'))
const AthletesPage             = React.lazy(() => import('@/pages/athletes/AthletesPage'))
const ArchivedAthletesPage     = React.lazy(() => import('@/pages/athletes/ArchivedAthletesPage'))
const IOCMentalHealthPage      = React.lazy(() => import('@/pages/assessments/IOCMentalHealthPage'))
const PsychophysiologyPage     = React.lazy(() => import('@/pages/assessments/PsychophysiologyPage'))
const NeurocognitivePage       = React.lazy(() => import('@/pages/assessments/NeurocognitivePage'))
const CaseFormulationPage      = React.lazy(() => import('@/pages/athletes/CaseFormulation'))
const CustomAssessmentPage     = React.lazy(() => import('@/pages/assessments/CustomAssessmentPage'))
const ConsentFormsPage         = React.lazy(() => import('@/pages/consent/ConsentFormsPage'))
const InjuryPsychologyPage     = React.lazy(() => import('@/pages/injury/InjuryPsychologyPage'))
const MentalPerformanceLabPage = React.lazy(() => import('@/pages/lab/MentalPerformanceLabPage'))
const ProgramBuilderPage       = React.lazy(() => import('@/pages/programs/ProgramBuilderPage'))
const SessionsPage             = React.lazy(() => import('@/pages/sessions/SessionsPage'))
const CheckInsPage             = React.lazy(() => import('@/pages/checkins/CheckInsPage'))
const AssessmentsPage          = React.lazy(() => import('@/pages/assessments/AssessmentsPage'))
const InterventionsPage        = React.lazy(() => import('@/pages/interventions/InterventionsPage'))
const AIAssistantPage          = React.lazy(() => import('@/pages/ai/AIAssistantPage'))
const ReportsPage              = React.lazy(() => import('@/pages/reports/ReportsPage'))
const SettingsPage             = React.lazy(() => import('@/pages/settings/SettingsPage'))
const ChatPage                 = React.lazy(() => import('@/pages/chat/ChatPage'))
const ClinicalPage             = React.lazy(() => import('@/pages/clinical/ClinicalPage'))

const AcceptInvitePage        = React.lazy(() => import('@/pages/athletes/AcceptInvitePage'))
const AthleteDashboard        = React.lazy(() => import('@/pages/athletes/AthleteDashboard'))
const AthleteMessagesPage     = React.lazy(() => import('@/pages/athletes/AthleteMessagesPage'))
const AthleteProgramPage      = React.lazy(() => import('@/pages/athletes/AthleteProgramPage'))
const AthleteProgramsListPage = React.lazy(() => import('@/pages/athletes/AthleteProgramsListPage'))
const AthleteProgressPage     = React.lazy(() => import('@/pages/athletes/AthleteProgressPage'))
const AthleteDailyLogPage     = React.lazy(() => import('@/pages/athletes/AthleteDailyLogPage'))
const AthleteRequestsPage     = React.lazy(() => import('@/pages/athletes/AthleteRequestsPage'))
const AthleteJournalPage      = React.lazy(() => import('@/pages/athletes/AthleteJournalPage'))
const AthleteCompetitionPage  = React.lazy(() => import('@/pages/athletes/AthleteCompetitionPage'))
const MyPractitionersPage     = React.lazy(() => import('@/pages/athletes/MyPractitionersPage'))

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

function AthleteRouteErrorBoundary() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? error.statusText || `Request failed with status ${error.status}`
    : error instanceof Error
      ? error.message
      : 'Something went wrong while loading the athlete portal.'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#eef9f7] to-[#f4fbf7] p-6">
      <div className="w-full max-w-lg rounded-3xl border border-red-100 bg-white p-8 shadow-xl">
        <div className="mb-4 inline-flex rounded-2xl bg-red-50 p-3 text-red-600">
          <AlertCircle size={22} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Athlete portal hit an unexpected issue</h1>
        <p className="mt-2 text-sm text-gray-600">
          We kept the app from crashing completely, but this page needs a refresh or a fresh sign-in.
        </p>
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex flex-1 items-center justify-center rounded-2xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Reload athlete portal
          </button>
          <Link
            to="/athlete/login"
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Go to athlete sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Guards ─────────────────────────────────────────────────────────────────

/** Practitioner authenticated surface. Sends athletes to their dashboard. */
function RequirePractitioner() {
  const { user, role, loading, practitioner, profileLoading } = useAuth()
  const location = useLocation()

  if (loading)                           return <LoadingScreen />
  if (!user)                             return <Navigate to="/auth/login" state={{ from: location }} replace />
  if (role === 'athlete')                return <Navigate to="/athlete/dashboard" replace />
  if (role !== 'practitioner')           return <Navigate to="/auth/login" replace />
  if (profileLoading)                    return <LoadingScreen message="Loading your profile..." />
  if (practitioner === null)             return <Navigate to="/auth/login" state={{ from: location }} replace />

  return <Outlet />
}

/** Athlete authenticated surface. Sends practitioners to their dashboard. */
function RequireAthlete() {
  const { user, role, loading, athlete, profileLoading } = useAuth()
  const location = useLocation()

  if (loading)                           return <LoadingScreen message="Loading Athlete Portal..." />
  if (!user)                             return <Navigate to="/athlete/login" state={{ from: location }} replace />
  if (role === 'practitioner')           return <Navigate to="/dashboard" replace />
  if (role !== 'athlete')                return <Navigate to="/athlete/login" replace />
  if (profileLoading)                    return <LoadingScreen message="Loading your profile..." />
  if (athlete === null)                  return <Navigate to="/athlete/login" state={{ from: location }} replace />

  return <Outlet />
}

/** Public-only (e.g. /auth/login). Redirects signed-in users to their dashboard. */
function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (user) {
    if (role === 'athlete')      return <Navigate to="/athlete/dashboard" replace />
    if (role === 'practitioner') return <Navigate to="/dashboard" replace />
    // Unknown role — let them through so they can sign out
  }
  return <>{children}</>
}

// ── Routes ─────────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  // Landing
  { path: '/', element: <LandingPage /> },

  // Practitioner auth (public)
  { path: '/auth/login',  element: <RedirectIfAuth><LoginPage /></RedirectIfAuth> },
  { path: '/auth/signup', element: <RedirectIfAuth><SignupPage /></RedirectIfAuth> },

  // Athlete auth (public)
  { path: '/athlete/login',  element: <RedirectIfAuth>{routeElement(<AthleteLoginPage />,  'Loading athlete sign in...')}</RedirectIfAuth> },
  { path: '/athlete/signup', element: <RedirectIfAuth>{routeElement(<AthleteSignupPage />, 'Loading athlete sign up...')}</RedirectIfAuth> },

  // Legacy paths → dashboard
  { path: '/athlete/portal',        element: routeElement(<AthletePortalPage />, 'Loading athlete portal...') },
  { path: '/athlete/accept-invite', element: routeElement(<AcceptInvitePage />, 'Loading invitation...') },

  // Compliance / profile-setup (kept accessible for existing flows; they are
  // not currently gate-enforced in Phase 2)
  {
    path: '/compliance',
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
    children: [
      { path: 'setup', element: <ProfileSetupPage /> },
    ],
  },

  // Practitioner authenticated surface
  {
    element: <RequirePractitioner />,
    children: [
      { path: '/dashboard',                  element: routeElement(<DashboardPage />,         'Loading dashboard...') },
      { path: '/athletes',                   element: routeElement(<AthletesPage />,          'Loading athletes...') },
      { path: '/athletes/archived',          element: routeElement(<ArchivedAthletesPage />,  'Loading archived athletes...') },
      { path: '/athletes/:athleteId/case',   element: routeElement(<CaseFormulationPage />,   'Loading case formulation...') },
      { path: '/sessions',                   element: routeElement(<SessionsPage />,          'Loading sessions...') },
      { path: '/checkins',                   element: routeElement(<CheckInsPage />,          'Loading check-ins...') },
      { path: '/assessments',                element: routeElement(<AssessmentsPage />,       'Loading assessments...') },
      { path: '/assessments/ioc',            element: routeElement(<IOCMentalHealthPage />,   'Loading mental health...') },
      { path: '/assessments/physio',         element: routeElement(<PsychophysiologyPage />,  'Loading psychophysiology...') },
      { path: '/assessments/neuro',          element: routeElement(<NeurocognitivePage />,    'Loading neurocognitive...') },
      { path: '/assessments/custom',         element: routeElement(<CustomAssessmentPage />,  'Loading custom assessment...') },
      { path: '/interventions',              element: routeElement(<InterventionsPage />,     'Loading interventions...') },
      { path: '/programs',                   element: routeElement(<ProgramBuilderPage />,    'Loading programs...') },
      { path: '/chat',                       element: routeElement(<ChatPage />,              'Loading chat...') },
      { path: '/clinical',                   element: routeElement(<ClinicalPage />,          'Loading clinical module...') },
      { path: '/consent',                    element: routeElement(<ConsentFormsPage />,      'Loading consent forms...') },
      { path: '/injury',                     element: routeElement(<InjuryPsychologyPage />,  'Loading injury psychology...') },
      { path: '/lab',                        element: routeElement(<MentalPerformanceLabPage />, 'Loading lab tools...') },
      { path: '/ai-assistant',               element: routeElement(<AIAssistantPage />,       'Loading AI assistant...') },
      { path: '/reports',                    element: routeElement(<ReportsPage />,           'Loading reports...') },
      { path: '/settings',                   element: routeElement(<SettingsPage />,          'Loading settings...') },
      { path: '/conversations',              element: <Navigate to="/chat" replace /> },
    ],
  },

  // Athlete authenticated surface
  {
    element: <RequireAthlete />,
    errorElement: <AthleteRouteErrorBoundary />,
    children: [
      { path: '/athlete/dashboard',           element: routeElement(<AthleteDashboard />,        'Loading athlete dashboard...') },
      { path: '/athlete/practitioners',       element: routeElement(<MyPractitionersPage />,     'Loading practitioners...') },
      { path: '/athlete/daily-log',           element: routeElement(<AthleteDailyLogPage />,     'Loading daily log...') },
      { path: '/athlete/programs',            element: routeElement(<AthleteProgramsListPage />, 'Loading athlete programs...') },
      { path: '/athlete/programs/:programId', element: routeElement(<AthleteProgramPage />,      'Loading program details...') },
      { path: '/athlete/progress',            element: routeElement(<AthleteProgressPage />,     'Loading progress...') },
      { path: '/athlete/messages',            element: routeElement(<AthleteMessagesPage />,     'Loading messages...') },
      { path: '/athlete/ai-chat',             element: routeElement(<AthleteMessagesPage />,     'Loading AI chat...') },
      { path: '/athlete/requests',            element: routeElement(<AthleteRequestsPage />,     'Loading requests...') },
      { path: '/athlete/journal',             element: routeElement(<AthleteJournalPage />,      'Loading journal...') },
      { path: '/athlete/competitions',        element: routeElement(<AthleteCompetitionPage />,  'Loading competitions...') },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
