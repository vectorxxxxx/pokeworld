import '../pokeworld-landing.css';

type Props = {
  onEnter?: () => void;
};

export default function LandingPage({ onEnter }: Props) {
  return (
    <div>
      <div className="clouds">
        <div className="cloud cloud-1"></div>
        <div className="cloud cloud-2"></div>
        <div className="cloud cloud-3"></div>
        <div className="cloud cloud-4"></div>
      </div>

      <div className="deco-pokeball"></div>
      <div className="deco-pokeball"></div>
      <div className="deco-pokeball"></div>
      <div className="deco-pokeball"></div>

      <svg className="sprite sprite-pikachu" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="8" width="6" height="16" fill="#FFD93D" stroke="#1a1a2e" strokeWidth="2" />
        <rect x="38" y="8" width="6" height="16" fill="#FFD93D" stroke="#1a1a2e" strokeWidth="2" />
        <rect x="20" y="8" width="6" height="6" fill="#1a1a2e" />
        <rect x="38" y="8" width="6" height="6" fill="#1a1a2e" />
        <ellipse cx="32" cy="40" rx="18" ry="16" fill="#FFD93D" stroke="#1a1a2e" strokeWidth="2" />
        <circle cx="26" cy="36" r="3" fill="#1a1a2e" />
        <circle cx="38" cy="36" r="3" fill="#1a1a2e" />
        <ellipse cx="20" cy="44" rx="5" ry="4" fill="#FF6B6B" />
        <ellipse cx="44" cy="44" rx="5" ry="4" fill="#FF6B6B" />
      </svg>

      <svg className="sprite sprite-bulbasaur" viewBox="0 0 72 56" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="36" cy="38" rx="22" ry="14" fill="#7FDBCA" stroke="#1a1a2e" strokeWidth="2" />
        <ellipse cx="36" cy="20" rx="14" ry="12" fill="#4CAF50" stroke="#1a1a2e" strokeWidth="2" />
        <ellipse cx="36" cy="18" rx="6" ry="8" fill="#81C784" />
        <circle cx="28" cy="42" r="4" fill="#C62828" stroke="#1a1a2e" strokeWidth="1" />
        <circle cx="44" cy="42" r="4" fill="#C62828" stroke="#1a1a2e" strokeWidth="1" />
        <ellipse cx="26" cy="44" rx="4" ry="3" fill="#26A69A" />
        <ellipse cx="46" cy="44" rx="4" ry="3" fill="#26A69A" />
      </svg>

      <svg className="sprite sprite-charmander" viewBox="0 0 56 64" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="28" cy="18" rx="14" ry="12" fill="#FF8A65" stroke="#1a1a2e" strokeWidth="2" />
        <ellipse cx="28" cy="42" rx="16" ry="14" fill="#FF8A65" stroke="#1a1a2e" strokeWidth="2" />
        <ellipse cx="28" cy="46" rx="10" ry="8" fill="#FFCC80" />
        <circle cx="22" cy="16" r="3" fill="#1a1a2e" />
        <circle cx="34" cy="16" r="3" fill="#1a1a2e" />
        <ellipse cx="48" cy="40" rx="6" ry="4" fill="#FF8A65" stroke="#1a1a2e" strokeWidth="1" transform="rotate(30 48 40)" />
        <ellipse cx="52" cy="32" rx="5" ry="8" fill="#FFEB3B" stroke="#FF9800" strokeWidth="2">
          <animate attributeName="ry" values="8;10;8" dur="0.3s" repeatCount="indefinite" />
        </ellipse>
      </svg>

      <svg className="sprite sprite-squirtle" viewBox="0 0 60 56" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="30" cy="36" rx="18" ry="14" fill="#8D6E63" stroke="#1a1a2e" strokeWidth="2" />
        <ellipse cx="30" cy="36" rx="12" ry="9" fill="#A1887F" />
        <ellipse cx="30" cy="32" rx="14" ry="12" fill="#64B5F6" stroke="#1a1a2e" strokeWidth="2" />
        <ellipse cx="30" cy="16" rx="12" ry="10" fill="#64B5F6" stroke="#1a1a2e" strokeWidth="2" />
        <circle cx="24" cy="14" r="3" fill="#1a1a2e" />
        <circle cx="36" cy="14" r="3" fill="#1a1a2e" />
        <ellipse cx="52" cy="36" rx="6" ry="4" fill="#64B5F6" stroke="#1a1a2e" strokeWidth="1" />
      </svg>

      <div className="sparkle"></div>
      <div className="sparkle"></div>
      <div className="sparkle"></div>
      <div className="sparkle"></div>
      <div className="sparkle"></div>

      <div className="landing-content">
        <div className="logo-pokeball"></div>
        <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="POKEWORLD logo" className="site-logo logo-replacement" />
        <p className="subtitle">DIGITAL CREATURE SIMULATOR</p>
        <div className="version-badge">VERSION 1.0</div>

        <div className="intro-box">
          <h2 className="intro-title">WELCOME TO THE WORLD OF POKEWORLD!</h2>
          <p className="professor-text">
            Hello there! Welcome to the world of digital creatures! This world is inhabited by creatures that think, explore, and evolve on their own. Some use them for battles, others keep them as pets. As for me, I study these creatures as a profession.
          </p>

          <div className="menu-grid">
            <div className="menu-item">
              <h3 className="menu-title">WILD ENCOUNTERS</h3>
              <p className="menu-desc">Each creature thinks for itself and makes its own decisions!</p>
            </div>
            <div className="menu-item">
              <h3 className="menu-title">EVOLUTION</h3>
              <p className="menu-desc">Watch creatures grow, change, and develop new behaviors!</p>
            </div>
            <div className="menu-item">
              <h3 className="menu-title">YOUR JOURNEY</h3>
              <p className="menu-desc">Add creatures and shape the world however you like!</p>
            </div>
          </div>
        </div>

        <button className="enter-btn" onClick={onEnter}>Enter the World</button>
      </div>

      <div className="grass-decoration"></div>
    </div>
  );
}
