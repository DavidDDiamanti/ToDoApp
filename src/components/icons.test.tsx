import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChevronIcon, GripIcon, PencilIcon, PlusIcon, TrashIcon } from './icons';

describe('icons', () => {
  it('render as decorative SVGs hidden from assistive tech', () => {
    render(
      <div>
        <ChevronIcon /><PlusIcon /><PencilIcon /><GripIcon /><TrashIcon />
      </div>,
    );
    const svgs = document.querySelectorAll('svg');
    expect(svgs).toHaveLength(5);
    for (const svg of svgs) expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
