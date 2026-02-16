/*
 * This file defines methods to register or de-register users for delete detection, and the
 * scheduler that runs to check for deleted users.
 *
 * See https://developers.reddit.com/docs/capabilities/server/scheduler
 * and https://developers.reddit.com/docs/capabilities/server/redis
 *
 * u/beach-brews
 *
How to Use
==========

1. Add scheduler configuration to your devvit.json

  ```json
  {
    "scheduler": {
      "tasks": {
        "check-deleted-users-task": {
          "endpoint": "/internal/scheduler/check-deleted-users",
          "cron": "0/5 * * * *"
        }
      }
    }
  }
  ```

2. In your /src/server/index.ts import the `registerUserDeleteDetectorScheduler` and pass the
router to the `registerUserDeleteDetectorScheduler` function.

  ```ts
  import { registerUserDeleteDetectorScheduler } from './userDeleteDetector';
  // ...
  const router = express.Router();
  registerUserDeleteDetectorScheduler(router);
  ```

3. To register a user for deletion checking, import and call the `registerUserForDeleteCheck`
function with the UserID (preferred) or Username to watch for deletion. Keep in mind only the
value passed will be received when the user account is deleted. If you pass UserID, you will NOT
be able to receive the Username once deleted, and vice versa.

  ```ts
  import { registerUserForDeleteCheck } from './userDeleteDetector';
  // ...

  // Add user to leaderboard with score of 100 and give the user an award, but first
  // register the user's UserID for delete checks
  const user = await reddit.getCurrentUser();
  await registerUserForDeleteCheck(user.id);
  await redis.zAdd('game:leaderboard', { member: user.id, score: 100} );
  await redis.hSet(`usr:${userIdOrUsername}:awards`, 'bestscore', '100');
  ```

4. Modify the "On-User Deleted Logic" section below. This should delete the user data previously
saved in Redis. For example, if you save the UserID in a leaderboard, you must delete that user's
score from the leaderboard:

  ```ts
  await redis.zRem('game:leaderboard', [userIdOrUsername]);
  await redis.del(`usr:${userIdOrUsername}:awards`]);
  ```
 *
 */

import { Router } from 'express';
import { Logger } from '../utils/Logger';
import { reddit, redis } from '@devvit/web/server';

const UserCheckRedisKey = 'usr:del:det';
type UserT2 = `t2_${string}`;

const onUserDeleted =
  async (userIdOrUsername: string, isUserId: boolean, logger: Logger): Promise<void> => {
      /* =========================================== */
      /* ========== On-User Deleted Logic ========== */
      /* vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv */

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

      /* ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ */
      /* ========== On-User Deleted Logic ========== */
      /* =========================================== */
  };

/**
 * Registers a UserId or Username for deletion checks. UserId is recommended, but username is also supported.
 *
 * Note that if a user is deleted, only the value registered is available. You cannot register a UserId and later know
 * the Username for that UserId. If you use UserId and Username as keys, you must register both. However, it is
 * recommended you store UserId, which can be used to fetch the Username if needed.
 *
 * @param userIdOrUsername - The UserId or Username to register for deletion checks. UserId preferred.
 */
export const registerUserForDeleteCheck = async (userIdOrUsername: string): Promise<void> => {
  await redis.zAdd(UserCheckRedisKey, { member: userIdOrUsername, score: Date.now() });
};

/**
 * Removes the provided UserId or Username from the deletion checks.
 *
 * @param userIdOrUsername - The UserId or Username to unregister from deletion checks. UserId preferred.
 */
export const unregisterUserForDeleteCheck = async (userIdOrUsername: string): Promise<void> => {
  await redis.zRem(UserCheckRedisKey, [userIdOrUsername]);
};

/**
 * Registers the user delete detector scheduler endpoint with Express.
 * @param router - The express router.
 */
export const registerUserDeleteDetectorScheduler = (router: Router): void => {
  router.post(
    '/internal/scheduler/check-deleted-users',
    async (_req, res): Promise<void> => {
      // Create a logger
      const logger = await Logger.Create('Scheduler - User Delete Detector');
      logger.traceStart(`Scheduler Action`);

      try {

        /* ========== Start Focus - Get users to check + check for delete ========== */

        // This scheduler API endpoint will check for deleted users. When a user is registered via the method above,
        // they are stored into a Redis Sorted Set (see https://developers.reddit.com/docs/capabilities/server/redis)
        // where their score is the timestamp (Date.now()) the user was added. This represents the last time the user
        // was checked for deletion.

        // This scheduler is set to run every 5 minutes. It will first use the zRange method to get a list of user IDs
        // that were last checked over 24 hours ago. These users are then checked for deletion by trying to obtain
        // their user profile. If it returns no user data, the user was deleted.

        // Once the user is detected as deleted, the "UserDeleted" method is called with the UserId or username

        // -------------------------------------------------------------------------------------------------------------

        // Save start time. Schedulers can run a maximum of 30 seconds. This timestamp is used to check how long the
        // scheduler task has been running, so we can stop early to prevent any potential tasks that so not process any
        // user deletions due to the process failing to complete successfully. If the task is ended early, it will
        // resume user checks at the next 5-minute run!
        const startTime = Date.now();

        // Fetch any users who have not been checked in the last 24 hours
        const oneDayMs = 86400000; // Milliseconds in 1 day
        const usersToCheck = await redis.zRange(UserCheckRedisKey, 0, startTime - oneDayMs, { by: 'score'});

        // If there are users to check...
        if (usersToCheck && usersToCheck.length > 0) {

          // Log a debug message with number of users checked for deletion
          logger.debug(`Found ${usersToCheck.length} users to check for deletion`);

          // For each user that needs checked...
          for (const user of usersToCheck) {

            // The member is the userId (if starts with t2_) or the username
            const isUserId = user.member.indexOf('t2_') === 0;

            // Try to fetch their user profile
            const userProfile = isUserId
              ? await reddit.getUserById(user.member as UserT2)
              : await reddit.getUserByUsername(user.member);

            // If returned undefined, the user was deleted
            if (!userProfile) {
              logger.info(`Found user ${user.member} has been deleted`);

              // Try to delete user (log error if failed)
              try {
                // Call delete callback (above)
                await onUserDeleted(user.member, isUserId, logger);

                // Remove the user from the detector list if successful
                await redis.zRem(UserCheckRedisKey, [user.member]);

              } catch (error) {
                logger.error(`Error while processing deletion of user ${user.member}:`, error);
              }

            } else {
              // Otherwise, update the user score as last checked now (wait another day to check again)
              await redis.zAdd(UserCheckRedisKey, {member: user.member, score: Date.now()});
            }

            // Check if the job has been running for 15 seconds, log a message and break from the loop
            // NOTICE: If you see this message a lot, you may want to increase the scheduler frequency to every minute!
            if ((Date.now() - startTime) > 15000) {
              logger.warn('User delete checking reached 15 seconds. Continuing on next run.')
              break;
            }
          }

        } else {
          // If there were no users to check yet, print a debug message
          logger.debug(`Found 0 users to check for deletion`);
        }

        /* ========== End Focus - Get users to check + check for delete ========== */

        logger.debug('Done checking for deleted users.');
        res.status(200).json({ status: 'complete' });

      } catch (error) {
        logger.error('Error in delete-user detector scheduler:', error);
        res.status(500).json({
          status: 'error',
          message: `Error in delete-user detector scheduler: ${error}`
        });
      } finally {
        logger.traceEnd();
      }
    }
  );
};
