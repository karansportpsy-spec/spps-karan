// src/pages/athlete/AthleteJournalPage.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Plus, BookOpen, CheckCircle, Lock, Unlock, X } from 'lucide-react'
import { useAthlete } from '@/contexts/AthleteContext'
import { supabase } from '@/lib/supabase'

const JOURNAL_TAGS = [
  'Pre-competition', 'Post-competition', 'Training reflection', 'Goal review',
  'Gratitude', 'Anxiety', 'Confidence', 'Setback', 'Breakthrough', 'Recovery', 'Personal',
]

const PROMPTS = [
  "What went well today in training?",
  "What's one thing I want to improve this week?",
  "How did I handle pressure today?",
  "What am I grateful for in my sport journey?",
  "What mental skill did I practice today?",
  "How do I feel about my upcoming competition?",
]

export default function AthleteJournalPage() {
  const { athleteProfile } = useAthlete()
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [moodBefore, setMoodBefore] = useState(5)
  const [moodAfter, setMoodAfter] = useState(7)
  const [tags, setTags] = useState<string[]>([])
  const [isShared, setIsShared] = useState(true)
  const [saving, setSaving] = useState(false)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['athlete_journals', athleteProfile?.athlete_id],
    enabled: !!athleteProfile?.athlete_id,
    queryFn: async () => {
      const { data } = await supabase.from('athlete_journals').select('*')
        .eq('athlete_id', athleteProfile!.athlete_id).order('entry_date', { ascending: false }).limit(50)
      return data ?? []
    },
  })

  function toggleTag(t: string) { setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]) }

  function applyPrompt(prompt: string) {
    setContent(prev => (prev ? `${prev}\n\n${prompt}` : prompt))
    setShowForm(true)
  }

  async function handleSave() {
    if (!content.trim() || !athleteProfile) return
    setSaving(true)
    await supabase.from('athlete_journals').insert({
      practitioner_id: athleteProfile.practitioner_id,
      athlete_id: athleteProfile.athlete_id,
      title: title.trim() || null,
      content: content.trim(),
      mood_before: moodBefore,
      mood_after: moodAfter,
      tags: tags.length > 0 ? tags : null,
      is_shared: isShared,
    })
    qc.invalidateQueries({ queryKey: ['athlete_journals'] })
    setShowForm(false); setTitle(''); setContent(''); setTags([]); setMoodBefore(5); setMoodAfter(7)
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/athlete/dashboard" className="p-2 -ml-2 text-gray-400"><ChevronLeft size={20} /></Link>
          <h1 className="font-bold text-gray-900">Reflective Journal</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="p-2 bg-blue-600 text-white rounded-xl"><Plus size={18} /></button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Prompts */}
        {!showForm && (
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
            <p className="text-sm font-bold text-purple-800 mb-2">💡 Journal Prompts</p>
            <div className="space-y-1.5">
              {PROMPTS.slice(0, 3).map(p => (
                <button key={p} onClick={() => applyPrompt(p)}
                  className="w-full text-left text-xs bg-white hover:bg-purple-100 text-purple-700 px-3 py-2 rounded-xl border border-purple-100 transition-colors">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && !showForm && (
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-8 text-center text-sm text-gray-500 shadow-sm">
            Loading journal entries...
          </div>
        )}

        {/* New entry form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between bg-gradient-to-r from-purple-50 to-blue-50">
              <span className="font-bold text-sm text-gray-900 flex items-center gap-2"><BookOpen size={15} className="text-purple-500" /> New Entry</span>
              <button onClick={() => setShowForm(false)} className="text-gray-400"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400" />

              <textarea value={content} onChange={e => setContent(e.target.value)} rows={6}
                placeholder="Write your thoughts…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 leading-relaxed" />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Mood before writing</p>
                  <div className="flex items-center gap-2">
                    <input type="range" min={1} max={10} value={moodBefore} onChange={e => setMoodBefore(+e.target.value)}
                      className="flex-1 accent-purple-500" />
                    <span className="text-sm font-bold text-purple-600 w-6 text-right">{moodBefore}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Mood after writing</p>
                  <div className="flex items-center gap-2">
                    <input type="range" min={1} max={10} value={moodAfter} onChange={e => setMoodAfter(+e.target.value)}
                      className="flex-1 accent-green-500" />
                    <span className="text-sm font-bold text-green-600 w-6 text-right">{moodAfter}</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {JOURNAL_TAGS.map(t => (
                    <button key={t} onClick={() => toggleTag(t)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        tags.includes(t) ? 'bg-purple-100 border-purple-300 text-purple-700 font-semibold' : 'border-gray-200 text-gray-500'
                      }`}>{t}</button>
                  ))}
                </div>
              </div>

              <button onClick={() => setIsShared(v => !v)}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700">
                {isShared ? <Unlock size={13} className="text-green-500" /> : <Lock size={13} className="text-amber-500" />}
                {isShared ? 'Shared with practitioner' : 'Private — only you can see'}
              </button>

              <button onClick={handleSave} disabled={saving || !content.trim()}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle size={16} />}
                {saving ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        )}

        {/* Entries list */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
            <p className="text-sm text-gray-500">Loading journal entries...</p>
          </div>
        ) : entries.length === 0 && !showForm ? (
          <div className="text-center py-12">
            <BookOpen size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No journal entries yet</p>
            <p className="text-sm text-gray-400 mt-1">Start writing to track your mental journey</p>
          </div>
        ) : (
          entries.map((e: any) => (
            <div key={e.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400">{new Date(e.entry_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                <div className="flex items-center gap-2">
                  {!e.is_shared && <Lock size={11} className="text-amber-400" />}
                  {e.mood_before && e.mood_after && (
                    <span className={`text-xs font-semibold ${e.mood_after > e.mood_before ? 'text-green-600' : e.mood_after < e.mood_before ? 'text-red-500' : 'text-gray-400'}`}>
                      {e.mood_before}→{e.mood_after}
                    </span>
                  )}
                </div>
              </div>
              {e.title && <p className="font-bold text-gray-900 text-sm mb-1">{e.title}</p>}
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-4 whitespace-pre-wrap">{e.content}</p>
              {e.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {e.tags.map((t: string) => (
                    <span key={t} className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        <div className="h-20" />
      </div>
    </div>
  )
}
