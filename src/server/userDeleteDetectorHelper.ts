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

2. In your /src/server/index.ts, first define a `OnUserDeletedCallback` function.
This function will be passed (in the next section) to the `registerUserDeleteDetectorScheduler`
function, and will be called whenever a UserID or Username previously registered. This function
should delete the user data previously saved in Redis. For example, if you save the UserID in a
leaderboard, you must delete that user's score from the leaderboard:

  ```ts
  import { registerUserDeleteDetectorScheduler, OnUserDeletedCallback } from './userDeleteDetector';
  // ...
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
  ```

3. In your /src/server/index.ts import the `registerUserDeleteDetectorScheduler` and pass the
`router` and your `onUserDeleted` callback to the `registerUserDeleteDetectorScheduler` function.

  ```ts
  import { registerUserDeleteDetectorScheduler, OnUserDeletedCallback } from './userDeleteDetector';
  // ...
  const router = express.Router();
  registerUserDeleteDetectorScheduler(router, onUserDeleted);
  ```

4. To register a user for deletion checking, import and call the `registerUserForDeleteCheck`
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
 *
 *
 */

/**
 * Import statements.
 */
import { Router } from 'express';
import { reddit, redis } from '@devvit/web/server';

/**
 * This is the cache key used to track all users who have been registered for delete detection.
 */
const UserCheckRedisKey = 'usr:del-det';

/**
 * An Enum that defines the log levels used for logging messages in the Deletion Detector.
 */
enum LogLevel {
  ERROR,
  WARN,
  INFO,
  DEBUG
}

/**
 * Set the log level (either 'ERROR', 'WARN', 'INFO', or 'DEBUG'). You may modify the `logMessage`
 * function at the bottom to tie into your own logging system.
 */
const userDetectorLogLevel = LogLevel.INFO;

/**
 * Helper method to log messages with different log levels. Feel free to modify to for your own logging needs.
 * @param level - The provided LogLevel enum value
 * @param msg
 */
const logMessage = (level: LogLevel, ...msg: unknown[]) => {
  if (userDetectorLogLevel >= level)
    console.log(`[${level}] `, ...msg);
};

/**
 * Defines the `OnUserDeleted` callback function signature, which is required to pass to the
 *
 */
export type OnUserDeletedCallback = (userIdOrUsername: string, isUserId: boolean) => Promise<void>;

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
 * @param onUserDeleted - A function that is called when a UserID OR Username has been detected as deleted.
 */
export const registerUserDeleteDetectorScheduler = (router: Router, onUserDeleted: OnUserDeletedCallback): void => {
  router.post(
    '/internal/scheduler/check-deleted-users',
    async (_req, res): Promise<void> => {
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
          logMessage(LogLevel.DEBUG, `Found ${usersToCheck.length} users to check for deletion`);

          // For each user that needs checked...
          for (const user of usersToCheck) {

            // The member is the userId (if starts with t2_) or the username
            const isUserId = user.member.indexOf('t2_') === 0;

            // Try to fetch their user profile
            const userProfile = isUserId
              ? await reddit.getUserById(user.member as `t2_${string}`)
              : await reddit.getUserByUsername(user.member);

            // If returned undefined, the user was deleted
            if (!userProfile) {
              logMessage(LogLevel.INFO, `Found user ${user.member} has been deleted`);

              // Try to delete user (log error if failed)
              try {
                // Call delete callback (above)
                await onUserDeleted(user.member, isUserId);

                // Remove the user from the detector list if successful
                await redis.zRem(UserCheckRedisKey, [user.member]);

              } catch (error) {
                logMessage(LogLevel.ERROR, `Error while processing deletion of user ${user.member}:`, error);
              }

            } else {
              // Otherwise, update the user score as last checked now (wait another day to check again)
              await redis.zAdd(UserCheckRedisKey, {member: user.member, score: Date.now()});
            }

            // Check if the job has been running for 15 seconds, log a message and break from the loop
            // NOTICE: If you see this message a lot, you may want to increase the scheduler frequency to every minute!
            if ((Date.now() - startTime) > 15000) {
              logMessage(LogLevel.WARN, 'User delete checking reached 15 seconds. Continuing on next run.')
              break;
            }
          }

        } else {
          // If there were no users to check yet, print a debug message
          logMessage(LogLevel.DEBUG, 'Found 0 users to check for deletion');
        }

        /* ========== End Focus - Get users to check + check for delete ========== */

        logMessage(LogLevel.DEBUG, 'Done checking for deleted users.');
        res.status(200).json({ status: 'complete' });

      } catch (error) {
        logMessage(LogLevel.ERROR, 'Error in delete-user detector scheduler:', error);
        res.status(500).json({
          status: 'error',
          message: `Error in delete-user detector scheduler: ${error}`
        });
      }
    }
  );
};
