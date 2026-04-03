import React, { useState } from 'react'
import { Plus, Lightbulb, Star } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Badge, Avatar, Modal, Select, Input, Textarea, Spinner, EmptyState } from '@/components/ui'
import { useInterventions, useCreateIntervention, useUpdateIntervention } from '@/hooks/useData'
import { useAthletes } from '@/hooks/useAthletes'
import { fmtDate } from '@/lib/utils'
import type { InterventionCategory, Intervention } from '@/types'

const CATEGORIES: InterventionCategory[] = [
  'Cognitive Restructuring', 'Relaxation', 'Imagery', 'Goal Setting',
  'Mindfulness', 'Confidence Building', 'Team Cohesion', 'Crisis Protocol', 'Other'
]

const CATEGORY_COLORS: Record<string, string> = {
  'Cognitive Restructuring': 'bg-purple-100 text-purple-700',
  'Relaxation': 'bg-blue-100 text-blue-700',
  'Imagery': 'bg-indigo-100 text-indigo-700',
  'Goal Setting': 'bg-emerald-100 text-emerald-700',
  'Mindfulness': 'bg-teal-100 text-teal-700',
  'Confidence Building': 'bg-amber-100 text-amber-700',
  'Team Cohesion': 'bg-orange-100 text-orange-700',
  'Crisis Protocol': 'bg-red-100 text-red-700',
  'Other': 'bg-gray-100 text-gray-600',
}

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}>
          <Star size={18} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
        </button>
      ))}
    </div>
  )
}

export default function InterventionsPage() {
  const { data: interventions = [], isLoading } = useInterventions()
  const { data: athletes = [] } = useAthletes()
  const createIntervention = useCreateIntervention()
  const updateIntervention = useUpdateIntervention()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Intervention | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [form, setForm] = useState({
    athlete_id: '', category: 'Cognitive Restructuring' as InterventionCategory,
    title: '', description: '', protocol: '', rating: 0, notes: '',
  })

  function openCreate() { setEditing(null); setForm({ athlete_id: '', category: 'Cognitive Restructuring', title: '', description: '', protocol: '', rating: 0, notes: '' }); setModalOpen(true) }
  function openEdit(i: Intervention) {
    setEditing(i)
    setForm({ athlete_id: i.athlete_id, category: i.category, title: i.title, description: i.description ?? '', protocol: i.protocol ?? '', rating: i.rating ?? 0, notes: i.notes ?? '' })
    setModalOpen(true)
  }

  function set(k: string) { return (e: React.ChangeEvent<any>) => setForm(f => ({ ...f, [k]: e.target.value })) }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      if (editing) await updateIntervention.mutateAsync({ id: editing.id, ...form })
      else await createIntervention.mutateAsync(form)
      setModalOpen(false)
    } catch (err: any) {
      setSaveError('Save failed: ' + (err?.message ?? 'unknown error'))
    } finally { setSaving(false) }
  }

  const athleteOptions = [{ value: '', label: '— Select athlete —' }, ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]

  return (
    <AppShell>
      <PageHeader title="Interventions" subtitle={`${interventions.length} recorded`}
        action={<Button onClick={openCreate}><Plus size={16} />New Intervention</Button>} />

      {isLoading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        : interventions.length === 0 ? <EmptyState icon={<Lightbulb size={48} />} title="No interventions yet" action={<Button onClick={openCreate}><Plus size={16} />New Intervention</Button>} />
        : (
          <div className="grid sm:grid-cols-2 gap-4">
            {interventions.map(i => (
              <Card key={i.id} onClick={() => openEdit(i)} className="p-4">
                <div className="flex items-start gap-3 mb-2">
                  {i.athlete && <Avatar firstName={i.athlete.first_name} lastName={i.athlete.last_name} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{i.title}</p>
                    <p className="text-xs text-gray-400">{i.athlete ? `${i.athlete.first_name} ${i.athlete.last_name}` : ''} · {fmtDate(i.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Badge label={i.category} className={CATEGORY_COLORS[i.category] ?? 'bg-gray-100 text-gray-600'} />
                  {i.rating && (
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(n => <Star key={n} size={12} className={n <= i.rating! ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />)}
                    </div>
                  )}
                </div>
                {i.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{i.description}</p>}
              </Card>
            ))}
          </div>
        )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Intervention' : 'New Intervention'} maxWidth="max-w-xl">
        <div className="space-y-4">
          <Select label="Athlete" value={form.athlete_id} onChange={set('athlete_id') as any} options={athleteOptions} />
          <Select label="Category" value={form.category} onChange={set('category') as any} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
          <Input label="Title" value={form.title} onChange={set('title')} required />
          <Textarea label="Description" value={form.description} onChange={set('description') as any} rows={2} />
          <Textarea label="Protocol / Steps" value={form.protocol} onChange={set('protocol') as any} rows={3} />
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Effectiveness Rating</p>
            <StarRating value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setModalOpen(false); setSaveError('') }}>Cancel</Button>
            <div className="flex items-center gap-3">
              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
              <Button onClick={handleSave} loading={saving} disabled={!form.athlete_id || !form.title}>Save Intervention</Button>
            </div>
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}
