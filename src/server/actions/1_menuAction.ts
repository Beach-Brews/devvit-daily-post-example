/*
 * Registers an action for a subreddit level menu. This menu is defined in the devvit.json.
 * See https://developers.reddit.com/docs/capabilities/client/menu-actions
 *
 * u/beach-brews
 */

import { Router } from 'express';
import { Logger } from '../utils/Logger';

export const menuAction = (router: Router): void => {
  router.post(
    '/internal/menu/provide-data',
    async (_req, res): Promise<void> => {
      // Create a logger
      const logger = await Logger.Create('Menu - Provide Data');
      logger.traceStart('Menu Action');

      try {

        /* ========== Start Focus - Display a form to the user ========== */

        // See https://developers.reddit.com/docs/capabilities/client/forms
        // Show a form to enter a level name + game data for the level
        // NOTE: Currently, this will "overwrite" the level data for the given level name
        logger.info('Menu action triggered. Showing form to user.');
        res.json({
          showForm: {
            name: 'createGameForm',
            form: {
              fields: [
                {
                  type: 'string',
                  name: 'levelName',
                  label: 'Level  Name',
                },
                {
                  type: 'string',
                  name: 'gameData',
                  label: 'Game Data',
                }
              ]
            }
          }
        });

        /* ========== End Focus - Display a form to the user ========== */

      } catch (error) {
        logger.error('Error in menu action:', error);
        res.status(400).json({
          status: 'error',
          message: 'Menu action failed'
        });
      } finally {
        logger.traceEnd();
      }
    });
}
