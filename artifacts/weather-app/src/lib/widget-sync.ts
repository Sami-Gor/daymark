import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Place, Unit } from './weather';

interface WidgetSyncPlugin {
  sync(options: {
    unit: Unit;
    latitude: number;
    longitude: number;
    placeName: string;
  }): Promise<void>;
}

const WidgetSync = registerPlugin<WidgetSyncPlugin>('WidgetSync');

/**
 * Keeps the native widget aligned with the app's unit and coarse location.
 * This only writes preferences; the widget's network refresh is scheduled by
 * the native side and never prompts for permission.
 */
export function syncWidgetPreferences(unit: Unit, place: Place): void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  void WidgetSync.sync({
    unit,
    latitude: place.latitude,
    longitude: place.longitude,
    placeName: place.name,
  }).catch(() => undefined);
}
