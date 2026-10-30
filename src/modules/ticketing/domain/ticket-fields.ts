import { InvalidTicketFieldError } from './errors.js';

export const TITLE_MIN = 5;
export const TITLE_MAX = 120;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 5000;

function parseText(name: string, raw: string, min: number, max: number): string {
  const value = raw.trim();
  if (value.length < min || value.length > max) {
    throw new InvalidTicketFieldError(`${name} must be between ${min} and ${max} characters`);
  }
  return value;
}

export const parseTitle = (raw: string): string => parseText('title', raw, TITLE_MIN, TITLE_MAX);

export const parseDescription = (raw: string): string =>
  parseText('description', raw, DESCRIPTION_MIN, DESCRIPTION_MAX);
