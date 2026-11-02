/**
 * Orders weather requests so a slow response cannot overwrite a newer choice.
 *
 * The newest request always wins. A request may also carry a selection check
 * (for example the location attempt that produced it); invalidating that
 * selection drops the response even when no newer request has started yet.
 */
export type WeatherRequestToken = {
  readonly requestId: number;
  readonly isSelectionCurrent: () => boolean;
};

export type WeatherRequestGate = {
  begin(isSelectionCurrent?: () => boolean): WeatherRequestToken;
  /** True only for the newest request whose selection is still current. */
  isCurrent(token: WeatherRequestToken): boolean;
  /** True for the newest request, even if its selection was invalidated. */
  ownsLoading(token: WeatherRequestToken): boolean;
};

export function createWeatherRequestGate(): WeatherRequestGate {
  let latestRequestId = 0;
  return {
    begin(isSelectionCurrent = () => true) {
      latestRequestId += 1;
      return { requestId: latestRequestId, isSelectionCurrent };
    },
    isCurrent(token) {
      return token.requestId === latestRequestId && token.isSelectionCurrent();
    },
    ownsLoading(token) {
      return token.requestId === latestRequestId;
    },
  };
}
