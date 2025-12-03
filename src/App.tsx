import { useState } from 'react';
import LandingPage from './components/LandingPage';
import PokeworldDashboard from './components/PokeworldDashboard';

export default function Home() {
  const [showDashboard, setShowDashboard] = useState(false);

  return (
    <main className="w-full h-screen m-0 p-0">
      {!showDashboard ? (
        <LandingPage onEnter={() => setShowDashboard(true)} />
      ) : (
        <PokeworldDashboard />
      )}
    </main>
  );
}

const modalStyles = {
  overlay: {
    backgroundColor: 'rgb(0, 0, 0, 75%)',
    zIndex: 12,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '50%',

    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};
