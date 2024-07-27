import { SafeAreaView } from "react-native-safe-area-context";
import { GarbageGame } from "@/components/GarbageGame";
import { useColors } from "../colors";

export default function HomeScreen() {
  const { colorByMode } = useColors();
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colorByMode("gray100", "gray950"),
      }}
    >
      <GarbageGame />
    </SafeAreaView>
  );
}
