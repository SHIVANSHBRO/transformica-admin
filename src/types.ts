export type Profile = {
  id: string;
  role: 'client' | 'coach' | 'admin';
  first_name: string;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  plan: 'free' | 'lite' | 'pro' | 'pro_max';
  plan_expires_at: string | null;
  daily_kcal_target: number | null;
  daily_protein_target: number | null;
  daily_carbs_target: number | null;
  daily_fat_target: number | null;
  target_weight_kg: number | null;
  start_weight_kg: number | null;
  created_at: string;
};

export type CoachLink = {
  id: string;
  coach_id: string;
  client_id: string;
  status: 'lead' | 'active' | 'paused' | 'churned';
  assigned_at: string;
};

export type Exercise = {
  id: string;
  name: string;
  muscle_group: string;
  is_compound: boolean;
  equipment?: string;
  difficulty?: string;
  video_url?: string | null;
  gif_url?: string | null;
};

export type Video = {
  id: string;
  title: string;
  category: 'workout' | 'diet' | 'motivation';
  youtube_url: string;
  description: string | null;
  published: boolean;
  created_at: string;
};

export type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  color_start: string;
  color_end: string;
  link_type: 'none' | 'url' | 'screen';
  link_value: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
};

export type Challenge = {
  id: string;
  title: string;
  subtitle: string | null;
  goal_label: string;
  participants: number;
  accent: string;
  duration_days: number;
  created_at: string;
};

export type TaskFieldType = 'text' | 'number' | 'image';
export type TaskField = { key: string; label: string; type: TaskFieldType; required?: boolean };

export type ChallengeTask = {
  id: string;
  challenge_id: string;
  title: string;
  description: string | null;
  order_index: number;
  fields: TaskField[];
  created_at: string;
};

export type ChallengeSubmission = {
  id: string;
  task_id: string;
  challenge_id: string;
  user_id: string;
  values: Record<string, string | number>;
  created_at: string;
};

// Accepts every common YouTube URL shape or a bare 11-char id.
export function youtubeIdFrom(url: string): string | null {
  const m =
    url.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/) ||
    url.trim().match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}

export type Supplement = {
  id: string;
  name: string;
  brand: string;
  origin: string | null;
  description: string | null;
  price_inr: number;
  category: string;
  rating: number | null;
  in_stock: boolean;
  image_url: string | null;
  created_at: string;
};

export type Recipe = {
  id: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number | null;
  fat_g: number | null;
  tag: string | null;
  instructions: string | null;
  image_url: string | null;
  featured: boolean;
  created_at: string;
};

export type Story = {
  id: string;
  name: string;
  age: number | null;
  headline: string;
  quote: string | null;
  before_url: string;
  after_url: string;
  duration_weeks: number | null;
  active: boolean;
  sort_order: number;
  created_at: string;
};

export type WorkoutPlan = {
  id: string;
  client_id: string;
  coach_id: string | null;
  title: string;
  starts_on: string;
  created_at: string;
};

export type DietMealItem = { name: string; qty: string; kcal: string };
export type DietMeal = { meal: string; items: DietMealItem[] };

export type DietPlan = {
  id: string;
  user_id: string;
  title: string;
  daily_kcal: number | null;
  daily_protein_g: number | null;
  daily_carbs_g: number | null;
  daily_fat_g: number | null;
  meals: DietMeal[];
  notes: string | null;
  active: boolean;
  created_at: string;
};

export type WorkoutTemplate = {
  id: string;
  title: string;
  created_at: string;
};

export type WorkoutTemplateExercise = {
  id: string;
  template_id: string;
  exercise_id: string;
  sets: number;
  reps: string;
  target_weight_kg: number | null;
  set_weights_kg: (number | null)[] | null;
  time_under_tension_sec: number | null;
  rest_seconds: number | null;
  order_index: number;
};

export type DietTemplate = {
  id: string;
  title: string;
  daily_kcal: number | null;
  daily_protein_g: number | null;
  daily_carbs_g: number | null;
  daily_fat_g: number | null;
  meals: DietMeal[];
  notes: string | null;
  created_at: string;
};

export const PLAN_LABELS: Record<Profile['plan'], string> = {
  free: 'Free',
  lite: 'Lite',
  pro: 'Pro',
  pro_max: 'Pro Max',
};

export type FeedbackRow = {
  id: string;
  user_id: string;
  kind: 'general' | 'weekly';
  message: string | null;
  answers: Record<string, string> | null;
  created_at: string;
};

export function displayName(p: Pick<Profile, 'first_name' | 'last_name'>) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

/** Days until a date; negative = already past. Null when no date. */
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}
