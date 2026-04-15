import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { env } from './env.js';
import { authenticateRequest } from './middleware/auth.js';
import { registerAuthRoutes } from './routes/authRoutes.js';
import { registerAthleteRoutes } from './routes/athleteRoutes.js';
import { registerAssessmentRoutes } from './routes/assessmentRoutes.js';
import { registerInterventionRoutes } from './routes/interventionRoutes.js';
import { registerConsentRoutes } from './routes/consentRoutes.js';
import { registerInjuryRoutes } from './routes/injuryRoutes.js';
import { registerCaseRoutes } from './routes/caseRoutes.js';
import { registerMessageRoutes } from './routes/messageRoutes.js';
import { registerSocketHandlers } from './socket.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: env.clientOrigin,
    credentials: true,
  },
});

app.use(helmet());
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: '4mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'spps-api', timestamp: new Date().toISOString() });
});

registerAuthRoutes(app);

app.use(env.apiBasePath, authenticateRequest);
registerAthleteRoutes(app);
registerAssessmentRoutes(app);
registerInterventionRoutes(app);
registerConsentRoutes(app);
registerInjuryRoutes(app);
registerCaseRoutes(app);
registerMessageRoutes(app, io);

registerSocketHandlers(io);

app.use((err, _req, res, _next) => {
  console.error('[SPPS API] unhandled error:', err);
  res.status(500).json({ message: 'Internal server error.' });
});

httpServer.listen(env.port, () => {
  console.log(`[SPPS API] running at http://localhost:${env.port}${env.apiBasePath}`);
});
