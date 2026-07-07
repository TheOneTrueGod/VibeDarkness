import { useReducer } from 'react';
import { TerrainType } from '../../../games/minion_battles/terrain/TerrainType';
import {
    MapSegmentData,
    MapSegmentPOI,
    MapSegmentZone,
    ZoneShape,
} from '../../../games/minion_battles/terrain/segmentSchema';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type EditorTool = 'terrain_paint' | 'poi' | 'zone';

export interface EditorState {
    segmentId: string | null;
    segmentData: MapSegmentData | null;
    isDirty: boolean;
    activeTool: EditorTool;
    showPOIs: boolean;
    selectedTerrainType: TerrainType;
    brushSize: 1 | 2 | 3 | 4 | 5 | 7;
    selectedPOIId: string | null;
    hoveredCell: { col: number; row: number } | null;
    saveStatus: 'idle' | 'saving' | 'saved' | 'error';
    showZones: boolean;
    activeZoneShape: ZoneShape;
    selectedZoneId: string | null;
}

const initialState: EditorState = {
    segmentId: null,
    segmentData: null,
    isDirty: false,
    activeTool: 'terrain_paint',
    showPOIs: true,
    selectedTerrainType: TerrainType.Grass,
    brushSize: 1,
    selectedPOIId: null,
    hoveredCell: null,
    saveStatus: 'idle',
    showZones: true,
    activeZoneShape: 'box',
    selectedZoneId: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type EditorAction =
    | { type: 'LOAD_SEGMENT'; payload: MapSegmentData }
    | { type: 'SET_TOOL'; payload: EditorTool }
    | { type: 'SET_TERRAIN_TYPE'; payload: TerrainType }
    | { type: 'SET_BRUSH_SIZE'; payload: 1 | 2 | 3 | 4 | 5 | 7 }
    | { type: 'TOGGLE_POIS' }
    | { type: 'SET_HOVERED_CELL'; payload: { col: number; row: number } | null }
    | { type: 'PAINT_CELLS'; payload: { col: number; row: number }[] }
    | { type: 'ADD_POI'; payload: Omit<MapSegmentPOI, 'id'> & { id?: string } }
    | { type: 'UPDATE_POI'; payload: MapSegmentPOI }
    | { type: 'DELETE_POI'; payload: string }
    | { type: 'SELECT_POI'; payload: string | null }
    | { type: 'SET_SAVE_STATUS'; payload: 'idle' | 'saving' | 'saved' | 'error' }
    | { type: 'CLEAR_DIRTY' }
    | { type: 'SET_ZONE_SHAPE'; payload: ZoneShape }
    | { type: 'TOGGLE_ZONES' }
    | { type: 'ADD_ZONE'; payload: Omit<MapSegmentZone, 'id'> & { id?: string } }
    | { type: 'UPDATE_ZONE'; payload: MapSegmentZone }
    | { type: 'DELETE_ZONE'; payload: string }
    | { type: 'SELECT_ZONE'; payload: string | null };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function editorReducer(state: EditorState, action: EditorAction): EditorState {
    switch (action.type) {
        case 'LOAD_SEGMENT': {
            const data = action.payload;
            return {
                ...state,
                segmentId: data.id,
                segmentData: data,
                isDirty: false,
                selectedPOIId: null,
                selectedZoneId: null,
            };
        }

        case 'SET_TOOL':
            return { ...state, activeTool: action.payload };

        case 'SET_TERRAIN_TYPE':
            return { ...state, selectedTerrainType: action.payload };

        case 'SET_BRUSH_SIZE':
            return { ...state, brushSize: action.payload };

        case 'TOGGLE_POIS':
            return { ...state, showPOIs: !state.showPOIs };

        case 'SET_HOVERED_CELL':
            return { ...state, hoveredCell: action.payload };

        case 'PAINT_CELLS': {
            if (!state.segmentData) return state;

            const { terrain, height, width } = state.segmentData;
            const cells = action.payload;
            const targetType = state.selectedTerrainType;

            // Find which rows are actually being changed.
            const rowsToChange = new Set<number>();
            for (const { col, row } of cells) {
                if (row >= 0 && row < height && col >= 0 && col < width) {
                    if (terrain[row][col] !== targetType) {
                        rowsToChange.add(row);
                    }
                }
            }

            if (rowsToChange.size === 0) return state;

            // Shallow-copy outer array; only copy rows that change.
            const newTerrain = [...terrain];
            for (const rowIdx of rowsToChange) {
                newTerrain[rowIdx] = [...terrain[rowIdx]];
            }

            for (const { col, row } of cells) {
                if (row >= 0 && row < height && col >= 0 && col < width) {
                    newTerrain[row][col] = targetType;
                }
            }

            return {
                ...state,
                isDirty: true,
                segmentData: { ...state.segmentData, terrain: newTerrain },
            };
        }

        case 'ADD_POI': {
            if (!state.segmentData) return state;

            const id = action.payload.id ?? Date.now().toString(36);
            const newPOI: MapSegmentPOI = { ...action.payload, id };
            const newPOIs = [...state.segmentData.pointsOfInterest, newPOI];

            return {
                ...state,
                isDirty: true,
                segmentData: { ...state.segmentData, pointsOfInterest: newPOIs },
            };
        }

        case 'UPDATE_POI': {
            if (!state.segmentData) return state;

            const updated = action.payload;
            const newPOIs = state.segmentData.pointsOfInterest.map((poi) =>
                poi.id === updated.id ? updated : poi
            );

            return {
                ...state,
                isDirty: true,
                segmentData: { ...state.segmentData, pointsOfInterest: newPOIs },
            };
        }

        case 'DELETE_POI': {
            if (!state.segmentData) return state;

            const idToDelete = action.payload;
            const newPOIs = state.segmentData.pointsOfInterest.filter(
                (poi) => poi.id !== idToDelete
            );

            return {
                ...state,
                isDirty: true,
                selectedPOIId:
                    state.selectedPOIId === idToDelete ? null : state.selectedPOIId,
                segmentData: { ...state.segmentData, pointsOfInterest: newPOIs },
            };
        }

        case 'SELECT_POI':
            return { ...state, selectedPOIId: action.payload };

        case 'SET_SAVE_STATUS':
            return { ...state, saveStatus: action.payload };

        case 'CLEAR_DIRTY':
            return { ...state, isDirty: false };

        case 'SET_ZONE_SHAPE':
            return { ...state, activeZoneShape: action.payload };

        case 'TOGGLE_ZONES':
            return { ...state, showZones: !state.showZones };

        case 'ADD_ZONE': {
            if (!state.segmentData) return state;

            const id = action.payload.id ?? Date.now().toString(36);
            const newZone: MapSegmentZone = { ...action.payload, id };
            const newZones = [...state.segmentData.zones, newZone];

            return {
                ...state,
                isDirty: true,
                selectedZoneId: id,
                segmentData: { ...state.segmentData, zones: newZones },
            };
        }

        case 'UPDATE_ZONE': {
            if (!state.segmentData) return state;

            const updated = action.payload;
            const newZones = state.segmentData.zones.map((zone) =>
                zone.id === updated.id ? updated : zone
            );

            return {
                ...state,
                isDirty: true,
                selectedZoneId: updated.id,
                segmentData: { ...state.segmentData, zones: newZones },
            };
        }

        case 'DELETE_ZONE': {
            if (!state.segmentData) return state;

            const idToDelete = action.payload;
            const newZones = state.segmentData.zones.filter(
                (zone) => zone.id !== idToDelete
            );

            return {
                ...state,
                isDirty: true,
                selectedZoneId:
                    state.selectedZoneId === idToDelete ? null : state.selectedZoneId,
                segmentData: { ...state.segmentData, zones: newZones },
            };
        }

        case 'SELECT_ZONE':
            return { ...state, selectedZoneId: action.payload };

        default:
            return state;
    }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EditorActions {
    loadSegment: (data: MapSegmentData) => void;
    setTool: (tool: EditorTool) => void;
    setTerrainType: (type: TerrainType) => void;
    setBrushSize: (size: 1 | 2 | 3 | 4 | 5 | 7) => void;
    togglePOIs: () => void;
    setHoveredCell: (cell: { col: number; row: number } | null) => void;
    paintCells: (cells: { col: number; row: number }[]) => void;
    addPOI: (poi: Omit<MapSegmentPOI, 'id'> & { id?: string }) => void;
    updatePOI: (poi: MapSegmentPOI) => void;
    deletePOI: (id: string) => void;
    selectPOI: (id: string | null) => void;
    setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
    clearDirty: () => void;
    setZoneShape: (shape: ZoneShape) => void;
    toggleZones: () => void;
    addZone: (zone: Omit<MapSegmentZone, 'id'> & { id?: string }) => void;
    updateZone: (zone: MapSegmentZone) => void;
    deleteZone: (id: string) => void;
    selectZone: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEditorState(): { state: EditorState; actions: EditorActions } {
    const [state, dispatch] = useReducer(editorReducer, initialState);

    const actions: EditorActions = {
        loadSegment: (data) => dispatch({ type: 'LOAD_SEGMENT', payload: data }),
        setTool: (tool) => dispatch({ type: 'SET_TOOL', payload: tool }),
        setTerrainType: (type) => dispatch({ type: 'SET_TERRAIN_TYPE', payload: type }),
        setBrushSize: (size) => dispatch({ type: 'SET_BRUSH_SIZE', payload: size }),
        togglePOIs: () => dispatch({ type: 'TOGGLE_POIS' }),
        setHoveredCell: (cell) => dispatch({ type: 'SET_HOVERED_CELL', payload: cell }),
        paintCells: (cells) => dispatch({ type: 'PAINT_CELLS', payload: cells }),
        addPOI: (poi) => dispatch({ type: 'ADD_POI', payload: poi }),
        updatePOI: (poi) => dispatch({ type: 'UPDATE_POI', payload: poi }),
        deletePOI: (id) => dispatch({ type: 'DELETE_POI', payload: id }),
        selectPOI: (id) => dispatch({ type: 'SELECT_POI', payload: id }),
        setSaveStatus: (status) => dispatch({ type: 'SET_SAVE_STATUS', payload: status }),
        clearDirty: () => dispatch({ type: 'CLEAR_DIRTY' }),
        setZoneShape: (shape) => dispatch({ type: 'SET_ZONE_SHAPE', payload: shape }),
        toggleZones: () => dispatch({ type: 'TOGGLE_ZONES' }),
        addZone: (zone) => dispatch({ type: 'ADD_ZONE', payload: zone }),
        updateZone: (zone) => dispatch({ type: 'UPDATE_ZONE', payload: zone }),
        deleteZone: (id) => dispatch({ type: 'DELETE_ZONE', payload: id }),
        selectZone: (id) => dispatch({ type: 'SELECT_ZONE', payload: id }),
    };

    return { state, actions };
}
