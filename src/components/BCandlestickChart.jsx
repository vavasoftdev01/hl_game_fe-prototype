import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import io from 'socket.io-client';

const BCandleStickChart = () => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const candleSeries = useRef(null);
  const priceLine = useRef(null);
  const [isChartReady, setIsChartReady] = useState(false);
  const [candleData, setCandleData] = useState([]);
  const socketRef = useRef(null);
  const [currentPrice, setCurrentPrice] = useState(null);
  const renderSync = useRef(0);
  const TOTAL_TIME_SPAN_S = 30;

  const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:1002';
  const websocketUrl = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:1002/hl_price';

  useEffect(() => {
    if (chartRef.current && !chartInstance.current) {
      chartInstance.current = createChart(chartRef.current, {
        width: chartRef.current.offsetWidth,
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

      candleSeries.current = chartInstance.current.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
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

      setTimeout(() => {
        setIsChartReady(true);
      }, 500);

      return () => {
        window.removeEventListener('resize', resize);
        if (chartInstance.current) {
          chartInstance.current.remove();
          chartInstance.current = null;
          candleSeries.current = null;
          priceLine.current = null;
        }
      };
    }
  }, []);

  useEffect(() => {
    if (!isChartReady || !chartInstance.current || !candleSeries.current) return;

    const initializeChart = async () => {
      try {
        const fetchHistoricalData = async () => {
          const currentTimeMs = Date.now();
          const endTime = currentTimeMs - 1000;
          const startTime = endTime - (2 * 60 * 1000);

          const response = await fetch(
            `${backendApiUrl}/binance/historical?symbol=BTCUSDT&startTime=${startTime}&endTime=${endTime}&limit=30`
          );
          if (!response.ok) throw new Error('Failed to fetch historical data');
          const candles = await response.json();

          return candles.map(candle => ({
            time: Math.floor(candle.time / 1000),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          }));
        };

        const historicalData = await fetchHistoricalData();
        const currentTime = Math.floor(Date.now() / 1000);
        const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;

        let initialData = historicalData.length > 0 ? historicalData : [
          { time: timeWindowStart, open: 96741, high: 96741, low: 96741, close: 96741 },
        ];
        initialData = initialData.filter(d => typeof d.time === 'number' && !isNaN(d.time) &&
          typeof d.open === 'number' && !isNaN(d.open) &&
          typeof d.high === 'number' && !isNaN(d.high) &&
          typeof d.low === 'number' && !isNaN(d.low) &&
          typeof d.close === 'number' && !isNaN(d.close));

        if (initialData.length === 0) {
          initialData = [{ time: timeWindowStart, open: 96741, high: 96741, low: 96741, close: 96741 }];
        }

        setCandleData(initialData);
      } catch (error) {
        console.error('Initialization error:', error);
      }
    };

    initializeChart();
  }, [isChartReady]);

  useEffect(() => {
    if (!isChartReady || !chartInstance.current || !candleSeries.current || candleData.length === 0) return;

    const currentTime = Math.floor(Date.now() / 1000);
    const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;

    const validCandleData = candleData.filter(
      d => typeof d.time === 'number' && !isNaN(d.time) &&
           typeof d.open === 'number' && !isNaN(d.open) &&
           typeof d.high === 'number' && !isNaN(d.high) &&
           typeof d.low === 'number' && !isNaN(d.low) &&
           typeof d.close === 'number' && !isNaN(d.close)
    );

    if (validCandleData.length > 0) {
      candleSeries.current.setData(validCandleData);
      chartInstance.current.timeScale().setVisibleRange({
        from: timeWindowStart,
        to: currentTime,
      });

      // Update or create partial price line
      if (priceLine.current) {
        priceLine.current.setPrice(currentPrice || validCandleData[validCandleData.length - 1].close);
      } else if (currentPrice || validCandleData.length > 0) {
        priceLine.current = candleSeries.current.createPriceLine({
          price: currentPrice || validCandleData[validCandleData.length - 1].close,
          color: '#ff9800',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'Current Price',
        });
      }
    }
  }, [isChartReady, candleData, currentPrice]);

  useEffect(() => {
    if (!isChartReady) return;

    socketRef.current = io(websocketUrl, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 5000,
    });

    socketRef.current.on('connect', () => console.log('WebSocket connected'));
    socketRef.current.on('tradeUpdate', (data) => {
      if (!data || typeof data.time !== 'number' || !data.open || !data.high || !data.low || !data.close ||
          typeof data.open !== 'number' || typeof data.high !== 'number' ||
          typeof data.low !== 'number' || typeof data.close !== 'number') {
        console.error('Invalid trade update:', data);
        return;
      }

      const tradeTimeS = Math.floor(data.time / 1000);
      const price = data.close;
      setCurrentPrice(price);

      setTimeout(() => {
        setCandleData(prevData => {
          const currentTime = Math.floor(Date.now() / 1000);
          const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;
          const newData = [...prevData, {
            time: tradeTimeS,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
          }].sort((a, b) => a.time - b.time);
          const filteredData = newData.filter(p => p.time >= timeWindowStart && p.time <= currentTime);

          if (filteredData.length === 0) {
            filteredData.push({
              time: timeWindowStart,
              open: price,
              high: price,
              low: price,
              close: price,
            });
          }

          if (candleSeries.current && chartInstance.current && renderSync.current > 0) {
            candleSeries.current.setData(filteredData);
            chartInstance.current.timeScale().setVisibleRange({
              from: timeWindowStart,
              to: currentTime,
            });
            if (priceLine.current) {
              priceLine.current.setPrice(price);
            } else {
              priceLine.current = candleSeries.current.createPriceLine({
                price: price,
                color: '#ff9800',
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: 'Current Price',
              });
            }
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
  }, [isChartReady]);

  return (
    <div className="card bg-gray-900 p-6 shadow-lg rounded-lg">
      <h3 className="text-xl font-bold text-cyan-400 mb-3">Candlestick Chart (1m historical, 500ms updates)</h3>
      <div className="text-sm text-gray-400 mb-2">Current Price: {currentPrice?.toFixed(2) || 'N/A'}</div>
      <div ref={chartRef} style={{ width: '100%', height: '300px' }} />
    </div>
  );
};

export default BCandleStickChart;