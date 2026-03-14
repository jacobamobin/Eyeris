import './index.css';
import { useAppStore } from './store/useAppStore';
import LandingPage from './components/LandingPage';
import MainView from './components/MainView';

function App() {
  const { screen } = useAppStore();

  return (
    <div className="font-['Outfit']">
      {screen === 'landing' ? <LandingPage /> : <MainView />}
    </div>
  );
}

export default App;
