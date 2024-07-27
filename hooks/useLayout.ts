import { useState, useCallback } from "react";
import { LayoutRectangle, LayoutChangeEvent } from "react-native";

export function useLayout() {
  const [layout, setLayout] = useState<LayoutRectangle>({
    width: 0,
    height: 0,
    x: 0,
    y: 0,
  });

  const onLayout = useCallback<(event: LayoutChangeEvent) => void>((event) => {
    setLayout(event.nativeEvent.layout);
  }, []);

  return { layout, onLayout };
}
