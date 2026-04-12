// src/pages/athlete/AthleteCompetitionPage.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Plus, Trophy, CheckCircle, MapPin, Calendar, X, Star, Medal } from 'lucide-react'
import { useAthlete } from '@/contexts/AthleteContext'
import { supabase } from '@/lib/supabase'

const COMP_TYPES = [
  { value: 'national', label: 'National', emoji: '🇮🇳' },
  { value: 'international', label: 'International', emoji: '🌍' },
  { value: 'state', label: 'State', emoji: '🏛️' },
  { value: 'district', label: 'District', emoji: '📍' },
  { value: 'university', label: 'University', emoji: '🎓' },
  { value: 'club', label: 'Club', emoji: '🏟️' },
  { value: 'friendly', label: 'Friendly/Exhibition', emoji: '🤝' },
  { value: 'trial', label: 'Trial/Selection', emoji: '📋' },
  { value: 'other', label: 'Other', emoji: '🏆' },
]

export default function AthleteCompetitionPage() {
  const { athleteProfile } = useAthlete()
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    competition_name: '', competition_type: 'national', location: '',
    start_date: '', end_date: '', event: '', result: '', placement: '',
    pre_comp_mood: 6, post_comp_mood: 7, performance_rating: 7,
    lessons_learned: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  const { data: competitions = [] } = useQuery({
    queryKey: ['athlete_competitions', athleteProfile?.athlete_id],
    enabled: !!athleteProfile?.athlete_id,
    queryFn: async () => {
      const { data } = await supabase.from('athlete_competitions').select('*')
        .eq('athlete_id', athleteProfile!.athlete_id).order('start_date', { ascending: false }).limit(50)
      return data ?? []
    },
  })

  async function handleSave() {
    if (!form.competition_name.trim() || !form.start_date || !athleteProfile) return
    setSaving(true)
    await supabase.from('athlete_competitions').insert({
      practitioner_id: athleteProfile.practitioner_id,
      athlete_id: athleteProfile.athlete_id,
      ...form,
      end_date: form.end_date || null,
      event: form.event || null,
      result: form.result || null,
      placement: form.placement || null,
      lessons_learned: form.lessons_learned || null,
      notes: form.notes || null,
    })
    qc.invalidateQueries({ queryKey: ['athlete_competitions'] })
    setShowForm(false)
    setForm({ competition_name: '', competition_type: 'national', location: '', start_date: '', end_date: '', event: '', result: '', placement: '', pre_comp_mood: 6, post_comp_mood: 7, performance_rating: 7, lessons_learned: '', notes: '' })
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/athlete/dashboard" className="p-2 -ml-2 text-gray-400"><ChevronLeft size={20} /></Link>
          <h1 className="font-bold text-gray-900">Competition Log</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="p-2 bg-blue-600 text-white rounded-xl"><Plus size={18} /></button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
              <span className="font-bold text-sm text-gray-900 flex items-center gap-2"><Trophy size={15} className="text-amber-500" /> Log Competition</span>
              <button onClick={() => setShowForm(false)} className="text-gray-400"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              <input value={form.competition_name} onChange={e => setForm(f => ({ ...f, competition_name: e.target.value }))}
                placeholder="Competition Name *" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400" />

              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Type</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {COMP_TYPES.map(t => (
                    <button key={t.value} onClick={() => setForm(f => ({ ...f, competition_type: t.value }))}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border-2 ${
                        form.competition_type === t.value ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-100 text-gray-600'
                      }`}>{t.emoji} {t.label}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Start Date *</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">End Date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Location / Venue" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))}
                  placeholder="Event (e.g. 100m)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))}
                  placeholder="Result (e.g. 10.45s)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <input value={form.placement} onChange={e => setForm(f => ({ ...f, placement: e.target.value }))}
                  placeholder="Placement (e.g. 2nd)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-xs font-medium text-gray-600 mb-1">Pre-comp Mood</p>
                  <div className="flex items-center gap-1"><input type="range" min={1} max={10} value={form.pre_comp_mood} onChange={e => setForm(f => ({ ...f, pre_comp_mood: +e.target.value }))} className="flex-1 accent-amber-500" /><span className="text-xs font-bold text-amber-600 w-4">{form.pre_comp_mood}</span></div></div>
                <div><p className="text-xs font-medium text-gray-600 mb-1">Post-comp Mood</p>
                  <div className="flex items-center gap-1"><input type="range" min={1} max={10} value={form.post_comp_mood} onChange={e => setForm(f => ({ ...f, post_comp_mood: +e.target.value }))} className="flex-1 accent-green-500" /><span className="text-xs font-bold text-green-600 w-4">{form.post_comp_mood}</span></div></div>
                <div><p className="text-xs font-medium text-gray-600 mb-1">Performance</p>
                  <div className="flex items-center gap-1"><input type="range" min={1} max={10} value={form.performance_rating} onChange={e => setForm(f => ({ ...f, performance_rating: +e.target.value }))} className="flex-1 accent-blue-500" /><span className="text-xs font-bold text-blue-600 w-4">{form.performance_rating}</span></div></div>
              </div>

              <textarea value={form.lessons_learned} onChange={e => setForm(f => ({ ...f, lessons_learned: e.target.value }))}
                rows={2} placeholder="Lessons learned / Key takeaways…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />

              <button onClick={handleSave} disabled={saving || !form.competition_name.trim() || !form.start_date}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle size={16} />}
                {saving ? 'Saving…' : 'Save Competition'}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {competitions.length === 0 && !showForm ? (
          <div className="text-center py-12">
            <Trophy size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No competitions logged yet</p>
          </div>
        ) : (
          competitions.map((c: any) => {
            const t = COMP_TYPES.find(x => x.value === c.competition_type)
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-bold text-gray-900">{c.competition_name}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                      <span>{t?.emoji} {t?.label}</span>
                      {c.location && <span className="flex items-center gap-0.5"><MapPin size={10} /> {c.location}</span>}
                    </p>
                  </div>
                  {c.placement && <span className="text-sm font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg">{c.placement}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                  <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(c.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  {c.event && <span>· {c.event}</span>}
                  {c.result && <span>· {c.result}</span>}
                </div>
                <div className="flex gap-4 text-xs">
                  <span>Pre: <strong className="text-amber-600">{c.pre_comp_mood}/10</strong></span>
                  <span>Post: <strong className="text-green-600">{c.post_comp_mood}/10</strong></span>
                  <span>Performance: <strong className="text-blue-600">{c.performance_rating}/10</strong></span>
                </div>
                {c.lessons_learned && <p className="text-xs text-gray-500 mt-2 italic border-t border-gray-50 pt-2">{c.lessons_learned}</p>}
              </div>
            )
          })
        )}
        <div className="h-20" />
      </div>
    </div>
  )
}
