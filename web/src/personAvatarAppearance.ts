import type { Gender } from "./types";

const APPEARANCE: Record<Gender, { fill: string; stroke: string }> = {
  female: { fill: "#f4e4e8", stroke: "#985c6d" },
  male: { fill: "#e2ebf2", stroke: "#56738d" },
  unspecified: { fill: "#ede5d8", stroke: "#796f63" }
};

export const personAvatarAppearance = (gender: Gender) => APPEARANCE[gender];
