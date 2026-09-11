import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** Clicks the title button (`Show details for X` or `Hide details for X`) to make an item active. */
export async function pressTitle(title: string): Promise<void> {
  const button =
    screen.queryByRole('button', { name: `Show details for ${title}` }) ??
    screen.getByRole('button', { name: `Hide details for ${title}` });
  await userEvent.click(button);
}
