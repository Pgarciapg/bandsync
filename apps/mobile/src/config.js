import Constants from "expo-constants";
export const SERVER_URL = Constants.expoConfig?.extra?.serverUrl || process.env.EXPO_PUBLIC_SERVER_URL || "http://192.168.1.21:3001";