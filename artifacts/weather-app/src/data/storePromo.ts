/*
 * Google Play store assets. These are static marketing renders that mirror the
 * app's visual language; they are deliberately independent of the live weather
 * UI and must never feed app data or replace the functional forecast cards.
 */
export type StorePromoItem = {
  id: string;
  title: string;
  caption: string;
  alt: string;
  image: string;
  width: number;
  height: number;
  order: number;
};

export const storePromo: StorePromoItem[] = [
  {
    id: 'temperature',
    title: 'Temperature',
    caption: 'Track the day’s temperature in seconds.',
    alt: 'Daymark temperature forecast promo showing an hourly line chart from 16 to 21 degrees.',
    image: '/store-assets/daymark-promo/daymark-temperature.png',
    width: 941,
    height: 1672,
    order: 1,
  },
  {
    id: 'rain',
    title: 'Chance of rain',
    caption: 'Spot the wet hours before you leave.',
    alt: 'Daymark chance of rain promo showing hourly rain probabilities from 10 to 40 percent.',
    image: '/store-assets/daymark-promo/daymark-rain.png',
    width: 941,
    height: 1672,
    order: 2,
  },
  {
    id: 'air-quality',
    title: 'Air quality',
    caption: 'Air quality, simplified.',
    alt: 'Daymark air quality promo showing Good air quality with 32 AQI.',
    image: '/store-assets/daymark-promo/daymark-air-quality.png',
    width: 941,
    height: 1672,
    order: 3,
  },
  {
    id: 'sun-daylight',
    title: 'Sun & daylight',
    caption: 'Sunrise, sunset, and daylight — beautifully clear.',
    alt: 'Daymark sun and daylight promo showing sunrise, solar noon, sunset and total daylight.',
    image: '/store-assets/daymark-promo/daymark-sun-daylight.png',
    width: 941,
    height: 1672,
    order: 4,
  },
  {
    id: 'privacy',
    title: 'Privacy',
    caption: 'Private by design.',
    alt: 'Daymark privacy promo showing no tracking, no ads and no account.',
    image: '/store-assets/daymark-promo/daymark-privacy.png',
    width: 1024,
    height: 1536,
    order: 5,
  },
].sort((a, b) => a.order - b.order);
