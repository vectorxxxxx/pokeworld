import React from 'react';
import ReactDOM from 'react-dom/client';
import 'react-toastify/dist/ReactToastify.css';
import 'uplot/dist/uPlot.min.css';
import Home from './App.tsx';
import ConvexClientProvider from './components/ConvexClientProvider.tsx';
import './index.css';
import './pokeworld.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexClientProvider>
      <Home />
    </ConvexClientProvider>
  </React.StrictMode>,
);
