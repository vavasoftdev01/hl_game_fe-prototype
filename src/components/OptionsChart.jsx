import { useEffect, useRef, useState } from 'react';
import { createChart, LineType } from 'lightweight-charts';
import io from 'socket.io-client';
import { useStore } from '../states/store';

const OptionsChart = () => {
  const TICK_INTERVAL_MS = 300; // 300ms interval for faster updates
  const TOTAL_TIME_SPAN_S = 100; // 100 seconds to match historical data range

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const lineSeries = useRef(null);
  const isInitialized = useRef(false);
  const [displayedData, setDisplayedData] = useState([]);
  const socketRef = useRef(null);
  const renderSync = useRef(0);
  const lastUpdateTime = useRef(0); // Track the last update timestamp

  const { init } = useStore();

  const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:1002';
  const websocketUrl = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:1002/hl_price';

  // Resize function for chart
  const resize = () => {
    if (chartInstance.current && chartRef.current) {
      chartInstance.current.resize(chartRef.current.offsetWidth, 600);
    }
  };

  useEffect(() => {
    console.log('Initializing store WebSocket listener...');
    init();
  }, [init]);

  useEffect(() => {
    if (chartRef.current && !isInitialized.current) {
      try {
        console.log('Initializing chart...');
        chartInstance.current = createChart(chartRef.current, {
          width: chartRef.current.offsetWidth,
          height: 600,
          layout: { background: { color: '#25293a' }, textColor: '#e0e0e0' },
          grid: { vertLines: { color: '#2d324d' }, horzLines: { color: '#2d324d' } },
          timeScale: {
            timeVisible: false, // Treat as price levels
            rightOffset: 20,
            barSpacing: 10,
            fixLeftEdge: true,
            fixRightEdge: true,
            autoScale: true,
          },
          priceScale: {
            autoScale: true,
            position: 'right',
          },
          handleScroll: true,
          handleScale: true,
        });

        lineSeries.current = chartInstance.current.addLineSeries({
          color: '#00ff00',
          lineWidth: 2,
          lastPriceAnimation: 1, // OnDataUpdate mode
          lineType: LineType.Curve, // Smooth curve
        });

        window.addEventListener('resize', resize);

        isInitialized.current = true;
        console.log('Chart initialization complete');
      } catch (error) {
        console.error('Chart initialization error:', error);
      }

      return () => {
        console.log('Cleaning up chart...');
        window.removeEventListener('resize', resize);
        if (chartInstance.current) {
          chartInstance.current.remove();
          chartInstance.current = null;
          lineSeries.current = null;
          isInitialized.current = false;
        }
      };
    }
  }, [chartRef]);

  useEffect(() => {
    if (!isInitialized.current || !chartInstance.current || !lineSeries.current) {
      console.log('Waiting for chart to be initialized...', {
        isInitialized: isInitialized.current,
        chartInstance: !!chartInstance.current,
        lineSeries: !!lineSeries.current,
      });
      return;
    }

    const initializeChart = async () => {
      try {
        const fetchHistoricalData = async () => {
          const currentTimeMs = Date.now();
          const endTime = currentTimeMs - 1000;
          const startTime = endTime - (100 * 1000); // 100 seconds

          console.log(`Fetching historical data: start=${startTime}, end=${endTime}`);

          const response = await fetch(
            `${backendApiUrl}/binance/historical?symbol=BTCUSDT&startTime=${startTime}&endTime=${endTime}&limit=100`
          );
          if (!response.ok) throw new Error('Failed to fetch historical data');
          const candles = await response.json();

          console.log('Historical data:', candles);

          // Map historical data: use price as x-axis, simulate option premium as y-axis
          const mappedData = candles.map(candle => ({
            time: candle.close, // Use price as the x-axis
            value: candle.close * 0.02, // Increased multiplier for more sensitivity (y-axis)
          }));

          // Sort and deduplicate by price (x-axis)
          const uniquePrices = new Map();
          mappedData.forEach(d => {
            if (!uniquePrices.has(d.time)) {
              uniquePrices.set(d.time, d);
            }
          });
          const sortedData = Array.from(uniquePrices.values()).sort((a, b) => a.time - b.time);

          return sortedData.slice(-200); // Take the last 200 points
        };

        const historicalData = await fetchHistoricalData();
        const priceWindowStart = Math.min(...historicalData.map(d => d.time));

        let initialData = historicalData.length > 0 ? historicalData : [{ time: 96741, value: 96741 * 0.02 }];
        initialData = initialData.filter(d => typeof d.time === 'number' && !isNaN(d.time) && typeof d.value === 'number' && !isNaN(d.value));
        if (initialData.length === 0) {
          console.warn('No valid historical data, using fallback');
          initialData = [{ time: 96741, value: 96741 * 0.02 }];
        }

        console.log('Setting initial data:', initialData);
        setDisplayedData(initialData);

        const validDisplayedData = initialData.filter(
          d => typeof d.time === 'number' && !isNaN(d.time) && typeof d.value === 'number' && !isNaN(d.value)
        );

        if (validDisplayedData.length > 0) {
          console.log('Applying initial chart data:', validDisplayedData);
          lineSeries.current.setData(validDisplayedData);

          const minPrice = Math.min(...validDisplayedData.map(d => d.time));
          const maxPrice = Math.max(...validDisplayedData.map(d => d.time));
          chartInstance.current.timeScale().setVisibleRange({
            from: minPrice,
            to: maxPrice + 5000, // Extend range slightly
          });
          console.log('Initial chart data and range applied successfully');
          renderSync.current += 1;
        } else {
          console.warn('No valid displayed data to set on chart during initialization');
        }
      } catch (error) {
        console.error('Initialization error:', error);
      }
    };

    initializeChart();
  }, [isInitialized, chartInstance, lineSeries]);

  useEffect(() => {
    if (!isInitialized.current || !chartInstance.current || !lineSeries.current || displayedData.length === 0) {
      console.log('Waiting for data to be applied...', {
        isInitialized: isInitialized.current,
        chartInstance: !!chartInstance.current,
        lineSeries: !!lineSeries.current,
        displayedDataLength: displayedData.length,
      });
      return;
    }

    const priceWindowStart = Math.min(...displayedData.map(d => d.time));

    try {
      const validDisplayedData = displayedData.filter(
        d => typeof d.time === 'number' && !isNaN(d.time) && typeof d.value === 'number' && !isNaN(d.value)
      );

      if (validDisplayedData.length === 0) {
        console.warn('No valid displayed data to set on chart');
        return;
      }

      console.log('Applying chart data:', validDisplayedData);
      lineSeries.current.setData(validDisplayedData);
      chartInstance.current.timeScale().setVisibleRange({
        from: priceWindowStart,
        to: Math.max(...validDisplayedData.map(d => d.time)) + 5000,
      });
      console.log('Chart data and range applied successfully');
      renderSync.current += 1;
    } catch (error) {
      console.error('Error applying chart data:', error);
    }
  }, [displayedData, isInitialized, chartInstance, lineSeries]);

  useEffect(() => {
    if (!isInitialized.current || !chartInstance.current || !lineSeries.current) return;

    const setupWebSocket = () => {
      socketRef.current = io(websocketUrl, {
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 5000,
      });

      socketRef.current.on('connect', () => {
        console.log('WebSocket connected successfully');
      });

      socketRef.current.on('tradeUpdate', (data) => {
        console.log('Received tradeUpdate from WebSocket:', data);

        if (!data || typeof data.value !== 'number') {
          console.error('Invalid trade update:', data);
          return;
        }

        const price = data.value;
        const simulatedPremium = price * 0.03; // Increased multiplier for more sensitivity
        const newPoint = { time: price, value: simulatedPremium };

        const now = Date.now();
        if (now - lastUpdateTime.current < TICK_INTERVAL_MS) {
          console.log('Throttling update, waiting for next interval...', { elapsed: now - lastUpdateTime.current });
          return;
        }

        lastUpdateTime.current = now;
        setDisplayedData(prevData => {
          const priceWindowStart = Math.min(...prevData.map(d => d.time));

          const newData = [...prevData, newPoint].sort((a, b) => a.time - b.time);

          // Deduplicate by price (keep the latest value for each price)
          const uniquePrices = new Map();
          newData.forEach(d => uniquePrices.set(d.time, d));
          const deduplicatedData = Array.from(uniquePrices.values());

          const limitedData = deduplicatedData.slice(-200).filter(
            p => p.time >= priceWindowStart && typeof p.time === 'number' && !isNaN(p.time)
          );

          if (limitedData.length === 0) {
            console.warn('No filtered data, using fallback');
            limitedData.push({ time: priceWindowStart, value: simulatedPremium });
          }

          console.log('Applying new chart data:', limitedData);
          if (lineSeries.current && chartInstance.current && renderSync.current > 0) {
            try {
              lineSeries.current.setData(limitedData);
              chartInstance.current.timeScale().setVisibleRange({
                from: priceWindowStart,
                to: Math.max(...limitedData.map(d => d.time)) + 5000,
              });
              console.log('Chart data applied successfully');
            } catch (error) {
              console.error('Error applying chart data:', error);
            }
          }

          return limitedData;
        });
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error.message);
      });

      socketRef.current.on('disconnect', () => {
        console.log('WebSocket disconnected');
      });

      return () => {
        if (socketRef.current) {
          console.log('Disconnecting WebSocket...');
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    };

    const cleanup = setupWebSocket();
    return cleanup;
  }, [isInitialized, chartInstance, lineSeries, websocketUrl]);

  return (
    <div className="card bg-gray-900 p-6 shadow-lg rounded-lg">
      <h3 className="text-xl font-bold text-cyan-400 mb-3">Options Chart (Price vs. Simulated Premium)</h3>
      <div ref={chartRef} style={{ width: '100%', height: '600px' }} />
    </div>
  );
};

export default OptionsChart;