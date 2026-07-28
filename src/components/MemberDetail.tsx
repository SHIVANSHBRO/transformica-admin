import { Fragment, useEffect, useState } from 'react';
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

        <WorkoutLog memberId={member.id} />
        <DietLog memberId={member.id} />
      </div>
    </div>
  );
}

type LoggedSet = { weightKg: number; reps: number; rir: number | null };
type LoggedDay = {
  date: string;
  exercises: { name: string; sets: LoggedSet[] }[];
  totalSets: number;
  volumeKg: number;
  avgRir: number | null;
};

function repsOf(reps: string | null): number {
  const m = reps?.match(/\d+/g);
  return m ? Math.max(...m.map(Number)) : 0;
}

// What the member actually trained, last 30 days. Read with the admin's own
// session — workout_logs already has an admin select policy, no service key.
function WorkoutLog({ memberId }: { memberId: string }) {
  const [days, setDays] = useState<LoggedDay[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from('workout_logs')
        .select(
          'completed_at, actual_sets, actual_reps, actual_weight_kg, rir, plan_exercise:workout_plan_exercises(exercise:exercises(name))'
        )
        .eq('client_id', memberId)
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: false });
      if (cancelled) return;

      type Raw = {
        completed_at: string;
        actual_sets: number | null;
        actual_reps: string | null;
        actual_weight_kg: number | null;
        rir: number | null;
        plan_exercise: { exercise: { name: string } | null } | null;
      };

      const byDay = new Map<string, Map<string, LoggedSet[]>>();
      for (const row of ((data ?? []) as unknown as Raw[])) {
        const name = row.plan_exercise?.exercise?.name;
        if (!name) continue;
        const day = row.completed_at.slice(0, 10);
        const dayMap = byDay.get(day) ?? new Map<string, LoggedSet[]>();
        const sets = dayMap.get(name) ?? [];
        for (let i = 0; i < (row.actual_sets ?? 1); i++) {
          sets.push({ weightKg: row.actual_weight_kg ?? 0, reps: repsOf(row.actual_reps), rir: row.rir });
        }
        dayMap.set(name, sets);
        byDay.set(day, dayMap);
      }

      setDays(
        [...byDay.entries()]
          .map(([date, exMap]) => {
            const exercises = [...exMap.entries()].map(([name, sets]) => ({ name, sets }));
            const all = exercises.flatMap((e) => e.sets);
            const rated = all.filter((s) => s.rir != null);
            return {
              date,
              exercises,
              totalSets: all.length,
              volumeKg: Math.round(all.reduce((sum, s) => sum + s.weightKg * s.reps, 0)),
              avgRir: rated.length ? Math.round((rated.reduce((sum, s) => sum + s.rir!, 0) / rated.length) * 10) / 10 : null,
            };
          })
          .sort((a, b) => b.date.localeCompare(a.date))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  return (
    <>
      <h3 style={{ marginTop: 18 }}>Workout log <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>last 30 days</span></h3>
      {days === null && <p className="muted">Loading…</p>}
      {days?.length === 0 && <p className="muted">Nothing logged in the last 30 days.</p>}
      {days && days.length > 0 && (
        <table>
          <thead>
            <tr><th>Day</th><th>Sets</th><th>Volume</th><th>Avg RIR</th><th></th></tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <Fragment key={d.date}>
                <tr>
                  <td><strong>{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</strong></td>
                  <td>{d.totalSets}</td>
                  <td>{d.volumeKg.toLocaleString('en-IN')} kg</td>
                  {/* Everything at or near failure is the signal worth flagging. */}
                  <td>{d.avgRir != null ? <span className={`badge ${d.avgRir <= 0.5 ? 'warn' : 'dim'}`}>{d.avgRir}</span> : <span className="muted">—</span>}</td>
                  <td>
                    <button className="btn ghost small" onClick={() => setOpen(open === d.date ? null : d.date)}>
                      {open === d.date ? 'Hide' : 'Sets'}
                    </button>
                  </td>
                </tr>
                {open === d.date && (
                  <tr>
                    <td colSpan={5}>
                      {d.exercises.map((e) => (
                        <div key={e.name} style={{ marginBottom: 6 }}>
                          <strong>{e.name}</strong>
                          <span className="muted" style={{ marginLeft: 8 }}>
                            {e.sets.map((s) => `${s.weightKg || 0}×${s.reps}${s.rir != null ? ` @${s.rir}` : ''}`).join('  ·  ')}
                          </span>
                        </div>
                      ))}
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>@n = reps left in the tank. @0 = went to failure.</p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

type DietDay = { date: string; kcal: number; protein: number; carbs: number; fat: number; meals: number };

// Daily nutrition rollup, last 14 days — enough to see adherence without
// drowning the modal in individual meal rows.
function DietLog({ memberId }: { memberId: string }) {
  const [days, setDays] = useState<DietDay[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const { data } = await supabase
        .from('nutrition_log')
        .select('logged_at, kcal, protein_g, carbs_g, fat_g')
        .eq('user_id', memberId)
        .gte('logged_at', since.toISOString())
        .order('logged_at', { ascending: false });
      if (cancelled) return;

      const byDay = new Map<string, DietDay>();
      for (const r of (data ?? []) as { logged_at: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }[]) {
        const day = r.logged_at.slice(0, 10);
        const d = byDay.get(day) ?? { date: day, kcal: 0, protein: 0, carbs: 0, fat: 0, meals: 0 };
        d.kcal += r.kcal ?? 0;
        d.protein += Number(r.protein_g) || 0;
        d.carbs += Number(r.carbs_g) || 0;
        d.fat += Number(r.fat_g) || 0;
        d.meals += 1;
        byDay.set(day, d);
      }
      setDays([...byDay.values()].sort((a, b) => b.date.localeCompare(a.date)));
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  return (
    <>
      <h3 style={{ marginTop: 18 }}>Diet log <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>last 14 days</span></h3>
      {days === null && <p className="muted">Loading…</p>}
      {days?.length === 0 && <p className="muted">No meals logged in the last 14 days.</p>}
      {days && days.length > 0 && (
        <table>
          <thead>
            <tr><th>Day</th><th>Meals</th><th>Kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td><strong>{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</strong></td>
                <td>{d.meals}</td>
                <td>{Math.round(d.kcal).toLocaleString('en-IN')}</td>
                <td>{Math.round(d.protein)} g</td>
                <td>{Math.round(d.carbs)} g</td>
                <td>{Math.round(d.fat)} g</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
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
