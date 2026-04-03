import { Link } from 'react-router-dom'
import { Brain, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-gradient-spps flex items-center justify-center mx-auto mb-6">
          <Brain size={28} className="text-white" />
        </div>
        <p className="text-7xl font-bold text-gray-900 font-display mb-3">404</p>
        <h1 className="text-xl font-semibold text-gray-700 mb-2">Page not found</h1>
        <p className="text-sm text-gray-400 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 bg-gradient-spps text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <ArrowLeft size={15} /> Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
