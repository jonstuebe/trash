import { AnimatePresence, Motion } from "@legendapp/motion";
import { observer } from "@legendapp/state/react";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Dimensions, Pressable, Text, View } from "react-native";
import { useColors } from "../colors";
import { botTurn, isGameOver } from "../logic/game";
import {
  discardCardState,
  drawCardState,
  gameState,
  playCardState,
  resetGame,
} from "../state/trash";
import { Button } from "./Button";
import { Card, cardAspectRatio } from "./Card";
import { CardHStack, CardVStack } from "./CardStack";
import { HStack, VStack } from "./Stack";
import { Ionicons } from "@expo/vector-icons";
import { Shake, useShake } from "./Shake";
import { emitter } from "../emitter";

export const Game: React.FC = observer(() => {
  const router = useRouter();
  const { colorByMode } = useColors();
  const currentPlayerIndex = gameState.currentPlayerIndex.get();
  const currentPlayer = gameState.players[currentPlayerIndex].get();
  const currentDrawnCard = gameState.currentDrawnCard.get();
  const gameOver = isGameOver(gameState.get());
  const isCurrentPlayerBot = currentPlayer.isBot;
  const { shakeProps, shake } = useShake();

  useEffect(() => {
    const onInvalid = () => {
      shake();
    };

    emitter.on("invalidMove", onInvalid);
    return () => {
      emitter.off("invalidMove", onInvalid);
    };
  }, []);

  useEffect(() => {
    if (gameOver) {
      router.push("complete");
    }
  }, [gameOver]);

  useEffect(() => {
    if (isCurrentPlayerBot) {
      setTimeout(() => {
        gameState.set((state) => botTurn(state));
      }, 1500);
    }
  }, [isCurrentPlayerBot, currentPlayerIndex, currentDrawnCard]);

  return (
    <View style={{ flex: 1, justifyContent: "space-between" }}>
      <View
        style={{
          position: "relative",
          paddingHorizontal: 16,
        }}
      >
        <HStack justify="space-between">
          <HStack gap={8}>
            {gameState.players.get().map((player, index) => {
              const activePlayer = currentPlayerIndex === index;

              return (
                <View
                  key={index}
                  style={{
                    borderColor: activePlayer
                      ? colorByMode("blue600", "blue800")
                      : colorByMode("gray300", "gray500"),
                    borderWidth: 2,
                    width: 40,
                    height: 40,
                    borderRadius: 100,
                    justifyContent: "center",
                    alignItems: "center",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <Text
                    key={index}
                    style={{
                      fontSize: 28,
                      lineHeight: 34,
                      textAlign: "center",
                      position: "relative",
                      left: 1,
                    }}
                  >
                    {player.isBot ? "🤖" : "🙂"}
                  </Text>
                </View>
              );
            })}
          </HStack>
          <View>
            <Pressable
              onPress={() => {
                resetGame();
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Ionicons
                name="refresh-circle"
                size={40}
                color={colorByMode("blue800", "blue700")}
              />
            </Pressable>
          </View>
        </HStack>
        <AnimatePresence>
          <Motion.View
            key="discard-pile"
            style={{
              position: "absolute",
              top: 4,
              // center the pile
              left: Dimensions.get("window").width / 2 - 20,
              width: 40,
            }}
            animate={{
              opacity: gameState.discardPile.get().length > 0 ? 1 : 0,
              top: gameState.discardPile.get().length > 0 ? 4 : -100,
            }}
            exit={{
              opacity: 0,
              top: -100,
            }}
          >
            <CardVStack>
              {gameState.discardPile.get().map((card, index) => (
                <Card
                  key={index}
                  {...card}
                  // faceup only for last item in discard pile
                  faceUp={index === gameState.discardPile.get().length - 1}
                  style={{
                    width: 40,
                  }}
                />
              ))}
            </CardVStack>
          </Motion.View>
        </AnimatePresence>
      </View>
      <VStack padding={16} gap={4}>
        <CardHStack>
          {currentPlayer.layout
            .slice(0, Math.ceil(currentPlayer.layout.length / 2))
            .map((card, index) =>
              card ? (
                <Card
                  key={index}
                  suit={card.suit}
                  rank={card.rank}
                  faceUp={card.faceUp}
                  onPressCard={() => playCardState(index)}
                />
              ) : (
                <Card key={index} suit="hearts" rank="A" faceUp={false} />
              )
            )}
        </CardHStack>
        <CardHStack>
          {currentPlayer.layout
            .slice(Math.ceil(currentPlayer.layout.length / 2))
            .map((card, index) =>
              card ? (
                <Card
                  key={index + Math.ceil(currentPlayer.layout.length / 2)}
                  suit={card.suit}
                  rank={card.rank}
                  faceUp={card.faceUp}
                  onPressCard={() =>
                    currentDrawnCard &&
                    playCardState(
                      index + Math.ceil(currentPlayer.layout.length / 2)
                    )
                  }
                />
              ) : (
                <Card
                  key={index + Math.ceil(currentPlayer.layout.length / 2)}
                  suit="hearts"
                  rank="A"
                  faceUp={false}
                />
              )
            )}
        </CardHStack>
      </VStack>
      <VStack padding={16} gap={16}>
        <View
          style={{
            width: "100%",
            height: 160,
            alignItems: "center",
          }}
        >
          <AnimatePresence>
            {currentDrawnCard ? (
              <Shake {...shakeProps} key="S">
                <Motion.View
                  key="A"
                  initial={{
                    opacity: 0,
                    x: -100,
                  }}
                  animate={{
                    opacity: 1,
                    x: 0,
                  }}
                  exit={{
                    opacity: 0,
                    x: 100,
                  }}
                  style={{
                    height: 160,
                    aspectRatio: cardAspectRatio,
                    alignItems: "center",
                  }}
                >
                  <Card {...currentDrawnCard} faceUp />
                </Motion.View>
              </Shake>
            ) : null}
          </AnimatePresence>
        </View>

        <HStack flexChildren gap={8}>
          <Button
            title="From Deck"
            onPress={() => drawCardState("deck")}
            disabled={!!currentDrawnCard || isCurrentPlayerBot}
          />
          <Button
            title="From Discard"
            onPress={() => drawCardState("discard")}
            disabled={
              !!currentDrawnCard ||
              gameState.discardPile.get().length === 0 ||
              isCurrentPlayerBot
            }
          />
          <Button
            title="Discard"
            onPress={discardCardState}
            disabled={!currentDrawnCard || isCurrentPlayerBot}
          />
        </HStack>
      </VStack>
    </View>
  );
});
