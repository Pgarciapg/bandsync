/**
 * BandSync color theme definitions
 * Optimized for musical collaboration interfaces
 */

const tintColorLight = '#6c5ce7'; // Purple for leader actions
const tintColorDark = '#a29bfe';  // Lighter purple for dark mode

export const Colors = {
  light: {
    text: '#2c3e50',
    background: '#ffffff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    // Musical interface colors
    leader: '#6c5ce7',      // Purple for leader
    follower: '#00cec9',    // Teal for followers
    playing: '#00b894',     // Green for playing state
    paused: '#fdcb6e',      // Yellow for paused
    error: '#e17055',       // Orange for errors
    neutral: '#b2bec3',     // Gray for neutral states
    surface: '#f8f9fa',     // Light surface
    border: '#dee2e6',      // Light border
  },
  dark: {
    text: '#ecf0f1',
    background: '#0d0f14',
    tint: tintColorDark,
    icon: '#9ba1a6',
    tabIconDefault: '#9ba1a6',
    tabIconSelected: tintColorDark,
    // Musical interface colors
    leader: '#a29bfe',      // Lighter purple for leader
    follower: '#55efc4',    // Lighter teal for followers
    playing: '#00b894',     // Same green for playing
    paused: '#fdcb6e',      // Same yellow for paused
    error: '#e17055',       // Same orange for errors
    neutral: '#636e72',     // Darker gray for neutral
    surface: '#1a1f2b',     // Dark surface
    border: '#2d3748',      // Dark border
  },
};