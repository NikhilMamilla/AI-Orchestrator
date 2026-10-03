import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuthStore } from './store/authStore';
import { useIsAdmin } from './hooks/useIsAdmin';
import GlobalFX from './components/fx/GlobalFX';
import BootLoader from './components/BootLoader';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from './lib/firebase';
import { fetchPrefs } from './lib/learning';
import { authed } from './lib/rag';
import { applyUi } from './lib/theme';

// every page's code, so it can be loaded on demand (lazy) and preloaded in the background after sign-in
const PAGES = {
  LandingPage: () => import('./pages/LandingPage'),
  LoginPage: () => import('./pages/LoginPage'),
  RegisterPage: () => import('./pages/RegisterPage'),
  DashboardPage: () => import('./pages/DashboardPage'),
  LearningSessionPage: () => import('./pages/LearningSessionPage'),
  ConceptsPage: () => import('./pages/ConceptsPage'),
  PlaygroundPage: () => import('./pages/PlaygroundPage'),
  InsightsPage: () => import('./pages/InsightsPage'),
  AskPage: () => import('./pages/AskPage'),
  AdminShell: () => import('./admin/AdminShell'),
  AdminOverview: () => import('./admin/pages/Overview'),
  AdminLearners: () => import('./admin/pages/Learners'),
  AdminContent: () => import('./admin/pages/Content'),
  AdminQuality: () => import('./admin/pages/Quality'),
  AdminStudy: () => import('./admin/pages/Study'),
  AdminSystem: () => import('./admin/pages/System'),
  AdminEngagement: () => import('./admin/pages/Engagement'),
  AdminInspector: () => import('./admin/pages/Inspector'),
  AdminAnnouncements: () => import('./admin/pages/Announcements'),
  LearnPage: () => import('./pages/LearnPage'),
  JournalPage: () => import('./pages/JournalPage'),
  EvidenceLabPage: () => import('./pages/EvidenceLabPage'),
  SettingsPage: () => import('./pages/SettingsPage'),
  VisualizerPage: () => import('./pages/VisualizerPage'),
  SharedViewPage: () => import('./pages/SharedViewPage'),
  ChallengesPage: () => import('./pages/ChallengesPage'),
};
const LandingPage = lazy(PAGES.LandingPage);
const LoginPage = lazy(PAGES.LoginPage);
const RegisterPage = lazy(PAGES.RegisterPage);
const DashboardPage = lazy(PAGES.DashboardPage);
const LearningSessionPage = lazy(PAGES.LearningSessionPage);
const ConceptsPage = lazy(PAGES.ConceptsPage);
const PlaygroundPage = lazy(PAGES.PlaygroundPage);
const InsightsPage = lazy(PAGES.InsightsPage);
const AskPage = lazy(PAGES.AskPage);
const AdminShell = lazy(PAGES.AdminShell);
const AdminOverview = lazy(PAGES.AdminOverview);
const AdminLearners = lazy(PAGES.AdminLearners);
const AdminContent = lazy(PAGES.AdminContent);
const AdminQuality = lazy(PAGES.AdminQuality);
const AdminStudy = lazy(PAGES.AdminStudy);
const AdminSystem = lazy(PAGES.AdminSystem);
const AdminEngagement = lazy(PAGES.AdminEngagement);
const AdminInspector = lazy(PAGES.AdminInspector);
const AdminAnnouncements = lazy(PAGES.AdminAnnouncements);
const LearnPage = lazy(PAGES.LearnPage);
const JournalPage = lazy(PAGES.JournalPage);
const EvidenceLabPage = lazy(PAGES.EvidenceLabPage);
const SettingsPage = lazy(PAGES.SettingsPage);
const VisualizerPage = lazy(PAGES.VisualizerPage);
const SharedViewPage = lazy(PAGES.SharedViewPage);
const ChallengesPage = lazy(PAGES.ChallengesPage);

/** Downloads every page's code while the browser is idle, so the first click on a section is instant. */
function preloadPages() {
  const run = () => Object.values(PAGES).forEach((load) => void load().catch(() => undefined));
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run); else setTimeout(run, 1200);
}

/** While sign-in or a page's code resolves: the plain "Loading…" screen that index.html also shows first. */
const Blank = BootLoader;

/** Changing page (dashboard -> ask, ...) glides back to the top, wherever the last page was scrolled to. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll<HTMLElement>('main').forEach((m) => { if (m.scrollTop > 0) m.scrollTo({ top: 0, behavior: 'smooth' }); });
  }, [pathname]);
  return null;
}

/** Removes index.html's loading screen once a real page has rendered. */
function BootDone() {
  useEffect(() => { document.getElementById('boot')?.remove(); }, []);
  return null;
}

// Protected Route components
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isInitializing } = useAuthStore();
  const { pathname } = useLocation();

  if (isInitializing) {
    return <Blank />;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" state={{ from: pathname }} replace />;   // back here after signing in
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isInitializing } = useAuthStore();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const next = from && from.startsWith('/') && !from.startsWith('//') ? from : '/home';

  if (isInitializing) {
    return <Blank />;
  }

  return !isAuthenticated ? <>{children}</> : <Navigate to={next} replace />;
};

/** Where "home" is after signing in: the admin console for admins, the learner dashboard for everyone else. */
const RoleHome = () => {
  const isAdmin = useIsAdmin();                                     // cached role, else the dashboard straight away
  return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />;   // (no waiting on the role request)
};

/** Soft cross-fade between pages. Opacity only: a transform or filter here would break the fixed dock and sticky sidebar. */
// the static first frame of the opening sequence only belongs to the landing page
if (typeof window !== 'undefined' && window.location.pathname !== '/') document.getElementById('intro-pre')?.remove();

function RouteFade({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  return (
    <motion.div key={pathname.startsWith('/admin') ? '/admin' : pathname} initial={reduce ? false : { opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.12, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}

function App() {
  const applyUser = useAuthStore((s) => s.applyUser);
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  useEffect(() => {
    if (!signedIn) return;
    preloadPages();
    fetchPrefs().then((p) => p.ui && applyUi(p.ui)).catch(() => undefined);   // appearance follows the learner across devices
    const providers = (useAuthStore.getState().user?.providers ?? []).filter((x) => x === 'password' || x === 'google.com');
    authed('/auth/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providers }) }).catch(() => undefined);
  }, [signedIn]);

  // Firebase Auth owns the session; this fires once on load and on every sign-in, sign-out and token refresh
  useEffect(() => onIdTokenChanged(auth, applyUser), [applyUser]);

  return (
    <Router>
      <GlobalFX />
      <BootDone />
      <ScrollToTop />
      <Suspense fallback={<Blank />}>
      <RouteFade>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        } />
        <Route path="/register" element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        } />

        {/* Protected Routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/home" element={<ProtectedRoute><RoleHome /></ProtectedRoute>} />
        {/* Admin console: its own shell; the server checks admin rights on every call */}
        <Route path="/admin" element={<ProtectedRoute><AdminShell /></ProtectedRoute>}>
          <Route index element={<AdminOverview />} />
          <Route path="learners" element={<AdminLearners />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="quality" element={<AdminQuality />} />
          <Route path="study" element={<AdminStudy />} />
          <Route path="system" element={<AdminSystem />} />
          <Route path="engagement" element={<AdminEngagement />} />
          <Route path="inspector" element={<AdminInspector />} />
          <Route path="announcements" element={<AdminAnnouncements />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
        <Route path="/shared/:token" element={<SharedViewPage />} />
        <Route path="/challenges" element={
          <ProtectedRoute>
            <ChallengesPage />
          </ProtectedRoute>
        } />
        <Route path="/visualize" element={
          <ProtectedRoute>
            <VisualizerPage />
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        } />
        <Route path="/lab" element={
          <ProtectedRoute>
            <EvidenceLabPage />
          </ProtectedRoute>
        } />
        <Route path="/journal" element={
          <ProtectedRoute>
            <JournalPage />
          </ProtectedRoute>
        } />
        <Route path="/learn" element={
          <ProtectedRoute>
            <LearnPage />
          </ProtectedRoute>
        } />
        <Route path="/ask" element={
          <ProtectedRoute>
            <AskPage />
          </ProtectedRoute>
        } />
        <Route path="/session/:id" element={
          <ProtectedRoute>
            <LearningSessionPage />
          </ProtectedRoute>
        } />
        <Route path="/concepts" element={
          <ProtectedRoute>
            <ConceptsPage />
          </ProtectedRoute>
        } />
        <Route path="/playground" element={
          <ProtectedRoute>
            <PlaygroundPage />
          </ProtectedRoute>
        } />
        <Route path="/insights" element={
          <ProtectedRoute>
            <InsightsPage />
          </ProtectedRoute>
        } />

        {/* Landing Page */}
        <Route path="/" element={<LandingPage />} />
      </Routes>
      </RouteFade>
      </Suspense>
    </Router>
  );
}

export default App;