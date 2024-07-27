import { AnimatePresence, Motion } from "@legendapp/motion";
import { observer } from "@legendapp/state/react";
import React, { useEffect, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useColors } from "../colors";
import {
  discardCardState,
  drawCardState,
  gameState,
  playCardState,
} from "../state/trash";
import { Button } from "./Button";
import { Card, cardAspectRatio } from "./Card";
import { CardHStack, CardVStack } from "./CardStack";
import { HStack, VStack } from "./Stack";
import { isGameOver } from "../logic/game";
import { useRouter } from "expo-router";

export const GarbageGame: React.FC = observer(() => {
  const router = useRouter();
  const { colorByMode } = useColors();
  const currentPlayerIndex = gameState.currentPlayerIndex.get();
  const currentPlayer = gameState.players[currentPlayerIndex].get();
  const currentDrawnCard = gameState.currentDrawnCard.get();
  const gameOver = isGameOver(gameState.get());

  useEffect(() => {
    if (gameOver) {
      router.push("complete");
    }
  }, [gameOver]);

  return (
    <View style={{ flex: 1, justifyContent: "space-between" }}>
      <View
        style={{
          position: "relative",
          paddingHorizontal: 16,
        }}
      >
        <HStack gap={8}>
          {gameState.players.get().map((player, index) => {
            const activePlayer = currentPlayerIndex === index;

            return (
              <View
                key={index}
                style={{
                  borderColor: activePlayer
                    ? colorByMode("blue600", "blue800")
                    : colorByMode("gray300", "gray100"),
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
                    fontSize: 32,
                    lineHeight: 32,
                    position: "absolute",
                    textAlign: "center",
                    width: "100%",
                    bottom: -4,
                    left: 0,
                  }}
                >
                  🙎
                </Text>
              </View>
            );
          })}
        </HStack>
        <AnimatePresence>
          <Motion.View
            key="discard-pile"
            style={{
              position: "absolute",
              top: 0,
              right: 16,
              width: 40,
            }}
            animate={{
              opacity: gameState.discardPile.get().length > 0 ? 1 : 0,
              right: gameState.discardPile.get().length > 0 ? 16 : -100,
            }}
            exit={{
              opacity: 0,
              right: -100,
            }}
          >
            <Pressable>
              <CardVStack>
                {gameState.discardPile
                  .get()
                  .reverse()
                  .map((card, index) => (
                    <Card
                      key={index}
                      {...card}
                      faceUp
                      style={{
                        width: 40,
                      }}
                    />
                  ))}
              </CardVStack>
            </Pressable>
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
        {/* {checkGameOver() && <ThemedText>Game Over!</ThemedText>} */}
        <View
          style={{
            width: "100%",
            height: 160,
            alignItems: "center",
          }}
        >
          <AnimatePresence>
            {currentDrawnCard ? (
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
            ) : null}
          </AnimatePresence>
        </View>

        <HStack flexChildren gap={8}>
          <Button
            title="From Deck"
            onPress={() => drawCardState("deck")}
            disabled={!!currentDrawnCard}
          />
          <Button
            title="From Discard"
            onPress={() => drawCardState("discard")}
            disabled={
              !!currentDrawnCard || gameState.discardPile.get().length === 0
            }
          />
          <Button
            title="Discard"
            onPress={discardCardState}
            disabled={!currentDrawnCard}
          />
        </HStack>
      </VStack>
    </View>
  );
});
