// Import unified events from shared package
import { EVENTS as SHARED_EVENTS, EVENT_CATEGORIES, getEventCategory } from '../../../packages/shared/events.js';

// Re-export for backwards compatibility
export const EVENTS = SHARED_EVENTS;
export { EVENT_CATEGORIES, getEventCategory };