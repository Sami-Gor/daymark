import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  compareLocationTimes,
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
import { WeatherAlerts } from '@/components/weather/WeatherAlerts';
import { useLocale } from '@/hooks/use-locale';

const LONDON = { name: 'London', admin1: 'England', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 };

function Home() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
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

  const selectPlace = useCallback((nextPlace: Place) => {
    void loadWeather(nextPlace);
  }, [loadWeather]);

  const findMe = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: t('current.locationTitle'), description: t('current.locationUnsupported') });
      return;
    }
    setIsLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        // Coordinates are rounded to ~1 km before leaving the device
        // (DAYMARK-SEC-002): every Daymark feature works at neighbourhood
        // precision, so precise coordinates are never transmitted.
        const latitude = Number(coords.latitude.toFixed(2));
        const longitude = Number(coords.longitude.toFixed(2));
        try {
          const found = await reverseGeocode(latitude, longitude);
          await loadWeather(found ?? { name: 'Your location', latitude, longitude });
        } catch {
          await loadWeather({ name: 'Your location', latitude, longitude });
        } finally {
          setIsLocating(false);
        }
      } catch {
        setIsLocating(false);
      }
    }, () => {
      setIsLocating(false);
      toast({ title: t('current.locationTitle'), description: t('current.locationDenied') });
    }, {
      enableHighAccuracy: false,
      maximumAge: 300000,
      timeout: 5000,
    });
  }, [loadWeather, toast, t]);

  // No location permission is requested on load (DAYMARK-SEC-002): the app
  // opens on the default location and only asks when the user presses the
  // location button.
  useEffect(() => { void loadWeather(LONDON); }, [loadWeather]);

  const weatherState = weather?.current ?? {};
  const updatedLabel = useMemo(() => {
    if (!weatherState.time) return t('current.forecastReady');
    return t('current.updated', { time: timeLabel(weatherState.time, locale) });
  }, [weatherState.time, t, locale]);
  const hourlyTimes = weather?.hourly?.time ?? [];
  const hourlyStart = hourlyTimes.length
    ? Math.max(0, hourlyTimes.findIndex((time) => compareLocationTimes(time, weatherState.time) >= 0))
    : 0;
  const upcomingIndexes = hourlyTimes.length
    ? Array.from({ length: Math.min(6, hourlyTimes.length - hourlyStart) }, (_, index) => hourlyStart + index)
    : [];
  const upcomingPrecipitation = upcomingIndexes
    .map((index) => weather?.hourly?.precipitation_probability?.[index])
    .filter((value): value is number => value != null && !Number.isNaN(value));
  const peakPrecipitation = upcomingPrecipitation.length
    ? Math.max(...upcomingPrecipitation)
    : weather?.daily?.precipitation_probability_max?.[0];
  const peakPrecipitationIndex = upcomingIndexes.find((index) => weather?.hourly?.precipitation_probability?.[index] === peakPrecipitation);
  const umbrellaAdvice = getUmbrellaAdvice(peakPrecipitation, peakPrecipitationIndex === undefined ? undefined : timeLabel(hourlyTimes[peakPrecipitationIndex], locale), locale);
  const sunglassesAdvice = getSunglassesAdvice(weatherState.uv_index, weatherState.cloud_cover, locale);

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
              onSelectPlace={selectPlace}
            />
            <WeatherAlerts weather={weather} unit={unit} />
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
        <footer className="footer-note"><span><CalendarDays size={11} style={{ verticalAlign: 'middle', marginRight: 5 }} /> {t('footer.by')}</span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer" data-testid="link-open-meteo">open-meteo.com</a></footer>
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
    <>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </>
  );
}

export default App;
