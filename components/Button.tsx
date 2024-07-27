import { PressableProps, Pressable } from "react-native";
import { useColors } from "../colors";
import { ThemedText } from "./ThemedText";

export interface ButtonProps extends Omit<PressableProps, "children"> {
  title: string;
  size?: "small" | "large";
}

export function Button({
  title,
  disabled = false,
  size = "small",
  style,
  ...props
}: ButtonProps) {
  const { colorByMode } = useColors();

  return (
    <Pressable
      disabled={disabled}
      style={(state) => [
        {
          borderWidth: 2,
          borderColor: disabled
            ? colorByMode("gray200", "gray700")
            : colorByMode("blue700", "blue800"),

          borderRadius: 12,
        },
        size === "small"
          ? {
              paddingHorizontal: 12,
              paddingVertical: 8,
            }
          : {
              paddingHorizontal: 20,
              paddingVertical: 12,
            },
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      {({ pressed }) => (
        <ThemedText
          style={[
            {
              textAlign: "center",
              color: disabled
                ? colorByMode("gray400", "gray600")
                : colorByMode("blue700", "blue600"),
            },
            size === "small"
              ? {
                  fontSize: 14,
                  lineHeight: 16,
                }
              : {
                  fontSize: 18,
                  lineHeight: 20,
                },
          ]}
        >
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}
