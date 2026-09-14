import { StorePromoGallery } from '@/components/StorePromoGallery';

/*
 * Internal preview for the Google Play store assets (marketing only). It is
 * intentionally unlinked from the app. To remove it entirely delete this page
 * and its route in App.tsx; the gallery and data can then go too.
 */
export default function StorePreview() {
  return (
    <main className="store-preview">
      <header className="store-preview-header">
        <h1>Store preview</h1>
        <p>Google Play listing order. Not linked anywhere in the app.</p>
      </header>
      <StorePromoGallery />
    </main>
  );
}
