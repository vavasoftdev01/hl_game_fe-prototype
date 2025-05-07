import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import io from 'socket.io-client';

const LineChart = () => {
  // Configurable tick interval in milliseconds
  const TICK_INTERVAL_MS = 1; // 1ms interval for real-time updates
  const TICK_INTERVAL_S = TICK_INTERVAL_MS / 1000; // Convert to seconds (0.001 seconds)
  const MAX_TICKS = 300000; // Maximum number of points to display (300,000ms = 5 minutes)
  const TOTAL_TIME_SPAN_MS = TICK_INTERVAL_MS * MAX_TICKS; // 300,000ms = 5 minutes
  const TOTAL_TIME_SPAN_S = TOTAL_TIME_SPAN_MS / 1000; // 300 seconds = 5 minutes
  const UPDATE_INTERVAL_MS = 100; // Batch updates every 100ms

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const lineSeries = useRef(null);
  const socketRef = useRef(null);
  const isInitialized = useRef(false);
  const [displayedData, setDisplayedData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const lastPointTime = useRef(null);
  const pendingUpdates = useRef([]); // Store updates temporarily for batching

  // Backend URLs
  const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:1002';
  const websocketUrl = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:1002/hl_price';

  // Chart setup
  useEffect(() => {
    const setupChart = () => {
      if (chartRef.current && !isInitialized.current) {
        try {
          chartInstance.current = createChart(chartRef.current, {
            width: chartRef.current.offsetWidth,
            height: 900,
            layout: { background: { color: '#0d0a02' }, textColor: '#b660f7' },
            grid: { vertLines: { color: '#0f0f0f' }, horzLines: { color: '#0f0f0f' } },
            timeScale: {
              timeVisible: false,
              secondsVisible: false,
              tickMarkFormatter: (time, tickMarkType, locale) => {
                const date = new Date(time * 1000); // Convert back to milliseconds for display
                return `${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.${date.getMilliseconds().toString().padStart(3, '0')}`;
              },
              minBarSpacing: 2,
            },
            handleScroll: true,
            handleScale: true,
          });

          lineSeries.current = chartInstance.current.addLineSeries({
            color: '#2962FF',
            lineWidth: 2,
          });

          const resize = () => {
            if (chartInstance.current && chartRef.current) {
              chartInstance.current.resize(chartRef.current.offsetWidth, 300);
            }
          };
          window.addEventListener('resize()', resize);

          isInitialized.current = true;

          return () => {
            window.removeEventListener('resize', resize);
            if (chartInstance.current) {
              chartInstance.current.remove();
              chartInstance.current = null;
              lineSeries.current = null;
              isInitialized.current = false;
            }
          };
        } catch (error) {
          console.error('LineChart - Error during chart setup:', error);
        }
      }
    };

    setupChart();
  }, []);

  // Fetch historical data (using 1m interval due to API limitation, limited to 60 candlesticks)
  useEffect(() => {
    const INITIAL_TICKS = 60; // Fetch 60 candlesticks (60 minutes = 1 hour at 1m interval)
    const INITIAL_TIME_SPAN_MS = 60 * 1000 * INITIAL_TICKS; // 1 minute per tick in milliseconds
    const INITIAL_TIME_SPAN_S = INITIAL_TIME_SPAN_MS / 1000;

    const fetchHistoricalData = async () => {
      try {
        const currentTimeMs = Date.now();
        const endTime = currentTimeMs - 1000; // Subtract 1 second buffer to avoid future timestamps
        const startTime = endTime - INITIAL_TIME_SPAN_MS;

        // Validate timestamps
        if (isNaN(startTime) || isNaN(endTime)) {
          console.error(`Invalid timestamps: startTime=${startTime}, endTime=${endTime}`);
          return [];
        }

        if (startTime >= endTime) {
          throw new Error(`Invalid time range: startTime (${startTime}) must be less than endTime (${endTime})`);
        }

        console.log(`Fetching historical data with: startTime=${startTime} (${new Date(startTime).toISOString()}), endTime=${endTime} (${new Date(endTime).toISOString()}), limit=${INITIAL_TICKS}`);

        const response = await fetch(
          `${backendApiUrl}/binance/historical?symbol=BTCUSDT&startTime=${startTime}&endTime=${endTime}&limit=${INITIAL_TICKS}`
        );
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        const candles = await response.json();

        console.log('Raw historical data from backend:', candles);

        if (!candles || candles.length === 0) {
          console.warn('No historical data returned from backend');
          return [];
        }

        const lineData = candles.map(candle => ({
          time: candle.time, // In seconds
          value: candle.close,
        }));

        console.log('Mapped historical data for chart:', lineData);

        return lineData;
      } catch (error) {
        console.error('Error in fetchHistoricalData:', error.message);
        return [];
      }
    };

    const loadHistoricalData = async () => {
      const data = await fetchHistoricalData();
      console.log('Fetched historical data:', data);

      if (data.length === 0) {
        console.warn('No historical data to display');
        // Fallback to a single point at the current time
        const currentTime = Math.floor(Date.now() / 1000);
        const fallbackData = [
          {
            time: currentTime,
            value: 94773.84, // Use the last known price from the chart screenshot
          },
        ];
        console.log('Using fallback data:', fallbackData);
        setDisplayedData(fallbackData);
        lastPointTime.current = currentTime;
        return;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      //console.log(`Current time for filtering: ${currentTime} (${ lethality Date(currentTime * 1000).toISOString()})`);
      const timestamps = data.map(point => point.time);
      const maxTime = Math.max(...timestamps);
      console.log(`Max timestamp in historical data: ${maxTime} (${new Date(maxTime * 1000).toISOString()})`);
      // Focus on the most recent 5 minutes for the chart
      const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;
      console.log(`Time window for chart: from ${timeWindowStart} (${new Date(timeWindowStart * 1000).toISOString()}) to ${currentTime} (${new Date(currentTime * 1000).toISOString()})`);

      const recentData = data
        .filter(point => point.time >= timeWindowStart && point.time <= currentTime)
        .slice(-MAX_TICKS);

      console.log('Filtered recent data for chart:', recentData);

      if (recentData.length === 0) {
        console.warn('No recent data within the time window. Using fallback...');
        const lastPoint = data[data.length - 1];
        const fallbackTime = currentTime - (currentTime % 1);
        const fallbackData = [
          {
            time: fallbackTime,
            value: lastPoint.value,
          },
        ];
        console.log('Using fallback data:', fallbackData);
        setDisplayedData(fallbackData);
        lastPointTime.current = fallbackTime;
        return;
      }

      setDisplayedData(recentData);
      lastPointTime.current = recentData[recentData.length - 1]?.time || currentTime;
      console.log('Set displayed data:', recentData);
    };

    loadHistoricalData();
  }, []);

  // WebSocket setup with batching (using backend socket.io)
  useEffect(() => {
    const setupWebSocket = () => {
      socketRef.current = io(websocketUrl, {
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 5000,
      });

      socketRef.current.on('connect', () => {
        console.log('WebSocket connected');
      });

      socketRef.current.on('tradeUpdate', (data) => {
        console.log('Received tradeUpdate from WebSocket:', data);
        // Validate data
        if (!data || typeof data.time !== 'number' || typeof data.value !== 'number') {
          console.error('Invalid tradeUpdate data:', data);
          return;
        }

        const tradeTimeS = data.time; // Already in seconds
        const price = data.value;
        setCurrentPrice(price);

        // Align to the nearest 1ms interval
        const tradeTimeMs = tradeTimeS * 1000; // Convert to milliseconds
        const currentIntervalMs = Math.floor(tradeTimeMs / TICK_INTERVAL_MS) * TICK_INTERVAL_MS;
        const currentIntervalS = currentIntervalMs / 1000; // Convert back to seconds for the chart

        // Add to pending updates
        pendingUpdates.current.push({ time: currentIntervalS, value: price });
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('Backend WebSocket connect_error:', error.message);
      });

      socketRef.current.on('disconnect', () => {
        console.log('WebSocket disconnected');
      });

      // Batch updates every 100ms
      const batchUpdate = setInterval(() => {
        if (pendingUpdates.current.length === 0) return;

        setDisplayedData(prevData => {
          let updatedData = [...prevData];
          const currentTime = Date.now() / 1000;
          const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;

          // Process each pending update
          pendingUpdates.current.forEach(({ time, value }) => {
            const existingPointIndex = updatedData.findIndex(p => p.time === time);
            if (existingPointIndex === -1) {
              // Add a new point for the 1ms interval
              const newPoint = { time, value };
              lastPointTime.current = time;
              updatedData.push(newPoint);
            } else {
              // Update the existing point for the 1ms interval
              updatedData[existingPointIndex].value = value;
            }
          });

          // Clear pending updates
          pendingUpdates.current = [];

          // Filter and limit the data to the most recent points (5 minutes at 1ms intervals)
          updatedData = updatedData
            .filter(p => p.time >= timeWindowStart)
            .slice(-MAX_TICKS);

          console.log('Updated displayed data with WebSocket updates:', updatedData);
          return updatedData;
        });
      }, UPDATE_INTERVAL_MS);

      return () => {
        clearInterval(batchUpdate);
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    };

    const cleanup = setupWebSocket();
    return cleanup;
  }, [websocketUrl]);

  // Update chart with displayed data
  useEffect(() => {
    if (lineSeries.current && displayedData.length > 0) {
      try {
        console.log('Applying data to chart:', displayedData);
        lineSeries.current.setData(displayedData);

        const currentTime = Date.now() / 1000;
        const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;

        console.log(`Setting chart visible range: from ${timeWindowStart} to ${currentTime}`);
        chartInstance.current.timeScale().setVisibleRange({
          from: timeWindowStart,
          to: currentTime,
        });

        chartInstance.current.priceScale('right').applyOptions({
          autoScale: true,
        });
      } catch (error) {
        console.error('LineChart - Error applying displayed data to chart:', error);
      }
    } else {
      console.warn('LineChart - No displayed data to apply or series not ready:', {
        displayedData,
        lineSeries: lineSeries.current,
      });
    }
  }, [displayedData]);

  return (
    <div className="card bg-gray-900 p-6 shadow-lg rounded-lg">
      <h3 className="text-xl font-bold text-cyan-400 mb-3">Line Chart (1m historical, 1ms updates)</h3>
      <div className="text-sm text-gray-400 mb-2">
        Current Price: {currentPrice?.toFixed(2) || 'N/A'}
      </div>
      <div ref={chartRef} style={{ width: '100%', height: '300px' }} />
    </div>
  );
};

export default LineChart;