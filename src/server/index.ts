import express from 'express';
import { createServer, getServerPort } from '@devvit/web/server';

/* ========== Start Focus - Import action files ========== */
import { menuAction } from './actions/1_menuAction';
import { formAction } from './actions/2_formAction';
import { scheduledAction } from './actions/3_scheduledAction';
import { initGameAction } from './actions/4_initGameAction';
/* ========== End Focus - Import action files ========== */

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

/* ========== Start Focus - Register game actions ========== */
menuAction(router);
formAction(router);
scheduledAction(router);
initGameAction(router);
/* ========== End Focus - Register game actions ========== */

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = getServerPort();

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
