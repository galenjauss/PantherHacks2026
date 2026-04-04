import { writable } from 'svelte/store';

/** Central processing state — false = analysing, true = ready/processed */
export const isProcessed = writable(false);
