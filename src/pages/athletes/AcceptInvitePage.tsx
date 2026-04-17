// src/pages/athletes/AcceptInvitePage.tsx
//
// Legacy route. The athlete activation flow no longer uses email invites —
// practitioners authorize an athlete's email in-app and athletes sign
// themselves up at /athlete/login (Sign Up tab).
//
// We keep this page as a graceful redirect in case any old invite links
// are still floating around (WhatsApp, saved bookmarks, etc).

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Info } from 'lucide-react'
import LogoBrand from '@/components/LogoBrand'

export default function AcceptInvitePage() {
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => navigate('/athlete/login', { replace: true }), 3000)
    return () => clearTimeout(t)
  }, [navigate])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-gradient-to-r from-[#1A2D4A] to-[#0D7C8E] px-6 py-4">
        <LogoBrand size="md" variant="sidebar" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-6 text-center space-y-3">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto">
              <Info size={28} className="text-[#0D7C8E]" />
            </div>
            <h2 className="font-bold text-gray-900 text-lg">The activation flow has changed</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              You no longer need an invite link. Your practitioner will authorize your email
              in the app and tell you directly. Then you can sign up with that email and your
              own password.
            </p>
            <div className="pt-2">
              <p className="text-xs text-gray-400 flex items-center justify-center gap-2">
                <Loader2 size={12} className="animate-spin" />
                Redirecting to the sign-in page…
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
