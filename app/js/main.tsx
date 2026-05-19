/**
 * Bootstrap: mount the React app on #root
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './app.css';
import { registerWorldOfDarknessSegments } from './games/minion_battles/storylines/WorldOfDarkness/registerSegments';

registerWorldOfDarknessSegments();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>
);
