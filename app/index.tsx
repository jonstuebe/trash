import { SafeAreaView } from "react-native-safe-area-context";
import { GarbageGame } from "@/components/GarbageGame";

export default function HomeScreen() {
  return (
    <SafeAreaView
      style={{
        flex: 1,
      }}
    >
      <GarbageGame />
    </SafeAreaView>
  );
}
