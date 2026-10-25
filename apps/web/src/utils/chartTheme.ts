// 从当前主题的 CSS 变量读取 ECharts 配色，让图表跟着面板主题走。
// 注意：这里读取的变量必须是纯色值（hex），不能是 color-mix() 表达式，
// 否则拿到的是未求值的字符串，canvas 里画不出来。

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export interface ChartTheme {
  palette: string[];
  textSecondary: string;
  textTertiary: string;
  tooltipBg: string;
  tooltipBorder: string;
  axisLine: string;
  splitLine: string;
}

export function chartTheme(): ChartTheme {
  return {
    palette: [1, 2, 3, 4, 5, 6].map((index) => cssVar(`--chart-${index}`, '#8b8680')),
    textSecondary: cssVar('--text-secondary', '#6d6760'),
    textTertiary: cssVar('--text-tertiary', '#a29c95'),
    tooltipBg: cssVar('--bg-panel', '#f0eee8'),
    tooltipBorder: cssVar('--border', '#e3e1db'),
    axisLine: cssVar('--border-strong', '#d5d2cb'),
    splitLine: cssVar('--border', '#e3e1db')
  };
}
