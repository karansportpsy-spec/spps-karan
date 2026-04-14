// src/components/practitioner/ShareReportButton.tsx
import { useState } from 'react'
import { Share2, Clock, CheckCircle, X, Eye, RotateCcw } from 'lucide-react'
import { useShareReport, useRevokeSharedReport, usePractitionerSharedReports } from '@/hooks/useSharedReports'

interface ShareReportButtonProps {
  reportId?: string
  reportTitle: string
  reportType: string
  reportContent?: string
  athleteId: string
  athleteAuthId?: string
  athleteName: string
}

export default function ShareReportButton({
  reportId, reportTitle, reportType, reportContent,
  athleteId, athleteAuthId, athleteName,
}: ShareReportButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [hours, setHours] = useState(24)
  const [shared, setShared] = useState(false)
  const share = useShareReport()
  const revoke = useRevokeSharedReport()
  const { data: existingShares = [] } = usePractitionerSharedReports(athleteId)
  const activeShare = existingShares.find(s => s.report_id === reportId && !s.isExpired && !s.is_revoked)

  async function handleShare() {
    await share.mutateAsync({
      reportId, reportTitle, reportType, reportContent,
      athleteId, athleteAuthId, durationHours: hours,
    })
    setShared(true)
    setTimeout(() => { setShowModal(false); setShared(false) }, 2000)
  }

  // If already shared and active, show status pill instead
  if (activeShare) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-full">
          <Eye size={11} />
          {activeShare.is_viewed ? `Viewed ${activeShare.view_count}×` : 'Shared'}
          · {activeShare.expiryLabel}
        </span>
        <button
          onClick={() => revoke.mutate(activeShare.id)}
          disabled={revoke.isPending}
          className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
          title="Revoke access"
        >
          <RotateCcw size={12} />
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors"
      >
        <Share2 size={13} /> Share
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-gray-900 text-sm">Share Report with Athlete</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {shared ? (
              <div className="flex flex-col items-center py-10 gap-3">
                <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center">
                  <CheckCircle size={32} className="text-emerald-500" />
                </div>
                <p className="font-semibold text-gray-900">Shared!</p>
                <p className="text-sm text-gray-400 text-center">
                  {athleteName} can view this for {hours} hours
                </p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-sm font-semibold text-blue-800 truncate">{reportTitle}</p>
                  <p className="text-xs text-blue-500 mt-0.5">Sharing with {athleteName}</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">
                    Access duration
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[6, 12, 24, 48].map(h => (
                      <button
                        key={h}
                        onClick={() => setHours(h)}
                        className={`py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                          hours === h
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-100 text-gray-500 hover:border-gray-200'
                        }`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                    <Clock size={10} />
                    Expires {new Date(Date.now() + hours * 3_600_000).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>

                <button
                  onClick={handleShare}
                  disabled={share.isPending}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                >
                  {share.isPending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Share2 size={15} />
                  )}
                  {share.isPending ? 'Sharing…' : 'Share Report'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
