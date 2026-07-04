import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface EChartsViewProps {
  option: unknown;
  height?: number;
}

export function EChartsView({ option, height = 280 }: EChartsViewProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    chart.current = echarts.init(ref.current);
    const handleResize = () => chart.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option as echarts.EChartsOption, true);
  }, [option]);

  return <div className="chart-surface" ref={ref} style={{ height }} />;
}
