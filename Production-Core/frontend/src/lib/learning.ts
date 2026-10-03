import { authed, RagError, type Level } from './rag';
import type { UiPrefs } from './theme';

export interface QuizQuestion {
    quiz_id: string;
    doc_id: string;
    title: string;
    question: string;
    options: string[];
    generated_by: 'llm' | 'template';
}

export interface AnswerResult {
    correct: boolean;
    correct_index: number;
    explanation: string;
    misconception: string;
    mastery_before: number;
    mastery_after: number;
    mastered: boolean;
    hints_used: number;
    decision: { action: 'advance' | 'deepen' | 'remediate' | 'review' | 'complete'; reasoning: string; focus: string | null };
    next: { id: string; title: string }[];
}

export interface PathStep {
    id: string;
    title: string;
    level: number;
    domain: string;
    mastery: number;
    why: string;
}

export interface ReviewItem {
    id: string;
    title: string;
    due: string;
    overdue: boolean;
    mastery: number;
    retention: number;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
    if (res.ok) return res.json();
    let detail = fallback;
    try {
        detail = (await res.json()).detail ?? fallback;
    } catch {
        /* keep fallback */
    }
    if (res.status === 429) detail = 'Slow down a little: too many questions in a minute.';
    throw new RagError(typeof detail === 'string' ? detail : fallback, res.status);
}

export async function createQuiz(docId: string, level: Level, chunkId?: string): Promise<QuizQuestion> {
    const res = await authed('/learning/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_id: docId, chunk_id: chunkId, level }),
    });
    return json(res, 'Could not create a question right now.');
}

export type Confidence = 'guess' | 'unsure' | 'sure';

export interface Hint {
    level: 1 | 2;
    text: string;
    eliminate: number | null;
    source?: string;
    heading?: string;
}

export async function answerQuiz(quizId: string, chosen: number, confidence?: Confidence): Promise<AnswerResult> {
    const res = await authed('/learning/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quiz_id: quizId, chosen, confidence, tz_offset_min: new Date().getTimezoneOffset() }),
    });
    return json(res, 'Could not record your answer.');
}

export async function fetchPath(goal?: string): Promise<{ steps: PathStep[]; minutes_estimate: number }> {
    return json(await authed(`/learning/path${goal ? `?goal=${encodeURIComponent(goal)}` : ''}`), 'Could not load your roadmap.');
}

export async function fetchReview(): Promise<ReviewItem[]> {
    return json(await authed('/learning/review'), 'Could not load your review queue.');
}

export interface Signal {
    id: string;
    severity: 'info' | 'warn';
    title: string;
    detail: string;
    action: string;
    ask?: string;
}

export interface Insights {
    attempts: number;
    accuracy: number | null;
    median_seconds: number | null;
    signals: Signal[];
    confusions: { concept_title: string; confused_title: string; count: number }[];
    best_time_of_day: { bucket: string; accuracy: number; n: number } | null;
    note: string | null;
}

export interface PlanBlock {
    type: 'remediate' | 'review' | 'practice' | 'new';
    concept: string;
    title: string;
    minutes: number;
    level: Level;
    why: string;
}

export interface SessionPlan {
    minutes: number;
    split: { new: number; practice: number; review: number };
    blocks: PlanBlock[];
    notes: string[];
    difficulty_mix: { questions: number; comfortable: number; challenging: number; stretch: number };
}

export async function fetchInsights(): Promise<Insights> {
    return json(await authed('/learning/insights'), 'Could not load your learning insights.');
}

export async function fetchPlan(minutes?: number, level: Level = 'beginner'): Promise<SessionPlan> {
    const q = minutes ? `minutes=${minutes}&` : '';       // omitted: the server uses the learner's saved session length
    return json(await authed(`/learning/plan?${q}level=${level}`), 'Could not build your session plan.');
}

export type DiagnosticStep =
    | { done: false; quiz: QuizQuestion; progress: { asked: number; target: number } }
    | { done: true; progress: { asked: number; target: number }; assumed_known: string[]; likely_gaps: string[] };

export async function diagnosticNext(level: Level = 'beginner'): Promise<DiagnosticStep> {
    return json(await authed(`/learning/diagnostic/next?level=${level}`, { method: 'POST' }), 'Could not start the placement check.');
}

export async function diagnosticReset(): Promise<void> {
    await json(await authed('/learning/diagnostic', { method: 'DELETE' }), 'Could not reset the placement check.');
}

export interface GoalPlan {
    goal: { concept: string | null; deadline: string; daily_minutes: number } | null;
    status?: 'on_track' | 'tight' | 'unrealistic' | 'done' | 'past_deadline';
    advice?: string;
    assumption?: string;
    days_left?: number;
    remaining_concepts?: number;
    unscheduled_concepts?: number;
    weeks?: { week: number; minutes: number; concepts: { id: string; title: string }[] }[];
}

export async function fetchGoal(): Promise<GoalPlan> {
    return json(await authed('/learning/goal'), 'Could not load your goal.');
}

export async function saveGoal(goal: string | null, deadline: string, dailyMinutes: number): Promise<GoalPlan> {
    const res = await authed('/learning/goal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, deadline, daily_minutes: dailyMinutes }),
    });
    return json(res, 'Could not save your goal.');
}

export interface Journal {
    days: number;
    from: string;
    to: string;
    answers: number;
    correct: number;
    accuracy: number | null;
    active_days: number;
    minutes_answering: number;
    time_note: string;
    concepts_practiced: { id: string; title: string; answers: number; accuracy: number }[];
    mastered_now: string[];
    overcame: string[];
    needs_work: { id: string; title: string; mastery: number }[];
    recurring_mix_ups: { concept: string; confused_with: string; times: number }[];
    overall_mastery_change: { from: number; to: number; delta: number } | null;
}

export async function fetchJournal(days = 7): Promise<Journal> {
    return json(await authed(`/learning/journal?days=${days}`), 'Could not load your journal.');
}

export async function requestHint(quizId: string): Promise<Hint> {
    const res = await authed('/learning/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quiz_id: quizId }),
    });
    return json(res, 'No hint available right now.');
}

export interface Challenge {
    id: string;
    concept: string;
    kind: 'debug' | 'write';
    title: string;
    prompt: string;
    starter: string;
    sample: { input: string; output: string };
    tests: number;
    passed: boolean;
    fails: number;
    hint_taken?: boolean;
    hint?: string;
    solution?: string;
}

export interface ChallengeResult {
    passed: boolean;
    tests_passed: number;
    tests_total: number;
    results: { ok: boolean; status: string; error: string | null; got: string | null }[];
    challenge: Challenge;
    mastery_before: number;
    mastery_after: number;
    decision: { action: string; reasoning: string } | null;
}

export async function fetchChallenges(): Promise<Challenge[]> {
    return json(await authed('/learning/challenges'), 'Could not load the challenges.');
}

export async function takeChallengeHint(id: string): Promise<Challenge> {
    return json(await authed(`/learning/challenges/${id}/hint`, { method: 'POST' }), 'No hint available right now.');
}

export async function submitChallenge(id: string, code: string): Promise<ChallengeResult> {
    const res = await authed(`/learning/challenges/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
    });
    return json(res, 'Could not run your code.');
}


// ---------- Teach-back ----------
export interface TeachBackResult {
    graded: boolean;
    reason: string | null;
    score: number | null;
    accuracy: number | null;
    coverage: number | null;
    passed: boolean;
    claims: { text: string; status: 'supported' | 'weak' | 'unsupported'; support: number }[];
    points: { point: string; score: number; covered: boolean }[];
    concept: { id: string; title: string };
    mastery_before?: number;
    mastery_after?: number;
    mastery_updated?: boolean;
    note?: string;
}

const postJson = (path: string, body: unknown) =>
    authed(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function teachBack(docId: string, explanation: string): Promise<TeachBackResult> {
    return json(await postJson('/learning/teachback', { doc_id: docId, explanation }), 'Could not check your explanation right now.');
}

// ---------- Evidence Lab ----------
export interface StudyStatus {
    joined: boolean;
    step: 'join' | 'pre' | 'post' | 'done';
    concepts: string[];
    pre_score?: number | null;
    post_score?: number | null;
    pre_answered?: number;
    post_answered?: number;
}
export interface StudyItem { quiz_id: string; doc_id: string; question: string; options: string[]; answered: boolean }
export interface StudyResult { pre: number; post: number; gain: number; items_per_test: number }
export interface StudyReport {
    joined: number;
    pre_done: number;
    completed: number;
    result: {
        n: number; mean_pre?: number; mean_post?: number; mean_gain?: number; normalised_gain?: number | null;
        cohens_dz?: number | null; ci95?: [number, number]; p_value?: number | null; verdict: string;
    };
    design: { items_per_test: number; concepts: string[]; control_group: boolean };
}

export const studyStatus = async (): Promise<StudyStatus> => json(await authed('/learning/study'), 'Could not load the study.');
export const studyJoin = async (): Promise<StudyStatus> => json(await postJson('/learning/study/join', { consent: true }), 'Could not join the study.');
export const studyStart = async (phase: 'pre' | 'post'): Promise<{ phase: string; items: StudyItem[] }> =>
    json(await postJson(`/learning/study/${phase}/start`, {}), 'Could not build the test right now.');
export const studyAnswer = async (phase: 'pre' | 'post', quizId: string, chosen: number): Promise<StudyStatus> =>
    json(await postJson(`/learning/study/${phase}/answer`, { quiz_id: quizId, chosen }), 'Could not record your answer.');
export const studyResult = async (): Promise<StudyResult> => json(await authed('/learning/study/result'), 'Could not load your result.');
export async function studyReport(): Promise<StudyReport | null> {
    const role = await authed('/learning/study/role');
    if (!role.ok || !(await role.json()).admin) return null;     // ordinary learners never request the organiser report
    const res = await authed('/learning/study/admin/report');
    return res.ok ? res.json() : null;
}


// ---------- Sketch check ----------
export type SketchKind = 'bst' | 'min-heap' | 'max-heap';
export interface SketchResult {
    kind: SketchKind;
    ok: boolean;
    checked: boolean;
    reliable: boolean;
    findings: { rule: string; message: string }[];
    reading: { nodes: number; outline: string };
}

export async function checkSketch(kind: SketchKind, image: string): Promise<SketchResult> {
    return json(await postJson('/learning/sketch', { kind, image }), 'Could not check your drawing right now.');
}


// ---------- Preferences, leaderboard, data controls ----------
export interface Prefs {
    style: 'auto' | 'default' | 'socratic' | 'worked_example' | 'analogy';
    tone: 'encouraging' | 'neutral' | 'challenging';
    session_minutes: number;
    leaderboard_nickname: string | null;
    ui?: UiPrefs;
}
export interface Board {
    top: { rank: number; nickname: string; points: number; you: boolean }[];
    you: { rank: number; nickname: string; points: number } | null;
    participants: number;
}

export const fetchPrefs = async (): Promise<Prefs> => json(await authed('/learning/preferences'), 'Could not load your settings.');
export const savePrefs = async (patch: Partial<Omit<Prefs, 'ui'>> & { ui?: Partial<UiPrefs> }): Promise<Prefs> =>
    json(await authed('/learning/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }), 'Could not save your settings.');
export const optInLeaderboard = async (nickname: string | null): Promise<Prefs> =>
    json(await authed('/learning/leaderboard/optin', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname }) }), 'Could not update the leaderboard.');
export const fetchLeaderboard = async (): Promise<Board> => json(await authed('/learning/leaderboard'), 'Could not load the leaderboard.');
export async function deleteMyData(): Promise<void> {
    await json(await authed('/learning/data', { method: 'DELETE' }), 'Could not delete your data.');
}

// ---------- coding profiles (Settings) ----------
export type Platform = 'github' | 'leetcode' | 'codeforces' | 'hackerrank' | 'codechef';
export interface ProfileCard {
    platform: Platform; name: string; handle: string; url: string; live: boolean; ok: boolean;
    stats: { label: string; value: string | number }[]; note: string | null; fetched_at: number;
}
export interface Verification { verified: boolean; verified_at: string | null; code: string; where: string }
export interface CodingProfiles { handles: Partial<Record<Platform, string>>; cards: ProfileCard[]; verification: Partial<Record<Platform, Verification>> }
export const verifyCodingProfile = async (platform: Platform): Promise<CodingProfiles & { verified: boolean; reason: string | null }> =>
    json(await authed(`/learning/coding-profiles/${platform}/verify`, { method: 'POST' }), 'Could not check that profile right now.');

export interface DataSummary {
    quiz_answers: number; code_runs: number; agent_decisions: number; share_links: number; live_share_links: number;
    concepts_tracked: number; attempts_logged: number; coding_profiles: number; has_goal: boolean; in_study: boolean;
    on_leaderboard: boolean; profile_updated_at: string | null;
}
export type DataPart = 'code_runs' | 'agent_history' | 'share_links' | 'coding_profiles';
export const fetchDataSummary = async (): Promise<DataSummary> => json(await authed('/learning/data/summary'), 'Could not load your data summary.');
export const deletePartOfData = async (part: DataPart): Promise<{ deleted: string; affected: number | null }> =>
    json(await authed(`/learning/data/${part}`, { method: 'DELETE' }), 'Could not delete that.');
export const fetchCodingProfiles = async (refresh = false): Promise<CodingProfiles> =>
    json(await authed(`/learning/coding-profiles${refresh ? '?refresh=true' : ''}`), 'Could not load your coding profiles.');
export const saveCodingProfiles = async (handles: Partial<Record<Platform, string>>): Promise<CodingProfiles> =>
    json(await authed('/learning/coding-profiles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(handles) }), 'Could not save your coding profiles.');


// ---------- Announcements, study rhythm, data export ----------
export interface LearnerAnnouncement { id: number; text: string; level: 'info' | 'warning'; created_at: string; live: boolean }
export interface Rhythm {
    weekdays: string[]; grid: number[][]; answers: number; active_days: number; streak: number;
    peak: { day: string; hour: number } | null; best_day: string | null;
    weekly: { weeks_ago: number; answers: number; accuracy: number | null }[];
}
export const fetchAnnouncements = async (): Promise<{ announcements: LearnerAnnouncement[] }> =>
    json(await authed('/learning/announcements'), 'Could not load announcements.');
export const fetchRhythm = async (): Promise<Rhythm> => json(await authed('/learning/rhythm'), 'Could not load your study rhythm.');
export async function downloadMyData(): Promise<void> {
    const res = await authed('/learning/export');
    if (!res.ok) throw new RagError('Could not export your data right now.', res.status);
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement('a'), { href: url, download: 'kiddoo-my-data.json' }).click();
    URL.revokeObjectURL(url);
}
