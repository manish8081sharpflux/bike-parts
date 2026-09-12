// Zero-dependency price formatters, split out from utils.ts so that
// constants.ts (which needs parsePrice for priceFilterOptions' `test`
// functions) doesn't have to import from utils.ts — and utils.ts doesn't
// have to import from constants.ts AND have constants.ts import back from
// it, which would be a circular import.
export const parsePrice = (price: string) => Number(price.replace(/,/g, ""));

export const formatPrice = (value: number) => Math.round(value).toLocaleString("en-IN");
