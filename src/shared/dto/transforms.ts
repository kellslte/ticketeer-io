/** class-transformer helper: trims strings, leaves everything else for the validators to reject. */
export const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
