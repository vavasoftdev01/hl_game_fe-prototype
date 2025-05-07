import { useEffect, useState } from 'react';
import { useStore } from '../states/store';
import axios from 'axios';
import BaselineChart from './BaselineChart';
import CandlestickChart from './CandlestickChart';
import LineChart from './LineChart';
import AreaChart from './AreaChart';
import BBaseLineChart from './BBaseLineChart';
import BCandleStickChart from './BCandlestickChart';
import OptionsChart from './OptionsChart';

const PriceChart = () => {
  console.log('PriceChart rendered');

  const chartData = useStore(state => state.chartData);
  const [historicalTicks, setHistoricalTicks] = useState([]);
  const [historicalBaseline, setHistoricalBaseline] = useState(null);

  const fetchHistoricalData = async () => {
    // try {
    //   console.log('Fetching historical trades from Binance...');
    //   const currentTimeMs = Date.now();
    //   const endTime = currentTimeMs;
    //   const startTime = endTime - (600 * 1000); // Last 10 minutes (600 seconds)
    //   const startTimeS = Math.floor(startTime / 1000);

    //   let allTicks = [];
    //   let lastId = null;
    //   let earliestTime = currentTimeMs / 1000;

    //   while (earliestTime > startTimeS) {
    //     const response = await axios.get('https://api.binance.com/api/v3/historicalTrades', {
    //       params: {
    //         symbol: 'BTCUSDT',
    //         limit: 100,
    //         fromId: lastId || undefined,
    //       },
    //     });

    //     console.log('Raw response from Binance historicalTrades:', response.data);

    //     if (!response.data || response.data.length === 0) {
    //       console.warn('No historical trade data returned from Binance');
    //       break;
    //     }

    //     const ticks = response.data
    //       .map((trade, index) => {
    //         if (!trade || typeof trade.time !== 'number' || typeof trade.price !== 'string') {
    //           console.error(`Invalid trade data at index ${index}:`, trade);
    //           throw new Error('Invalid trade data format');
    //         }
    //         const time = Math.floor(trade.time / 1000);
    //         const value = parseFloat(trade.price);
    //         if (isNaN(time) || isNaN(value)) {
    //           console.error(`Invalid time or value at index ${index}: time=${time}, value=${value}`);
    //           throw new Error('Invalid time or value in trade data');
    //         }
    //         return { time, value, tradeId: trade.id };
    //       });

    //     allTicks = [...allTicks, ...ticks];
    //     lastId = ticks[0].tradeId;
    //     earliestTime = ticks[0].time;

    //     if (ticks.length < 1000) {
    //       break;
    //     }
    //   }

    //   const timeWindowStart = Math.floor(startTime / 1000);
    //   const filteredTicks = allTicks
    //     .filter(tick => tick.time >= timeWindowStart)
    //     .map(({ time, value }) => ({ time, value }));

    //   console.log('Historical ticks from Binance trades:', filteredTicks);
    //   localStorage.setItem('historicalTicks', JSON.stringify(filteredTicks));

    //   if (filteredTicks.length === 0) {
    //     console.warn('No historical ticks available after filtering');
    //     return;
    //   }

    //   setHistoricalTicks(filteredTicks);
    //   const baseline = filteredTicks.length > 0 ? filteredTicks[filteredTicks.length - 1].value : 0;
    //   setHistoricalBaseline(baseline);
    //   console.log('Historical baseline set to:', baseline);
    // } catch (error) {
    //   console.error('Error in fetchHistoricalData:', error.message);
    //   if (error.response) {
    //     console.error('Error response:', error.response.data);
    //   }
    // }
  };

  useEffect(() => {
    fetchHistoricalData();
    const intervalId = setInterval(() => {
      console.log('Refetching historical data...');
      fetchHistoricalData();
    }, 5 * 1000);

    return () => {
      console.log('Cleaning up historical data fetch interval');
      clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="p-6 flex flex-row">
      {/* <div className="w-1/2">
        <BaselineChart
          chartData={chartData}
          historicalTicks={historicalTicks}
          historicalBaseline={historicalBaseline}
        />
      </div> */}
      <div className="w-full bg-red p-4">
      <BaselineChart
          chartData={chartData}
          historicalTicks={historicalTicks}
          historicalBaseline={historicalBaseline}
        />
      </div>
      
      {/* <div className="w-full bg-red p-4">
        <OptionsChart /> 
      </div> */}
      {/* <LineChart /> */}
      {/* <BBaseLineChart /> */}
      {/* <BCandleStickChart />  */}

      
      
    </div>
  );
};

export default PriceChart;