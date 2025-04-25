import { useEffect, useState } from 'react';
import { useStore } from '../states/store';
import axios from 'axios';
import BaselineChart from './BaselineChart';

const PriceChart = () => {
  console.log('PriceChart rendered');

  const chartData = useStore(state => state.chartData);
  const [historicalTicks, setHistoricalTicks] = useState([]);
  const [historicalBaseline, setHistoricalBaseline] = useState(null);

  useEffect(() => {
    const fetchHistoricalData = async () => {
      try {
        let ticks = [];
        const cachedTicks = JSON.parse(localStorage.getItem('historicalTicks') || '[]');
        if (cachedTicks.length > 0) {
          console.log('Using cached historical ticks:', cachedTicks);
          ticks = cachedTicks;
        } else {
          console.log('Fetching historical ticks from Binance...');
          const endTime = Date.now();
          const response = await axios.get('https://api.binance.com/api/v3/klines', {
            params: {
              symbol: 'BTCUSDT',
              interval: '1m', // Using 1-minute interval
              limit: 1000,
              endTime: endTime,
            },
          });

          console.log('Raw response from Binance:', response.data);

          if (!response.data || response.data.length === 0) {
            console.warn('No historical data returned from Binance');
            return;
          }

          ticks = response.data.map(kline => {
            const time = Math.floor(kline[0] / 1000);
            const value = parseFloat(kline[4]);
            return { time, value };
          });

          console.log('Historical ticks from Binance:', ticks);
          localStorage.setItem('historicalTicks', JSON.stringify(ticks));
        }

        if (ticks.length === 0) {
          console.warn('No historical ticks available after fetching');
          return;
        }

        setHistoricalTicks(ticks);
        const baseline = ticks.length > 0 ? ticks[ticks.length - 1].value : 0;
        setHistoricalBaseline(baseline);
        console.log('Historical baseline set to:', baseline);
      } catch (error) {
        console.error('Error fetching historical ticks from Binance:', error.message);
        if (error.response) {
          console.error('Error response:', error.response.data);
        }
      }
    };

    fetchHistoricalData();
  }, []);

  return (
    <div className="p-6 flex-1">
      <BaselineChart
        chartData={chartData}
        historicalTicks={historicalTicks}
        historicalBaseline={historicalBaseline}
      />
    </div>
  );
};

export default PriceChart;