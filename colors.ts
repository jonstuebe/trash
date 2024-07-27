import { useColorScheme } from "react-native";

const white = "#FFFFFF";
const gray050 = "#FBFCFD";
const gray075 = "#F5F7FA";
const gray100 = "#EBEEF4";
const gray200 = "#CAD0DA";
const gray300 = "#BEC2CD";
const gray400 = "#9A9EAA";
const gray500 = "#757A87";
const gray600 = "#6A6E79";
const gray700 = "#3E4650";
const gray800 = "#2D3238";
const gray900 = "#1A1F27";
const gray925 = "#15191F";
const gray950 = "#11151A";
const black = "#000000";
const green100 = "#E3F0E1";
const green200 = "#D1E7CE";
const green300 = "#C0DDBB";
const green400 = "#A7D0A1";
const green500 = "#95C78E";
const green600 = "#7FBB76";
const green700 = "#6DB263";
const green800 = "#5DA653";
const green900 = "#539349";
const yellow100 = "#FFFBDE";
const yellow200 = "#FEF7B7";
const yellow300 = "#FEF49B";
const yellow400 = "#FDF079";
const yellow500 = "#FDED5D";
const yellow600 = "#FCE941";
const yellow700 = "#DFCC21";
const yellow800 = "#9D8E00";
const yellow900 = "#7C7000";
const lightBlue100 = "#DEF0FC";
const lightBlue200 = "#C4E4FA";
const lightBlue300 = "#A3D5F7";
const lightBlue400 = "#83C6F4";
const lightBlue500 = "#69BAF1";
const lightBlue600 = "#4FAEEF";
const lightBlue700 = "#2698E4";
const lightBlue800 = "#1479BC";
const lightBlue900 = "#005A97";
const blue100 = "#E2EEFC";
const blue200 = "#C8DFFA";
const blue300 = "#A8CDF6";
const blue400 = "#88BBF3";
const blue500 = "#6EACF1";
const blue600 = "#549DEE";
const blue700 = "#3A8FEB";
const blue800 = "#1772D6";
const blue900 = "#0154AF";
const success100 = "#E8FCE8";
const success200 = "#B0EEB0";
const success300 = "#6CCC6D";
const success400 = "#34AD48";
const success500 = "#0A8930";
const success600 = "#097228";
const success700 = "#056121";
const success800 = "#034516";
const success900 = "#013202";
const error100 = "#FCE8E9";
const error200 = "#FFB3B5";
const error300 = "#FF6669";
const error400 = "#FB505B";
const error500 = "#E3273F";
const error600 = "#C51B31";
const error700 = "#9D0C1F";
const error800 = "#710513";
const error900 = "#4E030D";
const warning100 = "#FCF4E8";
const warning200 = "#FAE5C6";
const warning300 = "#FFBE66";
const warning400 = "#FFAA38";
const warning500 = "#FF9200";
const warning600 = "#E57906";
const warning700 = "#CA6902";
const warning800 = "#994F00";
const warning900 = "#663500";
const info100 = "#D9EBFC";
const info200 = "#A0CCF8";
const info300 = "#61AAF2";
const info400 = "#1D8BE2";
const info500 = "#0378D4";
const info600 = "#0566B3";
const info700 = "#034F8C";
const info800 = "#003966";
const info900 = "#00223D";

export const colors = (mode: "light" | "dark") => {
  const colorByMode = (light: string, dark: string) => {
    return mode === "light" ? light : dark;
  };

  return {
    globals: {
      white,
      gray050,
      gray075,
      gray100,
      gray200,
      gray300,
      gray400,
      gray500,
      gray600,
      gray700,
      gray800,
      gray900,
      gray925,
      gray950,
      black,
      green100,
      green200,
      green300,
      green400,
      green500,
      green600,
      green700,
      green800,
      green900,
      yellow100,
      yellow200,
      yellow300,
      yellow400,
      yellow500,
      yellow600,
      yellow700,
      yellow800,
      yellow900,
      lightBlue100,
      lightBlue200,
      lightBlue300,
      lightBlue400,
      lightBlue500,
      lightBlue600,
      lightBlue700,
      lightBlue800,
      lightBlue900,
      blue100,
      blue200,
      blue300,
      blue400,
      blue500,
      blue600,
      blue700,
      blue800,
      blue900,
      success100,
      success200,
      success300,
      success400,
      success500,
      success600,
      success700,
      success800,
      success900,
      error100,
      error200,
      error300,
      error400,
      error500,
      error600,
      error700,
      error800,
      error900,
      warning100,
      warning200,
      warning300,
      warning400,
      warning500,
      warning600,
      warning700,
      warning800,
      warning900,
      info100,
      info200,
      info300,
      info400,
      info500,
      info600,
      info700,
      info800,
      info900,
    },
    aliases: {
      white,
      black,
      primary: colorByMode(gray900, gray100),
      success: colorByMode(success500, success300),
      error: colorByMode(error500, error300),
      warning: colorByMode(warning500, warning300),
      info: colorByMode(info500, info300),
      lightBlue: colorByMode(lightBlue900, lightBlue300),
      blue: colorByMode(blue900, blue300),
      darkBlue: colorByMode(blue700, blue500),
      green: colorByMode(green900, green300),
      yellow: colorByMode(yellow900, yellow300),
    },
  };
};

export type Colors =
  | keyof ReturnType<typeof colors>["globals"]
  | keyof ReturnType<typeof colors>["aliases"];

export const useColors = () => {
  const mode = useColorScheme() ?? "light";
  const _colors = colors(mode);
  const globals = _colors.globals;
  const aliases = _colors.aliases;
  const all = { ...globals, ...aliases };

  return {
    colors: all,
    colorByMode: (light: Colors, dark: Colors) => {
      return mode === "light" ? all[light] : all[dark];
    },
  };
};
