/*
 * Registers an action that is called by the Devvit scheduler. This schedule is defined in the devvit.json.
 * See https://developers.reddit.com/docs/capabilities/server/scheduler
 *
 * u/beach-brews
 */

import { Router } from 'express';
import { context, reddit, redis } from '@devvit/web/server';

export const scheduledAction = (router: Router): void => {
  router.post(
    '/internal/scheduler/create-game-post',
    async (_req, res): Promise<void> => {
      try {

        /* ========== Start Focus - Read data queue + create post ========== */

        // Level data can be provided many different ways, along with different methods of creating new posts
        // (manually vs. periodically). The data could be provided by a menu item, or read from a (old Reddit) wiki
        // page, or fetched from an approved external API, or even generated before the post is created. The process
        // can also upload new image media if necessary.
        //
        // New game posts could be created by a menu action directly, or by a scheduled process that runs every day at a
        // specified time.
        //
        // As an example, level data is provided by a menu action, saved into Redis then processed by this scheduled task, which acts like
        // a "periodic poster" when new data is provided.

        // If the queue is empty, return
        const hasQueue = await redis.exists('data:queue');
        if (!hasQueue) {
          console.log('No queued data to process.');
          res.status(200).json({
            status: 'success',
            message: 'No items to process'
          });
          return;
        }

        // Get the subreddit context
        const { subredditName } = context;
        if (!subredditName) {
          throw new Error('subredditName is required');
        }

        // Obtain levelName and gameData from Redis queue
        const queuedItems = await redis.hGetAll('data:queue');

        // For each record found...
        const records = Object.entries(queuedItems);
        for (const record of records) {
          // Extract levelName and gameData from record
          const [levelName, gameData] = record;

          // Add game data to redis (level name as key)
          // NOTE: This is not required, but an example if "game data" is larger than the 2kb allowed in postData
          await redis.set(`level:${levelName}`, gameData);

          // Create new post!
          await reddit.submitCustomPost({
            subredditName: subredditName,
            title: 'New Game Level - ' + levelName,
            splash: {
              appDisplayName: 'Level ' + levelName,
              heading: 'Level ' + levelName,
              description: 'Can you solve this level?',
              backgroundUri: 'default-splash.png',
              buttonLabel: 'Tap to Start',
              appIconUri: 'default-icon.png'
            },

            // Note postData contains the level name, which will be used in the init API to fetch the level game data
            // from the redis key set above!
            postData: {
              levelName: levelName
            }

          });
        }

        // Delete Redis key to clear queue
        await redis.del('data:queue');

        // Return successful result
        console.log('Processed items and created new posts.');
        res.status(200).json({
          status: 'success',
          message: 'Processed items and created new posts.'
        });

        /* ========== End Focus - Read data queue + create post ========== */

      } catch (error) {
        console.error(`Error in scheduled action: ${error}`);
        res.status(400).json({
          status: 'error',
          message: 'Scheduled action failed'
        });
      }
    });
}
