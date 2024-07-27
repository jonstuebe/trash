import { PressableProps, Pressable } from "react-native";
import { useColors } from "../colors";
import { ThemedText } from "./ThemedText";

export interface ButtonProps extends Omit<PressableProps, "children"> {
  title: string;
}

export function Button({
  title,
  disabled = false,
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
            ? colorByMode("gray100", "gray700")
            : colorByMode("gray100", "blue800"),
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 12,
        },
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      {({ pressed }) => (
        <ThemedText
          style={{
            textAlign: "center",
            fontSize: 14,
            lineHeight: 16,
            color: disabled
              ? colorByMode("gray300", "gray600")
              : colorByMode("gray100", "blue600"),
          }}
        >
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}
