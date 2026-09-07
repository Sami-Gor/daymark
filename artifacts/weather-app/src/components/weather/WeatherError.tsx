import { AlertTriangle } from 'lucide-react';

export function WeatherError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-panel" role="alert" data-testid="status-weather-error">
      <AlertTriangle size={25} strokeWidth={1.7} />
      <h1>That forecast went cloudy.</h1>
      <p>{message} Check your connection and give the sky another look.</p>
      <button className="retry-button" onClick={onRetry} data-testid="button-retry-weather">Try again</button>
    </div>
  );
}
