import type { KismetLocationContext } from '../types.js';

type CityAffinityMapProps = {
  context: KismetLocationContext;
};

function projectPoint(lat: number, lng: number) {
  const x = ((lng + 180) / 360) * 1000;
  const y = ((90 - lat) / 180) * 520;
  return { x, y };
}

export function CityAffinityMap({ context }: CityAffinityMapProps) {
  const markers = [
    context.birthCity,
    ...context.topCities.filter((city) => city.cityId !== context.birthCity.cityId),
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-slate-950">
      <svg viewBox="0 0 1000 520" className="h-[320px] w-full">
        <defs>
          <linearGradient id="kismet-map-bg" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#082032" />
            <stop offset="100%" stopColor="#0b1120" />
          </linearGradient>
        </defs>
        <rect width="1000" height="520" fill="url(#kismet-map-bg)" />
        <g stroke="rgba(255,255,255,0.08)" fill="none">
          {[120, 240, 360, 480, 600, 720, 840].map((x) => <line key={x} x1={x} x2={x} y1="0" y2="520" />)}
          {[100, 200, 300, 400].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} />)}
        </g>
        {markers.map((city) => {
          const point = projectPoint(city.lat, city.lng);
          const isBirthCity = city.cityId === context.birthCity.cityId;
          const isTopCity = city.cityId === context.topCityId;
          return (
            <g key={city.cityId} transform={`translate(${point.x}, ${point.y})`}>
              {isTopCity && <circle r="18" fill={city.themeColor} opacity="0.18" />}
              <circle r={isBirthCity ? 7 : 5} fill={city.themeColor} stroke="#fff" strokeWidth={isBirthCity ? 2 : 1.5} />
              <text x="10" y="-8" fill="#fff" fontSize="12" fontWeight="600">
                {city.cityZh}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
