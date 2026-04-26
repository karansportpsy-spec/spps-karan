import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  BrainCircuit,
  PencilLine,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'

import AppShell from '@/components/layout/AppShell'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui'
import { useAthletes } from '@/hooks/useAthletes'
import {
  archiveClinicalRecord,
  createClinicalRecord,
  listClinicalRecords,
  searchClinicalIcd,
  updateClinicalRecord,
  type ClinicalIcdOption,
  type ClinicalRecord,
  type ClinicalRecordPayload,
} from '@/services/clinicalApi'

type SeverityLevel = ClinicalRecordPayload['severityLevel']

const severityOptions = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
  { value: 'critical', label: 'Critical' },
]

export default function ClinicalPage() {
  const queryClient = useQueryClient()
  const { data: athletes = [] } = useAthletes()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | ''>('active')
  const [athleteFilter, setAthleteFilter] = useState('')
  const [modalRecord, setModalRecord] = useState<ClinicalRecord | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const recordsQuery = useQuery({
    queryKey: ['clinical-records', athleteFilter, statusFilter, search],
    queryFn: async () =>
      listClinicalRecords({
        athleteId: athleteFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
      }),
    retry: false,
  })

  return (
    <AppShell>
      <PageHeader
        title="Clinical Sport Psychology"
        subtitle="Practitioner-only clinical documentation with ICD-coded diagnoses, care notes, and audit logging."
        action={
          <Button
            onClick={() => {
              setModalRecord(null)
              setModalOpen(true)
            }}
          >
            <Plus size={14} />
            Add diagnosis
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-gray-500">Access</p>
          <p className="mt-2 text-xl font-bold text-gray-900">Practitioner only</p>
          <p className="mt-1 text-xs text-gray-500">Athlete users remain blocked from this module.</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Documentation rule</p>
          <p className="mt-2 text-xl font-bold text-gray-900">ICD-coded notes</p>
          <p className="mt-1 text-xs text-gray-500">Store diagnosis labels, ICD-11 codes, and practitioner notes only.</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Search scope</p>
          <p className="mt-2 text-xl font-bold text-gray-900">
            {recordsQuery.data?.length ?? 0} visible record{(recordsQuery.data?.length ?? 0) === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-xs text-gray-500">Filters update the list without requiring a second unlock step.</p>
        </Card>
      </div>

      <Card className="mb-5 p-4">
        <div className="mb-4">
          <Alert
            type="warning"
            message="Do not copy DSM-5-TR text into the record. Store only the diagnosis label, ICD-11 code, and clinical notes."
          />
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr,220px,220px,auto]">
          <Input
            label="Search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Diagnosis label, ICD code, athlete name"
          />
          <Select
            label="Status"
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as 'active' | 'archived' | '')}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          <Select
            label="Athlete"
            value={athleteFilter}
            onChange={event => setAthleteFilter(event.target.value)}
            options={[
              { value: '', label: 'All athletes' },
              ...athletes.map(athlete => ({
                value: athlete.id,
                label: `${athlete.first_name} ${athlete.last_name}`.trim(),
              })),
            ]}
          />
          <div className="flex items-end">
            <Button variant="secondary" onClick={() => recordsQuery.refetch()}>
              <RefreshCw size={14} />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {recordsQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : recordsQuery.isError ? (
        <Alert type="error" message={(recordsQuery.error as Error)?.message ?? 'Failed to load clinical records.'} />
      ) : (recordsQuery.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<BrainCircuit size={44} />}
          title="No clinical records yet"
          description="Choose an athlete and add the first ICD-coded clinical record."
          action={
            <Button
              onClick={() => {
                setModalRecord(null)
                setModalOpen(true)
              }}
            >
              <Plus size={14} />
              Add diagnosis
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {recordsQuery.data?.map(record => (
            <ClinicalRecordCard
              key={record.id}
              record={record}
              onEdit={() => {
                setModalRecord(record)
                setModalOpen(true)
              }}
              onArchive={async () => {
                await archiveClinicalRecord(record.id)
                await queryClient.invalidateQueries({ queryKey: ['clinical-records'] })
              }}
            />
          ))}
        </div>
      )}

      <ClinicalRecordModal
        open={modalOpen}
        record={modalRecord}
        athletes={athletes}
        onClose={() => {
          setModalOpen(false)
          setModalRecord(null)
        }}
        onSaved={async () => {
          setModalOpen(false)
          setModalRecord(null)
          await queryClient.invalidateQueries({ queryKey: ['clinical-records'] })
        }}
      />
    </AppShell>
  )
}

function ClinicalRecordCard({
  record,
  onEdit,
  onArchive,
}: {
  record: ClinicalRecord
  onEdit: () => void
  onArchive: () => Promise<void>
}) {
  const archiveMutation = useMutation({
    mutationFn: onArchive,
  })

  const severityClass = {
    mild: 'bg-emerald-100 text-emerald-800',
    moderate: 'bg-amber-100 text-amber-800',
    severe: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  }[record.severityLevel]

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">{record.diagnosisLabel}</h3>
            <Badge label={record.icdCode} className="bg-blue-100 text-blue-800" />
            <Badge label={record.severityLevel} className={severityClass} />
            <Badge
              label={record.status}
              className={record.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'}
            />
          </div>
          <p className="text-sm text-gray-600">
            {record.athlete.firstName} {record.athlete.lastName}
            {record.athlete.sport ? ` - ${record.athlete.sport}` : ''}
            {record.dsmReference ? ` - DSM ref: ${record.dsmReference}` : ''}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{record.notes}</p>
          <p className="mt-3 text-xs text-gray-400">
            Created {new Date(record.createdAt).toLocaleString()} - Updated {new Date(record.updatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={onEdit}>
            <PencilLine size={14} />
            Edit
          </Button>
          {record.status === 'active' && (
            <Button variant="secondary" loading={archiveMutation.isPending} onClick={() => archiveMutation.mutate()}>
              <Archive size={14} />
              Archive
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function ClinicalRecordModal({
  open,
  record,
  athletes,
  onClose,
  onSaved,
}: {
  open: boolean
  record: ClinicalRecord | null
  athletes: Array<{
    id: string
    first_name: string
    last_name: string
    sport?: string | null
  }>
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [athleteId, setAthleteId] = useState('')
  const [diagnosisLabel, setDiagnosisLabel] = useState('')
  const [dsmReference, setDsmReference] = useState('')
  const [icdQuery, setIcdQuery] = useState('')
  const [icdCode, setIcdCode] = useState('')
  const [notes, setNotes] = useState('')
  const [severityLevel, setSeverityLevel] = useState<SeverityLevel>('moderate')
  const [status, setStatus] = useState<'active' | 'archived'>('active')

  useEffect(() => {
    if (!open) return
    setAthleteId(record?.athleteId ?? '')
    setDiagnosisLabel(record?.diagnosisLabel ?? '')
    setDsmReference(record?.dsmReference ?? '')
    setIcdCode(record?.icdCode ?? '')
    setIcdQuery(record?.icdCode ?? '')
    setNotes(record?.notes ?? '')
    setSeverityLevel(record?.severityLevel ?? 'moderate')
    setStatus(record?.status ?? 'active')
  }, [open, record])

  const icdQueryResult = useQuery({
    queryKey: ['clinical-icd-search', icdQuery],
    enabled: open,
    queryFn: async () => searchClinicalIcd(icdQuery),
    staleTime: 60000,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: ClinicalRecordPayload = {
        athleteId,
        diagnosisLabel,
        dsmReference,
        icdCode,
        notes,
        severityLevel,
        status,
      }

      if (record) {
        return updateClinicalRecord(record.id, payload)
      }
      return createClinicalRecord(payload)
    },
    onSuccess: onSaved,
  })

  const selectedIcdTitle = useMemo(() => {
    const match = icdQueryResult.data?.find(option => option.code === icdCode)
    return match ? `${match.title}${match.category ? ` - ${match.category}` : ''}` : ''
  }, [icdCode, icdQueryResult.data])

  return (
    <Modal open={open} onClose={onClose} title={record ? 'Edit Clinical Record' : 'Add Clinical Record'} maxWidth="max-w-3xl">
      <div className="space-y-4">
        <Alert
          type="warning"
          message="Store only your diagnosis label, ICD-11 code, and clinical notes. Do not paste copyrighted DSM text."
        />

        {saveMutation.isError && (
          <Alert type="error" message={(saveMutation.error as Error)?.message ?? 'Failed to save clinical record.'} />
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Athlete"
            value={athleteId}
            onChange={event => setAthleteId(event.target.value)}
            options={[
              { value: '', label: 'Select athlete' },
              ...athletes.map(athlete => ({
                value: athlete.id,
                label: `${athlete.first_name} ${athlete.last_name}`.trim(),
              })),
            ]}
          />
          <Select
            label="Severity"
            value={severityLevel}
            onChange={event => setSeverityLevel(event.target.value as SeverityLevel)}
            options={severityOptions}
          />
        </div>

        <Input
          label="Diagnosis Label"
          value={diagnosisLabel}
          onChange={event => setDiagnosisLabel(event.target.value)}
          placeholder="Practitioner-entered diagnostic label"
        />

        <Input
          label="DSM Reference (optional)"
          value={dsmReference}
          onChange={event => setDsmReference(event.target.value)}
          placeholder="Short cross-reference only, no copyrighted source text"
        />

        <div className="rounded-xl border border-gray-200 p-4">
          <div className="grid gap-4 md:grid-cols-[240px,1fr]">
            <Input
              label="Search ICD-11"
              value={icdQuery}
              onChange={event => setIcdQuery(event.target.value)}
              placeholder="Search by code or title"
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">ICD-11 Code</label>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                {icdQueryResult.isLoading ? (
                  <div className="flex justify-center py-6">
                    <Spinner size="md" />
                  </div>
                ) : (
                  (icdQueryResult.data ?? []).map((option: ClinicalIcdOption) => (
                    <button
                      key={option.code}
                      type="button"
                      onClick={() => {
                        setIcdCode(option.code)
                        setIcdQuery(option.code)
                      }}
                      className={`block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 ${
                        icdCode === option.code ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-semibold">{option.code}</span>
                      <span className="ml-2 text-gray-700">{option.title}</span>
                      {option.category && <span className="ml-2 text-xs text-gray-400">- {option.category}</span>}
                    </button>
                  ))
                )}
                {!icdQueryResult.isLoading && (icdQueryResult.data?.length ?? 0) === 0 && (
                  <div className="px-3 py-5 text-sm text-gray-500">No ICD-11 matches found.</div>
                )}
              </div>
            </div>
          </div>
          {selectedIcdTitle && <p className="mt-2 text-xs text-gray-500">Selected: {selectedIcdTitle}</p>}
        </div>

        <Textarea
          label="Clinical Notes"
          value={notes}
          onChange={event => setNotes(event.target.value)}
          placeholder="Practitioner notes, formulation, observed risks, referral considerations, and care plan."
          rows={8}
        />

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <ShieldAlert size={14} />
            Practitioner-only clinical record
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!athleteId || !diagnosisLabel.trim() || !icdCode.trim() || !notes.trim()}
              onClick={() => saveMutation.mutate()}
            >
              {record ? 'Save changes' : 'Create record'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
