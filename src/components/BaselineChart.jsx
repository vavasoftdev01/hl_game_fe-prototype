import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import io from 'socket.io-client';
import { useStore } from '../states/store';

const BaselineChart = () => {
  console.log('BaselineChart rendered');

  const TICK_INTERVAL_MS = 1000; // 1 second interval for real-time updates
  const TOTAL_TIME_SPAN_S = 100; // 100 seconds to match historical data range

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const baselineSeries = useRef(null);
  const baselineLineSeries = useRef(null);
  const isInitialized = useRef(false);
  const [displayedData, setDisplayedData] = useState([]);
  const [baselineData, setBaselineData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const lastPointTime = useRef(null);
  const socketRef = useRef(null);
  const renderSync = useRef(0);

  const { init } = useStore();

  const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:1002';
  const websocketUrl = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:1002/hl_price';

  const calculateBaseline = (data) => {
    if (data.length < 5) {
      console.log('Not enough data for baseline, need at least 5 points:', data);
      setBaselineData([]);
      return [];
    }

    const baseline = [];
    for (let i = 0; i < data.length; i++) {
      if (i < 4) continue;
      const window = data.slice(i - 4, i + 1);
      const avg = window.reduce((sum, point) => sum + point.value, 0) / 5;
      baseline.push({ time: data[i].time, value: avg });
    }
    console.log('Calculated baseline:', baseline);
    setBaselineData(baseline);
    return baseline;
  };

  // Resize function for chart
  const resize = () => {
    if (chartInstance.current && chartRef.current) {
      chartInstance.current.resize(chartRef.current.offsetWidth, 300);
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
          height: 900,
          layout: { background: { color: '#25293a' }, textColor: '#e0e0e0' },
          grid: { vertLines: { color: '#2d324d' }, horzLines: { color: '#2d324d' } },
          timeScale: {
            timeVisible: true,
            secondsVisible: true,
            tickFormatter: (time) => {
              const date = new Date(time * 1000);
              date.setUTCHours(date.getUTCHours() + 9); // Convert to KST (UTC+9)
              const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
              const day = date.getUTCDate().toString().padStart(2, '0');
              const hours = date.getUTCHours().toString().padStart(2, '0');
              return `${month}-${day}:${hours}`; // Format as MM-DD:HH
            },
            fixLeftEdge: true,
            fixRightEdge: true,
          },
          handleScroll: true,
          handleScale: true,
        });

        baselineSeries.current = chartInstance.current.addBaselineSeries({
          baseValue: { price: 0 },
          topFillColor1: 'rgba(3, 252, 57, 0.56)',
          topFillColor2: 'rgba(5, 205, 255, 0.04)',
          bottomFillColor1: 'rgba(252, 3, 86, 0.56)',
          bottomFillColor2: 'rgba(252, 3, 3, 0.04)',
          lineColor: '#9403fc',
          lineWidth: 3,
          lastPriceAnimation: 1,
          mismatchDirection: 1
        });

        baselineLineSeries.current = chartInstance.current.addLineSeries({
          color: 'rgba(3, 252, 57, 0.56)',
          lineWidth: 0.1,
          lineStyle: 2,
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
          baselineSeries.current = null;
          baselineLineSeries.current = null;
          isInitialized.current = false;
        }
      };
    }
  }, [chartRef]);

  useEffect(() => {
    if (!isInitialized.current || !chartInstance.current || !baselineSeries.current || !baselineLineSeries.current) {
      console.log('Waiting for chart to be initialized...', {
        isInitialized: isInitialized.current,
        chartInstance: !!chartInstance.current,
        baselineSeries: !!baselineSeries.current,
        baselineLineSeries: !!baselineLineSeries.current,
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
            `${backendApiUrl}/binance/historical?symbol=BTCUSDT&startTime=${startTime}&endTime=${endTime}&limit=200`
          );
          if (!response.ok) throw new Error('Failed to fetch historical data');
          const candles = await response.json();

          console.log('Historical data:', candles);

          // Interpolate to 500ms intervals (100s / 200 ticks = 500ms per tick)
          const interpolatedData = [];
          if (candles.length === 1) {
            // If only one candle, create 200 ticks with the same value
            for (let i = 0; i < 200; i++) {
              interpolatedData.push({
                time: startTime + (i * 500),
                value: candles[0].close,
              });
            }
          } else if (candles.length > 1) {
            for (let i = 0; i < candles.length - 1; i++) {
              const startCandle = candles[i];
              const endCandle = candles[i + 1];
              const timeDiff = endCandle.time - startCandle.time;
              const valueDiff = endCandle.close - startCandle.close;
              const steps = timeDiff / 500; // 500ms intervals
              for (let j = 0; j < steps; j++) {
                const interpTime = startCandle.time + (j * 500);
                if (interpTime > endCandle.time) break;
                const interpValue = startCandle.close + (valueDiff * (j / steps));
                interpolatedData.push({ time: interpTime, value: interpValue });
              }
            }
            interpolatedData.push({ time: candles[candles.length - 1].time, value: candles[candles.length - 1].close });
          }
          return interpolatedData.slice(-200); // Take the last 200 ticks
        };

        const historicalData = await fetchHistoricalData();
        const currentTime = Math.floor(Date.now() / 1000);
        const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;

        let initialData = historicalData.length > 0 ? historicalData : [{ time: timeWindowStart, value: 96741 }];
        initialData = initialData.filter(d => typeof d.time === 'number' && !isNaN(d.time) && typeof d.value === 'number' && !isNaN(d.value));
        if (initialData.length === 0) {
          console.warn('No valid historical data, using fallback');
          initialData = [{ time: timeWindowStart, value: 96741 }];
        }

        console.log('Setting initial data:', initialData);
        setDisplayedData(initialData);

        // Apply historical data to the chart immediately
        const validDisplayedData = initialData.filter(
          d => typeof d.time === 'number' && !isNaN(d.time) && typeof d.value === 'number' && !isNaN(d.value)
        );
        const newBaseline = calculateBaseline(validDisplayedData);
        lastPointTime.current = validDisplayedData[validDisplayedData.length - 1].time;

        if (validDisplayedData.length > 0) {
          console.log('Applying initial chart data:', validDisplayedData);
          baselineSeries.current.setData(validDisplayedData);
          console.log('Applying initial baseline data:', newBaseline);
          baselineLineSeries.current.setData(newBaseline);

          // Set visible range to include all historical ticks
          const minTime = Math.min(...validDisplayedData.map(d => d.time));
          const maxTime = Math.max(...validDisplayedData.map(d => d.time));
          chartInstance.current.timeScale().setVisibleRange({
            from: minTime,
            to: maxTime + (TOTAL_TIME_SPAN_S / 2), // Add buffer to ensure full visibility
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
  }, [isInitialized, chartInstance, baselineSeries, baselineLineSeries]);

  useEffect(() => {
    if (!isInitialized.current || !chartInstance.current || !baselineSeries.current || !baselineLineSeries.current || displayedData.length === 0) {
      console.log('Waiting for data to be applied...', {
        isInitialized: isInitialized.current,
        chartInstance: !!chartInstance.current,
        baselineSeries: !!baselineSeries.current,
        baselineLineSeries: !!baselineLineSeries.current,
        displayedDataLength: displayedData.length,
      });
      return;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;

    try {
      const validDisplayedData = displayedData.filter(
        d => typeof d.time === 'number' && !isNaN(d.time) && typeof d.value === 'number' && !isNaN(d.value)
      );
      const validBaselineData = baselineData.filter(
        d => typeof d.time === 'number' && !isNaN(d.time) && typeof d.value === 'number' && !isNaN(d.value)
      );

      if (validDisplayedData.length === 0) {
        console.warn('No valid displayed data to set on chart');
        return;
      }

      console.log('Applying chart data:', validDisplayedData);
      baselineSeries.current.setData(validDisplayedData);
      console.log('Applying baseline data:', validBaselineData);
      baselineLineSeries.current.setData(validBaselineData);
      chartInstance.current.timeScale().setVisibleRange({
        from: timeWindowStart,
        to: currentTime,
      });
      console.log('Chart data and range applied successfully');
      renderSync.current += 1;
    } catch (error) {
      console.error('Error applying chart data:', error);
    }
  }, [displayedData, baselineData, isInitialized, chartInstance, baselineSeries, baselineLineSeries]);

  useEffect(() => {
    if (!isInitialized.current || !chartInstance.current || !baselineSeries.current || !baselineLineSeries.current) return;

    const setupWebSocket = () => {
      socketRef.current = io(websocketUrl, {
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 5000,
      });

      socketRef.current.on('connect', () => console.log('WebSocket connected'));
      socketRef.current.on('tradeUpdate', (data) => {
        console.log('Received tradeUpdate from WebSocket:', data);

        if (!data || typeof data.time !== 'number' || typeof data.value !== 'number') {
          console.error('Invalid trade update:', data);
          return;
        }

        const tradeTimeS = data.time;
        const price = data.value;
        setCurrentPrice(price);

        const tradeTimeMs = tradeTimeS * 1000;
        const currentIntervalS = Math.floor(tradeTimeMs / TICK_INTERVAL_MS) * TICK_INTERVAL_MS / 1000;

        setTimeout(() => {
          setDisplayedData(prevData => {
            const currentTime = Date.now() / 1000;
            const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;
            const newData = [...prevData, { time: currentIntervalS, value: price }].sort((a, b) => a.time - b.time);
            const filteredData = newData.filter(p => p.time >= timeWindowStart && p.time <= currentTime && typeof p.time === 'number' && !isNaN(p.time));

            if (filteredData.length === 0) {
              console.warn('No filtered data after WebSocket update, using fallback');
              filteredData.push({ time: timeWindowStart, value: price });
            }

            const newBaseline = calculateBaseline(filteredData);
            lastPointTime.current = currentIntervalS;

            if (baselineSeries.current && baselineLineSeries.current && chartInstance.current && renderSync.current > 0) {
              try {
                console.log('Applying WebSocket data to chart:', filteredData);
                baselineSeries.current.setData(filteredData);
                console.log('Applying WebSocket baseline to chart:', newBaseline);
                baselineLineSeries.current.setData(newBaseline);
                chartInstance.current.timeScale().setVisibleRange({
                  from: timeWindowStart,
                  to: currentTime,
                });
                console.log('WebSocket data applied successfully');
              } catch (error) {
                console.error('Error applying WebSocket data:', error);
              }
            } else {
              console.warn('Chart not synced or components not ready during WebSocket update', {
                baselineSeries: !!baselineSeries.current,
                baselineLineSeries: !!baselineLineSeries.current,
                chartInstance: !!chartInstance.current,
                renderSync: renderSync.current,
              });
            }

            return filteredData;
          });
        }, 500);
      });

      socketRef.current.on('connect_error', (error) => console.error('WebSocket error:', error.message));
      socketRef.current.on('disconnect', () => console.log('WebSocket disconnected'));

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    };

    const cleanup = setupWebSocket();
    return cleanup;
  }, [isInitialized, chartInstance, baselineSeries, baselineLineSeries, websocketUrl]);

  return (
    <div className="card bg-gray-900 p-6 shadow-lg rounded-lg">
      <h3 className="text-xl font-bold text-cyan-400 mb-3">Baseline Chart (100s historical at 500ms, 1s updates)</h3>
      <div className="text-sm text-gray-400 mb-2">Current Price: {currentPrice?.toFixed(2) || 'N/A'}</div>
      <div ref={chartRef} style={{ width: '100%', height: '300px' }} />
    </div>
  );
};

export default BaselineChart;