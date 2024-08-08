import React, { ReactElement } from "react";
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  Text,
  View,
  ViewStyle,
  useColorScheme,
} from "react-native";
import { Colors, useColors } from "../colors";
import { useLayout } from "../hooks/useLayout";
import { Card as CardType, Rank, Suit } from "../types";
import { VStack } from "./Stack";
import * as Haptics from "expo-haptics";

interface SuitInfo {
  symbol: string;
  color:
    | {
        light: Colors;
        dark: Colors;
      }
    | Colors;
}

export interface CardProps {
  suit: Suit;
  rank: Rank;
}

const suits: Record<Suit, SuitInfo> = {
  hearts: { symbol: "♥", color: "error" },
  diamonds: { symbol: "♦", color: "error" },
  clubs: { symbol: "♣", color: "black" },
  spades: { symbol: "♠", color: "black" },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface CardProps extends CardType {
  disabled?: boolean;
  onPressCard?: (card: CardType) => void;
  isBot?: boolean;
  style?: StyleProp<ViewStyle>;
}

export type CardHandle = {
  onLayout: (event: LayoutChangeEvent) => void;
};

export const cardAspectRatio = 100 / 160;
export function Card({
  suit,
  rank,
  faceUp,
  onPressCard,
  isBot,
  disabled,
  style,
}: CardProps): ReactElement {
  const { layout, onLayout } = useLayout();
  const mode = useColorScheme() ?? "light";
  const { colors } = useColors();
  const { symbol, color } = suits[suit];
  const cardColor =
    typeof color === "string" ? colors[color] : colors[color[mode]];

  return (
    <AnimatedPressable
      onLayout={onLayout}
      disabled={disabled}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPress={() => {
        onPressCard?.({ suit, rank, faceUp });
      }}
      style={[
        {
          aspectRatio: cardAspectRatio,
          flex: 1,
          backgroundColor: colors.white,
          borderRadius: layout?.width * 0.2,
          borderWidth: 4,
          borderColor: colors.white,
        },
        {
          shadowColor: colors.black,
          shadowOffset: {
            width: -2,
            height: 1,
          },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 1,
        },
        style,
      ]}
    >
      {faceUp ? (
        <VStack
          flex
          justify="space-between"
          align="flex-start"
          style={{
            paddingLeft: 0.2 * layout?.width,
            paddingVertical: 0.2 * layout?.width,
          }}
        >
          <Text
            style={{
              fontSize: layout.width * 0.3, // Dynamic font size for rank
              fontWeight: "400",
              color: cardColor,
            }}
          >
            {rank}
          </Text>
          <Text
            style={{
              fontSize: layout.width * 0.3, // Dynamic font size for symbol
              color: cardColor,
            }}
          >
            {symbol}
          </Text>
        </VStack>
      ) : (
        <View
          style={{
            flex: 1,
            margin: layout.width * 0.05,
            backgroundColor: colors.gray100,
            borderRadius: layout.width * 0.2,
            overflow: "hidden",
          }}
        />
      )}
    </AnimatedPressable>
  );
}
