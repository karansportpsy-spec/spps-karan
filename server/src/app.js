import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

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

function createNoopIo() {
  const room = {
    to() {
      return room;
    },
    emit() {
      return room;
    },
  };

  return room;
}

export function createApp(options = {}) {
  const app = express();
  const io = options.io || createNoopIo();

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '4mb' }));
  app.use(morgan('dev'));

  // Support both local dev and Vercel serverless health checks.
  app.get(['/health', `${env.apiBasePath}/health`], (_req, res) => {
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

  app.use((err, _req, res, _next) => {
    console.error('[SPPS API] unhandled error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  });

  return app;
}

export default createApp;
