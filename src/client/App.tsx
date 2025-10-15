import { navigateTo } from '@devvit/web/client';
import { useEffect, useState } from 'react';
import { InitResponse } from '../shared/types/api';

// Define game state
interface GameState {

  // Data points from the init API call
  levelName: string | null;
  levelData: string | null;
  username: string | null;

  // Other game state
  loading: boolean;
  error: boolean;
  selectedItems: boolean[],
  attempts: number,
  foundTreasure: number
}

// Render game
export const App = () => {

  // Set initial game state
  const [state, setState] = useState<GameState>({
    levelName: null,
    levelData: null,
    username: null,
    loading: true,
    error: false,
    selectedItems: new Array(25).fill(false),
    attempts: 0,
    foundTreasure: 0
  });

  // Extract variables from state (less use of state.)
  const { levelName, levelData, username, loading, error, selectedItems } = state;

  // On initial load, call the init API to get game data saved in the back-end
  useEffect(() => {

    // Use effect does not allow async methods directly, so need an anonymous function.
    const init = async () => {
      try {
        // Call API (fail if not 200 OK result)
        const res = await fetch('/api/init');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // Get json from result (error if not correct)
        const data: InitResponse = await res.json();
        if (data.type !== 'init') throw new Error('Unexpected response');

        // Update game state with game data from back-end, and set no longer loading.
        setState((prev) => ({

          /* ========== Start focus - Set game state from init data ========== */
          levelName: data.levelName,
          levelData: data.levelData,
          username: data.username,
          /* ========== End focus - Set game state from init data ========== */

          loading: false,
          error: false,
          attempts: 0,
          foundTreasure: 0,
          selectedItems: [...prev.selectedItems]
        }));

      } catch (err) {
        // Fail if any error happened
        console.error('Failed to init counter', err);
        setState((prev) => ({ ...prev, loading: false, error: true }));
      }
    };

    // Call async method defined above
    void init();
  }, []);

  // If loading, received an error or the game data is missing, show a loading or error text
  if (loading || error || !levelData) {
    return (
      <div className="flex relative flex-col justify-center items-center min-h-screen gap-4">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-bold text-center text-gray-900 ">
            {!loading ? 'Sorry, there was an error' : 'Loading! Please wait...'}
          </h1>
        </div>
      </div>
    );
  }

  /* ========== Start focus - Use the game data ========== */
  const treasureLocations = levelData.split(",");
  const didWin = treasureLocations.length == state.foundTreasure;
  /* ========== End focus - Use the game data ========== */

  // When a box is selected...
  const onBoxSelect = (boxNo: number) => {
    setState((s) => {
      // If the selected box is already selected, don't do anything
      if (s.selectedItems[boxNo]) return s;

      // Copy selected array, and update value for selected box
      const updatedItems = [ ...s.selectedItems ];
      updatedItems[boxNo] = true;

      // Determine if the box selected is in the list of boxes in the game data
      const isTreasure = treasureLocations.indexOf(boxNo.toString()) > -1;

      // Return new state, with updated box selections, found treasure count, and total attempts
      return {
        ...s,
        attempts: s.attempts + 1,
        selectedItems: updatedItems,
        foundTreasure: isTreasure ? s.foundTreasure + 1 : s.foundTreasure
      };
    });
  }

  // Constructs an array of selectable boxes in a 5 x 5 grid. Initially, shows a box number with a
  // black border. If the selected box is not a treasure box, it becomes red. If it is a treasure
  // box it becomes green. Once all treasure is found, it becomes gray.
  const gameMap = [];
  let i = 0;
  for (let y = 0; y < 5; ++y) {
    const row = [];
    for (let x = 0; x < 5; ++x, ++i) {
      // Helper booleans for selected and treasure state
      const isSelected = selectedItems[i];
      const isTreasure = treasureLocations.indexOf(i.toString()) > -1;

      // Choose style based on selection and treasure state
      const style = isSelected && isTreasure
        ? 'cursor-pointer border-green-500 bg-green-100'
        : isSelected
          ? 'cursor-pointer border-red-500 bg-red-100'
          : didWin
            ? 'border-gray-500 bg-gray-100'
            : 'cursor-pointer';

      // Show a money bag when treasure is found, palm tree if not treasure, and box number if not selected
      const text = isSelected && isTreasure
        ? '💰'
        : isSelected ? '🏝' : `${i+1}`;

      // Save index number reference, and call onBoxSelect when selected (if not won yet)
      const boxNo = i;
      const onClick = () => { if (!didWin) onBoxSelect(boxNo); };

      // Render box
      row.push(<div className={`w-12 h-12 border-1 rounded-lg flex items-center justify-center ${style}`} onClick={onClick}>{text}</div>);
    }

    // Render box row (5 boxes in a row)
    gameMap.push(<div className="flex gap-2">{row}</div>);
  }

  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-4">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-bold text-center text-gray-900 ">
          {username ? `Hey ${username} 👋` : ''}
        </h1>
        {!didWin && (
          <p className="text-base text-center text-gray-600 ">
            Can you find all {treasureLocations.length} treasures for {levelName}? Click on the boxes below to find the hidden treasure.
          </p>
        )}
        {didWin && (
          <p className="text-base text-center text-gray-600 ">
            You found all {treasureLocations.length} treasures after {state.attempts} attempts!
          </p>
        )}
      </div>
      <div className="flex flex-col items-center justify-center mt-5 gap-2">
        {gameMap}
      </div>
      <footer className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 text-[0.8em] text-gray-600">
        <button
          className="cursor-pointer"
          onClick={() => navigateTo('https://developers.reddit.com/docs')}
        >
          Docs
        </button>
        <span className="text-gray-300">|</span>
        <button
          className="cursor-pointer"
          onClick={() => navigateTo('https://www.reddit.com/r/Devvit')}
        >
          r/Devvit
        </button>
        <span className="text-gray-300">|</span>
        <button
          className="cursor-pointer"
          onClick={() => navigateTo('https://discord.com/invite/R7yu2wh9Qz')}
        >
          Discord
        </button>
      </footer>
    </div>
  );
};
