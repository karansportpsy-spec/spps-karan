import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import { env } from './env.js';
import { authenticateRequest } from './middleware/auth.js';
import { registerAthleteRoutes } from './routes/athleteRoutes.js';
import { registerAssessmentRoutes } from './routes/assessmentRoutes.js';
import { registerInterventionRoutes } from './routes/interventionRoutes.js';
import { registerConsentRoutes } from './routes/consentRoutes.js';
import { registerInjuryRoutes } from './routes/injuryRoutes.js';
import { registerCaseRoutes } from './routes/caseRoutes.js';
import { registerMessageRoutes } from './routes/messageRoutes.js';
import { registerBillingRoutes, registerBillingWebhookRoutes } from './routes/billingRoutes.js';
import { registerBookingRoutes } from './routes/bookingRoutes.js';
import { registerClinicalRoutes } from './routes/clinicalRoutes.js';
import { registerProfileRoutes } from './routes/profileRoutes.js';
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
registerBillingWebhookRoutes(app);
app.use(express.json({ limit: '4mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'spps-api', timestamp: new Date().toISOString() });
});

app.use(env.apiBasePath, authenticateRequest);
registerAthleteRoutes(app);
registerAssessmentRoutes(app);
registerInterventionRoutes(app);
registerConsentRoutes(app);
registerInjuryRoutes(app);
registerCaseRoutes(app);
registerMessageRoutes(app, io);
registerBillingRoutes(app);
registerBookingRoutes(app);
registerClinicalRoutes(app);
registerProfileRoutes(app);

registerSocketHandlers(io);

app.use((err, _req, res, _next) => {
  console.error('[SPPS API] unhandled error:', err);
  res.status(500).json({ message: 'Internal server error.' });
});

const currentFilePath = fileURLToPath(import.meta.url);
const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === currentFilePath;

if (isDirectRun) {
  httpServer.listen(env.port, () => {
    console.log(`[SPPS API] running at http://localhost:${env.port}${env.apiBasePath}`);
  });
}

export { app, httpServer, io };
export default app;
