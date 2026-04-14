import { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Printer,
  ArrowLeft,
  FileText,
  Stethoscope, // ✅ Valid lucide-react icon
} from 'lucide-react';

import AppShell from '@/components/layout/AppShell';
import { Button, Card, Badge, Avatar, Spinner } from '@/components/ui';
import { useAthletes } from '@/hooks/useAthletes';
import {
  useSessions,
  useCheckIns,
  useAssessments,
  useInterventions,
} from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { riskColor, statusColor, fmtDate } from '@/lib/utils';
import { ANONYMISATION_DISCLAIMER } from '@/lib/athleteUID';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface InjuryRecord {
  id: string;
  date_of_injury: string;
  osiics_code_1?: string;
  osiics_diagnosis_1?: string;
  diagnosis_text?: string;
  cause_of_injury?: string;
  psychological_notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────
function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ElementType;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={18} className="text-blue-600" />
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
    </div>
  );
}

function DiagnosisBadge({
  code,
  diagnosis,
}: {
  code?: string;
  diagnosis?: string;
}) {
  if (!code && !diagnosis) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {code && (
        <span
          className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ fontSize: '9px' }}
        >
          {code}
        </span>
      )}
      {diagnosis && (
        <span className="text-sm text-gray-700">{diagnosis}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function CaseFormulation() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch athlete data
  const { data: athletes = [], isLoading: loadingAthletes } = useAthletes();
  const athlete = athletes.find((a: any) => a.id === athleteId);

  // Fetch related practitioner data
  const { data: sessions = [] } = useSessions(athleteId);
  const { data: checkins = [] } = useCheckIns(athleteId);
  const { data: assessments = [] } = useAssessments(athleteId);
  const { data: interventions = [] } = useInterventions(athleteId);

  // Fetch injury records
  const { data: injuries = [], isLoading: loadingInjuries } = useQuery<
    InjuryRecord[]
  >({
    queryKey: ['injuries', athleteId, user?.id],
    enabled: !!athleteId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('injury_records')
        .select('*')
        .eq('athlete_id', athleteId!)
        .eq('practitioner_id', user!.id)
        .order('date_of_injury', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  // Loading State
  if (loadingAthletes || loadingInjuries) {
    return (
      <AppShell>
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </AppShell>
    );
  }

  // Athlete Not Found
  if (!athlete) {
    return (
      <AppShell>
        <div className="text-center py-10">
          <p className="text-gray-500">Athlete not found.</p>
          <Button onClick={() => navigate(-1)} className="mt-4">
            <ArrowLeft size={16} className="mr-2" />
            Go Back
          </Button>
        </div>
      </AppShell>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div ref={printRef} className="space-y-6 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar
              firstName={athlete.first_name}
              lastName={athlete.last_name}
              src={athlete.avatar_url}
              size="lg"
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {athlete.first_name} {athlete.last_name}
              </h1>
              <p className="text-sm text-gray-500">
                {athlete.sport} {athlete.team && `· ${athlete.team}`}
              </p>
              <div className="flex gap-2 mt-2">
                <Badge
                  label={athlete.status.replace('_', ' ')}
                  className={statusColor(athlete.status)}
                />
                <Badge
                  label={`Risk: ${athlete.risk_level}`}
                  className={riskColor(athlete.risk_level)}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
            <Button onClick={() => window.print()}>
              <Printer size={16} className="mr-2" />
              Print
            </Button>
          </div>
        </div>

        {/* Injury Psychology Section */}
        <Card>
          <div className="p-4">
            <SectionHeader
              icon={Stethoscope}
              title="Injury Psychology"
            />

            {injuries.length === 0 ? (
              <p className="text-sm text-gray-400">
                No injury records available.
              </p>
            ) : (
              <div className="space-y-4">
                {injuries.map((r) => (
                  <div
                    key={r.id}
                    className="border border-gray-100 rounded-xl p-4"
                  >
                    <p className="text-xs text-gray-400 mb-1">
                      {fmtDate(r.date_of_injury)}
                    </p>

                    <DiagnosisBadge
                      code={r.osiics_code_1}
                      diagnosis={
                        r.osiics_diagnosis_1 ?? r.diagnosis_text
                      }
                    />

                    {r.cause_of_injury && (
                      <p className="text-xs text-gray-500 mt-2">
                        <strong>Cause:</strong> {r.cause_of_injury}
                      </p>
                    )}

                    {r.psychological_notes && (
                      <p className="text-sm text-gray-600 mt-2">
                        {r.psychological_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Confidentiality Disclaimer */}
        <Card>
          <div className="p-4">
            <SectionHeader
              icon={FileText}
              title="Confidentiality"
            />
            <p className="text-xs text-gray-500">
              {ANONYMISATION_DISCLAIMER}
            </p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
