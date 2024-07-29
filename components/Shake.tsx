import React, {
  ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Animated, ViewProps } from "react-native";

interface ShakeProps extends ViewProps {
  children: ReactNode;
  intensity?: number;
  duration?: number;
  repeat?: number;
  rotationAngle?: number;
}

export type ShakeHandle = {
  shake: () => void;
};

export const useShake = () => {
  const ref = useRef<ShakeHandle>(null);

  const shake = useCallback(() => {
    ref.current?.shake();
  }, []);

  return { shakeProps: { ref }, shake };
};

export const Shake = forwardRef<ShakeHandle, ShakeProps>(function Shake(
  {
    children,
    intensity = 5,
    duration = 175,
    repeat = 2,
    rotationAngle = 3,
    style,
    ...rest
  },
  ref
) {
  const translateX = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useImperativeHandle(
    ref,
    () => ({
      shake: () => {
        const sequence = Animated.parallel([
          Animated.sequence([
            Animated.timing(translateX, {
              toValue: intensity,
              duration: duration / 4,
              useNativeDriver: true,
            }),
            Animated.timing(translateX, {
              toValue: -intensity,
              duration: duration / 2,
              useNativeDriver: true,
            }),
            Animated.timing(translateX, {
              toValue: 0,
              duration: duration / 4,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(rotate, {
              toValue: rotationAngle,
              duration: duration / 4,
              useNativeDriver: true,
            }),
            Animated.timing(rotate, {
              toValue: -rotationAngle,
              duration: duration / 2,
              useNativeDriver: true,
            }),
            Animated.timing(rotate, {
              toValue: 0,
              duration: duration / 4,
              useNativeDriver: true,
            }),
          ]),
        ]);

        Animated.loop(sequence, { iterations: repeat }).start();
      },
    }),
    [intensity, duration, repeat, rotationAngle]
  );

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-rotationAngle, rotationAngle],
    outputRange: [`-${rotationAngle}deg`, `${rotationAngle}deg`],
  });

  return (
    <Animated.View
      style={[
        {
          transform: [{ translateX }, { rotate: rotateInterpolate }],
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
});

Shake.displayName = "Shake";
