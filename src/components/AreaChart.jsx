import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

const AreaChart = ({ chartData, historicalTicks }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const areaSeries = useRef(null);

  useEffect(() => {
    console.log('AreaChart setup useEffect triggered');
    const setupChart = () => {
      if (chartRef.current) {
        try {
          // Initialize Area Chart
          chartInstance.current = createChart(chartRef.current, {
            width: chartRef.current.offsetWidth,
            height: 300,
            layout: { background: { color: '#25293a' }, textColor: '#e0e0e0' },
            grid: { vertLines: { color: '#2d324d' }, horzLines: { color: '#2d324d' } },
            timeScale: { timeVisible: true, secondsVisible: true },
            handleScroll: true,
            handleScale: true,
          });

          areaSeries.current = chartInstance.current.addAreaSeries({
            topColor: 'rgba(38, 198, 218, 0.56)',
            bottomColor: 'rgba(38, 198, 218, 0.04)',
            lineColor: '#26C6DA',
            lineWidth: 2,
          });

          // Apply historical data to Area Chart
          if (historicalTicks && historicalTicks.length > 0) {
            console.log('AreaChart - Using historical ticks:', historicalTicks);
            historicalTicks.forEach(tick => {
              areaSeries.current.update(tick);
            });
          }

          const resize = () => {
            if (chartInstance.current && chartRef.current) {
              chartInstance.current.resize(chartRef.current.offsetWidth, 300);
            }
          };
          window.addEventListener('resize', resize);

          return () => {
            window.removeEventListener('resize', resize);
            chartInstance.current?.remove();
          };
        } catch (error) {
          console.error('AreaChart - Error initializing chart:', error);
          throw error;
        }
      }
    };

    setupChart();
  }, [historicalTicks]);

  useEffect(() => {
    console.log('AreaChart real-time update useEffect triggered');
    if (chartData && areaSeries.current) {
      console.log('AreaChart - Applying chart update with chartData:', chartData);
      const point = { time: chartData.time, value: chartData.value };
      try {
        areaSeries.current.update(point);
      } catch (error) {
        console.error('AreaChart - Error updating chart:', error);
      }
    } else {
      console.log('AreaChart - Update skipped - missing data or series:', {
        chartData,
        areaSeries: areaSeries.current,
      });
    }
  }, [chartData]);

  return (
    <div className="card bg-gray-900 p-6 shadow-lg rounded-lg">
      <h3 className="text-xl font-bold text-cyan-400 mb-3">Area Chart</h3>
      <div className="text-sm text-gray-400 mb-2">
        Current Price: {chartData?.value?.toFixed(2) || 'N/A'}
      </div>
      <div ref={chartRef} style={{ width: '100%', height: '300px' }} />
    </div>
  );
};

export default AreaChart;