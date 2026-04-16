import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { env } from './env.js';
import { createApp } from './app.js';
import { registerSocketHandlers } from './socket.js';

const httpServer = createServer();
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: env.clientOrigin,
    credentials: true,
  },
});
const app = createApp({ io });

registerSocketHandlers(io);
httpServer.on('request', app);

httpServer.listen(env.port, () => {
  console.log(`[SPPS API] running at http://localhost:${env.port}${env.apiBasePath}`);
});
