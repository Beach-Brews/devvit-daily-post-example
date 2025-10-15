/*
 * Registers an API action to initialize the "game", by fetching the game data stored in redis.
 *
 * u/beach-brews
 */

import { Router } from 'express';
import { context, reddit, redis } from '@devvit/web/server';

export const initGameAction = (router: Router): void => {
  router.get(
    '/api/init',
    async (_req, res): Promise<void> => {
      try {

        /* ========== Start Focus - Fetch from redis + return result ========== */

        // Confirm post data and level name exists
        const { postData } = context;
        if (!postData || !postData.levelName || typeof postData.levelName !== 'string') {
          console.error('API Init Error: postData.levelName not found in devvit context');
          res.status(400).json({
            status: 'error',
            message: 'postData.levelName is required but missing from context',
          });
          return;
        }

        // Fetch level data and username
        const [levelData, username] = await Promise.all([
          redis.get(`level:${postData.levelName}`),
          reddit.getCurrentUsername()
        ]);

        // Fail if level data is missing
        if (!levelData) {
          console.error('API Init Error: levelData not found in redis');
          res.status(400).json({
            status: 'error',
            message: 'levelData is required but missing from redis',
          });
          return;
        }

        // Otherwise, return data back to post!
        res.json({
          type: 'init',
          levelName: postData.levelName,
          levelData: levelData,
          username: username ?? 'anonymous',
        });

        /* ========== End Focus - Fetch from redis + return result ========== */

      } catch (error) {
        console.error(`Error in init action: ${error}`);
        res.status(400).json({
          status: 'error',
          message: 'Init action failed'
        });
      }
    });
}
