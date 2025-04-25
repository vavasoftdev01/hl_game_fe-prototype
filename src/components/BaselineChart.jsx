import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

const BaselineChart = ({ chartData, historicalTicks, historicalBaseline }) => {
  console.log('BaselineChart rendered');

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const baselineSeries = useRef(null);
  const baselineLineSeries = useRef(null);
  const baselineValue = useRef(historicalBaseline);
  const isInitialized = useRef(false);

  // Effect for chart setup (runs only once)
  useEffect(() => {
    console.log('BaselineChart setup useEffect triggered');
    const setupChart = () => {
      if (chartRef.current && !isInitialized.current) {
        try {
          chartInstance.current = createChart(chartRef.current, {
            width: chartRef.current.offsetWidth,
            height: 300,
            layout: { background: { color: '#25293a' }, textColor: '#e0e0e0' },
            grid: { vertLines: { color: '#2d324d' }, horzLines: { color: '#2d324d' } },
            timeScale: { timeVisible: true, secondsVisible: true },
            handleScroll: true,
            handleScale: true,
          });

          baselineValue.current = historicalBaseline || 0;
          console.log('Baseline value initialized to:', baselineValue.current);

          baselineSeries.current = chartInstance.current.addBaselineSeries({
            baseValue: { price: baselineValue.current },
            topFillColor1: 'rgba(76, 175, 80, 0.28)',
            topFillColor2: 'rgba(76, 175, 80, 0.05)',
            bottomFillColor1: 'rgba(239, 83, 80, 0.28)',
            bottomFillColor2: 'rgba(239, 83, 80, 0.05)',
            lineColor: '#FFD700',
            lineWidth: 2,
          });

          baselineLineSeries.current = chartInstance.current.addLineSeries({
            color: '#FF0000',
            lineWidth: 1,
          });

          const resize = () => {
            if (chartInstance.current && chartRef.current) {
              chartInstance.current.resize(chartRef.current.offsetWidth, 300);
            }
          };
          window.addEventListener('resize', resize);

          isInitialized.current = true;

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
          console.error('BaselineChart - Error initializing chart:', error);
          throw error;
        }
      } else {
        console.log('BaselineChart - Chart already initialized or ref not ready');
      }
    };

    setupChart();
  }, []); // Empty dependency array to run only once

  // Effect for applying historical ticks
  useEffect(() => {
    console.log('BaselineChart historical ticks useEffect triggered');
    console.log('Historical ticks received:', historicalTicks);
    console.log('Historical baseline received:', historicalBaseline);

    if (historicalTicks && historicalTicks.length > 0 && baselineSeries.current) {
      console.log('BaselineChart - Applying historical ticks:', historicalTicks);
      historicalTicks.forEach(tick => {
        console.log('Applying tick:', tick);
        baselineSeries.current.update(tick);
      });

      // Update baseline value if historicalBaseline is available
      if (historicalBaseline) {
        baselineValue.current = historicalBaseline;
        console.log('Updated baseline value to:', baselineValue.current);
      }
    } else {
      console.warn('BaselineChart - No historical ticks to apply or series not ready:', {
        historicalTicks,
        baselineSeries: baselineSeries.current,
      });
    }
  }, [historicalTicks, historicalBaseline]); // Run whenever historicalTicks or historicalBaseline changes

  // Effect for real-time updates
  useEffect(() => {
    console.log('BaselineChart real-time update useEffect triggered');
    if (chartData && baselineSeries.current && baselineLineSeries.current) {
      console.log('BaselineChart - Applying chart update with chartData:', chartData);
      const point = { time: chartData.time, value: chartData.value };
      try {
        baselineSeries.current.update(point);
        if (chartData.baseline) {
          baselineValue.current = chartData.baseline;
          baselineLineSeries.current.update({
            time: chartData.time,
            value: chartData.baseline,
          });
        }
      } catch (error) {
        console.error('BaselineChart - Error updating chart:', error);
      }
    } else {
      console.log('BaselineChart - Update skipped - missing data or series:', {
        chartData,
        baselineSeries: baselineSeries.current,
        baselineLineSeries: baselineLineSeries.current,
      });
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