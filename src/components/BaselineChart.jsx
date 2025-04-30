import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';

const BaselineChart = ({ chartData, historicalTicks, historicalBaseline }) => {
  console.log('BaselineChart rendered');

  const TICK_INTERVAL_MS = 1000; // 1000 ms (1 second)
  const TICK_INTERVAL_S = TICK_INTERVAL_MS / 1000; // Convert to seconds
  const MAX_TICKS = 500; // Number of ticks to display (500 seconds)
  const TOTAL_TIME_SPAN_MS = TICK_INTERVAL_MS * MAX_TICKS; // 500,000 ms
  const TOTAL_TIME_SPAN_S = TOTAL_TIME_SPAN_MS / 1000; // 500 seconds

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const baselineSeries = useRef(null);
  const baselineLineSeries = useRef(null);
  const baselineValue = useRef(historicalBaseline || 0);
  const isInitialized = useRef(false);
  const [displayedTicks, setDisplayedTicks] = useState([]);
  const [bufferedUpdates, setBufferedUpdates] = useState([]);
  const lastUpdateInterval = useRef(null);

  useEffect(() => {
    console.log('BaselineChart setup useEffect triggered');
    const setupChart = () => {
      if (chartRef.current && !isInitialized.current) {
        try {
          console.log('Creating chart instance...');
          chartInstance.current = createChart(chartRef.current, {
            width: chartRef.current.offsetWidth,
            height: 300,
            layout: { background: { color: '#25293a' }, textColor: '#e0e0e0' },
            grid: { vertLines: { color: '#2d324d' }, horzLines: { color: '#2d324d' } },
            timeScale: { timeVisible: true, secondsVisible: true },
            handleScroll: true,
            handleScale: true,
          });

          console.log('Adding baseline series...');
          baselineSeries.current = chartInstance.current.addBaselineSeries({
            baseValue: { price: baselineValue.current },
            topFillColor1: 'rgba(76, 175, 80, 0.28)',
            topFillColor2: 'rgba(76, 175, 80, 0.05)',
            bottomFillColor1: 'rgba(239, 83, 80, 0.28)',
            bottomFillColor2: 'rgba(239, 83, 80, 0.05)',
            lineColor: '#00FFFF', // Cyan for all data
            lineWidth: 2,
          });

          console.log('Adding baseline line series...');
          baselineLineSeries.current = chartInstance.current.addLineSeries({
            color: '#FF0000',
            lineWidth: 1,
            lineStyle: 2, // Dashed line for baseline
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
            console.log('BaselineChart - Cleaning up chart');
            window.removeEventListener('resize', resize);
            if (chartInstance.current) {
              chartInstance.current.remove();
              chartInstance.current = null;
              baselineSeries.current = null;
              baselineLineSeries.current = null;
              isInitialized.current = false;
            }
          };
        } catch (error) {
          console.error('BaselineChart - Error during chart setup:', error);
        }
      }
    };

    setupChart();
  }, []);

  useEffect(() => {
    console.log('BaselineChart historical ticks useEffect triggered');
    console.log('Historical ticks received:', historicalTicks);
    console.log('Number of historical ticks:', historicalTicks?.length || 0);
    console.log('Historical baseline received:', historicalBaseline);

    if (historicalTicks && historicalTicks.length > 0 && baselineSeries.current) {
      const currentTime = Math.floor(Date.now() / 1000);
      const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;
      let recentTicks = historicalTicks.filter(
        tick => tick.time >= timeWindowStart && tick.time <= currentTime
      );

      if (recentTicks.length === 0) {
        console.warn('No ticks within the time window. Using fallback...');
        const lastTick = historicalTicks[historicalTicks.length - 1];
        recentTicks = [{ time: currentTime, value: lastTick.value }];
      }

      // Group ticks by second and assign fractional timestamps
      const ticksBySecond = {};
      recentTicks.forEach(tick => {
        const second = Math.floor(tick.time);
        if (!ticksBySecond[second]) {
          ticksBySecond[second] = [];
        }
        ticksBySecond[second].push(tick);
      });

      const adjustedTicks = [];
      Object.keys(ticksBySecond).sort((a, b) => a - b).forEach(second => {
        const ticksInSecond = ticksBySecond[second];
        ticksInSecond.forEach((tick, index) => {
          // Use a smaller fraction to exaggerate spikiness (e.g., 1/10th of a second)
          const fraction = ticksInSecond.length > 1 ? (index * 0.1) / (ticksInSecond.length - 1) : 0;
          const adjustedTime = parseFloat(second) + fraction * TICK_INTERVAL_S;
          adjustedTicks.push({ time: adjustedTime, value: tick.value });
        });
      });

      setDisplayedTicks(() => {
        const combinedTicks = adjustedTicks
          .sort((a, b) => a.time - b.time)
          .slice(-MAX_TICKS * 10); // Allow more ticks for spikiness

        console.log('BaselineChart - Updated displayed ticks with new historical data:', combinedTicks);
        return combinedTicks;
      });

      lastUpdateInterval.current = Math.floor(recentTicks[recentTicks.length - 1].time);

      if (historicalBaseline && !isNaN(historicalBaseline)) {
        baselineValue.current = historicalBaseline;
        console.log('Updated baseline value to:', baselineValue.current);
        const baselineData = adjustedTicks.map(tick => ({
          time: tick.time,
          value: baselineValue.current,
        }));
        baselineLineSeries.current.setData(baselineData);
      }
    } else {
      console.warn('BaselineChart - No historical ticks to apply or series not ready:', {
        historicalTicks,
        baselineSeries: baselineSeries.current,
      });
    }
  }, [historicalTicks, historicalBaseline]);

  useEffect(() => {
    if (baselineSeries.current && displayedTicks.length > 0) {
      console.log('BaselineChart - Applying displayed ticks to chart:', displayedTicks);
      try {
        const validTicks = displayedTicks.filter(tick => {
          const isValid = tick.time && !isNaN(tick.time) && tick.value && !isNaN(tick.value);
          if (!isValid) {
            console.error('Invalid tick:', tick);
          }
          return isValid;
        });

        if (validTicks.length === 0) {
          console.warn('No valid ticks to display');
          return;
        }

        if (validTicks.length > 1) {
          baselineSeries.current.setData(validTicks.slice(0, -1));
          baselineSeries.current.update(validTicks[validTicks.length - 1]);
        } else {
          baselineSeries.current.setData(validTicks);
        }

        const currentTime = Math.floor(Date.now() / 1000);
        const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;
        chartInstance.current.timeScale().setVisibleRange({
          from: timeWindowStart,
          to: currentTime,
        });
      } catch (error) {
        console.error('BaselineChart - Error applying displayed ticks to chart:', error);
      }
    } else {
      console.warn('BaselineChart - No displayed ticks to apply or series not ready:', {
        displayedTicks,
        baselineSeries: baselineSeries.current,
      });
    }
  }, [displayedTicks]);

  useEffect(() => {
    console.log('BaselineChart real-time update useEffect triggered');
    if (chartData && baselineSeries.current && baselineLineSeries.current) {
      console.log('BaselineChart - Received chart update with chartData:', chartData);
      try {
        const point = { time: chartData.time, value: chartData.value };
        if (typeof point.time !== 'number' || typeof point.value !== 'number' || isNaN(point.time) || isNaN(point.value)) {
          console.error('Invalid real-time data point:', point);
          return;
        }

        setBufferedUpdates(prev => [...prev, point]);

        const timeMs = point.time * 1000;
        const currentIntervalMs = Math.floor(timeMs / TICK_INTERVAL_MS) * TICK_INTERVAL_MS;
        const currentIntervalS = Math.floor(currentIntervalMs / 1000);

        if (!lastUpdateInterval.current) {
          lastUpdateInterval.current = currentIntervalS - TICK_INTERVAL_S;
          console.log('Initialized lastUpdateInterval.current to:', lastUpdateInterval.current);
        }

        if (currentIntervalS > lastUpdateInterval.current) {
          console.log(`Processing new interval: ${currentIntervalS}, last update: ${lastUpdateInterval.current}`);
          const updatesForLastInterval = bufferedUpdates.filter(
            update => {
              const updateTimeMs = update.time * 1000;
              const updateIntervalMs = Math.floor(updateTimeMs / TICK_INTERVAL_MS) * TICK_INTERVAL_MS;
              const updateIntervalS = Math.floor(updateIntervalMs / 1000);
              return updateIntervalS === lastUpdateInterval.current;
            }
          );

          if (updatesForLastInterval.length > 0) {
            setDisplayedTicks(prevTicks => {
              const currentTime = Math.floor(Date.now() / 1000);
              const timeWindowStart = currentTime - TOTAL_TIME_SPAN_S;
              const newTicks = updatesForLastInterval.map((update, index) => {
                // Use a smaller fraction to exaggerate spikiness (e.g., 1/10th of a second)
                const fraction = updatesForLastInterval.length > 1 ? (index * 0.1) / (updatesForLastInterval.length - 1) : 0;
                const adjustedTime = lastUpdateInterval.current + (fraction * TICK_INTERVAL_S);
                return { time: adjustedTime, value: update.value };
              });

              const filteredTicks = [...prevTicks, ...newTicks]
                .filter(tick => tick.time >= timeWindowStart)
                .sort((a, b) => a.time - b.time)
                .slice(-MAX_TICKS * 10);

              console.log('BaselineChart - Updated displayed ticks with real-time data:', filteredTicks);
              return filteredTicks;
            });

            if (chartData.baseline && !isNaN(chartData.baseline)) {
              baselineValue.current = chartData.baseline;
              console.log('Updated baseline value to:', baselineValue.current);
              baselineLineSeries.current.update({
                time: currentIntervalS,
                value: chartData.baseline,
              });
            }
          }

          setBufferedUpdates(prev => prev.filter(update => update.time > lastUpdateInterval.current));
          lastUpdateInterval.current = currentIntervalS;
        }
      } catch (error) {
        console.error('BaselineChart - Error updating chart with real-time data:', error);
      }
    }
  }, [chartData]);

  return (
    <div className="card bg-gray-900 p-6 shadow-lg rounded-lg">
      <h3 className="text-xl font-bold text-cyan-400 mb-3">Baseline Chart</h3>
      <div className="text-sm text-gray-400 mb-2">
        Current Price: {chartData?.value?.toFixed(2) || 'N/A'} | Baseline: {chartData?.baseline?.toFixed(2) || baselineValue.current?.toFixed(2) || 'N/A'}
      </div>
      <div ref={chartRef} style={{ width: '100%', height: '300px' }} />
    </div>
  );
};

export default BaselineChart;