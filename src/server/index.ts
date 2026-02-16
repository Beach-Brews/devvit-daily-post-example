import express from 'express';
import { createServer, getServerPort } from '@devvit/web/server';

/* ========== Start Focus - Import action files ========== */
import { menuAction } from './actions/1_menuAction';
import { formAction } from './actions/2_formAction';
import { scheduledAction } from './actions/3_scheduledAction';
import { initGameAction } from './actions/4_initGameAction';
import { OnUserDeletedCallback, registerUserDeleteDetectorScheduler } from './userDeleteDetectorHelper';
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

/* ========== Start Focus - Register user-delete detector actions ========== */
const onUserDeleted: OnUserDeletedCallback =
  async (userIdOrUsername: string, isUserId: boolean) => {
    // =========================================== //
    // ========== On-User Deleted Logic ========== //
    // vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv //

    // ===========================================
    // YOUR CODE GOES HERE
    // ===========================================

    // This is where you should delete all user data you have stored.
    // Note that userIdOrUsername is **either** the UserId **OR** Username that is passed to the
    // registerUserForDeleteCheck function previously. You must register both if you need both,
    // but you should structure your Redis data using one or the other (ideally UserID).

    // Example: if you have a leaderboard and user awards saved for the UserId, you can delete that user's data
    // await redis.zRem('game:leaderboard', [userIdOrUsername]);
    // await redis.del(`usr:${userIdOrUsername}:awards`]);

    // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ //
    // ========== On-User Deleted Logic ========== //
    // =========================================== //
  };

registerUserDeleteDetectorScheduler(router, onUserDeleted);
/* ========== End Focus - Register user-delete detector actions ========== */

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = getServerPort();

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
