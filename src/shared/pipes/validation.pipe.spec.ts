import type { ValidationError } from '@nestjs/common';
import { flattenErrors } from './validation.pipe.js';

describe('flattenErrors', () => {
  it('flattens constraints and nested children into field paths', () => {
    const errors = [
      { property: 'title', constraints: { minLength: 'too short', isString: 'not a string' } },
      { property: 'meta', children: [{ property: 'tag', constraints: { isEnum: 'bad tag' } }] },
    ] as ValidationError[];

    expect(flattenErrors(errors)).toEqual([
      { field: 'title', message: 'too short' },
      { field: 'title', message: 'not a string' },
      { field: 'meta.tag', message: 'bad tag' },
    ]);
  });
});
