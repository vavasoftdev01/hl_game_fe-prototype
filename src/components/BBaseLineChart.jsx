import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import io from 'socket.io-client';

const useChart = (ref) => {
  const chartInstance = useRef(null);
  const priceSeries = useRef(null);
  const baselineSeries = useRef(null);
  const [isChartInitialized, setIsChartInitialized] = useState(false);

  useEffect(() => {
    if (ref.current && !chartInstance.current) {
      try {
        console.log('Initializing chart...');
        chartInstance.current = createChart(ref.current, {
          width: ref.current.offsetWidth,
          height: 300,
          layout: { background: { color: '#25293a' }, textColor: '#e0e0e0' },
          grid: { vertLines: { color: '#2d324d' }, horzLines: { color: '#2d324d' } },
          timeScale: {
            timeVisible: true,
            secondsVisible: true,
            tickMarkFormatter: (time) => {
              const date = new Date(time * 1000);
              return `${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.${date.getMilliseconds().toString().padStart(3, '0')}`;
            },
            fixLeftEdge: true,
            fixRightEdge: true,
          },
          handleScroll: true,
          handleScale: true,
        });

        priceSeries.current = chartInstance.current.addLineSeries({
          color: '#2962FF',
          lineWidth: 2,
        });

        baselineSeries.current = chartInstance.current.addLineSeries({
          color: '#FF6B6B',
          lineWidth: 1,
          lineStyle: 2,
        });

        const resize = () => {
          if (chartInstance.current && ref.current) {
            chartInstance.current.resize(ref.current.offsetWidth, 300);
          }
        };
        window.addEventListener('resize', resize);

        setTimeout(() => {
          console.log('Chart initialization complete');
          setIsChartInitialized(true);
        }, 500);

        return () => {
          console.log('Cleaning up chart...');
          window.removeEventListener('resize', resize);
          if (chartInstance.current) {
            chartInstance.current.remove();
            chartInstance.current = null;
            priceSeries.current = null;
            baselineSeries.current = null;
            setIsChartInitialized(false);
          }
        };
      } catch (error) {
        console.error('Chart initialization error:', error);
      }
    }
  }, [ref]);

  return { chartInstance, priceSeries, baselineSeries, isChartInitialized };
};

const BBaseLineChart = () => {
  const TICK_INTERVAL_MS = 1; // 1ms interval for real-time updates
  const TOTAL_TIME_SPAN_S = 30; // 30 seconds

  const chartRef = useRef(null);
  const { chartInstance, priceSeries, baselineSeries, isChartInitialized } = useChart(chartRef);
  const socketRef = useRef(null);
  const [isChartReady, setIsChartReady] = useState(false);
  const [displayedData, setDisplayedData] = useState([]);
  const [baselineData, setBaselineData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const lastPointTime = useRef(null);
  const [isDataApplied, setIsDataApplied] = useState(false);
  const renderSync = useRef(0);

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

  useEffect(() => {
    if (!isChartInitialized || !chartInstance.current || !priceSeries.current || !baselineSeries.current) {
      console.log('Waiting for chart to be initialized...', {
        isChartInitialized,
        chartInstance: !!chartInstance.current,
        priceSeries: !!priceSeries.current,
        baselineSeries: !!baselineSeries.current,
      });
      return;
    }

    setIsChartReady(true);

    const initializeChart = async () => {
      try {
        const fetchHistoricalData = async () => {
          const currentTimeMs = Date.now();
          const endTime = currentTimeMs - 1000;
          const startTime = endTime - (2 * 60 * 1000);

          console.log(`Fetching historical data: start=${startTime}, end=${endTime}`);

          const response = await fetch(
            `${backendApiUrl}/binance/historical?symbol=BTCUSDT&startTime=${startTime}&endTime=${endTime}&limit=2`
          );
          if (!response.ok) throw new Error('Failed to fetch historical data');
          const candles = await response.json();

          console.log('Historical data:', candles);

          return candles.map(candle => ({
            time: candle.time,
            value: candle.close,
          }));
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
        calculateBaseline(initialData);
        lastPointTime.current = initialData[initialData.length - 1].time;
        setIsDataApplied(true);
      } catch (error) {
        console.error('Initialization error:', error);
      }
    };

    initializeChart();
  }, [isChartInitialized, chartInstance, priceSeries, baselineSeries]);

  useEffect(() => {
    if (!isChartReady || !isDataApplied || !chartInstance.current || !priceSeries.current || !baselineSeries.current) {
      console.log('Waiting for data to be applied...', {
        isChartReady,
        isDataApplied,
        chartInstance: !!chartInstance.current,
        priceSeries: !!priceSeries.current,
        baselineSeries: !!baselineSeries.current,
      });
      return;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;

    if (priceSeries.current && baselineSeries.current && chartInstance.current) {
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
        priceSeries.current.setData(validDisplayedData);
        console.log('Applying baseline data:', validBaselineData);
        baselineSeries.current.setData(validBaselineData);
        chartInstance.current.timeScale().setVisibleRange({
          from: timeWindowStart,
          to: currentTime,
        });
        console.log('Chart data and range applied successfully');
        renderSync.current += 1;
      } catch (error) {
        console.error('Error applying chart data:', error);
      }
    } else {
      console.warn('Chart components not ready during data application');
    }
  }, [isChartReady, isDataApplied, chartInstance, priceSeries, baselineSeries, displayedData, baselineData]);

  useEffect(() => {
    if (!isChartReady || !chartInstance.current || !priceSeries.current || !baselineSeries.current) return;

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

            if (priceSeries.current && baselineSeries.current && chartInstance.current && renderSync.current > 0) {
              try {
                console.log('Applying WebSocket data to chart:', filteredData);
                priceSeries.current.setData(filteredData);
                console.log('Applying WebSocket baseline to chart:', newBaseline);
                baselineSeries.current.setData(newBaseline);
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
                priceSeries: !!priceSeries.current,
                baselineSeries: !!baselineSeries.current,
                chartInstance: !!chartInstance.current,
                renderSync: renderSync.current,
              });
            }

            return filteredData;
          });
        }, 500); // Changed from 250ms to 500ms
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
  }, [isChartReady, chartInstance, priceSeries, baselineSeries, websocketUrl]);

  useEffect(() => {
    if (!isChartReady || !chartInstance.current || !priceSeries.current || !baselineSeries.current || displayedData.length === 0) return;

    const currentTime = Date.now() / 1000;
    const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;

    const dataTimes = displayedData.map(d => d.time).filter(t => typeof t === 'number' && !isNaN(t));
    if (dataTimes.length > 0) {
      const minDataTime = Math.min(...dataTimes);
      const maxDataTime = Math.max(...dataTimes);
      console.log(`Data range: ${minDataTime} (${new Date(minDataTime * 1000).toISOString()}) to ${maxDataTime} (${new Date(maxDataTime * 1000).toISOString()})`);
    } else {
      console.warn('No valid data points to log range');
    }

    if (chartInstance.current) {
      try {
        chartInstance.current.timeScale().setVisibleRange({
          from: timeWindowStart,
          to: currentTime,
        });
        console.log('Visible range updated successfully');
      } catch (error) {
        console.error('Error updating visible range:', error);
      }
    } else {
      console.warn('Chart instance not ready during visible range update');
    }
  }, [displayedData, baselineData, isChartReady, chartInstance]);

  return (
    <div className="card bg-gray-900 p-6 shadow-lg rounded-lg">
      <h3 className="text-xl font-bold text-cyan-400 mb-3">Baseline Chart (1m historical, 1ms updates)</h3>
      <div className="text-sm text-gray-400 mb-2">Current Price: {currentPrice?.toFixed(2) || 'N/A'}</div>
      <div ref={chartRef} style={{ width: '100%', height: '300px' }} />
    </div>
  );
};

export default BBaseLineChart;