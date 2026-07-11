import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { PLAN_LABELS, Profile, displayName } from '../types';
import { ExpiryBadge } from '../pages/Members';

type Intake = {
  primary_goal: string | null;
  experience_level: string | null;
  training_days_per_week: number | null;
  dietary_preference: string | null;
  injuries: string | null;
  medical_conditions: string | null;
  completed: boolean;
};

type Vitals = {
  startWeight: number | null;
  currentWeight: number | null;
  bp: string | null;
  waist: number | null;
};

export function MemberDetail({ member, coachName, onClose }: { member: Profile; coachName: string | null; onClose: () => void }) {
  const [intake, setIntake] = useState<Intake | null | undefined>(undefined);
  const [vitals, setVitals] = useState<Vitals | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [intakeRes, weightRes, sysRes, diaRes, measureRes] = await Promise.all([
        supabase.from('intake_forms').select('*').eq('user_id', member.id).maybeSingle(),
        supabase.from('vitals_log').select('value, recorded_at').eq('user_id', member.id).eq('metric_type', 'weight_kg').order('recorded_at'),
        supabase.from('vitals_log').select('value').eq('user_id', member.id).eq('metric_type', 'bp_systolic').order('recorded_at', { ascending: false }).limit(1),
        supabase.from('vitals_log').select('value').eq('user_id', member.id).eq('metric_type', 'bp_diastolic').order('recorded_at', { ascending: false }).limit(1),
        supabase.from('body_measurements').select('waist_cm').eq('user_id', member.id).order('recorded_at', { ascending: false }).limit(1),
      ]);
      if (cancelled) return;
      setIntake((intakeRes.data as Intake | null) ?? null);
      const weights = weightRes.data ?? [];
      setVitals({
        startWeight: member.start_weight_kg ?? (weights[0] ? Number(weights[0].value) : null),
        currentWeight: weights.length ? Number(weights[weights.length - 1].value) : null,
        bp: sysRes.data?.[0] && diaRes.data?.[0] ? `${Number(sysRes.data[0].value)}/${Number(diaRes.data[0].value)}` : null,
        waist: measureRes.data?.[0]?.waist_cm != null ? Number(measureRes.data[0].waist_cm) : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [member.id, member.plan]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0 }}>{displayName(member)}</h2>
          <span className="badge dim">{PLAN_LABELS[member.plan]}</span>
          <ExpiryBadge date={member.plan_expires_at} />
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>Close</button>
        </div>

        <div className="detail-grid" style={{ marginTop: 14 }}>
          <Fact label="Phone" value={member.phone ?? '—'} />
          <Fact label="Coach" value={coachName ?? 'Unassigned'} />
          <Fact label="Joined" value={new Date(member.created_at).toLocaleDateString()} />
          <Fact label="Weight now" value={vitals?.currentWeight != null ? `${vitals.currentWeight} kg` : '—'} />
          <Fact label="Started at" value={vitals?.startWeight != null ? `${vitals.startWeight} kg` : '—'} />
          <Fact label="Target" value={member.target_weight_kg != null ? `${member.target_weight_kg} kg` : '—'} />
          <Fact label="Latest BP" value={vitals?.bp ?? '—'} />
          <Fact label="Waist" value={vitals?.waist != null ? `${vitals.waist} cm` : '—'} />
          <Fact label="Kcal target" value={member.daily_kcal_target != null ? `${member.daily_kcal_target}` : '—'} />
        </div>

        <h3 style={{ marginTop: 18 }}>Consultation form {intake === null && <span className="badge warn">not filled yet</span>}{intake?.completed && <span className="badge ok">completed</span>}</h3>
        {intake ? (
          <div className="detail-grid">
            <Fact label="Primary goal" value={intake.primary_goal ?? '—'} />
            <Fact label="Experience" value={intake.experience_level ?? '—'} />
            <Fact label="Days / week" value={intake.training_days_per_week != null ? String(intake.training_days_per_week) : '—'} />
            <Fact label="Diet" value={intake.dietary_preference ?? '—'} />
            <Fact label="Injuries" value={intake.injuries || 'None reported'} wide />
            <Fact label="Medical" value={intake.medical_conditions || 'None reported'} wide />
          </div>
        ) : intake === null ? (
          <p className="muted">Ask them to fill it from the app's side menu before their consultation.</p>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}
