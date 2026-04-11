## General Note
- This is a legacy project, so not everything will follow the conventions listed here.  These are not instructions on where to find files.  They are instructions on where to put them.

## Folder Structure
- Everything for the frontend lives in `app/js/games/minion_battles/*`
- The backend lives in `app/backend/*`
- API calls and API related utilities live in `minion_battles/api`

## Architecture for the Game State
If we view the game state through the "model / view / controller" lens;
- Model: the "Model" should be the JSON objects stored on the backend, and should be deserialized into "GameObjects" on the frontend
- Controller: the "Controller" doesn't have a single owner, but should be handled through a combination of action function calls on the GameObjects, and API calls.
- View: The view is split into two pieces.  Most of the UI will live in React, and actions done on the UI should trigger actions in the GameObjects.  An important part of the View will be in the game canvas, which will be rendered in React as few times as possible, but updated by Game Object changes.

### React
- Use React for ui elements.
- Store React files in `minion_battles/ui`
- `ui/components` is for any reuseable UI components
- `ui/pages` is for any pages or full screen cards, such as "game phases"
- Do not put any game logic in React.  React should call a Game Object to update its state.

### Game Objects
- Game Objects represent the "current state" of the game.  They come from the backend in JSON form, and should be deserialized into frontend Game Objects.
- Currently a lot of the game logic & state is owned by "GameEngine".  It should expose the game state & helper methods for interacting with & querying the game logic.
- We want to use an object oriented approach to storing game state in Game Objects
- The full game state should be owned by an object called "GameState"
- It should be subdivided into "Managers" which are lists of GameObjects
- For example, "UnitManager" should be the owner of Units and Unit logic, and should have a list of GameUnits.
- There are two types of GameObjects;  Serializable and Deserializable.
Serializable GameObjects must have a "toJSON" method and "fromJSON" static method in order to serialize and deserialize them for network transfer
If a game object can be determined entirely from the context of another game object, it should not be serializable.  Otherwise, it should be serializable.
A serializable GameObject should recursively build its serialized object out of any other GameObjects it may contain.  This is primarily relevant for Managers.
When preparing a GameObject for a network call, "toJSON" should only be called on GameEngine.  GameEngine should then build the object for network transfer.
GameObjects should be stored in `games/minion_battles/game/`, and this is where the GameEngine and the general gameState should live.
Each GameObject type should have its own folder, for example, Units and Unit related helpers should live in `games/minion_battles/game/units`

### Object Definitions
- GameObjects represent the in-game state of any given object.  However, there can be many different types of any given GameObject.
For example, a "GameUnit" would have a position, an AIState, a tracker for its current health and resources, etc.  It would also have a "unitType".  The unitType should reference a unit_def, which will contain details about the definition for that unit, such as the image it should use, its max health, its movement speed, the abilities it has, etc.  A GameUnit may have overrides for one or more of these, but the unit_def represents the 'base state' for the unit, and any static definitions for it.
- They should be stored alongside their game objects in a `*_defs` folder.  For example, `unit_defs` should be stored in `games/minion_battles/game/units/unit_defs`

