import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  fetchWeather,
  getSunglassesAdvice,
  getUmbrellaAdvice,
  reverseGeocode,
  timeLabel,
  type Place,
  type Unit,
  type WeatherPayload,
} from '@/lib/weather';
import { LoadingState } from '@/components/weather/LoadingState';
import { WeatherError } from '@/components/weather/WeatherError';
import { TopBar } from '@/components/weather/TopBar';
import { CurrentWeather } from '@/components/weather/CurrentWeather';
import { HourlyOutlook } from '@/components/weather/HourlyOutlook';
import { DailyForecast } from '@/components/weather/DailyForecast';
import { WeatherDetails } from '@/components/weather/WeatherDetails';
import { MicroClimateForecast } from '@/components/weather/MicroClimate';
import { UVForecast } from '@/components/weather/UVForecast';
import { AirQualityForecast } from '@/components/weather/AirQualityForecast';

const queryClient = new QueryClient();
const LONDON = { name: 'London', admin1: 'England', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 };

function Home() {
  const [place, setPlace] = useState<Place>(LONDON);
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [unit, setUnit] = useState<Unit>('celsius');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const requestId = useRef(0);

  const loadWeather = useCallback(async (nextPlace: Place) => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError('');
    try {
      const result = await fetchWeather(nextPlace);
      if (id !== requestId.current) return;
      setPlace(nextPlace);
      setWeather(result);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : 'We could not reach the weather service.');
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  const findMe = useCallback((useFallback = false) => {
    if (!navigator.geolocation) {
      if (useFallback) {
        void loadWeather(LONDON);
      } else {
        setError('Location services are not available in this browser.');
      }
      return;
    }
    if (useFallback) void loadWeather(LONDON);
    setIsLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const found = await reverseGeocode(coords.latitude, coords.longitude);
        await loadWeather(found ?? { name: 'Your location', latitude: coords.latitude, longitude: coords.longitude });
      } catch {
        await loadWeather({ name: 'Your location', latitude: coords.latitude, longitude: coords.longitude });
      } finally {
        setIsLocating(false);
      }
    }, () => {
      setIsLocating(false);
      if (!useFallback) {
        setError('We could not access your location. Please allow location access and try again.');
      }
    }, {
      enableHighAccuracy: false,
      maximumAge: 300000,
      timeout: 5000,
    });
  }, [loadWeather]);

  useEffect(() => { findMe(true); }, [findMe]);

  const weatherState = weather?.current ?? {};
  const updatedLabel = useMemo(() => {
    if (!weatherState.time) return 'Forecast ready';
    return `Updated ${timeLabel(weatherState.time)}`;
  }, [weatherState.time]);
  const hourlyTimes = weather?.hourly?.time ?? [];
  const hourlyStart = hourlyTimes.length
    ? Math.max(0, hourlyTimes.findIndex((time) => Date.parse(time) >= (weatherState.time ? Date.parse(weatherState.time) : Date.now())))
    : 0;
  const upcomingIndexes = hourlyTimes.length
    ? Array.from({ length: Math.min(6, hourlyTimes.length - hourlyStart) }, (_, index) => hourlyStart + index)
    : [];
  const upcomingPrecipitation = upcomingIndexes
    .map((index) => weather?.hourly?.precipitation_probability?.[index])
    .filter((value): value is number => value !== undefined && !Number.isNaN(value));
  const peakPrecipitation = upcomingPrecipitation.length
    ? Math.max(...upcomingPrecipitation)
    : weather?.daily?.precipitation_probability_max?.[0];
  const peakPrecipitationIndex = upcomingIndexes.find((index) => weather?.hourly?.precipitation_probability?.[index] === peakPrecipitation);
  const umbrellaAdvice = getUmbrellaAdvice(peakPrecipitation, peakPrecipitationIndex === undefined ? undefined : timeLabel(hourlyTimes[peakPrecipitationIndex]));
  const sunglassesAdvice = getSunglassesAdvice(weatherState.uv_index, weatherState.cloud_cover);

  return (
    <div className="weather-app">
      <div className="app-shell">
        <TopBar unit={unit} onUnitChange={setUnit} onFindMe={() => findMe()} isLocating={isLocating} />

        {isLoading && <LoadingState />}
        {!isLoading && error && <WeatherError message={error} onRetry={() => void loadWeather(place)} />}
        {!isLoading && !error && weather && (
          <main>
            <CurrentWeather
              place={place}
              weather={weather}
              unit={unit}
              umbrellaAdvice={umbrellaAdvice}
              sunglassesAdvice={sunglassesAdvice}
              updatedLabel={updatedLabel}
              isLocating={isLocating}
              onFindMe={() => findMe()}
            />
            <div className="content-grid">
              <HourlyOutlook weather={weather} unit={unit} />
              <DailyForecast weather={weather} unit={unit} />
              <WeatherDetails weather={weather} unit={unit} />
              <MicroClimateForecast weather={weather} place={place} unit={unit} />
              <UVForecast weather={weather} />
              <AirQualityForecast weather={weather} />
            </div>
          </main>
        )}
        <footer className="footer-note"><span><CalendarDays size={11} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Forecasts by Open-Meteo</span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer" data-testid="link-open-meteo">open-meteo.com</a></footer>
      </div>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
