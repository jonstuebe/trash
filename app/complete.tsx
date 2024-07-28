import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { iOSUIKit } from "react-native-typography";

import { View, useColorScheme } from "react-native";
import { useColors } from "../colors";
import { Button } from "../components/Button";
import { ThemedText } from "../components/ThemedText";
import { gameState, resetGame } from "../state/trash";
import { SafeAreaView } from "react-native-safe-area-context";
import Confetti from "react-native-confetti";
import { useEffect, useRef } from "react";

export default function Complete() {
  const { colorByMode } = useColors();
  const mode = useColorScheme() ?? "light";
  const router = useRouter();
  const confettiRef = useRef<Confetti>(null);

  useEffect(() => {
    confettiRef.current?.startConfetti();
  }, []);

  return (
    <>
      <BlurView
        intensity={20}
        tint={mode}
        style={{
          flex: 1,
        }}
      >
        <SafeAreaView
          style={{
            flex: 1,
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            gap: 8,
          }}
        >
          <View />
          <ThemedText
            style={[
              iOSUIKit.largeTitleEmphasized,
              {
                textAlign: "center",
                color: colorByMode("black", "white"),
              },
            ]}
          >
            {gameState.currentPlayerIndex.get() === 0
              ? "You Won 😍"
              : "You Lost 🥲"}
          </ThemedText>
          <Button
            title="Play Again"
            size="large"
            onPress={() => {
              resetGame();
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/");
              }
            }}
          />
        </SafeAreaView>
      </BlurView>
      <Confetti ref={confettiRef} />
    </>
  );
}
