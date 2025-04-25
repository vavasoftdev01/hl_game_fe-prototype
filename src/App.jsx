import { useEffect } from 'react';
import PriceChart from './components/PriceChart';
import { useStore } from './states/store';

export default function App() {
  const init = useStore((state) => state.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <PriceChart />
    </div>
  );
}