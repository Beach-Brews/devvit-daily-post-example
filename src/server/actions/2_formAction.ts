/*
 * Registers an action when the form in the menu action is submitted. This form endpoint is defined in the devvit.json.
 * See https://developers.reddit.com/docs/capabilities/client/forms
 *
 * u/beach-brews
 */

import { Router } from 'express';
import { redis } from '@devvit/web/server';

export const formAction = (router: Router): void => {
  router.post(
    '/internal/form/create-game-form',
    async (req, res): Promise<void> => {
      try {

        /* ========== Start Focus - Queue level data ========== */

        // Level data can be provided many different ways, along with different methods of creating new posts
        // (manually vs. periodically). As an example, this action adds the provided data to a queue for processing by
        // a scheduled action. Be sure to check out the notes in 3_scheduledAction.ts!

        // Obtain levelName and gameData from form
        const { levelName, gameData } = req.body;
        console.log(`Form action triggered. Saving ${levelName} and ${gameData} to processing queue.`);

        // Stores provided level data into Redis hash.
        await redis.hSet('data:queue', { [levelName]: gameData });

        // Display success to user
        res.status(200).json({
          showToast: {
            appearance: 'success',
            text: 'Successfully queued game data'
          }
        });

        /* ========== End Focus - Queue level data ========== */

      } catch (error) {
        console.error(`Error in form action: ${error}`);
        res.status(400).json({
          status: 'error',
          message: 'Form action failed'
        });
      }
    });
}
