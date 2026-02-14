/**
 * Battle Phase - placeholder screen after character selection
 */
import React from 'react';

export default function BattlePhase() {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8">
            <h2 className="text-4xl font-bold mb-4">Battle Phase</h2>
            <p className="text-muted text-lg">
                The battle is about to begin...
            </p>
            <div className="mt-8 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );
}
