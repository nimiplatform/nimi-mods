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
        background: { color: '#181615' },
        textColor: '#8C857B',
        fontFamily: 'var(--font-serif)',
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      width: containerRef.current.clientWidth,
      height: 350,
      timeScale: {
        borderColor: '#8A7254',
        timeVisible: false,
        tickMarkFormatter: (time: unknown) => `${time as number}岁`,
      },
      rightPriceScale: {
        visible: false,
      },
      crosshair: {
        vertLine: { color: '#8A7254', style: 2 },
        horzLine: { color: '#8A7254', style: 2 },
      },
    });

    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#A6382E',
      downColor: '#526B5D',
      borderUpColor: '#A6382E',
      borderDownColor: '#526B5D',
      wickUpColor: '#A6382E',
      wickDownColor: '#526B5D',
    });

    seriesRef.current = series;

    const candleData = data.map((p) => ({
      time: p.age as unknown as import('lightweight-charts').Time,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));

    series.setData(candleData);
    chart.timeScale().fitContent();

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
        <div style="font-family:var(--font-serif);font-size:12px;line-height:1.6;">
          <div style="font-weight:600;color:#8A7254;">${point.age}岁 · ${point.year}年</div>
          <div style="color:#8C857B;">${point.ganZhi} · ${point.daYun}</div>
          <div style="color:#8C857B;">O:${point.open} C:${point.close} H:${point.high} L:${point.low}</div>
          <div style="color:#8A7254;">综合: ${point.score}</div>
          <div style="color:#8C857B;">${point.reason}</div>
        </div>
      `;

      const x = param.point.x;
      const y = param.point.y;
      tooltipRef.current.style.left = `${x + 16}px`;
      tooltipRef.current.style.top = `${y + 16}px`;
    });

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
        className="pointer-events-none absolute z-10 hidden"
        style={{
          display: 'none',
          background: 'rgba(24,22,21,0.9)',
          border: '1px solid #8A7254',
          padding: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  );
}
