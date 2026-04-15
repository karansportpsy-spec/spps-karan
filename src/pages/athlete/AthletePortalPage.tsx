import { useEffect, useMemo, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LogOut, Send } from 'lucide-react'

import { Button, Card, Spinner } from '@/components/ui'
import {
  fetchAthletePortalContext,
  getStoredAthleteProfile,
  logoutAthletePortal,
} from '@/services/athletePortalApi'
import {
  addInterventionProgress,
  getInterventionAssignments,
  type InterventionAssignment,
} from '@/services/interventionsApi'
import { createDailyLog } from '@/services/caseFormulationApi'
import {
  createChatSocket,
  fetchMessageHistory,
  sendMessageRest,
  type ChatMessage,
} from '@/services/chatApi'
import { listConsents } from '@/services/consentApi'
import { getAthleteAccessToken } from '@/lib/apiClient'

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AthletePortalPage() {
  const profile = getStoredAthleteProfile()
  const token = getAthleteAccessToken()

  const [text, setText] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [progressDrafts, setProgressDrafts] = useState<Record<string, { progressPercentage: number; note: string }>>({})
  const [dailyLog, setDailyLog] = useState({
    moodScore: 6,
    stressScore: 4,
    sleepHours: 7,
    readinessScore: 6,
    reflection: '',
  })
  const [dailyLogMessage, setDailyLogMessage] = useState('')

  const socketRef = useRef<Socket | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  const { data: context, isLoading: contextLoading } = useQuery({
    queryKey: ['athlete_portal_context'],
    queryFn: fetchAthletePortalContext,
    enabled: Boolean(token),
  })

  const practitionerId = context?.athlete?.practitioner_id || ''

  const { data: assignments = [], isLoading: assignmentsLoading, refetch: refetchAssignments } = useQuery({
    queryKey: ['athlete_intervention_assignments'],
    queryFn: () => getInterventionAssignments(undefined, true),
    enabled: Boolean(token),
  })

  const { data: consentForms = [] } = useQuery({
    queryKey: ['athlete_consents'],
    queryFn: () => listConsents(undefined, true),
    enabled: Boolean(token),
  })

  const { data: history = [], isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['athlete_chat_history', practitionerId],
    queryFn: () => fetchMessageHistory(practitionerId, 'practitioner', true),
    enabled: Boolean(practitionerId),
  })

  useEffect(() => {
    setMessages(history)
  }, [history])

  useEffect(() => {
    if (!token) return
    let closed = false
    createChatSocket(true)
      .then((socket) => {
        if (closed) {
          socket.disconnect()
          return
        }
        socketRef.current = socket
        socket.on('chat:new', (incoming: ChatMessage) => {
          if (!practitionerId) return
          const peerMatch = incoming.sender_id === practitionerId || incoming.receiver_id === practitionerId
          if (!peerMatch) return
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]))
        })
      })
      .catch((err) => console.error('[SPPS Athlete Portal] socket failed:', err))

    return () => {
      closed = true
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [token, practitionerId])

  useEffect(() => {
    if (!practitionerId || !socketRef.current) return
    socketRef.current.emit('chat:mark-read', { peerId: practitionerId, peerRole: 'practitioner' })
  }, [practitionerId, messages.length])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const progressMutation = useMutation({
    mutationFn: ({
      assignmentId,
      progressPercentage,
      note,
    }: {
      assignmentId: string
      progressPercentage: number
      note: string
    }) =>
      addInterventionProgress(
        assignmentId,
        {
          progressPercentage,
          status: progressPercentage >= 100 ? 'completed' : 'in_progress',
          progressNote: note || undefined,
        },
        true
      ),
    onSuccess: () => {
      refetchAssignments()
    },
  })

  const dailyLogMutation = useMutation({
    mutationFn: () =>
      createDailyLog(
        {
          athleteId: context?.athlete?.id || '',
          moodScore: dailyLog.moodScore,
          stressScore: dailyLog.stressScore,
          sleepHours: dailyLog.sleepHours,
          readinessScore: dailyLog.readinessScore,
          reflection: dailyLog.reflection.trim() || undefined,
        },
        true
      ),
  })

  const openAssignments = useMemo(
    () => assignments.filter((a: InterventionAssignment) => a.status !== 'completed'),
    [assignments]
  )

  function patchDraft(assignmentId: string, patch: Partial<{ progressPercentage: number; note: string }>) {
    setProgressDrafts((prev) => {
      const current = prev[assignmentId] ?? { progressPercentage: 0, note: '' }
      return { ...prev, [assignmentId]: { ...current, ...patch } }
    })
  }

  function getDraft(assignment: InterventionAssignment) {
    return progressDrafts[assignment.id] ?? { progressPercentage: Number(assignment.completion_percentage || 0), note: '' }
  }

  async function handleUpdateProgress(assignment: InterventionAssignment) {
    const draft = getDraft(assignment)
    await progressMutation.mutateAsync({
      assignmentId: assignment.id,
      progressPercentage: Math.max(0, Math.min(100, Number(draft.progressPercentage))),
      note: draft.note,
    })
    patchDraft(assignment.id, { note: '' })
  }

  async function handleSaveDailyLog() {
    if (!context?.athlete?.id) return
    setDailyLogMessage('')
    try {
      await dailyLogMutation.mutateAsync()
      setDailyLogMessage('Daily reflection saved.')
      setDailyLog((prev) => ({ ...prev, reflection: '' }))
    } catch (err: any) {
      setDailyLogMessage(err?.message ?? 'Failed to save daily reflection.')
    }
  }

  async function handleSend() {
    if (!practitionerId || !text.trim()) return
    setSending(true)
    try {
      const sent = await sendMessageRest(
        {
          receiverId: practitionerId,
          receiverRole: 'practitioner',
          body: text.trim(),
        },
        true
      )
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]))
      setText('')
      await refetchHistory()
    } catch (err: any) {
      alert(err?.message ?? 'Message send failed.')
    } finally {
      setSending(false)
    }
  }

  if (!token || !profile) {
    return <Navigate to="/athlete/login" replace />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Athlete Portal</p>
            <h1 className="text-xl font-bold text-gray-900">
              {profile.first_name} {profile.last_name}
            </h1>
            <p className="text-sm text-gray-500">{profile.sport || 'Sport not set'} {profile.team ? `· ${profile.team}` : ''}</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              logoutAthletePortal()
              window.location.href = '/athlete/login'
            }}
          >
            <LogOut size={14} /> Logout
          </Button>
        </div>

        {contextLoading ? (
          <div className="py-10 flex justify-center"><Spinner size="lg" /></div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-gray-900">Assigned Intervention Programs</p>
                  <span className="text-xs text-gray-500">{openAssignments.length} active</span>
                </div>

                {assignmentsLoading ? (
                  <div className="py-8 flex justify-center"><Spinner size="md" /></div>
                ) : openAssignments.length === 0 ? (
                  <p className="text-sm text-gray-500">No active intervention assignments yet.</p>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {openAssignments.map((assignment) => {
                      const draft = getDraft(assignment)
                      return (
                        <div key={assignment.id} className="border border-gray-100 rounded-xl p-3">
                          <p className="text-sm font-semibold text-gray-900">{assignment.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{assignment.description || 'No description'}</p>
                          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden mt-2">
                            <div
                              className="h-2 bg-blue-500"
                              style={{ width: `${Math.max(0, Math.min(100, Number(assignment.completion_percentage || 0)))}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Current progress: {Math.round(Number(assignment.completion_percentage || 0))}%
                          </p>

                          <div className="grid grid-cols-[110px,1fr] gap-2 mt-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={draft.progressPercentage}
                              onChange={(e) =>
                                patchDraft(assignment.id, {
                                  progressPercentage: Math.max(0, Math.min(100, Number(e.target.value || 0))),
                                })
                              }
                              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                            />
                            <input
                              value={draft.note}
                              onChange={(e) => patchDraft(assignment.id, { note: e.target.value })}
                              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                              placeholder="Progress reflection"
                            />
                          </div>

                          <div className="flex justify-end mt-2">
                            <Button onClick={() => handleUpdateProgress(assignment)} loading={progressMutation.isPending}>
                              Update
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              <Card className="p-4">
                <p className="font-semibold text-gray-900">Daily Reflection Log</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  This feeds your practitioner&apos;s case formulation summary automatically.
                </p>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <label className="text-xs text-gray-600">
                    Mood
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={dailyLog.moodScore}
                      onChange={(e) => setDailyLog((prev) => ({ ...prev, moodScore: Number(e.target.value || 1) }))}
                      className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    Stress
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={dailyLog.stressScore}
                      onChange={(e) => setDailyLog((prev) => ({ ...prev, stressScore: Number(e.target.value || 1) }))}
                      className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    Sleep (hours)
                    <input
                      type="number"
                      min={0}
                      max={24}
                      step={0.5}
                      value={dailyLog.sleepHours}
                      onChange={(e) => setDailyLog((prev) => ({ ...prev, sleepHours: Number(e.target.value || 0) }))}
                      className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    Readiness
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={dailyLog.readinessScore}
                      onChange={(e) => setDailyLog((prev) => ({ ...prev, readinessScore: Number(e.target.value || 1) }))}
                      className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                    />
                  </label>
                </div>

                <textarea
                  value={dailyLog.reflection}
                  onChange={(e) => setDailyLog((prev) => ({ ...prev, reflection: e.target.value }))}
                  className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                  rows={3}
                  placeholder="Short reflection about today"
                />

                <div className="flex items-center justify-between mt-2">
                  <p
                    className={`text-xs ${
                      dailyLogMessage.includes('failed') || dailyLogMessage.includes('Failed')
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}
                  >
                    {dailyLogMessage}
                  </p>
                  <Button onClick={handleSaveDailyLog} loading={dailyLogMutation.isPending}>
                    Save Daily Log
                  </Button>
                </div>
              </Card>
            </div>

            <Card className="p-0 h-[600px] flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <p className="font-semibold text-gray-900">Chat with Practitioner</p>
                <p className="text-xs text-gray-500">Consent forms on file: {Array.isArray(consentForms) ? consentForms.length : 0}</p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {historyLoading ? (
                  <div className="py-10 flex justify-center"><Spinner size="md" /></div>
                ) : messages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-500">No messages yet.</div>
                ) : (
                  messages.map((message) => {
                    const mine = message.sender_role === 'athlete'
                    return (
                      <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-3 py-2 rounded-xl ${mine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                          <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                          <p className={`text-[10px] mt-1 ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                            {formatTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={endRef} />
              </div>

              <div className="px-3 py-3 border-t border-gray-100 flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2"
                  placeholder="Type a message..."
                />
                <Button onClick={handleSend} loading={sending} disabled={!text.trim()}>
                  <Send size={14} />
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
