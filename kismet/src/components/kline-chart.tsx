import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, CandlestickSeries } from 'lightweight-charts';
import type { ChartDataPoint } from '../types.js';

type KlineChartProps = {
  data: ChartDataPoint[];
};

export function KlineChart({ data }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      width: containerRef.current.clientWidth,
      height: 400,
      timeScale: {
        borderColor: '#e0e0e0',
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: '#e0e0e0',
      },
    });

    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#16a34a',
      borderDownColor: '#dc2626',
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    });

    seriesRef.current = series;

    // Map ChartDataPoint[] to candlestick data
    const candleData = data.map((p) => ({
      time: p.age as unknown as import('lightweight-charts').Time,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));

    series.setData(candleData);
    chart.timeScale().fitContent();

    // Tooltip on crosshair move
    chart.subscribeCrosshairMove((param) => {
      if (!tooltipRef.current) return;

      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        tooltipRef.current.style.display = 'none';
        return;
      }

      const age = param.time as unknown as number;
      const point = data.find((p) => p.age === age);
      if (!point) {
        tooltipRef.current.style.display = 'none';
        return;
      }

      tooltipRef.current.style.display = 'block';
      tooltipRef.current.innerHTML = `
        <div class="text-xs space-y-0.5">
          <div class="font-semibold">${point.age}岁 · ${point.year}年</div>
          <div>${point.ganZhi} · ${point.daYun}</div>
          <div>O:${point.open} C:${point.close} H:${point.high} L:${point.low}</div>
          <div>综合: ${point.score}</div>
          <div class="text-gray-600">${point.reason}</div>
        </div>
      `;

      const x = param.point.x;
      const y = param.point.y;
      tooltipRef.current.style.left = `${x + 16}px`;
      tooltipRef.current.style.top = `${y + 16}px`;
    });

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [data]);

  return (
    <div className="relative" ref={containerRef}>
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-10 hidden rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
        style={{ display: 'none' }}
      />
    </div>
  );
}
