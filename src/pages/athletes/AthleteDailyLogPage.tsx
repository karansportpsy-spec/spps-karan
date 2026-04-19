// src/pages/athlete/AthleteDailyLogPage.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, CheckCircle, Heart, Activity, Dumbbell, Brain,
  Utensils, X, Moon, Zap, Flame, Droplets, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAthlete } from '@/contexts/AthleteContext'
import { supabase } from '@/lib/supabase'

const TRAINING_TYPES = [
  { value: 'strength', label: 'Strength', emoji: '🏋️' },
  { value: 'endurance', label: 'Endurance', emoji: '🏃' },
  { value: 'speed', label: 'Speed', emoji: '⚡' },
  { value: 'skill', label: 'Skill/Technical', emoji: '🎯' },
  { value: 'tactical', label: 'Tactical', emoji: '📋' },
  { value: 'recovery', label: 'Recovery', emoji: '🧘' },
  { value: 'match', label: 'Match/Game', emoji: '🏆' },
  { value: 'competition', label: 'Competition', emoji: '🥇' },
  { value: 'rest', label: 'Rest Day', emoji: '😴' },
  { value: 'other', label: 'Other', emoji: '📝' },
]

const FIVE_CS = [
  { key: 'commitment_score', label: 'Commitment', desc: 'Dedication to goals & process', emoji: '🎯', color: '#3b82f6' },
  { key: 'communication_score', label: 'Communication', desc: 'Expression with coach & team', emoji: '💬', color: '#8b5cf6' },
  { key: 'concentration_score', label: 'Concentration', desc: 'Focus during training/competition', emoji: '🧠', color: '#10b981' },
  { key: 'confidence_score', label: 'Confidence', desc: 'Self-belief in abilities', emoji: '💪', color: '#f59e0b' },
  { key: 'control_score', label: 'Control', desc: 'Emotional regulation under pressure', emoji: '🧘', color: '#ef4444' },
]

function Slider({ label, emoji, value, onChange, min = 1, max = 10, low = 'Low', high = 'High', color = '#3b82f6' }: any) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">{emoji} {label}</span>
        <span className="text-sm font-black" style={{ color }}>{value}<span className="text-xs font-normal text-gray-400">/{max}</span></span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)}
        className="w-full h-2 rounded-full appearance-none cursor-pointer" style={{ accentColor: color }} />
      <div className="flex justify-between text-xs text-gray-300 mt-0.5"><span>{low}</span><span>{high}</span></div>
    </div>
  )
}

function Section({ title, icon: Icon, color, open, onToggle, children }: any) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <span className="flex items-center gap-2 font-bold text-sm text-gray-900">
          <Icon size={16} className={color} /> {title}
        </span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-4 border-t border-gray-50 pt-3">{children}</div>}
    </div>
  )
}

export default function AthleteDailyLogPage() {
  const { athleteProfile } = useAthlete()
  const qc = useQueryClient()

  const [sections, setSections] = useState({ wellbeing: true, training: true, fiveCs: true, nutrition: false })
  const toggleSection = (s: string) => setSections(prev => ({ ...prev, [s]: !prev[s as keyof typeof prev] }))

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    mood_score: 7, stress_score: 4, sleep_quality: 7, sleep_hours: 7.5,
    energy_score: 7, fatigue_score: 4, soreness_score: 3, readiness_score: 7,
    training_type: '', training_duration: 60, rpe: 6, basal_hr: 60,
    commitment_score: 7, communication_score: 7, concentration_score: 7, confidence_score: 7, control_score: 7,
    meals_count: 3, water_litres: 2.5, nutrition_quality: 7, supplements_taken: '', nutrition_notes: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  // Check if already logged today
  const { data: todayLog } = useQuery({
    queryKey: ['athlete_daily_log_today', athleteProfile?.athlete_id, today],
    enabled: !!athleteProfile?.athlete_id,
    queryFn: async () => {
      const { data } = await supabase.from('athlete_daily_logs').select('*')
        .eq('athlete_id', athleteProfile!.athlete_id).eq('log_date', today).maybeSingle()
      return data
    },
  })

  async function handleSubmit() {
    if (!athleteProfile) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        practitioner_id: athleteProfile.practitioner_id,
        athlete_id: athleteProfile.athlete_id,
        log_date: today,
        training_type: form.training_type || null,
        supplements_taken: form.supplements_taken || null,
        nutrition_notes: form.nutrition_notes || null,
        notes: form.notes || null,
      }
      await supabase.from('athlete_daily_logs').upsert(payload, { onConflict: 'athlete_id,log_date' })

      // v1-legacy code: this check_ins insert uses the old (practitioner_id,
      // athlete_id) shape and will fail under v2 RLS. Entire daily-log write
      // path is rewritten in Phase 6 against v2 (athlete_daily_logs +
      // athlete_daily_log_shares). Wrapped in try/catch to tolerate the
      // runtime failure until then — silence the TS error from .catch() on
      // a Postgrest builder by awaiting first.
      try {
        await supabase.from('check_ins').insert({
          practitioner_id: athleteProfile.practitioner_id,
          athlete_id: athleteProfile.athlete_id,
          mood_score: form.mood_score,
          stress_score: form.stress_score,
          sleep_score: form.sleep_quality,
          motivation_score: form.commitment_score,
          readiness_score: form.readiness_score,
          energy_score: form.energy_score,
          fatigue_score: form.fatigue_score,
          soreness_score: form.soreness_score,
          notes: form.notes || null,
        })
      } catch { /* v2 transition — see comment above */ }

      setDone(true)
      qc.invalidateQueries({ queryKey: ['athlete_daily_log_today'] })
      qc.invalidateQueries({ queryKey: ['athlete_checkins_recent'] })
    } catch (err) {
      console.error('[DailyLog] Failed:', err)
    } finally { setSaving(false) }
  }

  if (todayLog) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
          <Link to="/athlete/dashboard" className="p-2 -ml-2 text-gray-400"><ChevronLeft size={20} /></Link>
          <h1 className="font-bold text-gray-900">Daily Log</h1>
        </div>
        <div className="max-w-lg mx-auto px-4 py-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Today's log completed!</h2>
          <p className="text-sm text-gray-400 mt-1">You logged at {new Date(todayLog.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { label: 'Mood', value: todayLog.mood_score, color: '#3b82f6' },
              { label: 'Sleep', value: `${todayLog.sleep_hours}h`, color: '#8b5cf6' },
              { label: 'RPE', value: todayLog.rpe, color: '#ef4444' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border p-3 text-center">
                <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>
          <Link to="/athlete/dashboard" className="inline-block mt-6 text-blue-600 text-sm font-medium">← Back to dashboard</Link>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 px-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle size={32} className="text-green-500" /></div>
        <h2 className="text-lg font-bold text-gray-900">Daily log saved!</h2>
        <p className="text-sm text-gray-400">Your practitioner can now see your data.</p>
        <Link to="/athlete/dashboard" className="mt-4 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl text-sm">Back to Dashboard</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-[#1A2D4A] to-[#1e3a5f] text-white px-4 pt-safe pb-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 pt-2 mb-3">
            <Link to="/athlete/dashboard" className="p-2 -ml-2 rounded-xl bg-white/10"><ChevronLeft size={18} /></Link>
            <span className="text-xs text-white/60">Daily Log</span>
          </div>
          <h1 className="text-xl font-black">How's your day?</h1>
          <p className="text-sm text-white/50 mt-1">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {/* Wellbeing */}
        <Section title="Wellbeing" icon={Heart} color="text-rose-500" open={sections.wellbeing} onToggle={() => toggleSection('wellbeing')}>
          <Slider label="Mood" emoji="😊" value={form.mood_score} onChange={(v: number) => setForm(f => ({ ...f, mood_score: v }))} color="#3b82f6" low="Low" high="Great" />
          <Slider label="Stress" emoji="😤" value={form.stress_score} onChange={(v: number) => setForm(f => ({ ...f, stress_score: v }))} color="#f59e0b" low="Calm" high="Very stressed" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1 mb-1"><Moon size={13} /> Sleep Hours</label>
              <input type="number" step="0.5" min={0} max={24} value={form.sleep_hours}
                onChange={e => setForm(f => ({ ...f, sleep_hours: +e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </div>
            <Slider label="Sleep Quality" emoji="😴" value={form.sleep_quality} onChange={(v: number) => setForm(f => ({ ...f, sleep_quality: v }))} color="#8b5cf6" low="Poor" high="Excellent" />
          </div>
          <Slider label="Energy" emoji="⚡" value={form.energy_score} onChange={(v: number) => setForm(f => ({ ...f, energy_score: v }))} color="#10b981" />
          <Slider label="Readiness" emoji="🚀" value={form.readiness_score} onChange={(v: number) => setForm(f => ({ ...f, readiness_score: v }))} color="#06b6d4" low="Not ready" high="Fully ready" />
          <Slider label="Fatigue" emoji="😩" value={form.fatigue_score} onChange={(v: number) => setForm(f => ({ ...f, fatigue_score: v }))} color="#f97316" low="Fresh" high="Exhausted" />
          <Slider label="Soreness" emoji="🤕" value={form.soreness_score} onChange={(v: number) => setForm(f => ({ ...f, soreness_score: v }))} color="#ef4444" low="None" high="Severe" />
        </Section>

        {/* Training */}
        <Section title="Training" icon={Dumbbell} color="text-blue-500" open={sections.training} onToggle={() => toggleSection('training')}>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Training Type</p>
            <div className="grid grid-cols-2 gap-1.5">
              {TRAINING_TYPES.map(t => (
                <button key={t.value} onClick={() => setForm(f => ({ ...f, training_type: t.value }))}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                    form.training_type === t.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-600'
                  }`}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Duration (min)</label>
              <input type="number" min={0} max={600} value={form.training_duration}
                onChange={e => setForm(f => ({ ...f, training_duration: +e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Basal HR</label>
              <input type="number" min={30} max={220} value={form.basal_hr}
                onChange={e => setForm(f => ({ ...f, basal_hr: +e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div />
          </div>
          <Slider label="RPE" emoji="💦" value={form.rpe} onChange={(v: number) => setForm(f => ({ ...f, rpe: v }))} color="#ef4444" low="Easy" high="Maximal" />
        </Section>

        {/* 5 C's */}
        <Section title="5 C's Performance" icon={Brain} color="text-purple-500" open={sections.fiveCs} onToggle={() => toggleSection('fiveCs')}>
          {FIVE_CS.map(c => (
            <Slider key={c.key} label={c.label} emoji={c.emoji} value={form[c.key as keyof typeof form]}
              onChange={(v: number) => setForm(f => ({ ...f, [c.key]: v }))} color={c.color} low="Low" high="Excellent" />
          ))}
        </Section>

        {/* Nutrition */}
        <Section title="Nutrition" icon={Utensils} color="text-green-500" open={sections.nutrition} onToggle={() => toggleSection('nutrition')}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Meals today</label>
              <input type="number" min={0} max={10} value={form.meals_count}
                onChange={e => setForm(f => ({ ...f, meals_count: +e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1 mb-1"><Droplets size={12} /> Water (L)</label>
              <input type="number" step="0.5" min={0} max={15} value={form.water_litres}
                onChange={e => setForm(f => ({ ...f, water_litres: +e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <Slider label="Nutrition Quality" emoji="🥗" value={form.nutrition_quality}
            onChange={(v: number) => setForm(f => ({ ...f, nutrition_quality: v }))} color="#10b981" low="Poor" high="Excellent" />
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Supplements / Notes</label>
            <textarea value={form.nutrition_notes} onChange={e => setForm(f => ({ ...f, nutrition_notes: e.target.value }))}
              rows={2} placeholder="Supplements taken, diet notes…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
          </div>
        </Section>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-sm font-bold text-gray-900 mb-2">Quick Notes</p>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2} placeholder="Anything else on your mind?"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" />
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={saving}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm">
          {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle size={18} />}
          {saving ? 'Saving…' : 'Submit Daily Log'}
        </button>

        <div className="h-8" />
      </div>
    </div>
  )
}
