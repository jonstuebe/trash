import { useColorScheme } from "react-native";

export function useDarkMode() {
  return (useColorScheme() ?? "light") === "dark";
}
