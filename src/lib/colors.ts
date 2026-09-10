// src/lib/colors.ts (stub, replaced in Task 2)
export const COLOR_NAMES = ['slate', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple'] as const;
export type ColorName = (typeof COLOR_NAMES)[number];
