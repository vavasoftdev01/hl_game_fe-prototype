import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import io from 'socket.io-client';

const CandlestickChart = () => {
  console.log('CandlestickChart rendered');

  // Configurable tick interval in milliseconds
  const TICK_INTERVAL_MS = 1000; // 1,000 ms (1 second)
  const TICK_INTERVAL_S = TICK_INTERVAL_MS / 1000; // Convert to seconds (1 second)
  const MAX_TICKS = 500; // Maximum number of candlesticks to display (500 seconds)
  const TOTAL_TIME_SPAN_MS = TICK_INTERVAL_MS * MAX_TICKS; // 500,000 ms (500 seconds)
  const TOTAL_TIME_SPAN_S = TOTAL_TIME_SPAN_MS / 1000; // 500 seconds

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const candlestickSeries = useRef(null);
  const socketRef = useRef(null);
  const isInitialized = useRef(false);
  const [displayedCandles, setDisplayedCandles] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const lastCandleTime = useRef(null);

  // Backend URLs from environment variables
  const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:1002';
  const websocketUrl = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:1002/hl_price';

  // Effect for chart setup
  useEffect(() => {
    console.log('CandlestickChart setup useEffect triggered');
    const setupChart = () => {
      if (chartRef.current && !isInitialized.current) {
        try {
          console.log('Creating chart instance...');
          chartInstance.current = createChart(chartRef.current, {
            width: chartRef.current.offsetWidth,
            height: 300,
            layout: { background: { color: '#25293a' }, textColor: '#e0e0e0' },
            grid: { vertLines: { color: '#2d324d' }, horzLines: { color: '#2d324d' } },
            timeScale: {
              timeVisible: true,
              secondsVisible: true, // Show seconds for 1-second intervals
              tickMarkFormatter: (time, tickMarkType, locale) => {
                const date = new Date(time * 1000);
                return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              },
              minBarSpacing: 0.5, // Ensure more timestamps are visible
            },
            handleScroll: true,
            handleScale: true,
          });

          console.log('Adding candlestick series...');
          candlestickSeries.current = chartInstance.current.addCandlestickSeries({
            upColor: '#26a69a', // Green for bullish candles
            downColor: '#ef5350', // Red for bearish candles
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
          });

          const resize = () => {
            if (chartInstance.current && chartRef.current) {
              chartInstance.current.resize(chartRef.current.offsetWidth, 300);
            }
          };
          window.addEventListener('resize', resize);

          isInitialized.current = true;
          console.log('Chart setup complete');

          return () => {
            console.log('CandlestickChart - Cleaning up chart');
            window.removeEventListener('resize', resize);
            if (chartInstance.current) {
              chartInstance.current.remove();
              chartInstance.current = null;
              candlestickSeries.current = null;
              isInitialized.current = false;
            }
          };
        } catch (error) {
          console.error('CandlestickChart - Error during chart setup:', error);
        }
      }
    };

    setupChart();
  }, []);

  // Effect for fetching historical candlesticks (once on mount)
  useEffect(() => {
    console.log('CandlestickChart fetch historical useEffect triggered');
    const INITIAL_TICKS = 2000; // 2000 ticks (2000 seconds)
    const INITIAL_TIME_SPAN_MS = TICK_INTERVAL_MS * INITIAL_TICKS; // 2,000,000 ms (2000 seconds)
    const INITIAL_TIME_SPAN_S = INITIAL_TIME_SPAN_MS / 1000; // 2000 seconds

    const fetchHistoricalCandlesticks = async () => {
      try {
        console.log('Fetching historical candlesticks from backend /binance/historical...');
        const currentTimeMs = Date.now();
        const endTime = currentTimeMs;
        const startTime = endTime - INITIAL_TIME_SPAN_MS; // Fetch exactly 2000 seconds

        console.log('Fetch parameters:', {
          startTime: new Date(startTime).toLocaleString(),
          endTime: new Date(endTime).toLocaleString(),
          limit: INITIAL_TICKS,
        });

        const response = await fetch(
          `${backendApiUrl}/binance/historical?symbol=BTCUSDT&startTime=${startTime}&endTime=${endTime}&limit=${INITIAL_TICKS}`
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const candles = await response.json();

        console.log('Raw response from backend /binance/historical:', candles);

        if (!candles || candles.length === 0) {
          console.warn('No historical candlesticks returned from backend');
          return [];
        }

        // Log the time range of the fetched data
        const timestamps = candles.map(candle => candle.time);
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        console.log('Fetched timestamps range:', {
          min: new Date(minTime * 1000).toLocaleString(),
          max: new Date(maxTime * 1000).toLocaleString(),
          count: candles.length,
          startExpected: new Date((startTime / 1000) * 1000).toLocaleString(),
          endExpected: new Date((endTime / 1000) * 1000).toLocaleString(),
        });

        return candles;
      } catch (error) {
        console.error('Error in fetchHistoricalCandlesticks:', error.message);
        return [];
      }
    };

    const loadHistoricalData = async () => {
      const candles = await fetchHistoricalCandlesticks();
      if (candles.length === 0) {
        console.warn('No historical candles to display');
        return;
      }

      const currentTime = Math.floor(Date.now() / 1000);

      // Dynamically set the time window based on the fetched data
      const timestamps = candles.map(candle => candle.time);
      const maxTime = Math.max(...timestamps);
      const timeWindowStart = maxTime - INITIAL_TIME_SPAN_S; // 2000 seconds before the latest fetched candle

      console.log('Time window for filtering:', {
        timeWindowStart: new Date(timeWindowStart * 1000).toLocaleString(),
        currentTime: new Date(currentTime * 1000).toLocaleString(),
      });

      const recentCandles = candles
        .filter(candle => {
          const isWithinWindow = candle.time >= timeWindowStart && candle.time <= maxTime;
          console.log('Filtering candle:', {
            time: new Date(candle.time * 1000).toLocaleString(),
            isWithinWindow,
          });
          return isWithinWindow;
        })
        .slice(-INITIAL_TICKS); // Ensure exactly 2000 ticks

      console.log('Filtered recent candles:', recentCandles);
      console.log('Number of recent candles:', recentCandles.length);

      if (recentCandles.length === 0) {
        console.warn('No recent candles within the time window. Using fallback...');
        const lastCandle = candles[candles.length - 1];
        const fallbackTime = currentTime - (currentTime % TICK_INTERVAL_S);
        setDisplayedCandles([
          {
            time: fallbackTime,
            open: lastCandle.close,
            high: lastCandle.close,
            low: lastCandle.close,
            close: lastCandle.close,
          },
        ]);
        lastCandleTime.current = fallbackTime;
        return;
      }

      setDisplayedCandles(recentCandles);
      lastCandleTime.current = recentCandles[recentCandles.length - 1]?.time || currentTime;

      console.log('CandlestickChart - Set displayed candles:', recentCandles);
    };

    // Fetch historical data once on mount
    loadHistoricalData();

    // No interval for refetching
    return () => {
      console.log('No historical candlestick fetch interval to clean up');
    };
  }, []);

  // Effect for setting up the WebSocket connection
  useEffect(() => {
    console.log('CandlestickChart WebSocket setup useEffect triggered');
    const setupWebSocket = () => {
      console.log('Connecting to WebSocket:', websocketUrl);
      socketRef.current = io(websocketUrl, {
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 5000,
      });

      socketRef.current.on('connect', () => {
        console.log('WebSocket connection opened');
      });

      socketRef.current.on('chartUpdate', (data) => {
        console.log('CandlestickChart - Received WebSocket chartUpdate:', data);

        // Add debug log for data validation
        if (!data || typeof data.time !== 'number' || typeof data.value !== 'number') {
          console.error('Invalid chartUpdate data:', data);
          return;
        }

        const point = { time: data.time, value: data.value };
        if (isNaN(point.time) || isNaN(point.value)) {
          console.error('NaN detected in chartUpdate data:', point);
          return;
        }

        console.log('Setting current price:', point.value);
        setCurrentPrice(point.value);

        const currentIntervalS = Math.floor(point.time / TICK_INTERVAL_S) * TICK_INTERVAL_S;

        setDisplayedCandles(prevCandles => {
          const currentTime = Math.floor(Date.now() / 1000);
          const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;

          const existingCandleIndex = prevCandles.findIndex(candle => candle.time === currentIntervalS);
          let updatedCandles = [...prevCandles];

          if (existingCandleIndex === -1) {
            // Start a new 1-second candlestick
            const newCandle = {
              time: currentIntervalS,
              open: point.value,
              high: point.value,
              low: point.value,
              close: point.value,
            };
            lastCandleTime.current = currentIntervalS;
            updatedCandles = [...prevCandles, newCandle]
              .filter(candle => candle.time >= timeWindowStart)
              .slice(-MAX_TICKS);
            console.log('CandlestickChart - Added new 1-second candlestick:', updatedCandles);
          } else {
            // Update the current 1-second candlestick
            const currentCandle = updatedCandles[existingCandleIndex];
            currentCandle.high = Math.max(currentCandle.high, point.value);
            currentCandle.low = Math.min(currentCandle.low, point.value);
            currentCandle.close = point.value;
            console.log('CandlestickChart - Updated current 1-second candlestick:', updatedCandles);
          }

          return updatedCandles;
        });
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('WebSocket connect_error:', error.message);
      });

      socketRef.current.on('disconnect', () => {
        console.log('WebSocket connection closed');
      });

      return () => {
        console.log('CandlestickChart - Cleaning up WebSocket');
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    };

    const cleanup = setupWebSocket();
    return cleanup;
  }, [websocketUrl]);

  // Effect for updating the chart with displayedCandles
  useEffect(() => {
    if (candlestickSeries.current && displayedCandles.length > 0) {
      console.log('CandlestickChart - Applying displayed candles to chart:', displayedCandles);
      try {
        candlestickSeries.current.setData(displayedCandles);

        const INITIAL_TICKS = 2000;
        const INITIAL_TIME_SPAN_S = (TICK_INTERVAL_MS * INITIAL_TICKS) / 1000; // 2000 seconds
        const currentTime = Math.floor(Date.now() / 1000);
        const timeWindowStart = displayedCandles[0].time; // Start from the earliest candle

        console.log('Setting visible range:', {
          from: new Date(timeWindowStart * 1000).toLocaleString(),
          to: new Date(currentTime * 1000).toLocaleString(),
        });

        chartInstance.current.timeScale().setVisibleRange({
          from: timeWindowStart,
          to: currentTime,
        });

        // Auto-scale the price axis
        chartInstance.current.priceScale('right').applyOptions({
          autoScale: true,
        });
      } catch (error) {
        console.error('CandlestickChart - Error applying displayed candles to chart:', error);
      }
    } else {
      console.warn('CandlestickChart - No displayed candles to apply or series not ready:', {
        displayedCandles,
        candlestickSeries: candlestickSeries.current,
      });
    }
  }, [displayedCandles]);

  return (
    <div className="card bg-gray-900 p-6 shadow-lg rounded-lg">
      <h3 className="text-xl font-bold text-cyan-400 mb-3">Candlestick Chart (1s)</h3>
      <div className="text-sm text-gray-400 mb-2">
        Current Price: {currentPrice?.toFixed(2) || 'N/A'}
      </div>
      <div ref={chartRef} style={{ width: '100%', height: '300px' }} />
    </div>
  );
};

export default CandlestickChart;