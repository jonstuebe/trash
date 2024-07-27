import { Children, cloneElement, isValidElement } from "react";
import { HStack, VStack, VStackProps } from "./Stack";
import { ViewStyle } from "react-native";

export interface CardVStackProps extends VStackProps {
  numCardsToShow?: number;
}

export function CardVStack({
  children,
  numCardsToShow = 3,
  style,
  ...props
}: CardVStackProps) {
  const childrenArray = Children.toArray(children);
  const visibleChildren = childrenArray.slice(-numCardsToShow);

  return (
    <VStack
      {...props}
      style={[
        {
          position: "relative",
        },
        style,
      ]}
    >
      {Children.map(visibleChildren, (child, idx) => {
        if (!child || !isValidElement(child)) return null;

        return cloneElement<any>(child, {
          key: idx,
          style: {
            ...child.props.style,
            shadowOpacity: idx === 0 ? 0 : 0.2,
            shadowRadius: idx === 0 ? 0 : 2,
            shadowOffset: {
              height: 4,
            },
            position: "absolute",
            top: idx === 0 ? 0 : -1 * (idx * 4),
          } satisfies ViewStyle,
        });
      })}
    </VStack>
  );
}

export function CardHStack({
  children,
  wrap,
}: {
  children: JSX.Element[];
  wrap?: boolean;
}) {
  return (
    <HStack wrap={wrap}>
      {children.map((child, idx) => {
        return cloneElement(child, {
          key: idx,
          style: {
            marginLeft: idx === 0 ? 0 : "-5%",
          },
        });
      })}
    </HStack>
  );
}
