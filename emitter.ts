import mitt from "mitt";

export const emitter = mitt<{
  gameOver: void;
  invalidMove: void;
}>();
