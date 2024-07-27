import React, { ReactElement } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  Text,
  View,
  ViewStyle,
  useColorScheme,
} from "react-native";
import { Line, Path, Svg } from "react-native-svg";
import { Colors, useColors } from "../colors";
import { useLayout } from "../hooks/useLayout";
import { Card as CardType, Rank, Suit } from "../types";
import { HStack, VStack } from "./Stack";

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

function Hexagons() {
  const { colors } = useColors();

  return (
    <Svg width={28} height={49} viewBox="0 0 28 49">
      <Path
        fillRule="nonzero"
        d="m13.99 9.25 13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z"
        fill={colors.gray300}
      />
    </Svg>
  );
}

export interface CardProps extends CardType {
  style?: StyleProp<ViewStyle>;
  onPressCard?: (card: CardType) => void;
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
  style,
}: CardProps): ReactElement {
  const { layout, onLayout } = useLayout();
  const mode = useColorScheme() ?? "light";
  const { colors } = useColors();
  const { symbol, color } = suits[suit];
  const cardColor =
    typeof color === "string" ? colors[color] : colors[color[mode]];

  return (
    <Pressable
      onLayout={onLayout}
      onPress={() => onPressCard?.({ suit, rank, faceUp })}
      style={[
        {
          aspectRatio: cardAspectRatio,
          flex: 1,
          backgroundColor: colors.white,
          borderRadius: layout?.width * 0.2,
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
            margin: layout.width * 0.1,
            backgroundColor: colors.gray100,
            borderRadius: layout.width * 0.2,
            overflow: "hidden",
          }}
        />
      )}
    </Pressable>
  );
}
