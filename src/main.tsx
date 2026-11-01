import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { preloadTilesets } from './game/tiles';

// Текстуры поля грузятся сразу при запуске игры, а не при старте партии
preloadTilesets();

createRoot(document.getElementById('root')!).render(<App />);
