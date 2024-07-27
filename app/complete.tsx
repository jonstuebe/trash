import { SafeAreaView } from "react-native-safe-area-context";
import { iOSUIKit } from "react-native-typography";
import { ThemedText } from "../components/ThemedText";
import { useColors } from "../colors";
import { Button } from "../components/Button";
import { useRouter } from "expo-router";
import { gameState, resetGame } from "../state/trash";

export default function Complete() {
  const { colorByMode } = useColors();
  const router = useRouter();

  return (
    <SafeAreaView
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
      }}
    >
      <ThemedText
        style={[
          iOSUIKit.largeTitleEmphasized,
          {
            textAlign: "center",
            color: colorByMode("black", "white"),
          },
        ]}
      >
        Player {gameState.currentPlayerIndex.get() + 1} has won!
      </ThemedText>
      <Button
        title="Play Again"
        size="large"
        onPress={() => {
          // reset game state
          resetGame(2);

          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace("/");
          }
        }}
      />
    </SafeAreaView>
  );
}
