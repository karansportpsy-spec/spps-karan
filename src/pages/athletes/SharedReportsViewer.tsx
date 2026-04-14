// src/components/athlete/SharedReportsViewer.tsx
import { useState } from 'react'
import { FileText, Clock, Eye, AlertTriangle, X, ChevronRight } from 'lucide-react'
import { useAthleteSharedReports, useMarkReportViewed } from '@/hooks/useSharedReports'
import type { SharedReportWithExpiry } from '@/types/sync'

function ReportDetailModal({
  report,
  onClose,
}: {
  report: SharedReportWithExpiry
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 truncate">{report.report_title ?? 'Report'}</h3>
            <p className="text-xs text-gray-400 mt-0.5 capitalize">
              {report.report_type} · {report.expiryLabel}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-3">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {report.report_content ? (
            <div
              className="prose prose-sm max-w-none text-gray-700 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: report.report_content
                  .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-gray-900 mt-4 mb-2">$1</h2>')
                  .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-gray-800 mt-3 mb-1">$1</h3>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc mb-1">$1</li>')
                  .replace(/\n\n/g, '</p><p class="mb-3">'),
              }}
            />
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">
              Report content is available to your practitioner.
            </p>
          )}
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t shrink-0">
          <p className="text-xs text-gray-400 text-center">
            Shared by your practitioner · {report.expiryLabel}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SharedReportsViewer({ athleteId }: { athleteId: string }) {
  const { reportsWithExpiry, isLoading } = useAthleteSharedReports(athleteId)
  const markViewed = useMarkReportViewed()
  const [selectedReport, setSelectedReport] = useState<SharedReportWithExpiry | null>(null)

  function handleView(report: SharedReportWithExpiry) {
    if (!report.is_viewed) {
      markViewed.mutate({ reportShareId: report.id, currentCount: report.view_count })
    }
    setSelectedReport(report)
  }

  if (isLoading) return null

  if (reportsWithExpiry.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText size={28} className="text-gray-200 mx-auto mb-2" />
        <p className="text-sm text-gray-400">No shared reports yet</p>
      </div>
    )
  }

  const unread = reportsWithExpiry.filter(r => !r.is_viewed).length

  return (
    <>
      <div className="space-y-2">
        {unread > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
            <p className="text-xs font-semibold text-blue-700">
              {unread} new report{unread > 1 ? 's' : ''} shared by your practitioner
            </p>
          </div>
        )}

        {reportsWithExpiry.map(report => {
          const urgentExpiry = report.minutesRemaining < 60 && !report.isExpired

          return (
            <button
              key={report.id}
              onClick={() => handleView(report)}
              className={`w-full bg-white rounded-2xl border text-left hover:shadow-sm transition-all ${
                urgentExpiry ? 'border-amber-300' : 'border-gray-100'
              }`}
            >
              <div className="p-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  urgentExpiry ? 'bg-amber-50' : 'bg-blue-50'
                }`}>
                  <FileText size={16} className={urgentExpiry ? 'text-amber-500' : 'text-blue-500'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {!report.is_viewed && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                    )}
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {report.report_title ?? 'Shared Report'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={`flex items-center gap-1 text-xs ${
                      urgentExpiry ? 'text-amber-600 font-semibold' : 'text-gray-400'
                    }`}>
                      {urgentExpiry && <AlertTriangle size={10} />}
                      <Clock size={10} />
                      {report.expiryLabel}
                    </span>
                    {report.is_viewed && (
                      <span className="flex items-center gap-1 text-xs text-gray-300">
                        <Eye size={10} /> {report.view_count}×
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={14} className="text-gray-300 shrink-0" />
              </div>
            </button>
          )
        })}
      </div>

      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </>
  )
}
