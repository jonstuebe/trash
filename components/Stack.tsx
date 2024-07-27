import { Children, Fragment, ReactNode, isValidElement, useMemo } from "react";
import { View, ViewProps, ViewStyle } from "react-native";

export interface StackProps extends ViewProps {
  gap?: number;
  align?: ViewStyle["alignItems"];
  justify?: ViewStyle["justifyContent"];
  wrap?: boolean;
  direction: ViewStyle["flexDirection"];
  flex?: boolean;
  flexChildren?: boolean;
  padding?: number;

  children: ReactNode;
}

export function Stack({
  gap = 0,
  align = "stretch",
  justify = "flex-start",
  wrap = false,
  direction,
  flex = false,
  flexChildren = false,
  children,
  padding = 0,
  style,
  ...props
}: StackProps) {
  const flattenedChildren = useMemo(() => {
    return Children.toArray(children)
      .filter(isValidElement)
      .reduce((acc: any[], child: any) => {
        if (child.type === Symbol.for("react.fragment")) {
          if (Array.isArray(child.props.children)) {
            return [...acc, ...child.props.children];
          } else {
            return [...acc, child.props.children];
          }
        }

        return [...acc, child];
      }, []);
  }, [children]);

  return (
    <View
      {...props}
      style={[
        {
          gap,
          alignItems: align,
          justifyContent: justify,
          flexDirection: direction,
          flexWrap: wrap ? "wrap" : "nowrap",
          flex: flex ? 1 : undefined,
          padding,
        },
        style,
      ]}
    >
      {flattenedChildren.map((child, idx) => {
        if (flexChildren) {
          return (
            <View key={idx} style={{ flex: 1 }}>
              {child}
            </View>
          );
        }

        return <Fragment key={idx}>{child}</Fragment>;
      })}
    </View>
  );
}

export interface VStackProps extends Omit<StackProps, "direction"> {}

export function VStack(props: VStackProps) {
  return <Stack direction="column" {...props} />;
}

export interface HStackProps extends Omit<StackProps, "direction"> {}

export function HStack(props: HStackProps) {
  return <Stack direction="row" {...props} />;
}
