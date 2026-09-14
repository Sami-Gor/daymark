import { storePromo, type StorePromoItem } from '@/data/storePromo';

/*
 * Reusable promo gallery for the Google Play store assets. Images keep their
 * intrinsic aspect ratio (width/height prevent layout shift), load lazily and
 * carry descriptive alt text. Purely presentational: it reads no app data.
 */
export function StorePromoGallery({ items = storePromo }: { items?: StorePromoItem[] }) {
  return (
    <ol className="store-promo-gallery">
      {items.map((item) => (
        <li key={item.id} className="store-promo-card">
          <img
            className="store-promo-image"
            src={item.image}
            alt={item.alt}
            width={item.width}
            height={item.height}
            loading="lazy"
            decoding="async"
          />
          <div className="store-promo-copy">
            <h2 className="store-promo-title">{item.title}</h2>
            <p className="store-promo-caption">{item.caption}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
