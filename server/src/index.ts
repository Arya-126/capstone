import express, { Express } from 'express';
import cors from 'cors';
import 'dotenv/config';
import authRoutes from './routes/auth';
import topicsRoutes from './routes/topics';
import gamesRoutes from './routes/games';
import dashboardRoutes from './routes/dashboard';
import domainsRoutes from './routes/domains';
import achievementsRoutes from './routes/achievements';
import interviewRoutes from './routes/interview';
import leaderboardRoutes from './routes/leaderboard';
import adminRoutes from './routes/admin';
import codeRoutes from './routes/code';
import assessmentsRoutes from './routes/assessments';
import aiInterviewRoutes from './routes/aiInterview';
import companiesRoutes from './routes/companies';
import cohortsRoutes from './routes/cohorts';
import friendsRoutes from './routes/friends';
import contestsRoutes from './routes/contests';
import codingTracksRoutes from './routes/codingTracks';
import hrRoutes from './routes/hr';
import coreSubjectRoutes from './routes/coreSubject';
import questsRoutes from './routes/quests';
import placementDriveRoutes from './routes/placementDrive';
import prepTrackerRoutes from './routes/prepTracker';
import diagnosticRoutes from './routes/diagnostic';
import pipelineRoutes from './routes/pipeline';
import reportsRoutes from './routes/reports';
import gamesContentRoutes from './routes/gamesContent';
import { authMiddleware } from './middleware/auth';

const app: Express = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
// 2mb: proctoring snapshots arrive as base64 JPEG data URLs
app.use(express.json({ limit: '2mb' }));

// Routes
app.use('/auth', authRoutes);
app.use('/topics', topicsRoutes);
app.use('/games', gamesRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/domains', domainsRoutes);
app.use('/achievements', achievementsRoutes);
app.use('/interview', interviewRoutes);
app.use('/leaderboard', leaderboardRoutes);
app.use('/admin', adminRoutes);
app.use('/code', codeRoutes);
app.use('/assessments', assessmentsRoutes);
app.use('/ai-interview', aiInterviewRoutes);
app.use('/companies', companiesRoutes);
app.use('/cohorts', cohortsRoutes);
app.use('/friends', friendsRoutes);
app.use('/contests', contestsRoutes);
app.use('/coding-tracks', codingTracksRoutes);
app.use('/hr', hrRoutes);
app.use('/core-subjects', coreSubjectRoutes);
app.use('/quests', questsRoutes);
app.use('/placement-drive', placementDriveRoutes);
app.use('/prep-tracker', prepTrackerRoutes);
// /diagnostic/start, /diagnostic/:id/submit, /diagnostic/profile
app.use('/diagnostic', diagnosticRoutes);
// /pipeline/current, /pipeline/create, /pipeline/:id/skip-stage/:stageId
app.use('/pipeline', pipelineRoutes);
// /reports/:id, /reports?limit=, /reports/synopsis/:subject/:concept
app.use('/reports', reportsRoutes);
// /games-content/star-roleplay/random, /games-content/time-rush/random
app.use('/games-content', gamesContentRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: '🎮 LearnHub API Server', status: 'running', endpoints: ['/health', '/auth/login', '/auth/register', '/topics', '/games', '/dashboard'] });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Test protected route
app.get('/protected', authMiddleware, (req, res) => {
  res.json({ message: 'This is a protected route', userId: (req as any).userId });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Phase 1 server initialized`);
});
