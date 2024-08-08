import { useEffect, useRef } from "react";

/**
 * returns the previous value of a state tracked variable
 * @param value the value to track
 * @returns the previous value of the variable
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}
