import { Link } from 'react-router-dom'
import { Brain, Shield, Activity, Users, ChevronRight, CheckCircle, UserCheck, Target } from 'lucide-react'

const features = [
  { icon: Shield,   title: 'HIPAA Compliant',       desc: 'End-to-end encrypted session notes and athlete data with full audit trails.' },
  { icon: Activity, title: 'Real-Time Check-Ins',   desc: 'Track mood, stress, sleep, and readiness with scientific scoring protocols.' },
  { icon: Users,    title: 'Athlete Management',    desc: 'Comprehensive athlete profiles with risk stratification and progress tracking.' },
  { icon: Brain,    title: 'AI-Assisted Insights',  desc: 'Generate clinical reports and intervention recommendations with integrated AI.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-spps flex items-center justify-center">
            <Brain size={18} className="text-white" />
          </div>
          <span className="font-bold text-gray-900">SPPS</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/auth/login" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">
            Practitioner Sign In
          </Link>
          <Link to="/athlete/login" className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5">
            Athlete Sign In
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto text-center px-6 py-20">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-8">
          <CheckCircle size={14} /> HIPAA-Compliant Practice Management
        </div>
        <h1 className="font-display text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
          The practitioner suite built for<br />
          <span className="text-gradient-spps">elite sport psychology</span>
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-12">
          Manage athletes, sessions, assessments, and interventions in one secure, intelligent platform. Designed for sport psychologists who demand clinical rigor — and the athletes they serve.
        </p>
      </section>

      {/* Role chooser */}
      <section className="max-w-4xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Practitioner card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-3xl p-8 flex flex-col">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center mb-5">
            <UserCheck size={22} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">I'm a practitioner</h2>
          <p className="text-sm text-gray-600 mb-6 flex-1">
            Sport psychologists, counsellors, and mental performance consultants managing athlete caseloads.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              to="/auth/signup"
              className="inline-flex items-center justify-center gap-2 bg-gradient-spps text-white px-5 py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              Create practitioner account <ChevronRight size={16} />
            </Link>
            <Link
              to="/auth/login"
              className="inline-flex items-center justify-center gap-2 bg-white border border-blue-200 text-blue-700 px-5 py-3 rounded-xl font-medium hover:bg-blue-50 transition-colors"
            >
              Practitioner sign in
            </Link>
          </div>
        </div>

        {/* Athlete card */}
        <div className="bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100 rounded-3xl p-8 flex flex-col">
          <div className="w-12 h-12 rounded-2xl bg-teal-600 flex items-center justify-center mb-5">
            <Target size={22} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">I'm an athlete</h2>
          <p className="text-sm text-gray-600 mb-6 flex-1">
            Track your performance, log your daily reflections, and stay connected with your practitioner team.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              to="/athlete/signup"
              className="inline-flex items-center justify-center gap-2 bg-teal-600 text-white px-5 py-3 rounded-xl font-medium hover:bg-teal-700 transition-colors"
            >
              Create athlete account <ChevronRight size={16} />
            </Link>
            <Link
              to="/athlete/login"
              className="inline-flex items-center justify-center gap-2 bg-white border border-teal-200 text-teal-700 px-5 py-3 rounded-xl font-medium hover:bg-teal-50 transition-colors"
            >
              Athlete sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-24 grid grid-cols-1 sm:grid-cols-2 gap-6">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="p-6 bg-gray-50 rounded-2xl">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <Icon size={20} className="text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
            <p className="text-sm text-gray-500">{desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} SPPS — Sport Psychology Practitioner Suite
      </footer>
    </div>
  )
}
