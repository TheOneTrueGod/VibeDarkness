import React from 'react';

interface BattleLoadingScreenProps {
    /** Optional status line shown under the spinner. */
    message?: string | null;
}

/** Full-size centered spinner used while a battle is loading or waiting on party members. */
export default function BattleLoadingScreen({ message }: BattleLoadingScreenProps) {
    return (
        <div className="w-full h-full flex items-center justify-center">
            <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin" />
                {message && <p className="text-sm text-light-300">{message}</p>}
            </div>
        </div>
    );
}
